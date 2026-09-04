package aggregate

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

func TestHeatmapGroupsByMonthAndDay(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"),
		vnTrade(t, 3, "2026-07-01", "xau", "FVG", "M15", domain.DirectionLong, "60"),
	})

	months := Heatmap(rows)

	require.Len(t, months, 2)
	require.Equal(t, "06/2026", months[0].Month)
	require.Len(t, months[0].Cells, 1)
	require.Equal(t, "2026-06-09", months[0].Cells[0].Day)
	require.True(t, months[0].Cells[0].SumNet.Equal(dec("60")))
	require.Equal(t, 2, months[0].Cells[0].Count)
	require.Equal(t, "07/2026", months[1].Month)
}

// TestHeatmapSortsCorrectlyAcrossNewYear gia cố sort tháng ở charts.go (Cells[0].Day
// làm khoá sort) với dữ liệu VẮT QUA NĂM. TestHeatmapGroupsByMonthAndDay chỉ
// dùng 06/2026 và 07/2026 — cùng năm, không thể phân biệt sort đúng (theo
// ngày) với sort sai kiểu lexical trên nhãn "MM/yyyy" (vì "06" < "07" đúng cả
// hai cách). "12/2025" so với "01/2026" thì lexical trên nhãn sai ("01" <
// "12") trong khi theo thời gian 12/2025 phải đứng trước.
func TestHeatmapSortsCorrectlyAcrossNewYear(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2025-12-20", "xau", "FVG", "M15", domain.DirectionLong, "10"),
		vnTrade(t, 2, "2026-01-05", "xau", "FVG", "M15", domain.DirectionLong, "10"),
	})

	months := Heatmap(rows)

	require.Len(t, months, 2)
	require.Equal(t, "12/2025", months[0].Month, "12/2025 phải đứng trước 01/2026 dù nhãn 'MM/yyyy' sort lexical sai thứ tự")
	require.Equal(t, "01/2026", months[1].Month)
}

