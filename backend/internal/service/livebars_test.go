package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
	"journal/internal/yahoofeed"
)

const (
	week = 7 * 86400
	// fri: nến cuối thứ Sáu 23/10/2026 (20:59 UTC); sun: nến đầu Chủ nhật 25/10 (22:00 UTC)
	fri = 1792789140
	sun = 1792965600
)

func barsFrom(t0 int64, n int) domain.MinuteBars { return minuteBars("1", spaced(t0, n)...) }

func spaced(t0 int64, n int) []int64 {
	ts := make([]int64, n)
	for i := range ts {
		ts[i] = t0 + int64(i)*60
	}
	return ts
}

// fixedFetch trả cùng một tuần nến cho mọi mã và đếm số lần kéo.
type fixedFetch struct {
	mu    sync.Mutex
	bars  domain.MinuteBars
	err   error
	calls int
}

func (f *fixedFetch) fetch(context.Context, string) (domain.MinuteBars, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.bars, f.err
}

func status(err error) int {
	if e := apperr.As(err); e != nil {
		return e.Status
	}
	return 0
}

// Có DB: tuần vừa kéo được lưu, và nút Cập nhật nhận mọi nến sau (last − một tuần) từ DB — kể cả
// những tuần cũ mà lần kéo này không còn trả (cron đã lưu từ trước).
func TestLatestServesStoredWeeksTheDeviceMissed(t *testing.T) {
	store := newMemReplayBarStore()
	require.NoError(t, store.Upsert(newCtx(), "NQ", barsFrom(fri-3*week, 3))) // ba tuần trước, cron đã lưu
	f := &fixedFetch{bars: barsFrom(sun, 3)}
	svc := service.NewLiveBarService(f.fetch, store, time.Now)

	page, err := svc.Latest(newCtx(), "NQ", fri-4*week) // máy dừng ở bốn tuần trước
	require.NoError(t, err)
	require.False(t, page.Stale)
	require.Equal(t, append(spaced(fri-3*week, 3), spaced(sun, 3)...), page.Bars.T)
	require.Equal(t, 6, store.count("NQ"), "the fresh week was saved")
	require.Equal(t, "CME_MINI:NQ1!", page.Ticker)

	page, err = svc.Latest(newCtx(), "NQ", sun+120)
	require.NoError(t, err)
	require.Equal(t, spaced(sun, 3), page.Bars.T, "the last week is sent again (overlap)")
}

// Trang đầu đầy thì More = true, và Stored đọc tiếp đúng phần còn lại mà không kéo TradingView.
func TestStoredPagesTheRestWithoutFetching(t *testing.T) {
	store := newMemReplayBarStore()
	require.NoError(t, store.Upsert(newCtx(), "NQ", barsFrom(60, service.LivePageSize+5)))
	f := &fixedFetch{bars: barsFrom(60+int64(service.LivePageSize+4)*60, 1)}
	svc := service.NewLiveBarService(f.fetch, store, time.Now)

	first, err := svc.Latest(newCtx(), "NQ", 0)
	require.NoError(t, err)
	require.True(t, first.More)
	require.Equal(t, service.LivePageSize, first.Bars.Len())

	rest, err := svc.Stored(newCtx(), "NQ", first.Bars.T[first.Bars.Len()-1], 0)
	require.NoError(t, err)
	require.False(t, rest.More)
	require.Equal(t, 5, rest.Bars.Len())
	require.Equal(t, 1, f.calls)
}

// Regression: TradingView hỏng (IP bị chặn) không được làm mất luôn những tuần cron đã lưu.
func TestLatestFallsBackToStoredBarsWhenTradingViewFails(t *testing.T) {
	store := newMemReplayBarStore()
	require.NoError(t, store.Upsert(newCtx(), "NQ", barsFrom(sun-week, 3)))
	f := &fixedFetch{err: errors.New("dial tradingview: 403")}
	svc := service.NewLiveBarService(f.fetch, store, time.Now)

	page, err := svc.Latest(newCtx(), "NQ", sun-2*week)
	require.NoError(t, err)
	require.True(t, page.Stale)
	require.Equal(t, spaced(sun-week, 3), page.Bars.T)

	// DB cũng không có gì mới cho máy này: lỗi như cũ
	_, err = svc.Latest(newCtx(), "ES", 0)
	require.Equal(t, 502, status(err))
}

