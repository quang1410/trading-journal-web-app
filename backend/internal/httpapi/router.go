package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter dựng toàn bộ route của API. Mọi nhánh lỗi cũng trả envelope,
// kể cả 404 và 405 — frontend chỉ cần một hàm unwrap duy nhất.
func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusNotFound, 1404, "không tìm thấy endpoint")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusMethodNotAllowed, 1405, "method không được hỗ trợ")
	})

	r.Get("/healthz", Healthz)

	return r
}
