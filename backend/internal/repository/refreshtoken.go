package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// RefreshTokenRow ánh xạ bảng refresh_tokens.
// RevokedAt là con trỏ: NULL nghĩa là token còn sống.
type RefreshTokenRow struct {
	ID        int64      `gorm:"column:id;primaryKey"`
	UserID    int64      `gorm:"column:user_id"`
	TokenHash string     `gorm:"column:token_hash"`
	ExpiresAt time.Time  `gorm:"column:expires_at"`
	RevokedAt *time.Time `gorm:"column:revoked_at"`
	CreatedAt time.Time  `gorm:"column:created_at"`
}

func (RefreshTokenRow) TableName() string { return "refresh_tokens" }

type RefreshTokenRepo struct{ db *gorm.DB }

func NewRefreshTokenRepo(db *gorm.DB) *RefreshTokenRepo { return &RefreshTokenRepo{db: db} }

func (r *RefreshTokenRepo) Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error {
	row := RefreshTokenRow{UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt}
	return translate(r.db.WithContext(ctx).Create(&row).Error)
}

func (r *RefreshTokenRepo) ByHash(ctx context.Context, tokenHash string) (RefreshTokenRow, error) {
	var row RefreshTokenRow
	err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&row).Error
	return row, translate(err)
}

// Revoke đánh dấu một token là đã thu hồi. Cố ý KHÔNG xoá bản ghi: bản ghi
// đã thu hồi chính là thứ để phát hiện token bị đánh cắp rồi dùng lại.
func (r *RefreshTokenRepo) Revoke(ctx context.Context, id int64, at time.Time) error {
	return translate(r.db.WithContext(ctx).Model(&RefreshTokenRow{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", at).Error)
}

// Rotate thu hồi token cũ và lưu token mới trong MỘT transaction. Trả false,
// không lưu gì, khi token cũ đã bị thu hồi trước đó — tức một request khác đã
// xoay nó: bên gọi phải coi đây là tái sử dụng.
//
// Vì sao phải chung transaction: UPDATE giữ khoá dòng tới lúc COMMIT, nên
// request song song cùng token phải chờ rồi thấy 0 dòng. Lúc đó token mới của
// bên thắng ĐÃ nằm trong DB, và RevokeAllForUser của bên thua thu hồi được nó.
// Tách thành Revoke rồi Create thì RevokeAllForUser có thể chạy lọt vào giữa
// hai bước và bỏ sót token mới — kẻ thắng cuộc đua giữ được phiên.
func (r *RefreshTokenRepo) Rotate(ctx context.Context, oldID, userID int64, newHash string, newExpiry, at time.Time) (bool, error) {
	rotated := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// user_id nằm trong điều kiện để cặp oldID/userID lệch nhau ra false,
		// không lặng lẽ cấp token mới cho một user khác.
		res := tx.Model(&RefreshTokenRow{}).
			Where("id = ? AND user_id = ? AND revoked_at IS NULL", oldID, userID).
			Update("revoked_at", at)
		if res.Error != nil {
			return res.Error
		}
		// Thua cuộc đua: commit một transaction không đổi gì, rotated vẫn false.
		if res.RowsAffected == 0 {
			return nil
		}
		row := RefreshTokenRow{UserID: userID, TokenHash: newHash, ExpiresAt: newExpiry}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		rotated = true
		return nil
	})
	return rotated, translate(err)
}

// RevokeAllForUser giết mọi phiên còn sống của một user. Gọi khi phát hiện
// một token đã xoay vòng bị dùng lại. Điều kiện revoked_at IS NULL giữ nguyên
// thời điểm thu hồi của những token đã chết từ trước.
func (r *RefreshTokenRepo) RevokeAllForUser(ctx context.Context, userID int64, at time.Time) error {
	return translate(r.db.WithContext(ctx).Model(&RefreshTokenRow{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", at).Error)
}
