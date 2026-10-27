package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/tvfeed"
)

// LiveFetcher kéo nến 1m của một mã TradingView. Prod dùng tvfeed.Client.Fetch; test thay hàm giả.
type LiveFetcher func(ctx context.Context, ticker string) (domain.MinuteBars, error)

const (
	// liveTTL: trong một phút, bấm Cập nhật lại (hay người khác bấm) dùng bản đã kéo, không gọi
	// TradingView lần nữa — vừa nhanh vừa ít bị họ để ý.
	liveTTL = time.Minute
	// liveErrTTL: TradingView lỗi (chặn IP, đổi giao thức) thì trả lỗi ngay trong 15 giây, không
	// để mỗi lần bấm lại tốn một lần kết nối hỏng.
	liveErrTTL = 15 * time.Second
	// liveFetchTimeout + liveSaveTimeout giữ cả lần kéo lẫn lần ghi dưới giới hạn 10 giây của
	// function trên Vercel, để quá hạn thì người dùng nhận lỗi 502 có thông điệp của mình chứ không
	// phải trang 504 của nền tảng. Một tuần nến 1m thường kéo xong trong khoảng 5 giây; ghi khoảng
	// 7 000 dòng trong một câu lệnh chưa tới 0,1 giây. Ghi có hạn riêng để lần kéo chậm không ăn
	// hết thời gian của lần ghi.
	liveFetchTimeout = 7 * time.Second
	liveSaveTimeout  = 2 * time.Second
	// LivePageSize: số nến tối đa mỗi trang đọc từ DB. 40 000 nến là khoảng 2 MB JSON, dưới giới hạn
	// 4,5 MB body của Vercel.
	LivePageSize = 40000
	// LiveOverlap: nút Cập nhật nhận lại cả tuần trước nến cuối máy đang có, để nến TradingView trả
	// muộn chen được vào giữa (frontend gộp bằng mergeBars). Đổi lại mỗi lần bấm nhận thêm khoảng
	// một tuần nến.
	LiveOverlap = 7 * 86400
	// liveMaxGap: khoảng hở lớn nhất giữa nến cuối của máy và nến đầu của bản vừa kéo mà vẫn coi là
	// liền nhau. CME nghỉ cuối tuần từ thứ Sáu 17:00 tới Chủ nhật 18:00 giờ New York, nên nến cuối
	// thứ Sáu và nến đầu Chủ nhật cách nhau 49 giờ mà không thiếu cây nào.
	liveMaxGap = 50 * 3600
)

var errNoBars = errors.New("tradingview returned no bars")

// LiveBarService kéo nến 1m CME mới nhất (NQ, ES) từ TradingView, lưu vào DB, và đọc lại cho nút
// "Cập nhật" của trang /replay và cron hằng tuần.
//
// Mỗi mã kéo riêng: NQ đang kéo chậm không bắt ES chờ. Nhiều người gọi cùng một mã lúc đang kéo
// thì chung một lần kéo (singleflight). Khoá chỉ giữ lúc đọc / ghi cache, không giữ lúc kéo.
//
// store nil được (dev không DB, test): khi đó chỉ trả bản vừa kéo, không lưu gì.
type LiveBarService struct {
	fetch LiveFetcher
	store ReplayBarStore
	now   func() time.Time
	group singleflight.Group
	mu    sync.Mutex
	cache map[string]liveEntry
}

type liveEntry struct {
	at      time.Time
	bars    domain.MinuteBars
	err     error // kéo TradingView lỗi
	saveErr error // kéo được nhưng ghi DB lỗi
}

func NewLiveBarService(fetch LiveFetcher, store ReplayBarStore, now func() time.Time) *LiveBarService {
	return &LiveBarService{fetch: fetch, store: store, now: now, cache: map[string]liveEntry{}}
}

// HasStore báo có DB để lưu và đọc lại nến; không có thì không gắn route đọc trang và cron.
func (s *LiveBarService) HasStore() bool { return s.store != nil }

