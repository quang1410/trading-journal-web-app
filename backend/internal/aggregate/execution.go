package aggregate

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// ExecutionQuality là khối "CHẤT LƯỢNG THỰC THI LỆNH" của dashboard (§5.13).
//
// PlannedPct là con trỏ vì "chưa có lệnh nào" và "0% đúng kế hoạch" là hai
// chuyện khác nhau — frontend hiện "—" cho cái đầu.
type ExecutionQuality struct {
	PlannedPct     *decimal.Decimal `json:"planned_pct"`
	NoSetupCount   int              `json:"no_setup_count"`
	ImpulsiveCount int              `json:"impulsive_count"`
}

// ExecutionQualityOf đếm ba chỉ số chất lượng thực thi trên tập đã lọc.
//
// Mẫu số của PlannedPct là TOÀN BỘ lệnh trong tập, gồm cả lệnh chưa chấm điểm
// — khác với luật "loại lệnh chưa chấm khỏi trung bình" ở §2.5. Excel cộng đủ
// năm hàng U103:U107, và về nghĩa cũng đúng: một lệnh chưa được đánh giá thì
// chưa phải lệnh đúng kế hoạch.
//
// NoSetupCount và ImpulsiveCount là hai chỉ số TÁCH RIÊNG, cố ý. File Excel
// gộp chúng dưới một nhãn sai: tile ghi "Bốc đồng + Trả thù + FOMO" nhưng
// công thức V85 lại đếm lệnh no-setup. Xem §10 của trading-journal-plan.md.
func ExecutionQualityOf(rows []metrics.Enriched) ExecutionQuality {
	out := ExecutionQuality{}
	planned := 0

	for _, r := range rows {
		switch r.TradeClass {
		case domain.ClassPlanned:
			planned++
		case domain.ClassImpulsive, domain.ClassRevenge:
			out.ImpulsiveCount++
		}
		if r.Trade.Setup == domain.DefaultSetup {
			out.NoSetupCount++
		}
	}

	if len(rows) > 0 {
		pct := decimal.NewFromInt(int64(planned)).
			Div(decimal.NewFromInt(int64(len(rows))))
		out.PlannedPct = &pct
	}
	return out
}

// ClassStat là một hàng của bảng phân bố loại lệnh (§5.14), khớp doughnut
// chart2.xml của file gốc.
type ClassStat struct {
	Class  string          `json:"class"`
	Count  int             `json:"count"`
	Pct    decimal.Decimal `json:"pct"` // 0..1
	SumNet decimal.Decimal `json:"sum_net"`
}

// ByTradeClass gom tập đã lọc theo trade_class.
//
// LUÔN trả đủ năm hàng theo đúng thứ tự domain.TradeClasses, kể cả loại không
// có lệnh nào. Doughnut lấy màu theo chỉ số hàng — bỏ hàng rỗng đi thì thêm
// một lệnh "Bốc đồng / FOMO" sẽ đổi màu của "Giao dịch trả thù" ngay trước
// mắt người dùng.
func ByTradeClass(rows []metrics.Enriched) []ClassStat {
	counts := map[string]int{}
	sums := map[string]decimal.Decimal{}
	for _, r := range rows {
		counts[r.TradeClass]++
		sums[r.TradeClass] = sums[r.TradeClass].Add(r.Net)
	}

	total := decimal.NewFromInt(int64(len(rows)))
	out := make([]ClassStat, 0, len(domain.TradeClasses))
	for _, class := range domain.TradeClasses {
		s := ClassStat{
			Class:  class,
			Count:  counts[class],
			SumNet: sums[class],
			Pct:    decimal.Zero,
		}
		if len(rows) > 0 {
			s.Pct = decimal.NewFromInt(int64(s.Count)).Div(total)
		}
		out = append(out, s)
	}
	return out
}

// WinLossSplit là ba con số của doughnut thắng/thua (§5.15).
//
// EvenCount là phần Excel không có: chart4.xml chỉ vẽ hai lát. Nhưng §10 mục 2
// đã chốt lệnh net = 0 không vào win lẫn loss, nên nếu không trả nó ra thì
// tổng hai lát nhỏ hơn số lệnh và người dùng sẽ tưởng hệ thống nuốt mất lệnh.
type WinLossSplit struct {
	WinCount  int `json:"win_count"`
	LossCount int `json:"loss_count"`
	EvenCount int `json:"even_count"`
}

// WinLossOf đếm thắng / thua / hoà trên tập đã lọc.
func WinLossOf(rows []metrics.Enriched) WinLossSplit {
	out := WinLossSplit{}
	for _, r := range rows {
		switch {
		case r.Net.IsPositive():
			out.WinCount++
		case r.Net.IsNegative():
			out.LossCount++
		default:
			out.EvenCount++
		}
	}
	return out
}

// TheorySummary là ba tile tổng kết dưới biểu đồ lý thuyết-vs-thực tế (§5.16).
type TheorySummary struct {
	Theory decimal.Decimal `json:"theory"`
	Actual decimal.Decimal `json:"actual"`
	Diff   decimal.Decimal `json:"diff"` // Actual − Theory, âm là thực tế kém hơn
}

// TheorySummaryOf lấy ĐIỂM CUỐI của hai chuỗi lũy kế, không phải tổng của
// chúng — chuỗi đã lũy kế sẵn, cộng lại lần nữa là đếm hai lần.
//
// Tập rỗng trả 0 chứ không phải nil: "chưa đi được đồng nào" là một con số có
// nghĩa, khác với các chỉ số nil-được ở KPI vốn là "chia cho 0".
func TheorySummaryOf(points []TheoryPoint) TheorySummary {
	if len(points) == 0 {
		return TheorySummary{Theory: decimal.Zero, Actual: decimal.Zero, Diff: decimal.Zero}
	}
	last := points[len(points)-1]
	return TheorySummary{
		Theory: last.CumTheory,
		Actual: last.CumByTrade,
		Diff:   last.CumByTrade.Sub(last.CumTheory),
	}
}
