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

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/tvfeed"
)

type liveEnv struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Symbol string        `json:"symbol"`
		Ticker string        `json:"ticker"`
		T      []int64       `json:"t"`
		O      []json.Number `json:"o"`
		C      []json.Number `json:"c"`
	} `json:"data"`
}

func oneBar(ts int64) tvfeed.Bars {
	return tvfeed.Bars{T: []int64{ts}, O: []json.Number{"29227.25"}, H: []json.Number{"29361.25"}, L: []json.Number{"29226"}, C: []json.Number{"29349.75"}, V: []json.Number{"1299"}}
}

func getLive(t *testing.T, url, token string) (int, liveEnv) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	var env liveEnv
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp.StatusCode, env
}

// Endpoint cần đăng nhập, chỉ nhận NQ / ES, trả cột nến với giá giữ nguyên chuỗi số, và trong một
// phút thì lần gọi sau lấy bản đã kéo.
func TestLiveBarsRoute(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	var asked []string
	fetch := func(_ context.Context, ticker string) (tvfeed.Bars, error) {
		asked = append(asked, ticker)
		return oneBar(1792360800), nil
	}
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Live: fetch, Signer: signer}))
	defer srv.Close()

	status, _ := getLive(t, srv.URL+"/api/replay/live/NQ", "")
	require.Equal(t, http.StatusUnauthorized, status)

	status, env := getLive(t, srv.URL+"/api/replay/live/AAPL", token)
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, 1404, env.Code)

	status, env = getLive(t, srv.URL+"/api/replay/live/nq", token)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "NQ", env.Data.Symbol)
	require.Equal(t, "CME_MINI:NQ1!", env.Data.Ticker)
	require.Equal(t, []int64{1792360800}, env.Data.T)
	require.Equal(t, []json.Number{"29227.25"}, env.Data.O)
	require.Equal(t, []json.Number{"29349.75"}, env.Data.C)

	_, _ = getLive(t, srv.URL+"/api/replay/live/NQ", token)
	_, env = getLive(t, srv.URL+"/api/replay/live/ES", token)
	require.Equal(t, "CME_MINI:ES1!", env.Data.Ticker)
	require.Equal(t, []string{"CME_MINI:NQ1!", "CME_MINI:ES1!"}, asked, "second NQ call served from the cache")
}

// Không có Live trong Deps thì không gắn route (như mọi nhánh khác của Deps).
func TestLiveBarsRouteNeedsAFetcher(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Signer: signer}))
	defer srv.Close()
	status, _ := getLive(t, srv.URL+"/api/replay/live/NQ", token)
	require.Equal(t, http.StatusNotFound, status)
}

// Cache hết hạn sau một phút. Lỗi từ TradingView (kể cả trả về rỗng) thành 502 có thông điệp hiển
// thị được, và được nhớ 15 giây để bấm lại không tốn thêm một lần kết nối hỏng.
func TestLiveBarsCacheExpiryAndUpstreamErrors(t *testing.T) {
	now := time.Unix(1792360800, 0)
	calls := 0
	mode := "ok"
	h := httpapi.NewLiveHandler(func(context.Context, string) (tvfeed.Bars, error) {
		calls++
		switch mode {
		case "fail":
			return tvfeed.Bars{}, errors.New("dial tradingview: 403")
		case "empty":
			return tvfeed.Bars{}, nil
		}
		return oneBar(int64(1792360800 + calls*60)), nil
	}, func() time.Time { return now })
	r := chi.NewRouter()
	r.Get("/{symbol}", h.Bars)
	call := func() (int, liveEnv) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/NQ", nil))
		var env liveEnv
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&env))
		return rec.Code, env
	}

	_, first := call()
	now = now.Add(59 * time.Second)
	_, cached := call()
	require.Equal(t, first.Data.T, cached.Data.T)
	require.Equal(t, 1, calls)

	now = now.Add(2 * time.Second)
	_, fresh := call()
	require.Equal(t, 2, calls)
	require.NotEqual(t, first.Data.T, fresh.Data.T)

	mode = "fail"
	now = now.Add(time.Minute)
	status, env := call()
	require.Equal(t, http.StatusBadGateway, status)
	require.Equal(t, 1502, env.Code)
	require.Equal(t, "không kéo được data từ TradingView", env.Msg)
	now = now.Add(14 * time.Second)
	status, _ = call()
	require.Equal(t, http.StatusBadGateway, status)
	require.Equal(t, 3, calls, "a failure is remembered for 15 seconds")

	mode = "empty"
	now = now.Add(2 * time.Second)
	status, _ = call()
	require.Equal(t, http.StatusBadGateway, status, "no bars is an error, not an empty success")
	require.Equal(t, 4, calls)

	mode = "ok"
	now = now.Add(16 * time.Second)
	status, _ = call()
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, 5, calls)
}

// Một mã đang kéo chậm không bắt mã kia chờ; nhiều request cùng một mã chung một lần kéo; người gọi
// bỏ đi giữa chừng thì lần kéo vẫn xong và vào cache.
func TestLiveBarsSymbolsDoNotBlockEachOther(t *testing.T) {
	release := make(chan struct{})
	var mu sync.Mutex
	calls := map[string]int{}
	h := httpapi.NewLiveHandler(func(_ context.Context, ticker string) (tvfeed.Bars, error) {
		mu.Lock()
		calls[ticker]++
		mu.Unlock()
		if ticker == "CME_MINI:NQ1!" {
			<-release
		}
		return oneBar(1792360800), nil
	}, time.Now)
	r := chi.NewRouter()
	r.Get("/{symbol}", h.Bars)
	serve := func(ctx context.Context, sym string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/"+sym, nil).WithContext(ctx))
		return rec
	}

	// người gọi NQ đầu tiên bỏ đi; hai người khác đang chờ cùng lần kéo đó
	gone, cancel := context.WithCancel(context.Background())
	done := make(chan *httptest.ResponseRecorder, 3)
	go func() { done <- serve(gone, "NQ") }()
	for i := 0; i < 2; i++ {
		go func() { done <- serve(context.Background(), "NQ") }()
	}
	require.Eventually(t, func() bool { mu.Lock(); defer mu.Unlock(); return calls["CME_MINI:NQ1!"] == 1 }, time.Second, 5*time.Millisecond)
	cancel()

	// ES trả ngay dù NQ còn đang kéo
	es := make(chan int, 1)
	go func() { es <- serve(context.Background(), "ES").Code }()
	select {
	case code := <-es:
		require.Equal(t, http.StatusOK, code)
	case <-time.After(2 * time.Second):
		t.Fatal("ES waited for the NQ fetch")
	}

	close(release)
	codes := []int{}
	for i := 0; i < 3; i++ {
		codes = append(codes, (<-done).Code)
	}
	// người đã bỏ đi không nhận gì (recorder mặc định 200, body rỗng); hai người còn lại nhận nến
	require.ElementsMatch(t, []int{200, 200, 200}, codes)
	require.Equal(t, 1, calls["CME_MINI:NQ1!"], "concurrent NQ requests share one fetch")
	require.Equal(t, http.StatusOK, serve(context.Background(), "NQ").Code)
	require.Equal(t, 1, calls["CME_MINI:NQ1!"], "the abandoned fetch still filled the cache")
}