// Regression: DB hỏng thì chỉ trả bản vừa kéo khi nó nối liền với nến cuối của máy. Trả một tuần
// cách quãng sẽ để lại lỗ hổng mà máy không bao giờ hỏi lại.
func TestLatestWithoutTheStoreNeverLeavesAHole(t *testing.T) {
	fresh := barsFrom(sun, 3)
	for _, tc := range []struct {
		name   string
		store  func() *memReplayBarStore
		last   int64
		status int // 0 = ok
	}{
		{"save fails, device ends on Friday close (weekend gap)", failingSave, fri, 0},
		{"read fails, device ends on Friday close", failingRead, fri, 0},
		{"save fails, device is a week behind", failingSave, fri - week, 502},
		{"read fails, device is a week behind", failingRead, fri - week, 502},
		{"save fails, device has nothing yet", failingSave, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc := service.NewLiveBarService((&fixedFetch{bars: fresh}).fetch, tc.store(), time.Now)
			page, err := svc.Latest(newCtx(), "NQ", tc.last)
			require.Equal(t, tc.status, status(err))
			if tc.status == 0 {
				require.NoError(t, err)
				require.Equal(t, spaced(sun, 3), page.Bars.T)
			}
		})
	}
}

func failingSave() *memReplayBarStore {
	s := newMemReplayBarStore()
	s.failUpsert = errors.New("db down")
	return s
}

func failingRead() *memReplayBarStore {
	s := newMemReplayBarStore()
	s.failAfter = errors.New("db down")
	return s
}

// Không có DB (dev): trả bản vừa kéo, lọc theo last − một tuần, như trước khi có DB.
func TestLatestWithoutAStoreReturnsTheFreshWeek(t *testing.T) {
	svc := service.NewLiveBarService((&fixedFetch{bars: barsFrom(sun, 3)}).fetch, nil, time.Now)
	page, err := svc.Latest(newCtx(), "NQ", sun+60+week)
	require.NoError(t, err)
	require.Equal(t, []int64{sun + 120}, page.Bars.T)
	require.False(t, svc.HasStore())

	_, err = svc.Stored(newCtx(), "NQ", 0, 0)
	require.Equal(t, 404, status(err))
}

func TestUnknownSymbolIsNotFound(t *testing.T) {
	svc := service.NewLiveBarService((&fixedFetch{bars: barsFrom(sun, 1)}).fetch, newMemReplayBarStore(), time.Now)
	_, err := svc.Latest(newCtx(), "AAPL", 0)
	require.Equal(t, 404, status(err))
	_, err = svc.Stored(newCtx(), "AAPL", 0, 0)
	require.Equal(t, 404, status(err))
}

// Cache hết hạn sau một phút. Lỗi từ TradingView (kể cả trả về rỗng) là 502 và được nhớ 15 giây,
// để bấm lại không tốn thêm một lần kết nối hỏng.
func TestLatestCacheExpiryAndUpstreamErrors(t *testing.T) {
	now := time.Unix(sun, 0)
	calls := 0
	mode := "ok"
	svc := service.NewLiveBarService(func(context.Context, string) (domain.MinuteBars, error) {
		calls++
		switch mode {
		case "fail":
			return domain.MinuteBars{}, errors.New("dial tradingview: 403")
		case "empty":
			return domain.MinuteBars{}, nil
		}
		return barsFrom(sun+int64(calls)*60, 1), nil
	}, nil, func() time.Time { return now })
	call := func() (domain.MinuteBars, error) {
		page, err := svc.Latest(newCtx(), "NQ", 0)
		return page.Bars, err
	}

	for _, step := range []struct {
		name      string
		advance   time.Duration
		mode      string
		wantCalls int
		status    int
	}{
		{"first call fetches", 0, "ok", 1, 0},
		{"within a minute: cached", 59 * time.Second, "ok", 1, 0},
		{"after a minute: fetches again", 2 * time.Second, "ok", 2, 0},
		{"upstream error is a 502", time.Minute, "fail", 3, 502},
		{"error remembered for 15 s", 14 * time.Second, "fail", 3, 502},
		{"no bars is an error, not an empty success", 2 * time.Second, "empty", 4, 502},
		{"recovers after the error expires", 16 * time.Second, "ok", 5, 0},
	} {
		now = now.Add(step.advance)
		mode = step.mode
		_, err := call()
		require.Equal(t, step.status, status(err), step.name)
		require.Equal(t, step.wantCalls, calls, step.name)
	}
}

