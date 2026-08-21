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

// boDoTrade dựng service thật trên Postgres thật, kèm một account có timezone
// giờ Việt Nam và vốn 10000, risk 1% (nên 1R = 100).
func boDoTrade(t *testing.T) (*service.TradeService, domain.Account) {
	t.Helper()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	u, err := users.Create(context.Background(), "chu@example.com", "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	acc, err := accountSvc.Create(context.Background(), u.ID, service.AccountCreate{
		Code:           "ACC1",
		Name:           "Chính",
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	svc := service.NewTradeService(
		repository.NewTradeRepo(db),
		repository.NewCashFlowRepo(db),
		accountSvc,
	)
	return svc, acc
}

// themLenh chèn một lệnh vào lúc 12:00 giờ VN — cách xa nửa đêm nên `day`
// không phụ thuộc mẹo múi giờ.
func themLenh(t *testing.T, svc *service.TradeService, acc domain.Account, ngayVN string, symbol string, profit string) {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, ngayVN+"T12:00:00+07:00")
	require.NoError(t, err)
	_, err = svc.Create(context.Background(), acc, service.TradeInput{
		EnteredAt: ts,
		Symbol:    symbol,
		Direction: domain.DirectionLong,
		Profit:    decimal.RequireFromString(profit),
	})
	require.NoError(t, err)
}

func TestReadDanhSachRongKhongLoi(t *testing.T) {
	svc, acc := boDoTrade(t)

	res, err := svc.Read(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.Empty(t, res.All)
	require.Empty(t, res.Filtered)
	require.NotNil(t, res.Filtered, "phải là [] chứ không phải null")
	require.Equal(t, acc.ID, res.Account.ID)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// §7.1: lũy kế tính trên TOÀN BỘ dãy, filter chỉ lọc phần hiển thị. Nếu ai
// đó lọc trước rồi mới Enrich, cum_by_trade của lệnh giữa dãy sẽ bằng chính
// net của nó — một đường equity dựng từ tập con, tức một đường không có thật.
func TestReadLuyKeTinhTrenToanBoDuDaLoc(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-06-10", "BBB", "50")
	themLenh(t, svc, acc, "2026-06-12", "CCC", "25")

	res, err := svc.Read(context.Background(), acc, service.Filter{Symbol: "BBB"})
	require.NoError(t, err)

	require.Len(t, res.All, 3, "All phải giữ nguyên cả ba")
	require.Len(t, res.Filtered, 1)
	require.Equal(t, "BBB", res.Filtered[0].Trade.Symbol)

	// Lệnh BBB đứng thứ hai: lũy kế của nó là 100 + 50 = 150, KHÔNG phải 50.
	require.True(t, res.Filtered[0].CumByTrade.Equal(decimal.RequireFromString("150")),
		"cum_by_trade phải là lũy kế từ đầu lịch sử, nhận được %s", res.Filtered[0].CumByTrade)
}

func TestReadLenhDaXoaKhongVaoAllVaKhongVaoLuyKe(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-06-10", "BBB", "50")
	themLenh(t, svc, acc, "2026-06-12", "CCC", "25")
	ctx := context.Background()

	truoc, err := svc.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.True(t, truoc.All[2].CumByTrade.Equal(decimal.RequireFromString("175")))

	require.NoError(t, svc.Delete(ctx, truoc.All[1].Trade.ID))

	sau, err := svc.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, sau.All, 2)
	require.True(t, sau.All[1].CumByTrade.Equal(decimal.RequireFromString("125")),
		"xoá lệnh giữa dãy phải làm lũy kế của lệnh sau nó giảm đi, nhận %s", sau.All[1].CumByTrade)
}

func TestReadTimezoneAccountHongThiBaoLoi(t *testing.T) {
	svc, acc := boDoTrade(t)
	acc.Timezone = "Sao/Hoa"

	_, err := svc.Read(context.Background(), acc, service.Filter{})

	require.Error(t, err)
}

func TestListPhanTrangMoiNhatTruoc(t *testing.T) {
	svc, acc := boDoTrade(t)
	for _, s := range []string{"A", "B", "C", "D", "E"} {
		themLenh(t, svc, acc, "2026-06-10", s, "10")
	}

	p, err := svc.List(context.Background(), acc, service.Filter{}, 1, 2)

	require.NoError(t, err)
	require.Equal(t, 5, p.Total)
	require.Len(t, p.Items, 2)
	require.Equal(t, "E", p.Items[0].Trade.Symbol, "trang đầu phải là lệnh mới nhất")
	require.Equal(t, "D", p.Items[1].Trade.Symbol)
}

func TestListTrangCuoiVaTrangVuotQua(t *testing.T) {
	svc, acc := boDoTrade(t)
	for _, s := range []string{"A", "B", "C"} {
		themLenh(t, svc, acc, "2026-06-10", s, "10")
	}
	ctx := context.Background()

	cuoi, err := svc.List(ctx, acc, service.Filter{}, 2, 2)
	require.NoError(t, err)
	require.Len(t, cuoi.Items, 1)
	require.Equal(t, "A", cuoi.Items[0].Trade.Symbol)

	// Trang vượt quá trả mảng rỗng kèm total đúng — không phải lỗi. Frontend
	// đang ở trang 9 rồi bấm lọc không nên thấy màn hình lỗi.
	xa, err := svc.List(ctx, acc, service.Filter{}, 99, 2)
	require.NoError(t, err)
	require.Empty(t, xa.Items)
	require.NotNil(t, xa.Items)
	require.Equal(t, 3, xa.Total)
}

func TestListKepThamSoPhanTrangSai(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-10", "A", "10")
	ctx := context.Background()

	cases := []struct {
		ten              string
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
		t.Run(c.ten, func(t *testing.T) {
			p, err := svc.List(ctx, acc, service.Filter{}, c.page, c.size)
			require.NoError(t, err)
			require.Equal(t, c.muonPage, p.Page)
			require.Equal(t, c.muonSz, p.Size)
		})
	}
}

func TestListTotalDemTapDaLocChuKhongPhaiToanBo(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "10")
	themLenh(t, svc, acc, "2026-06-10", "BBB", "10")
	themLenh(t, svc, acc, "2026-06-12", "BBB", "10")

	p, err := svc.List(context.Background(), acc, service.Filter{Symbol: "BBB"}, 1, 50)

	require.NoError(t, err)
	require.Equal(t, 2, p.Total, "total là số lệnh SAU khi lọc, để frontend đếm trang đúng")
}

