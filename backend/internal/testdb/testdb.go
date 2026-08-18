// Package testdb dựng một Postgres THẬT cho test của các tầng chạm DB.
// Chỉ file _test.go được import package này.
//
// Vì sao không dùng mock: hai lỗi mà Phase 1 phải hoãn lại — NULL round-trip
// của decimal và ràng buộc UNIQUE — đều vô hình với mock. Một test skip khi
// thiếu env trông y hệt một test pass.
package testdb

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"gorm.io/gorm"

	"journal/internal/repository"
)

var (
	once    sync.Once
	shared  *gorm.DB
	initErr error
)

// New trả kết nối tới Postgres thật đã chạy đủ migrations, dữ liệu đã sạch.
// Container khởi động một lần cho mỗi process test (mỗi package Go là một
// process, nên các package chạy song song mỗi cái một container).
func New(t *testing.T) *gorm.DB {
	t.Helper()
	once.Do(func() { shared, initErr = start() })
	if initErr != nil {
		t.Fatalf("dựng Postgres cho test: %v", initErr)
	}
	Truncate(t, shared)
	return shared
}

func start() (*gorm.DB, error) {
	ctx := context.Background()
	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("journal_test"),
		tcpostgres.WithUsername("journal"),
		tcpostgres.WithPassword("journal"),
		testcontainers.WithWaitStrategy(
			// Postgres in ra dòng này hai lần: một lần khi initdb xong, một
			// lần khi server thật sự sẵn sàng. Chờ lần thứ hai.
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		return nil, fmt.Errorf("khởi động container postgres: %w", err)
	}

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, fmt.Errorf("lấy connection string: %w", err)
	}

	db, err := repository.Open(dsn)
	if err != nil {
		return nil, err
	}
	if err := applyMigrations(db); err != nil {
		return nil, err
	}
	return db, nil
}

// applyMigrations chạy chính các file .up.sql mà production dùng, theo thứ tự
// tên. Cố ý không dùng AutoMigrate: test phải kiểm được cả CHECK constraint
// và UNIQUE index viết tay trong migration.
func applyMigrations(db *gorm.DB) error {
	dir := migrationsDir()
	files, err := filepath.Glob(filepath.Join(dir, "*.up.sql"))
	if err != nil {
		return fmt.Errorf("tìm migration: %w", err)
	}
	if len(files) == 0 {
		return fmt.Errorf("không tìm thấy migration nào trong %s", dir)
	}
	sort.Strings(files)
	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("đọc %s: %w", f, err)
		}
		if err := db.Exec(string(content)).Error; err != nil {
			return fmt.Errorf("chạy %s: %w", filepath.Base(f), err)
		}
	}
	return nil
}

func migrationsDir() string {
	_, thisFile, _, _ := runtime.Caller(0) // .../backend/internal/testdb/testdb.go
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
}

// Truncate xoá sạch dữ liệu, giữ nguyên schema. Danh sách bảng đọc từ
// pg_tables nên migration mới không cần sửa hàm này.
func Truncate(t *testing.T, db *gorm.DB) {
	t.Helper()
	var tables []string
	err := db.Raw(
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
	).Scan(&tables).Error
	if err != nil {
		t.Fatalf("liệt kê bảng: %v", err)
	}
	if len(tables) == 0 {
		t.Fatal("không có bảng nào — migration chưa chạy?")
	}
	quoted := make([]string, len(tables))
	for i, name := range tables {
		quoted[i] = fmt.Sprintf("%q", name)
	}
	// RESTART IDENTITY để id bắt đầu lại từ 1; CASCADE để khỏi lo thứ tự FK.
	stmt := fmt.Sprintf("TRUNCATE %s RESTART IDENTITY CASCADE", joinComma(quoted))
	if err := db.Exec(stmt).Error; err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}
