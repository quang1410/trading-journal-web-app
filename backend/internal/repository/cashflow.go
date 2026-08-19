package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type CashFlowRepo struct{ db *gorm.DB }

func NewCashFlowRepo(db *gorm.DB) *CashFlowRepo { return &CashFlowRepo{db: db} }

func (r *CashFlowRepo) ListByAccount(ctx context.Context, accountID int64) ([]domain.CashFlow, error) {
	var rows []domain.CashFlow
	err := r.db.WithContext(ctx).
		Where("account_id = ?", accountID).
		Order("date ASC, id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

func (r *CashFlowRepo) Create(ctx context.Context, cf domain.CashFlow) (domain.CashFlow, error) {
	if err := r.db.WithContext(ctx).Create(&cf).Error; err != nil {
		return domain.CashFlow{}, translate(err)
	}
	return cf, nil
}

func (r *CashFlowRepo) ByID(ctx context.Context, id int64) (domain.CashFlow, error) {
	var cf domain.CashFlow
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&cf).Error
	return cf, translate(err)
}

// DeleteOwned xoá CỨNG. cash_flows không có deleted_at: quy tắc soft delete
// chỉ áp cho trades, vì xoá cứng lệnh làm sai đường equity, còn cash flow
// không nằm trong dãy lũy kế theo stt.
//
// account_id nằm ngay trong WHERE nên không có khe hở giữa lúc kiểm quyền
// sở hữu và lúc xoá.
func (r *CashFlowRepo) DeleteOwned(ctx context.Context, id, accountID int64) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND account_id = ?", id, accountID).
		Delete(&domain.CashFlow{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
