// Package httpapi chứa tầng HTTP: router, middleware, handler.
// Mọi response của API đều đi qua OK hoặc Fail để giữ đúng một envelope.
package httpapi

import (
	"encoding/json"
	"net/http"
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
