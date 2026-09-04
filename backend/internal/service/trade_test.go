package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// tradeFixture dựng service thật trên Postgres thật, kèm một account có timezone
// giờ Việt Nam và vốn 10000, risk 1% (nên 1R = 100).
func tradeFixture(t *testing.T) (*service.TradeService, domain.Account) {
	t.Helper()
	svc, acc, _, _, _ := tradeFixtureFull(t)
	return svc, acc
}

// tradeFixtureFull dựng service trên adapter in-memory và trả kèm chính các
// store, để test nào cần soi trạng thái (đếm số lần nạp, tạo user thứ hai)
// lấy được mà không phải dựng lại bộ đồ.
//
// Chạy KHÔNG cần Docker: hành vi của store được ghim bằng contract test chạy
// hai lượt trên cả adapter này lẫn Postgres thật (store_contract_test.go),
// nên nhanh ở đây không đánh đổi bằng độ tin cậy.
func tradeFixtureFull(t *testing.T) (*service.TradeService, domain.Account, *memTradeStore, *memCashFlowStore, *memUserStore) {
	t.Helper()
	users := newMemUserStore()
	u, err := users.Create(context.Background(), "chu@example.com", "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(newMemAccountStore())
	acc, err := accountSvc.Create(context.Background(), u.ID, service.AccountCreate{
		Code:           "ACC1",
		Name:           "Chính",
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	trades := newMemTradeStore()
	flows := newMemCashFlowStore()
	return service.NewTradeService(trades, flows, accountSvc), acc, trades, flows, users
}

// addTrade chèn một lệnh vào lúc 12:00 giờ VN — cách xa nửa đêm nên `day`
// không phụ thuộc mẹo múi giờ.
func addTrade(t *testing.T, svc *service.TradeService, acc domain.Account, dayVN string, symbol string, profit string) {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, dayVN+"T12:00:00+07:00")
	require.NoError(t, err)
	_, err = svc.Create(context.Background(), acc, service.TradeInput{
		EnteredAt: ts,
		Symbol:    symbol,
		Direction: domain.DirectionLong,
		Profit:    decimal.RequireFromString(profit),
	})
	require.NoError(t, err)
}

func TestReadEmptyListNoError(t *testing.T) {
	svc, acc := tradeFixture(t)

	res, err := svc.Load(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.Empty(t, res.AllForTest())
	require.Empty(t, res.FilteredForTest())
	require.NotNil(t, res.FilteredForTest(), "phải là [] chứ không phải null")
	require.Equal(t, acc.ID, res.Account().ID)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// §7.1: lũy kế tính trên TOÀN BỘ dãy, filter chỉ lọc phần hiển thị. Nếu ai
// đó lọc trước rồi mới Enrich, cum_by_trade của lệnh giữa dãy sẽ bằng chính
// net của nó — một đường equity dựng từ tập con, tức một đường không có thật.
func TestReadCumulativeOnWholeSetEvenWhenFiltered(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-06-10", "BBB", "50")
	addTrade(t, svc, acc, "2026-06-12", "CCC", "25")

	res, err := svc.Load(context.Background(), acc, service.Filter{Symbol: "BBB"})
	require.NoError(t, err)

	require.Len(t, res.AllForTest(), 3, "All phải giữ nguyên cả ba")
	require.Len(t, res.FilteredForTest(), 1)
	require.Equal(t, "BBB", res.FilteredForTest()[0].Trade.Symbol)

	// Lệnh BBB đứng thứ hai: lũy kế của nó là 100 + 50 = 150, KHÔNG phải 50.
	require.True(t, res.FilteredForTest()[0].CumByTrade.Equal(decimal.RequireFromString("150")),
		"cum_by_trade phải là lũy kế từ đầu lịch sử, nhận được %s", res.FilteredForTest()[0].CumByTrade)
}

func TestReadDeletedTradeNotInAllNorCumulative(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-06-10", "BBB", "50")
	addTrade(t, svc, acc, "2026-06-12", "CCC", "25")
	ctx := context.Background()

	before, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.True(t, before.AllForTest()[2].CumByTrade.Equal(decimal.RequireFromString("175")))

	require.NoError(t, svc.Delete(ctx, before.AllForTest()[1].Trade.ID))

	after, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, after.AllForTest(), 2)
	require.True(t, after.AllForTest()[1].CumByTrade.Equal(decimal.RequireFromString("125")),
		"xoá lệnh giữa dãy phải làm lũy kế của lệnh sau nó giảm đi, nhận %s", after.AllForTest()[1].CumByTrade)
}

func TestReadBadAccountTimezoneReturnsError(t *testing.T) {
	svc, acc := tradeFixture(t)
	acc.Timezone = "Sao/Hoa"

	_, err := svc.Load(context.Background(), acc, service.Filter{})

	require.Error(t, err)
}

func TestListPaginatesNewestFirst(t *testing.T) {
	svc, acc := tradeFixture(t)
	for _, s := range []string{"A", "B", "C", "D", "E"} {
		addTrade(t, svc, acc, "2026-06-10", s, "10")
	}

	p, err := svc.List(context.Background(), acc, service.Filter{}, 1, 2)

	require.NoError(t, err)
	require.Equal(t, 5, p.Total)
	require.Len(t, p.Items, 2)
	require.Equal(t, "E", p.Items[0].Trade.Symbol, "trang đầu phải là lệnh mới nhất")
	require.Equal(t, "D", p.Items[1].Trade.Symbol)
}

func TestListLastPageAndPageBeyondEnd(t *testing.T) {
	svc, acc := tradeFixture(t)
	for _, s := range []string{"A", "B", "C"} {
		addTrade(t, svc, acc, "2026-06-10", s, "10")
	}
	ctx := context.Background()

	last, err := svc.List(ctx, acc, service.Filter{}, 2, 2)
	require.NoError(t, err)
	require.Len(t, last.Items, 1)
	require.Equal(t, "A", last.Items[0].Trade.Symbol)

	// Trang vượt quá trả mảng rỗng kèm total đúng — không phải lỗi. Frontend
	// đang ở trang 9 rồi bấm lọc không nên thấy màn hình lỗi.
	far, err := svc.List(ctx, acc, service.Filter{}, 99, 2)
	require.NoError(t, err)
	require.Empty(t, far.Items)
	require.NotNil(t, far.Items)
	require.Equal(t, 3, far.Total)
}

func TestListClampsBadPaginationParams(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-10", "A", "10")
	ctx := context.Background()

	cases := []struct {
		name             string
		page, size       int
		muonPage, muonSz int
	}{
		{"page 0 về 1", 0, 10, 1, 10},
		{"page âm về 1", -5, 10, 1, 10},
		{"size 0 về mặc định", 1, 0, 1, service.DefaultPageSize},
		{"size âm về mặc định", 1, -1, 1, service.DefaultPageSize},
		{"size vượt trần bị kẹp", 1, 5000, 1, service.MaxPageSize},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, err := svc.List(ctx, acc, service.Filter{}, c.page, c.size)
			require.NoError(t, err)
			require.Equal(t, c.muonPage, p.Page)
			require.Equal(t, c.muonSz, p.Size)
		})
	}
}

func TestListTotalCountsFilteredSetNotAll(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "10")
	addTrade(t, svc, acc, "2026-06-10", "BBB", "10")
	addTrade(t, svc, acc, "2026-06-12", "BBB", "10")

	p, err := svc.List(context.Background(), acc, service.Filter{Symbol: "BBB"}, 1, 50)

	require.NoError(t, err)
	require.Equal(t, 2, p.Total, "total là số lệnh SAU khi lọc, để frontend đếm trang đúng")
}

