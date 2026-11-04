// Package apperr là từ vựng lỗi chung giữa service và httpapi.
// service tạo lỗi kèm status + mã nghiệp vụ, httpapi chỉ việc dịch sang
// envelope — nhờ vậy service không phải import net/http, và httpapi không
// phải biết luật nghiệp vụ.
package apperr

import (
	"errors"
	"fmt"
	"time"
)

// Error là lỗi nghiệp vụ hiển thị được cho người dùng cuối.
type Error struct {
	Status int    // HTTP status
	Code   int    // mã nghiệp vụ, luôn khác 0
	Msg    string // thông điệp tiếng Việt, hiển thị thẳng cho user

	// RetryAfterSeconds > 0 thì httpapi gửi kèm header Retry-After.
	RetryAfterSeconds int
}

func (e *Error) Error() string {
	return fmt.Sprintf("%d/%d: %s", e.Status, e.Code, e.Msg)
}

func Validation(msg string) *Error      { return &Error{Status: 400, Code: 1400, Msg: msg} }
func Unauthorized(msg string) *Error    { return &Error{Status: 401, Code: 1401, Msg: msg} }
func Forbidden(msg string) *Error       { return &Error{Status: 403, Code: 1403, Msg: msg} }
func NotFound(msg string) *Error        { return &Error{Status: 404, Code: 1404, Msg: msg} }
func Conflict(msg string) *Error        { return &Error{Status: 409, Code: 1409, Msg: msg} }
func TooManyRequests(msg string) *Error { return &Error{Status: 429, Code: 1429, Msg: msg} }
func PayloadTooLarge(msg string) *Error { return &Error{Status: 413, Code: 1413, Msg: msg} }

// RetryLater là 429 kèm thời gian chờ: số giây cho header Retry-After, số
// phút cho câu hiển thị. Cả hai làm tròn LÊN và tối thiểu 1 — báo sớm hơn
// thực tế là xúi người dùng thử lại rồi bị chặn tiếp.
func RetryLater(after time.Duration) *Error {
	seconds := max(1, int((after+time.Second-1)/time.Second))
	minutes := (seconds + 59) / 60
	e := TooManyRequests(fmt.Sprintf("gửi quá nhiều lần, thử lại sau %d phút", minutes))
	e.RetryAfterSeconds = seconds
	return e
}

// Busy là 503: máy chủ tạm hết chỗ (vd cổng băm mật khẩu đầy). Khác 429 —
// người dùng không làm gì sai, chỉ cần thử lại sau vài giây.
func Busy(after time.Duration) *Error {
	return &Error{
		Status: 503, Code: 1503, Msg: "máy chủ đang bận, thử lại sau vài giây",
		RetryAfterSeconds: max(1, int((after+time.Second-1)/time.Second)),
	}
}

// BadGateway: nguồn ngoài (TradingView) hay kho phía sau (DB) không trả được, không phải lỗi của
// request.
func BadGateway(msg string) *Error { return &Error{Status: 502, Code: 1502, Msg: msg} }

// As trả về *Error nếu err là hoặc bọc một *Error, ngược lại nil.
func As(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return nil
}
