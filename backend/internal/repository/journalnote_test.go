package repository_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// Upsert hai lần cùng khoá phải cho ra MỘT hàng mang nội dung lần sau. Đây là
// toàn bộ lý do dùng PUT thay vì POST+PATCH: client biết khoá trước, nên "tạo"
// và "sửa" là một thao tác.
func TestJournalNoteUpsertReplacesExisting(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note1@example.com", "JN1")

	first, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    domain.PeriodDay,
		PeriodKey: "2026-09-21",
		BodyHTML:  "<p>vào lệnh sớm</p>",
	})
	require.NoError(t, err)

	second, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    domain.PeriodDay,
		PeriodKey: "2026-09-21",
		BodyHTML:  "<p>bài học: chờ nến đóng</p>",
	})
	require.NoError(t, err)

	require.Equal(t, first.ID, second.ID, "upsert phải sửa hàng cũ, không tạo hàng mới")
	require.Equal(t, "<p>bài học: chờ nến đóng</p>", second.BodyHTML)
	// created_at giữ nguyên của lần đầu: "ghi chú này viết từ bao giờ" không bị
	// mỗi lần sửa xoá mất.
	require.Equal(t, first.CreatedAt.UnixMicro(), second.CreatedAt.UnixMicro())

	list, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	require.NoError(t, err)
	require.Len(t, list, 1)
}

// Cùng khoá ngày ở HAI kỳ khác nhau là hai ghi chú khác nhau.
func TestJournalNoteSeparatesPeriods(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note2@example.com", "JN2")

	_, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>ngày</p>",
	})
	require.NoError(t, err)
	_, err = repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodWeek, PeriodKey: "2026-W39", BodyHTML: "<p>tuần</p>",
	})
	require.NoError(t, err)

	days, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	require.NoError(t, err)
	require.Len(t, days, 1)
	require.Equal(t, "<p>ngày</p>", days[0].BodyHTML)

	weeks, err := repo.ListByAccount(ctx, accountID, domain.PeriodWeek)
	require.NoError(t, err)
	require.Len(t, weeks, 1)
	require.Equal(t, "<p>tuần</p>", weeks[0].BodyHTML)
}

// Ghi chú của account KHÁC không lọt vào danh sách.
func TestJournalNoteListIsScopedToAccount(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	mine := seedAccountID(t, db, "mine@example.com", "MINE")
	theirs := seedAccountID(t, db, "theirs@example.com", "THEIRS")

	_, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: theirs, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>của người khác</p>",
	})
	require.NoError(t, err)

	list, err := repo.ListByAccount(ctx, mine, domain.PeriodDay)
	require.NoError(t, err)
	require.Empty(t, list, "không được thấy ghi chú của account khác")
}

// Xoá ghi chú không tồn tại trả ErrNotFound, không phải nil.
func TestJournalNoteDeleteMissingReturnsNotFound(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note4@example.com", "JN4")

	err := repo.DeleteOwned(ctx, accountID, domain.PeriodRef{Period: domain.PeriodDay, Key: "2026-09-21"})
	require.ErrorIs(t, err, repository.ErrNotFound)
}

// Xoá ghi chú của account khác cũng là ErrNotFound — cố ý không phải Forbidden,
// để không tiết lộ rằng ghi chú đó có thật.
func TestJournalNoteDeleteOtherAccountReturnsNotFound(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	mine := seedAccountID(t, db, "mine5@example.com", "MINE5")
	theirs := seedAccountID(t, db, "theirs5@example.com", "THEIRS5")

	_, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: theirs, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>x</p>",
	})
	require.NoError(t, err)

	require.ErrorIs(t,
		repo.DeleteOwned(ctx, mine, domain.PeriodRef{Period: domain.PeriodDay, Key: "2026-09-21"}),
		repository.ErrNotFound)

	// Ghi chú của họ vẫn còn nguyên.
	list, err := repo.ListByAccount(ctx, theirs, domain.PeriodDay)
	require.NoError(t, err)
	require.Len(t, list, 1)
}

// Danh sách sắp theo khoá TĂNG DẦN, và vì khoá zero-pad nên đó cũng là thứ tự
// thời gian.
func TestJournalNoteListIsSortedByKey(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note6@example.com", "JN6")

	for _, key := range []string{"2026-09-22", "2026-09-02", "2026-09-11"} {
		_, err := repo.Upsert(ctx, domain.JournalNote{
			AccountID: accountID, Period: domain.PeriodDay, PeriodKey: key, BodyHTML: "<p>x</p>",
		})
		require.NoError(t, err)
	}

	list, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	require.NoError(t, err)
	require.Equal(t,
		[]string{"2026-09-02", "2026-09-11", "2026-09-22"},
		[]string{list[0].PeriodKey, list[1].PeriodKey, list[2].PeriodKey})
}

// Xoá account cuốn theo ghi chú của nó (ON DELETE CASCADE).
func TestJournalNoteCascadesOnAccountDelete(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note7@example.com", "JN7")

	_, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>x</p>",
	})
	require.NoError(t, err)

	require.NoError(t, db.Exec("DELETE FROM accounts WHERE id = ?", accountID).Error)

	var count int64
	require.NoError(t,
		db.Model(&domain.JournalNote{}).Where("account_id = ?", accountID).Count(&count).Error)
	require.Zero(t, count, "ghi chú phải bị xoá theo account")
}

// Chính CSDL chặn dòng thứ hai cùng (account_id, period, period_key) — không
// phải Upsert. INSERT thẳng bỏ qua ON CONFLICT để thấy unique index từ chối.
func TestJournalNoteUniqueIndexRejectsDuplicateInsert(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	accountID := seedAccountID(t, db, "note8@example.com", "JN8")

	_, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>x</p>",
	})
	require.NoError(t, err)

	err = db.Create(&domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>y</p>",
	}).Error
	require.Error(t, err, "unique index must reject a second row for the same period")
}