// KPI tính trên tập ĐÃ LỌC — ngược với lũy kế. Hai luật trái chiều nhau
// trong cùng một request là lý do §7.1 được gọi là "chỗ dễ sai nhất".
func TestStatsComputedOnFilteredSet(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-06-10", "BBB", "50")
	addTrade(t, svc, acc, "2026-06-12", "CCC", "-30")

	k, err := svc.Stats(context.Background(), acc, service.Filter{Symbol: "BBB"})

	require.NoError(t, err)
	require.Equal(t, 1, k.TotalTrades, "chỉ đếm lệnh trong tập đã lọc")
	require.Equal(t, 1, k.WinCount)
	require.Equal(t, 0, k.LossCount)
	require.True(t, k.NetProfit.Equal(decimal.RequireFromString("50")),
		"net_profit của tập đã lọc, nhận %s", k.NetProfit)
}

func TestStatsWithoutFilterComputesOnAll(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-06-10", "BBB", "50")

	k, err := svc.Stats(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.Equal(t, 2, k.TotalTrades)
	require.True(t, k.NetProfit.Equal(decimal.RequireFromString("150")))
}

// current_balance = vốn ban đầu + nạp − rút + lãi lỗ. Nếu Stats quên nạp
// cash flow thì con số này lặng lẽ thiếu phần nạp/rút, mà nó vẫn ra một số
// trông hợp lý nên không ai nghi ngờ.
func TestStatsAddsCashFlowToCurrentBalance(t *testing.T) {
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	u, err := users.Create(context.Background(), "chu@example.com", "hash")
	require.NoError(t, err)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	acc, err := accountSvc.Create(context.Background(), u.ID, service.AccountCreate{
		Code: "ACC1", Name: "Chính", Currency: "USD", Timezone: "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	flows := repository.NewCashFlowRepo(db)
	cfSvc := service.NewCashFlowService(flows, accountSvc)
	_, err = cfSvc.Create(context.Background(), acc.ID, service.CashFlowCreate{
		Date: "2026-06-01", Amount: decimal.RequireFromString("500"), Type: domain.CashFlowDeposit,
	})
	require.NoError(t, err)

	svc := service.NewTradeService(repository.NewTradeRepo(db), flows, accountSvc)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")

	k, err := svc.Stats(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.True(t, k.CurrentBalance.Equal(decimal.RequireFromString("10600")),
		"10000 vốn + 500 nạp + 100 lãi = 10600, nhận %s", k.CurrentBalance)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// aggregate.All(all, filtered, acc) — hai tham số cùng kiểu, đảo chỗ vẫn
// biên dịch và vẫn ra số. Phase 1 đã ghim ngữ nghĩa bằng
// TestAllStreakOnAllPivotOnFiltered; test này ghim lại ở tầng
// service, nơi thực sự quyết định truyền gì vào.
func TestChartsStreakOnAllPivotOnFiltered(t *testing.T) {
	svc, acc := tradeFixture(t)
	// Ba lệnh thắng liên tiếp, nhưng chỉ một trong số đó lọt bộ lọc.
	addTrade(t, svc, acc, "2026-06-08", "AAA", "10")
	addTrade(t, svc, acc, "2026-06-09", "BBB", "10")
	addTrade(t, svc, acc, "2026-06-10", "AAA", "10")

	c, err := svc.Charts(context.Background(), acc, service.Filter{Symbol: "BBB"})

	require.NoError(t, err)
	require.Equal(t, 3, c.LongestWinStreak,
		"streak tính trên TOÀN BỘ dãy nên vẫn là 3 dù bộ lọc chỉ giữ 1 lệnh")

	require.NotEmpty(t, c.BySymbol, "pivot rỗng thì khẳng định dưới đây xanh vô nghĩa")
	require.Len(t, c.BySymbol, 1, "pivot tính trên tập ĐÃ LỌC nên chỉ còn một symbol")
	require.Equal(t, "BBB", c.BySymbol[0].Key)
}

func TestChartsEmptyListReturnsAllGroupsNoPanic(t *testing.T) {
	svc, acc := tradeFixture(t)

	c, err := svc.Charts(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.NotNil(t, c.BySetup)
	require.NotNil(t, c.ByWeekday)
	require.Len(t, c.ByWeekday, 7, "bảy ngày trong tuần luôn có mặt, kể cả khi không có lệnh")
	require.Len(t, c.ByDirection, 2, "Long và Short luôn có mặt")
	require.Equal(t, 0, c.LongestWinStreak)
}

// Charts và Stats gọi Read riêng rẽ, mỗi cái một lần. Nếu paginate hoặc
// bất cứ ai khác đảo Filtered TẠI CHỖ thì lần đọc sau nhận dãy đã bị lật
// ngược, và pivot theo tuần/ngày sẽ sắp sai mà không có lỗi nào bật ra.
func TestChartsUnaffectedByEarlierListCall(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "10")
	addTrade(t, svc, acc, "2026-06-09", "BBB", "20")
	addTrade(t, svc, acc, "2026-06-10", "CCC", "30")
	ctx := context.Background()

	mark, err := svc.Charts(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.NotEmpty(t, mark.ByDay)

	_, err = svc.List(ctx, acc, service.Filter{}, 1, 50)
	require.NoError(t, err)

	after, err := svc.Charts(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Equal(t, mark.ByDay, after.ByDay, "gọi List không được làm đổi kết quả Charts")
}

func validInput() service.TradeInput {
	return service.TradeInput{
		EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.RequireFromString("100"),
	}
}

func TestCreateRejectsBadInput(t *testing.T) {
	cases := map[string]func(in *service.TradeInput){
		"symbol rỗng":          func(in *service.TradeInput) { in.Symbol = "" },
		"symbol toàn dấu cách": func(in *service.TradeInput) { in.Symbol = "   " },
		"direction rỗng":       func(in *service.TradeInput) { in.Direction = "" },
		"direction lạ":         func(in *service.TradeInput) { in.Direction = "Sideways" },
		"timeframe lạ":         func(in *service.TradeInput) { in.Timeframe = "H3" },
		"entry_quality lạ":     func(in *service.TradeInput) { in.EntryQuality = "Tạm được" },
		"in_trade_quality lạ":  func(in *service.TradeInput) { in.InTradeQuality = "Bình thường" },
		"exit_quality lạ":      func(in *service.TradeInput) { in.ExitQuality = "Chốt non" },
		"psychology lạ":        func(in *service.TradeInput) { in.Psychology = "Bình tĩnh" },
		"entered_at rỗng":      func(in *service.TradeInput) { in.EnteredAt = time.Time{} },
	}
	require.NotEmpty(t, cases)

	for name, broken := range cases {
		t.Run(name, func(t *testing.T) {
			svc, acc := tradeFixture(t)
			in := validInput()
			broken(&in)

			_, err := svc.Create(context.Background(), acc, in)

			require.Error(t, err)
			e := apperr.As(err)
			require.NotNil(t, e, "phải là lỗi nghiệp vụ hiển thị được, nhận %v", err)
			require.Equal(t, 400, e.Status)
		})
	}
}

// Bốn trường chấm điểm CHO PHÉP rỗng — lệnh chưa đánh giá là trạng thái hợp
// lệ, không phải input hỏng (spec mẹ quyết định #8).
func TestCreateAcceptsFourEmptyScoringFields(t *testing.T) {
	svc, acc := tradeFixture(t)

	tr, err := svc.Create(context.Background(), acc, validInput())

	require.NoError(t, err)
	require.Empty(t, tr.EntryQuality)
	require.Empty(t, tr.Psychology)
}

func TestCreateAcceptsEmptyTimeframe(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	in.Timeframe = ""

	_, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
}

// Lỗ là số âm và hoàn toàn hợp lệ. Đây là nhật ký, không phải bảng khoe lãi.
func TestCreateAcceptsNegativeAndZeroProfit(t *testing.T) {
	for _, p := range []string{"-250.75", "0"} {
		t.Run(p, func(t *testing.T) {
			svc, acc := tradeFixture(t)
			in := validInput()
			in.Profit = decimal.RequireFromString(p)

			tr, err := svc.Create(context.Background(), acc, in)

			require.NoError(t, err)
			require.True(t, tr.Profit.Equal(decimal.RequireFromString(p)))
		})
	}
}

func TestCreateEmptySetupBecomesDefault(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	in.Setup = "   "

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, domain.DefaultSetup, tr.Setup)
}

func TestCreateTrimsSymbolAndNotes(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	in.Symbol = "  XAUUSD  "
	in.Notes = "  ghi chú  "

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, "XAUUSD", tr.Symbol)
	require.Equal(t, "ghi chú", tr.Notes)
}

// entered_at lưu UTC. Gửi lên giờ Việt Nam thì phải quy đổi, không phải cắt
// bỏ offset — cắt bỏ sẽ làm lệnh lệch 7 tiếng và rơi sai ngày.
func TestCreateConvertsEnteredAtToUTC(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	vn, err := time.Parse(time.RFC3339, "2026-06-10T06:00:00+07:00")
	require.NoError(t, err)
	in.EnteredAt = vn

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, time.UTC, tr.EnteredAt.Location(),
		"phải trả về ở múi giờ UTC, không giữ nguyên offset người gửi")
	require.Equal(t, "2026-06-09T23:00:00Z", tr.EnteredAt.Format(time.RFC3339))
}

// Không chặn lệnh ở tương lai: người dùng có thể ghi trước một lệnh đang mở.
func TestCreateAcceptsFutureEnteredAt(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	in.EnteredAt = time.Now().UTC().Add(48 * time.Hour)

	_, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
}

func TestCreateKeepsEmptyMoneyFields(t *testing.T) {
	svc, acc := tradeFixture(t)

	tr, err := svc.Create(context.Background(), acc, validInput())

	require.NoError(t, err)
	require.Nil(t, tr.Entry, "chưa nhập giá vào là NULL, không phải 0")
	require.Nil(t, tr.Exit)
	require.Nil(t, tr.Volume)
	require.Nil(t, tr.ProfitTheory)
	require.True(t, tr.Fee.IsZero(), "fee vắng mặt thì bằng 0")
}

func label[T any](v T) service.Tristate[T]   { return service.Tristate[T]{Set: true, Value: &v} }
func clearField[T any]() service.Tristate[T] { return service.Tristate[T]{Set: true} }

func TestUpdateOnlyChangesSentFields(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{Notes: label("đã xem lại")}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, "đã xem lại", got.Notes)
	require.Equal(t, "XAUUSD", got.Symbol, "trường không gửi phải giữ nguyên")
	require.True(t, got.Profit.Equal(decimal.RequireFromString("100")))
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
func TestUpdateDistinguishesAbsentFromNull(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	in := validInput()
	lt := decimal.RequireFromString("120")
	in.ProfitTheory = &lt
	tr, err := svc.Create(ctx, acc, in)
	require.NoError(t, err)
	require.NotNil(t, tr.ProfitTheory)

	// Không gửi profit_theory → giữ nguyên.
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{Notes: label("x")}))
	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.NotNil(t, got.ProfitTheory, "không gửi thì phải giữ nguyên")

	// Gửi null tường minh → xoá về NULL.
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		ProfitTheory: clearField[decimal.Decimal](),
	}))
	got, err = svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Nil(t, got.ProfitTheory, "gửi null tường minh thì phải xoá giá trị")
}

