package httpapi_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// limitedRouter dựng router đầy đủ hàng rào như main.go, trên một DB cho sẵn —
// hai router trên cùng DB là hai instance dùng chung bộ đếm.
func limitedRouter(db *gorm.DB) http.Handler {
	signer := auth.NewSigner("test-key", 15*time.Minute)
	counters := repository.NewCounterRepo(db)
	authSvc := service.NewAuthService(
		repository.NewUserRepo(db), repository.NewRefreshTokenRepo(db), signer, 720*time.Hour,
	).WithLockout(counters)
	return httpapi.NewRouter(httpapi.Deps{
		Auth:    authSvc,
		Limiter: service.NewRateLimiter(counters),
		Signer:  signer,
	})
}

func limitedServer(t *testing.T, db *gorm.DB) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(limitedRouter(db))
	t.Cleanup(srv.Close)
	return srv
}

// postFrom gửi như thể từ IP `ip` sau proxy (Vercel/nginx ghi X-Real-IP).
func postFrom(t *testing.T, url, ip, body string, cookies ...*http.Cookie) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Real-IP", ip)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	_ = resp.Body.Close()
	return resp
}

func loginBody(i int) string {
	// Mỗi lượt một email khác: đếm theo IP, không để lockout theo cặp chen vào.
	return fmt.Sprintf(`{"email":"u%d@example.com","password":"wrong-password"}`, i)
}

func requireRetryLater(t *testing.T, resp *http.Response) {
	t.Helper()
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	secs, err := strconv.Atoi(resp.Header.Get("Retry-After"))
	require.NoError(t, err, "Retry-After must be whole seconds")
	require.Positive(t, secs)
}

func TestAuthRoutesAreRateLimitedPerIP(t *testing.T) {
	cases := []struct {
		path  string
		limit int
		body  func(i int) string
	}{
		{"/api/auth/login", 10, loginBody},
		{"/api/auth/register", 5, func(i int) string {
			return fmt.Sprintf(`{"email":"r%d@example.com","password":"correct-password"}`, i)
		}},
		{"/api/auth/refresh", 30, func(int) string { return "" }},
	}
	for _, c := range cases {
		t.Run(c.path, func(t *testing.T) {
			srv := limitedServer(t, testdb.New(t))
			for i := 0; i < c.limit; i++ {
				resp := postFrom(t, srv.URL+c.path, "203.0.113.7", c.body(i))
				require.NotEqual(t, http.StatusTooManyRequests, resp.StatusCode, "request %d", i+1)
			}
			requireRetryLater(t, postFrom(t, srv.URL+c.path, "203.0.113.7", c.body(c.limit)))

			// IP khác có lượt riêng.
			resp := postFrom(t, srv.URL+c.path, "198.51.100.2", c.body(c.limit+1))
			require.NotEqual(t, http.StatusTooManyRequests, resp.StatusCode)
		})
	}
}

// Điều kiện "Xong khi" của K-04: bộ đếm sống qua nhiều instance. Bộ đếm trong
// bộ nhớ sẽ cho mỗi instance 10 lượt riêng.
func TestRateLimitIsSharedAcrossInstances(t *testing.T) {
	db := testdb.New(t)
	a, b := limitedServer(t, db), limitedServer(t, db)

	for i := 0; i < 6; i++ {
		require.Equal(t, http.StatusUnauthorized, postFrom(t, a.URL+"/api/auth/login", "203.0.113.7", loginBody(i)).StatusCode)
	}
	for i := 6; i < 10; i++ {
		require.Equal(t, http.StatusUnauthorized, postFrom(t, b.URL+"/api/auth/login", "203.0.113.7", loginBody(i)).StatusCode)
	}
	requireRetryLater(t, postFrom(t, b.URL+"/api/auth/login", "203.0.113.7", loginBody(10)))
}

// Bắn cùng lúc thì vẫn đúng ngưỡng: đếm bằng upsert nguyên tử, không đọc rồi ghi.
func TestConcurrentLoginsFromOneIPLetExactlyLimitThrough(t *testing.T) {
	srv := limitedServer(t, testdb.New(t))

	var wg sync.WaitGroup
	var mu sync.Mutex
	passed := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp := postFrom(t, srv.URL+"/api/auth/login", "203.0.113.7", loginBody(i))
			if resp.StatusCode != http.StatusTooManyRequests {
				mu.Lock()
				passed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	require.Equal(t, 10, passed)
}

// 429 ở /refresh chặn TRƯỚC handler: cookie phải còn nguyên, vì phiên vẫn
// sống — xoá cookie là đá người dùng ra chỉ vì bị chặn tạm.
func TestRefreshRateLimitKeepsCookie(t *testing.T) {
	srv := limitedServer(t, testdb.New(t))
	for i := 0; i < 30; i++ {
		postFrom(t, srv.URL+"/api/auth/refresh", "203.0.113.7", "")
	}

	resp := postFrom(t, srv.URL+"/api/auth/refresh", "203.0.113.7", "",
		&http.Cookie{Name: "refresh_token", Value: "still-alive"})

	requireRetryLater(t, resp)
	require.Empty(t, resp.Header.Values("Set-Cookie"))
}

// Handler phải truyền IP thật vào lockout: truyền rỗng thì mọi IP chung một
// cặp, và một kẻ tấn công khoá được chủ ở bất kỳ đâu.
func TestLoginLockoutIsPerClientIP(t *testing.T) {
	db := testdb.New(t)
	srv := limitedServer(t, db)
	require.Equal(t, http.StatusOK, postFrom(t, srv.URL+"/api/auth/register", "192.0.2.1",
		`{"email":"a@example.com","password":"correct-password"}`).StatusCode)

	wrong := `{"email":"a@example.com","password":"wrong-password"}`
	right := `{"email":"a@example.com","password":"correct-password"}`
	for i := 0; i < 5; i++ {
		require.Equal(t, http.StatusUnauthorized, postFrom(t, srv.URL+"/api/auth/login", "203.0.113.7", wrong).StatusCode)
	}
	resp := postFrom(t, srv.URL+"/api/auth/login", "203.0.113.7", right)
	requireRetryLater(t, resp)
	require.Equal(t, "900", resp.Header.Get("Retry-After"))

	require.Equal(t, http.StatusOK, postFrom(t, srv.URL+"/api/auth/login", "198.51.100.2", right).StatusCode)
}

// Quên gắn bộ đếm là mở toang login — phải hỏng ngay lúc khởi động, không
// lặng lẽ chạy không hàng rào.
func TestNewRouterRequiresLimiterForPublicRoutes(t *testing.T) {
	signer := auth.NewSigner("test-key", 15*time.Minute)
	require.Panics(t, func() {
		httpapi.NewRouter(httpapi.Deps{Auth: &service.AuthService{}, Signer: signer})
	})
	require.Panics(t, func() {
		httpapi.NewRouter(httpapi.Deps{Waitlist: &service.WaitlistService{}})
	})
}
