package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

const dateLayout = "2006-01-02"

type CashFlowCreate struct {
	Date   string // YYYY-MM-DD
	Amount decimal.Decimal
	Type   string // "deposit" | "withdraw"
	Note   string
}

type CashFlowService struct {
	flows    CashFlowStore
	accounts *AccountService
}

func NewCashFlowService(flows CashFlowStore, accounts *AccountService) *CashFlowService {
	return &CashFlowService{flows: flows, accounts: accounts}
}

func (s *CashFlowService) List(ctx context.Context, accountID int64) ([]domain.CashFlow, error) {
	list, err := s.flows.ListByAccount(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return list, nil
}

func (s *CashFlowService) Create(ctx context.Context, accountID int64, in CashFlowCreate) (domain.CashFlow, error) {
	day, err := time.Parse(dateLayout, strings.TrimSpace(in.Date))
	if err != nil {
		return domain.CashFlow{}, apperr.Validation("ngày phải theo định dạng YYYY-MM-DD")
	}
	if !in.Amount.IsPositive() {
		// Chiều tiền nằm ở Type, nên số tiền luôn dương — trùng với
		// CHECK (amount > 0) của migration 0001.
		return domain.CashFlow{}, apperr.Validation("số tiền phải lớn hơn 0")
	}
	if !domain.Valid(domain.CashFlowTypes, in.Type) {
		return domain.CashFlow{}, apperr.Validation(`loại phải là "deposit" hoặc "withdraw"`)
	}

	created, err := s.flows.Create(ctx, domain.CashFlow{
		AccountID: accountID,
		Date:      day,
		Amount:    in.Amount,
		Type:      in.Type,
		Note:      strings.TrimSpace(in.Note),
	})
	if err != nil {
		return domain.CashFlow{}, fmt.Errorf("tạo cash flow: %w", err)
	}
	return created, nil
}

// Delete tự kiểm quyền sở hữu vì URL /api/cash-flows/{id} không có account id
// nên không dùng được middleware RequireAccount.
func (s *CashFlowService) Delete(ctx context.Context, userID, flowID int64) error {
	cf, err := s.flows.ByID(ctx, flowID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy giao dịch tiền")
		}
		return fmt.Errorf("tìm cash flow: %w", err)
	}
	// ForUser trả 403 khi account thuộc user khác, 404 khi account không có.
	if _, err := s.accounts.ForUser(ctx, userID, cf.AccountID); err != nil {
		return err
	}
	if err := s.flows.DeleteOwned(ctx, flowID, cf.AccountID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy giao dịch tiền")
		}
		return fmt.Errorf("xoá cash flow: %w", err)
	}
	return nil
}
