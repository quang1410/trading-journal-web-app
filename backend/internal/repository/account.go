package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

// AccountRepo dùng thẳng domain.Account: account xuất hiện trong công thức
// nghiệp vụ (OneR, timezone gom nhóm) nên nó là kiểu domain thật sự, khác
// với UserRow vốn thuần hạ tầng.
type AccountRepo struct{ db *gorm.DB }

func NewAccountRepo(db *gorm.DB) *AccountRepo { return &AccountRepo{db: db} }

func (r *AccountRepo) ListByUser(ctx context.Context, userID int64) ([]domain.Account, error) {
	var rows []domain.Account
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

func (r *AccountRepo) Create(ctx context.Context, a domain.Account) (domain.Account, error) {
	if err := r.db.WithContext(ctx).Create(&a).Error; err != nil {
		return domain.Account{}, translate(err)
	}
	return a, nil
}

func (r *AccountRepo) ByID(ctx context.Context, id int64) (domain.Account, error) {
	var a domain.Account
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&a).Error
	return a, translate(err)
}

// Update ghi đè các cột sửa được. user_id, id và created_at cố ý không nằm
// trong danh sách: đổi chủ sở hữu của một account không phải thao tác hợp lệ.
func (r *AccountRepo) Update(ctx context.Context, a domain.Account) error {
	err := r.db.WithContext(ctx).Model(&domain.Account{}).
		Where("id = ?", a.ID).
		Updates(map[string]any{
			"code":            a.Code,
			"name":            a.Name,
			"initial_balance": a.InitialBalance,
			"risk_per_trade":  a.RiskPerTrade,
			"currency":        a.Currency,
			"timezone":        a.Timezone,
			"updated_at":      gorm.Expr("now()"),
		}).Error
	return translate(err)
}
