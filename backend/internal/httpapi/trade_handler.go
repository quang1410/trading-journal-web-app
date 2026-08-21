package httpapi

import (
	"net/http"
	"strconv"

	"journal/internal/domain"
	"journal/internal/service"
)

type TradeHandler struct{ svc *service.TradeService }

// filterFromQuery đọc bộ lọc từ query string. Không kiểm giá trị: một
// `?symbol=KHONGCO` chỉ nên trả danh sách rỗng, không nên trả lỗi.
func filterFromQuery(r *http.Request) service.Filter {
	q := r.URL.Query()
	return service.Filter{
		From:       q.Get("from"),
		To:         q.Get("to"),
		Setup:      q.Get("setup"),
		Symbol:     q.Get("symbol"),
		Timeframe:  q.Get("timeframe"),
		Direction:  q.Get("direction"),
		TradeClass: q.Get("trade_class"),
	}.Normalize()
}

// soNguyen đọc một tham số số. Giá trị hỏng cho 0, và service kẹp 0 về mặc
// định — một query string gõ nhầm không nên làm gãy cả trang danh sách.
func soNguyen(r *http.Request, ten string) int {
	n, err := strconv.Atoi(r.URL.Query().Get(ten))
	if err != nil {
		return 0
	}
	return n
}

func (h *TradeHandler) List(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.List(r.Context(), Account(r.Context()), filterFromQuery(r),
		soNguyen(r, "page"), soNguyen(r, "size"))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, tradePageDTO{
		Items: toTradeDTOs(p.Items),
		Page:  p.Page,
		Size:  p.Size,
		Total: p.Total,
	})
}

func (h *TradeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req tradeCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		// entered_at thiếu offset rơi vào đây: encoding/json không parse được
		// "2026-06-09T12:00:00" thành time.Time, nên trả 400/1400.
		FailErr(w, r, err)
		return
	}
	acc := Account(r.Context())
	created, err := h.svc.Create(r.Context(), acc, req.toInput())
	if err != nil {
		FailErr(w, r, err)
		return
	}
	h.traLenh(w, r, acc, created.ID)
}

func (h *TradeHandler) Get(w http.ResponseWriter, r *http.Request) {
	h.traLenh(w, r, Account(r.Context()), Trade(r.Context()).ID)
}

func (h *TradeHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req tradePatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	t := Trade(r.Context())
	if err := h.svc.Update(r.Context(), t.ID, req.toPatch()); err != nil {
		FailErr(w, r, err)
		return
	}
	h.traLenh(w, r, Account(r.Context()), t.ID)
}

func (h *TradeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Delete(r.Context(), Trade(r.Context()).ID); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}

func (h *TradeHandler) Restore(w http.ResponseWriter, r *http.Request) {
	t := Trade(r.Context())
	if err := h.svc.Restore(r.Context(), t.ID); err != nil {
		FailErr(w, r, err)
		return
	}
	h.traLenh(w, r, Account(r.Context()), t.ID)
}

func (h *TradeHandler) Trash(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.Trash(r.Context(), Account(r.Context()).ID)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toDeletedTradeDTOs(rows))
}

func (h *TradeHandler) Stats(w http.ResponseWriter, r *http.Request) {
	k, err := h.svc.Stats(r.Context(), Account(r.Context()), filterFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toStatsDTO(k))
}

// Charts marshal thẳng aggregate.Charts — nó đã mang sẵn json tag từ Phase 1.
// Hình dạng JSON được ghim bằng golden test ở Task 12, thứ mà một tầng DTO
// 1-1 cũng chỉ làm được đúng như vậy nhưng tốn 200 dòng có thể trôi lệch.
func (h *TradeHandler) Charts(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.Charts(r.Context(), Account(r.Context()), filterFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, c)
}

// traLenh đọc lại một lệnh KÈM trường suy diễn.
//
// Phải đi qua Read chứ không dựng DTO từ domain.Trade: cum_by_trade,
// running_peak và drawdown của một lệnh phụ thuộc toàn bộ dãy trước nó, nên
// không tính được nếu chỉ có mình nó.
func (h *TradeHandler) traLenh(w http.ResponseWriter, r *http.Request, acc domain.Account, id int64) {
	res, err := h.svc.Read(r.Context(), acc, service.Filter{})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	for _, e := range res.All {
		if e.Trade.ID == id {
			OK(w, toTradeDTO(e))
			return
		}
	}
	// Không thấy trong dãy chưa xoá: lệnh vừa bị xoá mềm, hoặc đang ở thùng
	// rác. Trả bản thô, không bịa trường suy diễn.
	t, err := h.svc.ByID(r.Context(), id)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toDeletedTradeDTOs([]domain.Trade{t})[0])
}
