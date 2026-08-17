// Package domain chứa kiểu dữ liệu nghiệp vụ thuần. Không phụ thuộc GORM,
// HTTP hay bất cứ hạ tầng nào.
package domain

// Chuỗi enum dưới đây là KEY CHẤM ĐIỂM, không phải nhãn hiển thị. Đổi chúng
// là đổi kết quả chấm điểm của toàn bộ lịch sử. Nếu cần đổi text hiển thị,
// đổi ở frontend, giữ nguyên giá trị lưu trong DB.
// Nguồn: trading-journal-plan.md §1.
const (
	DirectionLong  = "Long"
	DirectionShort = "Short"
)

const (
	EntryPlanned  = "Đúng kế hoạch"
	EntryTooEarly = "Quá sớm"
	EntryTooLate  = "Quá muộn"
	EntryImpulse  = "Bốc đồng"
)

const (
	InTradeFollowed = "Tuân thủ kế hoạch"
	InTradeMovedTP  = "Dời Chốt lời"
	InTradeMovedSL  = "Dời dừng lỗ ra xa"
	InTradeWantExit = "Muốn thoát lệnh"
)

const (
	ExitHitTP     = "Chạm Chốt lời"
	ExitHitSL     = "Chạm Dừng lỗ"
	ExitTechnical = "Thoát chủ động (lý do kỹ thuật)"
	ExitEmotional = "Thoát lệnh cảm tính, sợ hãi"
)

const (
	PsychNoError     = "Không lỗi"
	PsychFOMO        = "SỢ BỎ LỠ (FOMO)"
	PsychFear        = "SỢ HÃI"
	PsychHope        = "HI VỌNG"
	PsychGreed       = "THAM LAM"
	PsychRevenge     = "GIAO DỊCH TRẢ THÙ"
	PsychAlwaysRight = "LUÔN MUỐN MÌNH ĐÚNG"
)

// Loại lệnh suy ra từ tổng điểm — trading-journal-plan.md §2.6.
const (
	ClassNotEvaluated = "CHƯA ĐÁNH GIÁ"
	ClassPlanned      = "Đúng kế hoạch"
	ClassNeedsWork    = "Cần cải thiện"
	ClassImpulsive    = "Bốc đồng / FOMO"
	ClassRevenge      = "Giao dịch trả thù"
)

// DefaultSetup là giá trị mặc định khi user chưa đặt tên setup.
const DefaultSetup = "KHÔNG CÓ SETUP"

// Timeframes theo thứ tự tăng dần, dùng để sắp xếp biểu đồ theo timeframe.
var Timeframes = []string{"M1", "M5", "M15", "M30", "H1", "H4", "D1", "W"}

// Weekdays theo thứ tự hiển thị của biểu đồ theo thứ trong tuần.
var Weekdays = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
