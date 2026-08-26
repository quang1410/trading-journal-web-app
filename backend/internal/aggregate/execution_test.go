package aggregate

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// rowClass dựng nhanh một Enriched chỉ với hai thứ ExecutionQualityOf quan
// tâm: loại lệnh và setup. Không đi qua metrics.Enrich vì ở đây ta cần đặt
// TradeClass trực tiếp — Enrich sẽ tự suy ra nó từ điểm số, làm test dài ra
// mà không kiểm thêm được gì.
func rowClass(class, setup string) metrics.Enriched {
	return metrics.Enriched{
		Trade:      domain.Trade{Setup: setup},
		TradeClass: class,
	}
}

func TestExecutionQualityOfGoldenFixture(t *testing.T) {
	rows := []metrics.Enriched{
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassImpulsive, domain.DefaultSetup),
		rowClass(domain.ClassRevenge, domain.DefaultSetup),
		rowClass(domain.ClassNotEvaluated, "Pullback"),
	}

	got := ExecutionQualityOf(rows)

	require.NotNil(t, got.PlannedPct)
	require.True(t, got.PlannedPct.Equal(dec("0.4")),
		"2 đúng kế hoạch / 5 lệnh, mẫu số gồm cả CHƯA ĐÁNH GIÁ, nhận %s", got.PlannedPct)
	require.Equal(t, 2, got.NoSetupCount)
	require.Equal(t, 2, got.ImpulsiveCount, "Bốc đồng / FOMO + Giao dịch trả thù")
}

// Mẫu số PHẢI gồm lệnh chưa chấm điểm. Nếu ai đó "sửa" theo hướng loại chúng
// ra cho giống §2.5, test này đỏ — hai luật khác nhau: §2.5 nói về TRUNG BÌNH
// điểm, còn đây là TỈ LỆ lệnh, Excel cộng đủ 5 hàng U103:U107.
func TestExecutionQualityOfMauSoGomCaLenhChuaCham(t *testing.T) {
	rows := []metrics.Enriched{
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassNotEvaluated, "Breakout"),
	}

	got := ExecutionQualityOf(rows)

	require.True(t, got.PlannedPct.Equal(dec("0.5")),
		"1/2 chứ không phải 1/1, nhận %s", got.PlannedPct)
}

func TestExecutionQualityOfDanhSachRong(t *testing.T) {
	got := ExecutionQualityOf(nil)

	require.Nil(t, got.PlannedPct, "0 lệnh khác 0%%, phải là nil để FE hiện —")
	require.Equal(t, 0, got.NoSetupCount)
	require.Equal(t, 0, got.ImpulsiveCount)
}

// Setup rỗng KHÔNG phải no-setup. Người dùng để trống ô setup là chuyện khác
// với việc họ chủ động chọn "KHÔNG CÓ SETUP"; gộp hai thứ sẽ thổi phồng con số.
func TestExecutionQualityOfSetupRongKhongTinhLaNoSetup(t *testing.T) {
	rows := []metrics.Enriched{rowClass(domain.ClassPlanned, "")}

	require.Equal(t, 0, ExecutionQualityOf(rows).NoSetupCount)
}

// rowClassNet như rowClass nhưng đặt luôn Net — dùng cho các hàm tính tiền.
func rowClassNet(class, net string) metrics.Enriched {
	return metrics.Enriched{
		Trade:      domain.Trade{Setup: "Breakout"},
		TradeClass: class,
		Net:        dec(net),
	}
}

// ── T5: phân bố theo loại lệnh ────────────────────────────────────────────

func TestByTradeClassGoldenFixture(t *testing.T) {
	rows := []metrics.Enriched{
		rowClassNet(domain.ClassPlanned, "100"),
		rowClassNet(domain.ClassPlanned, "50"),
		rowClassNet(domain.ClassRevenge, "-200"),
		rowClassNet(domain.ClassNotEvaluated, "10"),
	}

	got := ByTradeClass(rows)

	require.Len(t, got, 5, "luôn đủ 5 hàng kể cả loại có 0 lệnh")
	byClass := map[string]ClassStat{}
	for _, c := range got {
		byClass[c.Class] = c
	}

	require.Equal(t, 2, byClass[domain.ClassPlanned].Count)
	require.True(t, byClass[domain.ClassPlanned].SumNet.Equal(dec("150")))
	require.True(t, byClass[domain.ClassPlanned].Pct.Equal(dec("0.5")))

	require.Equal(t, 1, byClass[domain.ClassRevenge].Count)
	require.True(t, byClass[domain.ClassRevenge].SumNet.Equal(dec("-200")))

	require.Equal(t, 0, byClass[domain.ClassNeedsWork].Count, "loại vắng mặt vẫn có hàng")
	require.True(t, byClass[domain.ClassNeedsWork].SumNet.IsZero())
	require.True(t, byClass[domain.ClassNeedsWork].Pct.IsZero())
}

// Thứ tự hàng phải bám domain.TradeClasses. Doughnut lấy màu theo chỉ số hàng;
// thứ tự nhảy giữa hai lần render sẽ đổi màu hạng mục ngay trước mắt người dùng.
func TestByTradeClassGiuThuTuEnum(t *testing.T) {
	got := ByTradeClass(nil)

	require.Len(t, got, 5)
	for i, want := range domain.TradeClasses {
		require.Equal(t, want, got[i].Class, "hàng %d sai thứ tự", i)
	}
}

// ── T6: thắng / thua / hoà ────────────────────────────────────────────────

func TestWinLossTachLenhHoaRaRieng(t *testing.T) {
	rows := []metrics.Enriched{
		rowClassNet(domain.ClassPlanned, "100"),
		rowClassNet(domain.ClassPlanned, "-50"),
		rowClassNet(domain.ClassPlanned, "0"),
		rowClassNet(domain.ClassPlanned, "20"),
	}

	got := WinLossOf(rows)

	require.Equal(t, 2, got.WinCount)
	require.Equal(t, 1, got.LossCount)
	require.Equal(t, 1, got.EvenCount, "net = 0 không vào thắng lẫn thua (§10 mục 2)")
	require.Equal(t, len(rows), got.WinCount+got.LossCount+got.EvenCount,
		"ba con số phải phủ hết tập, không lệnh nào biến mất")
}

func TestWinLossDanhSachRong(t *testing.T) {
	got := WinLossOf(nil)
	require.Equal(t, WinLossSplit{}, got)
}

// ── T7: ba tile lý thuyết vs thực tế ──────────────────────────────────────

func TestTheorySummaryOfLayDiemCuoi(t *testing.T) {
	points := []TheoryPoint{
		{STT: 1, CumTheory: dec("100"), CumByTrade: dec("80")},
		{STT: 2, CumTheory: dec("250"), CumByTrade: dec("190")},
	}

	got := TheorySummaryOf(points)

	require.True(t, got.Theory.Equal(dec("250")), "điểm CUỐI, không phải tổng")
	require.True(t, got.Actual.Equal(dec("190")))
	require.True(t, got.Diff.Equal(dec("-60")), "thực tế − lý thuyết, âm là thực tế kém hơn")
}

func TestTheorySummaryOfDanhSachRong(t *testing.T) {
	got := TheorySummaryOf(nil)

	require.True(t, got.Theory.IsZero())
	require.True(t, got.Actual.IsZero())
	require.True(t, got.Diff.IsZero())
}
