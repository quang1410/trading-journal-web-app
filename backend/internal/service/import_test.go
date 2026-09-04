package service_test

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

// nextID cấp một số duy nhất cho email/code của mỗi test, vì testdb dùng
// chung một container cho cả package.
var countID atomic.Int64

func nextID() int64 { return countID.Add(1) }

// importFixture dựng ImportService cùng TradeService dùng chung một DB, để test
// import xong đọc lại bằng đường đọc thật.
func importFixture(t *testing.T, tz string) (*service.ImportService, *service.TradeService, domain.Account) {
	t.Helper()
	users := newMemUserStore()
	u, err := users.Create(context.Background(), fmt.Sprintf("imp%d@example.com", nextID()), "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(newMemAccountStore())
	acc, err := accountSvc.Create(context.Background(), u.ID, service.AccountCreate{
		Code:           fmt.Sprintf("ACC%d", nextID()),
		Name:           "Chính",
		Currency:       "USD",
		Timezone:       tz,
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	trades := newMemTradeStore()
	tradeSvc := service.NewTradeService(trades, newMemCashFlowStore(), accountSvc)
	return service.NewImportService(trades), tradeSvc, acc
}

const csvClean = `Day,Symbol,Long/ Short,Profit,Phí,Setup,Timeframe,Notes
2026-06-09,XAUUSD,BUY,500,10,BOS,H4,lệnh một
2026-06-10,EURUSD,SELL,-200,5,BOS,H1,lệnh hai
2026-06-11,BTCUSD,BUY,300,8,BOS,D1,lệnh ba
`

// Dòng 3 có direction rác.
const csvWithError = `Day,Symbol,Long/ Short,Profit,Phí
2026-06-09,XAUUSD,BUY,500,10
2026-06-10,EURUSD,RAC,-200,5
2026-06-11,BTCUSD,BUY,300,8
`

// Bất biến quan trọng nhất của task: dry-run KHÔNG ghi gì.
func TestImportDryRunWritesNothingToDB(t *testing.T) {
	imp, trades, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvClean), true)
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Equal(t, 3, rep.Valid, "báo cáo phải đếm đủ 3 dòng đọc được")
	require.False(t, rep.Committed, "dry-run không được báo là đã ghi")

	res, err := trades.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.AllForTest(), "dry-run mà DB có dữ liệu là hỏng nghiêm trọng")
}

func TestImportRealWriteStoresTradesWithSequentialSTT(t *testing.T) {
	imp, trades, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvClean), false)
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Equal(t, 3, rep.Valid)
	require.True(t, rep.Committed)

	res, err := trades.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, res.AllForTest(), 3)
	require.Equal(t, 1, res.AllForTest()[0].Trade.STT)
	require.Equal(t, 2, res.AllForTest()[1].Trade.STT)
	require.Equal(t, 3, res.AllForTest()[2].Trade.STT)
	// Thứ tự file phải là thứ tự stt: lũy kế phụ thuộc nó.
	require.Equal(t, "XAUUSD", res.AllForTest()[0].Trade.Symbol)
	require.Equal(t, "BTCUSD", res.AllForTest()[2].Trade.Symbol)
	// net dòng 1 = 500 − 10
	require.Equal(t, "490", res.AllForTest()[0].Net.String())
}

// All-or-nothing: file còn một dòng hỏng thì KHÔNG ghi gì cả. Nhập được một
// nửa là trạng thái người dùng không có cách nào dọn.
func TestImportWithBadRowWritesNothing(t *testing.T) {
	imp, trades, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvWithError), false)
	require.NoError(t, err, "dòng hỏng là kết quả báo cáo, không phải lỗi hệ thống")
	require.Len(t, rep.Errors, 1)
	require.Equal(t, 3, rep.Errors[0].Line)
	require.False(t, rep.Committed, "có lỗi thì không được ghi")

	res, err := trades.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.AllForTest(), "hai dòng tốt cũng không được lọt vào")
}

