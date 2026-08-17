package metrics

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// goldenAccount và goldenTrades tái hiện fixture ở trading-journal-plan.md §7.
// entered_at đặt lúc 12:00 giờ VN để `day` khớp đúng cột "day" của bảng gốc.
func goldenAccount() domain.Account {
	return domain.Account{
		ID:             1,
		Code:           "ACC1",
		InitialBalance: dec("5000"),
		RiskPerTrade:   dec("0.01"),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

func vnNoon(t *testing.T, date string) time.Time {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	parsed, err := time.ParseInLocation("2006-01-02 15:04", date+" 12:00", vn)
	require.NoError(t, err)
	return parsed.UTC()
}

func ptr(s string) *decimal.Decimal {
	d := dec(s)
	return &d
}

func goldenTrades(t *testing.T) []domain.Trade {
	t.Helper()
	return []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("100"), ProfitTheory: ptr("50"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-09"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("-50"), ProfitTheory: ptr("100"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-10"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("100"), ProfitTheory: ptr("-50"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-11"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("200"), ProfitTheory: nil, Fee: dec("0")},
	}
}

func TestEnrichGoldenFixturePerTrade(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)
	require.Len(t, rows, 4)

	want := []struct {
		net         string
		winLoss     int
		cumByTrade  string
		cumByDay    string
		cumTheory   string
		runningPeak string
		drawdown    string
		weekday     string
	}{
		{"100", 1, "100", "50", "50", "100", "0", "Tue"},
		{"-50", 0, "50", "50", "150", "100", "50", "Tue"},
		{"100", 1, "150", "150", "100", "150", "0", "Wed"},
		{"200", 1, "350", "350", "100", "350", "0", "Thu"},
	}

	for i, w := range want {
		got := rows[i]
		require.True(t, got.Net.Equal(dec(w.net)), "dòng %d Net = %s, muốn %s", i+1, got.Net, w.net)
		require.Equal(t, w.winLoss, got.WinLoss, "dòng %d WinLoss", i+1)
		require.True(t, got.CumByTrade.Equal(dec(w.cumByTrade)), "dòng %d CumByTrade = %s, muốn %s", i+1, got.CumByTrade, w.cumByTrade)
		require.True(t, got.CumByDay.Equal(dec(w.cumByDay)), "dòng %d CumByDay = %s, muốn %s", i+1, got.CumByDay, w.cumByDay)
		require.True(t, got.CumTheory.Equal(dec(w.cumTheory)), "dòng %d CumTheory = %s, muốn %s", i+1, got.CumTheory, w.cumTheory)
		require.True(t, got.RunningPeak.Equal(dec(w.runningPeak)), "dòng %d RunningPeak = %s, muốn %s", i+1, got.RunningPeak, w.runningPeak)
		require.True(t, got.Drawdown.Equal(dec(w.drawdown)), "dòng %d Drawdown = %s, muốn %s", i+1, got.Drawdown, w.drawdown)
		require.Equal(t, w.weekday, got.Weekday, "dòng %d Weekday", i+1)
		require.Nil(t, got.ScoreTotal, "dòng %d chưa chấm điểm", i+1)
		require.Equal(t, domain.ClassNotEvaluated, got.TradeClass, "dòng %d", i+1)
	}
}

func TestEnrichRunningPeakSanTaiKhongKhiThuaNgayLenhDau(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("-100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("200"), Fee: dec("0")},
	}

	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	// Đỉnh bị sàn tại 0, nên drawdown phản ánh mức âm so với mốc 0.
	require.True(t, rows[0].RunningPeak.Equal(dec("0")))
	require.True(t, rows[0].Drawdown.Equal(dec("100")))
	require.True(t, rows[1].RunningPeak.Equal(dec("0")))
	require.True(t, rows[1].Drawdown.Equal(dec("150")))
	require.True(t, rows[2].CumByTrade.Equal(dec("50")))
	require.True(t, rows[2].RunningPeak.Equal(dec("50")))
	require.True(t, rows[2].Drawdown.Equal(dec("0")))
}

func TestEnrichSapXepTheoSTTDuKhiDauVaoLonXon(t *testing.T) {
	acc := goldenAccount()
	in := goldenTrades(t)
	shuffled := []domain.Trade{in[2], in[0], in[3], in[1]}

	rows, err := Enrich(shuffled, acc)
	require.NoError(t, err)

	require.Equal(t, []int{1, 2, 3, 4}, []int{rows[0].Trade.STT, rows[1].Trade.STT, rows[2].Trade.STT, rows[3].Trade.STT})
	require.True(t, rows[3].CumByTrade.Equal(dec("350")))
}

func TestEnrichCumByDayGiongNhauChoMoiLenhTrongCungNgay(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)

	require.Equal(t, rows[0].Day, rows[1].Day)
	require.True(t, rows[0].CumByDay.Equal(rows[1].CumByDay))
}

func TestEnrichProfitTheoryNilDongGopKhong(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)
	require.True(t, rows[3].CumTheory.Equal(rows[2].CumTheory), "lệnh 4 để trống profit_theory nên cum_theory không đổi")
}

