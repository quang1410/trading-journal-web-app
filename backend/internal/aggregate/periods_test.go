package aggregate_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/aggregate"
	"journal/internal/domain"
	"journal/internal/metrics"
)

// enrichForPeriods dựng dữ liệu test đi qua ĐÚNG đường mà production đi:
// metrics.Enrich sinh Day/WeekSort/CumByTrade, không phải test tự gán tay.
// Gán tay sẽ khiến test vẫn xanh khi quy ước gom nhóm đổi.
func enrichForPeriods(t *testing.T, acc domain.Account, trades []domain.Trade) []metrics.Enriched {
	t.Helper()
	rows, err := metrics.Enrich(trades, acc)
	if err != nil {
		t.Fatalf("Enrich: %v", err)
	}
	return rows
}

func accountVN(t *testing.T) domain.Account {
	t.Helper()
	return domain.Account{ID: 1, Timezone: "Asia/Ho_Chi_Minh", Currency: "USD"}
}

func tradeAt(t *testing.T, stt int, iso string, profit string) domain.Trade {
	t.Helper()
	at, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t.Fatalf("parse %q: %v", iso, err)
	}
	return domain.Trade{
		ID:        int64(stt),
		AccountID: 1,
		STT:       stt,
		EnteredAt: at,
		Symbol:    "XAUUSD",
		Profit:    decimal.RequireFromString(profit),
		Fee:       decimal.Zero,
	}
}

// Nửa đêm theo giờ account là ranh giới thật của một ngày, và nó KHÔNG trùng
// nửa đêm UTC. Một lệnh lúc 23:00 UTC ngày 20 là 06:00 giờ VN ngày 21.
func TestPeriodsGroupsByAccountTimezone(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-20T23:00:00Z", "10"), // 06:00 ngày 21 giờ VN
		tradeAt(t, 2, "2026-09-21T02:00:00Z", "20"), // 09:00 ngày 21 giờ VN
		tradeAt(t, 3, "2026-09-21T18:00:00Z", "30"), // 01:00 ngày 22 giờ VN
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("số kỳ = %d, want 2: %+v", len(got), got)
	}
	if got[0].Key != "2026-09-21" {
		t.Errorf("kỳ đầu = %q, want 2026-09-21", got[0].Key)
	}
	if got[0].KPI.TotalTrades != 2 {
		t.Errorf("số lệnh ngày 21 = %d, want 2", got[0].KPI.TotalTrades)
	}
	if got[1].Key != "2026-09-22" {
		t.Errorf("kỳ hai = %q, want 2026-09-22", got[1].Key)
	}
}

// Tuần ISO vắt qua giao thừa: 31/12/2025 thuộc tuần 1 của NĂM 2026. Khoá phải
// mang năm ISO (2026-W01), không phải năm lịch (2025-W01) — nếu không, hai
// tuần khác nhau ở hai năm sẽ đè lên nhau.
func TestPeriodsWeekKeyUsesISOYear(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2025-12-31T03:00:00Z", "10"), // 10:00 ngày 31/12 giờ VN
	})

	got := aggregate.Periods(rows, acc, domain.PeriodWeek)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Key != "2026-W01" {
		t.Errorf("khoá tuần = %q, want 2026-W01", got[0].Key)
	}
}

// Kỳ chỉ có lệnh HOÀ: không có lãi cũng không có lỗ, nên profit factor không
// tính được. Nó phải là nil ("không xác định"), không phải 0 — 0 đọc thành
// "thua sạch".
func TestPeriodsAllBreakEvenHasNilProfitFactor(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "0"),
		tradeAt(t, 2, "2026-09-21T03:00:00Z", "0"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].KPI.ProfitFactor != nil {
		t.Errorf("profit factor = %v, want nil", got[0].KPI.ProfitFactor)
	}
}

// Sparkline KHÔNG rebase về 0 tại đầu kỳ: nó là một ĐOẠN của đường equity
// thật. Ngày thứ hai bắt đầu từ chỗ ngày thứ nhất dừng lại.
func TestPeriodsPointsKeepGlobalCumulative(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "100"),
		tradeAt(t, 2, "2026-09-22T02:00:00Z", "50"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("số kỳ = %d, want 2", len(got))
	}
	second := got[1].Points
	if len(second) != 1 {
		t.Fatalf("số điểm ngày 22 = %d, want 1", len(second))
	}
	// 100 + 50, không phải 50.
	if !second[0].CumByTrade.Equal(decimal.RequireFromString("150")) {
		t.Errorf("cum_by_trade = %s, want 150", second[0].CumByTrade)
	}
}

// Quy tắc 8: danh sách thẻ sinh từ tập ĐÃ LỌC, nhưng cum_by_trade bên trong
// vẫn là số tính từ TRỌN dãy.
func TestPeriodsListsFilteredButKeepsFullCumulative(t *testing.T) {
	acc := accountVN(t)
	all := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "100"),
		tradeAt(t, 2, "2026-09-22T02:00:00Z", "50"),
	})
	filtered := all[1:] // chỉ giữ lệnh ngày 22

	got := aggregate.Periods(filtered, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Key != "2026-09-22" {
		t.Errorf("kỳ = %q, want 2026-09-22", got[0].Key)
	}
	if !got[0].Points[0].CumByTrade.Equal(decimal.RequireFromString("150")) {
		t.Errorf("cum_by_trade = %s, want 150 (tính từ trọn dãy)", got[0].Points[0].CumByTrade)
	}
}

