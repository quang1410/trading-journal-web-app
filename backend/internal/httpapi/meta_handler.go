package httpapi

import (
	"net/http"

	"journal/internal/domain"
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
		"weekdays":           domain.Weekdays,
		"default_setup":      domain.DefaultSetup,
	})
}
