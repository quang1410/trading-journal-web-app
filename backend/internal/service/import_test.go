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
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// nextID cấp một số duy nhất cho email/code của mỗi test, vì testdb dùng
// chung một container cho cả package.
var demID atomic.Int64

func nextID() int64 { return demID.Add(1) }

// boDoImport dựng ImportService cùng TradeService dùng chung một DB, để test
// import xong đọc lại bằng đường đọc thật.
func boDoImport(t *testing.T, tz string) (*service.ImportService, *service.TradeService, domain.Account) {
	t.Helper()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	u, err := users.Create(context.Background(), fmt.Sprintf("imp%d@example.com", nextID()), "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	acc, err := accountSvc.Create(context.Background(), u.ID, service.AccountCreate{
		Code:           fmt.Sprintf("ACC%d", nextID()),
		Name:           "Chính",
		Currency:       "USD",
		Timezone:       tz,
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	trades := repository.NewTradeRepo(db)
	tradeSvc := service.NewTradeService(trades, repository.NewCashFlowRepo(db), accountSvc)
	return service.NewImportService(trades), tradeSvc, acc
}

const csvSach = `Day,Symbol,Long/ Short,Profit,Phí,Setup,Timeframe,Notes
2026-06-09,XAUUSD,BUY,500,10,BOS,H4,lệnh một
2026-06-10,EURUSD,SELL,-200,5,BOS,H1,lệnh hai
2026-06-11,BTCUSD,BUY,300,8,BOS,D1,lệnh ba
`

// Dòng 3 có direction rác.
const csvCoLoi = `Day,Symbol,Long/ Short,Profit,Phí
2026-06-09,XAUUSD,BUY,500,10
2026-06-10,EURUSD,RAC,-200,5
2026-06-11,BTCUSD,BUY,300,8
`

// Bất biến quan trọng nhất của task: dry-run KHÔNG ghi gì.
func TestImportDryRunKhongGhiGiVaoDB(t *testing.T) {
	imp, trades, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvSach), true)
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Equal(t, 3, rep.Valid, "báo cáo phải đếm đủ 3 dòng đọc được")
	require.False(t, rep.Committed, "dry-run không được báo là đã ghi")

	res, err := trades.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.All, "dry-run mà DB có dữ liệu là hỏng nghiêm trọng")
}

func TestImportGhiThatThiLenhVaoDBVaSTTLienTiep(t *testing.T) {
	imp, trades, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvSach), false)
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Equal(t, 3, rep.Valid)
	require.True(t, rep.Committed)

	res, err := trades.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, res.All, 3)
	require.Equal(t, 1, res.All[0].Trade.STT)
	require.Equal(t, 2, res.All[1].Trade.STT)
	require.Equal(t, 3, res.All[2].Trade.STT)
	// Thứ tự file phải là thứ tự stt: lũy kế phụ thuộc nó.
	require.Equal(t, "XAUUSD", res.All[0].Trade.Symbol)
	require.Equal(t, "BTCUSD", res.All[2].Trade.Symbol)
	// net dòng 1 = 500 − 10
	require.Equal(t, "490", res.All[0].Net.String())
}

// All-or-nothing: file còn một dòng hỏng thì KHÔNG ghi gì cả. Nhập được một
// nửa là trạng thái người dùng không có cách nào dọn.
func TestImportCoDongLoiThiKhongGhiGiCa(t *testing.T) {
	imp, trades, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader(csvCoLoi), false)
	require.NoError(t, err, "dòng hỏng là kết quả báo cáo, không phải lỗi hệ thống")
	require.Len(t, rep.Errors, 1)
	require.Equal(t, 3, rep.Errors[0].Line)
	require.False(t, rep.Committed, "có lỗi thì không được ghi")

	res, err := trades.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.All, "hai dòng tốt cũng không được lọt vào")
}

