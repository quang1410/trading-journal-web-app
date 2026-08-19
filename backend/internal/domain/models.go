package domain

import (
	"time"

	"github.com/shopspring/decimal"
)

// Account là một tài khoản giao dịch. Timezone là tên IANA và quyết định
// mọi phép gom nhóm theo ngày.
type Account struct {
	ID             int64           `gorm:"column:id;primaryKey"`
	UserID         int64           `gorm:"column:user_id"`
	Code           string          `gorm:"column:code"`
	Name           string          `gorm:"column:name"`
	InitialBalance decimal.Decimal `gorm:"column:initial_balance"`
	RiskPerTrade   decimal.Decimal `gorm:"column:risk_per_trade"` // 0.01 = 1%
	Currency       string          `gorm:"column:currency"`
	Timezone       string          `gorm:"column:timezone"`
}

// OneR quy 1R ra tiền: vốn ban đầu nhân phần trăm rủi ro mỗi lệnh.
// Cố ý dùng vốn BAN ĐẦU, không phải balance hiện tại — xem spec quyết định #7.
func (a Account) OneR() decimal.Decimal {
	return a.InitialBalance.Mul(a.RiskPerTrade)
}

// Trade là một lệnh, chỉ gồm trường người dùng nhập. Mọi trường suy diễn
// (net, điểm, lũy kế, drawdown) nằm ở package metrics.
type Trade struct {
	ID        int64     `gorm:"column:id;primaryKey"`
	AccountID int64     `gorm:"column:account_id"`
	STT       int       `gorm:"column:stt"`
	EnteredAt time.Time `gorm:"column:entered_at"` // luôn UTC

	Symbol    string `gorm:"column:symbol"`
	Direction string `gorm:"column:direction"`
	// Entry, Exit, Volume là NUMERIC nullable ở migration 0001 (lệnh nhập tay
	// có thể để trống); *decimal.Decimal để nil map đúng sang NULL khi
	// Scan/Value qua GORM. Không dùng non-pointer decimal.Decimal: Value() của
	// shopspring/decimal@v1.4.0 luôn trả về d.String(), không bao giờ trả nil,
	// nên decimal.Decimal{} (giá trị rỗng) khi Create sẽ lặng lẽ ghi chuỗi "0"
	// vào cột NULLable này thay vì để trống — "chưa nhập giá" biến thành "giá
	// bằng 0" mà không một lỗi nào báo, kiểu hỏng dữ liệu nguy hiểm nhất vì im
	// lặng. Nếu NULL đã có sẵn trong cột do nơi khác ghi vào (SQL thô, import
	// CSV, hoặc code từng đúng rồi bị revert) thì đọc lại qua non-pointer mới
	// lộ ra bằng lỗi Scan(nil): "could not convert value '<nil>' to byte
	// array". Cùng rủi ro áp dụng cho profit_theory nếu không theo mẫu con
	// trỏ này.
	Entry  *decimal.Decimal `gorm:"column:entry"`
	Exit   *decimal.Decimal `gorm:"column:exit"`
	Volume *decimal.Decimal `gorm:"column:volume"`

	Profit       decimal.Decimal  `gorm:"column:profit"`
	ProfitTheory *decimal.Decimal `gorm:"column:profit_theory"` // nil khi user để trống
	Fee          decimal.Decimal  `gorm:"column:fee"`

	Setup          string `gorm:"column:setup"`
	Timeframe      string `gorm:"column:timeframe"`
	EntryQuality   string `gorm:"column:entry_quality"`
	InTradeQuality string `gorm:"column:in_trade_quality"`
	ExitQuality    string `gorm:"column:exit_quality"`
	Psychology     string `gorm:"column:psychology"`
	Notes          string `gorm:"column:notes"`
}

// CashFlow là một lần nạp hoặc rút tiền, dùng để tính current_balance.
type CashFlow struct {
	ID        int64           `gorm:"column:id;primaryKey"`
	AccountID int64           `gorm:"column:account_id"`
	Date      time.Time       `gorm:"column:date"`
	Amount    decimal.Decimal `gorm:"column:amount"` // luôn dương
	Type      string          `gorm:"column:type"`   // "deposit" | "withdraw"
	Note      string          `gorm:"column:note"`
}

func (Account) TableName() string  { return "accounts" }
func (Trade) TableName() string    { return "trades" }
func (CashFlow) TableName() string { return "cash_flows" }
