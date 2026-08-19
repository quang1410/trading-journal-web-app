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

// RevokeAllForUser giết mọi phiên còn sống của một user. Gọi khi phát hiện
// một token đã xoay vòng bị dùng lại. Điều kiện revoked_at IS NULL giữ nguyên
// thời điểm thu hồi của những token đã chết từ trước.
func (r *RefreshTokenRepo) RevokeAllForUser(ctx context.Context, userID int64, at time.Time) error {
	return translate(r.db.WithContext(ctx).Model(&RefreshTokenRow{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", at).Error)
}
