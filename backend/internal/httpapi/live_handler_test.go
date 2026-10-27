package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/domain"
	"journal/internal/httpapi"
	"journal/internal/service"
)

// Logic kéo / cache / lưu / dự phòng được test ở service (livebars_test.go). Ở đây chỉ kiểm phần
// HTTP: route nào được gắn, xác thực, mã lỗi, và hình dạng JSON.

const cronSecret = "s3cret-s3cret-16"

type liveEnv struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Symbol string        `json:"symbol"`
		Ticker string        `json:"ticker"`
		T      []int64       `json:"t"`
		O      []json.Number `json:"o"`
		C      []json.Number `json:"c"`
		More   bool          `json:"more"`
		Stale  bool          `json:"stale"`
	} `json:"data"`
}

func oneBar(ts int64) domain.MinuteBars {
	var b domain.MinuteBars
	b.Append(ts, "29227.25", "29361.25", "29226", "29349.75", "1299")
	return b
}

// memBars là ReplayBarStore trong bộ nhớ, đủ cho test HTTP; hành vi đầy đủ được ghim ở contract
// test của service.
type memBars struct {
	mu      sync.Mutex // cron ghi NQ và ES song song
	bars    map[string]domain.MinuteBars
	saveErr error
}

func (m *memBars) Upsert(_ context.Context, symbol string, b domain.MinuteBars) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.saveErr != nil {
		return m.saveErr
	}
	m.bars[symbol] = b
	return nil
}

func (m *memBars) After(_ context.Context, symbol string, after int64, _ int) (domain.MinuteBars, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.bars[symbol].After(after), false, nil
}

type liveServer struct {
	*httptest.Server
	token string
}

func newLiveServer(t *testing.T, fetch service.LiveFetcher, store service.ReplayBarStore, secret string) liveServer {
	t.Helper()
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		LiveBars:   service.NewLiveBarService(fetch, store, time.Now),
		Signer:     signer,
		CronSecret: secret,
	}))
	t.Cleanup(srv.Close)
	return liveServer{srv, token}
}

func (s liveServer) get(t *testing.T, path, authz string) (int, liveEnv) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, s.URL+path, nil)
	require.NoError(t, err)
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	// data là object với route nến, là mảng với route cron: đọc thô rồi chỉ giải object
	var raw struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&raw))
	env := liveEnv{Code: raw.Code, Msg: raw.Msg}
	if len(raw.Data) > 0 && raw.Data[0] == '{' {
		require.NoError(t, json.Unmarshal(raw.Data, &env.Data))
	}
	return resp.StatusCode, env
}

// Endpoint cần đăng nhập, chỉ nhận NQ / ES (không phân biệt hoa thường), và trả cột nến với giá giữ
// nguyên chuỗi số.
func TestLiveBarsRoute(t *testing.T) {
	s := newLiveServer(t, func(context.Context, string) (domain.MinuteBars, error) { return oneBar(1792360800), nil }, nil, "")
	bearer := "Bearer " + s.token

	for _, tc := range []struct {
		name   string
		path   string
		authz  string
		status int
		code   int
	}{
		{"needs login", "/api/replay/live/NQ", "", http.StatusUnauthorized, 1401},
		{"unknown symbol", "/api/replay/live/AAPL", bearer, http.StatusNotFound, 1404},
		{"bad last", "/api/replay/live/NQ?last=abc", bearer, http.StatusBadRequest, 1400},
		{"lower case symbol", "/api/replay/live/nq", bearer, http.StatusOK, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, env := s.get(t, tc.path, tc.authz)
			require.Equal(t, tc.status, status)
			require.Equal(t, tc.code, env.Code)
		})
	}

	_, env := s.get(t, "/api/replay/live/NQ", bearer)
	require.Equal(t, "NQ", env.Data.Symbol)
	require.Equal(t, "CME_MINI:NQ1!", env.Data.Ticker)
	require.Equal(t, []int64{1792360800}, env.Data.T)
	require.Equal(t, []json.Number{"29227.25"}, env.Data.O)
	require.Equal(t, []json.Number{"29349.75"}, env.Data.C)

	_, env = s.get(t, "/api/replay/live/NQ?last=9999999999", bearer)
	require.NotNil(t, env.Data.T, "nothing new is an empty list, not null")
	require.Empty(t, env.Data.T)
}

