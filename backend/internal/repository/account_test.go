package repository_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

func newAccount(userID int64, code string) domain.Account {
	return domain.Account{
		UserID:         userID,
		Code:           code,
		Name:           "Tài khoản chính",
		InitialBalance: decimal.RequireFromString("10000.00"),
		RiskPerTrade:   decimal.RequireFromString("0.0100"),
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

func TestAccountCreateThenReadBack(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")

	created, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)
	require.NotZero(t, created.ID)

	got, err := accounts.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "ACC1", got.Code)
	require.Equal(t, "Asia/Ho_Chi_Minh", got.Timezone)
	require.True(t, got.InitialBalance.Equal(decimal.RequireFromString("10000")),
		"đọc ra %s", got.InitialBalance)
	require.True(t, got.RiskPerTrade.Equal(decimal.RequireFromString("0.01")),
		"NUMERIC(6,4) phải giữ đúng 0.01, đọc ra %s", got.RiskPerTrade)
	require.True(t, got.OneR().Equal(decimal.RequireFromString("100")),
		"1R = 10000 × 0.01 = 100, tính ra %s", got.OneR())
}

func TestAccountDuplicateCodeSameUserReturnsErrDuplicate(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")
	_, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)

	_, err = accounts.Create(ctx, newAccount(userID, "ACC1"))

	require.ErrorIs(t, err, repository.ErrDuplicate)
}

// UNIQUE là (user_id, code), không phải (code): hai user được dùng cùng mã.
func TestAccountDuplicateCodeDifferentUserStillCreates(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	a := seedUser(t, users, "a@example.com")
	b := seedUser(t, users, "b@example.com")
	_, err := accounts.Create(ctx, newAccount(a, "ACC1"))
	require.NoError(t, err)

	_, err = accounts.Create(ctx, newAccount(b, "ACC1"))

	require.NoError(t, err)
}

func TestAccountListByUserOnlyReturnsThatUsers(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	a := seedUser(t, users, "a@example.com")
	b := seedUser(t, users, "b@example.com")
	_, err := accounts.Create(ctx, newAccount(a, "ACC1"))
	require.NoError(t, err)
	_, err = accounts.Create(ctx, newAccount(a, "ACC2"))
	require.NoError(t, err)
	_, err = accounts.Create(ctx, newAccount(b, "CUA-B"))
	require.NoError(t, err)

	list, err := accounts.ListByUser(ctx, a)

	require.NoError(t, err)
	require.Len(t, list, 2)
	require.Equal(t, "ACC1", list[0].Code, "sắp theo id tăng dần")
	require.Equal(t, "ACC2", list[1].Code)
	for _, acc := range list {
		require.Equal(t, a, acc.UserID)
	}
}

func TestAccountUpdateOverwritesChangedFields(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")
	created, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)

	created.Name = "Tên mới"
	created.RiskPerTrade = decimal.RequireFromString("0.0200")
	require.NoError(t, accounts.Update(ctx, created))

	got, err := accounts.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "Tên mới", got.Name)
	require.True(t, got.RiskPerTrade.Equal(decimal.RequireFromString("0.02")))
	require.Equal(t, userID, got.UserID, "update không được đổi chủ sở hữu")
}

// Update cố ý không có user_id trong danh sách cột. TestAccountUpdateOverwritesChangedFields
// ở trên KHÔNG chứng minh được điều đó: nó ghi lại đúng chủ cũ, nên thêm user_id
// vào danh sách thì nó vẫn xanh. Test này đổi hẳn chủ sở hữu trong struct rồi
// mới gọi Update, nên chỉ có việc thiếu cột user_id mới giữ được chủ cũ.
func TestAccountUpdateCannotChangeOwner(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	owner := seedUser(t, users, "a@example.com")
	robber := seedUser(t, users, "b@example.com")
	created, err := accounts.Create(ctx, newAccount(owner, "ACC1"))
	require.NoError(t, err)

	created.UserID = robber
	created.Name = "đổi tên nhân thể"
	require.NoError(t, accounts.Update(ctx, created))

	got, err := accounts.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, owner, got.UserID, "Update không được chuyển account sang user khác")
	require.Equal(t, "đổi tên nhân thể", got.Name, "các cột khác vẫn phải được ghi")
}

func TestAccountByIDNotFound(t *testing.T) {
	accounts := repository.NewAccountRepo(testdb.New(t))

	_, err := accounts.ByID(context.Background(), 999)

	require.ErrorIs(t, err, repository.ErrNotFound)
}