// Volume cộng dồn trên các lệnh CÓ volume; lệnh để trống không đóng góp.
func TestPeriodsSumsVolume(t *testing.T) {
	acc := accountVN(t)
	one := decimal.RequireFromString("1.5")
	two := decimal.RequireFromString("2")
	trades := []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "10"),
		tradeAt(t, 2, "2026-09-21T03:00:00Z", "20"),
		tradeAt(t, 3, "2026-09-21T04:00:00Z", "30"),
	}
	trades[0].Volume = &one
	trades[1].Volume = &two
	// trades[2].Volume để nil.
	rows := enrichForPeriods(t, acc, trades)

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if !got[0].Volume.Equal(decimal.RequireFromString("3.5")) {
		t.Errorf("volume = %s, want 3.5", got[0].Volume)
	}
}

// Kỳ tuần phải mang Start/End là ngày đầu và cuối tuần ISO, để UI hiện
// "21/09 – 27/09" mà không phải tự tính lại.
func TestPeriodsWeekBounds(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-23T02:00:00Z", "10"), // thứ Tư tuần 39
	})

	got := aggregate.Periods(rows, acc, domain.PeriodWeek)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Start != "2026-09-21" {
		t.Errorf("start = %q, want 2026-09-21 (thứ Hai)", got[0].Start)
	}
	if got[0].End != "2026-09-27" {
		t.Errorf("end = %q, want 2026-09-27 (Chủ nhật)", got[0].End)
	}
}

// Kỳ ngày có Start = End = chính ngày đó.
func TestPeriodsDayBounds(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "10"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if got[0].Start != "2026-09-21" || got[0].End != "2026-09-21" {
		t.Errorf("bounds = %q..%q, want 2026-09-21..2026-09-21", got[0].Start, got[0].End)
	}
}

// Kỳ không hợp lệ trả slice RỖNG, không panic: handler đã chặn giá trị lạ,
// nhưng một hàm thuần không được sập vì tham số sai.
func TestPeriodsUnknownPeriodReturnsEmpty(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "10"),
	})

	if got := aggregate.Periods(rows, acc, "month"); len(got) != 0 {
		t.Errorf("Periods với kỳ lạ = %+v, want rỗng", got)
	}
}

// Sụt giảm của một kỳ phải đo TRONG kỳ đó, không mang theo đỉnh của kỳ trước.
//
// metrics.Enriched.Drawdown là số TOÀN CỤC (đỉnh lũy kế của cả tài khoản trừ
// đi lũy kế hiện tại) — đúng cho quy tắc 8 ở đường equity, nhưng sai khi dán
// lên thẻ một kỳ: một ngày toàn lệnh thắng vẫn nhận con số sụt giảm thừa kế
// từ đỉnh của ngày hôm trước, và người đọc hiểu là "hôm nay tôi đã tụt 30".
func TestPeriodsMaxDrawdownIsWithinPeriod(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		// Ngày 21: lên 100 rồi về 60 — sụt giảm THẬT trong ngày là 40.
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "100"),
		tradeAt(t, 2, "2026-09-21T03:00:00Z", "-40"),
		// Ngày 22: chỉ toàn lệnh thắng — không có sụt giảm nào.
		tradeAt(t, 3, "2026-09-22T02:00:00Z", "10"),
		tradeAt(t, 4, "2026-09-22T03:00:00Z", "5"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if want := "40"; got[0].KPI.MaxDrawdown.String() != want {
		t.Errorf("ngày 21 maxDD = %s, want %s", got[0].KPI.MaxDrawdown, want)
	}
	// Đây là chỗ bản cũ trả 30: đỉnh 100 của ngày hôm trước rò sang.
	if !got[1].KPI.MaxDrawdown.IsZero() {
		t.Errorf("ngày 22 maxDD = %s, want 0 (ngày toàn lệnh thắng)", got[1].KPI.MaxDrawdown)
	}
}

// Cùng lỗi đó ở kỳ tuần.
func TestPeriodsWeekMaxDrawdownIsWithinPeriod(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-14T02:00:00Z", "500"),
		tradeAt(t, 2, "2026-09-15T02:00:00Z", "-200"),
		tradeAt(t, 3, "2026-09-21T02:00:00Z", "10"),
		tradeAt(t, 4, "2026-09-22T02:00:00Z", "20"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodWeek)

	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if want := "200"; got[0].KPI.MaxDrawdown.String() != want {
		t.Errorf("tuần 38 maxDD = %s, want %s", got[0].KPI.MaxDrawdown, want)
	}
	if !got[1].KPI.MaxDrawdown.IsZero() {
		t.Errorf("tuần 39 maxDD = %s, want 0", got[1].KPI.MaxDrawdown)
	}
}

// Kỳ MỞ MÀN bằng lệnh thua: phần đã mất tính từ vị trí lúc vào kỳ.
//
// Ngày 22 bắt đầu ở +100 rồi tụt còn 50 — người dùng mất 50 thật trong ngày.
// Nếu đỉnh khởi tạo lấy thẳng CumByTrade của lệnh đầu (tức SAU khi đã trừ lệnh
// thua đó) thì thẻ báo 0 và giấu mất đúng khoản vừa mất.
func TestPeriodsMaxDrawdownCountsOpeningLoss(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(t, 1, "2026-09-21T02:00:00Z", "100"),
		tradeAt(t, 2, "2026-09-22T02:00:00Z", "-50"),
		tradeAt(t, 3, "2026-09-22T03:00:00Z", "5"),
	})

	got := aggregate.Periods(rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if want := "50"; got[1].KPI.MaxDrawdown.String() != want {
		t.Errorf("ngày 22 maxDD = %s, want %s", got[1].KPI.MaxDrawdown, want)
	}
}
