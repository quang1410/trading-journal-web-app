package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

func newJournalNoteSvc() *service.JournalNoteService {
	return service.NewJournalNoteService(newMemJournalNoteStore())
}

func TestJournalNoteSaveRejectsBadPeriod(t *testing.T) {
	_, _, err := newJournalNoteSvc().Save(context.Background(), 1, "month", "2026-09", "<p>x</p>")
	require.Error(t, err)
}

func TestJournalNoteSaveRejectsBadKey(t *testing.T) {
	_, _, err := newJournalNoteSvc().Save(context.Background(), 1, "day", "21/09/2026", "<p>x</p>")
	require.Error(t, err)
}

// Body rỗng là lệnh XOÁ: người dùng xoá sạch chữ rồi lưu thì kỳ vọng ghi chú
// biến mất, không phải một bản ghi rỗng làm thẻ hiện một mục trống.
func TestJournalNoteSaveWithEmptyBodyDeletes(t *testing.T) {
	ctx := context.Background()
	svc := newJournalNoteSvc()

	_, _, err := svc.Save(ctx, 1, "day", "2026-09-21", "<p>có nội dung</p>")
	require.NoError(t, err)

	_, deleted, err := svc.Save(ctx, 1, "day", "2026-09-21", "  ")
	require.NoError(t, err)
	require.True(t, deleted)

	list, err := svc.List(ctx, 1, "day")
	require.NoError(t, err)
	require.Empty(t, list)
}

// HTML rỗng của Quill cũng là XOÁ (QĐ-6). Trước đây chỉ TrimSpace nên một
// request gọi thẳng API với "<p><br></p>" lưu ra một bản ghi rỗng.
func TestJournalNoteSaveWithQuillEmptyHTMLDeletes(t *testing.T) {
	ctx := context.Background()
	svc := newJournalNoteSvc()

	_, _, err := svc.Save(ctx, 1, "day", "2026-09-21", "<p>có nội dung</p>")
	require.NoError(t, err)

	_, deleted, err := svc.Save(ctx, 1, "day", "2026-09-21", "<p><br></p>")
	require.NoError(t, err)
	require.True(t, deleted)

	list, err := svc.List(ctx, 1, "day")
	require.NoError(t, err)
	require.Empty(t, list)
}

// Xoá một ghi chú CHƯA từng tồn tại bằng body rỗng KHÔNG phải lỗi: kết quả
// mong muốn — kỳ đó không có ghi chú — đã đúng sẵn.
func TestJournalNoteSaveEmptyOnMissingIsNotAnError(t *testing.T) {
	_, deleted, err := newJournalNoteSvc().Save(context.Background(), 1, "day", "2026-09-21", "")
	require.NoError(t, err)
	require.True(t, deleted)
}

func TestJournalNoteListRejectsBadPeriod(t *testing.T) {
	_, err := newJournalNoteSvc().List(context.Background(), 1, "month")
	require.Error(t, err)
}

func TestJournalNoteSaveThenList(t *testing.T) {
	ctx := context.Background()
	svc := newJournalNoteSvc()

	saved, deleted, err := svc.Save(ctx, 1, "week", "2026-W39", "<p>tuần tốt</p>")
	require.NoError(t, err)
	require.False(t, deleted)
	require.Equal(t, "<p>tuần tốt</p>", saved.BodyHTML)

	list, err := svc.List(ctx, 1, "week")
	require.NoError(t, err)
	require.Len(t, list, 1)
}

// Delete KHÁC Save-với-body-rỗng ở đúng một chỗ: ở đây "không có gì để xoá" LÀ
// lỗi 404, vì người dùng chủ động bấm xoá một thứ họ tin là đang tồn tại.
func TestJournalNoteDeleteMissingIsNotFound(t *testing.T) {
	err := newJournalNoteSvc().Delete(context.Background(), 1, "day", "2026-09-21")
	require.Error(t, err)
}

// Ghi chú của hai account KHÔNG đụng nhau dù cùng khoá kỳ.
func TestJournalNoteIsScopedToAccount(t *testing.T) {
	ctx := context.Background()
	svc := newJournalNoteSvc()

	_, _, err := svc.Save(ctx, 1, "day", "2026-09-21", "<p>account 1</p>")
	require.NoError(t, err)
	_, _, err = svc.Save(ctx, 2, "day", "2026-09-21", "<p>account 2</p>")
	require.NoError(t, err)

	list, err := svc.List(ctx, 1, "day")
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, "<p>account 1</p>", list[0].BodyHTML)
}
