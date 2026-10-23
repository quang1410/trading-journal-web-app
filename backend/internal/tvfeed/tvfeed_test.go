package tvfeed

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"
)

const t0 = 1792360800 // 2026-10-18 22:00 UTC

func batch(ks ...int) string {
	parts := make([]string, len(ks))
	for i, k := range ks {
		// giờ dạng "1792360800.0" và giá có phần lẻ .25 như TradingView gửi thật
		parts[i] = fmt.Sprintf(`{"i":%d,"v":[%d.0,%d.25,%d.5,%d.0,%d.75,%d.0]}`, k, t0+60*k, 29000+k, 29001+k, 28999+k, 29000+k, 10*k)
	}
	return frame(`{"m":"timescale_update","p":["cs",{"s":{"node":"x","s":[` + strings.Join(parts, ",") + `]}}]}`)
}

var completed = frame(`{"m":"series_completed","p":["cs","s"]}`)

// fakeTV là TradingView giả: kiểm Origin, trả lời theo kịch bản `reply` cho từng lệnh nhận được.
type fakeTV struct {
	reply   func(m string) []string
	origins []string
	got     []string
}

func (f *fakeTV) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.origins = append(f.origins, r.Header.Get("Origin"))
	if r.Header.Get("Origin") != origin {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer c.CloseNow()
	ctx := r.Context()
	_ = c.Write(ctx, websocket.MessageText, []byte(frame(`{"session_id":"x"}`)+frame("~h~1")))
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		body := frameSep.ReplaceAllString(string(data), "")
		f.got = append(f.got, body)
		var msg message
		if json.Unmarshal([]byte(body), &msg) != nil {
			continue
		}
		for _, out := range f.reply(msg.M) {
			if c.Write(ctx, websocket.MessageText, []byte(out)) != nil {
				return
			}
		}
	}
}

func client(t *testing.T, tv *fakeTV, now time.Time) (Client, context.Context) {
	srv := httptest.NewServer(tv)
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return Client{URL: "ws" + strings.TrimPrefix(srv.URL, "http"), Now: func() time.Time { return now }}, ctx
}

func TestFetchPagesBackSortsAndDropsTheOpenMinute(t *testing.T) {
	more := 0
	tv := &fakeTV{reply: func(m string) []string {
		switch m {
		case "create_series":
			return []string{batch(5, 6, 7, 8, 9) + completed}
		case "request_more_data":
			more++
			if more == 1 {
				return []string{batch(0, 1, 2, 3, 4), completed}
			}
			return []string{completed}
		}
		return nil
	}}
	// giữa phút 9: nến 9 chưa đóng
	c, ctx := client(t, tv, time.Unix(t0+9*60+30, 0))
	bars, err := c.Fetch(ctx, "CME_MINI:NQ1!")
	require.NoError(t, err)

	require.Len(t, bars.T, 9)
	for k, ts := range bars.T {
		require.Equal(t, int64(t0+60*k), ts)
	}
	require.Equal(t, []json.Number{"29003.25", "29004.5", "29002.0", "29003.75", "30.0"},
		[]json.Number{bars.O[3], bars.H[3], bars.L[3], bars.C[3], bars.V[3]})
	require.Equal(t, 2, more)
	require.Equal(t, []string{origin}, tv.origins)
	require.Contains(t, tv.got, "~h~1", "heartbeat echoed back")
	require.Contains(t, strings.Join(tv.got, "\n"), `CME_MINI:NQ1!`)
}

func TestFetchFailsOnAProtocolError(t *testing.T) {
	tv := &fakeTV{reply: func(m string) []string {
		if m == "create_series" {
			return []string{frame(`{"m":"symbol_error","p":["cs","sym","invalid symbol"]}`)}
		}
		return nil
	}}
	c, ctx := client(t, tv, time.Unix(t0, 0))
	_, err := c.Fetch(ctx, "CME_MINI:XX1!")
	require.ErrorContains(t, err, "symbol_error")
}

func TestFetchGivesUpAtTheDeadline(t *testing.T) {
	tv := &fakeTV{reply: func(string) []string { return nil }} // không bao giờ trả nến
	c, _ := client(t, tv, time.Unix(t0, 0))
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, err := c.Fetch(ctx, "CME_MINI:NQ1!")
	require.Error(t, err)
}

func TestFetchKeepsBarsWhenAnErrorArrivesWhilePagingBack(t *testing.T) {
	tv := &fakeTV{reply: func(m string) []string {
		switch m {
		case "create_series":
			return []string{batch(5, 6, 7) + completed}
		case "request_more_data":
			return []string{frame(`{"m":"series_error","p":["cs","s","s1","rate limited"]}`)}
		}
		return nil
	}}
	c, ctx := client(t, tv, time.Unix(t0+3600, 0))
	bars, err := c.Fetch(ctx, "CME_MINI:NQ1!")
	require.NoError(t, err)
	require.Equal(t, []int64{t0 + 300, t0 + 360, t0 + 420}, bars.T)
}

func TestUnixSecondsReadsPlainDecimalAndExponentForms(t *testing.T) {
	for in, want := range map[string]int64{"1792766460": 1792766460, "1792766460.0": 1792766460, "1.79276646e9": 1792766460} {
		got, err := unixSeconds(json.Number(in))
		require.NoError(t, err, in)
		require.Equal(t, want, got, in)
	}
	_, err := unixSeconds(json.Number("abc"))
	require.Error(t, err)
}
