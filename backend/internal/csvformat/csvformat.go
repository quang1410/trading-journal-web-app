// Package csvformat sở hữu ĐỊNH DẠNG file CSV của nhật ký: tên cột lúc xuất,
// các tên được chấp nhận lúc nhập, và cặp thoát/gỡ-thoát cho ô chữ tự do.
//
// Vì sao gộp về một package: xuất rồi nhập lại phải ra đúng chuỗi gốc, mà
// điều kiện của việc đó nằm ở hai đầu — tên cột lúc xuất phải nhận diện được
// bởi bảng alias lúc nhập, và Escape phải là nghịch đảo đúng của Unescape.
// Trước Task 4 hai nửa nằm ở hai package (exporter.Escape và
// importer.stripLeadingQuote), nên ràng buộc chỉ được giữ bằng một test round-trip
// chứ không bằng cấu trúc: sửa một nửa mà quên nửa kia là chuyện làm được.
//
// Package THUẦN: chỉ strings. Không GORM, không net/http, không context.
package csvformat

import "strings"

// Columns là thứ tự cột của file xuất ra, theo trading-journal-plan.md §0 — đúng
// thứ tự cột của file Excel gốc: 18 cột input trước (kể cả STT và Account),
// rồi tới các cột derived.
//
// Giữ nguyên tên tiếng Việt là chủ ý: file xuất ra phải nhập lại được bằng
// chính importer, và importer nhận diện theo những tên này.
var Columns = []string{
	"STT", "Account", "Day", "Symbol", "Long/ Short",
	"Entry", "Exit", "Volume", "Profit", "Profit lý thuyết", "Phí",
	"Setup", "Timeframe", "Vào lệnh", "Trong lệnh", "Thoát lệnh",
	"Tâm lý giao dịch", "Notes",
	"Loại lệnh", "Điểm Vào lệnh", "Điểm Thoát lệnh", "Điểm Trong lệnh",
	"Điểm Tâm lý", "Tổng điểm", "Week", "Month",
	"Profit (đã trừ phí)", "Win/Loss",
	"Profit cộng dồn theo lệnh", "Profit cộng dồn theo ngày",
	"Profit lý thuyết cộng dồn", "Running Peak", "Drawdown",
}

// InputColumnCount là số cột INPUT ở đầu Columns; phần còn lại là cột derived.
//
// Là hằng số có tên chứ không phải số 18 rải trong test: chèn thêm một cột
// input mà quên sửa con số này sẽ đẩy một cột derived sang nửa "phải nhập
// lại được", và hai test cấu trúc ở dưới sẽ khẳng định ngược điều chúng
// định khẳng định — im lặng. TestInputColumnCountPointsAtCorrectBoundary canh chỗ đó.
const InputColumnCount = 18

// Header trả BẢN SAO thứ tự cột. Bản sao chứ không phải slice gốc: người gọi
// sửa nhầm một phần tử sẽ đổi định dạng file của cả hệ thống.
func Header() []string {
	out := make([]string, len(Columns))
	copy(out, Columns)
	return out
}

// ColumnAliases ánh xạ trường → các tên cột được chấp nhận trong file nhập vào.
//
// Mỗi trường nhận NHIỀU tên: file gốc dùng tiếng Việt, file do web xuất ra
// dùng cùng tên đó, và người dùng có thể tự sửa header thành tiếng Anh. Nhận
// rộng ở đây rẻ hơn nhiều so với bắt người ta sửa lại file.
//
// Cột nào không có tên trong bảng này thì bị BỎ QUA im lặng — đó chính là
// cách các cột derived (Tổng điểm, Drawdown, Profit cộng dồn…) bị loại. Quy
// tắc 2 của CLAUDE.md nói không lưu trường suy diễn, và cách thi hành rẻ nhất
// là không bao giờ đọc chúng.
var ColumnAliases = map[string][]string{
	"day":              {"day", "ngày", "ngay", "date"},
	"symbol":           {"symbol", "mã", "ma", "cặp", "cap"},
	"direction":        {"long/short", "direction", "chiều", "chieu", "buy/sell"},
	"entry":            {"entry", "giá vào", "gia vao"},
	"exit":             {"exit", "giá ra", "gia ra"},
	"volume":           {"volume", "khối lượng", "khoi luong", "vol"},
	"profit":           {"profit", "lãi", "lai", "lợi nhuận", "loi nhuan"},
	"profit_theory":    {"profit lý thuyết", "profit ly thuyet", "profit theory"},
	"fee":              {"phí", "phi", "fee", "phí giao dịch"},
	"setup":            {"setup", "mô hình", "mo hinh"},
	"timeframe":        {"timeframe", "khung thời gian", "khung thoi gian", "tf"},
	"entry_quality":    {"vào lệnh", "vao lenh", "entry quality"},
	"in_trade_quality": {"trong lệnh", "trong lenh", "in trade quality"},
	"exit_quality":     {"thoát lệnh", "thoat lenh", "exit quality"},
	"psychology":       {"tâm lý giao dịch", "tam ly giao dich", "tâm lý", "tam ly", "psychology"},
	"notes":            {"notes", "ghi chú", "ghi chu", "note"},
}

