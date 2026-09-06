package csvformat

import (
	"regexp"
	"strings"
)

// Ghi chú lệnh được lưu dưới dạng HTML (ô soạn thảo Quill ở frontend). File
// CSV thì không: nó mở bằng Excel, và một ô chứa "<p><strong>Vào sớm</strong>"
// là rác trên màn hình người đọc — file này còn đem gửi cho kế toán, cho quỹ,
// cho coach. Cột Notes vì thế xuất ra CHỮ, không xuất thẻ.
//
// Chiều ngược lại không cần hàm nào: người dùng nhập CSV gõ chữ thuần, và
// frontend đã bọc chữ thuần thành đoạn văn khi mở lên trong editor
// (`noteToHtml` ở lib/richText.ts). Hai đầu gặp nhau ở cùng một quy ước.

var (
	// <br> và <hr> là ngắt dòng ngay tại chỗ, không phải ranh giới khối.
	brTag = regexp.MustCompile(`(?i)<(?:br|hr)\s*/?>`)
	// Thẻ ĐÓNG của một khối: chỗ kết thúc một đoạn, một mục danh sách.
	blockEnd = regexp.MustCompile(`(?i)</(?:p|div|li|h[1-6]|blockquote|pre|tr)>`)
	anyTag   = regexp.MustCompile(`<[^>]*>`)
	// Mục checklist: trạng thái nằm trong thuộc tính, nên bóc thẻ trần sẽ
	// làm mất nó. Bắt trước khi anyTag xoá sạch.
	checkItem = regexp.MustCompile(`(?i)<li[^>]*\bdata-list\s*=\s*["']?(checked|unchecked)["']?[^>]*>`)
	// Ảnh: nội dung nằm ở thuộc tính alt/src, giữa hai thẻ không có chữ nào.
	imgTag = regexp.MustCompile(`(?i)<img[^>]*>`)
	imgAlt = regexp.MustCompile(`(?i)\balt\s*=\s*"([^"]*)"`)
	imgSrc = regexp.MustCompile(`(?i)\bsrc\s*=\s*"([^"]*)"`)
	// Ba dòng trống liên tiếp trở lên rút về hai.
	manyNewlines  = regexp.MustCompile(`\n{3,}`)
	spaceBeforeNL = regexp.MustCompile(`[ \t]+\n`)
)

// entityReplacer giải mã các thực thể mà frontend sinh ra khi escape.
//
// Thứ tự trong strings.NewReplacer không đổi kết quả — nó khớp không chồng
// lấn và luôn ưu tiên mẫu dài hơn — nên "&amp;lt;" ra "&lt;", đúng một bậc.
var entityReplacer = strings.NewReplacer(
	"&lt;", "<",
	"&gt;", ">",
	"&quot;", `"`,
	"&#39;", "'",
	"&nbsp;", " ",
	"&amp;", "&",
)

// NotesToText rút một ghi chú HTML về chữ thuần, giữ ngắt dòng.
//
// Ranh giới khối thành "\n" chứ không bị nuốt: "<p>Vào sớm</p><p>Bài học</p>"
// mà nối thẳng sẽ ra "Vào sớmBài học" — một từ không ai gõ, và người đọc file
// không có cách nào biết nó từ đâu ra.
//
// Ghi chú CŨ là chữ thuần, không có thẻ nào: mọi phép thay thế ở đây không
// khớp gì cả và chuỗi đi qua nguyên vẹn. Không cần nhánh riêng cho nó.
func NotesToText(s string) string {
	if s == "" {
		return ""
	}
	out := brTag.ReplaceAllString(s, "\n")
	// Ảnh và trạng thái checklist phải được dịch TRƯỚC khi bóc thẻ: cả hai
	// mang nội dung trong thuộc tính, mà anyTag xoá cả thẻ lẫn thuộc tính.
	out = imgTag.ReplaceAllStringFunc(out, imageToText)
	out = checkItem.ReplaceAllStringFunc(out, checkboxToText)
	out = blockEnd.ReplaceAllString(out, "\n")
	out = anyTag.ReplaceAllString(out, "")
	out = entityReplacer.Replace(out)
	out = spaceBeforeNL.ReplaceAllString(out, "\n")
	out = manyNewlines.ReplaceAllString(out, "\n\n")
	return strings.TrimSpace(out)
}

// checkboxToText giữ lại trạng thái của một mục việc cần làm.
//
// Bóc thẻ trần thì "[x] chờ nến đóng" và "[ ] chờ nến đóng" xuất ra CSV giống
// hệt nhau — mà việc đã làm hay chưa mới là toàn bộ lý do người dùng gõ cái
// danh sách đó. Dùng ký hiệu "[x]" / "[ ]" vì nó đọc được trong Excel, nơi
// không có ô vuông nào để vẽ.
func checkboxToText(tag string) string {
	m := checkItem.FindStringSubmatch(tag)
	if len(m) < 2 {
		return ""
	}
	if strings.EqualFold(m[1], "checked") {
		return "[x] "
	}
	return "[ ] "
}

// imageToText thay một thẻ ảnh bằng mô tả đọc được.
//
// Ảnh không đi vào CSV được, nhưng bỏ hẳn nó thì một ghi chú CHỈ có ảnh chart
// sẽ xuất ra ô rỗng — người đọc file tưởng lệnh đó không có ghi chú gì. Giữ
// lại alt nếu có, không thì giữ link để còn mở lại được.
func imageToText(tag string) string {
	if m := imgAlt.FindStringSubmatch(tag); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
		return "[ảnh: " + strings.TrimSpace(m[1]) + "]"
	}
	if m := imgSrc.FindStringSubmatch(tag); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
		return "[ảnh: " + strings.TrimSpace(m[1]) + "]"
	}
	return "[ảnh]"
}
