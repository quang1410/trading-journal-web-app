package domain

import (
	"time"

	"github.com/shopspring/decimal"
)

// Account là một tài khoản giao dịch. Timezone là tên IANA và quyết định
// mọi phép gom nhóm theo ngày.
type Account struct {
	ID             int64
	UserID         int64
	Code           string
	Name           string
	InitialBalance decimal.Decimal
	RiskPerTrade   decimal.Decimal // 0.01 = 1%
	Currency       string
	Timezone       string
}

// OneR quy 1R ra tiền: vốn ban đầu nhân phần trăm rủi ro mỗi lệnh.
// Cố ý dùng vốn BAN ĐẦU, không phải balance hiện tại — xem spec quyết định #7.
func (a Account) OneR() decimal.Decimal {
	return a.InitialBalance.Mul(a.RiskPerTrade)
}

// Trade là một lệnh, chỉ gồm trường người dùng nhập. Mọi trường suy diễn
// (net, điểm, lũy kế, drawdown) nằm ở package metrics.
type Trade struct {
	ID        int64
	AccountID int64
	STT       int
	EnteredAt time.Time // luôn UTC

	Symbol    string
	Direction string
	Entry     decimal.Decimal
	Exit      decimal.Decimal
	Volume    decimal.Decimal

	Profit       decimal.Decimal
	ProfitTheory *decimal.Decimal // nil khi user để trống
	Fee          decimal.Decimal

	Setup          string
	Timeframe      string
	EntryQuality   string
	InTradeQuality string
	ExitQuality    string
	Psychology     string
	Notes          string
}

// CashFlow là một lần nạp hoặc rút tiền, dùng để tính current_balance.
type CashFlow struct {
	ID        int64
	AccountID int64
	Date      time.Time
	Amount    decimal.Decimal // luôn dương
	Type      string          // "deposit" | "withdraw"
}
