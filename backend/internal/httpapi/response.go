// Package httpapi chứa tầng HTTP: router, middleware, handler.
// Mọi response của API đều đi qua OK hoặc Fail để giữ đúng một envelope.
package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5/middleware"

	"journal/internal/apperr"
)

type envelope struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data"`
}

// OK ghi response thành công: code 0, msg "ok".
func OK(w http.ResponseWriter, data any) {
	write(w, http.StatusOK, envelope{Code: 0, Msg: "ok", Data: data})
}

// Fail ghi response lỗi. status là HTTP status, code là mã lỗi nghiệp vụ
// (khác 0) để frontend phân biệt nguyên nhân mà không phải parse msg.
func Fail(w http.ResponseWriter, status, code int, msg string) {
	write(w, status, envelope{Code: code, Msg: msg, Data: nil})
}

func write(w http.ResponseWriter, status int, body envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// FailErr dịch một lỗi sang envelope. Lỗi mang *apperr.Error là lỗi nghiệp vụ
// hiển thị được; mọi lỗi khác là lỗi hạ tầng hoặc lập trình — trả 500 với
// thông điệp chung và ghi chi tiết vào log, không đẩy chi tiết ra cho client.
func FailErr(w http.ResponseWriter, r *http.Request, err error) {
	if e := apperr.As(err); e != nil {
		if e.RetryAfterSeconds > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(e.RetryAfterSeconds))
		}
		Fail(w, e.Status, e.Code, e.Msg)
		return
	}
	log.Printf("unexpected error [request_id=%s] %s %s: %v",
		middleware.GetReqID(r.Context()), r.Method, r.URL.Path, err)
	Fail(w, http.StatusInternalServerError, 1500, "lỗi hệ thống")
}

// MaxJSONBodyBytes là trần body JSON, chung cho mọi route đọc qua DecodeJSON.
//
// Phải chứa vừa ghi chú dài nhất hợp lệ (domain.MaxNotesLen = 128K ký tự) ở
// MỌI cách mã hoá JSON hợp lệ. Trình duyệt gửi UTF-8 thô (≤ 4 byte/ký tự),
// nhưng client escape ký tự ngoài BMP thành cặp surrogate "\ud83d\ude00" (vd
// json.dumps của Python) tốn 12 byte/ký tự ≈ 1,5 MiB — nên trần là 2 MiB, vẫn
// dưới 4,5 MB của Vercel. Không có trần thì một body
// khổng lồ giữ RAM của API — kể cả ở route công khai (login, waitlist) — và
// Vercel chặn 4,5 MB chỉ khi chạy trên Vercel, không phải khi self-host.
const MaxJSONBodyBytes = 2 << 20

const msgPayloadTooLarge = "dữ liệu gửi lên quá lớn"

// DecodeJSON đọc body JSON vào dst, trả *apperr.Error khi body hỏng hoặc quá
// MaxJSONBodyBytes.
//
// Nhận w vì http.MaxBytesReader dùng nó để báo server đóng kết nối sau khi
// vượt trần, thay vì đọc nốt phần body còn lại.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, MaxJSONBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		// Tách riêng ca quá cỡ: báo "không đọc được" thì người dùng đi sửa
		// dữ liệu trong khi việc cần làm là gửi ít đi.
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return apperr.PayloadTooLarge(msgPayloadTooLarge)
		}
		return apperr.Validation("dữ liệu gửi lên không đọc được")
	}
	return nil
}
