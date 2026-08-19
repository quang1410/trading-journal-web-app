package httpapi

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"journal/internal/service"
)

type CashFlowHandler struct{ svc *service.CashFlowService }

func (h *CashFlowHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), Account(r.Context()).ID)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toCashFlowDTOs(list))
}

func (h *CashFlowHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req cashFlowCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	cf, err := h.svc.Create(r.Context(), Account(r.Context()).ID, service.CashFlowCreate{
		Date:   req.Date,
		Amount: req.Amount,
		Type:   req.Type,
		Note:   req.Note,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toCashFlowDTO(cf))
}

// Delete không đi qua RequireAccount: URL không có account id, nên service tự
// nạp cash flow rồi kiểm quyền sở hữu qua account của nó.
func (h *CashFlowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		Fail(w, http.StatusBadRequest, 1400, "id giao dịch tiền không hợp lệ")
		return
	}
	if err := h.svc.Delete(r.Context(), UserID(r.Context()), id); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
