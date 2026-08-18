// Package apperr là từ vựng lỗi chung giữa service và httpapi.
// service tạo lỗi kèm status + mã nghiệp vụ, httpapi chỉ việc dịch sang
// envelope — nhờ vậy service không phải import net/http, và httpapi không
// phải biết luật nghiệp vụ.
package apperr

import (
	"errors"
	"fmt"
)

// Error là lỗi nghiệp vụ hiển thị được cho người dùng cuối.
type Error struct {
	Status int    // HTTP status
	Code   int    // mã nghiệp vụ, luôn khác 0
	Msg    string // thông điệp tiếng Việt, hiển thị thẳng cho user
}

func (e *Error) Error() string {
	return fmt.Sprintf("%d/%d: %s", e.Status, e.Code, e.Msg)
}

func Validation(msg string) *Error   { return &Error{Status: 400, Code: 1400, Msg: msg} }
func Unauthorized(msg string) *Error { return &Error{Status: 401, Code: 1401, Msg: msg} }
func Forbidden(msg string) *Error    { return &Error{Status: 403, Code: 1403, Msg: msg} }
func NotFound(msg string) *Error     { return &Error{Status: 404, Code: 1404, Msg: msg} }
func Conflict(msg string) *Error     { return &Error{Status: 409, Code: 1409, Msg: msg} }

// As trả về *Error nếu err là hoặc bọc một *Error, ngược lại nil.
func As(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return nil
}
