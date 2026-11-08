package service_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/service"
)

const (
	testIP      = "203.0.113.7"
	ownerEmail  = "a@example.com"
	ownerPass   = "correct-password"
	wrongPass   = "wrong-password"
	lockSeconds = 15 * 60
)

type lockoutFixture struct {
	svc      *service.AuthService
	counters *memCounterStore
	now      *time.Time
	hashes   *atomic.Int32 // số lần chạy argon2 (verify thật + verify giả)
}

func newLockoutFixture(t *testing.T) lockoutFixture {
	t.Helper()
	counters := newMemCounterStore()
	svc := newAuthService(t).WithLockout(counters)
	_, err := svc.Register(context.Background(), ownerEmail, ownerPass)
	require.NoError(t, err)

	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	svc.Now = func() time.Time { return now }
	var hashes atomic.Int32
	svc.SetPasswordCheckForTest(
		func(password, encoded string) (bool, error) {
			hashes.Add(1)
			return auth.VerifyPassword(password, encoded)
		},
		func(password string) {
			hashes.Add(1)
			auth.VerifyDummy(password)
		},
	)
	return lockoutFixture{svc: svc, counters: counters, now: &now, hashes: &hashes}
}

func (f lockoutFixture) login(email, password, ip string) error {
	_, err := f.svc.Login(context.Background(), email, password, ip)
	return err
}

func requireStatus(t *testing.T, err error, status int) *apperr.Error {
	t.Helper()
	e := apperr.As(err)
	require.NotNil(t, e, "want a business error, got %v", err)
	require.Equal(t, status, e.Status, e.Msg)
	return e
}

// Năm lần sai từ cùng (email, IP) thì khoá cặp đó. Đang khoá thì mật khẩu ĐÚNG
// cũng bị chặn, và không băm — chặn mà vẫn băm thì argon2 vẫn bị vắt RAM.
func TestLoginLocksPairAfterFiveFailures(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 5; i++ {
		requireStatus(t, f.login(ownerEmail, wrongPass, testIP), 401)
	}

	before := f.hashes.Load()
	e := requireStatus(t, f.login(ownerEmail, ownerPass, testIP), 429)
	require.Equal(t, lockSeconds, e.RetryAfterSeconds)
	require.Equal(t, "gửi quá nhiều lần, thử lại sau 15 phút", e.Msg)
	require.Equal(t, before, f.hashes.Load(), "a locked login must not hash")

	*f.now = f.now.Add(15 * time.Minute)
	require.NoError(t, f.login(ownerEmail, ownerPass, testIP), "the lock expires")
}

// Khoá theo cặp: kẻ tấn công từ một IP không khoá được chủ ở IP khác.
func TestPairLockDoesNotLockOwnerElsewhere(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 6; i++ {
		_ = f.login(ownerEmail, wrongPass, testIP)
	}
	require.NoError(t, f.login(ownerEmail, ownerPass, "198.51.100.2"))
}

// Tấn công phân tán: mỗi IP sai một lần, không cặp nào chạm 5, nhưng tổng 30
// lần sai trong một giờ thì khoá email 15 phút ở MỌI IP.
func TestLoginLocksEmailAfterThirtyFailuresFromManyIPs(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 30; i++ {
		*f.now = f.now.Add(time.Minute)
		requireStatus(t, f.login(ownerEmail, wrongPass, fmt.Sprintf("198.51.100.%d", i+1)), 401)
	}

	e := requireStatus(t, f.login(ownerEmail, ownerPass, "192.0.2.1"), 429)
	require.Equal(t, lockSeconds, e.RetryAfterSeconds)

	*f.now = f.now.Add(15 * time.Minute)
	require.NoError(t, f.login(ownerEmail, ownerPass, "192.0.2.1"))
}

// Email không tồn tại bị khoá y hệt — khác đi là lộ email nào đã đăng ký.
func TestLockoutLooksTheSameForUnknownEmail(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 5; i++ {
		_ = f.login(ownerEmail, wrongPass, testIP)
		_ = f.login("nobody@example.com", wrongPass, testIP)
	}

	known := requireStatus(t, f.login(ownerEmail, wrongPass, testIP), 429)
	unknown := requireStatus(t, f.login("nobody@example.com", wrongPass, testIP), 429)
	require.Equal(t, *known, *unknown)
}

// Email chuẩn hoá trước khi đếm: đổi hoa thường hay thêm khoảng trắng không
// được tính là email khác.
func TestLockoutKeyUsesNormalizedEmail(t *testing.T) {
	f := newLockoutFixture(t)
	for _, e := range []string{"A@example.com", " a@example.com", "a@EXAMPLE.com", "a@example.com ", "A@EXAMPLE.COM"} {
		_ = f.login(e, wrongPass, testIP)
	}
	requireStatus(t, f.login(ownerEmail, ownerPass, testIP), 429)
}

// Đăng nhập đúng xoá bộ đếm lần sai của cặp: người hay gõ nhầm không bị dồn
// lượt sai qua nhiều ngày rồi bị khoá oan.
func TestSuccessfulLoginResetsPairFailures(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 4; i++ {
		_ = f.login(ownerEmail, wrongPass, testIP)
	}
	require.NoError(t, f.login(ownerEmail, ownerPass, testIP))
	for i := 0; i < 4; i++ {
		requireStatus(t, f.login(ownerEmail, wrongPass, testIP), 401)
	}
	require.NoError(t, f.login(ownerEmail, ownerPass, testIP))
}

func TestLockoutStoreErrorFailsClosed(t *testing.T) {
	f := newLockoutFixture(t)
	f.counters.err = errors.New("connection refused")

	err := f.login(ownerEmail, ownerPass, testIP)
	require.Error(t, err)
	require.Nil(t, apperr.As(err), "a 500, not a business error and not a session")
}

