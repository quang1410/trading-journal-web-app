package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// EmailTokenRow ánh xạ bảng email_tokens (K-56).
type EmailTokenRow struct {
	ID        int64      `gorm:"column:id;primaryKey"`
	UserID    int64      `gorm:"column:user_id"`
	Purpose   string     `gorm:"column:purpose"`
	TokenHash string     `gorm:"column:token_hash"`
	ExpiresAt time.Time  `gorm:"column:expires_at"`
	UsedAt    *time.Time `gorm:"column:used_at"`
	CreatedAt time.Time  `gorm:"column:created_at"`
}

func (EmailTokenRow) TableName() string { return "email_tokens" }

type EmailTokenRepo struct{ db *gorm.DB }

func NewEmailTokenRepo(db *gorm.DB) *EmailTokenRepo { return &EmailTokenRepo{db: db} }

func (r *EmailTokenRepo) Create(ctx context.Context, userID int64, purpose, tokenHash string, expiresAt time.Time) error {
	row := EmailTokenRow{UserID: userID, Purpose: purpose, TokenHash: tokenHash, ExpiresAt: expiresAt}
	return translate(r.db.WithContext(ctx).Create(&row).Error)
}

// ConsumeVerify đánh dấu token xác minh là đã dùng VÀ đặt mốc xác minh của
// user trong MỘT transaction.
//
// Điều kiện "chưa dùng, còn hạn" nằm ngay trong UPDATE ... RETURNING: hai
// request song song cùng token thì chỉ một bên thấy dòng, bên kia nhận
// ErrNotFound. COALESCE giữ mốc xác minh ĐẦU TIÊN khi user bấm link thứ hai.
func (r *EmailTokenRepo) ConsumeVerify(ctx context.Context, tokenHash string, now time.Time) (int64, error) {
	var userID int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ids []int64
		res := tx.Raw(`UPDATE email_tokens SET used_at = ?
			WHERE token_hash = ? AND purpose = 'verify' AND used_at IS NULL AND expires_at > ?
			RETURNING user_id`, now, tokenHash, now).Scan(&ids)
		if res.Error != nil {
			return res.Error
		}
		if len(ids) == 0 {
			return ErrNotFound
		}
		userID = ids[0]
		return tx.Exec(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = now()
			WHERE id = ?`, now, userID).Error
	})
	if err != nil {
		return 0, translate(err)
	}
	return userID, nil
}