func TestImportContinuesSTTFromExistingTrades(t *testing.T) {
	imp, trades, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	addTrade(t, trades, acc, "2026-06-01", "CUCU", "100")

	_, err := imp.Import(ctx, acc, strings.NewReader(csvClean), false)
	require.NoError(t, err)

	res, err := trades.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, res.AllForTest(), 4)
	require.Equal(t, 1, res.AllForTest()[0].Trade.STT)
	require.Equal(t, 4, res.AllForTest()[3].Trade.STT)
}

// Timezone của ACCOUNT quyết định entered_at, không phải timezone máy chủ.
func TestImportAccountTimezoneDeterminesEnteredAt(t *testing.T) {
	ctx := context.Background()

	impVN, tradesVN, accVN := importFixture(t, "Asia/Ho_Chi_Minh")
	_, err := impVN.Import(ctx, accVN, strings.NewReader(csvClean), false)
	require.NoError(t, err)
	resVN, err := tradesVN.Load(ctx, accVN, service.Filter{})
	require.NoError(t, err)

	impUTC, tradesUTC, accUTC := importFixture(t, "UTC")
	_, err = impUTC.Import(ctx, accUTC, strings.NewReader(csvClean), false)
	require.NoError(t, err)
	resUTC, err := tradesUTC.Load(ctx, accUTC, service.Filter{})
	require.NoError(t, err)

	// Cùng một file, hai account khác timezone: instant KHÁC nhau...
	require.False(t,
		resVN.AllForTest()[0].Trade.EnteredAt.Equal(resUTC.AllForTest()[0].Trade.EnteredAt),
		"hai timezone phải cho hai instant khác nhau")
	// ...nhưng day thì GIỐNG, vì mỗi bên quy về timezone của chính nó.
	require.Equal(t, "2026-06-09", resVN.AllForTest()[0].Day)
	require.Equal(t, "2026-06-09", resUTC.AllForTest()[0].Day)
}

func TestImportBadAccountTimezoneIsValidationErrorNotPanic(t *testing.T) {
	imp, _, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	acc.Timezone = "Khong/Ton_Tai"

	_, err := imp.Import(context.Background(), acc, strings.NewReader(csvClean), true)
	require.Error(t, err)
	require.NotNil(t, apperr.As(err), "phải là lỗi nghiệp vụ hiển thị được")
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestImportMissingRequiredColumnIsValidationError(t *testing.T) {
	imp, _, acc := importFixture(t, "Asia/Ho_Chi_Minh")

	_, err := imp.Import(context.Background(), acc,
		strings.NewReader("Symbol,Profit\nXAUUSD,100\n"), true)
	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
	require.Contains(t, e.Msg, "cột")
}

func TestImportEmptyFileIsValidationError(t *testing.T) {
	imp, _, acc := importFixture(t, "Asia/Ho_Chi_Minh")

	_, err := imp.Import(context.Background(), acc, strings.NewReader(""), true)
	require.Error(t, err)
	require.NotNil(t, apperr.As(err))
}

// Trần kích thước: file khổng lồ không được kéo cả API xuống.
func TestImportOversizeFileRejected(t *testing.T) {
	imp, _, acc := importFixture(t, "Asia/Ho_Chi_Minh")

	var b strings.Builder
	b.WriteString("Day,Symbol,Long/ Short,Profit\n")
	row := "2026-06-09,XAUUSD,BUY,100\n"
	for b.Len() <= service.MaxImportBytes {
		b.WriteString(row)
	}

	_, err := imp.Import(context.Background(), acc, strings.NewReader(b.String()), true)
	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

// File chỉ có header: không lỗi, nhưng cũng không ghi gì.
func TestImportHeaderOnlyFileWritesNothing(t *testing.T) {
	imp, trades, acc := importFixture(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader("Day,Symbol,Long/ Short,Profit\n"), false)
	require.NoError(t, err)
	require.Zero(t, rep.Valid)
	require.False(t, rep.Committed, "không có dòng nào thì không có gì để ghi")

	res, err := trades.Load(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.AllForTest())
}
