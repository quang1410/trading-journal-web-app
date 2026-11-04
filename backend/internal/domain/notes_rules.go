package domain

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// MaxNotesLen là trần độ dài ghi chú, tính bằng KÝ TỰ (rune) sau khi trim —
// dùng chung cho ghi chú lệnh (trades.notes) và ghi chú kỳ (journal_notes).
//
// Gấp đôi MaxTemplateBodyLen vì mẫu ghi chú được NỐI vào cuối ghi chú: bằng
// trần mẫu thì ghi chú đã có chữ, chèn thêm một mẫu dài là không lưu được.
// Đây là hàng rào chống phình to (mọi lần đọc danh sách lệnh đều kéo cột này),
// không phải hàng rào an ninh — giống MaxTemplateBodyLen.
const MaxNotesLen = 128 * 1024

var ErrNotesTooLong = fmt.Errorf("ghi chú dài quá %d ký tự", MaxNotesLen)

// CheckNotesLen kiểm trần độ dài của một ghi chú.
//
// Đo sau khi trim vì đó là chuỗi thật sự xuống DB. Đếm bằng
// utf8.RuneCountInString chứ không len(), cùng lý do ở ValidateNoteTemplate.
func CheckNotesLen(notes string) error {
	if utf8.RuneCountInString(strings.TrimSpace(notes)) > MaxNotesLen {
		return ErrNotesTooLong
	}
	return nil
}