// Bắn song song cùng một cặp: lượt thử được đếm nguyên tử TRƯỚC khi băm, nên
// đúng 5 lượt được băm. Kiểm khoá rồi mới ghi lần sai sau khi băm thì cả loạt
// cùng lọt qua bước kiểm.
func TestConcurrentWrongPasswordsHashExactlyPairLimit(t *testing.T) {
	f := newLockoutFixture(t)
	const n = 10
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- f.login(ownerEmail, wrongPass, testIP)
		}()
	}
	wg.Wait()
	close(errs)

	statuses := map[int]int{}
	for err := range errs {
		statuses[apperr.As(err).Status]++
	}
	require.Equal(t, map[int]int{401: 5, 429: 5}, statuses)
	require.EqualValues(t, 5, f.hashes.Load())
}

// Mỗi instance chỉ chạy tối đa N lần argon2 (64 MiB mỗi lần) cùng lúc. Request
// thừa chờ một lúc; vẫn không có chỗ thì 503 "máy chủ bận" — không phải 429:
// người dùng không làm gì sai, và FE không được khoá nút theo kiểu bị phạt.
func TestLoginWhenHashGateIsFullReturns503(t *testing.T) {
	f := newLockoutFixture(t)
	f.svc.SetHashGateForTest(1, 50*time.Millisecond)

	release := make(chan struct{})
	entered := make(chan struct{})
	f.svc.SetPasswordCheckForTest(
		func(password, encoded string) (bool, error) {
			close(entered)
			<-release
			return auth.VerifyPassword(password, encoded)
		},
		auth.VerifyDummy,
	)
	done := make(chan error, 1)
	go func() { done <- f.login(ownerEmail, ownerPass, testIP) }()
	<-entered

	e := requireStatus(t, f.login(ownerEmail, ownerPass, "198.51.100.2"), 503)
	require.Equal(t, 1503, e.Code)
	require.Positive(t, e.RetryAfterSeconds)

	close(release)
	require.NoError(t, <-done)
}

// Cổng băm từ chối (503 hoặc client bỏ đi) thì chưa có mật khẩu nào được kiểm,
// nên lượt vừa giữ phải được trả lại. Không thì lúc bị dò phân tán làm đầy cổng,
// chủ gõ ĐÚNG mật khẩu vài lần, nhận 503, rồi tự khoá cặp của mình 15 phút.
func TestHashGateRejectionDoesNotCountAsAttempt(t *testing.T) {
	cases := map[string]func() context.Context{
		"busy": context.Background,
		"client gone": func() context.Context {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			return ctx
		},
	}
	for name, ctxOf := range cases {
		t.Run(name, func(t *testing.T) {
			f := newLockoutFixture(t)
			f.svc.SetHashGateForTest(1, 10*time.Millisecond)
			release := make(chan struct{})
			entered := make(chan struct{})
			var once sync.Once
			f.svc.SetPasswordCheckForTest(
				func(password, encoded string) (bool, error) {
					once.Do(func() { close(entered) })
					<-release
					return auth.VerifyPassword(password, encoded)
				},
				auth.VerifyDummy,
			)
			done := make(chan error, 1)
			go func() { done <- f.login(ownerEmail, ownerPass, "198.51.100.2") }()
			<-entered

			for i := 0; i < pairLimitPlusOne; i++ {
				_, err := f.svc.Login(ctxOf(), ownerEmail, ownerPass, testIP)
				require.Error(t, err, "attempt %d", i+1)
				if e := apperr.As(err); e != nil {
					require.Equal(t, 503, e.Status, "attempt %d must not be locked out: %s", i+1, e.Msg)
				} else {
					require.ErrorIs(t, err, context.Canceled, "attempt %d", i+1)
				}
			}
			close(release)
			require.NoError(t, <-done)

			require.NoError(t, f.login(ownerEmail, ownerPass, testIP))
			hits, _, err := f.counters.Peek(context.Background(), "login:attempt:email:"+ownerEmail, *f.now)
			require.NoError(t, err)
			require.Zero(t, hits, "rejected attempts must be refunded from the email counter")
		})
	}
}

const pairLimitPlusOne = 6

// Register cũng băm argon2 nên đi qua cùng cổng.
func TestRegisterWhenHashGateIsFullReturns503(t *testing.T) {
	svc := newAuthService(t)
	svc.SetHashGateForTest(0, 10*time.Millisecond)

	_, err := svc.Register(context.Background(), ownerEmail, ownerPass)
	requireStatus(t, err, 503)
}

// Quyết định 1 của chủ dự án đếm lần SAI theo email. Lượt đếm trước khi băm,
// nên lượt đúng phải được trả lại — không thì chủ đăng nhập vài lần trong lúc
// bị dò phân tán là tự đẩy email mình tới ngưỡng khoá.
func TestSuccessfulLoginsDoNotCountTowardEmailLock(t *testing.T) {
	f := newLockoutFixture(t)
	for i := 0; i < 29; i++ {
		requireStatus(t, f.login(ownerEmail, wrongPass, fmt.Sprintf("198.51.100.%d", i+1)), 401)
	}
	for i := 0; i < 10; i++ {
		require.NoError(t, f.login(ownerEmail, ownerPass, "192.0.2.1"), "correct login %d", i+1)
	}
	requireStatus(t, f.login(ownerEmail, wrongPass, "192.0.2.2"), 401)
	requireStatus(t, f.login(ownerEmail, ownerPass, "192.0.2.1"), 429)
}
