package repository_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/testdb"
)

var errRollback = errors.New("rollback")

func readMigration(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
	require.NoError(t, err)
	return string(b)
}

// User có từ trước migration 0010 (chủ dự án) được coi là đã xác minh, nên
// không bị chặn sau thời gian ân hạn. Chạy down rồi up trong MỘT transaction
// và rollback: DDL của Postgres có transaction, schema dùng chung không đổi.
func TestMigration0010MarksExistingUsersVerified(t *testing.T) {
	db := testdb.New(t)
	created := time.Date(2026, 8, 16, 1, 2, 3, 0, time.UTC)

	err := db.Transaction(func(tx *gorm.DB) error {
		require.NoError(t, tx.Exec(readMigration(t, "0010_email_verification.down.sql")).Error)
		require.NoError(t, tx.Exec(`INSERT INTO users (email, password_hash, created_at, updated_at)
			VALUES ('owner@example.com', 'h', ?, ?)`, created, created).Error)
		require.NoError(t, tx.Exec(readMigration(t, "0010_email_verification.up.sql")).Error)

		var row struct {
			Locale          string
			EmailVerifiedAt *time.Time
		}
		require.NoError(t, tx.Raw(`SELECT locale, email_verified_at FROM users WHERE email = 'owner@example.com'`).Scan(&row).Error)
		require.Equal(t, "vi", row.Locale)
		require.NotNil(t, row.EmailVerifiedAt)
		require.True(t, row.EmailVerifiedAt.Equal(created))

		// User tạo SAU migration thì chưa xác minh.
		require.NoError(t, tx.Exec(`INSERT INTO users (email, password_hash) VALUES ('new@example.com', 'h')`).Error)
		var fresh struct{ EmailVerifiedAt *time.Time }
		require.NoError(t, tx.Raw(`SELECT email_verified_at FROM users WHERE email = 'new@example.com'`).Scan(&fresh).Error)
		require.Nil(t, fresh.EmailVerifiedAt)

		// CHECK locale. Lỗi làm hỏng transaction — để cuối, rồi rollback.
		require.Error(t, tx.Exec(`UPDATE users SET locale = 'fr'`).Error)
		return errRollback
	})
	require.ErrorIs(t, err, errRollback)
}
