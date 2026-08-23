// Package repository là tầng DUY NHẤT được phép chạm GORM. Mọi tầng trên nó
// nhận và trả kiểu của domain hoặc kiểu row khai báo tại đây.
package repository

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Lỗi quy ước của tầng repository. Tầng service dịch chúng sang apperr —
// repository không biết gì về HTTP status.
var (
	ErrNotFound  = errors.New("không tìm thấy bản ghi")
	ErrDuplicate = errors.New("bản ghi đã tồn tại")
)

// Open mở kết nối tới Postgres.
//
// TranslateError bật để lỗi 23505 của Postgres về thành gorm.ErrDuplicatedKey,
// nhờ vậy repository không phải import driver pgx chỉ để đọc mã lỗi.
func Open(dsn string) (*gorm.DB, error) {
	// Supabase transaction pooler does not support prepared statements. Simple
	// protocol also makes the same connection string work across serverless
	// instances without pinning a prepared statement to a pooled connection.
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger:         logger.Default.LogMode(logger.Silent),
		TranslateError: true,
	})
	if err != nil {
		return nil, fmt.Errorf("mở database: %w", err)
	}

	// Keep the per-instance pool small because Vercel can run several API
	// instances concurrently against the same Supabase project.
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("lấy connection pool: %w", err)
	}
	sqlDB.SetMaxOpenConns(5)
	sqlDB.SetMaxIdleConns(2)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(1 * time.Minute)

	return db, nil
}

// translate đổi lỗi GORM sang lỗi quy ước của package này.
func translate(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		return ErrNotFound
	case errors.Is(err, gorm.ErrDuplicatedKey):
		return ErrDuplicate
	default:
		return err
	}
}
