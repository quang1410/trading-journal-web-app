package service

import (
	"context"
	"fmt"
	"time"

	"journal/internal/apperr"
	"journal/internal/auth"
)

// Lockout đăng nhập (K-04, chủ dự án chọn kiểu kết hợp):
//   - cặp (email, IP) thử quá pairAttemptLimit lần trong pairAttemptWindow → khoá cặp;
//   - email thử quá emailAttemptLimit lần trong emailAttemptWindow từ mọi IP → khoá email.
//
// Khoá theo cặp là chính: kẻ tấn công từ một IP không khoá được chủ đang ở IP
// khác. Ngưỡng theo email chỉ chạm khi bị dò phân tán từ nhiều IP.
//
// Đếm LƯỢT THỬ trước khi băm, không đếm lần sai sau khi băm: kiểm khoá rồi mới
// ghi lần sai thì một loạt request song song cùng lọt qua bước kiểm. Lượt đúng
// xoá bộ đếm của cặp và trả lại lượt của email, nên cả hai thực chất đếm lần sai.
const (
	pairAttemptLimit   = 5
	pairAttemptWindow  = 15 * time.Minute
	emailAttemptLimit  = 30
	emailAttemptWindow = time.Hour
	lockDuration       = 15 * time.Minute
)

// Cổng băm: tối đa hashSlots lần argon2 (64 MiB mỗi lần) chạy cùng lúc trên
// một instance. Ngưỡng theo IP không chặn được tấn công từ nhiều IP; cổng này
// giữ RAM của instance có trần. Request thừa chờ tối đa hashWait.
const (
	hashSlots = 4
	hashWait  = 5 * time.Second
)

// hashGate là semaphore cho các phép băm mật khẩu.
type hashGate struct {
	slots chan struct{}
	wait  time.Duration
}

func newHashGate(slots int, wait time.Duration) hashGate {
	return hashGate{slots: make(chan struct{}, slots), wait: wait}
}

// run chạy f khi có chỗ. Chờ quá hạn thì trả 503 — người dùng thật thử lại
// sau vài giây là qua; treo request thì chỉ dồn thêm tải.
func (g hashGate) run(ctx context.Context, f func()) error {
	timer := time.NewTimer(g.wait)
	defer timer.Stop()
	select {
	case g.slots <- struct{}{}:
	case <-timer.C:
		return apperr.Busy(g.wait)
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-g.slots }()
	f()
	return nil
}

// passwordCheck là hai phép băm của Login, tách ra để test đếm được số lần băm.
type passwordCheck struct {
	verify func(password, encoded string) (bool, error)
	dummy  func(password string)
}

var argon2Check = passwordCheck{verify: auth.VerifyPassword, dummy: auth.VerifyDummy}

// WithLockout bật lockout đăng nhập theo bộ đếm dùng chung. Không gọi thì
// không khoá (test cũ, dev không DB).
func (s *AuthService) WithLockout(counters CounterStore) *AuthService {
	s.counters = counters
	return s
}

func pairAttemptKey(email, clientKey string) string {
	return "login:attempt:pair:" + email + "|" + clientKey
}
func pairLockKey(email, clientKey string) string { return "login:lock:pair:" + email + "|" + clientKey }
func emailAttemptKey(email string) string        { return "login:attempt:email:" + email }
func emailLockKey(email string) string           { return "login:lock:email:" + email }

// reserveAttempt chạy TRƯỚC khi băm: đang khoá thì trả 429; chưa khoá thì tính
// một lượt thử cho cặp và cho email, vượt ngưỡng thì đặt khoá và trả 429. Câu
// trả lời giống hệt nhau dù email có tồn tại hay không.
func (s *AuthService) reserveAttempt(ctx context.Context, email, clientKey string, now time.Time) error {
	if s.counters == nil {
		return nil
	}
	var until time.Time
	for _, key := range []string{pairLockKey(email, clientKey), emailLockKey(email)} {
		hits, resetAt, err := s.counters.Peek(ctx, key, now)
		if err != nil {
			return fmt.Errorf("check login lock: %w", err)
		}
		if hits > 0 && resetAt.After(until) {
			until = resetAt
		}
	}
	if !until.IsZero() {
		return apperr.RetryLater(until.Sub(now))
	}

	// Bộ đếm của cặp GIỮ lại khi khoá: cửa sổ của nó bắt đầu từ lượt đầu nên
	// hết trước khoá, và mọi lượt chen vào giữa vẫn thấy "vượt ngưỡng". Bộ đếm
	// của email thì xoá: cửa sổ một giờ dài hơn khoá 15 phút, giữ lại là hết
	// khoá xong lượt kế tiếp khoá lại ngay.
	steps := []struct {
		attemptKey, lockKey string
		limit               int
		window              time.Duration
		resetOnLock         bool
	}{
		{pairAttemptKey(email, clientKey), pairLockKey(email, clientKey), pairAttemptLimit, pairAttemptWindow, false},
		{emailAttemptKey(email), emailLockKey(email), emailAttemptLimit, emailAttemptWindow, true},
	}
	for _, st := range steps {
		hits, _, err := s.counters.Hit(ctx, st.attemptKey, st.window, now)
		if err != nil {
			return fmt.Errorf("count login attempt: %w", err)
		}
		if hits <= st.limit {
			continue
		}
		_, lockedUntil, err := s.counters.Hit(ctx, st.lockKey, lockDuration, now)
		if err != nil {
			return fmt.Errorf("lock login: %w", err)
		}
		if st.resetOnLock {
			if err := s.counters.Delete(ctx, st.attemptKey); err != nil {
				return fmt.Errorf("reset login attempts: %w", err)
			}
		}
		return apperr.RetryLater(lockedUntil.Sub(now))
	}
	return nil
}

// recordSuccess xoá bộ đếm lượt thử của cặp. Bộ đếm theo email thì chỉ trả lại
// đúng lượt vừa đếm, KHÔNG xoá: chủ đăng nhập được không có nghĩa cuộc dò phân
// tán đã dừng, nhưng lượt đúng cũng không được tính là lần sai (QĐ 1).
func (s *AuthService) recordSuccess(ctx context.Context, email, clientKey string, now time.Time) error {
	if s.counters == nil {
		return nil
	}
	if err := s.counters.Delete(ctx, pairAttemptKey(email, clientKey)); err != nil {
		return fmt.Errorf("reset login attempts: %w", err)
	}
	if err := s.counters.Undo(ctx, emailAttemptKey(email), now); err != nil {
		return fmt.Errorf("undo login attempt: %w", err)
	}
	return nil
}
