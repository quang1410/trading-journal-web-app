package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/httpapi"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func hit(h http.Handler, ip string) int {
	req := httptest.NewRequest(http.MethodPost, "/api/waitlist", nil)
	req.RemoteAddr = ip
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestRateLimitBlocksAfterLimitAndRecovers(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := httpapi.RateLimit(5, time.Minute, clock.now)(ok)

	for i := 0; i < 5; i++ {
		require.Equal(t, http.StatusOK, hit(h, "203.0.113.7"), "request %d", i+1)
	}
	require.Equal(t, http.StatusTooManyRequests, hit(h, "203.0.113.7"))

	// IP khác có bộ đếm riêng.
	require.Equal(t, http.StatusOK, hit(h, "198.51.100.2"))

	// Cửa sổ trượt: sau đúng một phút, lượt cũ nhất rơi khỏi cửa sổ.
	clock.t = clock.t.Add(time.Minute + time.Second)
	require.Equal(t, http.StatusOK, hit(h, "203.0.113.7"))
}

func TestRateLimitIgnoresPort(t *testing.T) {
	clock := &fakeClock{t: time.Now()}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := httpapi.RateLimit(1, time.Minute, clock.now)(ok)

	require.Equal(t, http.StatusOK, hit(h, "203.0.113.7:5000"))
	require.Equal(t, http.StatusTooManyRequests, hit(h, "203.0.113.7:6000"),
		"same IP on another port is the same visitor")
}
