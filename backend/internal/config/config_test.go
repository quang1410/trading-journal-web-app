package config_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/config"
)

// JWT_SECRET không có mặc định: một fallback tiện cho dev chính là đường một
// khoá ký đã biết đi thẳng vào production.
func TestLoadRejectsMissingJWTSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "JWT_SECRET")
}

func TestLoadUsesDefaultsWhenTTLMissing(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")

	c, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 15*time.Minute, c.AccessTTL)
	require.Equal(t, 720*time.Hour, c.RefreshTTL)
	require.Equal(t, "8000", c.Port)
	require.Equal(t, "dev", c.Env)
	require.Empty(t, c.CORSOrigins)
}

func TestLoadReadsTTLAndCORSFromEnv(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")
	t.Setenv("ACCESS_TTL", "5m")
	t.Setenv("REFRESH_TTL", "48h")
	t.Setenv("CORS_ORIGINS", "https://a.example, https://b.example")

	c, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 5*time.Minute, c.AccessTTL)
	require.Equal(t, 48*time.Hour, c.RefreshTTL)
	require.Equal(t, []string{"https://a.example", "https://b.example"}, c.CORSOrigins)
}

func TestLoadRejectsMalformedTTL(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")
	t.Setenv("ACCESS_TTL", "mười lăm phút")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "ACCESS_TTL")
}

// RATE_LIMIT_OFF chỉ để `make e2e` (một IP đăng nhập hơn 20 lần một phút) chạy
// được. Bật ở prod là mở toang login — từ chối khởi động.
func TestLoadRateLimitOffIsRefusedInProd(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("RATE_LIMIT_OFF", "1")

	c, err := config.Load()
	require.NoError(t, err)
	require.True(t, c.RateLimitOff)

	t.Setenv("ENV", "prod")
	_, err = config.Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "RATE_LIMIT_OFF")

	t.Setenv("ENV", "")
	t.Setenv("VERCEL", "1")
	_, err = config.Load()
	require.Error(t, err, "on Vercel even when ENV is not set")
}

func TestLoadRateLimitOnByDefault(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("RATE_LIMIT_OFF", "")

	c, err := config.Load()
	require.NoError(t, err)
	require.False(t, c.RateLimitOff)
}

// K-56: có RESEND_API_KEY thì gửi thật qua Resend.
func TestLoadMailModeResendWhenKeySet(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("RESEND_API_KEY", "re_123")
	t.Setenv("MAIL_FROM", "Journal <no-reply@x.io>")
	t.Setenv("APP_URL", "https://journal.x.io/")

	c, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, config.MailResend, c.MailMode)
	require.Equal(t, "re_123", c.ResendAPIKey)
	require.Equal(t, "Journal <no-reply@x.io>", c.MailFrom)
	require.Equal(t, "https://journal.x.io", c.AppURL, "trailing slash trimmed")
}

// Dev không có key: in thư ra log, link trỏ về Vite dev server.
func TestLoadMailModeLogInDevWithoutKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("APP_URL", "")
	t.Setenv("VERCEL", "")

	c, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, config.MailLog, c.MailMode)
	require.Equal(t, "http://localhost:5173", c.AppURL)
}

// Prod (hoặc bất kỳ deploy Vercel nào) thiếu key: TẮT xác minh, không từ chối
// khởi động. LogMailer ở đây sẽ chặn người dùng sau 7 ngày mà không có cách
// nào nhận được thư.
func TestLoadMailModeOffWhenDeployedWithoutKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("RESEND_API_KEY", "")

	t.Setenv("ENV", "prod")
	c, err := config.Load()
	require.NoError(t, err)
	require.Equal(t, config.MailOff, c.MailMode)

	t.Setenv("ENV", "")
	t.Setenv("VERCEL", "1")
	c, err = config.Load()
	require.NoError(t, err)
	require.Equal(t, config.MailOff, c.MailMode)
}

// Có key ở prod mà thiếu APP_URL hoặc MAIL_FROM là cấu hình sai rõ ràng:
// link trong thư sẽ trỏ về localhost, hoặc Resend từ chối người gửi.
func TestLoadRejectsHalfMailConfigInProd(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("ENV", "prod")
	t.Setenv("RESEND_API_KEY", "re_123")

	t.Setenv("MAIL_FROM", "Journal <no-reply@x.io>")
	t.Setenv("APP_URL", "")
	_, err := config.Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "APP_URL")

	t.Setenv("APP_URL", "https://journal.x.io")
	t.Setenv("MAIL_FROM", "")
	_, err = config.Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MAIL_FROM")
}
