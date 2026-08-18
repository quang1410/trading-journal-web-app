package config_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/config"
)

// JWT_SECRET không có mặc định: một fallback tiện cho dev chính là đường một
// khoá ký đã biết đi thẳng vào production.
func TestLoadTuChoiKhiThieuJWTSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "JWT_SECRET")
}

func TestLoadDungMacDinhKhiThieuTTL(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")

	c, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 15*time.Minute, c.AccessTTL)
	require.Equal(t, 720*time.Hour, c.RefreshTTL)
	require.Equal(t, "8000", c.Port)
	require.Equal(t, "dev", c.Env)
	require.Empty(t, c.CORSOrigins)
}

func TestLoadDocTTLVaCORSTuEnv(t *testing.T) {
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

func TestLoadTuChoiTTLSaiDinhDang(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")
	t.Setenv("ACCESS_TTL", "mười lăm phút")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "ACCESS_TTL")
}
