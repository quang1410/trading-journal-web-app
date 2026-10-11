// Package scoring cài đặt bảng chấm điểm giao dịch của
// trading-journal-plan.md §2. Thuần: không I/O, không state.
package scoring

import "journal/internal/domain"

// Entry chấm chất lượng vào lệnh (§2.1).
func Entry(q string) int {
	switch q {
	case domain.EntryPlanned:
		return 25
	case domain.EntryTooEarly, domain.EntryTooLate:
		return 10
	default: // rỗng, "Bốc đồng", hoặc giá trị lạ
		return 0
	}
}

// Exit chấm chất lượng thoát lệnh (§2.2). Chạm Dừng lỗ vẫn được 25 điểm vì
// đây chấm kỷ luật thực thi, không chấm lãi lỗ.
func Exit(q string) int {
	switch q {
	case domain.ExitHitTP, domain.ExitHitSL:
		return 25
	case domain.ExitTechnical:
		return 15
	default:
		return 0
	}
}

// InTrade chấm hành vi trong lệnh (§2.3).
func InTrade(q string) int {
	switch q {
	case domain.InTradeFollowed:
		return 25
	case domain.InTradeMovedTP:
		return 10
	case domain.InTradeWantExit:
		return 5
	default:
		return 0
	}
}

// Psych chấm tâm lý (§2.4).
func Psych(q string) int {
	switch q {
	case domain.PsychNoError:
		return 25
	case domain.PsychFear, domain.PsychHope, domain.PsychGreed:
		return 5
	default:
		return 0
	}
}

// Total cộng bốn trục (§2.5). Trả nil khi CẢ BỐN field đều rỗng — nghĩa là
// lệnh chưa được chấm, khác hẳn với lệnh được chấm 0 điểm.
func Total(entry, inTrade, exit, psych string) *int {
	if entry == "" && inTrade == "" && exit == "" && psych == "" {
		return nil
	}
	total := Entry(entry) + InTrade(inTrade) + Exit(exit) + Psych(psych)
	return &total
}

// ClassBand là một bậc phân loại: tổng điểm >= Min thì thuộc Class.
type ClassBand struct {
	Min   int
	Class string
}

// ClassBands là các bậc của §2.6, sắp Min GIẢM DẦN. Classify duyệt từ trên
// xuống và lấy bậc đầu tiên khớp. /meta/enums cấp nguyên bảng này cho
// landing, nên ngưỡng chỉ nằm ở MỘT chỗ.
var ClassBands = []ClassBand{
	{Min: 80, Class: domain.ClassPlanned},
	{Min: 55, Class: domain.ClassNeedsWork},
	{Min: 30, Class: domain.ClassImpulsive},
	{Min: 0, Class: domain.ClassRevenge},
}

// Classify quy tổng điểm thành loại lệnh (§2.6). Ranh giới đóng dưới:
// đúng 80 là "Đúng kế hoạch", đúng 55 là "Cần cải thiện", đúng 30 là "Bốc đồng / FOMO".
func Classify(total *int) string {
	if total == nil {
		return domain.ClassNotEvaluated
	}
	for _, b := range ClassBands {
		if *total >= b.Min {
			return b.Class
		}
	}
	// Tổng âm không xảy ra (mỗi trục >= 0); rơi về bậc thấp nhất cho chắc.
	return ClassBands[len(ClassBands)-1].Class
}