// KPI tính trên tập ĐÃ LỌC — ngược với lũy kế. Hai luật trái chiều nhau
// trong cùng một request là lý do §7.1 được gọi là "chỗ dễ sai nhất".
func TestStatsTinhTrenTapDaLoc(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-06-10", "BBB", "50")
	themLenh(t, svc, acc, "2026-06-12", "CCC", "-30")

	k, err := svc.Stats(context.Background(), acc, service.Filter{Symbol: "BBB"})

	require.NoError(t, err)
	require.Equal(t, 1, k.TotalTrades, "chỉ đếm lệnh trong tập đã lọc")
	require.Equal(t, 1, k.WinCount)
	require.Equal(t, 0, k.LossCount)
	require.True(t, k.NetProfit.Equal(decimal.RequireFromString("50")),
		"net_profit của tập đã lọc, nhận %s", k.NetProfit)
}

func TestStatsKhongLocThiTinhTrenToanBo(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-06-10", "BBB", "50")

	k, err := svc.Stats(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.Equal(t, 2, k.TotalTrades)
	require.True(t, k.NetProfit.Equal(decimal.RequireFromString("150")))
}

// current_balance = vốn ban đầu + nạp − rút + lãi lỗ. Nếu Stats quên nạp
// cash flow thì con số này lặng lẽ thiếu phần nạp/rút, mà nó vẫn ra một số
// trông hợp lý nên không ai nghi ngờ.
func TestStatsCongCashFlowVaoCurrentBalance(t *testing.T) {
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
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")

	k, err := svc.Stats(context.Background(), acc, service.Filter{})

	require.NoError(t, err)
	require.True(t, k.CurrentBalance.Equal(decimal.RequireFromString("10600")),
		"10000 vốn + 500 nạp + 100 lãi = 10600, nhận %s", k.CurrentBalance)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// aggregate.All(all, filtered, acc) — hai tham số cùng kiểu, đảo chỗ vẫn
// biên dịch và vẫn ra số. Phase 1 đã ghim ngữ nghĩa bằng
// TestAllStreakTinhTrenAllPivotTinhTrenFiltered; test này ghim lại ở tầng
// service, nơi thực sự quyết định truyền gì vào.
func TestChartsStreakTrenToanBoPivotTrenTapDaLoc(t *testing.T) {
	svc, acc := boDoTrade(t)
	// Ba lệnh thắng liên tiếp, nhưng chỉ một trong số đó lọt bộ lọc.
	themLenh(t, svc, acc, "2026-06-08", "AAA", "10")
	themLenh(t, svc, acc, "2026-06-09", "BBB", "10")
	themLenh(t, svc, acc, "2026-06-10", "AAA", "10")

	c, err := svc.Charts(context.Background(), acc, service.Filter{Symbol: "BBB"})

	require.NoError(t, err)
	require.Equal(t, 3, c.LongestWinStreak,
		"streak tính trên TOÀN BỘ dãy nên vẫn là 3 dù bộ lọc chỉ giữ 1 lệnh")

	require.NotEmpty(t, c.BySymbol, "pivot rỗng thì khẳng định dưới đây xanh vô nghĩa")
	require.Len(t, c.BySymbol, 1, "pivot tính trên tập ĐÃ LỌC nên chỉ còn một symbol")
	require.Equal(t, "BBB", c.BySymbol[0].Key)
}

func TestChartsDanhSachRongTraDuMoiNhomKhongPanic(t *testing.T) {
	svc, acc := boDoTrade(t)

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
func TestChartsKhongBiAnhHuongBoiListGoiTruocDo(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "10")
	themLenh(t, svc, acc, "2026-06-09", "BBB", "20")
	themLenh(t, svc, acc, "2026-06-10", "CCC", "30")
	ctx := context.Background()

	moc, err := svc.Charts(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.NotEmpty(t, moc.ByDay)

	_, err = svc.List(ctx, acc, service.Filter{}, 1, 50)
	require.NoError(t, err)

	sau, err := svc.Charts(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Equal(t, moc.ByDay, sau.ByDay, "gọi List không được làm đổi kết quả Charts")
}

func inputHopLe() service.TradeInput {
	return service.TradeInput{
		EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.RequireFromString("100"),
	}
}

func TestCreateTuChoiInputHong(t *testing.T) {
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

	for ten, hong := range cases {
		t.Run(ten, func(t *testing.T) {
			svc, acc := boDoTrade(t)
			in := inputHopLe()
			hong(&in)

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
func TestCreateChapNhanBonTruongChamDiemDeTrong(t *testing.T) {
	svc, acc := boDoTrade(t)

	tr, err := svc.Create(context.Background(), acc, inputHopLe())

	require.NoError(t, err)
	require.Empty(t, tr.EntryQuality)
	require.Empty(t, tr.Psychology)
}

func TestCreateChapNhanTimeframeRong(t *testing.T) {
	svc, acc := boDoTrade(t)
	in := inputHopLe()
	in.Timeframe = ""

	_, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
}

// Lỗ là số âm và hoàn toàn hợp lệ. Đây là nhật ký, không phải bảng khoe lãi.
func TestCreateChapNhanProfitAmVaBangKhong(t *testing.T) {
	for _, p := range []string{"-250.75", "0"} {
		t.Run(p, func(t *testing.T) {
			svc, acc := boDoTrade(t)
			in := inputHopLe()
			in.Profit = decimal.RequireFromString(p)

			tr, err := svc.Create(context.Background(), acc, in)

			require.NoError(t, err)
			require.True(t, tr.Profit.Equal(decimal.RequireFromString(p)))
		})
	}
}

func TestCreateSetupRongThanhMacDinh(t *testing.T) {
	svc, acc := boDoTrade(t)
	in := inputHopLe()
	in.Setup = "   "

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, domain.DefaultSetup, tr.Setup)
}

func TestCreateCatKhoangTrangSymbolVaNotes(t *testing.T) {
	svc, acc := boDoTrade(t)
	in := inputHopLe()
	in.Symbol = "  XAUUSD  "
	in.Notes = "  ghi chú  "

	tr, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
	require.Equal(t, "XAUUSD", tr.Symbol)
	require.Equal(t, "ghi chú", tr.Notes)
}

// entered_at lưu UTC. Gửi lên giờ Việt Nam thì phải quy đổi, không phải cắt
// bỏ offset — cắt bỏ sẽ làm lệnh lệch 7 tiếng và rơi sai ngày.
func TestCreateQuyDoiEnteredAtVeUTC(t *testing.T) {
	svc, acc := boDoTrade(t)
	in := inputHopLe()
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
func TestCreateChapNhanEnteredAtTuongLai(t *testing.T) {
	svc, acc := boDoTrade(t)
	in := inputHopLe()
	in.EnteredAt = time.Now().UTC().Add(48 * time.Hour)

	_, err := svc.Create(context.Background(), acc, in)

	require.NoError(t, err)
}

func TestCreateGiuNguyenTruongTienDeTrong(t *testing.T) {
	svc, acc := boDoTrade(t)

	tr, err := svc.Create(context.Background(), acc, inputHopLe())

	require.NoError(t, err)
	require.Nil(t, tr.Entry, "chưa nhập giá vào là NULL, không phải 0")
	require.Nil(t, tr.Exit)
	require.Nil(t, tr.Volume)
	require.Nil(t, tr.ProfitTheory)
	require.True(t, tr.Fee.IsZero(), "fee vắng mặt thì bằng 0")
}
