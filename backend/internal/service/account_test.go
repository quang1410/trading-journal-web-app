package service_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

func newAccountService(t *testing.T) (*service.AccountService, int64, int64) {
	t.Helper()
	users := newMemUserStore()
	a, err := users.Create(context.Background(), "a@example.com", "hash")
	require.NoError(t, err)
	b, err := users.Create(context.Background(), "b@example.com", "hash")
	require.NoError(t, err)
	return service.NewAccountService(newMemAccountStore()), a.ID, b.ID
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

func TestAccountCreateValid(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validCreate())

	require.NoError(t, err)
	require.NotZero(t, acc.ID)
	require.Equal(t, userID, acc.UserID)
	require.Equal(t, "ACC1", acc.Code)
}

func TestAccountCreateRejectsBadInput(t *testing.T) {
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
			require.NotNil(t, e, "must be a domain error, not an infrastructure error")
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestAccountCreateDuplicateCodeReturns409(t *testing.T) {
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
func TestForUserDistinguishes404From403(t *testing.T) {
	ctx := context.Background()
	svc, owner, otherUser := newAccountService(t)
	acc, err := svc.Create(ctx, owner, validCreate())
	require.NoError(t, err)

	got, err := svc.ForUser(ctx, owner, acc.ID)
	require.NoError(t, err)
	require.Equal(t, acc.ID, got.ID)

	_, err = svc.ForUser(ctx, otherUser, acc.ID)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)

	_, err = svc.ForUser(ctx, owner, 999999)
	e = apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// PATCH là partial: trường nil phải giữ nguyên giá trị cũ.
func TestAccountUpdateOnlyChangesSentFields(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	newName := "Tên đã đổi"

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Name: &newName})

	require.NoError(t, err)
	require.Equal(t, "Tên đã đổi", updated.Name)
	require.Equal(t, "ACC1", updated.Code, "code không gửi lên thì không được đổi")
	require.True(t, updated.InitialBalance.Equal(decimal.RequireFromString("10000")))
	require.Equal(t, "Asia/Ho_Chi_Minh", updated.Timezone)
}

func TestAccountUpdateStillValidates(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	tzBroken := "Mars/Phobos"

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{Timezone: &tzBroken})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestAccountUpdateOfAnotherUserReturns403(t *testing.T) {
	ctx := context.Background()
	svc, owner, otherUser := newAccountService(t)
	acc, err := svc.Create(ctx, owner, validCreate())
	require.NoError(t, err)
	name := "cướp"

	_, err = svc.Update(ctx, otherUser, acc.ID, service.AccountPatch{Name: &name})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
}

func TestAccountListOnlyReturnsThatUsers(t *testing.T) {
	ctx := context.Background()
	svc, a, b := newAccountService(t)
	_, err := svc.Create(ctx, a, validCreate())
	require.NoError(t, err)

	listB, err := svc.List(ctx, b)

	require.NoError(t, err)
	require.Empty(t, listB, "user B không được thấy account của user A")
}

func svcStr(s string) *string { return &s }

func svcDec(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func validProp() service.AccountCreate {
	c := validCreate()
	c.Code = "FT1"
	c.Type = domain.AccountProp
	c.PropFirm = "FTMO"
	return c
}

func TestAccountCreateDefaultsToPersonal(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validCreate())

	require.NoError(t, err)
	require.Equal(t, domain.AccountPersonal, acc.Type)
	require.Nil(t, acc.ChallengePhase)
}

func TestAccountCreatePropStartsAtPhaseOne(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validProp())

	require.NoError(t, err)
	require.Equal(t, domain.AccountProp, acc.Type)
	require.Equal(t, "FTMO", acc.PropFirm)
	require.Equal(t, domain.PhaseOne, *acc.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *acc.ChallengeStatus)
}

func TestAccountCreatePersonalDropsChallengeFields(t *testing.T) {
	svc, userID, _ := newAccountService(t)
	in := validCreate()
	in.PropFirm = "FTMO"
	in.ChallengePhase = svcStr(domain.PhaseTwo)
	in.ProfitTarget = svcDec("0.1")

	acc, err := svc.Create(context.Background(), userID, in)

	require.NoError(t, err)
	require.Equal(t, "", acc.PropFirm)
	require.Nil(t, acc.ChallengePhase)
	require.Nil(t, acc.ProfitTarget)
}

