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
}

// Load đọc toàn bộ cấu hình. Trả lỗi thay vì giá trị mặc định ở những chỗ
// mà một mặc định sai sẽ đi thẳng vào production mà không ai nhận ra.
func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal@localhost:5432/journal?sslmode=disable"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Env:         env("ENV", "dev"),
	}
	if c.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET rỗng: API từ chối khởi động, không có khoá ký mặc định")
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
		return 0, fmt.Errorf("%s không phải khoảng thời gian hợp lệ (%q): %w", key, raw, err)
	}
	return d, nil
}
