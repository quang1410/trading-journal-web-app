package repository_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// taoAccount tạo một user và một account mới, trả account id. Mỗi test cần
// account riêng vì stt là duy nhất TRONG account.
//
// Dùng SQL thô thay vì gọi UserRepo/AccountRepo: test của TradeRepo không nên
// đỏ theo lỗi của repo khác.
func taoAccount(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var userID int64
	require.NoError(t, db.Raw(
		`INSERT INTO users (email, password_hash) VALUES (?, 'x') RETURNING id`,
		fmt.Sprintf("u%d@example.com", time.Now().UnixNano()),
	).Scan(&userID).Error)

	var accID int64
	require.NoError(t, db.Raw(
		`INSERT INTO accounts (user_id, code, name, initial_balance, risk_per_trade, currency, timezone)
		 VALUES (?, ?, '', 10000, 0.01, 'USD', 'Asia/Ho_Chi_Minh') RETURNING id`,
		userID, fmt.Sprintf("ACC%d", time.Now().UnixNano()),
	).Scan(&accID).Error)
	return accID
}

func lenhMau(accountID int64, symbol string) domain.Trade {
	return domain.Trade{
		AccountID: accountID,
		EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
		Symbol:    symbol,
		Direction: domain.DirectionLong,
		Profit:    decimal.NewFromInt(100),
		Fee:       decimal.NewFromInt(2),
		Setup:     domain.DefaultSetup,
	}
}

func TestTradeCreateCapSTTTangDan(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	a, err := repo.Create(ctx, lenhMau(acc, "XAUUSD"))
	require.NoError(t, err)
	b, err := repo.Create(ctx, lenhMau(acc, "EURUSD"))
	require.NoError(t, err)

	require.Equal(t, 1, a.STT)
	require.Equal(t, 2, b.STT)
	require.NotZero(t, a.ID)
}

// stt do backend cấp. Giá trị frontend nhét vào struct phải bị ghi đè, nếu
// không thì client tự chọn được thứ tự lũy kế của chính mình.
func TestTradeCreateGhiDeSTTDoNguoiGoiDat(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)

	tr := lenhMau(acc, "XAUUSD")
	tr.STT = 999
	got, err := repo.Create(context.Background(), tr)

	require.NoError(t, err)
	require.Equal(t, 1, got.STT)
}

func TestTradeSTTDemRiengTheoAccount(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc1 := taoAccount(t, db)
	acc2 := taoAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, lenhMau(acc1, "A"))
	require.NoError(t, err)
	b, err := repo.Create(ctx, lenhMau(acc2, "B"))
	require.NoError(t, err)

	require.Equal(t, 1, b.STT, "account thứ hai phải bắt đầu lại từ 1")
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Không có khoá hàng account, hai transaction đọc cùng một max(stt) rồi cùng
// ghi stt đó. Một bên ăn lỗi UNIQUE — hoặc tệ hơn, ở mức cô lập khác, cả hai
// cùng qua và dãy stt có bản sao, làm lũy kế nhân đôi một lệnh mà không báo gì.
func TestTradeCreateSongSongKhongTrungSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)

	const n = 12
	var wg sync.WaitGroup
	loi := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, loi[i] = repo.Create(context.Background(), lenhMau(acc, "X"))
		}(i)
	}
	wg.Wait()
	for i, err := range loi {
		require.NoError(t, err, "goroutine %d", i)
	}

	rows, err := repo.ListByAccount(context.Background(), acc)
	require.NoError(t, err)
	require.Len(t, rows, n)

	thay := map[int]bool{}
	for _, r := range rows {
		require.False(t, thay[r.STT], "stt %d xuất hiện hai lần", r.STT)
		thay[r.STT] = true
	}
	for i := 1; i <= n; i++ {
		require.True(t, thay[i], "dãy stt hổng ở %d", i)
	}
}

func TestTradeListByAccountSapTheoSTTTangDan(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	for _, s := range []string{"A", "B", "C"} {
		_, err := repo.Create(ctx, lenhMau(acc, s))
		require.NoError(t, err)
	}

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, []int{1, 2, 3}, []int{rows[0].STT, rows[1].STT, rows[2].STT})
	require.Equal(t, "A", rows[0].Symbol)
}

func TestTradeListByAccountKhongLanSangAccountKhac(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc1 := taoAccount(t, db)
	acc2 := taoAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, lenhMau(acc1, "CUA_TOI"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, lenhMau(acc2, "CUA_NGUOI_KHAC"))
	require.NoError(t, err)

	rows, err := repo.ListByAccount(ctx, acc1)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "CUA_TOI", rows[0].Symbol)
}

func TestTradeByIDKhongCoThiErrNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)

	_, err := repo.ByID(context.Background(), 999999)
	require.ErrorIs(t, err, repository.ErrNotFound)
}

func TestTradeByIDGiuNguyenTruongNullable(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)

	created, err := repo.Create(context.Background(), lenhMau(acc, "XAUUSD"))
	require.NoError(t, err)

	got, err := repo.ByID(context.Background(), created.ID)
	require.NoError(t, err)
	require.Nil(t, got.Entry, "chưa nhập giá vào thì phải là NULL, không phải 0")
	require.Nil(t, got.Exit)
	require.Nil(t, got.Volume)
	require.Nil(t, got.ProfitTheory)
	require.True(t, got.Profit.Equal(decimal.NewFromInt(100)))
}