func TestAccountCreateRejectsBadChallenge(t *testing.T) {
	cases := map[string]func(c *service.AccountCreate){
		"unknown type": func(c *service.AccountCreate) { c.Type = "company" },
		"funded passed": func(c *service.AccountCreate) {
			c.ChallengePhase = svcStr(domain.PhaseFunded)
			c.ChallengeStatus = svcStr(domain.ChallengePassed)
		},
		"unknown phase":      func(c *service.AccountCreate) { c.ChallengePhase = svcStr("phase_9") },
		"target zero":        func(c *service.AccountCreate) { c.ProfitTarget = svcDec("0") },
		"target over 100%":   func(c *service.AccountCreate) { c.ProfitTarget = svcDec("2") },
		"drawdown over 100%": func(c *service.AccountCreate) { c.MaxDrawdownLimit = svcDec("1.5") },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			svc, userID, _ := newAccountService(t)
			in := validProp()
			mangle(&in)

			_, err := svc.Create(context.Background(), userID, in)

			e := apperr.As(err)
			require.NotNil(t, e, "must be a domain error, not an infrastructure error")
			require.Equal(t, 400, e.Status)
		})
	}
}

// Lên vòng mới là bắt đầu một lượt thi mới. Giữ "passed" của Vòng 2 khi lên
// Funded thì DB từ chối (accounts_funded_not_passed) và người dùng nhận 500.
func TestAccountUpdatePhaseChangeResetsStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengeStatus: svcStr(domain.ChallengePassed)})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengePhase: svcStr(domain.PhaseTwo)})

	require.NoError(t, err)
	require.Equal(t, domain.PhaseTwo, *updated.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *updated.ChallengeStatus)
}

func TestAccountUpdatePhaseWithStatusKeepsStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ChallengePhase:  svcStr(domain.PhaseFunded),
		ChallengeStatus: svcStr(domain.ChallengeFailed),
	})

	require.NoError(t, err)
	require.Equal(t, domain.ChallengeFailed, *updated.ChallengeStatus)
}

func TestAccountUpdateSamePhaseDoesNotResetStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)
	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengeStatus: svcStr(domain.ChallengeFailed)})
	require.NoError(t, err)

	// Form gửi lại đúng vòng cũ (ví dụ vì người dùng bấm qua bấm lại) không
	// được hồi sinh một account đã thất bại.
	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengePhase: svcStr(domain.PhaseOne)})

	require.NoError(t, err)
	require.Equal(t, domain.ChallengeFailed, *updated.ChallengeStatus)
}

func TestAccountUpdateFundedPassedRejected(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ChallengePhase:  svcStr(domain.PhaseFunded),
		ChallengeStatus: svcStr(domain.ChallengePassed),
	})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestAccountUpdateToPersonalClearsChallenge(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	in := validProp()
	in.ProfitTarget = svcDec("0.1")
	acc, err := svc.Create(ctx, userID, in)
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Type: svcStr(domain.AccountPersonal)})

	require.NoError(t, err)
	require.Equal(t, domain.AccountPersonal, updated.Type)
	require.Equal(t, "", updated.PropFirm)
	require.Nil(t, updated.ChallengePhase)
	require.Nil(t, updated.ProfitTarget)
}

func TestAccountUpdatePersonalToPropStartsAtPhaseOne(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Type: svcStr(domain.AccountProp)})

	require.NoError(t, err)
	require.Equal(t, domain.PhaseOne, *updated.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *updated.ChallengeStatus)
}

func TestAccountUpdateProfitTargetTristate(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	in := validProp()
	in.ProfitTarget = svcDec("0.1")
	acc, err := svc.Create(ctx, userID, in)
	require.NoError(t, err)

	kept, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Name: svcStr("x")})
	require.NoError(t, err)
	require.Equal(t, "0.1", kept.ProfitTarget.String(), "absent key is left unchanged")

	cleared, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ProfitTarget: service.Tristate[decimal.Decimal]{Set: true, Value: nil},
	})
	require.NoError(t, err)
	require.Nil(t, cleared.ProfitTarget, "null clears the value")
}
