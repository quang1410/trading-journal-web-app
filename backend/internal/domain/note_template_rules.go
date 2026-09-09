package domain

import (
	"fmt"
	"strings"
)

// Luật kiểm tra và chuẩn hoá một mẫu ghi chú.
//
// Package vẫn THUẦN: chỉ strings và fmt, không hạ tầng — giống trade_rules.go.

// Giới hạn độ dài. MaxTemplateBodyLen là hàng rào chống phình to, KHÔNG phải
// hàng rào an ninh: backend cố ý không sanitize HTML, việc đó do frontend làm
// cả lúc lưu và lúc render, đúng như cột trades.notes đang làm.
const (
	MaxTemplateNameLen = 120
	MaxTemplateBodyLen = 64 * 1024
)

// ErrTemplateNameEmpty và bạn bè là lỗi của những trường bắt buộc, đặt tên
// theo đúng khuôn ErrSymbolEmpty của trade_rules.go.
var (
	ErrTemplateNameEmpty = fmt.Errorf("tên mẫu không được để trống")
	ErrTemplateBodyEmpty = fmt.Errorf("nội dung mẫu không được để trống")
)

// ValidateNoteTemplate kiểm và CHUẨN HOÁ tại chỗ.
//
// Ghi giá trị đã trim trở lại con trỏ, giống ValidateTrade làm với Notes: chỉ
// kiểm mà không ghi lại thì khoảng trắng đầu/cuối vẫn xuống DB, và "Setup A "
// với "Setup A" thành hai hàng dù UNIQUE index dùng lower() coi chúng là một.
//
// Trả lỗi THƯỜNG, không phải *apperr.Error: package này thuần (quy tắc 3 của
// CLAUDE.md), nên việc dịch sang 400 là của service — xem service/trade.go.
func ValidateNoteTemplate(t *NoteTemplate) error {
	t.Name = strings.TrimSpace(t.Name)
	t.BodyHTML = strings.TrimSpace(t.BodyHTML)

	if t.Name == "" {
		return ErrTemplateNameEmpty
	}
	if len(t.Name) > MaxTemplateNameLen {
		return fmt.Errorf("tên mẫu dài quá %d ký tự", MaxTemplateNameLen)
	}
	if t.BodyHTML == "" {
		return ErrTemplateBodyEmpty
	}
	if len(t.BodyHTML) > MaxTemplateBodyLen {
		return fmt.Errorf("nội dung mẫu dài quá %d ký tự", MaxTemplateBodyLen)
	}
	return nil
}