// LivePage là một trang nến trả cho trình duyệt.
type LivePage struct {
	Symbol string
	Ticker string
	Bars   domain.MinuteBars
	// More: còn nến sau trang này; trang kế đọc bằng Stored với after = giờ của nến cuối.
	More bool
	// Stale: TradingView không kéo được, đây chỉ là nến đã lưu trong DB (có thể thiếu tuần mới nhất).
	Stale bool
}

// Latest phục vụ nút Cập nhật: kéo tuần mới nhất (cache một phút), lưu, rồi trả trang đầu của mọi
// nến mở sau (last − LiveOverlap). last là giờ nến cuối máy đang có; 0 = máy chưa có nến nào.
//
// Ba tình huống hỏng, và vì sao mỗi cái xử lý như vậy:
//   - TradingView lỗi mà DB có nến: vẫn trả nến đã lưu (Stale), không để IP bị chặn làm mất luôn
//     những tuần cron đã lưu.
//   - DB lỗi: trả bản vừa kéo, nhưng CHỈ khi nó nối liền với nến cuối của máy. Nếu không, máy sẽ gộp
//     một tuần cách quãng, lần bấm sau hỏi từ tuần đó trở đi, và những tuần ở giữa (đã có trong DB)
//     không bao giờ được hỏi lại.
//   - Cả hai lỗi: 502.
func (s *LiveBarService) Latest(ctx context.Context, symbol string, last int64) (LivePage, error) {
	ticker, err := lookupTicker(symbol)
	if err != nil {
		return LivePage{}, err
	}
	since := max(last-LiveOverlap, 0)
	e, err := s.load(ctx, symbol, ticker, true)
	if err != nil {
		return LivePage{}, err
	}
	if e.err != nil {
		if s.store != nil {
			page, err := s.storedPage(ctx, symbol, ticker, since)
			if err == nil && page.Bars.Len() > 0 {
				page.Stale = true
				return page, nil
			}
		}
		return LivePage{}, apperr.BadGateway("không kéo được data từ TradingView")
	}
	if s.store != nil && e.saveErr == nil {
		page, err := s.storedPage(ctx, symbol, ticker, since)
		if err == nil {
			return page, nil
		}
		log.Printf("read replay bars %s: %v", symbol, err)
	}
	// không đọc được từ DB (hoặc không có DB): bản vừa kéo
	if s.store != nil && last > 0 && e.bars.T[0]-last > liveMaxGap {
		return LivePage{}, apperr.BadGateway("chưa đọc được data đã lưu, thử lại sau")
	}
	return LivePage{Symbol: symbol, Ticker: ticker, Bars: e.bars.After(since)}, nil
}

// Stored trả trang kế của nến đã lưu, mở sau after. Chỉ đọc DB, không kéo TradingView — nên trang
// thứ hai trở đi không tốn thêm lần kéo nào và không dính rate limit của nút Cập nhật.
func (s *LiveBarService) Stored(ctx context.Context, symbol string, after int64) (LivePage, error) {
	ticker, err := lookupTicker(symbol)
	if err != nil {
		return LivePage{}, err
	}
	if s.store == nil {
		return LivePage{}, apperr.NotFound("không có data đã lưu")
	}
	page, err := s.storedPage(ctx, symbol, ticker, after)
	if err != nil {
		log.Printf("read replay bars %s: %v", symbol, err)
		return LivePage{}, apperr.BadGateway("chưa đọc được data đã lưu, thử lại sau")
	}
	return page, nil
}

// RefreshResult là kết quả cron của một mã. Err nil = đã kéo và lưu xong.
type RefreshResult struct {
	Symbol string
	Bars   int
	From   int64
	To     int64
	Err    error
}

