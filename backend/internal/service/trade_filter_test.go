package service_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/service"
)

// rank dựng một Enriched tối thiểu đủ để bộ lọc làm việc. Không gọi
// metrics.Enrich ở đây: test này kiểm bộ lọc, không kiểm phép làm giàu.
func rank(day, setup, symbol, timeframe, direction, class string) metrics.Enriched {
	return metrics.Enriched{
		Trade: domain.Trade{
			Symbol:    symbol,
			Direction: direction,
			Setup:     setup,
			Timeframe: timeframe,
			Profit:    decimal.NewFromInt(1),
			EnteredAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		Day:        day,
		TradeClass: class,
	}
}

var sample = []metrics.Enriched{
	rank("2026-06-08", "Breakout", "XAUUSD", "H1", domain.DirectionLong, domain.ClassPlanned),
	rank("2026-06-10", "Pullback", "EURUSD", "M15", domain.DirectionShort, domain.ClassNotEvaluated),
	rank("2026-06-12", "Breakout", "EURUSD", "H1", domain.DirectionLong, domain.ClassImpulsive),
}

func day(rows []metrics.Enriched) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Day)
	}
	return out
}

func TestFilterEmptyKeepsEverything(t *testing.T) {
	require.NotEmpty(t, sample, "dữ liệu mẫu rỗng thì mọi khẳng định dưới đây đều xanh vô nghĩa")
	got := service.Filter{}.Apply(sample)
	require.Len(t, got, 3)
}

func TestFilterDateRangeIsInclusive(t *testing.T) {
	got := service.Filter{From: "2026-06-08", To: "2026-06-10"}.Apply(sample)
	require.Equal(t, []string{"2026-06-08", "2026-06-10"}, day(got),
		"cả hai đầu mút đều phải nằm trong tập kết quả")
}

func TestFilterOnlyFrom(t *testing.T) {
	got := service.Filter{From: "2026-06-10"}.Apply(sample)
	require.Equal(t, []string{"2026-06-10", "2026-06-12"}, day(got))
}

func TestFilterOnlyTo(t *testing.T) {
	got := service.Filter{To: "2026-06-08"}.Apply(sample)
	require.Equal(t, []string{"2026-06-08"}, day(got))
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Day do metrics.DateParts sinh, đã quy đổi sang timezone của account. Một
// lệnh vào lúc 23:00Z ngày 09 là lệnh của ngày 10 ở giờ Việt Nam. Nếu ai đó
// "sửa" bộ lọc thành so trên EnteredAt cho có vẻ chặt chẽ, lệnh này sẽ rơi
// nhầm sang ngày 09 và biến mất khỏi bộ lọc tháng — im lặng.
func TestFilterComparesOnDayNotEnteredAt(t *testing.T) {
	tr := domain.Trade{
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.NewFromInt(10),
		EnteredAt: time.Date(2026, 6, 9, 23, 0, 0, 0, time.UTC), // 06:00 ngày 10 giờ VN
	}
	acc := domain.Account{
		InitialBalance: decimal.NewFromInt(10000),
		RiskPerTrade:   decimal.NewFromFloat(0.01),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
	rows, err := metrics.Enrich([]domain.Trade{tr}, acc)
	require.NoError(t, err)
	require.Equal(t, "2026-06-10", rows[0].Day, "tiền đề: Enrich phải quy đổi sang giờ VN")

	require.Len(t, service.Filter{From: "2026-06-10"}.Apply(rows), 1,
		"lệnh 23:00Z ngày 09 là lệnh ngày 10 ở giờ VN, from=2026-06-10 phải bắt được")
	require.Empty(t, service.Filter{To: "2026-06-09"}.Apply(rows),
		"và to=2026-06-09 thì không được bắt")
}

func TestFilterByEachStringField(t *testing.T) {
	cases := []struct {
		name string
		f    service.Filter
		muon []string
	}{
		{"setup", service.Filter{Setup: "Breakout"}, []string{"2026-06-08", "2026-06-12"}},
		{"symbol", service.Filter{Symbol: "EURUSD"}, []string{"2026-06-10", "2026-06-12"}},
		{"timeframe", service.Filter{Timeframe: "H1"}, []string{"2026-06-08", "2026-06-12"}},
		{"direction", service.Filter{Direction: domain.DirectionShort}, []string{"2026-06-10"}},
		{"trade_class", service.Filter{TradeClass: domain.ClassNotEvaluated}, []string{"2026-06-10"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.muon, day(c.f.Apply(sample)))
		})
	}
}

// So khớp CHÍNH XÁC, không phải chứa. "Break" không được kéo theo "Breakout":
// setup là khoá gom nhóm của pivot, khớp mờ sẽ làm hai nhóm khác nhau trộn
// vào một, và con số vẫn ra bình thường nên không ai phát hiện.
func TestFilterMatchesExactlyNotSubstring(t *testing.T) {
	require.Empty(t, service.Filter{Setup: "Break"}.Apply(sample))
	require.Empty(t, service.Filter{Symbol: "EUR"}.Apply(sample))
}

func TestFilterMultipleConditionsAreAND(t *testing.T) {
	got := service.Filter{Setup: "Breakout", Symbol: "EURUSD"}.Apply(sample)
	require.Equal(t, []string{"2026-06-12"}, day(got))
}

func TestFilterNoMatchReturnsEmptySliceNotNil(t *testing.T) {
	got := service.Filter{Symbol: "KHONG_TON_TAI"}.Apply(sample)
	require.NotNil(t, got, "nil sẽ marshal ra null; API phải trả []")
	require.Empty(t, got)
}

func TestFilterDoesNotMutateInputSlice(t *testing.T) {
	before := day(sample)
	service.Filter{Symbol: "EURUSD"}.Apply(sample)
	require.Equal(t, before, day(sample), "Apply không được ghi đè lát cắt gốc")
}

func TestFilterNormalizeTrimsWhitespace(t *testing.T) {
	f := service.Filter{From: "  2026-06-08 ", Symbol: " EURUSD "}.Normalize()
	require.Equal(t, "2026-06-08", f.From)
	require.Equal(t, "EURUSD", f.Symbol)
}

func TestFilterIsEmpty(t *testing.T) {
	require.True(t, service.Filter{}.IsEmpty())
	require.False(t, service.Filter{Symbol: "X"}.IsEmpty())
}