// Required là bốn cột không có thì không dựng nổi một lệnh có nghĩa.
//
// Cố ý KHÔNG bắt buộc: entry/exit/volume (lệnh nhập tay được để trống),
// fee (mặc định 0), và toàn bộ cột chấm điểm (lệnh chưa đánh giá là hợp lệ).
var Required = []string{"day", "symbol", "direction", "profit"}

// formulaChars là những ký tự mở đầu khiến Excel/Sheets coi ô là công thức.
const formulaChars = "=+-@\t\r"

// Escape bọc một ô CHỮ TỰ DO để Excel/Sheets không chạy nó như công thức.
//
// Setup và Notes người dùng gõ tự do. Một note bắt đầu bằng "=" hay "@" sẽ
// được Excel chạy như công thức lúc mở file — DDE hoặc =HYPERLINK(...) là
// vector kinh điển. Nhật ký này một người dùng, nhưng file CSV thì đem gửi:
// cho kế toán, cho quỹ, cho coach — và lúc đó nó không còn là tự hại nữa.
//
// CHỈ dùng cho cột chữ. Bọc cột số sẽ phá round-trip: "-500" ở Profit là số
// âm hợp lệ, không phải công thức.
func Escape(s string) string {
	if s == "" {
		return s
	}
	// Byte đầu, không phải rune đầu — và điều đó CHỈ đúng vì formulaChars
	// toàn ASCII: mọi byte của một ký tự UTF-8 nhiều byte đều >= 0x80 nên
	// không bao giờ trùng. Thêm một ký tự không-ASCII vào formulaChars (ví dụ
	// dấu trừ "−" U+2212 mà Excel hay chèn) sẽ phá ngầm điều kiện này —
	// TestFormulaCharsMustBeAllASCII canh đúng chỗ đó.
	first := s[0]
	// Bọc CẢ ô đã sẵn nháy đơn dẫn đầu, không chỉ ô mở đầu bằng ký tự công
	// thức. Đây là nửa còn lại của cặp nghịch đảo: Unescape gỡ một nháy khi
	// sau nó là ký tự công thức, nên một ô người dùng gõ thật là "'=abc" mà
	// không được bọc sẽ bị gỡ mất nháy ở vòng nhập — mỗi vòng xuất-nhập mất
	// một ký tự, im lặng.
	if strings.ContainsRune(formulaChars, rune(first)) || first == '\'' {
		// Nháy đơn dẫn đầu là quy ước Excel/Sheets hiểu là "ô này là chữ".
		return "'" + s
	}
	return s
}

// Unescape gỡ nháy đơn dẫn đầu khỏi ô CHỮ TỰ DO. Nghịch đảo của Escape.
//
// Không gỡ thì xuất rồi nhập lại sẽ đội thêm một dấu nháy mỗi vòng. Excel
// cũng tự thêm dấu này khi người dùng gõ chữ bắt đầu bằng "=", nên gỡ là
// đúng cả với file do Excel xuất ra chứ không riêng file của web.
func Unescape(s string) string {
	if len(s) > 1 && s[0] == '\'' &&
		(strings.ContainsRune(formulaChars, rune(s[1])) || s[1] == '\'') {
		return s[1:]
	}
	return s
}

// FormulaChars trả tập ký tự mở đầu bị coi là công thức.
//
// Có mặt để test ghim được bất biến "tập này phải toàn ASCII" — bất biến mà
// phép so khớp theo byte của Escape/Unescape phụ thuộc vào.
func FormulaChars() string { return formulaChars }

// NormalizeColumnName đưa một ô header về dạng so sánh được: bỏ BOM, gộp
// khoảng trắng, hạ chữ thường, và bỏ khoảng trắng quanh dấu gạch chéo.
//
// Ở ĐÂY chứ không ở importer là chủ ý, và là nửa còn thiếu của ràng buộc
// round-trip mà package này sinh ra để giữ. Escape/Unescape đã là cặp nghịch
// đảo được cấu trúc bảo đảm, nhưng nửa HEADER thì chưa: hàm quyết định một
// tên cột xuất ra có nhận lại được hay không vẫn nằm bên importer, nên test
// round-trip phải CHÉP TAY lại nó. Bản chép không bao giờ báo lỗi khi lệch —
// thêm một luật chuẩn hoá (bỏ dấu chấm, bỏ non-breaking space…) mà quên sửa
// bản chép thì test vẫn xanh trong khi importer thật đã đổi hành vi.
//
// Gộp khoảng trắng là bắt buộc chứ không phải cho đẹp: header cột G của file
// gốc là "Long/ Short" — có một dấu cách lẻ SAU dấu gạch chéo. So khớp
// nguyên văn sẽ trượt đúng cột quan trọng nhất của phase này, và thông điệp
// lỗi sẽ nói "thiếu cột direction" trong khi cột đó đang nằm ngay trước mắt.
func NormalizeColumnName(s string) string {
	s = strings.TrimPrefix(s, "\uFEFF")
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	return strings.ReplaceAll(strings.ReplaceAll(s, " /", "/"), "/ ", "/")
}
