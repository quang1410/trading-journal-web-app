package service_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

// Test của JournalView — module gộp "nạp một lần, phục vụ mọi cách đọc".
//
// Chạy trên adapter in-memory nên không cần Docker.

// TestLoadLoadsOnce ghim con số mà cả Task 2 sinh ra để cải thiện.
//
// Trước Task 2, mỗi endpoint đọc (List, Stats, Charts) tự gọi Read nên một
// dashboard nạp toàn bảng BA lần. Giờ mỗi lần đọc là một JournalView, và một
// JournalView nạp đúng MỘT lần.
func TestLoadLoadsOnce(t *testing.T) {
	svc, acc, trades, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")
	countAfterCreate := trades.countListByAccount

	v, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)

	// Đọc đủ bốn kiểu từ CÙNG một view.
	_ = v.Page(1, 50)
	_ = v.KPI(nil)
	_ = v.Charts()
	_ = v.CSVRows()

	require.Equal(t, countAfterCreate+1, trades.countListByAccount,
		"một JournalView phục vụ mọi cách đọc bằng đúng một lần nạp")
}

// TestCreateAndLoadLoadsOnce: đường ghi cũng chỉ nạp lại đúng một lần.
func TestCreateAndLoadLoadsOnce(t *testing.T) {
	svc, acc, trades, _, _ := tradeFixtureFull(t)
	before := trades.countListByAccount

	v, id, err := svc.CreateAndLoad(context.Background(), acc, validInput())
	require.NoError(t, err)

	require.Equal(t, before+1, trades.countListByAccount,
		"tạo lệnh rồi đọc lại chỉ được nạp toàn bảng một lần")
	e, ok := v.ByID(id)
	require.True(t, ok, "lệnh vừa tạo phải có trong dãy")
	require.Equal(t, id, e.Trade.ID)
}

// TestByIDSearchesWholeSetNotFiltered: lệnh vừa tạo có thể nằm NGOÀI bộ
// lọc hiện hành; tìm trong tập đã lọc sẽ khiến tạo xong lại báo không thấy.
func TestByIDSearchesWholeSetNotFiltered(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")

	rows, err := svc.List(ctx, acc, service.Filter{}, 1, 50)
	require.NoError(t, err)
	require.Len(t, rows.Items, 1)
	id := rows.Items[0].Trade.ID

	// Bộ lọc loại hẳn lệnh đó ra.
	v, err := svc.Load(ctx, acc, service.Filter{Symbol: "KHONGCOMA"})
	require.NoError(t, err)
	require.Empty(t, v.CSVRows(), "bộ lọc phải loại hết")

	_, ok := v.ByID(id)
	require.True(t, ok, "ByID tìm trong TOÀN BỘ dãy, không phải tập đã lọc")
}

// TestKPIMetricsComputedOnFilteredSet — bất biến I2.
//
// Falsify: sửa JournalView.KPI cho truyền v.all vào tham số filtered của
// ComputeKPI thì test này phải đỏ.
func TestKPIMetricsComputedOnFilteredSet(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-06-10", "EURUSD", "500")

	v, err := svc.Load(ctx, acc, service.Filter{Symbol: "XAUUSD"})
	require.NoError(t, err)
	k := v.KPI(nil)

	require.Equal(t, 1, k.TotalTrades, "KPI chỉ đếm lệnh trong tập đã lọc")
	require.Equal(t, "100", k.NetProfit.String(),
		"lệnh EURUSD 500 bị bộ lọc loại, không được vào net_profit")
}

// TestCurrentBalanceIgnoresFilter — bất biến I3, ngoại lệ của quy tắc 8.
//
// Số dư tài khoản không phụ thuộc việc người dùng đang xem tháng nào. Excel
// làm giống vậy: Dashboard!V3 VLOOKUP thẳng vào Settings, không đi qua pivot.
//
// Falsify: sửa JournalView.KPI cho truyền v.filtered vào cả hai tham số thì
// test này phải đỏ.
func TestCurrentBalanceIgnoresFilter(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-06-10", "EURUSD", "500")

	// Không lọc: số dư = 10000 vốn + 600 lãi.
	whole, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Equal(t, "10600", whole.KPI(nil).CurrentBalance.String())

	// Lọc chỉ còn một lệnh: KPI đổi, nhưng số dư thì KHÔNG.
	filtered, err := svc.Load(ctx, acc, service.Filter{Symbol: "XAUUSD"})
	require.NoError(t, err)
	k := filtered.KPI(nil)

	require.Equal(t, "100", k.NetProfit.String(), "net_profit CHỊU bộ lọc")
	require.Equal(t, "10600", k.CurrentBalance.String(),
		"current_balance tính trên TOÀN BỘ lệnh, không chịu bộ lọc")
}