// Một mã đang kéo chậm không bắt mã kia chờ; nhiều người gọi cùng một mã chung một lần kéo; người
// gọi bỏ đi giữa chừng thì lần kéo vẫn xong và vào cache.
func TestLatestSymbolsDoNotBlockEachOther(t *testing.T) {
	release := make(chan struct{})
	var mu sync.Mutex
	calls := map[string]int{}
	svc := service.NewLiveBarService(func(_ context.Context, ticker string) (domain.MinuteBars, error) {
		mu.Lock()
		calls[ticker]++
		mu.Unlock()
		if ticker == "CME_MINI:NQ1!" {
			<-release
		}
		return barsFrom(sun, 1), nil
	}, nil, time.Now)

	gone, cancel := context.WithCancel(context.Background())
	goneErr := make(chan error, 1)
	errs := make(chan error, 2)
	go func() { _, err := svc.Latest(gone, "NQ", 0); goneErr <- err }()
	for i := 0; i < 2; i++ {
		go func() { _, err := svc.Latest(newCtx(), "NQ", 0); errs <- err }()
	}
	require.Eventually(t, func() bool { mu.Lock(); defer mu.Unlock(); return calls["CME_MINI:NQ1!"] == 1 }, time.Second, 5*time.Millisecond)
	cancel()
	// đợi người bỏ đi trả về TRƯỚC khi lần kéo xong. Không đợi thì lúc máy bận (make test chạy nhiều
	// package song song) goroutine của họ có thể chưa chạy tới lúc kéo xong, rồi lấy trúng cache hoặc
	// select bốc trúng kết quả — test lỗi ngẫu nhiên dù code đúng.
	require.Error(t, <-goneErr, "the caller who left gets an error")

	es := make(chan error, 1)
	go func() { _, err := svc.Latest(newCtx(), "ES", 0); es <- err }()
	select {
	case err := <-es:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("ES waited for the NQ fetch")
	}

	close(release)
	for i := 0; i < 2; i++ {
		require.NoError(t, <-errs, "callers who stayed get the bars")
	}
	require.Equal(t, 1, calls["CME_MINI:NQ1!"], "concurrent NQ calls share one fetch")
	_, err := svc.Latest(newCtx(), "NQ", 0)
	require.NoError(t, err)
	require.Equal(t, 1, calls["CME_MINI:NQ1!"], "the abandoned fetch still filled the cache")
}

// Cron kéo và lưu mọi mã; một mã hỏng không chặn mã kia.
func TestRefreshAllSavesEverySymbol(t *testing.T) {
	store := newMemReplayBarStore()
	svc := service.NewLiveBarService(func(_ context.Context, ticker string) (domain.MinuteBars, error) {
		if ticker == "CME_MINI:ES1!" {
			return domain.MinuteBars{}, errors.New("dial tradingview: 403")
		}
		return barsFrom(sun, 3), nil
	}, store, time.Now)

	results := svc.RefreshAll(newCtx())
	require.Len(t, results, 2)
	require.Equal(t, "ES", results[0].Symbol)
	require.Error(t, results[0].Err)
	require.Equal(t, "NQ", results[1].Symbol)
	require.NoError(t, results[1].Err)
	require.Equal(t, service.RefreshResult{Symbol: "NQ", Bars: 3, From: sun, To: sun + 120}, results[1])
	require.Equal(t, 3, store.count("NQ"))
}

