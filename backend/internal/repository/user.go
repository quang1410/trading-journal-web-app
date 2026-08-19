package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// UserRow ánh xạ bảng users. Không dùng domain.User vì user chưa xuất hiện
// trong bất kỳ công thức nghiệp vụ nào — nó thuần tuý là chuyện hạ tầng.
type UserRow struct {
	ID           int64     `gorm:"column:id;primaryKey"`
	Email        string    `gorm:"column:email"`
	PasswordHash string    `gorm:"column:password_hash"`
	CreatedAt    time.Time `gorm:"column:created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at"`
}

func (UserRow) TableName() string { return "users" }

type UserRepo struct{ db *gorm.DB }

func NewUserRepo(db *gorm.DB) *UserRepo { return &UserRepo{db: db} }

// Count đếm tổng số user. Register dùng nó để cưỡng chế luật "chỉ user đầu tiên".
func (r *UserRepo) Count(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&UserRow{}).Count(&n).Error
	return n, translate(err)
}

func (r *UserRepo) Create(ctx context.Context, email, passwordHash string) (UserRow, error) {
	row := UserRow{Email: email, PasswordHash: passwordHash}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return UserRow{}, translate(err)
	}
	return row, nil
}

func (r *UserRepo) ByEmail(ctx context.Context, email string) (UserRow, error) {
	var row UserRow
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&row).Error
	return row, translate(err)
}

func (r *UserRepo) ByID(ctx context.Context, id int64) (UserRow, error) {
	var row UserRow
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&row).Error
	return row, translate(err)
}
