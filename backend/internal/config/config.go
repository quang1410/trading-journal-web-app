// Package config đọc cấu hình từ biến môi trường.
package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
}

func Load() Config {
	return Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal@localhost:5432/journal?sslmode=disable"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
