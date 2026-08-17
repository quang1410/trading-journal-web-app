package aggregate

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func testAccount() domain.Account {
	return domain.Account{
		InitialBalance: dec("5000"),
		RiskPerTrade:   dec("0.01"),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

// enrichProfits dựng nhanh danh sách Enriched từ dãy lãi lỗ, mỗi lệnh một ngày
// liên tiếp bắt đầu từ 2026-06-09.
func enrichProfits(t *testing.T, profits ...string) []metrics.Enriched {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	base := time.Date(2026, 6, 9, 12, 0, 0, 0, vn)

	trades := make([]domain.Trade, 0, len(profits))
	for i, p := range profits {
		trades = append(trades, domain.Trade{
			STT:       i + 1,
			EnteredAt: base.AddDate(0, 0, i).UTC(),
			Symbol:    "xau",
			Direction: domain.DirectionLong,
			Profit:    dec(p),
			Fee:       decimal.Zero,
		})
	}

	rows, err := metrics.Enrich(trades, testAccount())
	require.NoError(t, err)
	return rows
}

func TestStreaksGoldenFixture(t *testing.T) {
	rows := enrichProfits(t, "100", "-50", "100", "200")

	win, loss := Streaks(rows)
	require.Equal(t, 2, win)
	require.Equal(t, 1, loss)
}

func TestStreaksChuoiThuaDai(t *testing.T) {
	rows := enrichProfits(t, "-10", "-20", "-30", "50", "-5")

	win, loss := Streaks(rows)
	require.Equal(t, 1, win)
	require.Equal(t, 3, loss)
}

func TestStreaksLenhHoaTinhLaThang(t *testing.T) {
	rows := enrichProfits(t, "100", "0", "50")

	win, loss := Streaks(rows)
	require.Equal(t, 3, win, "net = 0 có win_sign = 1 nên chuỗi thắng không đứt")
	require.Equal(t, 0, loss)
}

func TestStreaksDanhSachRong(t *testing.T) {
	win, loss := Streaks(nil)
	require.Equal(t, 0, win)
	require.Equal(t, 0, loss)
}
