package aggregate_test

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/aggregate"
	"journal/internal/metrics"
)

func sec(n int64) *int64 { return &n }

func TestHoldDistributionBucketBoundaries(t *testing.T) {
	// Mỗi case là một giá trị NGAY TẠI biên. Khoảng là nửa mở lo <= x < hi,
	// nên đúng 300 giây phải rơi vào bucket THỨ HAI, không phải bucket đầu.
	tests := []struct {
		name      string
		hold      int64
		wantLabel string
	}{
		{name: "0s", hold: 0, wantLabel: "< 5m"},
		{name: "299s ngay duoi bien 5m", hold: 299, wantLabel: "< 5m"},
		{name: "300s dung bien 5m", hold: 300, wantLabel: "5m – 15m"},
		{name: "899s", hold: 899, wantLabel: "5m – 15m"},
		{name: "900s dung bien 15m", hold: 900, wantLabel: "15m – 1h"},
		{name: "3599s", hold: 3599, wantLabel: "15m – 1h"},
		{name: "3600s dung bien 1h", hold: 3600, wantLabel: "1h – 4h"},
		{name: "14399s", hold: 14399, wantLabel: "1h – 4h"},
		{name: "14400s dung bien 4h", hold: 14400, wantLabel: "4h – 1 ngày"},
		{name: "86399s", hold: 86399, wantLabel: "4h – 1 ngày"},
		{name: "86400s dung bien 1 ngay", hold: 86400, wantLabel: "> 1 ngày"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := aggregate.HoldDistribution([]metrics.Enriched{
				{Net: decimal.NewFromInt(10), HoldSeconds: sec(tc.hold)},
			})

			// Đúng MỘT bucket có lệnh, và nó phải là bucket mong đợi: khẳng
			// định này bắt cả trường hợp lệnh bị đếm hai lần lẫn lọt khe.
			var hit []string
			for _, b := range got {
				if b.Count > 0 {
					hit = append(hit, b.Label)
				}
			}
			require.Equal(t, []string{tc.wantLabel}, hit)
		})
	}
}

func TestHoldDistributionAlwaysReturnsSixBuckets(t *testing.T) {
	got := aggregate.HoldDistribution(nil)

	require.Len(t, got, 6)
	require.Equal(t, []string{"< 5m", "5m – 15m", "15m – 1h", "1h – 4h", "4h – 1 ngày", "> 1 ngày"},
		[]string{got[0].Label, got[1].Label, got[2].Label, got[3].Label, got[4].Label, got[5].Label})
	for _, b := range got {
		require.Zero(t, b.Count)
		require.True(t, b.SumNet.IsZero())
	}
}

func TestHoldDistributionSkipsUnclosedTrades(t *testing.T) {
	got := aggregate.HoldDistribution([]metrics.Enriched{
		{Net: decimal.NewFromInt(10), HoldSeconds: sec(60)},
		{Net: decimal.NewFromInt(99), HoldSeconds: nil},
	})

	total := 0
	for _, b := range got {
		total += b.Count
	}
	// Lệnh chưa đóng không vào bucket nào — nếu nó lọt vào một bucket thì
	// tổng sẽ là 2, và biểu đồ sẽ kể một câu chuyện về lệnh mà nó không biết
	// gì về thời gian giữ.
	require.Equal(t, 1, total)
}

// HoldSeconds âm không thể sinh ra qua bất kỳ đường ghi hợp lệ nào (domain.
// ValidateTrade chặn closed_at < entered_at ở cả ba đường). Nhưng dữ liệu
// hỏng có thể lọt vào bằng đường khác (sửa tay trong DB, khôi phục backup
// cũ trước khi luật này tồn tại) — và nếu bucket đầu không có cận dưới, giá
// trị âm sẽ khớp "seconds < 300" rồi bị đếm như một lệnh scalp dưới 5 phút,
// kéo lệch cả count lẫn AvgHoldSeconds một cách âm thầm.
func TestHoldDistributionSkipsNegativeHoldSeconds(t *testing.T) {
	got := aggregate.HoldDistribution([]metrics.Enriched{
		{Net: decimal.NewFromInt(10), HoldSeconds: sec(-7200)},
		{Net: decimal.NewFromInt(99), HoldSeconds: sec(60)},
	})

	total := 0
	for _, b := range got {
		total += b.Count
	}
	require.Equal(t, 1, total, "giá trị âm không được đếm vào bucket nào")
}

func TestHoldDistributionWinsLossesAndSumNet(t *testing.T) {
	got := aggregate.HoldDistribution([]metrics.Enriched{
		{Net: decimal.NewFromInt(30), HoldSeconds: sec(60)},
		{Net: decimal.NewFromInt(-10), HoldSeconds: sec(120)},
		{Net: decimal.Zero, HoldSeconds: sec(180)},
	})

	first := got[0]
	require.Equal(t, 3, first.Count)
	require.Equal(t, 1, first.Wins)
	require.Equal(t, 1, first.Losses)
	// Lệnh hoà đếm vào Count nhưng không vào Wins cũng không vào Losses —
	// cùng quy ước với RDistribution.
	require.Equal(t, "20", first.SumNet.String())
}
