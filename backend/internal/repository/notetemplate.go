package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type NoteTemplateRepo struct{ db *gorm.DB }

func NewNoteTemplateRepo(db *gorm.DB) *NoteTemplateRepo { return &NoteTemplateRepo{db: db} }

func (r *NoteTemplateRepo) ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error) {
	var rows []domain.NoteTemplate
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("position ASC, id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// Create cấp position trong TRANSACTION.
//
// max(position)+1 là một lượt đọc-rồi-ghi: hai request song song của cùng một
// user mà không có tx sẽ đọc cùng một max rồi cấp cùng một position.
func (r *NoteTemplateRepo) Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var maxPos *int
		if err := tx.Model(&domain.NoteTemplate{}).
			Where("user_id = ?", t.UserID).
			Select("MAX(position)").
			Scan(&maxPos).Error; err != nil {
			return err
		}
		// Người gọi đặt Position thì bỏ qua — quy tắc 7, giống stt của trade.
		t.Position = 1
		if maxPos != nil {
			t.Position = *maxPos + 1
		}
		return tx.Create(&t).Error
	})
	if err != nil {
		return domain.NoteTemplate{}, translate(err)
	}
	return t, nil
}

func (r *NoteTemplateRepo) UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	res := r.db.WithContext(ctx).
		Model(&domain.NoteTemplate{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(fields)
	if res.Error != nil {
		return translate(res.Error)
	}
	// RowsAffected == 0 nghĩa là không có hàng nào khớp CẢ id lẫn user_id. Mẫu
	// của người khác và mẫu không tồn tại cho ra cùng một lỗi, cố ý: 404 không
	// tiết lộ rằng mẫu đó có thật.
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteOwned xoá CỨNG. note_templates không có deleted_at: quy tắc soft
// delete chỉ áp cho trades, vì xoá cứng lệnh làm sai đường equity. Mẫu ghi chú
// không nằm trong dãy lũy kế theo stt.
func (r *NoteTemplateRepo) DeleteOwned(ctx context.Context, id, userID int64) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&domain.NoteTemplate{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderOwned gán lại position theo thứ tự của ids, ALL-OR-NOTHING.
//
// Mỗi lượt Update mang thêm "AND user_id = ?" và đếm RowsAffected: một id
// không thuộc user làm cả transaction rollback, nên không có trạng thái nửa
// vời nào lọt ra ngoài.
func (r *NoteTemplateRepo) ReorderOwned(ctx context.Context, userID int64, ids []int64) error {
	return translate(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, id := range ids {
			res := tx.Model(&domain.NoteTemplate{}).
				Where("id = ? AND user_id = ?", id, userID).
				Update("position", i+1)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return ErrNotFound
			}
		}
		return nil
	}))
}
