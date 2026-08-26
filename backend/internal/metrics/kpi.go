package metrics

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// KPI là bộ chỉ số toàn tài khoản theo trading-journal-plan.md §4.
// Trường con trỏ nghĩa là "không xác định" (chia cho 0, hoặc chưa có dữ liệu)
// — frontend hiển thị "—" thay vì 0, vì 0 và "không tính được" khác nhau.
type KPI struct {
	TotalWin  decimal.Decimal
	TotalLoss decimal.Decimal // âm
	NetProfit decimal.Decimal
	TotalFees decimal.Decimal

	NetReturnPct *decimal.Decimal // net_profit / vốn ban đầu
	ProfitFactor *decimal.Decimal // −total_win / total_loss

	WinCount    int
	LossCount   int
	TotalTrades int // win + loss, KHÔNG gồm lệnh net = 0
	WinPct      *decimal.Decimal

	AveWin  *decimal.Decimal
	AveLoss *decimal.Decimal // âm

	BiggestWinner *decimal.Decimal
	BiggestLoser  *decimal.Decimal

	OneR         decimal.Decimal
	BiggestRWin  *decimal.Decimal
	BiggestRLoss *decimal.Decimal
	RRActual     *decimal.Decimal // −ave_win / ave_loss

	Expectancy *decimal.Decimal // kỳ vọng $ mỗi lệnh

	MaxDrawdown    decimal.Decimal
	MaxDDPct       *decimal.Decimal // âm
	RecoveryFactor *decimal.Decimal

	CurrentBalance decimal.Decimal
}

// ComputeKPI tính chỉ số trên tập ĐÃ LỌC (`filtered`), trừ CurrentBalance.
//
// `all` là tập CHƯA lọc và chỉ phục vụ CurrentBalance. Số dư tài khoản là số
// dư thật, không đổi theo việc người dùng đang xem tháng nào — ngoại lệ của
// quy tắc 8 trong CLAUDE.md, đúng như Excel (`Dashboard!V3` VLOOKUP thẳng vào
// `Settings`, không đi qua pivot).
//
// Hai tham số cùng kiểu nên đảo chỗ vẫn biên dịch và vẫn ra số — đó là lý do
// TestComputeKPICurrentBalanceKhongChiuBoLoc assert cả CurrentBalance lẫn
// NetProfit: đảo chỗ sẽ làm đúng một trong hai sai.
//
// Các trường lũy kế bên trong rows (CumByTrade, Drawdown) phải được tính từ
// dãy đầy đủ trước đó — xem quy tắc filter ở §7.1 của spec.
func ComputeKPI(filtered, all []Enriched, acc domain.Account, flows []domain.CashFlow) KPI {
	k := KPI{
		TotalWin:  decimal.Zero,
		TotalLoss: decimal.Zero,
		TotalFees: decimal.Zero,
		OneR:      acc.OneR(),
	}

	var maxPeak, maxDD decimal.Decimal
	var biggestWin, biggestLoss *decimal.Decimal

	for _, r := range filtered {
		k.TotalFees = k.TotalFees.Add(r.Trade.Fee)

		switch {
		case r.Net.IsPositive():
			k.TotalWin = k.TotalWin.Add(r.Net)
			k.WinCount++
		case r.Net.IsNegative():
			k.TotalLoss = k.TotalLoss.Add(r.Net)
			k.LossCount++
		}
		// net = 0: không cộng vào đâu cả, không đếm.

		if biggestWin == nil || r.Net.GreaterThan(*biggestWin) {
			v := r.Net
			biggestWin = &v
		}
		if biggestLoss == nil || r.Net.LessThan(*biggestLoss) {
			v := r.Net
			biggestLoss = &v
		}
		if r.Drawdown.GreaterThan(maxDD) {
			maxDD = r.Drawdown
		}
		if r.RunningPeak.GreaterThan(maxPeak) {
			maxPeak = r.RunningPeak
		}
	}

	k.NetProfit = k.TotalWin.Add(k.TotalLoss)
	k.TotalTrades = k.WinCount + k.LossCount
	k.BiggestWinner = biggestWin
	k.BiggestLoser = biggestLoss
	k.MaxDrawdown = maxDD

	if !acc.InitialBalance.IsZero() {
		k.NetReturnPct = ptrDec(k.NetProfit.Div(acc.InitialBalance))
	}
	if !k.TotalLoss.IsZero() {
		k.ProfitFactor = ptrDec(k.TotalWin.Neg().Div(k.TotalLoss))
	}
	if k.TotalTrades > 0 {
		k.WinPct = ptrDec(decimal.NewFromInt(int64(k.WinCount)).Div(decimal.NewFromInt(int64(k.TotalTrades))))
	}
	if k.WinCount > 0 {
		k.AveWin = ptrDec(k.TotalWin.Div(decimal.NewFromInt(int64(k.WinCount))))
	}
	if k.LossCount > 0 {
		k.AveLoss = ptrDec(k.TotalLoss.Div(decimal.NewFromInt(int64(k.LossCount))))
	}
	if !k.OneR.IsZero() {
		if biggestWin != nil {
			k.BiggestRWin = ptrDec(biggestWin.Div(k.OneR))
		}
		if biggestLoss != nil {
			k.BiggestRLoss = ptrDec(biggestLoss.Div(k.OneR))
		}
	}
	if k.AveWin != nil && k.AveLoss != nil && !k.AveLoss.IsZero() {
		k.RRActual = ptrDec(k.AveWin.Neg().Div(*k.AveLoss))
	}
	// expectancy = win_pct × ave_win + (1 − win_pct) × ave_loss (plan §4). Đây
	// là bản chuyển từ ô Excel, nơi toán hạng để trống được tính là 0: toàn
	// thắng (win_pct = 1) thì số hạng ave_loss triệt tiêu dù ave_loss là nil,
	// và ngược lại. Chỉ nil khi không có lệnh nào được đếm (win_pct chính nó nil).
	if k.WinPct != nil {
		aveWin := decimal.Zero
		if k.AveWin != nil {
			aveWin = *k.AveWin
		}
		aveLoss := decimal.Zero
		if k.AveLoss != nil {
			aveLoss = *k.AveLoss
		}
		win := k.WinPct.Mul(aveWin)
		loss := decimal.NewFromInt(1).Sub(*k.WinPct).Mul(aveLoss)
		k.Expectancy = ptrDec(win.Add(loss))
	}
	// Mẫu số là đỉnh equity tuyệt đối: đỉnh lãi lũy kế cộng vốn ban đầu.
	if denom := maxPeak.Add(acc.InitialBalance); !denom.IsZero() {
		k.MaxDDPct = ptrDec(maxDD.Neg().Div(denom))
	}
	if !maxDD.IsZero() {
		k.RecoveryFactor = ptrDec(k.NetProfit.Div(maxDD))
	}

	// CỐ Ý không dùng k.NetProfit: nó là lãi của tập đã lọc.
	netAll := decimal.Zero
	for _, r := range all {
		netAll = netAll.Add(r.Net)
	}
	k.CurrentBalance = acc.InitialBalance.Add(netAll).Add(netCashFlow(flows))
	return k
}

func netCashFlow(flows []domain.CashFlow) decimal.Decimal {
	total := decimal.Zero
	for _, f := range flows {
		if f.Type == "withdraw" {
			total = total.Sub(f.Amount)
			continue
		}
		total = total.Add(f.Amount)
	}
	return total
}

func ptrDec(d decimal.Decimal) *decimal.Decimal { return &d }
