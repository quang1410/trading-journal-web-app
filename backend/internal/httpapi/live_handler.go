package httpapi

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/sync/singleflight"

	"journal/internal/apperr"
	"journal/internal/tvfeed"
)

// LiveFetcher kéo nến 1m của một mã TradingView. Prod dùng tvfeed.Client.Fetch; test thay hàm giả.
type LiveFetcher func(ctx context.Context, ticker string) (tvfeed.Bars, error)

const (
	// liveTTL: trong một phút, bấm Cập nhật lại (hay người khác bấm) dùng bản đã kéo, không gọi
	// TradingView lần nữa — vừa nhanh vừa ít bị họ để ý.
	liveTTL = time.Minute
	// liveErrTTL: TradingView lỗi (chặn IP, đổi giao thức) thì trả lỗi ngay trong 15 giây, không
	// để mỗi lần bấm lại tốn một lần kết nối hỏng.
	liveErrTTL = 15 * time.Second
	// liveTimeout: một tuần nến 1m là hai, ba đợt, thường xong trong khoảng 4 giây. Giữ dưới giới hạn
	// 10 giây của function trên Vercel, để quá hạn thì người dùng nhận lỗi 502 có thông điệp của
	// mình chứ không phải trang 504 của nền tảng.
	liveTimeout = 9 * time.Second
)

var errNoBars = errors.New("tradingview returned no bars")

// LiveHandler phục vụ nút "Cập nhật" của trang /replay: kéo hộ trình duyệt tuần nến 1m CME mới nhất
// (trình duyệt tự kéo bị TradingView chặn theo Origin, xem package tvfeed).
//
// Mỗi mã kéo riêng: NQ đang kéo chậm không bắt ES chờ. Nhiều request cùng một mã lúc đang kéo thì
// chung một lần kéo (singleflight). Khoá chỉ giữ lúc đọc / ghi cache, không giữ lúc kéo hay lúc
// ghi response.
type LiveHandler struct {
	fetch LiveFetcher
	now   func() time.Time
	group singleflight.Group
	mu    sync.Mutex
	cache map[string]liveEntry
}

type liveEntry struct {
	at   time.Time
	body liveBarsDTO
	err  error
}

type liveBarsDTO struct {
	Symbol string `json:"symbol"`
	Ticker string `json:"ticker"`
	tvfeed.Bars
}

// NewLiveHandler dựng handler với cache rỗng.
func NewLiveHandler(fetch LiveFetcher, now func() time.Time) *LiveHandler {
	return &LiveHandler{fetch: fetch, now: now, cache: map[string]liveEntry{}}
}

// Bars: GET /api/replay/live/{symbol} — symbol là NQ hoặc ES.
func (h *LiveHandler) Bars(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))
	ticker, ok := tvfeed.Tickers[symbol]
	if !ok {
		FailErr(w, r, apperr.NotFound("không có data trực tiếp cho mã này"))
		return
	}
	if e, ok := h.cached(symbol); ok {
		h.respond(w, e)
		return
	}
	// lần kéo không gắn với context của request: người bấm đầu tiên đóng tab thì những người đang
	// chờ chung vẫn nhận được kết quả
	ch := h.group.DoChan(symbol, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), liveTimeout)
		defer cancel()
		bars, err := h.fetch(ctx, ticker)
		if err == nil && len(bars.T) == 0 {
			err = errNoBars
		}
		if err != nil {
			log.Printf("live bars %s: %v", ticker, err)
		}
		e := liveEntry{at: h.now(), body: liveBarsDTO{Symbol: symbol, Ticker: ticker, Bars: bars}, err: err}
		h.mu.Lock()
		h.cache[symbol] = e
		h.mu.Unlock()
		return e, nil
	})
	select {
	case res := <-ch:
		h.respond(w, res.Val.(liveEntry))
	case <-r.Context().Done():
		// người gọi đã bỏ đi: không ghi gì, lần kéo vẫn chạy tiếp và vào cache
	}
}

// cached trả bản trong cache nếu còn hạn: bản tốt một phút, bản lỗi 15 giây.
func (h *LiveHandler) cached(symbol string) (liveEntry, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.cache[symbol]
	if !ok {
		return e, false
	}
	ttl := liveTTL
	if e.err != nil {
		ttl = liveErrTTL
	}
	return e, h.now().Sub(e.at) < ttl
}

func (h *LiveHandler) respond(w http.ResponseWriter, e liveEntry) {
	if e.err != nil {
		Fail(w, http.StatusBadGateway, 1502, "không kéo được data từ TradingView")
		return
	}
	OK(w, e.body)
}
