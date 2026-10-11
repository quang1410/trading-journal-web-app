package repository_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// Hai người bấm cùng lúc (hoặc một người bấm hai lần) với cùng email phải ra
// đúng một dòng và không request nào lỗi. Đây là lý do dùng ON CONFLICT thay
// vì "đọc xem có chưa rồi mới ghi".
func TestWaitlistInsertConcurrentSameEmailKeepsOneRow(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewWaitlistRepo(db)

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.Insert(ctx, domain.WaitlistSignup{Email: "race@example.com", Locale: "vi"})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	var n int64
	require.NoError(t, db.Model(&domain.WaitlistSignup{}).Where("email = ?", "race@example.com").Count(&n).Error)
	require.EqualValues(t, 1, n)
}

// CHECK của DB là lưới cuối: domain.ParseAnswers đã chặn mã lạ, nhưng một
// đường ghi khác trong tương lai không được lách qua được.
func TestWaitlistDatabaseRejectsUnknownJournalTool(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewWaitlistRepo(db)
	require.NoError(t, repo.Insert(ctx, domain.WaitlistSignup{Email: "a@example.com", Locale: "vi"}))

	bad := "excel"
	err := repo.SaveAnswers(ctx, "a@example.com", domain.WaitlistAnswers{JournalTool: &bad})
	require.Error(t, err)
}
