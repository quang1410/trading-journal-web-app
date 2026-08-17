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

// Classify quy tổng điểm thành loại lệnh (§2.6). Ranh giới đóng dưới:
// đúng 80 là "Đúng kế hoạch", đúng 55 là "Cần cải thiện", đúng 30 là "Bốc đồng / FOMO".
func Classify(total *int) string {
	if total == nil {
		return domain.ClassNotEvaluated
	}
	switch {
	case *total >= 80:
		return domain.ClassPlanned
	case *total >= 55:
		return domain.ClassNeedsWork
	case *total >= 30:
		return domain.ClassImpulsive
	default:
		return domain.ClassRevenge
	}
}