func TestScoreSummaryOnlyCountsScoredTrades(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		{STT: 1, EnteredAt: vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryPlanned, InTradeQuality: domain.InTradeFollowed,
			ExitQuality: domain.ExitHitTP, Psychology: domain.PsychNoError}, // 100
		{STT: 2, EnteredAt: vnTrade(t, 2, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryTooEarly, InTradeQuality: domain.InTradeMovedTP,
			ExitQuality: domain.ExitTechnical, Psychology: domain.PsychFear}, // 10+10+15+5 = 40
		{STT: 3, EnteredAt: vnTrade(t, 3, "2026-06-11", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0")}, // chưa chấm
	})

	s := ScoreAvg(rows)

	require.Equal(t, 2, s.ScoredCount)
	require.NotNil(t, s.AvgScoreTotal)
	require.Equal(t, "70", s.AvgScoreTotal.Round(4).String(), "(100+40)/2, lệnh chưa chấm bị loại")
}

func TestScoreSummaryNoScoredTrades(t *testing.T) {
	rows := enrichProfits(t, "100", "-50")

	s := ScoreAvg(rows)

	require.Equal(t, 0, s.ScoredCount)
	require.Nil(t, s.AvgScoreTotal)
}

func TestRadarExcludesUnscoredTrades(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		{STT: 1, EnteredAt: vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryPlanned, InTradeQuality: domain.InTradeFollowed,
			ExitQuality: domain.ExitHitTP, Psychology: domain.PsychNoError},
		{STT: 2, EnteredAt: vnTrade(t, 2, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0")}, // chưa chấm, phải bị loại
	})

	r := RadarAvg(rows)

	require.NotNil(t, r.AvgEntry)
	require.Equal(t, "25", r.AvgEntry.Round(4).String())
	require.Equal(t, "25", r.AvgPsych.Round(4).String())
}

func TestTheoryVsActual(t *testing.T) {
	rows := enrichCustom(t, goldenTradesForCharts(t))

	points := TheoryVsActual(rows)

	require.Len(t, points, 4)
	require.Equal(t, 1, points[0].STT)
	require.True(t, points[0].CumTheory.Equal(dec("50")))
	require.True(t, points[0].CumByTrade.Equal(dec("100")))
	require.True(t, points[3].CumTheory.Equal(dec("100")))
	require.True(t, points[3].CumByTrade.Equal(dec("350")))
}

func TestAllReturnsAllTwelveGroups(t *testing.T) {
	rows := enrichCustom(t, goldenTradesForCharts(t))

	charts := All(rows, rows, testAccount())

	require.NotEmpty(t, charts.BySetup)
	require.NotEmpty(t, charts.BySymbol)
	require.NotEmpty(t, charts.ByTimeframe)
	require.Len(t, charts.ByDirection, 2)
	require.Len(t, charts.ByWeekday, 7)
	require.NotEmpty(t, charts.ByWeek)
	require.NotEmpty(t, charts.ByDay)
	require.NotEmpty(t, charts.Heatmap)
	require.Len(t, charts.RDistribution, 22)
	require.Equal(t, 0, charts.Score.ScoredCount, "fixture §7 chưa chấm điểm lệnh nào")
	require.Nil(t, charts.Radar.AvgEntry, "không có lệnh đã chấm thì radar để trống")
	require.Len(t, charts.TheoryVsActual, 4)
	require.Equal(t, 2, charts.LongestWinStreak)
	require.Equal(t, 1, charts.LongestLossStreak)
}

func TestAllWithEmptyListDoesNotPanic(t *testing.T) {
	charts := All(nil, nil, testAccount())

	require.Len(t, charts.ByDirection, 2)
	require.Len(t, charts.ByWeekday, 7)
	require.Len(t, charts.RDistribution, 22)
	require.Equal(t, 0, charts.LongestWinStreak)
	require.Nil(t, charts.Score.AvgScoreTotal)
}

// TestAllStreakOnAllPivotOnFiltered là regression cho CLAUDE.md
// quy tắc 8: streak luôn tính trên TOÀN BỘ lệnh của account theo stt, filter
// chỉ ảnh hưởng phần hiển thị (pivot/aggregation §5). Nếu All lỡ tính streak
// trên filtered, test này đỏ.
func TestAllStreakOnAllPivotOnFiltered(t *testing.T) {
	all := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "A", "M15", domain.DirectionLong, "100"), // win
		vnTrade(t, 2, "2026-06-10", "xau", "A", "M15", domain.DirectionLong, "100"), // win -> win streak 2
		vnTrade(t, 3, "2026-06-11", "xau", "B", "M15", domain.DirectionLong, "-50"), // loss
		vnTrade(t, 4, "2026-06-12", "xau", "B", "M15", domain.DirectionLong, "-50"), // loss
		vnTrade(t, 5, "2026-06-13", "xau", "B", "M15", domain.DirectionLong, "-50"), // loss -> loss streak 3
	})
	// filtered chỉ giữ lại lệnh thứ 3 (một lệnh thua đơn lẻ, setup B).
	filtered := []metrics.Enriched{all[2]}

	charts := All(all, filtered, testAccount())

	require.Equal(t, 2, charts.LongestWinStreak, "streak phải phản ánh TOÀN BỘ all, không phải filtered")
	require.Equal(t, 3, charts.LongestLossStreak, "streak phải phản ánh TOÀN BỘ all, không phải filtered")

	require.Len(t, charts.BySetup, 1, "pivot phải chỉ thấy setup của filtered")
	require.Equal(t, "B", charts.BySetup[0].Key)
	require.Equal(t, 1, charts.BySetup[0].Count, "pivot đếm trên filtered, không phải all")
}

// goldenTradesForCharts là fixture §7 với setup/symbol/timeframe điền sẵn.
func goldenTradesForCharts(t *testing.T) []domain.Trade {
	t.Helper()
	theory := []string{"50", "100", "-50", ""}
	profits := []string{"100", "-50", "100", "200"}
	days := []string{"2026-06-09", "2026-06-09", "2026-06-10", "2026-06-11"}

	trades := make([]domain.Trade, 0, 4)
	for i := range profits {
		tr := vnTrade(t, i+1, days[i], "xau", "FVG", "M15", domain.DirectionLong, profits[i])
		if theory[i] != "" {
			v := dec(theory[i])
			tr.ProfitTheory = &v
		}
		trades = append(trades, tr)
	}
	return trades
}

// TestAllJoinsFourBlocksFromFilteredSet ghim đúng thứ dễ sai nhất ở All: bốn khối
// mới phải đọc tập ĐÃ LỌC. Hai tham số all/filtered cùng kiểu nên nhầm chỗ vẫn
// biên dịch — chỉ test mới bắt được.
func TestAllJoinsFourBlocksFromFilteredSet(t *testing.T) {
	all := enrichProfits(t, "100", "-50", "200")
	filtered := all[:2] // như đã lọc bỏ lệnh cuối

	c := All(all, filtered, testAccount())

	require.Equal(t, 1, c.WinLoss.WinCount, "chỉ 1 lệnh thắng trong tập lọc, không phải 2")
	require.Equal(t, 1, c.WinLoss.LossCount)
	require.Len(t, c.ByTradeClass, 5)
	require.NotNil(t, c.Execution.PlannedPct)
	require.True(t, c.TheorySummary.Actual.Equal(c.TheoryVsActual[len(c.TheoryVsActual)-1].CumByTrade),
		"tile phải bằng điểm cuối của chính chuỗi được trả ra")
}
