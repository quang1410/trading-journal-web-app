package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"journal/internal/apperr"
)

// maxTrackedIPs là trần số IP được đếm cùng lúc. Vượt trần thì bỏ IP đã hết
// lượt trong cửa sổ; vẫn vượt (kẻ xoay IP liên tục) thì xoá sạch map — chịu
// mất bộ đếm một lần còn hơn để bộ nhớ phình theo số IP giả.
const maxTrackedIPs = 10_000

// RateLimit cho mỗi IP tối đa `limit` request trong một cửa sổ trượt dài
// `window`. Vượt ngưỡng thì trả 429.
//
// Bộ đếm nằm trong bộ nhớ của MỘT process. Trên Vercel mỗi instance của
// function có bộ đếm riêng, nên đây là hàng rào tốt-nhất-có-thể chứ không
// phải bảo đảm (spec landing §4.4).
func RateLimit(limit int, window time.Duration, now func() time.Time) func(http.Handler) http.Handler {
	return newRateLimiter(limit, window, now).middleware
}

type rateLimiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu   sync.Mutex
	hits map[string][]time.Time
}

func newRateLimiter(limit int, window time.Duration, now func() time.Time) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, now: now, hits: map[string][]time.Time{}}
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(limiterKey(r)) {
			FailErr(w, r, apperr.TooManyRequests("gửi quá nhiều lần, thử lại sau một phút"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *rateLimiter) allow(key string) bool {
	t := rl.now()
	cutoff := t.Add(-rl.window)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	kept := make([]time.Time, 0, rl.limit)
	for _, h := range rl.hits[key] {
		if h.After(cutoff) {
			kept = append(kept, h)
		}
	}
	allowed := len(kept) < rl.limit
	if allowed {
		kept = append(kept, t)
	}
	rl.hits[key] = kept

	if len(rl.hits) > maxTrackedIPs {
		for k, v := range rl.hits {
			if len(v) == 0 || !v[len(v)-1].After(cutoff) {
				delete(rl.hits, k)
			}
		}
		if len(rl.hits) > maxTrackedIPs {
			rl.hits = map[string][]time.Time{key: kept}
		}
	}
	return allowed
}

// size chỉ dành cho test.
func (rl *rateLimiter) size() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.hits)
}

// limiterKey lấy IP khách để đếm.
//
// KHÔNG dùng RemoteAddr sau middleware.RealIP: RealIP tin True-Client-IP và
// X-Forwarded-For do chính client gửi, nên đổi header mỗi request là thoát
// giới hạn. X-Real-IP thì cả nginx (frontend/nginx.conf) lẫn Vercel đều GHI ĐÈ
// bằng IP thật của kết nối, nên tin được. Không có X-Real-IP (gọi thẳng, test)
// thì rơi về RemoteAddr.
//
// IPv6 đếm theo /64: một máy thường giữ cả dải /64, xoay địa chỉ trong dải
// không được coi là khách mới.
func limiterKey(r *http.Request) string {
	raw := strings.TrimSpace(r.Header.Get("X-Real-IP"))
	if raw == "" {
		raw = r.RemoteAddr
		if host, _, err := net.SplitHostPort(raw); err == nil {
			raw = host
		}
	}
	ip := net.ParseIP(raw)
	if ip == nil {
		return raw
	}
	if ip.To4() == nil {
		return ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
	}
	return ip.String()
}
