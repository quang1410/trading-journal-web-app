package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type TradeRepo struct{ db *gorm.DB }

func NewTradeRepo(db *gorm.DB) *TradeRepo { return &TradeRepo{db: db} }

// ListByAccount trả mọi lệnh CHƯA xoá của account, sắp theo stt tăng dần.
//
// domain.Trade cố ý không có trường DeletedAt — nó chỉ mang thứ người dùng
// nhập — nên GORM KHÔNG tự lọc soft delete giúp. Điều kiện phải viết tay ở
// mọi truy vấn, và đó là lý do nó nằm ngay đây chứ không rải rác tầng trên.
func (r *TradeRepo) ListByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	var rows []domain.Trade
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND deleted_at IS NULL", accountID).
		Order("stt ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// ByID nạp lệnh KỂ CẢ đã xoá mềm. Restore cần đọc được lệnh đã xoá, và
// middleware kiểm quyền sở hữu cũng phải trả lời được cho lệnh trong thùng rác.
func (r *TradeRepo) ByID(ctx context.Context, id int64) (domain.Trade, error) {
	var t domain.Trade
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&t).Error
	return t, translate(err)
}

// Create cấp stt rồi chèn, trong MỘT transaction có khoá hàng account.
//
// Hai điểm sống còn:
//
//  1. Khoá `SELECT ... FOR UPDATE` trên hàng accounts. Thiếu nó thì hai
//     request đồng thời cùng đọc một max(stt) rồi cùng ghi giá trị đó.
//
//  2. max(stt) quét CẢ lệnh đã xoá mềm — không có `deleted_at IS NULL` ở
//     đây, và đó là chủ ý. Nếu chỉ đếm lệnh chưa xoá thì xoá lệnh cuối rồi
//     tạo lệnh mới sẽ cấp lại đúng stt vừa trống, và lúc người dùng khôi
//     phục lệnh cũ sẽ đụng UNIQUE (account_id, stt) — hỏng ở một chỗ cách
//     nguyên nhân nhiều thao tác.
//
// stt do người gọi đặt bị ghi đè, không báo lỗi: quy tắc 7 của CLAUDE.md.
func (r *TradeRepo) Create(ctx context.Context, t domain.Trade) (domain.Trade, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var khoa int64
		if err := tx.Raw(
			`SELECT id FROM accounts WHERE id = ? FOR UPDATE`, t.AccountID,
		).Scan(&khoa).Error; err != nil {
			return err
		}
		var next int
		if err := tx.Raw(
			`SELECT COALESCE(MAX(stt), 0) + 1 FROM trades WHERE account_id = ?`, t.AccountID,
		).Scan(&next).Error; err != nil {
			return err
		}
		t.STT = next
		return tx.Create(&t).Error
	})
	if err != nil {
		return domain.Trade{}, translate(err)
	}
	return t, nil
}

// ListDeletedByAccount trả các lệnh đang nằm trong thùng rác, mới xoá lên trước.
func (r *TradeRepo) ListDeletedByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	var rows []domain.Trade
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND deleted_at IS NOT NULL", accountID).
		Order("deleted_at DESC, stt DESC").
		Find(&rows).Error
	return rows, translate(err)
}

// UpdateFields ghi đúng những cột có trong fields.
//
// Nhận map chứ không nhận struct là chủ ý: PATCH phải phân biệt "không gửi
// trường này" với "gửi giá trị rỗng", mà struct thì không diễn đạt được —
// GORM bỏ qua mọi zero value khi Updates bằng struct, nên đặt notes = ""
// sẽ lặng lẽ không có tác dụng.
//
// updated_at đặt tay: cột có DEFAULT now() nhưng không có trigger, và
// domain.Trade không mang trường đó nên GORM không tự bump.
func (r *TradeRepo) UpdateFields(ctx context.Context, id int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	ghi := make(map[string]any, len(fields)+1)
	for k, v := range fields {
		ghi[k] = v
	}
	ghi["updated_at"] = gorm.Expr("now()")

	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(ghi)
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDelete đánh dấu đã xoá. `deleted_at IS NULL` trong WHERE khiến xoá lần
// hai trả ErrNotFound thay vì lặng lẽ báo thành công.
func (r *TradeRepo) SoftDelete(ctx context.Context, id int64) error {
	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]any{"deleted_at": gorm.Expr("now()"), "updated_at": gorm.Expr("now()")})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// Restore đưa lệnh ra khỏi thùng rác. `deleted_at IS NOT NULL` khiến khôi
// phục một lệnh chưa xoá trả ErrNotFound — im lặng chấp nhận sẽ che mất
// việc frontend đang gọi nhầm.
func (r *TradeRepo) Restore(ctx context.Context, id int64) error {
	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NOT NULL", id).
		Updates(map[string]any{"deleted_at": nil, "updated_at": gorm.Expr("now()")})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
