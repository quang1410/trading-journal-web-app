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

const maxCodeLen = 32

// AccountCreate là input tạo account. Mọi trường bắt buộc.
type AccountCreate struct {
	Code           string
	Name           string
	Currency       string
	Timezone       string
	InitialBalance decimal.Decimal
	RiskPerTrade   decimal.Decimal
}

// AccountPatch là input sửa account. Trường nil nghĩa là "không đổi".
type AccountPatch struct {
	Code           *string
	Name           *string
	Currency       *string
	Timezone       *string
	InitialBalance *decimal.Decimal
	RiskPerTrade   *decimal.Decimal
}

type AccountService struct{ accounts *repository.AccountRepo }

func NewAccountService(accounts *repository.AccountRepo) *AccountService {
	return &AccountService{accounts: accounts}
}

func (s *AccountService) List(ctx context.Context, userID int64) ([]domain.Account, error) {
	list, err := s.accounts.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê account: %w", err)
	}
	return list, nil
}

func (s *AccountService) Create(ctx context.Context, userID int64, in AccountCreate) (domain.Account, error) {
	a := domain.Account{
		UserID:         userID,
		Code:           strings.TrimSpace(in.Code),
		Name:           strings.TrimSpace(in.Name),
		Currency:       strings.TrimSpace(in.Currency),
		Timezone:       strings.TrimSpace(in.Timezone),
		InitialBalance: in.InitialBalance,
		RiskPerTrade:   in.RiskPerTrade,
	}
	if err := validateAccount(a); err != nil {
		return domain.Account{}, err
	}
	created, err := s.accounts.Create(ctx, a)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.Account{}, apperr.Conflict(fmt.Sprintf("mã tài khoản %q đã tồn tại", a.Code))
		}
		return domain.Account{}, fmt.Errorf("tạo account: %w", err)
	}
	return created, nil
}

// ForUser nạp account và cưỡng chế quyền sở hữu. Đây là hàm mà middleware
// RequireAccount gọi, và là chỗ DUY NHẤT quyết định 404 hay 403.
func (s *AccountService) ForUser(ctx context.Context, userID, accountID int64) (domain.Account, error) {
	a, err := s.accounts.ByID(ctx, accountID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.Account{}, apperr.NotFound("không tìm thấy tài khoản")
		}
		return domain.Account{}, fmt.Errorf("tìm account: %w", err)
	}
	if a.UserID != userID {
		// Spec §7.2 chốt 403 chứ không phải 404, chấp nhận việc này để lộ
		// rằng id đó có tồn tại.
		return domain.Account{}, apperr.Forbidden("tài khoản này không thuộc về bạn")
	}
	return a, nil
}

func (s *AccountService) Update(ctx context.Context, userID, accountID int64, p AccountPatch) (domain.Account, error) {
	a, err := s.ForUser(ctx, userID, accountID)
	if err != nil {
		return domain.Account{}, err
	}

	if p.Code != nil {
		a.Code = strings.TrimSpace(*p.Code)
	}
	if p.Name != nil {
		a.Name = strings.TrimSpace(*p.Name)
	}
	if p.Currency != nil {
		a.Currency = strings.TrimSpace(*p.Currency)
	}
	if p.Timezone != nil {
		a.Timezone = strings.TrimSpace(*p.Timezone)
	}
	if p.InitialBalance != nil {
		a.InitialBalance = *p.InitialBalance
	}
	if p.RiskPerTrade != nil {
		a.RiskPerTrade = *p.RiskPerTrade
	}

	if err := validateAccount(a); err != nil {
		return domain.Account{}, err
	}
	if err := s.accounts.Update(ctx, a); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.Account{}, apperr.Conflict(fmt.Sprintf("mã tài khoản %q đã tồn tại", a.Code))
		}
		return domain.Account{}, fmt.Errorf("sửa account: %w", err)
	}
	return a, nil
}

func validateAccount(a domain.Account) error {
	switch {
	case a.Code == "":
		return apperr.Validation("mã tài khoản không được để trống")
	case len(a.Code) > maxCodeLen:
		return apperr.Validation(fmt.Sprintf("mã tài khoản dài quá %d ký tự", maxCodeLen))
	case a.Currency == "":
		return apperr.Validation("đơn vị tiền tệ không được để trống")
	case len(a.Currency) > 8:
		return apperr.Validation("đơn vị tiền tệ dài quá 8 ký tự")
	case !a.InitialBalance.IsPositive():
		// Vốn ban đầu là mẫu số của net_return_pct và là gốc của 1R.
		return apperr.Validation("vốn ban đầu phải lớn hơn 0")
	case !a.RiskPerTrade.IsPositive() || a.RiskPerTrade.GreaterThan(decimal.NewFromInt(1)):
		return apperr.Validation("rủi ro mỗi lệnh phải nằm trong khoảng (0, 1]")
	}
	// Timezone sai là lỗi âm thầm nguy hiểm nhất ở đây: một tên IANA không
	// hợp lệ làm hỏng mọi phép gom nhóm theo ngày/tuần/tháng mà không báo gì.
	if a.Timezone == "" {
		return apperr.Validation("timezone không được để trống")
	}
	if _, err := time.LoadLocation(a.Timezone); err != nil {
		return apperr.Validation(fmt.Sprintf("timezone %q không phải tên IANA hợp lệ", a.Timezone))
	}
	return nil
}
