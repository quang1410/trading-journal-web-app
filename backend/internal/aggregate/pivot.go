package aggregate

import (
	"sort"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// Pivot là một nhóm trong biểu đồ group-by (§5).
// Count đếm mọi lệnh trong nhóm kể cả net = 0; WinCount chỉ đếm net > 0.
type Pivot struct {
	Key      string          `json:"key"`
	Count    int             `json:"count"`
	WinCount int             `json:"win_count"`
	SumNet   decimal.Decimal `json:"sum_net"`
	AveNet   decimal.Decimal `json:"ave_net"`
	WinRate  decimal.Decimal `json:"win_rate"` // 0..1
}

// WeekdayStat bổ sung phần lãi và phần lỗ tách riêng để vẽ cột xanh/đỏ.
type WeekdayStat struct {
	Pivot
	ProfitPositive decimal.Decimal `json:"profit_positive"`
	ProfitNegative decimal.Decimal `json:"profit_negative"`
}

// DayStat là một ngày trên biểu đồ P&L theo ngày, kèm điểm của đường lũy kế.
type DayStat struct {
	Day      string          `json:"day"`
	Count    int             `json:"count"`
	SumNet   decimal.Decimal `json:"sum_net"`
	CumByDay decimal.Decimal `json:"cum_by_day"`
}

type acc struct {
	count    int
	winCount int
	sumNet   decimal.Decimal
	positive decimal.Decimal
	negative decimal.Decimal
}

func (a acc) toPivot(key string) Pivot {
	p := Pivot{
		Key:      key,
		Count:    a.count,
		WinCount: a.winCount,
		SumNet:   a.sumNet,
		AveNet:   decimal.Zero,
		WinRate:  decimal.Zero,
	}
	if a.count > 0 {
		n := decimal.NewFromInt(int64(a.count))
		p.AveNet = a.sumNet.Div(n)
		p.WinRate = decimal.NewFromInt(int64(a.winCount)).Div(n)
	}
	return p
}

func groupBy(rows []metrics.Enriched, key func(metrics.Enriched) string) map[string]acc {
	out := map[string]acc{}
	for _, r := range rows {
		k := key(r)
		a := out[k]
		a.count++
		a.sumNet = a.sumNet.Add(r.Net)
		switch {
		case r.Net.IsPositive():
			a.winCount++
			a.positive = a.positive.Add(r.Net)
		case r.Net.IsNegative():
			a.negative = a.negative.Add(r.Net)
		}
		out[k] = a
	}
	return out
}

// topN sắp theo số lệnh giảm dần, hoà thì theo tên tăng dần, rồi cắt n phần tử.
func topN(groups map[string]acc, n int) []Pivot {
	pivots := make([]Pivot, 0, len(groups))
	for k, a := range groups {
		pivots = append(pivots, a.toPivot(k))
	}
	sort.Slice(pivots, func(i, j int) bool {
		if pivots[i].Count != pivots[j].Count {
			return pivots[i].Count > pivots[j].Count
		}
		return pivots[i].Key < pivots[j].Key
	})
	if len(pivots) > n {
		pivots = pivots[:n]
	}
	return pivots
}

// BySetup trả 6 setup nhiều lệnh nhất (§5.1 trong danh sách aggregation).
func BySetup(rows []metrics.Enriched) []Pivot {
	return topN(groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Setup }), 6)
}

// BySymbol trả 6 mã nhiều lệnh nhất.
func BySymbol(rows []metrics.Enriched) []Pivot {
	return topN(groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Symbol }), 6)
}

// ByTimeframe trả các timeframe có xuất hiện, giữ thứ tự M1 → W.
func ByTimeframe(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Timeframe })
	pivots := make([]Pivot, 0, len(groups))
	for _, tf := range domain.Timeframes {
		if a, ok := groups[tf]; ok {
			pivots = append(pivots, a.toPivot(tf))
		}
	}
	return pivots
}

// ByDirection luôn trả đúng hai nhóm Long và Short, kể cả khi một bên chưa có lệnh,
// để biểu đồ so sánh không bị mất cột.
func ByDirection(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Direction })
	return []Pivot{
		groups[domain.DirectionLong].toPivot(domain.DirectionLong),
		groups[domain.DirectionShort].toPivot(domain.DirectionShort),
	}
}

// ByWeekday luôn trả đủ 7 ngày theo thứ tự Mon..Sun.
func ByWeekday(rows []metrics.Enriched) []WeekdayStat {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Weekday })
	stats := make([]WeekdayStat, 0, 7)
	for _, wd := range domain.Weekdays {
		a := groups[wd]
		stats = append(stats, WeekdayStat{
			Pivot:          a.toPivot(wd),
			ProfitPositive: a.positive,
			ProfitNegative: a.negative,
		})
	}
	return stats
}

// ByWeek gom theo nhãn tuần ISO, sắp theo nhãn.
func ByWeek(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Week })
	pivots := make([]Pivot, 0, len(groups))
	for k, a := range groups {
		pivots = append(pivots, a.toPivot(k))
	}
	sort.Slice(pivots, func(i, j int) bool { return pivots[i].Key < pivots[j].Key })
	return pivots
}

// ByDay gom theo ngày, kèm giá trị lũy kế cuối ngày để vẽ đường tăng trưởng.
func ByDay(rows []metrics.Enriched) []DayStat {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Day })

	// CumByDay đã tính sẵn trong Enrich và giống nhau cho mọi lệnh cùng ngày.
	cum := map[string]decimal.Decimal{}
	for _, r := range rows {
		cum[r.Day] = r.CumByDay
	}

	days := make([]DayStat, 0, len(groups))
	for k, a := range groups {
		days = append(days, DayStat{Day: k, Count: a.count, SumNet: a.sumNet, CumByDay: cum[k]})
	}
	sort.Slice(days, func(i, j int) bool { return days[i].Day < days[j].Day })
	return days
}
