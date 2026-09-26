package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

// Periods đi qua Load nên nó thừa hưởng đúng quy tắc 8: thẻ sinh từ tập đã
// lọc, còn lũy kế bên trong tính từ trọn dãy.
func TestTradeServicePeriodsReturnsDayCards(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-09-21", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-09-21", "XAUUSD", "-40")
	addTrade(t, svc, acc, "2026-09-22", "XAUUSD", "50")

	got, err := svc.Periods(context.Background(), acc, service.Filter{}, "day")
	require.NoError(t, err)
	require.Len(t, got, 2)

	require.Equal(t, "2026-09-21", got[0].Key)
	require.Equal(t, 2, got[0].KPI.TotalTrades)
	require.Equal(t, "2026-09-22", got[1].Key)

	// Khoá sắp TĂNG DẦN, và vì khoá zero-pad nên đó cũng là thứ tự thời gian.
	for i := 1; i < len(got); i++ {
		require.Less(t, got[i-1].Key, got[i].Key)
	}
}

// Ba lệnh ở ba ngày khác nhau trong CÙNG một tuần ISO gom thành một thẻ tuần.
func TestTradeServicePeriodsGroupsWeek(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-09-21", "XAUUSD", "100") // thứ Hai
	addTrade(t, svc, acc, "2026-09-23", "XAUUSD", "-40") // thứ Tư
	addTrade(t, svc, acc, "2026-09-27", "XAUUSD", "50")  // Chủ nhật

	got, err := svc.Periods(context.Background(), acc, service.Filter{}, "week")
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "2026-W39", got[0].Key)
	require.Equal(t, "2026-09-21", got[0].Start)
	require.Equal(t, "2026-09-27", got[0].End)
	require.Equal(t, 3, got[0].KPI.TotalTrades)
}

// Kỳ lạ bị chặn ở service, KHÔNG trả danh sách rỗng đi tiếp: một danh sách
// rỗng đọc thành "tài khoản này chưa có lệnh nào" — câu trả lời sai cho một
// câu hỏi sai.
func TestTradeServicePeriodsRejectsUnknownPeriod(t *testing.T) {
	svc, acc := tradeFixture(t)

	_, err := svc.Periods(context.Background(), acc, service.Filter{}, "month")
	require.Error(t, err)
}

// Bộ lọc thu hẹp danh sách thẻ (quy tắc 8: KPI trên tập đã lọc).
func TestTradeServicePeriodsRespectsFilter(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-09-21", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-09-22", "EURUSD", "50")

	got, err := svc.Periods(context.Background(), acc, service.Filter{Symbol: "EURUSD"}, "day")
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "2026-09-22", got[0].Key)
}
