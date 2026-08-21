package service

import (
	"strings"

	"journal/internal/metrics"
)

// Filter là bộ lọc dùng chung cho ba endpoint đọc. Trường rỗng nghĩa là
// không lọc theo trường đó.
//
// From/To là ngày dạng "YYYY-MM-DD" hiểu theo timezone của account, bao gồm
// cả hai đầu mút.
type Filter struct {
	From       string
	To         string
	Setup      string
	Symbol     string
	Timeframe  string
	Direction  string
	TradeClass string
}

// Normalize cắt khoảng trắng ở mọi trường. Gọi nó ngay khi nhận query string.
func (f Filter) Normalize() Filter {
	f.From = strings.TrimSpace(f.From)
	f.To = strings.TrimSpace(f.To)
	f.Setup = strings.TrimSpace(f.Setup)
	f.Symbol = strings.TrimSpace(f.Symbol)
	f.Timeframe = strings.TrimSpace(f.Timeframe)
	f.Direction = strings.TrimSpace(f.Direction)
	f.TradeClass = strings.TrimSpace(f.TradeClass)
	return f
}

// IsEmpty báo bộ lọc không lọc gì cả.
func (f Filter) IsEmpty() bool {
	return f == Filter{}
}

// Apply lọc danh sách ĐÃ Enrich, trả lát cắt mới.
//
// Chạy sau Enrich chứ không phải trong SQL, vì hai lý do độc lập:
//
//  1. TradeClass là trường suy diễn — trong SQL không tồn tại cột nào để lọc.
//  2. Lũy kế bắt buộc tính trên toàn bộ dãy, nên đằng nào cũng phải nạp hết;
//     lọc dưới SQL không tiết kiệm được lần đọc nào.
//
// Luôn trả lát cắt khác nil, kể cả khi không khớp gì: nil marshal ra `null`
// còn API phải trả `[]`.
func (f Filter) Apply(rows []metrics.Enriched) []metrics.Enriched {
	out := make([]metrics.Enriched, 0, len(rows))
	for _, r := range rows {
		if f.match(r) {
			out = append(out, r)
		}
	}
	return out
}

func (f Filter) match(r metrics.Enriched) bool {
	// So sánh CHUỖI trên Day, không phải số học múi giờ trên EnteredAt.
	//
	// Day do metrics.DateParts sinh và đã quy đổi đúng timezone của account.
	// Định dạng "YYYY-MM-DD" có thứ tự từ điển trùng khít thứ tự thời gian,
	// nên phép so sánh này đúng — và nó loại bỏ hoàn toàn số học biên múi
	// giờ, tức loại bỏ đúng cái bẫy mà spec mẹ §7.1 cảnh báo.
	if f.From != "" && r.Day < f.From {
		return false
	}
	if f.To != "" && r.Day > f.To {
		return false
	}
	// Khớp chính xác, không phải chứa: đây là giá trị enum và khoá gom nhóm
	// của pivot, khớp mờ sẽ trộn hai nhóm khác nhau làm một.
	if f.Setup != "" && r.Trade.Setup != f.Setup {
		return false
	}
	if f.Symbol != "" && r.Trade.Symbol != f.Symbol {
		return false
	}
	if f.Timeframe != "" && r.Trade.Timeframe != f.Timeframe {
		return false
	}
	if f.Direction != "" && r.Trade.Direction != f.Direction {
		return false
	}
	if f.TradeClass != "" && r.TradeClass != f.TradeClass {
		return false
	}
	return true
}
