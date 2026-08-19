package httpapi

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/service"
)

// DTO là hợp đồng với frontend. Struct của domain và của repository KHÔNG
// được marshal thẳng: chúng đổi hình dạng vì lý do nội bộ, hợp đồng API thì không.

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userDTO struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

type sessionDTO struct {
	AccessToken string  `json:"access_token"`
	User        userDTO `json:"user"`
}

func toSessionDTO(s service.Session) sessionDTO {
	return sessionDTO{
		AccessToken: s.AccessToken,
		User:        userDTO{ID: s.User.ID, Email: s.User.Email},
	}
}

// decimal.Decimal marshal ra CHUỖI JSON theo mặc định của shopspring/decimal —
// đúng yêu cầu spec §5, và là lý do frontend không mất precision.
type accountDTO struct {
	ID             int64           `json:"id"`
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	InitialBalance decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   decimal.Decimal `json:"risk_per_trade"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	// OneR là trường suy diễn, tính lúc đọc — không có cột trong DB.
	OneR decimal.Decimal `json:"one_r"`
}

func toAccountDTO(a domain.Account) accountDTO {
	return accountDTO{
		ID:             a.ID,
		Code:           a.Code,
		Name:           a.Name,
		InitialBalance: a.InitialBalance,
		RiskPerTrade:   a.RiskPerTrade,
		Currency:       a.Currency,
		Timezone:       a.Timezone,
		OneR:           a.OneR(),
	}
}

func toAccountDTOs(list []domain.Account) []accountDTO {
	// Khởi tạo slice rỗng chứ không nil: JSON phải là [] chứ không phải null.
	out := make([]accountDTO, 0, len(list))
	for _, a := range list {
		out = append(out, toAccountDTO(a))
	}
	return out
}

type accountCreateRequest struct {
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	InitialBalance decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   decimal.Decimal `json:"risk_per_trade"`
}

// Con trỏ nghĩa là "khoá này không có trong body" — PATCH là partial update.
type accountPatchRequest struct {
	Code           *string          `json:"code"`
	Name           *string          `json:"name"`
	Currency       *string          `json:"currency"`
	Timezone       *string          `json:"timezone"`
	InitialBalance *decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   *decimal.Decimal `json:"risk_per_trade"`
}
