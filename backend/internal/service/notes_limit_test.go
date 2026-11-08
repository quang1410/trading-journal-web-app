package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

var (
	notesAtLimit   = strings.Repeat("ắ", domain.MaxNotesLen)
	notesOverLimit = strings.Repeat("ắ", domain.MaxNotesLen+1)
)

func requireValidation(t *testing.T, err error, msg string) {
	t.Helper()
	e := apperr.As(err)
	require.NotNil(t, e, "want a business error, not a 500: %v", err)
	require.Equal(t, 400, e.Status)
	require.Equal(t, msg, e.Msg)
}

func TestCreateRejectsNotesOverLimit(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()

	in := validInput()
	in.Notes = notesOverLimit
	_, err := svc.Create(ctx, acc, in)
	requireValidation(t, err, "ghi chú dài quá 131072 ký tự")

	in.Notes = notesAtLimit
	_, err = svc.Create(ctx, acc, in)
	require.NoError(t, err)
}

// PATCH không đi qua ValidateTrade — trần phải được kiểm riêng ở patchToFields,
// nếu không sửa lệnh là đường lách trần.
func TestUpdateRejectsNotesOverLimit(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	err = svc.Update(ctx, tr.ID, service.TradePatch{Notes: label(notesOverLimit)})
	requireValidation(t, err, "ghi chú dài quá 131072 ký tự")

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{Notes: label(notesAtLimit)}))
}

// Dữ liệu cũ có thể đã vượt trần (import hoặc API trước K-03). Sửa trường KHÁC
// vẫn phải được — chỉ chạm vào chính ghi chú mới buộc rút ngắn.
func TestUpdateOtherFieldOnLegacyOverLimitNotesSucceeds(t *testing.T) {
	svc, acc, trades, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	row := trades.rows[tr.ID]
	row.Notes = notesOverLimit
	trades.rows[tr.ID] = row

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		Exit: label(decimal.RequireFromString("2400")),
	}))
}

func TestJournalNoteSaveRejectsBodyOverLimit(t *testing.T) {
	ctx := context.Background()
	svc := newJournalNoteSvc()

	_, _, err := svc.Save(ctx, 1, "day", "2026-09-21", "<p>"+notesOverLimit+"</p>")
	requireValidation(t, err, "ghi chú dài quá 131072 ký tự")

	// Thẻ <p></p> cũng là ký tự của nội dung lưu xuống — đo đúng chuỗi sẽ lưu.
	body := "<p>" + strings.Repeat("ắ", domain.MaxNotesLen-len("<p></p>")) + "</p>"
	_, _, err = svc.Save(ctx, 1, "day", "2026-09-21", body)
	require.NoError(t, err)

	// Đo sau trim thì phải LƯU sau trim: không thì một body đủ trần cộng cả
	// megabyte khoảng trắng qua được kiểm tra rồi nằm nguyên trong DB.
	saved, _, err := svc.Save(ctx, 1, "day", "2026-09-22", "\n "+body+strings.Repeat(" ", 100_000))
	require.NoError(t, err)
	require.Equal(t, body, saved.BodyHTML)
}
