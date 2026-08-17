package metrics

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// requireDec so sánh sau khi làm tròn, dùng cho các giá trị chia không hết
// như ave_win = 400/3.
func requireDec(t *testing.T, got *decimal.Decimal, want string, places int32) {
	t.Helper()
	require.NotNil(t, got, "muốn %s nhưng nhận nil", want)
	require.Equal(t, want, got.Round(places).String())
}

func TestComputeKPIGoldenFixture(t *testing.T) {
	acc := goldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)

	require.True(t, kpi.TotalWin.Equal(dec("400")))
	require.True(t, kpi.TotalLoss.Equal(dec("-50")))
	require.True(t, kpi.NetProfit.Equal(dec("350")))
	requireDec(t, kpi.NetReturnPct, "0.07", 4)
	require.True(t, kpi.TotalFees.Equal(dec("0")))
	requireDec(t, kpi.ProfitFactor, "8", 4)
	require.Equal(t, 3, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.Equal(t, 4, kpi.TotalTrades)
	requireDec(t, kpi.WinPct, "0.75", 4)
	requireDec(t, kpi.AveWin, "133.3333", 4)
	requireDec(t, kpi.AveLoss, "-50", 4)
	requireDec(t, kpi.BiggestWinner, "200", 4)
	requireDec(t, kpi.BiggestLoser, "-50", 4)
	require.True(t, kpi.OneR.Equal(dec("50")))
	requireDec(t, kpi.BiggestRWin, "4", 4)
	requireDec(t, kpi.BiggestRLoss, "-1", 4)
	requireDec(t, kpi.RRActual, "2.6667", 4)
	requireDec(t, kpi.Expectancy, "87.5", 4)
	require.True(t, kpi.MaxDrawdown.Equal(dec("50")))
	requireDec(t, kpi.MaxDDPct, "-0.009346", 6)
	requireDec(t, kpi.RecoveryFactor, "7", 4)
	require.True(t, kpi.CurrentBalance.Equal(dec("5350")))
}

func TestComputeKPIKhongCoLenhNao(t *testing.T) {
	acc := goldenAccount()
	kpi := ComputeKPI(nil, acc, nil)

	require.True(t, kpi.TotalWin.Equal(decimal.Zero))
	require.True(t, kpi.TotalLoss.Equal(decimal.Zero))
	require.True(t, kpi.NetProfit.Equal(decimal.Zero))
	require.Equal(t, 0, kpi.TotalTrades)
	require.Nil(t, kpi.ProfitFactor)
	require.Nil(t, kpi.WinPct)
	require.Nil(t, kpi.AveWin)
	require.Nil(t, kpi.AveLoss)
	require.Nil(t, kpi.BiggestWinner)
	require.Nil(t, kpi.BiggestLoser)
	require.Nil(t, kpi.Expectancy)
	require.Nil(t, kpi.RecoveryFactor)
	require.True(t, kpi.CurrentBalance.Equal(dec("5000")))
}

func TestComputeKPIChuaCoLenhThuaThiProfitFactorNil(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("50"), Fee: dec("0")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Nil(t, kpi.ProfitFactor, "total_loss = 0 thì không chia được")
	require.Nil(t, kpi.RecoveryFactor, "max_drawdown = 0 thì không chia được")
	require.Nil(t, kpi.AveLoss)
	require.Nil(t, kpi.RRActual)
}

func TestComputeKPILenhHoaKhongVaoWinLossCount(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("0"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("-40"), Fee: dec("0")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Equal(t, 1, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.Equal(t, 2, kpi.TotalTrades, "lệnh net = 0 bị loại khỏi total_trades")
	require.True(t, kpi.NetProfit.Equal(dec("60")))
}

func TestComputeKPIRiskBangKhongThiChiSoRNil(t *testing.T) {
	acc := goldenAccount()
	acc.RiskPerTrade = dec("0")
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.True(t, kpi.OneR.Equal(decimal.Zero))
	require.Nil(t, kpi.BiggestRWin)
	require.Nil(t, kpi.BiggestRLoss)
}

func TestComputeKPIPhiAnHetLaiThanhLenhThua(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("10"), Fee: dec("12")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Equal(t, 0, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.True(t, kpi.TotalLoss.Equal(dec("-2")))
}

func TestComputeKPICurrentBalanceCongNapTruRut(t *testing.T) {
	acc := goldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	flows := []domain.CashFlow{
		{Amount: dec("1000"), Type: "deposit"},
		{Amount: dec("300"), Type: "withdraw"},
	}

	kpi := ComputeKPI(rows, acc, flows)
	require.True(t, kpi.CurrentBalance.Equal(dec("6050")), "5000 + 350 + 1000 − 300")
}

func TestComputeKPIDoiThuTuKhongDoiTongNhungDoiDrawdown(t *testing.T) {
	acc := goldenAccount()

	// Cùng một tập lãi lỗ {100, −50, −50, 200}, chỉ khác thứ tự.
	// A: hai lệnh thua liên tiếp -> equity 100 → 50 → 0, drawdown chạm 100.
	orderA := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-12"), Profit: dec("200"), Fee: dec("0")},
	}
	// B: hai lệnh thua bị tách ra -> equity 100 → 50 → 250 → 200, drawdown tối đa chỉ 50.
	orderB := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("200"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-12"), Profit: dec("-50"), Fee: dec("0")},
	}

	rowsA, err := Enrich(orderA, acc)
	require.NoError(t, err)
	rowsB, err := Enrich(orderB, acc)
	require.NoError(t, err)

	kpiA := ComputeKPI(rowsA, acc, nil)
	kpiB := ComputeKPI(rowsB, acc, nil)

	require.True(t, kpiA.NetProfit.Equal(kpiB.NetProfit), "tổng không đổi khi đổi thứ tự")
	require.Equal(t, kpiA.TotalTrades, kpiB.TotalTrades)
	require.True(t, kpiA.TotalWin.Equal(kpiB.TotalWin))

	require.True(t, kpiA.MaxDrawdown.Equal(dec("100")), "hai lệnh thua liên tiếp")
	require.True(t, kpiB.MaxDrawdown.Equal(dec("50")), "cùng dữ liệu, thứ tự khác, drawdown khác")
}