// TestChartsStreakComputedOnWholeSet — nửa còn lại của quy tắc 8.
//
// Streak được TÍNH LẠI mỗi lần từ slice truyền vào (khác cum_by_trade vốn đã
// nướng sẵn vào Enriched), nên nó phải nhận `all`. Truyền nhầm `filtered` vào
// đây là lỗi im lặng: vẫn ra số, chỉ là số sai.
func TestChartsStreakComputedOnWholeSet(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	// Ba lệnh thắng liên tiếp, nhưng hai trong số đó mang symbol khác.
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-06-10", "EURUSD", "100")
	addTrade(t, svc, acc, "2026-06-11", "EURUSD", "100")

	v, err := svc.Load(ctx, acc, service.Filter{Symbol: "XAUUSD"})
	require.NoError(t, err)
	c := v.Charts()

	require.Equal(t, 3, c.LongestWinStreak,
		"chuỗi thắng tính trên TOÀN BỘ dãy, không phải trên tập đã lọc")
	require.Len(t, c.BySymbol, 1, "pivot thì tính trên tập đã lọc")
}

// TestKPIAndChartsFromOneViewMatchSeparateCalls: gộp về JournalView không
// được làm đổi một con số nào so với đường cũ.
func TestKPIAndChartsFromOneViewMatchSeparateCalls(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-09", "XAUUSD", "100")
	addTrade(t, svc, acc, "2026-06-10", "EURUSD", "-50")

	f := service.Filter{From: "2026-06-09", To: "2026-06-30"}
	viaService, err := svc.Stats(ctx, acc, f)
	require.NoError(t, err)

	v, err := svc.Load(ctx, acc, f)
	require.NoError(t, err)
	viaView := v.KPI(nil)

	require.Equal(t, viaService.NetProfit.String(), viaView.NetProfit.String())
	require.Equal(t, viaService.TotalTrades, viaView.TotalTrades)
}

// TestPageFromViewMatchesServiceList: hai đường đọc phải cho cùng một trang.
func TestPageFromViewMatchesServiceList(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	ctx := context.Background()
	for _, day := range []string{"2026-06-09", "2026-06-10", "2026-06-11"} {
		addTrade(t, svc, acc, day, "XAUUSD", "100")
	}

	viaService, err := svc.List(ctx, acc, service.Filter{}, 1, 2)
	require.NoError(t, err)

	v, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	viaView := v.Page(1, 2)

	require.Equal(t, viaService.Total, viaView.Total)
	require.Len(t, viaView.Items, 2)
	require.Equal(t, viaService.Items[0].Trade.ID, viaView.Items[0].Trade.ID,
		"cùng thứ tự: lệnh mới nhất trước")
}

// TestAccountReturnsTheLoadedAccount: view mang theo account của chính nó, nên
// người gọi không phải nạp lại chỉ để lấy currency/timezone.
func TestAccountReturnsTheLoadedAccount(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	v, err := svc.Load(context.Background(), acc, service.Filter{})
	require.NoError(t, err)
	require.Equal(t, acc.ID, v.Account().ID)
	require.Equal(t, "Asia/Ho_Chi_Minh", v.Account().Timezone)
}

// TestLoadBadTimezoneIsDisplayableError: timezone sai là lỗi DỮ LIỆU của
// account (400), không phải sự cố hệ thống (500).
func TestLoadBadTimezoneIsDisplayableError(t *testing.T) {
	svc, acc, _, _, _ := tradeFixtureFull(t)
	broken := domain.Account{
		ID: acc.ID, UserID: acc.UserID, Code: acc.Code,
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
		Currency:       "USD",
		Timezone:       "Khong/Ton_Tai",
	}

	_, err := svc.Load(context.Background(), broken, service.Filter{})

	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e, "phải là lỗi nghiệp vụ hiển thị được")
	require.Equal(t, 400, e.Status)
}