func TestUpdateResetsClearedMoneyField(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		Entry: label(decimal.RequireFromString("2350.5")),
	}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.NotNil(t, got.Entry)
	require.True(t, got.Entry.Equal(decimal.RequireFromString("2350.5")))
}

func TestUpdateDoesNotChangeSTT(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-08", "AAA", "10")
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)
	require.Equal(t, 2, tr.STT)

	fresh, err := time.Parse(time.RFC3339, "2020-01-01T00:00:00Z")
	require.NoError(t, err)
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{EnteredAt: label(fresh)}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, 2, got.STT, "sửa entered_at KHÔNG đổi stt (spec mẹ §5.5)")
}

func TestUpdateRejectsUnknownEnumValue(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	err = svc.Update(ctx, tr.ID, service.TradePatch{Direction: label("Sideways")})

	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestUpdateWithNothingSentIsNoError(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{}))
}

func TestUpdateMissingTradeIs404(t *testing.T) {
	svc, _ := tradeFixture(t)

	err := svc.Update(context.Background(), 999999, service.TradePatch{Notes: label("x")})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// twoChars dựng hai user, mỗi người một account, dùng chung một TradeService.
func twoChars(t *testing.T) (*service.TradeService, domain.Account, int64, int64) {
	t.Helper()
	users := newMemUserStore()
	ctx := context.Background()
	a, err := users.Create(ctx, "a@example.com", "hash")
	require.NoError(t, err)
	b, err := users.Create(ctx, "b@example.com", "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(newMemAccountStore())
	accA, err := accountSvc.Create(ctx, a.ID, service.AccountCreate{
		Code: "A1", Name: "", Currency: "USD", Timezone: "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	svc := service.NewTradeService(newMemTradeStore(), newMemCashFlowStore(), accountSvc)
	return svc, accA, a.ID, b.ID
}

func TestForUserReturnsBothTradeAndAccount(t *testing.T) {
	svc, acc, userA, _ := twoChars(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	got, gotAcc, err := svc.ForUser(ctx, userA, tr.ID)

	require.NoError(t, err)
	require.Equal(t, tr.ID, got.ID)
	require.Equal(t, acc.ID, gotAcc.ID)
	require.Equal(t, "Asia/Ho_Chi_Minh", gotAcc.Timezone,
		"handler cần account để Enrich, nên ForUser phải trả luôn")
}

// Lệnh của người khác trả 403 chứ không phải 404 — bám đúng tiền lệ
// AccountService.ForUser và spec mẹ §7.2.
func TestForUserAnotherUsersTradeIs403(t *testing.T) {
	svc, acc, _, userB := twoChars(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	_, _, err = svc.ForUser(ctx, userB, tr.ID)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
}

func TestForUserMissingTradeIs404(t *testing.T) {
	svc, _, userA, _ := twoChars(t)

	_, _, err := svc.ForUser(context.Background(), userA, 999999)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// Lệnh trong thùng rác vẫn phải qua được ForUser, nếu không thì không ai
// khôi phục được gì.
func TestForUserStillLoadsDeletedTrade(t *testing.T) {
	svc, acc, userA, _ := twoChars(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, tr.ID))

	got, _, err := svc.ForUser(ctx, userA, tr.ID)

	require.NoError(t, err)
	require.Equal(t, tr.ID, got.ID)
}

func TestTrashOnlyContainsDeletedTrades(t *testing.T) {
	svc, acc, _, _ := twoChars(t)
	ctx := context.Background()
	keep, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)
	in := validInput()
	in.Symbol = "BODI"
	drop, err := svc.Create(ctx, acc, in)
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, drop.ID))

	junk, err := svc.Trash(ctx, acc.ID)

	require.NoError(t, err)
	require.NotNil(t, junk, "phải là [] chứ không phải null")
	require.Len(t, junk, 1)
	require.Equal(t, drop.ID, junk[0].ID)
	require.NotEqual(t, keep.ID, junk[0].ID)
}

func TestTrashEmptyReturnsEmptyArray(t *testing.T) {
	svc, acc, _, _ := twoChars(t)

	junk, err := svc.Trash(context.Background(), acc.ID)

	require.NoError(t, err)
	require.NotNil(t, junk)
	require.Empty(t, junk)
}

// Khôi phục đưa lệnh trở lại GIỮA dãy stt, nên lũy kế của mọi lệnh sau nó
// đều đổi. Đó là hành vi đúng — số nhảy không phải lỗi.
func TestRestorePutsTradeBackAndChangesCumulative(t *testing.T) {
	svc, acc, _, _ := twoChars(t)
	ctx := context.Background()
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-06-09", "BBB", "50")
	addTrade(t, svc, acc, "2026-06-10", "CCC", "25")

	before, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	middle := before.AllForTest()[1].Trade.ID

	require.NoError(t, svc.Delete(ctx, middle))
	afterDelete, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, afterDelete.AllForTest(), 2)
	require.True(t, afterDelete.AllForTest()[1].CumByTrade.Equal(decimal.RequireFromString("125")))

	require.NoError(t, svc.Restore(ctx, middle))

	afterRestore, err := svc.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, afterRestore.AllForTest(), 3)
	require.Equal(t, []int{1, 2, 3}, []int{
		afterRestore.AllForTest()[0].Trade.STT,
		afterRestore.AllForTest()[1].Trade.STT,
		afterRestore.AllForTest()[2].Trade.STT,
	}, "lệnh khôi phục về đúng chỗ cũ trong dãy, không phải về cuối")
	require.True(t, afterRestore.AllForTest()[2].CumByTrade.Equal(decimal.RequireFromString("175")),
		"lũy kế của lệnh cuối quay lại giá trị ban đầu, nhận %s", afterRestore.AllForTest()[2].CumByTrade)
}

func TestRestoreNonDeletedTradeIs404(t *testing.T) {
	svc, acc, _, _ := twoChars(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	err = svc.Restore(ctx, tr.ID)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

func TestDeleteTwiceSecondIs404(t *testing.T) {
	svc, acc, _, _ := twoChars(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, tr.ID))

	e := apperr.As(svc.Delete(ctx, tr.ID))
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// TestStatsCurrentBalanceUnchangedByFilter là regression test cho bug §10.1:
// Stats từng truyền res.Filtered làm cả hai tập, nên lọc theo khoảng ngày làm
// số dư tài khoản tụt xuống. Cùng một account, lọc và không lọc → số dư PHẢI
// bằng nhau, còn net_profit thì PHẢI khác.
//
// Hai assert đi cùng nhau mới đủ nghĩa: chỉ assert số dư thì một bản cài đặt
// bỏ luôn bộ lọc vẫn pass.
func TestStatsCurrentBalanceUnchangedByFilter(t *testing.T) {
	svc, acc := tradeFixture(t)
	addTrade(t, svc, acc, "2026-06-08", "AAA", "100")
	addTrade(t, svc, acc, "2026-07-08", "BBB", "250")

	noFilter, err := svc.Stats(context.Background(), acc, service.Filter{})
	require.NoError(t, err)

	withFilter, err := svc.Stats(context.Background(), acc, service.Filter{
		From: "2026-06-01", To: "2026-06-30",
	})
	require.NoError(t, err)

	require.True(t, withFilter.CurrentBalance.Equal(noFilter.CurrentBalance),
		"số dư không chịu bộ lọc: không lọc %s, có lọc %s",
		noFilter.CurrentBalance, withFilter.CurrentBalance)
	require.True(t, withFilter.CurrentBalance.Equal(decimal.RequireFromString("10350")),
		"10000 vốn + 350 lãi TOÀN BỘ, nhận %s", withFilter.CurrentBalance)
	require.True(t, withFilter.NetProfit.Equal(decimal.RequireFromString("100")),
		"net_profit PHẢI đổi theo bộ lọc, chỉ còn lệnh tháng 6, nhận %s", withFilter.NetProfit)
}

// TestCreateAcceptsAllFiveScoringColumns ghim rằng đường TẠO LỆNH thật sự chấp
// nhận từng giá trị enum hợp lệ.
//
// Thiếu test này là một lỗ thật, đã lộ ra khi falsify Task 3: bỏ một giá trị
// khỏi domain.EntryQualities thì importer và httpapi đỏ, còn service vẫn
// xanh — vì inputHopLe() để trống cả năm cột chấm điểm, nên không test nào
// của service từng gửi lên một chuỗi enum thật.
func TestCreateAcceptsAllFiveScoringColumns(t *testing.T) {
	svc, acc := tradeFixture(t)
	in := validInput()
	in.Timeframe = "H4"
	in.EntryQuality = domain.EntryPlanned
	in.InTradeQuality = domain.InTradeFollowed
	in.ExitQuality = domain.ExitHitTP
	in.Psychology = domain.PsychNoError

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, "H4", tr.Timeframe)
	require.Equal(t, domain.EntryPlanned, tr.EntryQuality)
	require.Equal(t, domain.InTradeFollowed, tr.InTradeQuality)
	require.Equal(t, domain.ExitHitTP, tr.ExitQuality)
	require.Equal(t, domain.PsychNoError, tr.Psychology)
}

// TestUpdateAcceptsAllFiveScoringColumns: cùng lý do, cho đường SỬA LỆNH.
func TestUpdateAcceptsAllFiveScoringColumns(t *testing.T) {
	svc, acc := tradeFixture(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, validInput())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		Timeframe:      label("H4"),
		EntryQuality:   label(domain.EntryPlanned),
		InTradeQuality: label(domain.InTradeFollowed),
		ExitQuality:    label(domain.ExitHitTP),
		Psychology:     label(domain.PsychNoError),
	}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, domain.EntryPlanned, got.EntryQuality)
	require.Equal(t, domain.PsychNoError, got.Psychology)
}
