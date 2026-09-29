package metrics

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func propGoldenAccount() domain.Account {
	acc := goldenAccount() // vốn 5000
	acc.Type = domain.AccountProp
	acc.ProfitTarget = ptr("0.1")
	acc.MaxDrawdownLimit = ptr("0.05")
	return acc
}

func TestComputeChallengeGolden(t *testing.T) {
	acc := propGoldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	c := ComputeChallenge(rows, acc)

	require.NotNil(t, c)
	// Σnet = 100 − 50 + 100 + 200 = 350 trên vốn 5000.
	require.Equal(t, "0.07", c.ProfitPct.String())
	requireDec(t, c.TargetProgress, "0.7", 4) // 7% / 10%
	// Đỉnh 100 sau lệnh 1, lệnh 2 lỗ 50 → drawdown lớn nhất 50 = 1% vốn.
	require.Equal(t, "0.01", c.DrawdownPct.String())
	requireDec(t, c.DrawdownUsage, "0.2", 4) // 1% / 5%
}

func TestComputeChallengeNilForPersonal(t *testing.T) {
	acc := goldenAccount() // Type rỗng = cá nhân
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	require.Nil(t, ComputeChallenge(rows, acc))
}

func TestComputeChallengeWithoutRulesHasNilRatios(t *testing.T) {
	acc := goldenAccount()
	acc.Type = domain.AccountProp
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	c := ComputeChallenge(rows, acc)

	require.NotNil(t, c)
	require.Equal(t, "0.07", c.ProfitPct.String())
	require.Nil(t, c.TargetProgress, "no target means no progress, not 0")
	require.Nil(t, c.DrawdownUsage)
}

func TestComputeChallengeNoTrades(t *testing.T) {
	acc := propGoldenAccount()

	c := ComputeChallenge(nil, acc)

	require.NotNil(t, c)
	require.True(t, c.ProfitPct.IsZero())
	require.True(t, c.DrawdownPct.IsZero())
	requireDec(t, c.TargetProgress, "0", 4)
	requireDec(t, c.DrawdownUsage, "0", 4)
}

// Tiến độ thi là tình trạng THẬT của account — cùng ngoại lệ với
// CurrentBalance ở quy tắc 8. Đảo hai tham số filtered/all của ComputeKPI sẽ
// làm đúng một trong hai assert dưới đây sai.
func TestComputeKPIChallengeIgnoresFilter(t *testing.T) {
	acc := propGoldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	k := ComputeKPI(rows[:1], rows, acc, nil)

	require.True(t, k.NetProfit.Equal(dec("100")), "NetProfit is computed on the filtered set")
	require.NotNil(t, k.Challenge)
	require.Equal(t, "0.07", k.Challenge.ProfitPct.String(), "Challenge is computed on all trades")
}
