package service_test

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/mailer"
	"journal/internal/service"
)

const testAppURL = "https://app.example.com"

// switchMailer gửi qua LogMailer, hoặc trả lỗi khi fail bật.
type switchMailer struct {
	log  mailer.LogMailer
	fail atomic.Bool
}

func (m *switchMailer) Send(ctx context.Context, msg mailer.Message) error {
	if m.fail.Load() {
		return errors.New("smtp is down")
	}
	return m.log.Send(ctx, msg)
}

type verifyFixture struct {
	svc   *service.AuthService
	mail  *switchMailer
	users *memUserStore
	now   time.Time
}

func newVerifyFixture(t *testing.T) *verifyFixture {
	t.Helper()
	users := newMemUserStore()
	f := &verifyFixture{users: users, mail: &switchMailer{}, now: time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC)}
	f.svc = service.NewAuthService(users, newMemRefreshTokenStore(), auth.NewSigner("test-key", 15*time.Minute), 720*time.Hour).
		WithEmailVerification(newMemEmailTokenStore(users), f.mail, testAppURL)
	f.svc.Now = func() time.Time { return f.now }
	return f
}

var tokenInLink = regexp.MustCompile(`https://app\.example\.com/verify-email\?token=([A-Za-z0-9_-]+)`)

// lastToken lấy token thô trong link của thư gửi gần nhất.
func (f *verifyFixture) lastToken(t *testing.T) string {
	t.Helper()
	sent := f.mail.log.Sent()
	require.NotEmpty(t, sent, "expected a sent email")
	m := tokenInLink.FindStringSubmatch(sent[len(sent)-1].Text)
	require.Len(t, m, 2, "verify link not found in: %s", sent[len(sent)-1].Text)
	tok, err := url.QueryUnescape(m[1])
	require.NoError(t, err)
	return tok
}

func (f *verifyFixture) register(t *testing.T, locale string) service.Session {
	t.Helper()
	s, err := f.svc.Register(context.Background(), service.RegisterInput{
		Email: "Trader@Example.com", Password: "long-enough-password", Locale: locale,
	})
	require.NoError(t, err)
	return s
}

func requireCode(t *testing.T, err error, code int) {
	t.Helper()
	e := apperr.As(err)
	require.NotNil(t, e, "expected *apperr.Error, got %v", err)
	require.Equal(t, code, e.Code, "msg=%q", e.Msg)
}

func TestRegisterSendsVerificationEmailInUserLocale(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "en")

	sent := f.mail.log.Sent()
	require.Len(t, sent, 1)
	require.Equal(t, "trader@example.com", sent[0].To)
	require.Equal(t, mailer.VerifyEmail("x", "en", "y").Subject, sent[0].Subject)

	u, err := f.users.ByID(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.Equal(t, "en", u.Locale)

	require.NoError(t, f.svc.VerifyEmail(context.Background(), f.lastToken(t)))
	me, err := f.svc.Me(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.True(t, me.EmailVerified)
	require.Nil(t, me.VerifyDeadline)
}

func TestRegisterNormalizesUnknownLocale(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "fr")
	u, err := f.users.ByID(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.Equal(t, "vi", u.Locale)
}

// Resend sập không được làm hỏng đăng ký: người dùng gửi lại từ banner.
func TestRegisterSucceedsWhenMailerFails(t *testing.T) {
	f := newVerifyFixture(t)
	f.mail.fail.Store(true)
	s := f.register(t, "vi")
	require.NotEmpty(t, s.AccessToken)
	require.Empty(t, f.mail.log.Sent())
}

func TestVerifyEmailRejectsInvalidTokens(t *testing.T) {
	f := newVerifyFixture(t)
	f.register(t, "vi")
	tok := f.lastToken(t)

	requireCode(t, f.svc.VerifyEmail(context.Background(), ""), 1400)
	requireCode(t, f.svc.VerifyEmail(context.Background(), "not-a-real-token"), 1400)

	require.NoError(t, f.svc.VerifyEmail(context.Background(), tok))
	requireCode(t, f.svc.VerifyEmail(context.Background(), tok), 1400)
}

func TestVerifyEmailRejectsTokenAfter24Hours(t *testing.T) {
	f := newVerifyFixture(t)
	f.register(t, "vi")
	tok := f.lastToken(t)
	f.now = f.now.Add(24 * time.Hour)
	requireCode(t, f.svc.VerifyEmail(context.Background(), tok), 1400)
}

func TestRequestVerificationSendsInRequestedLocale(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "vi")
	require.NoError(t, f.svc.RequestVerification(context.Background(), s.User.ID, "en"))

	sent := f.mail.log.Sent()
	require.Len(t, sent, 2)
	require.Equal(t, mailer.VerifyEmail("x", "en", "y").Subject, sent[1].Subject)
	// Token mới cũng dùng được; token cũ vẫn sống tới hết 24 giờ.
	require.NoError(t, f.svc.VerifyEmail(context.Background(), f.lastToken(t)))
}

