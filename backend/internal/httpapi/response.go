// Package httpapi chứa tầng HTTP: router, middleware, handler.
// Mọi response của API đều đi qua OK hoặc Fail để giữ đúng một envelope.
package httpapi

import (
	"encoding/json"
	"log"
	"net/http"

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
		Fail(w, e.Status, e.Code, e.Msg)
		return
	}
	log.Printf("lỗi không mong đợi [request_id=%s] %s %s: %v",
		middleware.GetReqID(r.Context()), r.Method, r.URL.Path, err)
	Fail(w, http.StatusInternalServerError, 1500, "lỗi hệ thống")
}

// DecodeJSON đọc body JSON vào dst, trả *apperr.Error khi body hỏng.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperr.Validation("dữ liệu gửi lên không đọc được")
	}
	return nil
}
