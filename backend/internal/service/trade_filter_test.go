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

// hang dựng một Enriched tối thiểu đủ để bộ lọc làm việc. Không gọi
// metrics.Enrich ở đây: test này kiểm bộ lọc, không kiểm phép làm giàu.
func hang(day, setup, symbol, timeframe, direction, class string) metrics.Enriched {
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

var mau = []metrics.Enriched{
	hang("2026-06-08", "Breakout", "XAUUSD", "H1", domain.DirectionLong, domain.ClassPlanned),
	hang("2026-06-10", "Pullback", "EURUSD", "M15", domain.DirectionShort, domain.ClassNotEvaluated),
	hang("2026-06-12", "Breakout", "EURUSD", "H1", domain.DirectionLong, domain.ClassImpulsive),
}

func ngay(rows []metrics.Enriched) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Day)
	}
	return out
}

func TestFilterRongGiuNguyenTatCa(t *testing.T) {
	require.NotEmpty(t, mau, "dữ liệu mẫu rỗng thì mọi khẳng định dưới đây đều xanh vô nghĩa")
	got := service.Filter{}.Apply(mau)
	require.Len(t, got, 3)
}

func TestFilterKhoangNgayBaoGomHaiDauMut(t *testing.T) {
	got := service.Filter{From: "2026-06-08", To: "2026-06-10"}.Apply(mau)
	require.Equal(t, []string{"2026-06-08", "2026-06-10"}, ngay(got),
		"cả hai đầu mút đều phải nằm trong tập kết quả")
}

func TestFilterChiCoFrom(t *testing.T) {
	got := service.Filter{From: "2026-06-10"}.Apply(mau)
	require.Equal(t, []string{"2026-06-10", "2026-06-12"}, ngay(got))
}

func TestFilterChiCoTo(t *testing.T) {
	got := service.Filter{To: "2026-06-08"}.Apply(mau)
	require.Equal(t, []string{"2026-06-08"}, ngay(got))
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Day do metrics.DateParts sinh, đã quy đổi sang timezone của account. Một
// lệnh vào lúc 23:00Z ngày 09 là lệnh của ngày 10 ở giờ Việt Nam. Nếu ai đó
// "sửa" bộ lọc thành so trên EnteredAt cho có vẻ chặt chẽ, lệnh này sẽ rơi
// nhầm sang ngày 09 và biến mất khỏi bộ lọc tháng — im lặng.
func TestFilterSoTrenDayChuKhongPhaiEnteredAt(t *testing.T) {
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

func TestFilterTheoTungTruongChuoi(t *testing.T) {
	cases := []struct {
		ten  string
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
		t.Run(c.ten, func(t *testing.T) {
			require.Equal(t, c.muon, ngay(c.f.Apply(mau)))
		})
	}
}

// So khớp CHÍNH XÁC, không phải chứa. "Break" không được kéo theo "Breakout":
// setup là khoá gom nhóm của pivot, khớp mờ sẽ làm hai nhóm khác nhau trộn
// vào một, và con số vẫn ra bình thường nên không ai phát hiện.
func TestFilterKhopChinhXacChuKhongPhaiChuoiCon(t *testing.T) {
	require.Empty(t, service.Filter{Setup: "Break"}.Apply(mau))
	require.Empty(t, service.Filter{Symbol: "EUR"}.Apply(mau))
}

func TestFilterNhieuDieuKienLaPhepVA(t *testing.T) {
	got := service.Filter{Setup: "Breakout", Symbol: "EURUSD"}.Apply(mau)
	require.Equal(t, []string{"2026-06-12"}, ngay(got))
}

func TestFilterKhongKhopGiThiTraMangRongChuKhongNil(t *testing.T) {
	got := service.Filter{Symbol: "KHONG_TON_TAI"}.Apply(mau)
	require.NotNil(t, got, "nil sẽ marshal ra null; API phải trả []")
	require.Empty(t, got)
}

func TestFilterKhongDoiLatCatDauVao(t *testing.T) {
	truoc := ngay(mau)
	service.Filter{Symbol: "EURUSD"}.Apply(mau)
	require.Equal(t, truoc, ngay(mau), "Apply không được ghi đè lát cắt gốc")
}

func TestFilterNormalizeCatKhoangTrang(t *testing.T) {
	f := service.Filter{From: "  2026-06-08 ", Symbol: " EURUSD "}.Normalize()
	require.Equal(t, "2026-06-08", f.From)
	require.Equal(t, "EURUSD", f.Symbol)
}

func TestFilterIsEmpty(t *testing.T) {
	require.True(t, service.Filter{}.IsEmpty())
	require.False(t, service.Filter{Symbol: "X"}.IsEmpty())
}
