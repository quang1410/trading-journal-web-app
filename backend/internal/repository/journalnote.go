package repository

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"journal/internal/domain"
)

type JournalNoteRepo struct{ db *gorm.DB }

func NewJournalNoteRepo(db *gorm.DB) *JournalNoteRepo { return &JournalNoteRepo{db: db} }

// ListByAccount trả ghi chú của MỘT kỳ, sắp theo khoá tăng dần.
//
// Khoá zero-pad nên thứ tự chuỗi trùng thứ tự thời gian; không cần ORDER BY
// nào phức tạp hơn.
func (r *JournalNoteRepo) ListByAccount(
	ctx context.Context, accountID int64, period domain.Period,
) ([]domain.JournalNote, error) {
	var rows []domain.JournalNote
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND period = ?", accountID, period).
		Order("period_key ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// Upsert ghi nội dung cho một kỳ, tạo mới nếu chưa có.
//
// ON CONFLICT trên đúng ràng buộc unique (account_id, period, period_key) —
// nên chính CSDL là thứ thực thi quy tắc một-ghi-chú-mỗi-kỳ. Một lần kiểm
// "đã tồn tại chưa" trong code sẽ bị hai request song song đi qua mặt: cả hai
// đọc thấy "chưa có", cả hai INSERT, một cái vỡ.
//
// Chỉ ghi đè body_html và updated_at. created_at giữ nguyên của lần đầu, nên
// "ghi chú này viết từ bao giờ" không bị mỗi lần sửa xoá mất.
func (r *JournalNoteRepo) Upsert(
	ctx context.Context, n domain.JournalNote,
) (domain.JournalNote, error) {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "account_id"}, {Name: "period"}, {Name: "period_key"},
			},
			DoUpdates: clause.Assignments(map[string]any{
				"body_html":  n.BodyHTML,
				"updated_at": gorm.Expr("now()"),
			}),
		}).
		Create(&n).Error
	if err != nil {
		return domain.JournalNote{}, translate(err)
	}
	// Đọc lại để trả về id và hai mốc thời gian THẬT của hàng trong bảng.
	// Nhánh DO UPDATE không nạp ngược created_at vào struct, nên trả `n` trần
	// sẽ báo một created_at bằng zero-time cho ghi chú vừa sửa.
	var saved domain.JournalNote
	err = r.db.WithContext(ctx).
		Where("account_id = ? AND period = ? AND period_key = ?", n.AccountID, n.Period, n.PeriodKey).
		First(&saved).Error
	if err != nil {
		return domain.JournalNote{}, translate(err)
	}
	return saved, nil
}

// DeleteOwned xoá CỨNG một ghi chú của account.
//
// RowsAffected == 0 nghĩa là không có hàng nào khớp CẢ ba cột. Ghi chú của
// account khác và ghi chú không tồn tại cho ra cùng một lỗi, cố ý: 404 không
// tiết lộ rằng ghi chú đó có thật.
func (r *JournalNoteRepo) DeleteOwned(
	ctx context.Context, accountID int64, ref domain.PeriodRef,
) error {
	res := r.db.WithContext(ctx).
		Where("account_id = ? AND period = ? AND period_key = ?", accountID, ref.Period, ref.Key).
		Delete(&domain.JournalNote{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