// RefreshAll phục vụ cron: kéo lại mọi mã trong tvfeed.Tickers song song, BỎ QUA cache (một bản
// trong cache có thể mang lỗi ghi DB của lần trước, cron phải ghi lại thật), và lưu vào DB. Mã nào
// hỏng thì Err khác nil; mã khác vẫn được lưu.
func (s *LiveBarService) RefreshAll(ctx context.Context) []RefreshResult {
	symbols := make([]string, 0, len(tvfeed.Tickers))
	for symbol := range tvfeed.Tickers {
		symbols = append(symbols, symbol)
	}
	sort.Strings(symbols)
	results := make([]RefreshResult, len(symbols))
	var wg sync.WaitGroup
	for i, symbol := range symbols {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res := RefreshResult{Symbol: symbol}
			e, err := s.load(ctx, symbol, tvfeed.Tickers[symbol], false)
			if err == nil {
				err = errors.Join(e.err, e.saveErr)
				if s.store == nil {
					err = errors.Join(err, errors.New("no store configured"))
				}
			}
			res.Err = err
			if n := e.bars.Len(); n > 0 {
				res.Bars, res.From, res.To = n, e.bars.T[0], e.bars.T[n-1]
			}
			results[i] = res
		}()
	}
	wg.Wait()
	return results
}

func lookupTicker(symbol string) (string, error) {
	ticker, ok := tvfeed.Tickers[symbol]
	if !ok {
		return "", apperr.NotFound("không có data trực tiếp cho mã này")
	}
	return ticker, nil
}

func (s *LiveBarService) storedPage(ctx context.Context, symbol, ticker string, after int64) (LivePage, error) {
	bars, more, err := s.store.After(ctx, symbol, after, LivePageSize)
	if err != nil {
		return LivePage{}, err
	}
	return LivePage{Symbol: symbol, Ticker: ticker, Bars: bars, More: more}, nil
}

// load trả bản trong cache nếu còn hạn và useCache, không thì kéo (chung một lần kéo cho mọi người
// gọi cùng mã) rồi ghi vào DB. Lỗi chỉ khi ctx của người gọi kết thúc trước lúc kéo xong.
func (s *LiveBarService) load(ctx context.Context, symbol, ticker string, useCache bool) (liveEntry, error) {
	if useCache {
		if e, ok := s.cached(symbol); ok {
			return e, nil
		}
	}
	// lần kéo không gắn với context của người gọi: người bấm đầu tiên đóng tab thì những người đang
	// chờ chung vẫn nhận được kết quả, và lần kéo vẫn vào cache
	ch := s.group.DoChan(symbol, func() (any, error) {
		fetchCtx, cancel := context.WithTimeout(context.Background(), liveFetchTimeout)
		defer cancel()
		bars, err := s.fetch(fetchCtx, ticker)
		if err == nil && bars.Len() == 0 {
			err = errNoBars
		}
		e := liveEntry{at: s.now(), bars: bars, err: err}
		if err != nil {
			log.Printf("live bars %s: %v", ticker, err)
		} else if s.store != nil {
			saveCtx, cancel := context.WithTimeout(context.Background(), liveSaveTimeout)
			defer cancel()
			if e.saveErr = s.store.Upsert(saveCtx, symbol, bars); e.saveErr != nil {
				log.Printf("save live bars %s: %v", symbol, e.saveErr)
			}
		}
		s.mu.Lock()
		s.cache[symbol] = e
		s.mu.Unlock()
		return e, nil
	})
	select {
	case res := <-ch:
		return res.Val.(liveEntry), nil
	case <-ctx.Done():
		return liveEntry{}, fmt.Errorf("wait for live bars %s: %w", symbol, ctx.Err())
	}
}

// cached trả bản trong cache nếu còn hạn: bản tốt một phút, bản lỗi 15 giây.
func (s *LiveBarService) cached(symbol string) (liveEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.cache[symbol]
	if !ok {
		return e, false
	}
	ttl := liveTTL
	if e.err != nil {
		ttl = liveErrTTL
	}
	return e, s.now().Sub(e.at) < ttl
}
