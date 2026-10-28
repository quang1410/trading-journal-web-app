package yahoofeed

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const t0 = 1792360800 // 2026-10-18 22:00 UTC

// fakeYahoo trả lời mỗi request bằng `reply(period1, period2)` và ghi lại các request đã nhận.
type fakeYahoo struct {
	mu    sync.Mutex
	reply func(p1, p2 int64) (int, string)
	got   []*http.Request
}

func (f *fakeYahoo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.got = append(f.got, r)
	f.mu.Unlock()
	p1, _ := strconv.ParseInt(r.URL.Query().Get("period1"), 10, 64)
	p2, _ := strconv.ParseInt(r.URL.Query().Get("period2"), 10, 64)
	status, body := f.reply(p1, p2)
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

// chart dựng một body như Yahoo: mỗi nến là [giờ, giá] với giá "null" cho phút CME nghỉ.
func chart(bars ...[2]string) string {
	var ts, px []string
	for _, b := range bars {
		ts = append(ts, b[0])
		px = append(px, b[1])
	}
	p := "[" + strings.Join(px, ",") + "]"
	return fmt.Sprintf(`{"chart":{"result":[{"meta":{"symbol":"NQ=F"},"timestamp":[%s],"indicators":{"quote":[{"open":%s,"high":%s,"low":%s,"close":%s,"volume":%s}]}}],"error":null}}`,
		strings.Join(ts, ","), p, p, p, p, p)
}

func at(t int64, price string) [2]string { return [2]string{strconv.FormatInt(t, 10), price} }

func newClient(f *fakeYahoo, now int64) Client {
	srv := httptest.NewServer(f)
	return Client{URL: srv.URL + "/", HTTP: srv.Client(), Now: func() time.Time { return time.Unix(now, 0) }}
}

func TestFetchSplitsLongRangesIntoChunksYahooAccepts(t *testing.T) {
	now := int64(t0 + 20*86400)
	f := &fakeYahoo{reply: func(p1, _ int64) (int, string) { return 200, chart(at(p1, "29000.25")) }}
	bars, err := newClient(f, now).Fetch(context.Background(), "NQ=F", t0)
	require.NoError(t, err)

	require.Len(t, f.got, 3)
	for i, r := range f.got {
		p1, _ := strconv.ParseInt(r.URL.Query().Get("period1"), 10, 64)
		p2, _ := strconv.ParseInt(r.URL.Query().Get("period2"), 10, 64)
		require.Equal(t, int64(t0+i*MaxChunk), p1)
		require.LessOrEqual(t, p2-p1, int64(MaxChunk), "no request asks for more than Yahoo allows")
		require.Equal(t, "1m", r.URL.Query().Get("interval"))
		require.Equal(t, "/NQ=F", r.URL.Path)
		require.Equal(t, "Mozilla/5.0", r.Header.Get("User-Agent"))
	}
	require.Equal(t, []int64{t0, t0 + MaxChunk, t0 + 2*MaxChunk}, bars.T)
	require.Equal(t, json.Number("29000.25"), bars.O[0], "prices keep the exact text Yahoo sent")
}

func TestFetchClampsFromToHowFarBackYahooGoes(t *testing.T) {
	now := int64(t0 + 60*86400)
	f := &fakeYahoo{reply: func(int64, int64) (int, string) { return 200, chart() }}
	_, err := newClient(f, now).Fetch(context.Background(), "NQ=F", 0)
	require.NoError(t, err)
	require.Equal(t, strconv.FormatInt(now-MaxBack, 10), f.got[0].URL.Query().Get("period1"))
	require.Len(t, f.got, 5) // 29 ngày / 7 ngày mỗi đoạn
}

func TestFetchDropsNullMinutesAndTheOpenMinute(t *testing.T) {
	now := int64(t0 + 3*60 + 30) // đang giữa phút t0+180
	f := &fakeYahoo{reply: func(int64, int64) (int, string) {
		return 200, chart(
			at(t0, "29000.25"),
			at(t0+60, "null"), // CME nghỉ
			at(t0+120, "29001.5"),
			at(t0+180, "29002"),    // phút đang chạy
			at(t0+181, "29002.75"), // nến cuối phiên đang mở mang giờ lẻ
		)
	}}
	bars, err := newClient(f, now).Fetch(context.Background(), "NQ=F", t0)
	require.NoError(t, err)
	require.Equal(t, []int64{t0, t0 + 120}, bars.T)
	require.Equal(t, []json.Number{"29000.25", "29001.5"}, bars.C)
	require.NoError(t, bars.Validate())
}

func TestFetchErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"range too old", 422, `{"chart":{"result":null,"error":{"code":"Unprocessable Entity","description":"1m data not available"}}}`, "1m data not available"},
		{"rate limited, not JSON", 429, "Too Many Requests", "HTTP 429"},
		{"no result", 200, `{"chart":{"result":[],"error":null}}`, "no result"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeYahoo{reply: func(int64, int64) (int, string) { return tc.status, tc.body }}
			_, err := newClient(f, t0+86400).Fetch(context.Background(), "NQ=F", t0)
			require.ErrorContains(t, err, tc.want)
		})
	}
}

func TestFetchEmptyWeekendChunkIsNotAnError(t *testing.T) {
	f := &fakeYahoo{reply: func(int64, int64) (int, string) {
		return 200, `{"chart":{"result":[{"meta":{"symbol":"NQ=F"},"indicators":{"quote":[{}]}}],"error":null}}`
	}}
	bars, err := newClient(f, t0+86400).Fetch(context.Background(), "NQ=F", t0)
	require.NoError(t, err)
	require.Zero(t, bars.Len())
}
