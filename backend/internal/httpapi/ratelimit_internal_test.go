package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Mỗi IP lạ thêm một khoá vào map. Kẻ xoay IP liên tục không được làm map
// phình quá trần, kể cả khi mọi khoá còn đang trong cửa sổ.
func TestRateLimiterMapStaysBounded(t *testing.T) {
	now := time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)
	rl := newRateLimiter(5, time.Minute, func() time.Time { return now })
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := rl.middleware(ok)

	for i := 0; i < maxTrackedIPs+500; i++ {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.Header.Set("X-Real-IP", "10.0."+strconv.Itoa(i/256)+"."+strconv.Itoa(i%256))
		h.ServeHTTP(httptest.NewRecorder(), req)
	}
	require.LessOrEqual(t, rl.size(), maxTrackedIPs)
}
