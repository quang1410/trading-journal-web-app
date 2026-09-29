package metrics

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// Challenge là tiến độ thi quỹ, suy ra lúc đọc — không có cột nào trong DB.
// Mọi tỷ lệ là PHÂN SỐ, như net_return_pct: 0.07 = 7%.
type Challenge struct {
	// ProfitPct = Σ net của TOÀN BỘ lệnh / vốn ban đầu. Có thể âm.
	ProfitPct decimal.Decimal
	// TargetProgress = ProfitPct / mục tiêu. nil khi quỹ không đặt mục tiêu —
	// khác 0: 0 đọc thành "chưa tiến chút nào", nil là "không có đích để đo".
	TargetProgress *decimal.Decimal
	// DrawdownPct = drawdown lớn nhất của toàn bộ dãy / vốn ban đầu, số dương.
	DrawdownPct decimal.Decimal
	// DrawdownUsage = DrawdownPct / giới hạn. >= 1 là đã chạm giới hạn.
	DrawdownUsage *decimal.Decimal
}

// ComputeChallenge trả nil cho tài khoản cá nhân.
//
// `all` phải là dãy CHƯA lọc: tiến độ thi là tình trạng thật của account,
// không đổi theo tháng người dùng đang xem — cùng ngoại lệ với CurrentBalance
// ở quy tắc 8 của CLAUDE.md.
//
// Drawdown đo từ ĐỈNH equity (Enrich đặt running_peak sàn tại 0, tức sàn tại
// vốn ban đầu), không phải drawdown tĩnh tính từ vốn. Với cùng dãy lệnh, số
// này luôn >= số của quỹ dùng luật tĩnh: nếu sai thì sai về phía thận trọng.
// Cash flow không tính vào — account quỹ không nạp/rút (spec §4).
func ComputeChallenge(all []Enriched, acc domain.Account) *Challenge {
	if acc.Type != domain.AccountProp || !acc.InitialBalance.IsPositive() {
		return nil
	}

	net, maxDD := decimal.Zero, decimal.Zero
	for _, r := range all {
		net = net.Add(r.Net)
		if r.Drawdown.GreaterThan(maxDD) {
			maxDD = r.Drawdown
		}
	}

	c := &Challenge{
		ProfitPct:   net.Div(acc.InitialBalance),
		DrawdownPct: maxDD.Div(acc.InitialBalance),
	}
	if acc.ProfitTarget != nil && acc.ProfitTarget.IsPositive() {
		c.TargetProgress = ptrDec(c.ProfitPct.Div(*acc.ProfitTarget))
	}
	if acc.MaxDrawdownLimit != nil && acc.MaxDrawdownLimit.IsPositive() {
		c.DrawdownUsage = ptrDec(c.DrawdownPct.Div(*acc.MaxDrawdownLimit))
	}
	return c
}
