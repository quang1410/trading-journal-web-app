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

// makeAccount tạo một user và một account mới, trả account id. Mỗi test cần
// account riêng vì stt là duy nhất TRONG account.
//
// Dùng SQL thô thay vì gọi UserRepo/AccountRepo: test của TradeRepo không nên
// đỏ theo lỗi của repo khác.
func makeAccount(t *testing.T, db *gorm.DB) int64 {
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

func sampleTrade(accountID int64, symbol string) domain.Trade {
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

func TestTradeCreateAssignsIncreasingSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	a, err := repo.Create(ctx, sampleTrade(acc, "XAUUSD"))
	require.NoError(t, err)
	b, err := repo.Create(ctx, sampleTrade(acc, "EURUSD"))
	require.NoError(t, err)

	require.Equal(t, 1, a.STT)
	require.Equal(t, 2, b.STT)
	require.NotZero(t, a.ID)
}

// stt do backend cấp. Giá trị frontend nhét vào struct phải bị ghi đè, nếu
// không thì client tự chọn được thứ tự lũy kế của chính mình.
func TestTradeCreateOverwritesCallerSuppliedSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	tr := sampleTrade(acc, "XAUUSD")
	tr.STT = 999
	got, err := repo.Create(context.Background(), tr)

	require.NoError(t, err)
	require.Equal(t, 1, got.STT)
}

func TestTradeSTTCountsPerAccount(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc1 := makeAccount(t, db)
	acc2 := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, sampleTrade(acc1, "A"))
	require.NoError(t, err)
	b, err := repo.Create(ctx, sampleTrade(acc2, "B"))
	require.NoError(t, err)

	require.Equal(t, 1, b.STT, "account thứ hai phải bắt đầu lại từ 1")
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Không có khoá hàng account, hai transaction đọc cùng một max(stt) rồi cùng
// ghi stt đó. Một bên ăn lỗi UNIQUE — hoặc tệ hơn, ở mức cô lập khác, cả hai
// cùng qua và dãy stt có bản sao, làm lũy kế nhân đôi một lệnh mà không báo gì.
func TestTradeCreateConcurrentNoDuplicateSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	const n = 12
	var wg sync.WaitGroup
	errRow := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errRow[i] = repo.Create(context.Background(), sampleTrade(acc, "X"))
		}(i)
	}
	wg.Wait()
	for i, err := range errRow {
		require.NoError(t, err, "goroutine %d", i)
	}

	rows, err := repo.ListByAccount(context.Background(), acc)
	require.NoError(t, err)
	require.Len(t, rows, n)

	seen := map[int]bool{}
	for _, r := range rows {
		require.False(t, seen[r.STT], "stt %d xuất hiện hai lần", r.STT)
		seen[r.STT] = true
	}
	for i := 1; i <= n; i++ {
		require.True(t, seen[i], "dãy stt hổng ở %d", i)
	}
}

func TestTradeListByAccountSortsBySTTAscending(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	for _, s := range []string{"A", "B", "C"} {
		_, err := repo.Create(ctx, sampleTrade(acc, s))
		require.NoError(t, err)
	}

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, []int{1, 2, 3}, []int{rows[0].STT, rows[1].STT, rows[2].STT})
	require.Equal(t, "A", rows[0].Symbol)
}

func TestTradeListByAccountDoesNotLeakAcrossAccounts(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc1 := makeAccount(t, db)
	acc2 := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, sampleTrade(acc1, "CUA_TOI"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, sampleTrade(acc2, "CUA_NGUOI_KHAC"))
	require.NoError(t, err)

	rows, err := repo.ListByAccount(ctx, acc1)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "CUA_TOI", rows[0].Symbol)
}

func TestTradeByIDMissingReturnsErrNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)

	_, err := repo.ByID(context.Background(), 999999)
	require.ErrorIs(t, err, repository.ErrNotFound)
}

