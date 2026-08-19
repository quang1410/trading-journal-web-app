package httpapi

import (
	"net/http"

	"journal/internal/service"
)

type AccountHandler struct{ svc *service.AccountService }

func (h *AccountHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), UserID(r.Context()))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTOs(list))
}

func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req accountCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	acc, err := h.svc.Create(r.Context(), UserID(r.Context()), service.AccountCreate{
		Code:           req.Code,
		Name:           req.Name,
		Currency:       req.Currency,
		Timezone:       req.Timezone,
		InitialBalance: req.InitialBalance,
		RiskPerTrade:   req.RiskPerTrade,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTO(acc))
}

// Update chạy sau RequireAccount, nên quyền sở hữu đã được kiểm; service
// kiểm lại lần nữa vì nó cũng là API dùng được ngoài HTTP.
func (h *AccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req accountPatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	acc, err := h.svc.Update(r.Context(), UserID(r.Context()), Account(r.Context()).ID,
		service.AccountPatch{
			Code:           req.Code,
			Name:           req.Name,
			Currency:       req.Currency,
			Timezone:       req.Timezone,
			InitialBalance: req.InitialBalance,
			RiskPerTrade:   req.RiskPerTrade,
		})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTO(acc))
}
