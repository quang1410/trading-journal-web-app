package aggregate

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// enrichCustom dựng Enriched từ các lệnh đã khai báo đầy đủ hơn enrichProfits.
func enrichCustom(t *testing.T, trades []domain.Trade) []metrics.Enriched {
	t.Helper()
	rows, err := metrics.Enrich(trades, testAccount())
	require.NoError(t, err)
	return rows
}

func vnTrade(t *testing.T, stt int, date, symbol, setup, tf, direction, profit string) domain.Trade {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	at, err := time.ParseInLocation("2006-01-02 15:04", date+" 12:00", vn)
	require.NoError(t, err)

	return domain.Trade{
		STT:       stt,
		EnteredAt: at.UTC(),
		Symbol:    symbol,
		Setup:     setup,
		Timeframe: tf,
		Direction: direction,
		Profit:    dec(profit),
		Fee:       dec("0"),
	}
}

func pivotByKey(t *testing.T, pivots []Pivot, key string) Pivot {
	t.Helper()
	for _, p := range pivots {
		if p.Key == key {
			return p
		}
	}
	t.Fatalf("không tìm thấy pivot %q", key)
	return Pivot{}
}

func TestBySetupTinhDungCacChiSo(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"),
		vnTrade(t, 3, "2026-06-10", "eur", "OB", "H1", domain.DirectionShort, "60"),
	})

	pivots := BySetup(rows)

	fvg := pivotByKey(t, pivots, "FVG")
	require.Equal(t, 2, fvg.Count)
	require.Equal(t, 1, fvg.WinCount)
	require.True(t, fvg.SumNet.Equal(dec("60")))
	require.True(t, fvg.AveNet.Equal(dec("30")))
	require.Equal(t, "0.5", fvg.WinRate.Round(4).String())

	ob := pivotByKey(t, pivots, "OB")
	require.Equal(t, 1, ob.Count)
	require.True(t, ob.SumNet.Equal(dec("60")))
}

func TestBySetupChiLayTop6TheoSoLenh(t *testing.T) {
	trades := []domain.Trade{}
	// setup A có 7 lệnh, B 6, C 5, D 4, E 3, F 2, G 1 -> G bị loại.
	counts := map[string]int{"A": 7, "B": 6, "C": 5, "D": 4, "E": 3, "F": 2, "G": 1}
	stt := 0
	for _, name := range []string{"A", "B", "C", "D", "E", "F", "G"} {
		for i := 0; i < counts[name]; i++ {
			stt++
			trades = append(trades, vnTrade(t, stt, "2026-06-09", "xau", name, "M15", domain.DirectionLong, "10"))
		}
	}

	pivots := BySetup(enrichCustom(t, trades))

	require.Len(t, pivots, 6)
	require.Equal(t, "A", pivots[0].Key)
	require.Equal(t, "F", pivots[5].Key)
}

// TestBySetupHoaSoLenhSapTheoKeyTangDan gia cố quy tắc tie-break ở
// topN (pivot.go): hoà số lệnh thì sắp theo Key tăng dần. Trước khi thêm test
// này, dòng so sánh Key < Key được exec (qua các test khác có nhiều setup)
// nhưng không test nào từng dựng đúng một cặp COUNT BẰNG NHAU rồi assert thứ
// tự — nên nhánh tie-break có thể bị đảo ngược mà vẫn xanh.
func TestBySetupHoaSoLenhSapTheoKeyTangDan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "Zulu", "M15", domain.DirectionLong, "10"),
		vnTrade(t, 2, "2026-06-10", "xau", "Zulu", "M15", domain.DirectionLong, "10"),
		vnTrade(t, 3, "2026-06-11", "xau", "Alpha", "M15", domain.DirectionLong, "10"),
		vnTrade(t, 4, "2026-06-12", "xau", "Alpha", "M15", domain.DirectionLong, "10"),
	})

	pivots := BySetup(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, 2, pivots[0].Count)
	require.Equal(t, 2, pivots[1].Count, "hai setup phải hoà số lệnh để bài test có ý nghĩa")
	require.Equal(t, "Alpha", pivots[0].Key, "hoà thì Key tăng dần, Alpha phải đứng trước Zulu")
	require.Equal(t, "Zulu", pivots[1].Key)
}

// TestBySymbolHoaSoLenhSapTheoKeyTangDan là bản tương đương cho BySymbol,
// dùng chung hàm topN với BySetup.
func TestBySymbolHoaSoLenhSapTheoKeyTangDan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "eur", "FVG", "M15", domain.DirectionLong, "10"),
		vnTrade(t, 2, "2026-06-10", "btc", "FVG", "M15", domain.DirectionLong, "10"),
	})

	pivots := BySymbol(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, 1, pivots[0].Count)
	require.Equal(t, 1, pivots[1].Count, "hai mã phải hoà số lệnh để bài test có ý nghĩa")
	require.Equal(t, "btc", pivots[0].Key, "hoà thì Key tăng dần")
	require.Equal(t, "eur", pivots[1].Key)
}