// TradingView hỏng mà DB có nến: 200 với stale = true. DB không có gì: 502 với thông điệp hiển thị
// được.
func TestLiveBarsStaleAndUpstreamFailure(t *testing.T) {
	store := &memBars{bars: map[string]domain.MinuteBars{"NQ": oneBar(1792360800)}}
	s := newLiveServer(t, func(context.Context, string) (domain.MinuteBars, error) {
		return domain.MinuteBars{}, errors.New("dial tradingview: 403")
	}, store, "")

	status, env := s.get(t, "/api/replay/live/NQ", "Bearer "+s.token)
	require.Equal(t, http.StatusOK, status)
	require.True(t, env.Data.Stale)
	require.Equal(t, []int64{1792360800}, env.Data.T)

	status, env = s.get(t, "/api/replay/live/ES", "Bearer "+s.token)
	require.Equal(t, http.StatusBadGateway, status)
	require.Equal(t, 1502, env.Code)
	require.Equal(t, "không kéo được data từ TradingView", env.Msg)
}

// Route đọc trang kế và route cron chỉ có khi có DB; cron chỉ có khi có CRON_SECRET.
func TestLiveRoutesNeedTheirDependencies(t *testing.T) {
	fetch := func(context.Context, string) (domain.MinuteBars, error) { return oneBar(60), nil }
	store := &memBars{bars: map[string]domain.MinuteBars{}}
	for _, tc := range []struct {
		name          string
		store         service.ReplayBarStore
		secret        string
		storedRoute   bool
		cronRouteSeen bool
	}{
		{"no store, no secret", nil, "", false, false},
		{"no store, secret", nil, cronSecret, false, false},
		{"store, no secret", store, "", true, false},
		{"store and secret", store, cronSecret, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := newLiveServer(t, fetch, tc.store, tc.secret)
			status, _ := s.get(t, "/api/replay/bars/NQ", "Bearer "+s.token)
			require.Equal(t, tc.storedRoute, status == http.StatusOK, "stored route status %d", status)
			status, _ = s.get(t, "/api/cron/replay-bars", "Bearer "+cronSecret)
			require.Equal(t, tc.cronRouteSeen, status != http.StatusNotFound, "cron route status %d", status)
		})
	}

	// không có LiveBars thì không gắn gì cả
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Signer: auth.NewSigner("khoa-test", time.Minute)}))
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/api/replay/live/NQ")
	require.NoError(t, err)
	_ = resp.Body.Close()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// Trang kế đọc DB nên không dính rate limit 10/phút của route kéo TradingView.
func TestStoredRouteHasItsOwnRateLimit(t *testing.T) {
	store := &memBars{bars: map[string]domain.MinuteBars{"NQ": oneBar(120)}}
	s := newLiveServer(t, func(context.Context, string) (domain.MinuteBars, error) { return oneBar(120), nil }, store, "")
	for i := 0; i < 10; i++ {
		status, _ := s.get(t, "/api/replay/live/NQ", "Bearer "+s.token)
		require.Equal(t, http.StatusOK, status)
	}
	status, _ := s.get(t, "/api/replay/live/NQ", "Bearer "+s.token)
	require.Equal(t, http.StatusTooManyRequests, status, "the fetching route is limited")
	for i := 0; i < 20; i++ {
		status, env := s.get(t, "/api/replay/bars/NQ?after=60", "Bearer "+s.token)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, []int64{120}, env.Data.T)
	}
	status, _ = s.get(t, "/api/replay/bars/NQ?after=x", "Bearer "+s.token)
	require.Equal(t, http.StatusBadRequest, status)
}

// Cron cần đúng CRON_SECRET; lưu cả hai mã thì 200, một mã hỏng thì 502 nêu tên mã đó.
func TestCronRoute(t *testing.T) {
	for _, tc := range []struct {
		name    string
		authz   string
		saveErr error
		status  int
		msg     string
	}{
		{"no header", "", nil, http.StatusUnauthorized, "sai cron secret"},
		{"wrong secret", "Bearer wrong", nil, http.StatusUnauthorized, "sai cron secret"},
		{"secret without Bearer", cronSecret, nil, http.StatusUnauthorized, "sai cron secret"},
		{"saves both symbols", "Bearer " + cronSecret, nil, http.StatusOK, "ok"},
		{"db down", "Bearer " + cronSecret, errors.New("db down"), http.StatusBadGateway, "không lưu được nến của ES, NQ"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &memBars{bars: map[string]domain.MinuteBars{}, saveErr: tc.saveErr}
			s := newLiveServer(t, func(context.Context, string) (domain.MinuteBars, error) { return oneBar(60), nil }, store, cronSecret)
			status, env := s.get(t, "/api/cron/replay-bars", tc.authz)
			require.Equal(t, tc.status, status)
			require.Equal(t, tc.msg, env.Msg)
			if tc.status == http.StatusOK {
				require.Len(t, store.bars, 2)
			} else {
				require.Empty(t, store.bars)
			}
		})
	}
}
