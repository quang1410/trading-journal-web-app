package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

// LiveHandler phục vụ nút "Cập nhật" của trang /replay: kéo hộ trình duyệt tuần nến 1m CME mới
// nhất (trình duyệt tự kéo bị TradingView chặn theo Origin, xem package tvfeed) và đọc lại nến đã
// lưu. Logic kéo, cache, lưu nằm ở service.LiveBarService.
type LiveHandler struct{ svc *service.LiveBarService }

type liveBarsDTO struct {
	Symbol string `json:"symbol"`
	Ticker string `json:"ticker"`
	domain.MinuteBars
	// More: còn nến sau trang này, đọc tiếp bằng GET /replay/bars/{symbol}?after=<giờ nến cuối>
	More bool `json:"more"`
	// Stale: không kéo được TradingView lẫn Yahoo, đây chỉ là nến đã lưu (có thể thiếu tuần mới nhất)
	Stale bool `json:"stale"`
	// Backup: TradingView không kéo được, phần mới chỉ từ Yahoo (Open / Close có thể lệch vài tick)
	Backup bool `json:"backup"`
}

// Bars: GET /api/replay/live/{symbol}?last=<giờ nến cuối máy đang có> — symbol là NQ hoặc ES. Kéo
// tuần mới nhất rồi trả trang đầu của mọi nến từ một tuần trước last (bỏ trống = mọi nến).
func (h *LiveHandler) Bars(w http.ResponseWriter, r *http.Request) {
	last, ok := unixParam(w, r, "last")
	if !ok {
		return
	}
	page, err := h.svc.Latest(r.Context(), strings.ToUpper(chi.URLParam(r, "symbol")), last)
	h.respond(w, r, page, err)
}

// Stored: GET /api/replay/bars/{symbol}?after=<giờ nến cuối của trang trước>&before=<giờ nến đầu máy
// đang có> — trang kế của nến đã lưu, before bỏ trống = không chặn. Chỉ đọc DB, không kéo gì.
func (h *LiveHandler) Stored(w http.ResponseWriter, r *http.Request) {
	after, ok := unixParam(w, r, "after")
	if !ok {
		return
	}
	before, ok := unixParam(w, r, "before")
	if !ok {
		return
	}
	page, err := h.svc.Stored(r.Context(), strings.ToUpper(chi.URLParam(r, "symbol")), after, before)
	h.respond(w, r, page, err)
}

func (h *LiveHandler) respond(w http.ResponseWriter, r *http.Request, page service.LivePage, err error) {
	if err != nil {
		if r.Context().Err() != nil {
			return // người gọi đã bỏ đi: không ghi gì, lần kéo vẫn chạy tiếp và vào cache
		}
		FailErr(w, r, err)
		return
	}
	OK(w, liveBarsDTO{Symbol: page.Symbol, Ticker: page.Ticker, MinuteBars: page.Bars.OrEmpty(), More: page.More, Stale: page.Stale, Backup: page.Backup})
}

// unixParam đọc tham số query là giây Unix; bỏ trống = 0. Sai định dạng thì trả 400 và ok = false.
func unixParam(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return 0, true
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		FailErr(w, r, apperr.Validation(name+" phải là giây Unix"))
		return 0, false
	}
	return v, true
}