// Regression: một bản trong cache mang lỗi ghi DB (nút Cập nhật bấm lúc DB hỏng) không được làm cron
// báo lỗi mà không ghi lại — cron bỏ qua cache, kéo và ghi thật.
func TestRefreshAllIgnoresACachedSaveFailure(t *testing.T) {
	store := failingSave()
	f := &fixedFetch{bars: barsFrom(sun, 3)}
	svc := service.NewLiveBarService(f.fetch, store, time.Now)
	_, _ = svc.Latest(newCtx(), "NQ", 0) // lưu hỏng, bản lỗi nằm trong cache

	store.mu.Lock()
	store.failUpsert = nil // DB hồi lại
	store.mu.Unlock()
	for _, res := range svc.RefreshAll(newCtx()) {
		require.NoError(t, res.Err, res.Symbol)
	}
	require.Equal(t, 3, store.count("NQ"))
	require.Equal(t, 3, f.calls, "NQ fetched again by the cron, ES once")
}

func TestRefreshAllWithoutAStoreFails(t *testing.T) {
	svc := service.NewLiveBarService((&fixedFetch{bars: barsFrom(sun, 1)}).fetch, nil, time.Now)
	for _, res := range svc.RefreshAll(newCtx()) {
		require.Error(t, res.Err)
	}
}

// yahooFetch là Yahoo giả: trả bars (mọi mã) và ghi lại mốc from của mỗi lần kéo.
type yahooFetch struct {
	mu    sync.Mutex
	bars  domain.MinuteBars
	err   error
	froms map[string]int64
}

func (y *yahooFetch) fetch(_ context.Context, ticker string, from int64) (domain.MinuteBars, error) {
	y.mu.Lock()
	defer y.mu.Unlock()
	if y.froms == nil {
		y.froms = map[string]int64{}
	}
	y.froms[ticker] = from
	return y.bars, y.err
}

func withOpen(open string, b domain.MinuteBars) domain.MinuteBars {
	for i := range b.O {
		b.O[i] = json.Number(open)
	}
	return b
}

// Yahoo kéo song song một tuần: lấp phút trước và giữa nến TradingView, nhưng phút trùng giữ giá
// TradingView — trong DB lẫn trong trang trả về.
func TestLatestFillsGapsFromYahooButKeepsTradingViewPrices(t *testing.T) {
	store := newMemReplayBarStore()
	now := time.Unix(sun+600, 0)
	tv := withOpen("tv", minuteBars("1", sun, sun+120))
	yh := &yahooFetch{bars: withOpen("yh", barsFrom(sun-120, 5))} // sun-120 … sun+120
	svc := service.NewLiveBarService((&fixedFetch{bars: tv}).fetch, store, func() time.Time { return now }).WithYahoo(yh.fetch)

	page, err := svc.Latest(newCtx(), "NQ", 0)
	require.NoError(t, err)
	require.False(t, page.Stale)
	require.Equal(t, spaced(sun-120, 5), page.Bars.T)
	require.Equal(t, []json.Number{"yh", "yh", "tv", "yh", "tv"}, page.Bars.O)
	require.Equal(t, now.Unix()-week, yh.froms["NQ=F"], "the button pulls one week from Yahoo")
	require.False(t, page.Backup, "TradingView answered")
	require.Equal(t, 5, store.count("NQ"))
}

// TradingView hỏng mà Yahoo kéo được: không phải data cũ, nến Yahoo được lưu và trả về.
func TestLatestUsesYahooWhenTradingViewFails(t *testing.T) {
	for _, tc := range []struct {
		name  string
		store *memReplayBarStore
	}{
		{"with a store", newMemReplayBarStore()},
		{"without a store", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var store service.ReplayBarStore
			if tc.store != nil {
				store = tc.store
			}
			f := &fixedFetch{err: errors.New("dial tradingview: 403")}
			svc := service.NewLiveBarService(f.fetch, store, time.Now).WithYahoo((&yahooFetch{bars: barsFrom(sun, 3)}).fetch)
			page, err := svc.Latest(newCtx(), "ES", 0)
			require.NoError(t, err)
			require.False(t, page.Stale)
			require.True(t, page.Backup, "the new part is Yahoo only, the toast must say so")
			require.Equal(t, spaced(sun, 3), page.Bars.T)
			if tc.store != nil {
				require.Equal(t, 3, tc.store.count("ES"))
			}
		})
	}
}

