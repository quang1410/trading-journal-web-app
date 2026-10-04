package domain_test

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func accStr(s string) *string { return &s }

func accDec(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func propAccount() domain.Account {
	return domain.Account{PropInfo: domain.PropInfo{
		Type:            domain.AccountProp,
		PropFirm:        "FTMO",
		ChallengePhase:  accStr(domain.PhaseOne),
		ChallengeStatus: accStr(domain.ChallengeInProgress),
	}}
}

func TestNormalizeChallenge(t *testing.T) {
	t.Run("empty type becomes personal", func(t *testing.T) {
		a := domain.Account{}
		a.NormalizeChallenge()
		require.Equal(t, domain.AccountPersonal, a.Type)
	})

	t.Run("personal clears every challenge field", func(t *testing.T) {
		a := propAccount()
		a.Type = domain.AccountPersonal
		a.ProfitTarget = accDec("0.1")
		a.MaxDrawdownLimit = accDec("0.1")

		a.NormalizeChallenge()

		require.Equal(t, "", a.PropFirm)
		require.Nil(t, a.ChallengePhase)
		require.Nil(t, a.ChallengeStatus)
		require.Nil(t, a.ProfitTarget)
		require.Nil(t, a.MaxDrawdownLimit)
	})

	t.Run("prop without phase starts at phase 1 in progress", func(t *testing.T) {
		a := domain.Account{PropInfo: domain.PropInfo{Type: domain.AccountProp}}
		a.NormalizeChallenge()
		require.Equal(t, domain.PhaseOne, *a.ChallengePhase)
		require.Equal(t, domain.ChallengeInProgress, *a.ChallengeStatus)
	})

	t.Run("prop keeps what was sent", func(t *testing.T) {
		a := propAccount()
		a.ChallengePhase = accStr(domain.PhaseFunded)
		a.ChallengeStatus = accStr(domain.ChallengeFailed)

		a.NormalizeChallenge()

		require.Equal(t, domain.PhaseFunded, *a.ChallengePhase)
		require.Equal(t, domain.ChallengeFailed, *a.ChallengeStatus)
		require.Equal(t, "FTMO", a.PropFirm)
	})
}

func TestValidateChallenge(t *testing.T) {
	tests := []struct {
		name    string
		mangle  func(a *domain.Account)
		wantErr bool
	}{
		{"valid prop", func(a *domain.Account) {}, false},
		{"personal is valid", func(a *domain.Account) { *a = domain.Account{PropInfo: domain.PropInfo{Type: domain.AccountPersonal}} }, false},
		{"unknown type", func(a *domain.Account) { a.Type = "company" }, true},
		{"empty type is not normalized here", func(a *domain.Account) { a.Type = "" }, true},
		{"unknown phase", func(a *domain.Account) { a.ChallengePhase = accStr("phase_3") }, true},
		{"missing phase", func(a *domain.Account) { a.ChallengePhase = nil }, true},
		{"unknown status", func(a *domain.Account) { a.ChallengeStatus = accStr("paused") }, true},
		{"missing status", func(a *domain.Account) { a.ChallengeStatus = nil }, true},
		{"funded cannot be passed", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseFunded)
			a.ChallengeStatus = accStr(domain.ChallengePassed)
		}, true},
		{"funded can fail", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseFunded)
			a.ChallengeStatus = accStr(domain.ChallengeFailed)
		}, false},
		{"phase 2 can be passed", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseTwo)
			a.ChallengeStatus = accStr(domain.ChallengePassed)
		}, false},
		// "ê" là 2 byte: 64 ký tự = 128 byte. Đếm theo byte thì ca này sai.
		{"prop firm of 64 runes", func(a *domain.Account) { a.PropFirm = strings.Repeat("ê", 64) }, false},
		{"prop firm of 65 runes", func(a *domain.Account) { a.PropFirm = strings.Repeat("ê", 65) }, true},
		{"profit target zero", func(a *domain.Account) { a.ProfitTarget = accDec("0") }, true},
		{"profit target over 100%", func(a *domain.Account) { a.ProfitTarget = accDec("1.01") }, true},
		{"profit target exactly 100%", func(a *domain.Account) { a.ProfitTarget = accDec("1") }, false},
		{"max drawdown negative", func(a *domain.Account) { a.MaxDrawdownLimit = accDec("-0.1") }, true},
		{"max drawdown 10%", func(a *domain.Account) { a.MaxDrawdownLimit = accDec("0.1") }, false},
		// Cột là NUMERIC(6,4): "0.00001" qua được kiểm tra nhưng DB làm tròn
		// thành 0, và từ đó mọi PATCH của account (kể cả đổi tên) đọc lại 0
		// rồi bị từ chối "phải lớn hơn 0". Chặn ngay tại cửa.
		{"profit target with 5 decimals", func(a *domain.Account) { a.ProfitTarget = accDec("0.00001") }, true},
		{"max drawdown with 5 decimals", func(a *domain.Account) { a.MaxDrawdownLimit = accDec("0.12345") }, true},
		{"profit target with 4 decimals", func(a *domain.Account) { a.ProfitTarget = accDec("0.1234") }, false},
		{"trailing zeros are not extra precision", func(a *domain.Account) { a.ProfitTarget = accDec("0.100000") }, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			a := propAccount()
			tc.mangle(&a)
			err := a.ValidateChallenge()
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
