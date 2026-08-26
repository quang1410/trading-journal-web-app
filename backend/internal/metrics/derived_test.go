package metrics

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func TestNet(t *testing.T) {
	tests := []struct {
		name   string
		profit string
		fee    string
		want   string
	}{
		{"lãi không phí", "100", "0", "100"},
		{"lỗ không phí", "-50", "0", "-50"},
		{"phí ăn hết lãi", "10", "12", "-2"},
		{"số lẻ giữ nguyên precision", "0.15", "0.05", "0.10"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Net(domain.Trade{Profit: dec(tt.profit), Fee: dec(tt.fee)})
			require.True(t, got.Equal(dec(tt.want)), "Net = %s, muốn %s", got, tt.want)
		})
	}
}

func TestWinLossVaStreakSign(t *testing.T) {
	tests := []struct {
		net            string
		wantWinLoss    int
		wantStreakSign int
	}{
		{"100", 1, 1},
		{"-50", 0, -1},
		{"0", 1, 1}, // net = 0 tính là KHÔNG THUA
	}
	for _, tt := range tests {
		t.Run(tt.net, func(t *testing.T) {
			require.Equal(t, tt.wantWinLoss, WinLoss(dec(tt.net)))
			require.Equal(t, tt.wantStreakSign, StreakSign(dec(tt.net)))
		})
	}
}

func TestDatePartsTheoTimezoneCuaAccount(t *testing.T) {
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)

	tests := []struct {
		name         string
		utc          string
		loc          *time.Location
		wantDay      string
		wantWeek     string
		wantWeekSort string
		wantMonth    string
		wantWeekday  string
	}{
		{
			name:         "golden fixture 2026-06-09 giờ VN",
			utc:          "2026-06-09T05:00:00Z", // 12:00 +07
			loc:          vn,
			wantDay:      "2026-06-09",
			wantWeek:     "W24",
			wantWeekSort: "2026-W24",
			wantMonth:    "06/2026",
			wantWeekday:  "Tue",
		},
		{
			name:         "23:00 UTC rơi sang ngày hôm sau ở giờ VN",
			utc:          "2026-06-09T23:00:00Z", // 06:00 +07 ngày 10
			loc:          vn,
			wantDay:      "2026-06-10",
			wantWeek:     "W24",
			wantWeekSort: "2026-W24",
			wantMonth:    "06/2026",
			wantWeekday:  "Wed",
		},
		{
			name:         "cùng thời điểm nhưng gom theo UTC thì là ngày 09",
			utc:          "2026-06-09T23:00:00Z",
			loc:          time.UTC,
			wantDay:      "2026-06-09",
			wantWeek:     "W24",
			wantWeekSort: "2026-W24",
			wantMonth:    "06/2026",
			wantWeekday:  "Tue",
		},
		{
			name:         "sát nửa đêm giờ VN vẫn nằm trong ngày đó",
			utc:          "2026-06-10T16:59:59Z", // 23:59:59 +07
			loc:          vn,
			wantDay:      "2026-06-10",
			wantWeek:     "W24",
			wantWeekSort: "2026-W24",
			wantMonth:    "06/2026",
			wantWeekday:  "Wed",
		},
		{
			name:         "ISO week vắt qua năm: 01/01/2027 thuộc tuần 53 của 2026",
			utc:          "2027-01-01T05:00:00Z",
			loc:          vn,
			wantDay:      "2027-01-01",
			wantWeek:     "W53",
			wantWeekSort: "2026-W53",
			wantMonth:    "01/2027",
			wantWeekday:  "Fri",
		},
		{
			name:         "tuần một chữ số phải zero-pad trong khoá sắp xếp",
			utc:          "2026-01-06T05:00:00Z", // 12:00 +07, ISO week 2 của 2026
			loc:          vn,
			wantDay:      "2026-01-06",
			wantWeek:     "W2",
			wantWeekSort: "2026-W02",
			wantMonth:    "01/2026",
			wantWeekday:  "Tue",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at, err := time.Parse(time.RFC3339, tt.utc)
			require.NoError(t, err)

			day, week, weekSort, month, weekday := DateParts(at, tt.loc)
			require.Equal(t, tt.wantDay, day)
			require.Equal(t, tt.wantWeek, week)
			require.Equal(t, tt.wantWeekSort, weekSort)
			require.Equal(t, tt.wantMonth, month)
			require.Equal(t, tt.wantWeekday, weekday)
		})
	}
}
