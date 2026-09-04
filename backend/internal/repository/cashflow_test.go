package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

func seedAccountID(t *testing.T, db *gorm.DB, email, code string) int64 {
	t.Helper()
	userID := seedUser(t, repository.NewUserRepo(db), email)
	acc, err := repository.NewAccountRepo(db).Create(context.Background(), newAccount(userID, code))
	require.NoError(t, err)
	return acc.ID
}

func TestCashFlowCreateAndListByDay(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	for _, d := range []string{"2026-03-10", "2026-01-05", "2026-02-01"} {
		day, err := time.Parse("2006-01-02", d)
		require.NoError(t, err)
		_, err = flows.Create(ctx, domain.CashFlow{
			AccountID: accountID,
			Date:      day,
			Amount:    decimal.RequireFromString("500.00"),
			Type:      "deposit",
			Note:      d,
		})
		require.NoError(t, err)
	}

	list, err := flows.ListByAccount(ctx, accountID)

	require.NoError(t, err)
	require.Len(t, list, 3)
	require.Equal(t, "2026-01-05", list[0].Note, "phải sắp theo ngày tăng dần")
	require.Equal(t, "2026-02-01", list[1].Note)
	require.Equal(t, "2026-03-10", list[2].Note)
	require.True(t, list[0].Amount.Equal(decimal.RequireFromString("500")))
}

// CHECK (amount > 0) nằm ở migration 0001 — repository phải để DB từ chối,
// không được âm thầm cho qua.
func TestCashFlowNonPositiveAmountRejectedByDB(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)

	_, err = flows.Create(ctx, domain.CashFlow{
		AccountID: accountID, Date: day, Amount: decimal.Zero, Type: "deposit",
	})

	require.Error(t, err)
}

func TestCashFlowTypeOutsideEnumRejectedByDB(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)

	_, err = flows.Create(ctx, domain.CashFlow{
		AccountID: accountID, Date: day, Amount: decimal.NewFromInt(1), Type: "chuyen-khoan",
	})

	require.Error(t, err)
}

// DeleteOwned có account_id trong mệnh đề WHERE, nên không có khe hở giữa
// lúc kiểm quyền và lúc xoá.
func TestDeleteOwnedOnlyDeletesForMatchingAccount(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	ofA := seedAccountID(t, db, "a@example.com", "ACC1")
	ofB := seedAccountID(t, db, "b@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)
	cf, err := flows.Create(ctx, domain.CashFlow{
		AccountID: ofA, Date: day, Amount: decimal.NewFromInt(100), Type: "deposit",
	})
	require.NoError(t, err)

	require.ErrorIs(t, flows.DeleteOwned(ctx, cf.ID, ofB), repository.ErrNotFound)

	still, err := flows.ByID(ctx, cf.ID)
	require.NoError(t, err)
	require.Equal(t, ofA, still.AccountID)

	require.NoError(t, flows.DeleteOwned(ctx, cf.ID, ofA))
	_, err = flows.ByID(ctx, cf.ID)
	require.ErrorIs(t, err, repository.ErrNotFound)

	// Xoá cứng: gọi lại là không tìm thấy, KHÔNG phải soft delete.
	require.ErrorIs(t, flows.DeleteOwned(ctx, cf.ID, ofA), repository.ErrNotFound)
}
