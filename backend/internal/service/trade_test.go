package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

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
