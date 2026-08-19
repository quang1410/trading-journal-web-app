package service_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

func newAccountService(t *testing.T) (*service.AccountService, int64, int64) {
	t.Helper()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	a, err := users.Create(context.Background(), "a@example.com", "hash")
	require.NoError(t, err)
	b, err := users.Create(context.Background(), "b@example.com", "hash")
	require.NoError(t, err)
	return service.NewAccountService(repository.NewAccountRepo(db)), a.ID, b.ID
}

func validCreate() service.AccountCreate {
	return service.AccountCreate{
		Code:           "ACC1",
		Name:           "Tài khoản chính",
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	}
}

func TestAccountCreateHopLe(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validCreate())

	require.NoError(t, err)
	require.NotZero(t, acc.ID)
	require.Equal(t, userID, acc.UserID)
	require.Equal(t, "ACC1", acc.Code)
}

func TestAccountCreateTuChoiInputHong(t *testing.T) {
	cases := map[string]func(c *service.AccountCreate){
		"code rỗng":          func(c *service.AccountCreate) { c.Code = "" },
		"code quá dài":       func(c *service.AccountCreate) { c.Code = string(make([]byte, 33)) },
		"vốn ban đầu bằng 0": func(c *service.AccountCreate) { c.InitialBalance = decimal.Zero },
		"vốn ban đầu âm":     func(c *service.AccountCreate) { c.InitialBalance = decimal.RequireFromString("-1") },
		"risk bằng 0":        func(c *service.AccountCreate) { c.RiskPerTrade = decimal.Zero },
		"risk lớn hơn 1":     func(c *service.AccountCreate) { c.RiskPerTrade = decimal.RequireFromString("1.5") },
		"currency rỗng":      func(c *service.AccountCreate) { c.Currency = "" },
		// Cột currency trong migration là TEXT không giới hạn độ dài, nên nhánh
		// len > 8 của validateAccount là thứ DUY NHẤT chặn "DONGVIETNAMDONG".
		// Chín case của brief phủ tám nhánh (vốn và risk mỗi cái hai case), nhánh
		// này là nhánh bị bỏ sót.
		"currency quá dài":       func(c *service.AccountCreate) { c.Currency = "DONGVIETNAMDONG" },
		"timezone không tồn tại": func(c *service.AccountCreate) { c.Timezone = "Mars/Phobos" },
		"timezone rỗng":          func(c *service.AccountCreate) { c.Timezone = "" },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			svc, userID, _ := newAccountService(t)
			in := validCreate()
			mangle(&in)

			_, err := svc.Create(context.Background(), userID, in)

			e := apperr.As(err)
			require.NotNil(t, err)
			require.NotNil(t, e, "phải là lỗi nghiệp vụ, không phải lỗi hạ tầng")
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestAccountCreateTrungCodeTra409(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	_, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)

	_, err = svc.Create(ctx, userID, validCreate())

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 409, e.Status)
	require.Equal(t, 1409, e.Code)
}

// ForUser là cổng sở hữu: 404 khi không có, 403 khi của người khác.
func TestForUserPhanBiet404Va403(t *testing.T) {
	ctx := context.Background()
	svc, chuSoHuu, nguoiKhac := newAccountService(t)
	acc, err := svc.Create(ctx, chuSoHuu, validCreate())
	require.NoError(t, err)

	got, err := svc.ForUser(ctx, chuSoHuu, acc.ID)
	require.NoError(t, err)
	require.Equal(t, acc.ID, got.ID)

	_, err = svc.ForUser(ctx, nguoiKhac, acc.ID)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)

	_, err = svc.ForUser(ctx, chuSoHuu, 999999)
	e = apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// PATCH là partial: trường nil phải giữ nguyên giá trị cũ.
func TestAccountUpdateChiDoiTruongDuocGui(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	tenMoi := "Tên đã đổi"

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Name: &tenMoi})

	require.NoError(t, err)
	require.Equal(t, "Tên đã đổi", updated.Name)
	require.Equal(t, "ACC1", updated.Code, "code không gửi lên thì không được đổi")
	require.True(t, updated.InitialBalance.Equal(decimal.RequireFromString("10000")))
	require.Equal(t, "Asia/Ho_Chi_Minh", updated.Timezone)
}

func TestAccountUpdateVanValidate(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	tzHong := "Mars/Phobos"

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{Timezone: &tzHong})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestAccountUpdateCuaNguoiKhacTra403(t *testing.T) {
	ctx := context.Background()
	svc, chuSoHuu, nguoiKhac := newAccountService(t)
	acc, err := svc.Create(ctx, chuSoHuu, validCreate())
	require.NoError(t, err)
	ten := "cướp"

	_, err = svc.Update(ctx, nguoiKhac, acc.ID, service.AccountPatch{Name: &ten})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
}

func TestAccountListChiTraCuaUserDo(t *testing.T) {
	ctx := context.Background()
	svc, a, b := newAccountService(t)
	_, err := svc.Create(ctx, a, validCreate())
	require.NoError(t, err)

	listB, err := svc.List(ctx, b)

	require.NoError(t, err)
	require.Empty(t, listB, "user B không được thấy account của user A")
}
