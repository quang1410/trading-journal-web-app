package domain

import (
	"errors"
	"fmt"
	"net/mail"
	"slices"
	"sort"
	"strings"
)

// Mã câu trả lời của form danh sách chờ. ASCII, ổn định — nhãn hiển thị nằm
// ở strings.ts của frontend. CHECK của migration 0007 liệt kê đúng các mã
// này; thêm mã là sửa cả hai chỗ.
var (
	JournalTools    = []string{"spreadsheet", "notion", "other_app", "none"}
	WaitlistMarkets = []string{"fx_gold", "crypto", "vn_stocks", "vn_derivatives"}
	PropStatuses    = []string{"active", "past", "never"}
)

const (
	maxEmailLen  = 254 // RFC 5321
	maxSourceLen = 64
)

var errInvalidEmail = errors.New("email không hợp lệ")

// WaitlistAnswers là ba câu trả lời đã kiểm. nil / "" nghĩa là bỏ qua câu đó.
type WaitlistAnswers struct {
	JournalTool *string
	Markets     string
	PropStatus  *string
}

// NormalizeEmail trim + lowercase rồi kiểm dạng. Giá trị trả về đi thẳng vào
// cột UNIQUE, nên " Toi@Gmail.com" và "toi@gmail.com" là MỘT người.
//
// mail.ParseAddress nhận cả dạng "Tên <a@x.com>" và local part có ngoặc kép;
// cả hai bị từ chối ở đây vì người gõ vào ô email không bao giờ có ý đó.
func NormalizeEmail(raw string) (string, error) {
	e := strings.ToLower(strings.TrimSpace(raw))
	if e == "" || len(e) > maxEmailLen || strings.ContainsAny(e, " \"<>") {
		return "", errInvalidEmail
	}
	addr, err := mail.ParseAddress(e)
	if err != nil || addr.Address != e {
		return "", errInvalidEmail
	}
	host := e[strings.LastIndex(e, "@")+1:]
	if !strings.Contains(host, ".") || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return "", errInvalidEmail
	}
	return e, nil
}

// NormalizeSource giữ nhãn nguồn (?ref= / ?utm_source=) ở dạng an toàn để gom
// nhóm: chữ thường, chỉ a-z 0-9 _ . -, tối đa 64 ký tự. Rỗng sau khi lọc là
// không có nguồn. Không báo lỗi: một link chia sẻ gõ sai không được làm hỏng
// lượt đăng ký.
func NormalizeSource(raw string) *string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(raw)) {
		if b.Len() >= maxSourceLen {
			break
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return nil
	}
	s := b.String()
	return &s
}

// NormalizeLocale chỉ nhận đúng "en"; mọi giá trị khác là "vi", ngôn ngữ mặc
// định của landing.
func NormalizeLocale(raw string) string {
	if raw == "en" {
		return "en"
	}
	return "vi"
}

// WaitlistAnswerCodes là ba câu trả lời thô client gửi lên, chưa kiểm. "" /
// nil nghĩa là bỏ qua câu đó.
type WaitlistAnswerCodes struct {
	JournalTool string
	Markets     []string
	PropStatus  string
}

// ParseAnswers kiểm mã của ba câu hỏi. Thị trường trùng bị gộp, rồi sắp xếp
// để cùng một lựa chọn luôn cho cùng một chuỗi.
func ParseAnswers(raw WaitlistAnswerCodes) (WaitlistAnswers, error) {
	tool, err := optionalCode(raw.JournalTool, JournalTools, "công cụ ghi nhật ký")
	if err != nil {
		return WaitlistAnswers{}, err
	}
	prop, err := optionalCode(raw.PropStatus, PropStatuses, "trạng thái thi quỹ")
	if err != nil {
		return WaitlistAnswers{}, err
	}
	seen := map[string]bool{}
	for _, m := range raw.Markets {
		if !slices.Contains(WaitlistMarkets, m) {
			return WaitlistAnswers{}, fmt.Errorf("thị trường không hợp lệ: %q", m)
		}
		seen[m] = true
	}
	codes := make([]string, 0, len(seen))
	for m := range seen {
		codes = append(codes, m)
	}
	sort.Strings(codes)
	return WaitlistAnswers{JournalTool: tool, Markets: strings.Join(codes, ","), PropStatus: prop}, nil
}

// optionalCode kiểm một câu chọn một: rỗng là bỏ qua (nil), còn lại phải
// nằm trong allowed. what là tên câu hỏi trong thông báo lỗi trả cho client.
func optionalCode(code string, allowed []string, what string) (*string, error) {
	if code == "" {
		return nil, nil
	}
	if !slices.Contains(allowed, code) {
		return nil, fmt.Errorf("%s không hợp lệ: %q", what, code)
	}
	return &code, nil
}
