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

	propInfoJSON
}

// propInfoJSON là domain.PropInfo kèm tag JSON. Cùng tên trường, cùng kiểu,
// cùng thứ tự với bản domain — nên đổi qua lại bằng một phép chuyển kiểu
// (Go bỏ qua tag khi so kiểu), và lệch một trường là lỗi biên dịch chứ không
// phải một khoá JSON lặng lẽ biến mất. Nhúng vào DTO thì encoding/json trải
// phẳng các khoá ra cùng cấp với code, name…
//
// Tài khoản cá nhân: bốn trường con trỏ ra null, prop_firm ra "".
type propInfoJSON struct {
	Type             string           `json:"account_type"`
	PropFirm         string           `json:"prop_firm"`
	ChallengePhase   *string          `json:"challenge_phase"`
	ChallengeStatus  *string          `json:"challenge_status"`
	ProfitTarget     *decimal.Decimal `json:"profit_target"`
	MaxDrawdownLimit *decimal.Decimal `json:"max_drawdown_limit"`
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
		propInfoJSON:   propInfoJSON(a.PropInfo),
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

	propInfoJSON
}

// Con trỏ nghĩa là "khoá này không có trong body" — PATCH là partial update.
// Hai tỷ lệ là Tristate: null trong body nghĩa là XOÁ, khác với vắng mặt.
type accountPatchRequest struct {
	Code           *string          `json:"code"`
	Name           *string          `json:"name"`
	Currency       *string          `json:"currency"`
	Timezone       *string          `json:"timezone"`
	InitialBalance *decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   *decimal.Decimal `json:"risk_per_trade"`

	Type             *string                           `json:"account_type"`
	PropFirm         *string                           `json:"prop_firm"`
	ChallengePhase   *string                           `json:"challenge_phase"`
	ChallengeStatus  *string                           `json:"challenge_status"`
	ProfitTarget     service.Tristate[decimal.Decimal] `json:"profit_target"`
	MaxDrawdownLimit service.Tristate[decimal.Decimal] `json:"max_drawdown_limit"`
}

type cashFlowDTO struct {
	ID     int64           `json:"id"`
	Date   string          `json:"date"` // YYYY-MM-DD
	Amount decimal.Decimal `json:"amount"`
	Type   string          `json:"type"`
	Note   string          `json:"note"`
}

func toCashFlowDTO(cf domain.CashFlow) cashFlowDTO {
	return cashFlowDTO{
		ID:     cf.ID,
		Date:   cf.Date.Format("2006-01-02"),
		Amount: cf.Amount,
		Type:   cf.Type,
		Note:   cf.Note,
	}
}

func toCashFlowDTOs(list []domain.CashFlow) []cashFlowDTO {
	out := make([]cashFlowDTO, 0, len(list))
	for _, cf := range list {
		out = append(out, toCashFlowDTO(cf))
	}
	return out
}

type cashFlowCreateRequest struct {
	Date   string          `json:"date"`
	Amount decimal.Decimal `json:"amount"`
	Type   string          `json:"type"`
	Note   string          `json:"note"`
}
