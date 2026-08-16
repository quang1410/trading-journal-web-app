package httpapi

import "net/http"

// Healthz báo tiến trình còn sống. Docker compose dùng endpoint này làm healthcheck.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	OK(w, map[string]string{"status": "ok"})
}