func TestByTimeframeGiuThuTuTangDan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "H1", domain.DirectionLong, "10"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M5", domain.DirectionLong, "10"),
		vnTrade(t, 3, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10"),
	})

	pivots := ByTimeframe(rows)

	require.Equal(t, []string{"M5", "M15", "H1"}, []string{pivots[0].Key, pivots[1].Key, pivots[2].Key})
}

func TestByDirectionLuonCoDuHaiNhom(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
	})

	pivots := ByDirection(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, domain.DirectionLong, pivots[0].Key)
	require.Equal(t, domain.DirectionShort, pivots[1].Key)
	require.Equal(t, 0, pivots[1].Count)
	require.True(t, pivots[1].WinRate.IsZero())
}

func TestByWeekdayDuBayNgayVaTachAmDuong(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"), // Tue
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"), // Tue
		vnTrade(t, 3, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "60"),  // Wed
	})

	stats := ByWeekday(rows)

	require.Len(t, stats, 7)
	require.Equal(t, "Mon", stats[0].Key)
	require.Equal(t, "Sun", stats[6].Key)

	tue := stats[1]
	require.Equal(t, "Tue", tue.Key)
	require.Equal(t, 2, tue.Count)
	require.True(t, tue.ProfitPositive.Equal(dec("100")))
	require.True(t, tue.ProfitNegative.Equal(dec("-40")))
	require.True(t, tue.SumNet.Equal(dec("60")))
}

func TestByWeekSapTheoNhan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"), // W24
		vnTrade(t, 2, "2026-06-16", "xau", "FVG", "M15", domain.DirectionLong, "50"),  // W25
	})

	pivots := ByWeek(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, "W24", pivots[0].Key)
	require.Equal(t, "W25", pivots[1].Key)
}

// TestByWeekTuanMotChuSoKhongSapSaiKieuLexical là regression cho lỗi sort
// chuỗi: "W10" < "W2" theo lexical dù W2 phải đứng trước W10 theo thời gian.
func TestByWeekTuanMotChuSoKhongSapSaiKieuLexical(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-03-03", "xau", "FVG", "M15", domain.DirectionLong, "10"), // ISO week 10/2026
		vnTrade(t, 2, "2026-01-06", "xau", "FVG", "M15", domain.DirectionLong, "20"), // ISO week 2/2026
	})

	pivots := ByWeek(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, "W2", pivots[0].Key, "tuần 2 phải đứng trước tuần 10")
	require.Equal(t, "W10", pivots[1].Key)
}

// TestByWeekKhongGopNhamHaiNamCungSoTuan là regression cho lỗi gộp nhầm: nhãn
// tuần không mang năm nên hai năm có cùng số tuần ISO đã bị cộng dồn vào một
// pivot duy nhất trước khi sửa.
func TestByWeekKhongGopNhamHaiNamCungSoTuan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2025-06-16", "xau", "FVG", "M15", domain.DirectionLong, "10"), // ISO week 25/2025
		vnTrade(t, 2, "2026-06-15", "xau", "FVG", "M15", domain.DirectionLong, "20"), // ISO week 25/2026
	})

	pivots := ByWeek(rows)

	require.Len(t, pivots, 2, "hai năm khác nhau phải là hai nhóm riêng, không gộp làm một")
	require.Equal(t, "W25", pivots[0].Key)
	require.Equal(t, "W25", pivots[1].Key)
	require.Equal(t, 1, pivots[0].Count)
	require.Equal(t, 1, pivots[1].Count)
	require.True(t, pivots[0].SumNet.Equal(dec("10")), "năm 2025 phải đứng trước năm 2026")
	require.True(t, pivots[1].SumNet.Equal(dec("20")))
}

func TestByDayKemDuongCumByDay(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-50"),
		vnTrade(t, 3, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "100"),
	})

	days := ByDay(rows)

	require.Len(t, days, 2)
	require.Equal(t, "2026-06-09", days[0].Day)
	require.True(t, days[0].SumNet.Equal(dec("50")))
	require.True(t, days[0].CumByDay.Equal(dec("50")))
	require.Equal(t, 2, days[0].Count)

	require.Equal(t, "2026-06-10", days[1].Day)
	require.True(t, days[1].SumNet.Equal(dec("100")))
	require.True(t, days[1].CumByDay.Equal(dec("150")))
}

func TestPivotDanhSachRong(t *testing.T) {
	require.Empty(t, BySetup(nil))
	require.Empty(t, ByWeek(nil))
	require.Empty(t, ByDay(nil))
	require.Len(t, ByDirection(nil), 2)
	require.Len(t, ByWeekday(nil), 7)
}
