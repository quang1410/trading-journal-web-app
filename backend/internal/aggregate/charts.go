package aggregate

import (
	"sort"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// HeatmapCell là một ô ngày trong lịch nhiệt.
type HeatmapCell struct {
	Day    string          `json:"day"`
	SumNet decimal.Decimal `json:"sum_net"`
	Count  int             `json:"count"`
}

// HeatmapMonth gom các ô theo tháng. Backend chỉ trả dữ liệu theo ngày;
// việc dựng lưới 7 cột là chuyện của frontend.
type HeatmapMonth struct {
	Month string        `json:"month"` // "06/2026"
	Cells []HeatmapCell `json:"cells"` // sắp theo ngày tăng dần
}

// ScoreSummary là điểm trung bình, chỉ tính trên lệnh ĐÃ CHẤM. Mục tiêu >= 80.
type ScoreSummary struct {
	ScoredCount   int              `json:"scored_count"`
	AvgScoreTotal *decimal.Decimal `json:"avg_score_total"`
}

// Radar là bốn trục điểm trung bình; trục nào thấp là điểm yếu.
type Radar struct {
	AvgEntry   *decimal.Decimal `json:"avg_entry"`
	AvgInTrade *decimal.Decimal `json:"avg_in_trade"`
	AvgExit    *decimal.Decimal `json:"avg_exit"`
	AvgPsych   *decimal.Decimal `json:"avg_psych"`
}

// TheoryPoint so sánh đường lãi lý thuyết với đường lãi thực tế theo STT.
type TheoryPoint struct {
	STT        int             `json:"stt"`
	CumTheory  decimal.Decimal `json:"cum_theory"`
	CumByTrade decimal.Decimal `json:"cum_by_trade"`
}

// Charts gộp cả 12 nhóm biểu đồ của §5 vào một response, vì tất cả đều xuất
// phát từ cùng một lần load danh sách lệnh.
type Charts struct {
	BySetup     []Pivot       `json:"by_setup"`
	BySymbol    []Pivot       `json:"by_symbol"`
	ByTimeframe []Pivot       `json:"by_timeframe"`
	ByDirection []Pivot       `json:"by_direction"`
	ByWeekday   []WeekdayStat `json:"by_weekday"`
	ByWeek      []Pivot       `json:"by_week"`
	ByDay       []DayStat     `json:"by_day"`

	Heatmap        []HeatmapMonth `json:"heatmap"`
	RDistribution  []RBucket      `json:"r_distribution"`
	Score          ScoreSummary   `json:"score"`
	Radar          Radar          `json:"radar"`
	TheoryVsActual []TheoryPoint  `json:"theory_vs_actual"`

	LongestWinStreak  int `json:"longest_win_streak"`
	LongestLossStreak int `json:"longest_loss_streak"`
}

// Heatmap gom lệnh thành lưới lịch theo tháng rồi theo ngày.
func Heatmap(rows []metrics.Enriched) []HeatmapMonth {
	type key struct{ month, day string }
	cells := map[key]HeatmapCell{}

	for _, r := range rows {
		k := key{month: r.Month, day: r.Day}
		c := cells[k]
		c.Day = r.Day
		c.SumNet = c.SumNet.Add(r.Net)
		c.Count++
		cells[k] = c
	}

	byMonth := map[string][]HeatmapCell{}
	for k, c := range cells {
		byMonth[k.month] = append(byMonth[k.month], c)
	}

	months := make([]HeatmapMonth, 0, len(byMonth))
	for m, cs := range byMonth {
		sort.Slice(cs, func(i, j int) bool { return cs[i].Day < cs[j].Day })
		months = append(months, HeatmapMonth{Month: m, Cells: cs})
	}
	// Nhãn tháng là MM/yyyy nên sort chuỗi sẽ sai thứ tự năm; sort theo ngày
	// đầu tiên của tháng, vốn đã ở dạng YYYY-MM-DD.
	sort.Slice(months, func(i, j int) bool {
		return months[i].Cells[0].Day < months[j].Cells[0].Day
	})
	return months
}

// ScoreAvg tính điểm trung bình trên các lệnh đã chấm (§5.10).
func ScoreAvg(rows []metrics.Enriched) ScoreSummary {
	sum := 0
	count := 0
	for _, r := range rows {
		if r.ScoreTotal == nil {
			continue
		}
		sum += *r.ScoreTotal
		count++
	}
	if count == 0 {
		return ScoreSummary{}
	}
	avg := decimal.NewFromInt(int64(sum)).Div(decimal.NewFromInt(int64(count)))
	return ScoreSummary{ScoredCount: count, AvgScoreTotal: &avg}
}

// RadarAvg tính trung bình bốn trục, chỉ trên lệnh đã chấm (§5.11).
func RadarAvg(rows []metrics.Enriched) Radar {
	var entry, inTrade, exit, psych int
	count := 0
	for _, r := range rows {
		if r.ScoreTotal == nil {
			continue
		}
		entry += r.ScoreEntry
		inTrade += r.ScoreInTrade
		exit += r.ScoreExit
		psych += r.ScorePsych
		count++
	}
	if count == 0 {
		return Radar{}
	}
	n := decimal.NewFromInt(int64(count))
	avg := func(total int) *decimal.Decimal {
		v := decimal.NewFromInt(int64(total)).Div(n)
		return &v
	}
	return Radar{
		AvgEntry:   avg(entry),
		AvgInTrade: avg(inTrade),
		AvgExit:    avg(exit),
		AvgPsych:   avg(psych),
	}
}

// TheoryVsActual trả hai chuỗi theo STT để vẽ chồng lên nhau (§5.12).
func TheoryVsActual(rows []metrics.Enriched) []TheoryPoint {
	points := make([]TheoryPoint, 0, len(rows))
	for _, r := range rows {
		points = append(points, TheoryPoint{
			STT:        r.Trade.STT,
			CumTheory:  r.CumTheory,
			CumByTrade: r.CumByTrade,
		})
	}
	return points
}

// All dựng toàn bộ dữ liệu biểu đồ trong một lượt.
//
// all và filtered CÙNG một account, all là mọi lệnh chưa xoá theo thứ tự stt,
// filtered là tập con sau khi áp filter hiển thị (from/to, setup, ...) —
// filtered có thể bằng all khi không filter gì.
//
// Theo CLAUDE.md quy tắc 8: streak (LongestWinStreak/LongestLossStreak) nằm
// trong nhóm luôn tính trên TOÀN BỘ lệnh của account, nên dùng all. Khác với
// cum_by_trade/running_peak/drawdown — vốn được nướng sẵn vào Enriched lúc
// Enrich chạy trên toàn bộ lệnh nên tự "sống sót" qua filter — streak được
// TÍNH LẠI mỗi lần từ slice truyền vào, nên phải nhận đúng all ở đây, không
// thể suy ra được từ một slice duy nhất đã bị lọc. Mọi aggregation §5 còn lại
// tính trên filtered.
func All(all, filtered []metrics.Enriched, account domain.Account) Charts {
	win, loss := Streaks(all)
	return Charts{
		BySetup:        BySetup(filtered),
		BySymbol:       BySymbol(filtered),
		ByTimeframe:    ByTimeframe(filtered),
		ByDirection:    ByDirection(filtered),
		ByWeekday:      ByWeekday(filtered),
		ByWeek:         ByWeek(filtered),
		ByDay:          ByDay(filtered),
		Heatmap:        Heatmap(filtered),
		RDistribution:  RDistribution(filtered, account.OneR()),
		Score:          ScoreAvg(filtered),
		Radar:          RadarAvg(filtered),
		TheoryVsActual: TheoryVsActual(filtered),

		LongestWinStreak:  win,
		LongestLossStreak: loss,
	}
}