func TestImportNoiTiepSTTCuaLenhDaCo(t *testing.T) {
	imp, trades, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	themLenh(t, trades, acc, "2026-06-01", "CUCU", "100")

	_, err := imp.Import(ctx, acc, strings.NewReader(csvSach), false)
	require.NoError(t, err)

	res, err := trades.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, res.All, 4)
	require.Equal(t, 1, res.All[0].Trade.STT)
	require.Equal(t, 4, res.All[3].Trade.STT)
}

// Timezone của ACCOUNT quyết định entered_at, không phải timezone máy chủ.
func TestImportTimezoneAccountQuyetDinhEnteredAt(t *testing.T) {
	ctx := context.Background()

	impVN, tradesVN, accVN := boDoImport(t, "Asia/Ho_Chi_Minh")
	_, err := impVN.Import(ctx, accVN, strings.NewReader(csvSach), false)
	require.NoError(t, err)
	resVN, err := tradesVN.Read(ctx, accVN, service.Filter{})
	require.NoError(t, err)

	impUTC, tradesUTC, accUTC := boDoImport(t, "UTC")
	_, err = impUTC.Import(ctx, accUTC, strings.NewReader(csvSach), false)
	require.NoError(t, err)
	resUTC, err := tradesUTC.Read(ctx, accUTC, service.Filter{})
	require.NoError(t, err)

	// Cùng một file, hai account khác timezone: instant KHÁC nhau...
	require.False(t,
		resVN.All[0].Trade.EnteredAt.Equal(resUTC.All[0].Trade.EnteredAt),
		"hai timezone phải cho hai instant khác nhau")
	// ...nhưng day thì GIỐNG, vì mỗi bên quy về timezone của chính nó.
	require.Equal(t, "2026-06-09", resVN.All[0].Day)
	require.Equal(t, "2026-06-09", resUTC.All[0].Day)
}

func TestImportTimezoneAccountHongThiLoiValidateChuKhongPanic(t *testing.T) {
	imp, _, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	acc.Timezone = "Khong/Ton_Tai"

	_, err := imp.Import(context.Background(), acc, strings.NewReader(csvSach), true)
	require.Error(t, err)
	require.NotNil(t, apperr.As(err), "phải là lỗi nghiệp vụ hiển thị được")
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestImportFileThieuCotBatBuocLaLoiValidate(t *testing.T) {
	imp, _, acc := boDoImport(t, "Asia/Ho_Chi_Minh")

	_, err := imp.Import(context.Background(), acc,
		strings.NewReader("Symbol,Profit\nXAUUSD,100\n"), true)
	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
	require.Contains(t, e.Msg, "cột")
}

func TestImportFileRongLaLoiValidate(t *testing.T) {
	imp, _, acc := boDoImport(t, "Asia/Ho_Chi_Minh")

	_, err := imp.Import(context.Background(), acc, strings.NewReader(""), true)
	require.Error(t, err)
	require.NotNil(t, apperr.As(err))
}

// Trần kích thước: file khổng lồ không được kéo cả API xuống.
func TestImportFileQuaLonBiTuChoi(t *testing.T) {
	imp, _, acc := boDoImport(t, "Asia/Ho_Chi_Minh")

	var b strings.Builder
	b.WriteString("Day,Symbol,Long/ Short,Profit\n")
	dong := "2026-06-09,XAUUSD,BUY,100\n"
	for b.Len() <= service.MaxImportBytes {
		b.WriteString(dong)
	}

	_, err := imp.Import(context.Background(), acc, strings.NewReader(b.String()), true)
	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

// File chỉ có header: không lỗi, nhưng cũng không ghi gì.
func TestImportFileChiCoHeaderThiKhongGhi(t *testing.T) {
	imp, trades, acc := boDoImport(t, "Asia/Ho_Chi_Minh")
	ctx := context.Background()

	rep, err := imp.Import(ctx, acc, strings.NewReader("Day,Symbol,Long/ Short,Profit\n"), false)
	require.NoError(t, err)
	require.Zero(t, rep.Valid)
	require.False(t, rep.Committed, "không có dòng nào thì không có gì để ghi")

	res, err := trades.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Empty(t, res.All)
}
