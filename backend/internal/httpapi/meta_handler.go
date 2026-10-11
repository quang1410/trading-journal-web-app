package httpapi

import (
	"net/http"

	"journal/internal/domain"
	"journal/internal/scoring"
)

// MetaEnums cấp toàn bộ enum §1 cho dropdown của frontend, để frontend không
// phải chép lại các chuỗi tiếng Việt vốn là key chấm điểm.
//
// Không yêu cầu đăng nhập: đây là dữ liệu tham chiếu tĩnh, không lộ gì.
func MetaEnums(w http.ResponseWriter, _ *http.Request) {
	OK(w, map[string]any{
		"directions":         domain.Directions,
		"timeframes":         domain.Timeframes,
		"entry_qualities":    domain.EntryQualities,
		"in_trade_qualities": domain.InTradeQualities,
		"exit_qualities":     domain.ExitQualities,
		"psychologies":       domain.Psychologies,
		"trade_classes":      domain.TradeClasses,
		"cash_flow_types":    domain.CashFlowTypes,
		"account_types":      domain.AccountTypes,
		"challenge_phases":   domain.ChallengePhases,
		"challenge_statuses": domain.ChallengeStatuses,
		"weekdays":           domain.Weekdays,
		"default_setup":      domain.DefaultSetup,
		"score_points": map[string]map[string]int{
			"entry_qualities":    scorePoints(domain.EntryQualities, scoring.Entry),
			"in_trade_qualities": scorePoints(domain.InTradeQualities, scoring.InTrade),
			"exit_qualities":     scorePoints(domain.ExitQualities, scoring.Exit),
			"psychologies":       scorePoints(domain.Psychologies, scoring.Psych),
		},
		"class_bands": classBandDTOs(),
	})
}

// scorePoints gọi chính hàm chấm điểm cho từng nhãn, nên không có bảng điểm
// thứ hai nào để trôi lệch.
func scorePoints(labels []string, score func(string) int) map[string]int {
	out := make(map[string]int, len(labels))
	for _, l := range labels {
		out[l] = score(l)
	}
	return out
}

type classBandDTO struct {
	Min   int    `json:"min"`
	Class string `json:"class"`
}

func classBandDTOs() []classBandDTO {
	out := make([]classBandDTO, 0, len(scoring.ClassBands))
	for _, b := range scoring.ClassBands {
		out = append(out, classBandDTO{Min: b.Min, Class: b.Class})
	}
	return out
}
