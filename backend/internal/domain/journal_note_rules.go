package domain

import (
	"fmt"
	"regexp"
	"strings"
)

// Period là loại kỳ của thẻ tổng kết và của ghi chú kỳ.
//
// Kiểu riêng chứ không phải string trần: chuỗi đi vào từ URL phải qua
// ParsePeriod đúng một lần ở ranh giới service, sau đó mọi tầng bên dưới nhận
// một giá trị ĐÃ kiểm — không còn chỗ nào phải tự hỏi lại "chuỗi này hợp lệ
// chưa". Cột TEXT và JSON vẫn thấy chuỗi thường vì kiểu gốc là string.
type Period string

const (
	PeriodDay  Period = "day"
	PeriodWeek Period = "week"
)

// periodKeyRules là danh sách DUY NHẤT các kỳ được hỗ trợ, kèm luật khoá.
//
// Khoá ngày theo lịch ("2026-09-21") và khoá tuần theo ISO-8601 ("2026-W39").
// Cả hai neo hai đầu và ép zero-pad: "2026-9-21" và "2026-W9" sắp xếp SAI theo
// thứ tự chuỗi, mà thứ tự chuỗi chính là thứ tự thời gian mà thẻ kỳ dựa vào.
//
// Thêm một kỳ mới là thêm một dòng ở đây — ParsePeriod và ParsePeriodRef đọc
// cùng bảng này nên không có danh sách thứ hai nào phải nhớ sửa theo.
var periodKeyRules = map[Period]struct {
	re     *regexp.Regexp
	format string
}{
	PeriodDay:  {regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`), "YYYY-MM-DD"},
	PeriodWeek: {regexp.MustCompile(`^\d{4}-W\d{2}$`), "YYYY-Www"},
}

// ParsePeriod đổi chuỗi từ request thành Period, từ chối kỳ không hỗ trợ.
//
// Phân biệt hoa thường: "Day" bị từ chối, vì khoá kỳ đi thẳng vào ràng buộc
// unique và hai cách viết của cùng một kỳ sẽ thành hai hàng.
func ParsePeriod(s string) (Period, error) {
	p := Period(s)
	if _, ok := periodKeyRules[p]; !ok {
		return "", fmt.Errorf("invalid period: %q", s)
	}
	return p, nil
}

// PeriodRef chỉ đúng một kỳ: loại kỳ cùng khoá của nó.
//
// Hai giá trị này luôn đi cùng nhau — khoá "2026-09-21" không có nghĩa nếu
// không biết nó là khoá ngày — nên gom lại thành một kiểu thay vì để mỗi chữ
// ký hàm tự mang cặp tham số (period, key).
type PeriodRef struct {
	Period Period
	Key    string
}

// ParsePeriodRef kiểm kỳ VÀ khoá ĐÚNG DẠNG của kỳ đó.
//
// Không kiểm ở đây thì period_key thành bãi rác chuỗi tự do: "2026-09-21" và
// "21/09/2026" cùng trỏ một ngày nhưng là hai hàng khác nhau trong bảng, và
// ràng buộc unique không nhìn ra chúng là một.
//
// Chỉ kiểm DẠNG, không kiểm ngày có thật: "2026-02-31" lọt qua. Khoá luôn do
// backend sinh từ metrics.DateParts trên một thời điểm có thật, nên một ngày
// không tồn tại chỉ có thể đến từ request bịa tay — và hậu quả tệ nhất của nó
// là một ghi chú không bao giờ có thẻ nào để hiện.
func ParsePeriodRef(period, key string) (PeriodRef, error) {
	p, err := ParsePeriod(period)
	if err != nil {
		return PeriodRef{}, err
	}
	rule := periodKeyRules[p]
	if !rule.re.MatchString(key) {
		return PeriodRef{}, fmt.Errorf("%s key must match %s, got %q", p, rule.format, key)
	}
	return PeriodRef{Period: p, Key: key}, nil
}

// blankNoteHTML là các dạng "rỗng" mà Quill trả về khi editor trống.
//
// Chép đúng tập EMPTY_HTML của frontend (src/lib/richText.ts): hai phía phải
// cùng một định nghĩa "rỗng", nếu không một request gọi thẳng API với
// "<p><br></p>" sẽ lưu một ghi chú mà UI coi là không có.
var blankNoteHTML = map[string]bool{
	"":              true,
	"<p><br></p>":   true,
	"<p></p>":       true,
	"<p><br/></p>":  true,
	"<p><br /></p>": true,
}

// IsBlankNoteHTML báo nội dung ghi chú có rỗng theo nghĩa của editor không.
//
// So khớp tập cố định chứ không bóc thẻ rồi đếm chữ: một ghi chú chỉ có ảnh
// hoặc chỉ có checklist trống vẫn là nội dung người dùng chủ ý lưu.
func IsBlankNoteHTML(html string) bool {
	return blankNoteHTML[strings.TrimSpace(html)]
}