func TestEnrichChamDiemDayDu(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{{
		STT:            1,
		EnteredAt:      vnNoon(t, "2026-06-09"),
		Profit:         dec("100"),
		Fee:            dec("0"),
		EntryQuality:   domain.EntryPlanned,
		InTradeQuality: domain.InTradeFollowed,
		ExitQuality:    domain.ExitHitTP,
		Psychology:     domain.PsychNoError,
	}}

	rows, err := Enrich(trades, acc)
	require.NoError(t, err)
	require.NotNil(t, rows[0].ScoreTotal)
	require.Equal(t, 100, *rows[0].ScoreTotal)
	require.Equal(t, domain.ClassPlanned, rows[0].TradeClass)
	require.Equal(t, 25, rows[0].ScoreEntry)
	require.Equal(t, 25, rows[0].ScoreExit)
	require.Equal(t, 25, rows[0].ScoreInTrade)
	require.Equal(t, 25, rows[0].ScorePsych)
}

func TestEnrichTimezoneSaiTraLoi(t *testing.T) {
	acc := goldenAccount()
	acc.Timezone = "Asia/Khong_Ton_Tai"

	_, err := Enrich(goldenTrades(t), acc)
	require.Error(t, err)
}

func TestEnrichTimezoneRongMacDinhVeGioVN(t *testing.T) {
	acc := goldenAccount()
	acc.Timezone = ""

	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)
	require.Equal(t, "2026-06-09", rows[0].Day)
}

// TestEnrichEntryExitVolumeNilKhongPanic là regression: entry/exit/volume là
// NUMERIC nullable trong migration 0001 (lệnh nhập tay có thể để trống), nên
// domain.Trade dùng *decimal.Decimal cho ba trường này. Enrich không đọc
// entry/exit/volume (Net = profit − fee) nên nil phải trôi qua an toàn.
func TestEnrichEntryExitVolumeNilKhongPanic(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{{
		STT:       1,
		EnteredAt: vnNoon(t, "2026-06-09"),
		Symbol:    "xau",
		Direction: domain.DirectionLong,
		Entry:     nil,
		Exit:      nil,
		Volume:    nil,
		Profit:    dec("100"),
		Fee:       dec("10"),
	}}

	require.NotPanics(t, func() {
		rows, err := Enrich(trades, acc)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		require.True(t, rows[0].Net.Equal(dec("90")), "Net chỉ phụ thuộc profit/fee, không đọc entry/exit/volume")
		require.Nil(t, rows[0].Trade.Entry)
		require.Nil(t, rows[0].Trade.Exit)
		require.Nil(t, rows[0].Trade.Volume)
	})
}

// TestEnrichHaiAccountXenKeTraLoi là test bắt buộc theo spec §9 dòng 408 và
// trading-journal-plan.md:297 ("cô lập account: hai account xen kẽ,
// cum_by_trade không rò rỉ chéo"). Enrich không tự lọc theo AccountID — nếu
// đưa lệnh của nhiều account trộn lẫn vào, nó phải báo lỗi thay vì âm thầm
// cộng dồn equity sai giữa hai account.
func TestEnrichHaiAccountXenKeTraLoi(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, AccountID: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, AccountID: 2, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, AccountID: 1, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("100"), Fee: dec("0")},
		{STT: 4, AccountID: 2, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("200"), Fee: dec("0")},
	}

	rows, err := Enrich(trades, acc)
	require.Error(t, err)
	require.Nil(t, rows)
}

func TestEnrichCungMotAccountKhongLoi(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, AccountID: 7, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, AccountID: 7, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("100"), Fee: dec("0")},
	}

	rows, err := Enrich(trades, acc)
	require.NoError(t, err)
	require.Len(t, rows, 2)
}

func TestEnrichDanhSachRong(t *testing.T) {
	rows, err := Enrich(nil, goldenAccount())
	require.NoError(t, err)
	require.Empty(t, rows)
}