func TestTradeByIDKeepsNullableFields(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	created, err := repo.Create(context.Background(), sampleTrade(acc, "XAUUSD"))
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
func TestTradeSoftDeleteKeepsRowInTable(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "XAUUSD"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))

	var counter int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM trades WHERE id = ?`, tr.ID).Scan(&counter).Error)
	require.EqualValues(t, 1, counter, "hàng phải còn nguyên trong bảng")

	var deleted *time.Time
	require.NoError(t, db.Raw(`SELECT deleted_at FROM trades WHERE id = ?`, tr.ID).Scan(&deleted).Error)
	require.NotNil(t, deleted, "deleted_at phải được đặt")

	// Vẫn nạp được qua ByID — Restore cần điều đó.
	_, err = repo.ByID(ctx, tr.ID)
	require.NoError(t, err)
}

func TestDeletedTradeNotInMainList(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	a, err := repo.Create(ctx, sampleTrade(acc, "A"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, sampleTrade(acc, "B"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, a.ID))

	con, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, con, 1)
	require.Equal(t, "B", con[0].Symbol)

	junk, err := repo.ListDeletedByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, junk, 1)
	require.Equal(t, "A", junk[0].Symbol)
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Nếu max(stt) chỉ đếm lệnh chưa xoá thì: tạo (stt=1) → xoá → tạo lại cũng
// được cấp stt=1 → khôi phục lệnh cũ đụng UNIQUE (account_id, stt). Người
// dùng mất khả năng khôi phục, và nguyên nhân nằm cách đó ba thao tác.
func TestTradeRestoreAfterNewTradeDoesNotHitUNIQUE(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	old, err := repo.Create(ctx, sampleTrade(acc, "CU"))
	require.NoError(t, err)
	require.Equal(t, 1, old.STT)

	require.NoError(t, repo.SoftDelete(ctx, old.ID))

	fresh, err := repo.Create(ctx, sampleTrade(acc, "MOI"))
	require.NoError(t, err)
	require.Equal(t, 2, fresh.STT, "stt phải tiếp tục từ lệnh đã xoá, không tái sử dụng")

	require.NoError(t, repo.Restore(ctx, old.ID))

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, []int{1, 2}, []int{rows[0].STT, rows[1].STT})
}

func TestTradeRestoreClearsDeletedAt(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "X"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))
	require.NoError(t, repo.Restore(ctx, tr.ID))

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	junk, err := repo.ListDeletedByAccount(ctx, acc)
	require.NoError(t, err)
	require.Empty(t, junk)
}

func TestTradeSoftDeleteTwiceSecondIsNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "X"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))

	// Lệnh đã ở thùng rác: xoá tiếp không đổi gì, và phải nói rõ là không
	// đổi gì thay vì im lặng báo thành công.
	require.ErrorIs(t, repo.SoftDelete(ctx, tr.ID), repository.ErrNotFound)
}

func TestTradeRestoreNonDeletedIsNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "X"))
	require.NoError(t, err)

	require.ErrorIs(t, repo.Restore(ctx, tr.ID), repository.ErrNotFound)
}

func TestTradeUpdateFieldsOnlyChangesSentFields(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "XAUUSD"))
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
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "X"))
	require.NoError(t, err)

	var before time.Time
	require.NoError(t, db.Raw(`SELECT updated_at FROM trades WHERE id = ?`, tr.ID).Scan(&before).Error)

	require.NoError(t, repo.UpdateFields(ctx, tr.ID, map[string]any{"notes": "x"}))

	var after time.Time
	require.NoError(t, db.Raw(`SELECT updated_at FROM trades WHERE id = ?`, tr.ID).Scan(&after).Error)
	require.True(t, after.After(before), "updated_at phải mới hơn: trước=%v sau=%v", before, after)
}

func TestTradeUpdateFieldsMissingIDIsNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)

	err := repo.UpdateFields(context.Background(), 999999, map[string]any{"notes": "x"})
	require.ErrorIs(t, err, repository.ErrNotFound)
}

// ---- CreateBatch (Phase 5, Task 1) ----

func TestTradeCreateBatchAssignsSequentialSTTInSliceOrder(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	// Hai lệnh có sẵn để lô mới phải nối tiếp chứ không bắt đầu lại từ 1.
	_, err := repo.Create(ctx, sampleTrade(acc, "CU1"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, sampleTrade(acc, "CU2"))
	require.NoError(t, err)

	batch := []domain.Trade{
		sampleTrade(acc, "MOI1"),
		sampleTrade(acc, "MOI2"),
		sampleTrade(acc, "MOI3"),
	}
	got, err := repo.CreateBatch(ctx, acc, batch)
	require.NoError(t, err)
	require.Len(t, got, 3)

	// Thứ tự stt phải khớp thứ tự slice: import đọc file từ trên xuống, và
	// stt quyết định thứ tự lũy kế. Đảo thứ tự ở đây là dựng sai đường equity.
	require.Equal(t, 3, got[0].STT)
	require.Equal(t, 4, got[1].STT)
	require.Equal(t, 5, got[2].STT)
	require.Equal(t, "MOI1", got[0].Symbol)
	require.Equal(t, "MOI3", got[2].Symbol)
	for _, tr := range got {
		require.NotZero(t, tr.ID, "ID phải được điền lại sau khi chèn")
	}

	inside, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, inside, 5)
}

// All-or-nothing. Một dòng hỏng làm hỏng CẢ lô — không có trạng thái "nhập
// được một nửa", vì người dùng không có cách nào biết nửa nào đã vào.
func TestTradeCreateBatchOneBadRowWritesNothing(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, sampleTrade(acc, "CU1"))
	require.NoError(t, err)

	broken := sampleTrade(acc, "HONG")
	broken.Direction = "RAC" // vi phạm CHECK của migration 0001

	_, err = repo.CreateBatch(ctx, acc, []domain.Trade{
		sampleTrade(acc, "MOI1"),
		broken,
		sampleTrade(acc, "MOI2"),
	})
	require.Error(t, err)

	con, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, con, 1, "rollback phải sạch: chỉ còn đúng lệnh có từ trước")
	require.Equal(t, "CU1", con[0].Symbol)
}

func TestTradeCreateBatchEmptyBatchNoError(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	got, err := repo.CreateBatch(context.Background(), acc, nil)
	require.NoError(t, err)
	require.Empty(t, got)
}

// stt do người gọi đặt bị ghi đè, y như Create. Import đọc cột STT của file
// cũ ra một con số nào đó — con số đó không được phép quyết định thứ tự.
func TestTradeCreateBatchOverwritesCallerSuppliedSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	a := sampleTrade(acc, "A")
	a.STT = 900
	b := sampleTrade(acc, "B")
	b.STT = 7

	got, err := repo.CreateBatch(context.Background(), acc, []domain.Trade{a, b})
	require.NoError(t, err)
	require.Equal(t, 1, got[0].STT)
	require.Equal(t, 2, got[1].STT)
}

// max(stt) phải quét cả lệnh đã xoá mềm, cùng lý do như Create: cấp lại một
// stt đang trống sẽ đụng UNIQUE khi người dùng khôi phục lệnh cũ.
func TestTradeCreateBatchDoesNotReuseDeletedSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	tr, err := repo.Create(ctx, sampleTrade(acc, "SEDELETE"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, tr.ID))

	got, err := repo.CreateBatch(ctx, acc, []domain.Trade{sampleTrade(acc, "MOI")})
	require.NoError(t, err)
	require.Equal(t, 2, got[0].STT, "stt 1 đã bị lệnh trong thùng rác chiếm")

	require.NoError(t, repo.Restore(ctx, tr.ID))
}

// Hai lô chạy song song không được cùng đọc một max(stt). Đây là test canh
// khoá FOR UPDATE — bỏ khoá đi thì test này đỏ vì trùng stt.
func TestTradeCreateBatchConcurrentNoDuplicateSTT(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	const lossCount, eachLoss = 4, 5
	var wg sync.WaitGroup
	errRow := make([]error, lossCount)
	for i := 0; i < lossCount; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			batch := make([]domain.Trade, eachLoss)
			for j := range batch {
				batch[j] = sampleTrade(acc, fmt.Sprintf("L%d-%d", i, j))
			}
			_, errRow[i] = repo.CreateBatch(ctx, acc, batch)
		}(i)
	}
	wg.Wait()
	for i, e := range errRow {
		require.NoError(t, e, "lô %d", i)
	}

	rows, err := repo.ListByAccount(ctx, acc)
	require.NoError(t, err)
	require.Len(t, rows, lossCount*eachLoss)

	replaced := map[int]bool{}
	for _, r := range rows {
		require.False(t, replaced[r.STT], "stt %d bị cấp hai lần", r.STT)
		replaced[r.STT] = true
	}
}

// tradeWithSetup là lenhMau nhưng đặt được setup — Facets đọc cả hai cột.
func tradeWithSetup(accountID int64, symbol, setup string) domain.Trade {
	t := sampleTrade(accountID, symbol)
	t.Setup = setup
	return t
}

func TestTradeFacetsReturnsDistinctValuesSortedAlphabetically(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	for _, l := range []domain.Trade{
		tradeWithSetup(acc, "XAUUSD", "Pullback"),
		tradeWithSetup(acc, "EURUSD", "Breakout"),
		tradeWithSetup(acc, "XAUUSD", "Breakout"), // trùng cả hai cột
	} {
		_, err := repo.Create(ctx, l)
		require.NoError(t, err)
	}

	symbols, setups, err := repo.Facets(ctx, acc)
	require.NoError(t, err)
	require.Equal(t, []string{"EURUSD", "XAUUSD"}, symbols, "mỗi giá trị đúng một lần, xếp A-Z")
	require.Equal(t, []string{"Breakout", "Pullback"}, setups)
}

// Giá trị chỉ còn trong thùng rác không được vào dropdown: lọc theo nó chắc
// chắn ra danh sách rỗng, vì mọi truy vấn lệnh đều bỏ qua lệnh đã xoá mềm.
func TestTradeFacetsSkipsDeletedTradesInMemory(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, tradeWithSetup(acc, "CONSONG", "Giu"))
	require.NoError(t, err)
	deleted, err := repo.Create(ctx, tradeWithSetup(acc, "DAXOA", "Bo"))
	require.NoError(t, err)
	require.NoError(t, repo.SoftDelete(ctx, deleted.ID))

	symbols, setups, err := repo.Facets(ctx, acc)
	require.NoError(t, err)
	require.Equal(t, []string{"CONSONG"}, symbols)
	require.Equal(t, []string{"Giu"}, setups)
}

func TestTradeFacetsDoesNotLeakAcrossAccounts(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc1 := makeAccount(t, db)
	acc2 := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, tradeWithSetup(acc1, "CUA_TOI", "SetupCuaToi"))
	require.NoError(t, err)
	_, err = repo.Create(ctx, tradeWithSetup(acc2, "CUA_NGUOI_KHAC", "SetupNguoiKhac"))
	require.NoError(t, err)

	symbols, setups, err := repo.Facets(ctx, acc1)
	require.NoError(t, err)
	require.Equal(t, []string{"CUA_TOI"}, symbols)
	require.Equal(t, []string{"SetupCuaToi"}, setups)
}

// Setup rỗng là hợp lệ trong DB (cột NOT NULL mặc định chuỗi rỗng) nhưng là
// một mục dropdown không chọn được, nên phải bị loại.
func TestTradeFacetsExcludesEmptyStrings(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)
	ctx := context.Background()

	_, err := repo.Create(ctx, tradeWithSetup(acc, "XAUUSD", ""))
	require.NoError(t, err)
	_, err = repo.Create(ctx, tradeWithSetup(acc, "EURUSD", "Breakout"))
	require.NoError(t, err)

	symbols, setups, err := repo.Facets(ctx, acc)
	require.NoError(t, err)
	require.Equal(t, []string{"EURUSD", "XAUUSD"}, symbols)
	require.Equal(t, []string{"Breakout"}, setups, "setup rỗng không phải một lựa chọn")
}

func TestTradeFacetsAccountWithNoTradesReturnsEmpty(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewTradeRepo(db)
	acc := makeAccount(t, db)

	symbols, setups, err := repo.Facets(context.Background(), acc)
	require.NoError(t, err)
	require.Empty(t, symbols)
	require.Empty(t, setups)
}
