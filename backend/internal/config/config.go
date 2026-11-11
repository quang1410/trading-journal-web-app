// Package config đọc cấu hình từ biến môi trường.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	CORSOrigins []string
	Env         string // "dev" | "prod"; quyết định cookie có Secure hay không
	// CronSecret: Vercel Cron gửi kèm "Authorization: Bearer <CRON_SECRET>". Rỗng thì
	// không gắn route cron — không có mặc định, vì mặc định đoán được là ai cũng gọi được.
	CronSecret string
	// RateLimitOff tắt ngưỡng theo IP, chỉ cho stack E2E. Cấm ở prod.
	RateLimitOff bool

	// Thư hệ thống (K-56). MailMode quyết định có bật xác minh email không.
	MailMode     MailMode
	ResendAPIKey string
	MailFrom     string
	// AppURL là gốc của frontend, dùng dựng link trong thư. Không có "/" cuối.
	AppURL string
}

// MailMode là cách gửi thư hệ thống.
type MailMode string

const (
	// MailResend: gửi thật qua Resend, bật xác minh email.
	MailResend MailMode = "resend"
	// MailLog: chỉ in thư ra log (dev không có key). Vẫn bật xác minh để thử được.
	MailLog MailMode = "log"
	// MailOff: đã deploy mà chưa có key. Không gửi thư, TẮT xác minh — bật mà
	// không gửi được thư là khoá người dùng ngoài sau thời gian ân hạn.
	MailOff MailMode = "off"
)

// Load đọc toàn bộ cấu hình. Trả lỗi thay vì giá trị mặc định ở những chỗ
// mà một mặc định sai sẽ đi thẳng vào production mà không ai nhận ra.
func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal@localhost:5432/journal?sslmode=disable"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Env:         env("ENV", "dev"),
		CronSecret:  os.Getenv("CRON_SECRET"),

		RateLimitOff: os.Getenv("RATE_LIMIT_OFF") == "1",
	}
	if c.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET is empty: refusing to start without a signing key (there is no default)")
	}
	// Vercel luôn đặt VERCEL=1 lúc chạy: chặn cả khi ai đó quên ENV=prod ở đó.
	if c.RateLimitOff && (c.Env == "prod" || os.Getenv("VERCEL") != "") {
		return Config{}, errors.New("RATE_LIMIT_OFF is set in production (ENV=prod or VERCEL): refusing to start with login rate limits disabled")
	}

	if err := loadMail(&c); err != nil {
		return Config{}, err
	}

	var err error
	if c.AccessTTL, err = dur("ACCESS_TTL", 15*time.Minute); err != nil {
		return Config{}, err
	}
	if c.RefreshTTL, err = dur("REFRESH_TTL", 720*time.Hour); err != nil {
		return Config{}, err
	}

	if raw := os.Getenv("CORS_ORIGINS"); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				c.CORSOrigins = append(c.CORSOrigins, trimmed)
			}
		}
	}
	return c, nil
}

// loadMail đọc cấu hình thư. "Đã deploy" là ENV=prod hoặc đang chạy trên
// Vercel (Vercel luôn đặt VERCEL=1), cùng luật với RATE_LIMIT_OFF.
func loadMail(c *Config) error {
	deployed := c.Env == "prod" || os.Getenv("VERCEL") != ""
	c.ResendAPIKey = os.Getenv("RESEND_API_KEY")
	c.MailFrom = os.Getenv("MAIL_FROM")
	c.AppURL = strings.TrimRight(os.Getenv("APP_URL"), "/")

	switch {
	case c.ResendAPIKey != "":
		c.MailMode = MailResend
	case deployed:
		c.MailMode = MailOff
	default:
		c.MailMode = MailLog
	}

	if !deployed {
		if c.AppURL == "" {
			c.AppURL = "http://localhost:5173"
		}
		if c.MailFrom == "" {
			c.MailFrom = "Trading journal <onboarding@resend.dev>"
		}
		return nil
	}
	if c.MailMode == MailResend {
		if c.AppURL == "" {
			return errors.New("APP_URL is empty while RESEND_API_KEY is set: verification links would point nowhere")
		}
		if c.MailFrom == "" {
			return errors.New("MAIL_FROM is empty while RESEND_API_KEY is set: Resend needs a verified sender")
		}
	}
	return nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func dur(key string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s is not a valid duration (%q): %w", key, raw, err)
	}
	return d, nil
}