// Cả hai nguồn hỏng: như trước khi có Yahoo — nến đã lưu (stale) hoặc 502 nêu cả hai nguồn.
func TestLatestFailsOnlyWhenBothSourcesFail(t *testing.T) {
	store := newMemReplayBarStore()
	require.NoError(t, store.Upsert(newCtx(), "NQ", barsFrom(sun-week, 3)))
	f := &fixedFetch{err: errors.New("dial tradingview: 403")}
	svc := service.NewLiveBarService(f.fetch, store, time.Now).WithYahoo((&yahooFetch{err: errors.New("yahoo chart HTTP 429")}).fetch)

	page, err := svc.Latest(newCtx(), "NQ", 0)
	require.NoError(t, err)
	require.True(t, page.Stale)

	_, err = svc.Latest(newCtx(), "ES", 0)
	require.Equal(t, 502, status(err))
	require.Equal(t, "không kéo được data từ TradingView lẫn Yahoo", apperr.As(err).Msg)
}

// Cron kéo Yahoo xa nhất nó cho (lấp tuần cron đã lỡ), và báo lỗi khi một nguồn hỏng dù phần kéo
// được vẫn đã lưu.
func TestRefreshAllPullsAMonthFromYahooAndReportsAFailedSource(t *testing.T) {
	store := newMemReplayBarStore()
	now := time.Unix(sun+600, 0)
	yh := &yahooFetch{bars: barsFrom(sun-3*week, 2)}
	svc := service.NewLiveBarService((&fixedFetch{bars: barsFrom(sun, 3)}).fetch, store, func() time.Time { return now }).WithYahoo(yh.fetch)

	for _, res := range svc.RefreshAll(newCtx()) {
		require.NoError(t, res.Err, res.Symbol)
		require.Equal(t, 5, res.Bars, res.Symbol)
		require.Equal(t, int64(sun-3*week), res.From, res.Symbol)
	}
	require.Equal(t, now.Unix()-yahoofeed.MaxBack, yh.froms["ES=F"])
	require.Equal(t, 5, store.count("NQ"))

	yh.mu.Lock()
	yh.err = errors.New("yahoo chart HTTP 429")
	yh.mu.Unlock()
	for _, res := range svc.RefreshAll(newCtx()) {
		require.ErrorContains(t, res.Err, "429", res.Symbol)
		require.Equal(t, 3, res.Bars, "TradingView bars are still saved")
	}
}

// Regression: cron và nút Cập nhật kéo cùng lúc thì cron không được nhận nhầm lần kéo một tuần của
// nút (chung khoá singleflight) — nó phải tự kéo Yahoo 30 ngày.
func TestRefreshAllDoesNotShareTheButtonsOneWeekPull(t *testing.T) {
	release := make(chan struct{})
	now := time.Unix(sun+600, 0)
	var mu sync.Mutex
	var nqFroms []int64
	yahoo := func(_ context.Context, ticker string, from int64) (domain.MinuteBars, error) {
		if ticker == "NQ=F" {
			mu.Lock()
			nqFroms = append(nqFroms, from)
			mu.Unlock()
		}
		return barsFrom(sun, 1), nil
	}
	tv := func(_ context.Context, ticker string) (domain.MinuteBars, error) {
		if ticker == "CME_MINI:NQ1!" {
			<-release
		}
		return barsFrom(sun, 1), nil
	}
	svc := service.NewLiveBarService(tv, newMemReplayBarStore(), func() time.Time { return now }).WithYahoo(yahoo)

	button := make(chan error, 1)
	go func() { _, err := svc.Latest(newCtx(), "NQ", 0); button <- err }()
	pulls := func() int { mu.Lock(); defer mu.Unlock(); return len(nqFroms) }
	require.Eventually(t, func() bool { return pulls() == 1 }, time.Second, 5*time.Millisecond)

	cron := make(chan []service.RefreshResult, 1)
	go func() { cron <- svc.RefreshAll(newCtx()) }()
	require.Eventually(t, func() bool { return pulls() == 2 }, time.Second, 5*time.Millisecond, "the cron started its own pull")
	close(release)

	require.NoError(t, <-button)
	for _, res := range <-cron {
		require.NoError(t, res.Err, res.Symbol)
	}
	require.ElementsMatch(t, []int64{now.Unix() - week, now.Unix() - yahoofeed.MaxBack}, nqFroms)
}
