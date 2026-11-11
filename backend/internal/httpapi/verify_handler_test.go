package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/mailer"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

type verifyEnv struct {
	srv     *httptest.Server
	db      *gorm.DB
	mail    *mailer.LogMailer
	token   string // access token của user vừa đăng ký
	refresh string // refresh token thô
	userID  int64
}

// verifyServer dựng router với xác minh email BẬT, đăng ký sẵn một user.
func verifyServer(t *testing.T) *verifyEnv {
	t.Helper()
	db := testdb.New(t)
	signer := auth.NewSigner("test-key", 15*time.Minute)
	mail := &mailer.LogMailer{}
	authSvc := service.NewAuthService(repository.NewUserRepo(db), repository.NewRefreshTokenRepo(db), signer, 720*time.Hour).
		WithEmailVerification(repository.NewEmailTokenRepo(db), mail, "https://app.example.com")
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Auth:     authSvc,
		Limiter:  service.NewRateLimiter(repository.NewCounterRepo(db)),
		Account:  accountSvc,
		CashFlow: service.NewCashFlowService(repository.NewCashFlowRepo(db), accountSvc),
		Signer:   signer,
	}))
	t.Cleanup(srv.Close)

	s, err := authSvc.Register(context.Background(), service.RegisterInput{
		Email: "trader@example.com", Password: "long-enough-password", Locale: "en",
	})
	require.NoError(t, err)
	return &verifyEnv{srv: srv, db: db, mail: mail, token: s.AccessToken, refresh: s.RefreshToken, userID: s.User.ID}
}

var verifyTokenRe = regexp.MustCompile(`verify-email\?token=([A-Za-z0-9_-]+)`)

func (e *verifyEnv) lastMailToken(t *testing.T) string {
	t.Helper()
	sent := e.mail.Sent()
	require.NotEmpty(t, sent)
	m := verifyTokenRe.FindStringSubmatch(sent[len(sent)-1].Text)
	require.Len(t, m, 2)
	return m[1]
}

func (e *verifyEnv) ageUser(t *testing.T, d time.Duration) {
	t.Helper()
	require.NoError(t, e.db.Exec(`UPDATE users SET created_at = ? WHERE id = ?`, time.Now().Add(-d), e.userID).Error)
}

type meBody struct {
	ID                   int64      `json:"id"`
	Email                string     `json:"email"`
	Locale               string     `json:"locale"`
	EmailVerified        bool       `json:"email_verified"`
	VerifyDeadline       *time.Time `json:"verify_deadline"`
	VerificationRequired bool       `json:"verification_required"`
}

func (e *verifyEnv) me(t *testing.T) meBody {
	t.Helper()
	resp, env := do(t, http.MethodGet, e.srv.URL+"/api/auth/me", e.token, "")
	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	var m meBody
	require.NoError(t, json.Unmarshal(env.Data, &m))
	return m
}

func TestMeInsideGracePeriod(t *testing.T) {
	e := verifyServer(t)
	m := e.me(t)
	require.Equal(t, e.userID, m.ID)
	require.Equal(t, "trader@example.com", m.Email)
	require.Equal(t, "en", m.Locale)
	require.False(t, m.EmailVerified)
	require.False(t, m.VerificationRequired)
	require.NotNil(t, m.VerifyDeadline)

	resp, _ := do(t, http.MethodGet, e.srv.URL+"/api/accounts", e.token, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMeRequiresAuth(t *testing.T) {
	e := verifyServer(t)
	resp, _ := do(t, http.MethodGet, e.srv.URL+"/api/auth/me", "", "")
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestUnverifiedUserIsBlockedAfterGracePeriodButAuthStillWorks(t *testing.T) {
	e := verifyServer(t)
	e.ageUser(t, 8*24*time.Hour)

	resp, env := do(t, http.MethodGet, e.srv.URL+"/api/accounts", e.token, "")
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1460, env.Code)

	require.True(t, e.me(t).VerificationRequired)

	// refresh vẫn chạy: không được đá người dùng ra chỉ vì chưa xác minh.
	req, err := http.NewRequest(http.MethodPost, e.srv.URL+"/api/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: e.refresh})
	rr, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	_ = rr.Body.Close()
	require.Equal(t, http.StatusOK, rr.StatusCode)

	// Gửi lại thư vẫn được, rồi xác minh xong thì mở khoá.
	resp, env = do(t, http.MethodPost, e.srv.URL+"/api/auth/verify/request", e.token, `{"locale":"vi"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	require.Len(t, e.mail.Sent(), 2)
	require.Equal(t, mailer.VerifyEmail("x", "vi", "y").Subject, e.mail.Sent()[1].Subject)

	resp, env = do(t, http.MethodPost, e.srv.URL+"/api/auth/verify", "", `{"token":"`+e.lastMailToken(t)+`"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)

	resp, _ = do(t, http.MethodGet, e.srv.URL+"/api/accounts", e.token, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	m := e.me(t)
	require.True(t, m.EmailVerified)
	require.Nil(t, m.VerifyDeadline)
}

func TestVerifyIsPublicAndRejectsBadOrReusedToken(t *testing.T) {
	e := verifyServer(t)
	resp, env := do(t, http.MethodPost, e.srv.URL+"/api/auth/verify", "", `{"token":"nope"}`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)

	tok := e.lastMailToken(t)
	resp, _ = do(t, http.MethodPost, e.srv.URL+"/api/auth/verify", "", `{"token":"`+tok+`"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp, _ = do(t, http.MethodPost, e.srv.URL+"/api/auth/verify", "", `{"token":"`+tok+`"}`)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestVerifyRequestNeedsAuthAndIsConflictWhenVerified(t *testing.T) {
	e := verifyServer(t)
	resp, _ := do(t, http.MethodPost, e.srv.URL+"/api/auth/verify/request", "", `{"locale":"en"}`)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	resp, _ = do(t, http.MethodPost, e.srv.URL+"/api/auth/verify", "", `{"token":"`+e.lastMailToken(t)+`"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp, env := do(t, http.MethodPost, e.srv.URL+"/api/auth/verify/request", e.token, `{"locale":"en"}`)
	require.Equal(t, http.StatusConflict, resp.StatusCode)
	require.Equal(t, 1409, env.Code)
}

// Không bật xác minh: không gắn route verify, không ai bị chặn, /me vẫn có.
func TestVerificationOffKeepsOldBehaviour(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	resp, _ := do(t, http.MethodPost, srv.URL+"/api/auth/verify", "", `{"token":"x"}`)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp, env := do(t, http.MethodGet, srv.URL+"/api/auth/me", tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var m meBody
	require.NoError(t, json.Unmarshal(env.Data, &m))
	require.False(t, m.VerificationRequired)
	require.Nil(t, m.VerifyDeadline)
}
