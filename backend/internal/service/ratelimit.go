package service

import (
	"context"
	"fmt"
	"time"

	"journal/internal/apperr"
)

// RateLimiter giới hạn số lượt theo khoá, đếm trong CounterStore dùng chung
// nên đúng cả khi API chạy nhiều instance.
type RateLimiter struct {
	store CounterStore

	// Now tiêm được để test cửa sổ. Mặc định time.Now.
	Now func() time.Time

	// Disabled cho mọi request qua, không đếm. Chỉ để `make e2e` chạy được
	// (một IP đăng nhập hơn 20 lần một phút); config từ chối bật nó ở prod.
	// Lockout đăng nhập không bị ảnh hưởng.
	Disabled bool
}

func NewRateLimiter(store CounterStore) *RateLimiter {
	return &RateLimiter{store: store, Now: time.Now}
}

// Allow tính một lượt cho key. Quá `limit` lượt trong cửa sổ thì trả 429 kèm
// thời gian chờ tới hết cửa sổ. Kho đếm lỗi thì trả lỗi hạ tầng (500) — chặn
// chứ không cho qua.
func (l *RateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) error {
	if l.Disabled {
		return nil
	}
	now := l.Now()
	hits, resetAt, err := l.store.Hit(ctx, key, window, now)
	if err != nil {
		return fmt.Errorf("rate limit: %w", err)
	}
	if hits > limit {
		return apperr.RetryLater(resetAt.Sub(now))
	}
	return nil
}
