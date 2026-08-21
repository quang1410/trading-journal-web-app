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

// Xoá phải là xoá MỀM. Hàng vẫn nằm trong bảng, chỉ đánh dấu deleted_at —
// xoá cứng làm đứt dãy stt và sai đường equity (CLAUDE.md quy tắc 6).
func TestTradeSoftDeleteGiuNguyenHangTrongBang(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "XAUUSD"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))

	var dem int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM trades WHERE id = ?`, tr.ID).Scan(&dem).Error)
	require.EqualValues(t, 1, dem, "hàng phải còn nguyên trong bảng")

	var daXoa *time.Time
	require.NoError(t, db.Raw(`SELECT deleted_at FROM trades WHERE id = ?`, tr.ID).Scan(&daXoa).Error)
	require.NotNil(t, daXoa, "deleted_at phải được đặt")

	// Vẫn nạp được qua ByID — Restore cần điều đó.
	_, err = repo.ByID(ctx, tr.ID)
	require.NoError(t, err)
}

func TestTradeDaXoaKhongVaoDanhSachChinh(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	a, err := repo.Create(ctx, lenhMau(acc, "A"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, lenhMau(acc, "B"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, a.ID))

	con, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, con, 1)
	require.Equal(t, "B", con[0].Symbol)

	rac, err := repo.ListDeletedByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rac, 1)
	require.Equal(t, "A", rac[0].Symbol)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Nếu max(stt) chỉ đếm lệnh chưa xoá thì: tạo (stt=1) → xoá → tạo lại cũng
// được cấp stt=1 → khôi phục lệnh cũ đụng UNIQUE (account_id, stt). Người
// dùng mất khả năng khôi phục, và nguyên nhân nằm cách đó ba thao tác.
func TestTradeKhoiPhucSauKhiDaTaoLenhMoiKhongDungUNIQUE(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	cu, err := repo.Create(ctx, lenhMau(acc, "CU"))
	require.NoError(t, err)
	require.Equal(t, 1, cu.STT)

	require.NoError(t, repo.SoftDelete(ctx, cu.ID))

	moi, err := repo.Create(ctx, lenhMau(acc, "MOI"))
	require.NoError(t, err)
	require.Equal(t, 2, moi.STT, "stt phải tiếp tục từ lệnh đã xoá, không tái sử dụng")

	require.NoError(t, repo.Restore(ctx, cu.ID))

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, []int{1, 2}, []int{rows[0].STT, rows[1].STT})
}

func TestTradeRestoreXoaDauDeletedAt(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "X"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))
	require.NoError(t, repo.Restore(ctx, tr.ID))

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	rac, err := repo.ListDeletedByAccount(ctx, acc)
	require.NoError(t, err)
	require.Empty(t, rac)
}

func TestTradeSoftDeleteHaiLanLanSauLaNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "X"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))

	// Lệnh đã ở thùng rác: xoá tiếp không đổi gì, và phải nói rõ là không
	// đổi gì thay vì im lặng báo thành công.
	require.ErrorIs(t, repo.SoftDelete(ctx, tr.ID), repository.ErrNotFound)
}

func TestTradeRestoreLenhChuaXoaLaNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "X"))
	require.NoError(t, err)

	require.ErrorIs(t, repo.Restore(ctx, tr.ID), repository.ErrNotFound)
}

func TestTradeUpdateFieldsChiDoiTruongDuocGui(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "XAUUSD"))
	require.NoError(t, err)

	require.NoError(t, repo.UpdateFields(ctx, tr.ID, map[string]any{"notes": "đã xem lại"}))

	got, err := repo.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, "đã xem lại", got.Notes)
	require.Equal(t, "XAUUSD", got.Symbol, "trường không gửi phải giữ nguyên")
	require.Equal(t, 1, got.STT, "sửa lệnh KHÔNG đổi stt")
}

// updated_at có DEFAULT now() nhưng không có trigger, và domain.Trade không
// mang trường đó nên GORM cũng không tự bump. Không đặt tay thì cột này nói
// dối: nó mãi là thời điểm tạo.
func TestTradeUpdateFieldsBumpUpdatedAt(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := taoAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, lenhMau(acc, "X"))
	require.NoError(t, err)

	var truoc time.Time
	require.NoError(t, db.Raw(`SELECT updated_at FROM trades WHERE id = ?`, tr.ID).Scan(&truoc).Error)

	require.NoError(t, repo.UpdateFields(ctx, tr.ID, map[string]any{"notes": "x"}))

	var sau time.Time
	require.NoError(t, db.Raw(`SELECT updated_at FROM trades WHERE id = ?`, tr.ID).Scan(&sau).Error)
	require.True(t, sau.After(truoc), "updated_at phải mới hơn: trước=%v sau=%v", truoc, sau)
}

func TestTradeUpdateFieldsIDKhongCoLaNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)

	err := repo.UpdateFields(context.Background(), 999999, map[string]any{"notes": "x"})
	require.ErrorIs(t, err, repository.ErrNotFound)
}