func TestRequestVerificationWhenAlreadyVerifiedIsConflict(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "vi")
	require.NoError(t, f.svc.VerifyEmail(context.Background(), f.lastToken(t)))
	requireCode(t, f.svc.RequestVerification(context.Background(), s.User.ID, "vi"), 1409)
}

func TestRequestVerificationMailerErrorIsBadGateway(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "vi")
	f.mail.fail.Store(true)
	requireCode(t, f.svc.RequestVerification(context.Background(), s.User.ID, "vi"), 1502)
}

func TestMeGracePeriod(t *testing.T) {
	f := newVerifyFixture(t)
	s := f.register(t, "vi")
	created := f.now.Add(-6 * 24 * time.Hour)
	f.users.setCreatedAt(s.User.ID, created)

	me, err := f.svc.Me(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.False(t, me.EmailVerified)
	require.False(t, me.VerificationRequired, "day 6 is inside the grace period")
	require.NotNil(t, me.VerifyDeadline)
	require.True(t, me.VerifyDeadline.Equal(created.Add(7*24*time.Hour)))
	require.Equal(t, "trader@example.com", me.Email)
	require.Equal(t, "vi", me.Locale)

	f.now = f.now.Add(2 * 24 * time.Hour) // ngày 8
	me, err = f.svc.Me(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.True(t, me.VerificationRequired, "day 8 must require verification")

	// Xác minh xong thì hết bị chặn, kể cả khi đã quá hạn.
	require.NoError(t, f.svc.RequestVerification(context.Background(), s.User.ID, "vi"))
	require.NoError(t, f.svc.VerifyEmail(context.Background(), f.lastToken(t)))
	me, err = f.svc.Me(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.False(t, me.VerificationRequired)
	require.Nil(t, me.VerifyDeadline)
}

// Không cấu hình xác minh (vd prod chưa có RESEND_API_KEY) thì không ai bị chặn.
func TestMeWithoutVerificationNeverRequires(t *testing.T) {
	users := newMemUserStore()
	svc := service.NewAuthService(users, newMemRefreshTokenStore(), auth.NewSigner("k", time.Minute), time.Hour)
	require.False(t, svc.VerificationEnabled())
	s, err := svc.Register(context.Background(), service.RegisterInput{Email: "a@example.com", Password: "long-enough-password"})
	require.NoError(t, err)
	users.setCreatedAt(s.User.ID, time.Now().Add(-30*24*time.Hour))

	me, err := svc.Me(context.Background(), s.User.ID)
	require.NoError(t, err)
	require.False(t, me.VerificationRequired)
	require.Nil(t, me.VerifyDeadline)
}

func TestMeUnknownUserIsUnauthorized(t *testing.T) {
	f := newVerifyFixture(t)
	_, err := f.svc.Me(context.Background(), 4242)
	requireCode(t, err, 1401)
}

// failLocaleUsers làm SetLocale luôn lỗi.
type failLocaleUsers struct{ *memUserStore }

func (failLocaleUsers) SetLocale(context.Context, int64, string) error {
	return errors.New("db hiccup")
}

// Regression (review K-56): ghi locale hỏng sau khi user ĐÃ được tạo không
// được làm hỏng đăng ký — đăng ký chỉ mở cho user đầu tiên, trả lỗi ở đây là
// khoá người đó ngoài cửa vĩnh viễn.
func TestRegisterSucceedsWhenSetLocaleFails(t *testing.T) {
	users := newMemUserStore()
	svc := service.NewAuthService(failLocaleUsers{users}, newMemRefreshTokenStore(), auth.NewSigner("k", time.Minute), time.Hour)
	s, err := svc.Register(context.Background(), service.RegisterInput{Email: "a@example.com", Password: "long-enough-password", Locale: "en"})
	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.Equal(t, "vi", s.User.Locale, "falls back to the column default")
}
