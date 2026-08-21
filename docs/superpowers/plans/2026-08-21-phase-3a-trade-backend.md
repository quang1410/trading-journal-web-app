# Phase 3a — Backend trade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng trọn tầng backend cho lệnh giao dịch — CRUD, xoá mềm, khôi phục, lọc, phân trang — và ba endpoint đọc (`/trades`, `/stats`, `/charts`) nối lõi tính toán thuần của Phase 1 vào request thật.

**Architecture:** Một hàm `TradeService.Read` nạp toàn bộ lệnh chưa xoá của account, chạy `metrics.Enrich` trên trọn dãy để lũy kế đúng, rồi lọc — trả về **cả hai** tập `All` và `Filtered` vì §7.1 của spec mẹ quy định lũy kế/streak tính trên toàn bộ còn KPI/pivot tính trên tập đã lọc. Ba endpoint đọc tiêu thụ kết quả đó theo ba cách khác nhau. Lọc chạy trong Go chứ không trong SQL, vì `trade_class` là trường suy diễn và vì đằng nào cũng phải nạp hết dãy.

**Tech Stack:** Go 1.23, chi v5, GORM, PostgreSQL 16, `shopspring/decimal`, testcontainers-go, testify.

**Spec:** `docs/superpowers/specs/2026-08-21-phase-3a-trade-backend-design.md` (đọc cùng plan này; plan lập luận từ spec)

## Global Constraints

Trích nguyên văn từ `CLAUDE.md` và spec. Mọi task đều ngầm chịu ràng buộc này.

- **Tiền là `decimal.Decimal`, không bao giờ `float64`.** DB dùng `NUMERIC`.
- **Không lưu trường suy diễn.** `net`, `score_*`, `cum_*`, `drawdown`, `week`, `month`, `weekday`, `day` tính lúc đọc, không có cột trong DB.
- **`internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần** — cấm import GORM, `net/http`, `database/sql`, `context`. Task nào cũng KHÔNG được thêm import vào ba package đó.
- **Lưu UTC, tính theo `accounts.timezone` (IANA), hiển thị theo timezone của account.** Không hardcode `+7`.
- **Chuỗi enum tiếng Việt là key chấm điểm** — lấy từ `internal/domain/enums.go`, không gõ lại chuỗi thẳng vào code mới.
- **Soft delete trades qua `deleted_at`**; xoá cứng làm sai đường equity. Không có `DELETE` thật ở bất kỳ đâu trong 3a.
- **`stt` do backend cấp, frontend gửi lên thì bỏ qua.**
- **Lũy kế luôn tính trên toàn bộ lệnh của account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI thì tính trên tập đã lọc.**
- **Mỗi feature ship kèm test trong cùng lần thay đổi.** Trước khi báo "xong" phải chạy test thật và báo kết quả thật.
- `repository` là tầng **duy nhất** được chạm GORM. Tầng trên nhận/trả kiểu của `domain`.
- `repository` trả `ErrNotFound`/`ErrDuplicate`; `service` dịch sang `apperr`. `repository` không biết HTTP status.
- Chạy test: `make test` (cần Docker) · `make test-pure` (không cần Docker) · `make lint`.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `internal/repository/trade.go` | Truy cập GORM cho bảng `trades`: liệt kê, nạp một, tạo kèm cấp `stt` trong transaction, sửa, xoá mềm, khôi phục |
| `internal/repository/trade_test.go` | Test trên Postgres thật: UNIQUE, lọc `deleted_at`, cấp `stt` song song |
| `internal/service/trade_filter.go` | `Filter` và `Apply` — logic **thuần**, không chạm DB, test không cần Docker |
| `internal/service/trade_filter_test.go` | Test thuần cho bộ lọc |
| `internal/service/trade.go` | `TradeService`: `Read` (nạp → Enrich → lọc), `Create`, `Update`, `Delete`, `Restore`, `ByID`, `Trash` |
| `internal/service/trade_test.go` | Test trên Postgres thật cho `TradeService` |
| `internal/httpapi/trade_handler.go` | 9 handler |
| `internal/httpapi/trade_handler_test.go` | Test `httptest` |
| `internal/httpapi/trade_dto.go` | `tradeDTO`, `statsDTO`, request type — file riêng vì `dto.go` sẽ quá dài nếu nhét thêm |
| `internal/httpapi/testdata/charts.golden.json` | JSON mẫu ghim hình dạng `/charts` |
| `internal/httpapi/middleware.go` | Thêm `RequireTrade`, `Trade(ctx)` |
| `internal/httpapi/router.go` | Gắn 9 route |
| `cmd/api/main.go` | Nối `TradeRepo`/`TradeService` vào `Deps` |

---

### Task 1: `TradeRepo` — liệt kê, nạp một, tạo kèm cấp `stt`

**Files:**
- Create: `backend/internal/repository/trade.go`, `backend/internal/repository/trade_test.go`

**Interfaces:**
- Consumes: `domain.Trade`, `translate`, `ErrNotFound` (đã có).
- Produces:
  - `func NewTradeRepo(db *gorm.DB) *TradeRepo`
  - `func (r *TradeRepo) ListByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)`
  - `func (r *TradeRepo) ByID(ctx context.Context, id int64) (domain.Trade, error)`
  - `func (r *TradeRepo) Create(ctx context.Context, t domain.Trade) (domain.Trade, error)`

- [ ] **Step 1: Viết test ĐỎ**

Tạo `backend/internal/repository/trade_test.go`:

```go
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
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/repository/ -run TestTrade -count=1`
Expected: FAIL khi biên dịch — `undefined: repository.NewTradeRepo`.

- [ ] **Step 3: Viết `backend/internal/repository/trade.go`**

```go
package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type TradeRepo struct{ db *gorm.DB }

func NewTradeRepo(db *gorm.DB) *TradeRepo { return &TradeRepo{db: db} }

// ListByAccount trả mọi lệnh CHƯA xoá của account, sắp theo stt tăng dần.
//
// domain.Trade cố ý không có trường DeletedAt — nó chỉ mang thứ người dùng
// nhập — nên GORM KHÔNG tự lọc soft delete giúp. Điều kiện phải viết tay ở
// mọi truy vấn, và đó là lý do nó nằm ngay đây chứ không rải rác tầng trên.
func (r *TradeRepo) ListByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	var rows []domain.Trade
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND deleted_at IS NULL", accountID).
		Order("stt ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// ByID nạp lệnh KỂ CẢ đã xoá mềm. Restore cần đọc được lệnh đã xoá, và
// middleware kiểm quyền sở hữu cũng phải trả lời được cho lệnh trong thùng rác.
func (r *TradeRepo) ByID(ctx context.Context, id int64) (domain.Trade, error) {
	var t domain.Trade
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&t).Error
	return t, translate(err)
}

// Create cấp stt rồi chèn, trong MỘT transaction có khoá hàng account.
//
// Hai điểm sống còn:
//
//  1. Khoá `SELECT ... FOR UPDATE` trên hàng accounts. Thiếu nó thì hai
//     request đồng thời cùng đọc một max(stt) rồi cùng ghi giá trị đó.
//
//  2. max(stt) quét CẢ lệnh đã xoá mềm — không có `deleted_at IS NULL` ở
//     đây, và đó là chủ ý. Nếu chỉ đếm lệnh chưa xoá thì xoá lệnh cuối rồi
//     tạo lệnh mới sẽ cấp lại đúng stt vừa trống, và lúc người dùng khôi
//     phục lệnh cũ sẽ đụng UNIQUE (account_id, stt) — hỏng ở một chỗ cách
//     nguyên nhân nhiều thao tác.
//
// stt do người gọi đặt bị ghi đè, không báo lỗi: quy tắc 7 của CLAUDE.md.
func (r *TradeRepo) Create(ctx context.Context, t domain.Trade) (domain.Trade, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var khoa int64
		if err := tx.Raw(
			`SELECT id FROM accounts WHERE id = ? FOR UPDATE`, t.AccountID,
		).Scan(&khoa).Error; err != nil {
			return err
		}
		var next int
		if err := tx.Raw(
			`SELECT COALESCE(MAX(stt), 0) + 1 FROM trades WHERE account_id = ?`, t.AccountID,
		).Scan(&next).Error; err != nil {
			return err
		}
		t.STT = next
		return tx.Create(&t).Error
	})
	if err != nil {
		return domain.Trade{}, translate(err)
	}
	return t, nil
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/repository/ -run TestTrade -count=1 -v 2>&1 | tail -30`
Expected: PASS, 8 test mới (cộng 3 test mapping đã có).

- [ ] **Step 5: FALSIFY khoá hàng account**

```bash
cd backend
# Trong trade.go, xoá khối `SELECT id FROM accounts ... FOR UPDATE` (cả biến khoa)
go test ./internal/repository/ -run TestTradeCreateSongSongKhongTrungSTT -count=1
```

Expected: ĐỎ — hoặc lỗi UNIQUE từ Postgres, hoặc `stt N xuất hiện hai lần`. Khôi phục rồi chạy lại. Dán cả hai output.

Nếu nó XANH: đừng kết luận "khoá thừa". Chạy lại vài lần và tăng `n` lên 40 — cuộc đua có tính xác suất. Chỉ khi nó xanh bền vững ở n lớn mới đặt câu hỏi ngược lại.

- [ ] **Step 6: FALSIFY việc ghi đè `stt` của người gọi**

```bash
cd backend
# Trong Create, đổi `t.STT = next` thành `if t.STT == 0 { t.STT = next }`
go test ./internal/repository/ -run TestTradeCreateGhiDeSTTDoNguoiGoiDat -count=1
```

Expected: ĐỎ — `expected: 1, actual: 999`. Khôi phục.

- [ ] **Step 7: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/repository/trade.go backend/internal/repository/trade_test.go
git commit -m "feat(trade): add TradeRepo with account-locked stt assignment"
```

---

### Task 2: `TradeRepo` — sửa, xoá mềm, khôi phục, thùng rác

**Files:**
- Modify: `backend/internal/repository/trade.go`
- Modify: `backend/internal/repository/trade_test.go`

**Interfaces:**
- Consumes: `TradeRepo` (Task 1).
- Produces:
  - `func (r *TradeRepo) ListDeletedByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)`
  - `func (r *TradeRepo) UpdateFields(ctx context.Context, id int64, fields map[string]any) error`
  - `func (r *TradeRepo) SoftDelete(ctx context.Context, id int64) error`
  - `func (r *TradeRepo) Restore(ctx context.Context, id int64) error`

- [ ] **Step 1: Viết test ĐỎ**

Thêm vào cuối `backend/internal/repository/trade_test.go`:

```go
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
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/repository/ -run TestTrade -count=1`
Expected: FAIL khi biên dịch — `repo.SoftDelete undefined`.

- [ ] **Step 3: Thêm bốn method vào `backend/internal/repository/trade.go`**

```go
// ListDeletedByAccount trả các lệnh đang nằm trong thùng rác, mới xoá lên trước.
func (r *TradeRepo) ListDeletedByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	var rows []domain.Trade
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND deleted_at IS NOT NULL", accountID).
		Order("deleted_at DESC, stt DESC").
		Find(&rows).Error
	return rows, translate(err)
}

// UpdateFields ghi đúng những cột có trong fields.
//
// Nhận map chứ không nhận struct là chủ ý: PATCH phải phân biệt "không gửi
// trường này" với "gửi giá trị rỗng", mà struct thì không diễn đạt được —
// GORM bỏ qua mọi zero value khi Updates bằng struct, nên đặt notes = ""
// sẽ lặng lẽ không có tác dụng.
//
// updated_at đặt tay: cột có DEFAULT now() nhưng không có trigger, và
// domain.Trade không mang trường đó nên GORM không tự bump.
func (r *TradeRepo) UpdateFields(ctx context.Context, id int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	ghi := make(map[string]any, len(fields)+1)
	for k, v := range fields {
		ghi[k] = v
	}
	ghi["updated_at"] = gorm.Expr("now()")

	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(ghi)
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDelete đánh dấu đã xoá. `deleted_at IS NULL` trong WHERE khiến xoá lần
// hai trả ErrNotFound thay vì lặng lẽ báo thành công.
func (r *TradeRepo) SoftDelete(ctx context.Context, id int64) error {
	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]any{"deleted_at": gorm.Expr("now()"), "updated_at": gorm.Expr("now()")})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// Restore đưa lệnh ra khỏi thùng rác. `deleted_at IS NOT NULL` khiến khôi
// phục một lệnh chưa xoá trả ErrNotFound — im lặng chấp nhận sẽ che mất
// việc frontend đang gọi nhầm.
func (r *TradeRepo) Restore(ctx context.Context, id int64) error {
	res := r.db.WithContext(ctx).
		Model(&domain.Trade{}).
		Where("id = ? AND deleted_at IS NOT NULL", id).
		Updates(map[string]any{"deleted_at": nil, "updated_at": gorm.Expr("now()")})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/repository/ -run TestTrade -count=1`
Expected: PASS, 17 test.

- [ ] **Step 5: FALSIFY việc `max(stt)` quét cả lệnh đã xoá**

```bash
cd backend
# Trong Create, đổi câu SQL cấp stt thành:
#   SELECT COALESCE(MAX(stt), 0) + 1 FROM trades WHERE account_id = ? AND deleted_at IS NULL
go test ./internal/repository/ -run TestTradeKhoiPhucSauKhiDaTaoLenhMoiKhongDungUNIQUE -count=1
```

Expected: ĐỎ — `expected: 2, actual: 1`, và nếu chạy tiếp sẽ là lỗi UNIQUE lúc Restore. Khôi phục.

- [ ] **Step 6: FALSIFY việc bump `updated_at`**

```bash
cd backend
# Trong UpdateFields, xoá dòng `ghi["updated_at"] = gorm.Expr("now()")`
go test ./internal/repository/ -run TestTradeUpdateFieldsBumpUpdatedAt -count=1
```

Expected: ĐỎ — `updated_at phải mới hơn`. Khôi phục.

- [ ] **Step 7: FALSIFY việc xoá hai lần phải báo NotFound**

```bash
cd backend
# Trong SoftDelete, bỏ `AND deleted_at IS NULL` khỏi WHERE
go test ./internal/repository/ -run TestTradeSoftDeleteHaiLanLanSauLaNotFound -count=1
```

Expected: ĐỎ — trả `nil` thay vì `ErrNotFound`. Khôi phục.

- [ ] **Step 8: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/repository/trade.go backend/internal/repository/trade_test.go
git commit -m "feat(trade): add soft delete, restore and partial update to TradeRepo"
```

---

### Task 3: `Filter` — bộ lọc thuần, test không cần Docker

**Files:**
- Create: `backend/internal/service/trade_filter.go`, `backend/internal/service/trade_filter_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched` (Phase 1).
- Produces:
  - `type Filter struct { From, To, Setup, Symbol, Timeframe, Direction, TradeClass string }`
  - `func (f Filter) Normalize() Filter`
  - `func (f Filter) Apply(rows []metrics.Enriched) []metrics.Enriched`
  - `func (f Filter) IsEmpty() bool`

Bộ lọc tách ra file riêng vì nó **thuần** — không chạm DB, không chạm HTTP. Test của nó chạy trong mili giây và không cần Docker, mà đây lại đúng chỗ §7.1 dễ sai nhất.

- [ ] **Step 1: Viết test ĐỎ**

Tạo `backend/internal/service/trade_filter_test.go`:

```go
package service_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/service"
)

// hang dựng một Enriched tối thiểu đủ để bộ lọc làm việc. Không gọi
// metrics.Enrich ở đây: test này kiểm bộ lọc, không kiểm phép làm giàu.
func hang(day, setup, symbol, timeframe, direction, class string) metrics.Enriched {
	return metrics.Enriched{
		Trade: domain.Trade{
			Symbol:    symbol,
			Direction: direction,
			Setup:     setup,
			Timeframe: timeframe,
			Profit:    decimal.NewFromInt(1),
			EnteredAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		Day:        day,
		TradeClass: class,
	}
}

var mau = []metrics.Enriched{
	hang("2026-06-08", "Breakout", "XAUUSD", "H1", domain.DirectionLong, domain.ClassPlanned),
	hang("2026-06-10", "Pullback", "EURUSD", "M15", domain.DirectionShort, domain.ClassNotEvaluated),
	hang("2026-06-12", "Breakout", "EURUSD", "H1", domain.DirectionLong, domain.ClassImpulsive),
}

func ngay(rows []metrics.Enriched) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Day)
	}
	return out
}

func TestFilterRongGiuNguyenTatCa(t *testing.T) {
	require.NotEmpty(t, mau, "dữ liệu mẫu rỗng thì mọi khẳng định dưới đây đều xanh vô nghĩa")
	got := service.Filter{}.Apply(mau)
	require.Len(t, got, 3)
}

func TestFilterKhoangNgayBaoGomHaiDauMut(t *testing.T) {
	got := service.Filter{From: "2026-06-08", To: "2026-06-10"}.Apply(mau)
	require.Equal(t, []string{"2026-06-08", "2026-06-10"}, ngay(got),
		"cả hai đầu mút đều phải nằm trong tập kết quả")
}

func TestFilterChiCoFrom(t *testing.T) {
	got := service.Filter{From: "2026-06-10"}.Apply(mau)
	require.Equal(t, []string{"2026-06-10", "2026-06-12"}, ngay(got))
}

func TestFilterChiCoTo(t *testing.T) {
	got := service.Filter{To: "2026-06-08"}.Apply(mau)
	require.Equal(t, []string{"2026-06-08"}, ngay(got))
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
//
// Day do metrics.DateParts sinh, đã quy đổi sang timezone của account. Một
// lệnh vào lúc 23:00Z ngày 09 là lệnh của ngày 10 ở giờ Việt Nam. Nếu ai đó
// "sửa" bộ lọc thành so trên EnteredAt cho có vẻ chặt chẽ, lệnh này sẽ rơi
// nhầm sang ngày 09 và biến mất khỏi bộ lọc tháng — im lặng.
func TestFilterSoTrenDayChuKhongPhaiEnteredAt(t *testing.T) {
	tr := domain.Trade{
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.NewFromInt(10),
		EnteredAt: time.Date(2026, 6, 9, 23, 0, 0, 0, time.UTC), // 06:00 ngày 10 giờ VN
	}
	acc := domain.Account{
		InitialBalance: decimal.NewFromInt(10000),
		RiskPerTrade:   decimal.NewFromFloat(0.01),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
	rows, err := metrics.Enrich([]domain.Trade{tr}, acc)
	require.NoError(t, err)
	require.Equal(t, "2026-06-10", rows[0].Day, "tiền đề: Enrich phải quy đổi sang giờ VN")

	require.Len(t, service.Filter{From: "2026-06-10"}.Apply(rows), 1,
		"lệnh 23:00Z ngày 09 là lệnh ngày 10 ở giờ VN, from=2026-06-10 phải bắt được")
	require.Empty(t, service.Filter{To: "2026-06-09"}.Apply(rows),
		"và to=2026-06-09 thì không được bắt")
}

func TestFilterTheoTungTruongChuoi(t *testing.T) {
	cases := []struct {
		ten  string
		f    service.Filter
		muon []string
	}{
		{"setup", service.Filter{Setup: "Breakout"}, []string{"2026-06-08", "2026-06-12"}},
		{"symbol", service.Filter{Symbol: "EURUSD"}, []string{"2026-06-10", "2026-06-12"}},
		{"timeframe", service.Filter{Timeframe: "H1"}, []string{"2026-06-08", "2026-06-12"}},
		{"direction", service.Filter{Direction: domain.DirectionShort}, []string{"2026-06-10"}},
		{"trade_class", service.Filter{TradeClass: domain.ClassNotEvaluated}, []string{"2026-06-10"}},
	}
	for _, c := range cases {
		t.Run(c.ten, func(t *testing.T) {
			require.Equal(t, c.muon, ngay(c.f.Apply(mau)))
		})
	}
}

// So khớp CHÍNH XÁC, không phải chứa. "Break" không được kéo theo "Breakout":
// setup là khoá gom nhóm của pivot, khớp mờ sẽ làm hai nhóm khác nhau trộn
// vào một, và con số vẫn ra bình thường nên không ai phát hiện.
func TestFilterKhopChinhXacChuKhongPhaiChuoiCon(t *testing.T) {
	require.Empty(t, service.Filter{Setup: "Break"}.Apply(mau))
	require.Empty(t, service.Filter{Symbol: "EUR"}.Apply(mau))
}

func TestFilterNhieuDieuKienLaPhepVA(t *testing.T) {
	got := service.Filter{Setup: "Breakout", Symbol: "EURUSD"}.Apply(mau)
	require.Equal(t, []string{"2026-06-12"}, ngay(got))
}

func TestFilterKhongKhopGiThiTraMangRongChuKhongNil(t *testing.T) {
	got := service.Filter{Symbol: "KHONG_TON_TAI"}.Apply(mau)
	require.NotNil(t, got, "nil sẽ marshal ra null; API phải trả []")
	require.Empty(t, got)
}

func TestFilterKhongDoiLatCatDauVao(t *testing.T) {
	truoc := ngay(mau)
	service.Filter{Symbol: "EURUSD"}.Apply(mau)
	require.Equal(t, truoc, ngay(mau), "Apply không được ghi đè lát cắt gốc")
}

func TestFilterNormalizeCatKhoangTrang(t *testing.T) {
	f := service.Filter{From: "  2026-06-08 ", Symbol: " EURUSD "}.Normalize()
	require.Equal(t, "2026-06-08", f.From)
	require.Equal(t, "EURUSD", f.Symbol)
}

func TestFilterIsEmpty(t *testing.T) {
	require.True(t, service.Filter{}.IsEmpty())
	require.False(t, service.Filter{Symbol: "X"}.IsEmpty())
}
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run TestFilter -count=1`
Expected: FAIL khi biên dịch — `undefined: service.Filter`.

- [ ] **Step 3: Viết `backend/internal/service/trade_filter.go`**

```go
package service

import (
	"strings"

	"journal/internal/metrics"
)

// Filter là bộ lọc dùng chung cho ba endpoint đọc. Trường rỗng nghĩa là
// không lọc theo trường đó.
//
// From/To là ngày dạng "YYYY-MM-DD" hiểu theo timezone của account, bao gồm
// cả hai đầu mút.
type Filter struct {
	From       string
	To         string
	Setup      string
	Symbol     string
	Timeframe  string
	Direction  string
	TradeClass string
}

// Normalize cắt khoảng trắng ở mọi trường. Gọi nó ngay khi nhận query string.
func (f Filter) Normalize() Filter {
	f.From = strings.TrimSpace(f.From)
	f.To = strings.TrimSpace(f.To)
	f.Setup = strings.TrimSpace(f.Setup)
	f.Symbol = strings.TrimSpace(f.Symbol)
	f.Timeframe = strings.TrimSpace(f.Timeframe)
	f.Direction = strings.TrimSpace(f.Direction)
	f.TradeClass = strings.TrimSpace(f.TradeClass)
	return f
}

// IsEmpty báo bộ lọc không lọc gì cả.
func (f Filter) IsEmpty() bool {
	return f == Filter{}
}

// Apply lọc danh sách ĐÃ Enrich, trả lát cắt mới.
//
// Chạy sau Enrich chứ không phải trong SQL, vì hai lý do độc lập:
//
//  1. TradeClass là trường suy diễn — trong SQL không tồn tại cột nào để lọc.
//  2. Lũy kế bắt buộc tính trên toàn bộ dãy, nên đằng nào cũng phải nạp hết;
//     lọc dưới SQL không tiết kiệm được lần đọc nào.
//
// Luôn trả lát cắt khác nil, kể cả khi không khớp gì: nil marshal ra `null`
// còn API phải trả `[]`.
func (f Filter) Apply(rows []metrics.Enriched) []metrics.Enriched {
	out := make([]metrics.Enriched, 0, len(rows))
	for _, r := range rows {
		if f.match(r) {
			out = append(out, r)
		}
	}
	return out
}

func (f Filter) match(r metrics.Enriched) bool {
	// So sánh CHUỖI trên Day, không phải số học múi giờ trên EnteredAt.
	//
	// Day do metrics.DateParts sinh và đã quy đổi đúng timezone của account.
	// Định dạng "YYYY-MM-DD" có thứ tự từ điển trùng khít thứ tự thời gian,
	// nên phép so sánh này đúng — và nó loại bỏ hoàn toàn số học biên múi
	// giờ, tức loại bỏ đúng cái bẫy mà spec mẹ §7.1 cảnh báo.
	if f.From != "" && r.Day < f.From {
		return false
	}
	if f.To != "" && r.Day > f.To {
		return false
	}
	// Khớp chính xác, không phải chứa: đây là giá trị enum và khoá gom nhóm
	// của pivot, khớp mờ sẽ trộn hai nhóm khác nhau làm một.
	if f.Setup != "" && r.Trade.Setup != f.Setup {
		return false
	}
	if f.Symbol != "" && r.Trade.Symbol != f.Symbol {
		return false
	}
	if f.Timeframe != "" && r.Trade.Timeframe != f.Timeframe {
		return false
	}
	if f.Direction != "" && r.Trade.Direction != f.Direction {
		return false
	}
	if f.TradeClass != "" && r.TradeClass != f.TradeClass {
		return false
	}
	return true
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run TestFilter -count=1 -v 2>&1 | tail -25`
Expected: PASS, 16 test (kể cả 5 subtest).

Ghi chú: các test này **không** cần Docker vì không chạm DB. Nếu chúng bắt đầu cần Postgres thì bộ lọc đã bị kéo vào tầng sai.

- [ ] **Step 5: FALSIFY việc so trên `Day`**

```bash
cd backend
# Trong match(), thay hai nhánh From/To bằng cách so trên EnteredAt:
#   if f.From != "" && r.Trade.EnteredAt.Format("2006-01-02") < f.From { return false }
#   if f.To   != "" && r.Trade.EnteredAt.Format("2006-01-02") > f.To   { return false }
go test ./internal/service/ -run TestFilterSoTrenDayChuKhongPhaiEnteredAt -count=1
```

Expected: ĐỎ — lệnh `23:00Z` ngày 09 rơi nhầm về ngày 09, `from=2026-06-10` không bắt được. Khôi phục.

- [ ] **Step 6: FALSIFY việc khớp chính xác**

```bash
cd backend
# Trong match(), đổi so sánh setup thành:
#   if f.Setup != "" && !strings.Contains(r.Trade.Setup, f.Setup) { return false }
go test ./internal/service/ -run TestFilterKhopChinhXacChuKhongPhaiChuoiCon -count=1
```

Expected: ĐỎ — `Setup: "Break"` kéo theo cả hai lệnh `Breakout`. Khôi phục.

- [ ] **Step 7: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/trade_filter.go backend/internal/service/trade_filter_test.go
git commit -m "feat(trade): add pure post-enrich filter comparing account-local day strings"
```

---

### Task 4: `TradeService.Read` và phân trang — hai tập `All` / `Filtered`

**Files:**
- Create: `backend/internal/service/trade.go`, `backend/internal/service/trade_test.go`

**Interfaces:**
- Consumes: `TradeRepo` (Task 1–2), `Filter` (Task 3), `metrics.Enrich`, `AccountService`.
- Produces:
  - `type ReadResult struct { All, Filtered []metrics.Enriched; Account domain.Account }`
  - `type Page struct { Items []metrics.Enriched; Page, Size, Total int }`
  - `const DefaultPageSize = 50`, `const MaxPageSize = 200`
  - `func NewTradeService(trades *repository.TradeRepo, flows *repository.CashFlowRepo, accounts *AccountService) *TradeService`
  - `func (s *TradeService) Read(ctx context.Context, acc domain.Account, f Filter) (ReadResult, error)`
  - `func (s *TradeService) List(ctx context.Context, acc domain.Account, f Filter, page, size int) (Page, error)`

- [ ] **Step 1: Viết test ĐỎ**

Tạo `backend/internal/service/trade_test.go`:

```go
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

// themLenh chèn thẳng qua repo để test của service không phụ thuộc phần
// validate của service.Create (task sau mới có).
func themLenh(t *testing.T, svc *service.TradeService, acc domain.Account, ngayVN string, symbol string, profit string) {
	t.Helper()
	// 12:00 giờ VN — cách xa nửa đêm nên `day` không phụ thuộc mẹo múi giờ.
	ts, err := time.Parse("2006-01-02T15:04:05Z07:00", ngayVN+"T12:00:00+07:00")
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
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run 'TestRead|TestList' -count=1`
Expected: FAIL khi biên dịch — `undefined: service.NewTradeService`.

- [ ] **Step 3: Viết `backend/internal/service/trade.go`**

Task này chỉ viết phần đọc. `Create` và `Delete` mà test gọi tới sẽ được viết ở Task 6 và 7 — tạm thời thêm bản tối thiểu ngay dưới đây để test biên dịch được; Task 6 sẽ đắp phần kiểm tra đầu vào lên trên.

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/repository"
)

const (
	// DefaultPageSize và MaxPageSize dùng chung cho service và handler, để
	// hai nơi không trôi lệch nhau.
	DefaultPageSize = 50
	MaxPageSize     = 200
)

// ReadResult là kết quả của một lần nạp-và-lọc.
//
// HAI tập, không phải một. Spec mẹ §7.1 quy định lũy kế, drawdown và streak
// tính trên TOÀN BỘ lệnh chưa xoá, còn KPI và pivot tính trên tập ĐÃ LỌC.
// Trộn lẫn hai tập này là lỗi im lặng: kết quả vẫn ra số, chỉ là số sai.
type ReadResult struct {
	All      []metrics.Enriched
	Filtered []metrics.Enriched
	Account  domain.Account
}

// Page là một trang của danh sách lệnh.
type Page struct {
	Items []metrics.Enriched
	Page  int
	Size  int
	Total int
}

// TradeInput là đầu vào tạo lệnh. Không có STT: backend cấp.
type TradeInput struct {
	EnteredAt      time.Time
	Symbol         string
	Direction      string
	Entry          *decimal.Decimal
	Exit           *decimal.Decimal
	Volume         *decimal.Decimal
	Profit         decimal.Decimal
	ProfitTheory   *decimal.Decimal
	Fee            decimal.Decimal
	Setup          string
	Timeframe      string
	EntryQuality   string
	InTradeQuality string
	ExitQuality    string
	Psychology     string
	Notes          string
}

type TradeService struct {
	trades   *repository.TradeRepo
	flows    *repository.CashFlowRepo
	accounts *AccountService
}

func NewTradeService(trades *repository.TradeRepo, flows *repository.CashFlowRepo, accounts *AccountService) *TradeService {
	return &TradeService{trades: trades, flows: flows, accounts: accounts}
}

// Read nạp toàn bộ lệnh chưa xoá của account, làm giàu trên TRỌN dãy, rồi
// mới lọc.
//
// Thứ tự này là điều kiện đúng/sai chứ không phải sở thích: Enrich tính
// cum_by_trade, running_peak và drawdown theo thứ tự stt, nên lọc trước khi
// làm giàu sẽ dựng đường equity từ một tập con — một đường không có thật.
//
// Nhận sẵn domain.Account thay vì accountID vì handler đã có account trong
// context từ RequireAccount; nạp lại là một truy vấn thừa mỗi request.
func (s *TradeService) Read(ctx context.Context, acc domain.Account, f Filter) (ReadResult, error) {
	rows, err := s.trades.ListByAccount(ctx, acc.ID)
	if err != nil {
		return ReadResult{}, fmt.Errorf("liệt kê lệnh: %w", err)
	}
	all, err := metrics.Enrich(rows, acc)
	if err != nil {
		// Enrich chỉ lỗi khi timezone của account không phải tên IANA hợp lệ,
		// hoặc khi lát cắt trộn nhiều account. Cả hai đều hiển thị được cho
		// người dùng và đều là lỗi dữ liệu, không phải lỗi hệ thống.
		return ReadResult{}, apperr.Validation(err.Error())
	}
	return ReadResult{
		All:      all,
		Filtered: f.Normalize().Apply(all),
		Account:  acc,
	}, nil
}

// List phân trang tập đã lọc, lệnh mới nhất trước.
func (s *TradeService) List(ctx context.Context, acc domain.Account, f Filter, page, size int) (Page, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return Page{}, err
	}
	return paginate(res.Filtered, page, size), nil
}

// paginate kẹp tham số sai về khoảng hợp lệ thay vì báo lỗi: một trang danh
// sách không nên gãy vì query string bị gõ nhầm.
func paginate(rows []metrics.Enriched, page, size int) Page {
	if page < 1 {
		page = 1
	}
	switch {
	case size < 1:
		size = DefaultPageSize
	case size > MaxPageSize:
		size = MaxPageSize
	}

	// Mới nhất trước. Đảo vào BẢN SAO chứ không đảo tại chỗ: rows là lát cắt
	// của ReadResult.Filtered, và /stats với /charts còn dùng nó.
	nguoc := make([]metrics.Enriched, len(rows))
	for i, r := range rows {
		nguoc[len(rows)-1-i] = r
	}

	total := len(nguoc)
	from := (page - 1) * size
	if from > total {
		from = total
	}
	to := from + size
	if to > total {
		to = total
	}
	return Page{Items: nguoc[from:to], Page: page, Size: size, Total: total}
}

// Create chèn lệnh mới. Phần kiểm tra đầu vào được đắp vào ở Task 6.
func (s *TradeService) Create(ctx context.Context, acc domain.Account, in TradeInput) (domain.Trade, error) {
	created, err := s.trades.Create(ctx, domain.Trade{
		AccountID:      acc.ID,
		EnteredAt:      in.EnteredAt.UTC(),
		Symbol:         in.Symbol,
		Direction:      in.Direction,
		Entry:          in.Entry,
		Exit:           in.Exit,
		Volume:         in.Volume,
		Profit:         in.Profit,
		ProfitTheory:   in.ProfitTheory,
		Fee:            in.Fee,
		Setup:          in.Setup,
		Timeframe:      in.Timeframe,
		EntryQuality:   in.EntryQuality,
		InTradeQuality: in.InTradeQuality,
		ExitQuality:    in.ExitQuality,
		Psychology:     in.Psychology,
		Notes:          in.Notes,
	})
	if err != nil {
		return domain.Trade{}, fmt.Errorf("tạo lệnh: %w", err)
	}
	return created, nil
}

// Delete xoá mềm. Kiểm quyền sở hữu nằm ở middleware RequireTrade (Task 8).
func (s *TradeService) Delete(ctx context.Context, id int64) error {
	if err := s.trades.SoftDelete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh")
		}
		return fmt.Errorf("xoá lệnh: %w", err)
	}
	return nil
}
```

Lưu ý: `Setup` rỗng lúc này vẫn ghi rỗng — DB có `DEFAULT 'KHÔNG CÓ SETUP'` nhưng mặc định chỉ áp khi cột **vắng mặt** trong INSERT, mà GORM luôn gửi mọi cột. Task 6 sẽ đặt mặc định trong service. Test của task này không chạm `Setup` nên chưa lộ ra.

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run 'TestRead|TestList' -count=1 -v 2>&1 | tail -30`
Expected: PASS, 12 test (kể cả 5 subtest của phân trang).

- [ ] **Step 5: FALSIFY thứ tự "Enrich rồi mới lọc"**

```bash
cd backend
```

Trong `Read`, thay dòng `return ReadResult{...}` cuối hàm bằng khối dưới đây — nó Enrich **lần hai** trên tập đã lọc, tức đúng cái lỗi "lọc trước rồi mới tính lũy kế":

```go
	loc := f.Normalize().Apply(all)
	tho := make([]domain.Trade, 0, len(loc))
	for _, e := range loc {
		tho = append(tho, e.Trade)
	}
	filtered, _ := metrics.Enrich(tho, acc)
	return ReadResult{All: all, Filtered: filtered, Account: acc}, nil
```

Rồi chạy:

```bash
cd backend && go test ./internal/service/ -run TestReadLuyKeTinhTrenToanBoDuDaLoc -count=1
```

Expected: ĐỎ — `cum_by_trade` của BBB ra `50` thay vì `150`. Khôi phục.

- [ ] **Step 6: FALSIFY việc `total` đếm tập đã lọc**

```bash
cd backend
# Trong List, đổi `paginate(res.Filtered, ...)` thành `paginate(res.All, ...)`
go test ./internal/service/ -run 'TestListTotalDemTapDaLocChuKhongPhaiToanBo' -count=1
```

Expected: ĐỎ — `expected: 2, actual: 3`. Khôi phục.

- [ ] **Step 7: FALSIFY việc không đảo tại chỗ**

```bash
cd backend
# Trong paginate, thay khối dựng `nguoc` bằng đảo tại chỗ:
#   for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 { rows[i], rows[j] = rows[j], rows[i] }
#   nguoc := rows
go test ./internal/service/ -count=1
```

Expected: task này có thể vẫn XANH — đảo tại chỗ chỉ lộ ra khi `/stats` hoặc `/charts` dùng lại `Filtered` sau đó, mà hai endpoint đó chưa tồn tại. **Đừng kết luận là dòng thừa.** Ghi lại rằng bất biến này chưa falsify được ở đây và làm lại ở Task 5 Step 6, nơi `Charts` dùng cùng lát cắt.

- [ ] **Step 8: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/trade.go backend/internal/service/trade_test.go
git commit -m "feat(trade): add read pipeline returning both full and filtered sets"
```

---

### Task 5: `Stats` và `Charts` — nối `ComputeKPI` và `aggregate.All`

**Files:**
- Modify: `backend/internal/service/trade.go`
- Modify: `backend/internal/service/trade_test.go`

**Interfaces:**
- Consumes: `Read` (Task 4), `metrics.ComputeKPI`, `aggregate.All`, `CashFlowRepo.ListByAccount`.
- Produces:
  - `func (s *TradeService) Stats(ctx context.Context, acc domain.Account, f Filter) (metrics.KPI, error)`
  - `func (s *TradeService) Charts(ctx context.Context, acc domain.Account, f Filter) (aggregate.Charts, error)`

- [ ] **Step 1: Viết test ĐỎ**

Thêm vào cuối `backend/internal/service/trade_test.go`. Import thêm `"journal/internal/aggregate"`:

```go
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

var _ = aggregate.Charts{} // giữ import khi ai đó tạm bỏ bớt test
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run 'TestStats|TestCharts' -count=1`
Expected: FAIL khi biên dịch — `svc.Stats undefined`.

- [ ] **Step 3: Thêm `Stats` và `Charts` vào `backend/internal/service/trade.go`**

Import thêm `"journal/internal/aggregate"`.

```go
// Stats trả KPI của tập ĐÃ LỌC.
//
// Nạp thêm cash flow vì current_balance = vốn ban đầu + nạp − rút + lãi lỗ;
// thiếu nó thì con số vẫn ra nhưng thiếu phần nạp/rút, và nó trông đủ hợp lý
// để không ai nghi ngờ.
func (s *TradeService) Stats(ctx context.Context, acc domain.Account, f Filter) (metrics.KPI, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return metrics.KPI{}, err
	}
	flows, err := s.flows.ListByAccount(ctx, acc.ID)
	if err != nil {
		return metrics.KPI{}, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return metrics.ComputeKPI(res.Filtered, acc, flows), nil
}

// Charts trả cả 12 nhóm biểu đồ.
//
// Truyền CẢ HAI tập, đúng thứ tự (all, filtered): streak tính trên toàn bộ
// dãy còn pivot tính trên tập đã lọc. Hai tham số cùng kiểu nên đảo chỗ vẫn
// biên dịch và vẫn ra số — đó là lý do có test riêng ghim ngữ nghĩa này.
func (s *TradeService) Charts(ctx context.Context, acc domain.Account, f Filter) (aggregate.Charts, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return aggregate.Charts{}, err
	}
	return aggregate.All(res.All, res.Filtered, acc), nil
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run 'TestStats|TestCharts' -count=1 -v 2>&1 | tail -20`
Expected: PASS, 6 test.

- [ ] **Step 5: FALSIFY thứ tự tham số của `aggregate.All`**

```bash
cd backend
# Trong Charts, đổi thành `aggregate.All(res.Filtered, res.Filtered, acc)`
go test ./internal/service/ -run TestChartsStreakTrenToanBoPivotTrenTapDaLoc -count=1
```

Expected: ĐỎ — `LongestWinStreak` ra `1` thay vì `3`. Khôi phục.

- [ ] **Step 6: FALSIFY việc không đảo tại chỗ — lần này bắt được**

Đây là bất biến Task 4 Step 7 chưa falsify được vì lúc đó chưa có endpoint nào dùng lại `Filtered`. Giờ đã có.

```bash
cd backend
# Trong paginate, thay khối dựng `nguoc` bằng đảo tại chỗ:
#   for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 { rows[i], rows[j] = rows[j], rows[i] }
#   nguoc := rows
go test ./internal/service/ -run TestChartsKhongBiAnhHuongBoiListGoiTruocDo -count=1
```

Expected: ĐỎ — `gọi List không được làm đổi kết quả Charts`. Khôi phục.

Nếu vẫn XANH: mỗi lần `Read` nạp lại từ DB nên lát cắt là mới toanh, và bất biến này chỉ thành thật khi hai lời gọi dùng chung một `ReadResult`. Trường hợp đó hãy ghi rõ "chưa falsify được, lý do: …" thay vì đánh dấu xong.

- [ ] **Step 7: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/trade.go backend/internal/service/trade_test.go
git commit -m "feat(trade): add stats and charts on top of the shared read pipeline"
```

---

### Task 6: Kiểm tra đầu vào khi tạo lệnh

**Files:**
- Modify: `backend/internal/service/trade.go`
- Modify: `backend/internal/service/trade_test.go`

**Interfaces:**
- Consumes: `TradeInput`, `Create` (Task 4); `domain.Valid`, `domain.Directions`, `domain.Timeframes`, `domain.EntryQualities`, `domain.InTradeQualities`, `domain.ExitQualities`, `domain.Psychologies`, `domain.DefaultSetup`.
- Produces: `Create` giờ trả `*apperr.Error` cho input hỏng; `func validateTradeInput(in *TradeInput) error`.

- [ ] **Step 1: Viết test ĐỎ**

Thêm vào cuối `backend/internal/service/trade_test.go`. Import thêm `"journal/internal/apperr"`:

```go
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
		"symbol rỗng":         func(in *service.TradeInput) { in.Symbol = "" },
		"symbol toàn dấu cách": func(in *service.TradeInput) { in.Symbol = "   " },
		"direction rỗng":      func(in *service.TradeInput) { in.Direction = "" },
		"direction lạ":        func(in *service.TradeInput) { in.Direction = "Sideways" },
		"timeframe lạ":        func(in *service.TradeInput) { in.Timeframe = "H3" },
		"entry_quality lạ":    func(in *service.TradeInput) { in.EntryQuality = "Tạm được" },
		"in_trade_quality lạ": func(in *service.TradeInput) { in.InTradeQuality = "Bình thường" },
		"exit_quality lạ":     func(in *service.TradeInput) { in.ExitQuality = "Chốt non" },
		"psychology lạ":       func(in *service.TradeInput) { in.Psychology = "Bình tĩnh" },
		"entered_at rỗng":     func(in *service.TradeInput) { in.EnteredAt = time.Time{} },
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
	require.Equal(t, time.UTC, tr.EnteredAt.Location())
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
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run TestCreate -count=1 2>&1 | tail -20`
Expected: FAIL — `symbol rỗng` và các case enum lạ đều báo `Error(...) should not be nil`, vì `Create` hiện chưa kiểm gì.

- [ ] **Step 3: Thêm kiểm tra vào `Create` trong `backend/internal/service/trade.go`**

Import thêm `"strings"`.

```go
// validateTradeInput kiểm và CHUẨN HOÁ tại chỗ.
//
// Nguyên tắc: kiểm đúng những gì migration 0001 đã ràng buộc, cộng những gì
// nghiệp vụ đòi. Không tự đặt thêm giới hạn không có trong schema — làm vậy
// là dựng một nguồn sự thật thứ hai, và hai nguồn sẽ trôi lệch nhau.
//
// Cố ý KHÔNG kiểm: dấu của profit (lỗ là số âm, hợp lệ), quan hệ entry/exit,
// và entered_at ở tương lai (ghi trước một lệnh đang mở là hợp lệ).
func validateTradeInput(in *TradeInput) error {
	if in.EnteredAt.IsZero() {
		return apperr.Validation("thời điểm vào lệnh không được để trống")
	}

	in.Symbol = strings.TrimSpace(in.Symbol)
	if in.Symbol == "" {
		return apperr.Validation("mã sản phẩm không được để trống")
	}

	if !domain.Valid(domain.Directions, in.Direction) {
		return apperr.Validation(`chiều lệnh phải là "Long" hoặc "Short"`)
	}

	// Bốn trường chấm điểm và timeframe CHO PHÉP rỗng: lệnh chưa đánh giá là
	// trạng thái hợp lệ (spec mẹ quyết định #8), khớp CHECK của 0001 vốn có
	// cả chuỗi rỗng trong danh sách.
	type oEnum struct {
		ten     string
		giaTri  string
		hopLe   []string
		thongDiep string
	}
	for _, o := range []oEnum{
		{"timeframe", in.Timeframe, domain.Timeframes, "khung thời gian không hợp lệ"},
		{"entry_quality", in.EntryQuality, domain.EntryQualities, "chất lượng vào lệnh không hợp lệ"},
		{"in_trade_quality", in.InTradeQuality, domain.InTradeQualities, "diễn biến trong lệnh không hợp lệ"},
		{"exit_quality", in.ExitQuality, domain.ExitQualities, "chất lượng thoát lệnh không hợp lệ"},
		{"psychology", in.Psychology, domain.Psychologies, "trạng thái tâm lý không hợp lệ"},
	} {
		if o.giaTri != "" && !domain.Valid(o.hopLe, o.giaTri) {
			return apperr.Validation(o.thongDiep)
		}
	}

	// Setup do người dùng tự đặt, không có CHECK. Rỗng thì về mặc định —
	// làm ở đây chứ không trông vào DEFAULT của cột, vì GORM luôn gửi mọi
	// cột nên DEFAULT không bao giờ được kích hoạt.
	in.Setup = strings.TrimSpace(in.Setup)
	if in.Setup == "" {
		in.Setup = domain.DefaultSetup
	}
	in.Notes = strings.TrimSpace(in.Notes)
	return nil
}
```

Rồi sửa `Create` — chèn hai dòng đầu, phần còn lại giữ nguyên:

```go
func (s *TradeService) Create(ctx context.Context, acc domain.Account, in TradeInput) (domain.Trade, error) {
	if err := validateTradeInput(&in); err != nil {
		return domain.Trade{}, err
	}
	created, err := s.trades.Create(ctx, domain.Trade{
		AccountID: acc.ID,
		EnteredAt: in.EnteredAt.UTC(),
		// ... giữ nguyên phần còn lại từ Task 4 ...
	})
	if err != nil {
		return domain.Trade{}, fmt.Errorf("tạo lệnh: %w", err)
	}
	return created, nil
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run TestCreate -count=1 -v 2>&1 | tail -30`
Expected: PASS, 20 test (10 subtest của input hỏng + 2 của profit + 8 test lẻ).

- [ ] **Step 5: FALSIFY việc cho phép enum rỗng**

```bash
cd backend
# Trong vòng lặp kiểm enum, bỏ điều kiện `o.giaTri != ""`:
#   if !domain.Valid(o.hopLe, o.giaTri) { return apperr.Validation(o.thongDiep) }
go test ./internal/service/ -run 'TestCreateChapNhanBonTruongChamDiemDeTrong|TestCreateChapNhanTimeframeRong' -count=1
```

Expected: ĐỎ — lệnh chưa chấm điểm bị từ chối, mà đó là trạng thái hợp lệ. Khôi phục.

Ghi chú: `domain.Timeframes` **không** chứa chuỗi rỗng (chỉ M1…W), trong khi CHECK của migration 0001 thì có. Điều kiện `o.giaTri != ""` chính là chỗ khớp hai bên lại.

- [ ] **Step 6: FALSIFY việc quy đổi `entered_at` về UTC**

```bash
cd backend
# Trong Create, đổi `EnteredAt: in.EnteredAt.UTC()` thành `EnteredAt: in.EnteredAt`
go test ./internal/service/ -run TestCreateQuyDoiEnteredAtVeUTC -count=1
```

Expected: ĐỎ — múi giờ trả về không phải UTC. Khôi phục.

- [ ] **Step 7: FALSIFY mặc định của `setup`**

```bash
cd backend
# Trong validateTradeInput, xoá khối `if in.Setup == "" { in.Setup = domain.DefaultSetup }`
go test ./internal/service/ -run TestCreateSetupRongThanhMacDinh -count=1
```

Expected: ĐỎ — nhận chuỗi rỗng thay vì `KHÔNG CÓ SETUP`. Khôi phục.

Đây cũng là bằng chứng cho ghi chú ở Task 4 Step 3: `DEFAULT` của cột **không** cứu được, vì GORM gửi mọi cột nên DB không bao giờ thấy cột vắng mặt.

- [ ] **Step 8: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/trade.go backend/internal/service/trade_test.go
git commit -m "feat(trade): validate trade input against the schema constraints"
```

---

### Task 7: `Tri[T]` và `Update` — PATCH phân biệt "vắng mặt" với "null"

**Files:**
- Create: `backend/internal/service/tri.go`, `backend/internal/service/tri_test.go`
- Modify: `backend/internal/service/trade.go`, `backend/internal/service/trade_test.go`

**Interfaces:**
- Consumes: `TradeRepo.UpdateFields` (Task 2), `validateTradeInput` (Task 6).
- Produces:
  - `type Tri[T any] struct { Set bool; Value *T }`
  - `func (t Tri[T]) Get() (*T, bool)`
  - `type TradePatch struct { ... }` — 16 trường, mỗi trường một `Tri`
  - `func (s *TradeService) Update(ctx context.Context, id int64, p TradePatch) error`

Bốn trường tiền là NULLable, nên PATCH cần **ba** trạng thái chứ không phải hai: khoá vắng mặt (giữ nguyên), khoá có mặt mang `null` (xoá giá trị), khoá có mặt mang số (đặt giá trị). Con trỏ thường chỉ diễn đạt được hai.

- [ ] **Step 1: Viết test ĐỎ cho `Tri`**

Tạo `backend/internal/service/tri_test.go`:

```go
package service_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

type hopThu struct {
	A service.Tri[string]  `json:"a"`
	B service.Tri[int]     `json:"b"`
}

func TestTriKhoaVangMatThiKhongSet(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"b":7}`), &h))

	require.False(t, h.A.Set, "khoá không có trong body thì Set phải là false")
	require.True(t, h.B.Set)
}

// Đây là lý do Tri tồn tại. Nếu "vắng mặt" và "null" cùng cho Value == nil
// mà không có cờ Set thì không cách nào phân biệt "đừng đụng vào trường này"
// với "xoá trường này đi".
func TestTriKhoaCoMatMangNullThiSetNhungValueNil(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":null}`), &h))

	require.True(t, h.A.Set, "khoá có mặt thì Set phải là true, kể cả khi giá trị là null")
	require.Nil(t, h.A.Value)
}

func TestTriKhoaCoMatMangGiaTri(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":"xin chao"}`), &h))

	require.True(t, h.A.Set)
	require.NotNil(t, h.A.Value)
	require.Equal(t, "xin chao", *h.A.Value)
}

func TestTriChuoiRongKhacVoiVangMat(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":""}`), &h))

	require.True(t, h.A.Set, "chuỗi rỗng là một giá trị, không phải sự vắng mặt")
	require.NotNil(t, h.A.Value)
	require.Equal(t, "", *h.A.Value)
}

func TestTriKieuSaiThiBaoLoi(t *testing.T) {
	var h hopThu
	require.Error(t, json.Unmarshal([]byte(`{"b":"khong-phai-so"}`), &h))
}

func TestTriGet(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":null,"b":3}`), &h))

	v, ok := h.A.Get()
	require.True(t, ok)
	require.Nil(t, v)

	n, ok := h.B.Get()
	require.True(t, ok)
	require.Equal(t, 3, *n)

	var chua service.Tri[string]
	_, ok = chua.Get()
	require.False(t, ok)
}
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run TestTri -count=1`
Expected: FAIL khi biên dịch — `undefined: service.Tri`.

- [ ] **Step 3: Viết `backend/internal/service/tri.go`**

```go
package service

import "encoding/json"

// Tri là một trường của PATCH với BA trạng thái, không phải hai:
//
//	Set=false            khoá vắng mặt trong body → giữ nguyên giá trị cũ
//	Set=true, Value=nil  khoá có mặt mang null    → xoá giá trị (về NULL)
//	Set=true, Value≠nil  khoá có mặt mang giá trị → đặt giá trị
//
// Con trỏ thường chỉ diễn đạt được hai trạng thái đầu, nên với bốn cột
// NULLable của bảng trades (entry, exit, volume, profit_theory) nó không đủ:
// "đừng đụng vào" và "xoá đi" sẽ trông y hệt nhau.
//
// encoding/json chỉ gọi UnmarshalJSON cho khoá CÓ MẶT trong body, nên Set
// đúng bằng "khoá có mặt" mà không cần đọc body hai lần.
type Tri[T any] struct {
	Set   bool
	Value *T
}

func (t *Tri[T]) UnmarshalJSON(b []byte) error {
	t.Set = true
	if string(b) == "null" {
		t.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	t.Value = &v
	return nil
}

// Get trả giá trị và cờ "có gửi lên không". Dùng nó thay vì đọc thẳng hai
// trường, để chỗ gọi buộc phải xử lý cả ba trạng thái.
func (t Tri[T]) Get() (*T, bool) {
	return t.Value, t.Set
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run TestTri -count=1`
Expected: PASS, 6 test.

- [ ] **Step 5: FALSIFY cờ `Set`**

```bash
cd backend
# Trong UnmarshalJSON, xoá dòng `t.Set = true`
go test ./internal/service/ -run 'TestTriKhoaCoMatMangNullThiSetNhungValueNil' -count=1
```

Expected: ĐỎ — `khoá có mặt thì Set phải là true`. Khôi phục.

- [ ] **Step 6: Viết test ĐỎ cho `Update`**

Thêm vào cuối `backend/internal/service/trade_test.go`:

```go
func nhan[T any](v T) service.Tri[T] { return service.Tri[T]{Set: true, Value: &v} }
func xoaTruong[T any]() service.Tri[T] { return service.Tri[T]{Set: true} }

func TestUpdateChiDoiTruongDuocGui(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{Notes: nhan("đã xem lại")}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, "đã xem lại", got.Notes)
	require.Equal(t, "XAUUSD", got.Symbol, "trường không gửi phải giữ nguyên")
	require.True(t, got.Profit.Equal(decimal.RequireFromString("100")))
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
func TestUpdatePhanBietVangMatVoiNull(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	in := inputHopLe()
	lt := decimal.RequireFromString("120")
	in.ProfitTheory = &lt
	tr, err := svc.Create(ctx, acc, in)
	require.NoError(t, err)
	require.NotNil(t, tr.ProfitTheory)

	// Không gửi profit_theory → giữ nguyên.
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{Notes: nhan("x")}))
	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.NotNil(t, got.ProfitTheory, "không gửi thì phải giữ nguyên")

	// Gửi null tường minh → xoá về NULL.
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		ProfitTheory: xoaTruong[decimal.Decimal](),
	}))
	got, err = svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Nil(t, got.ProfitTheory, "gửi null tường minh thì phải xoá giá trị")
}

func TestUpdateDatLaiTruongTienDaXoa(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{
		Entry: nhan(decimal.RequireFromString("2350.5")),
	}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.NotNil(t, got.Entry)
	require.True(t, got.Entry.Equal(decimal.RequireFromString("2350.5")))
}

func TestUpdateKhongDoiSTT(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	themLenh(t, svc, acc, "2026-06-08", "AAA", "10")
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)
	require.Equal(t, 2, tr.STT)

	moi, err := time.Parse(time.RFC3339, "2020-01-01T00:00:00Z")
	require.NoError(t, err)
	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{EnteredAt: nhan(moi)}))

	got, err := svc.ByID(ctx, tr.ID)
	require.NoError(t, err)
	require.Equal(t, 2, got.STT, "sửa entered_at KHÔNG đổi stt (spec mẹ §5.5)")
}

func TestUpdateTuChoiGiaTriEnumLa(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	err = svc.Update(ctx, tr.ID, service.TradePatch{Direction: nhan("Sideways")})

	require.Error(t, err)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestUpdateKhongGuiGiThiKhongLoi(t *testing.T) {
	svc, acc := boDoTrade(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	require.NoError(t, svc.Update(ctx, tr.ID, service.TradePatch{}))
}

func TestUpdateLenhKhongCoLa404(t *testing.T) {
	svc, _ := boDoTrade(t)

	err := svc.Update(context.Background(), 999999, service.TradePatch{Notes: nhan("x")})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}
```

- [ ] **Step 7: Viết `TradePatch` và `Update` trong `backend/internal/service/trade.go`**

```go
// TradePatch là input sửa lệnh. Mỗi trường ba trạng thái — xem Tri.
//
// Không có STT: sửa lệnh KHÔNG đổi thứ tự lũy kế (spec mẹ §5.5).
type TradePatch struct {
	EnteredAt      Tri[time.Time]
	Symbol         Tri[string]
	Direction      Tri[string]
	Entry          Tri[decimal.Decimal]
	Exit           Tri[decimal.Decimal]
	Volume         Tri[decimal.Decimal]
	Profit         Tri[decimal.Decimal]
	ProfitTheory   Tri[decimal.Decimal]
	Fee            Tri[decimal.Decimal]
	Setup          Tri[string]
	Timeframe      Tri[string]
	EntryQuality   Tri[string]
	InTradeQuality Tri[string]
	ExitQuality    Tri[string]
	Psychology     Tri[string]
	Notes          Tri[string]
}

// Update ghi đúng những cột được gửi lên.
func (s *TradeService) Update(ctx context.Context, id int64, p TradePatch) error {
	fields, err := patchToFields(p)
	if err != nil {
		return err
	}
	if len(fields) == 0 {
		return nil
	}
	if err := s.trades.UpdateFields(ctx, id, fields); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh")
		}
		return fmt.Errorf("sửa lệnh: %w", err)
	}
	return nil
}

// patchToFields đổi TradePatch thành map cột→giá trị, đồng thời kiểm giá trị.
//
// Bốn cột NULLable nhận thẳng `nil` khi Tri báo "có gửi, giá trị null" — đó
// là cách "xoá giá trị" đi tới được DB.
func patchToFields(p TradePatch) (map[string]any, error) {
	f := map[string]any{}

	if v, ok := p.EnteredAt.Get(); ok {
		if v == nil {
			return nil, apperr.Validation("thời điểm vào lệnh không được để trống")
		}
		f["entered_at"] = v.UTC()
	}
	if v, ok := p.Symbol.Get(); ok {
		if v == nil || strings.TrimSpace(*v) == "" {
			return nil, apperr.Validation("mã sản phẩm không được để trống")
		}
		f["symbol"] = strings.TrimSpace(*v)
	}
	if v, ok := p.Direction.Get(); ok {
		if v == nil || !domain.Valid(domain.Directions, *v) {
			return nil, apperr.Validation(`chiều lệnh phải là "Long" hoặc "Short"`)
		}
		f["direction"] = *v
	}
	if v, ok := p.Profit.Get(); ok {
		if v == nil {
			return nil, apperr.Validation("lãi lỗ không được để trống")
		}
		f["profit"] = *v
	}
	if v, ok := p.Fee.Get(); ok {
		if v == nil {
			return nil, apperr.Validation("phí không được để trống")
		}
		f["fee"] = *v
	}
	if v, ok := p.Setup.Get(); ok {
		ten := domain.DefaultSetup
		if v != nil && strings.TrimSpace(*v) != "" {
			ten = strings.TrimSpace(*v)
		}
		f["setup"] = ten
	}
	if v, ok := p.Notes.Get(); ok {
		ghi := ""
		if v != nil {
			ghi = strings.TrimSpace(*v)
		}
		f["notes"] = ghi
	}

	// Năm cột enum: rỗng là hợp lệ (lệnh chưa chấm điểm), null quy về rỗng
	// vì cột là NOT NULL DEFAULT ''.
	for _, e := range []struct {
		cot   string
		o     Tri[string]
		hopLe []string
		msg   string
	}{
		{"timeframe", p.Timeframe, domain.Timeframes, "khung thời gian không hợp lệ"},
		{"entry_quality", p.EntryQuality, domain.EntryQualities, "chất lượng vào lệnh không hợp lệ"},
		{"in_trade_quality", p.InTradeQuality, domain.InTradeQualities, "diễn biến trong lệnh không hợp lệ"},
		{"exit_quality", p.ExitQuality, domain.ExitQualities, "chất lượng thoát lệnh không hợp lệ"},
		{"psychology", p.Psychology, domain.Psychologies, "trạng thái tâm lý không hợp lệ"},
	} {
		v, ok := e.o.Get()
		if !ok {
			continue
		}
		giaTri := ""
		if v != nil {
			giaTri = *v
		}
		if giaTri != "" && !domain.Valid(e.hopLe, giaTri) {
			return nil, apperr.Validation(e.msg)
		}
		f[e.cot] = giaTri
	}

	// Bốn cột NULLable: nil đi thẳng xuống DB thành NULL.
	for _, n := range []struct {
		cot string
		o   Tri[decimal.Decimal]
	}{
		{"entry", p.Entry},
		{"exit", p.Exit},
		{"volume", p.Volume},
		{"profit_theory", p.ProfitTheory},
	} {
		v, ok := n.o.Get()
		if !ok {
			continue
		}
		if v == nil {
			f[n.cot] = nil
			continue
		}
		f[n.cot] = *v
	}
	return f, nil
}

// ByID nạp một lệnh, kể cả lệnh đã ở thùng rác.
func (s *TradeService) ByID(ctx context.Context, id int64) (domain.Trade, error) {
	t, err := s.trades.ByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.Trade{}, apperr.NotFound("không tìm thấy lệnh")
		}
		return domain.Trade{}, fmt.Errorf("tìm lệnh: %w", err)
	}
	return t, nil
}
```

- [ ] **Step 8: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run 'TestUpdate|TestTri' -count=1 -v 2>&1 | tail -25`
Expected: PASS, 13 test.

- [ ] **Step 9: FALSIFY ba trạng thái của PATCH**

```bash
cd backend
# Trong patchToFields, ở vòng lặp bốn cột NULLable, đổi:
#   if v == nil { f[n.cot] = nil; continue }
# thành:
#   if v == nil { continue }
go test ./internal/service/ -run TestUpdatePhanBietVangMatVoiNull -count=1
```

Expected: ĐỎ — `gửi null tường minh thì phải xoá giá trị`. Khôi phục.

- [ ] **Step 10: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/tri.go backend/internal/service/tri_test.go \
        backend/internal/service/trade.go backend/internal/service/trade_test.go
git commit -m "feat(trade): add three-state patch so null clears a value and absence keeps it"
```

---

### Task 8: Quyền sở hữu, khôi phục, thùng rác

**Files:**
- Modify: `backend/internal/service/trade.go`, `backend/internal/service/trade_test.go`

**Interfaces:**
- Consumes: `AccountService.ForUser`, `TradeRepo.Restore`, `TradeRepo.ListDeletedByAccount`.
- Produces:
  - `func (s *TradeService) ForUser(ctx context.Context, userID, tradeID int64) (domain.Trade, domain.Account, error)`
  - `func (s *TradeService) Restore(ctx context.Context, id int64) error`
  - `func (s *TradeService) Trash(ctx context.Context, accountID int64) ([]domain.Trade, error)`

- [ ] **Step 1: Viết test ĐỎ**

Thêm vào cuối `backend/internal/service/trade_test.go`:

```go
// haiChu dựng hai user, mỗi người một account, dùng chung một TradeService.
func haiChu(t *testing.T) (*service.TradeService, domain.Account, int64, int64) {
	t.Helper()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	ctx := context.Background()
	a, err := users.Create(ctx, "a@example.com", "hash")
	require.NoError(t, err)
	b, err := users.Create(ctx, "b@example.com", "hash")
	require.NoError(t, err)

	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	accA, err := accountSvc.Create(ctx, a.ID, service.AccountCreate{
		Code: "A1", Name: "", Currency: "USD", Timezone: "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	})
	require.NoError(t, err)

	svc := service.NewTradeService(repository.NewTradeRepo(db), repository.NewCashFlowRepo(db), accountSvc)
	return svc, accA, a.ID, b.ID
}

func TestForUserTraVeCaLenhVaAccount(t *testing.T) {
	svc, acc, userA, _ := haiChu(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
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
func TestForUserLenhCuaNguoiKhacLa403(t *testing.T) {
	svc, acc, _, userB := haiChu(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	_, _, err = svc.ForUser(ctx, userB, tr.ID)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
}

func TestForUserLenhKhongTonTaiLa404(t *testing.T) {
	svc, _, userA, _ := haiChu(t)

	_, _, err := svc.ForUser(context.Background(), userA, 999999)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// Lệnh trong thùng rác vẫn phải qua được ForUser, nếu không thì không ai
// khôi phục được gì.
func TestForUserVanNapDuocLenhDaXoa(t *testing.T) {
	svc, acc, userA, _ := haiChu(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, tr.ID))

	got, _, err := svc.ForUser(ctx, userA, tr.ID)

	require.NoError(t, err)
	require.Equal(t, tr.ID, got.ID)
}

func TestTrashChiChuaLenhDaXoa(t *testing.T) {
	svc, acc, _, _ := haiChu(t)
	ctx := context.Background()
	giu, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)
	in := inputHopLe()
	in.Symbol = "BODI"
	bo, err := svc.Create(ctx, acc, in)
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, bo.ID))

	rac, err := svc.Trash(ctx, acc.ID)

	require.NoError(t, err)
	require.NotNil(t, rac, "phải là [] chứ không phải null")
	require.Len(t, rac, 1)
	require.Equal(t, bo.ID, rac[0].ID)
	require.NotEqual(t, giu.ID, rac[0].ID)
}

func TestTrashRongTraMangRong(t *testing.T) {
	svc, acc, _, _ := haiChu(t)

	rac, err := svc.Trash(context.Background(), acc.ID)

	require.NoError(t, err)
	require.NotNil(t, rac)
	require.Empty(t, rac)
}

// Khôi phục đưa lệnh trở lại GIỮA dãy stt, nên lũy kế của mọi lệnh sau nó
// đều đổi. Đó là hành vi đúng — số nhảy không phải lỗi.
func TestRestoreDuaLenhVeDungChoVaDoiLuyKe(t *testing.T) {
	svc, acc, _, _ := haiChu(t)
	ctx := context.Background()
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-06-09", "BBB", "50")
	themLenh(t, svc, acc, "2026-06-10", "CCC", "25")

	truoc, err := svc.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	giua := truoc.All[1].Trade.ID

	require.NoError(t, svc.Delete(ctx, giua))
	sauXoa, err := svc.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, sauXoa.All, 2)
	require.True(t, sauXoa.All[1].CumByTrade.Equal(decimal.RequireFromString("125")))

	require.NoError(t, svc.Restore(ctx, giua))

	sauKhoiPhuc, err := svc.Read(ctx, acc, service.Filter{})
	require.NoError(t, err)
	require.Len(t, sauKhoiPhuc.All, 3)
	require.Equal(t, []int{1, 2, 3}, []int{
		sauKhoiPhuc.All[0].Trade.STT,
		sauKhoiPhuc.All[1].Trade.STT,
		sauKhoiPhuc.All[2].Trade.STT,
	}, "lệnh khôi phục về đúng chỗ cũ trong dãy, không phải về cuối")
	require.True(t, sauKhoiPhuc.All[2].CumByTrade.Equal(decimal.RequireFromString("175")),
		"lũy kế của lệnh cuối quay lại giá trị ban đầu, nhận %s", sauKhoiPhuc.All[2].CumByTrade)
}

func TestRestoreLenhChuaXoaLa404(t *testing.T) {
	svc, acc, _, _ := haiChu(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)

	err = svc.Restore(ctx, tr.ID)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

func TestDeleteHaiLanLanSauLa404(t *testing.T) {
	svc, acc, _, _ := haiChu(t)
	ctx := context.Background()
	tr, err := svc.Create(ctx, acc, inputHopLe())
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, tr.ID))

	e := apperr.As(svc.Delete(ctx, tr.ID))
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd backend && go test ./internal/service/ -run 'TestForUser|TestTrash|TestRestore' -count=1`
Expected: FAIL khi biên dịch — `svc.ForUser undefined`.

- [ ] **Step 3: Thêm ba method vào `backend/internal/service/trade.go`**

```go
// ForUser nạp lệnh và account của nó, sau khi xác nhận account thuộc về user.
//
// Trả CẢ account vì handler nào cũng cần nó: Enrich đòi timezone, DTO đòi
// currency. Nạp lại account ở tầng trên là một truy vấn thừa mỗi request.
//
// Lệnh trong thùng rác vẫn nạp được — nếu không thì Restore không hoạt động.
func (s *TradeService) ForUser(ctx context.Context, userID, tradeID int64) (domain.Trade, domain.Account, error) {
	t, err := s.ByID(ctx, tradeID)
	if err != nil {
		return domain.Trade{}, domain.Account{}, err
	}
	// ForUser của AccountService trả 403 khi account thuộc user khác, 404 khi
	// account không tồn tại. Bám đúng tiền lệ đó thay vì tự chế mã lỗi mới.
	acc, err := s.accounts.ForUser(ctx, userID, t.AccountID)
	if err != nil {
		return domain.Trade{}, domain.Account{}, err
	}
	return t, acc, nil
}

// Restore đưa lệnh ra khỏi thùng rác.
//
// Lệnh quay lại đúng vị trí cũ trong dãy stt, nên lũy kế của MỌI lệnh sau nó
// đều đổi. Đó là hành vi đúng, không phải tác dụng phụ.
func (s *TradeService) Restore(ctx context.Context, id int64) error {
	if err := s.trades.Restore(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh đã xoá")
		}
		return fmt.Errorf("khôi phục lệnh: %w", err)
	}
	return nil
}

// Trash liệt kê lệnh trong thùng rác. KHÔNG Enrich: lệnh đã xoá không nằm
// trong dãy lũy kế, nên mọi trường suy diễn của nó đều vô nghĩa.
func (s *TradeService) Trash(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	rows, err := s.trades.ListDeletedByAccount(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê thùng rác: %w", err)
	}
	if rows == nil {
		rows = []domain.Trade{}
	}
	return rows, nil
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/service/ -run 'TestForUser|TestTrash|TestRestore|TestDelete' -count=1 -v 2>&1 | tail -20`
Expected: PASS, 9 test.

- [ ] **Step 5: FALSIFY kiểm quyền sở hữu**

```bash
cd backend
# Trong ForUser, bỏ lời gọi s.accounts.ForUser và trả account rỗng:
#   return t, domain.Account{}, nil
go test ./internal/service/ -run TestForUserLenhCuaNguoiKhacLa403 -count=1
```

Expected: ĐỎ — user B đọc được lệnh của user A. Khôi phục.

- [ ] **Step 6: FALSIFY việc `ByID` nạp được lệnh đã xoá**

```bash
cd backend
# Trong repository/trade.go, thêm điều kiện vào ByID:
#   Where("id = ? AND deleted_at IS NULL", id)
go test ./internal/service/ -run 'TestForUserVanNapDuocLenhDaXoa' -count=1
```

Expected: ĐỎ — không nạp được lệnh trong thùng rác, nên không khôi phục được. Khôi phục.

- [ ] **Step 7: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/service/trade.go backend/internal/service/trade_test.go
git commit -m "feat(trade): add ownership check, restore and trash listing"
```

---

### Task 9: DTO và middleware `RequireTrade`

**Files:**
- Create: `backend/internal/httpapi/trade_dto.go`
- Modify: `backend/internal/httpapi/middleware.go`
- Create: `backend/internal/httpapi/trade_dto_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched`, `metrics.KPI`, `service.TradeService.ForUser`.
- Produces:
  - `func toTradeDTO(e metrics.Enriched) tradeDTO`, `func toTradeDTOs(rows []metrics.Enriched) []tradeDTO`
  - `func toDeletedTradeDTOs(rows []domain.Trade) []deletedTradeDTO`
  - `func toStatsDTO(k metrics.KPI) statsDTO`
  - `type tradeCreateRequest`, `type tradePatchRequest`
  - `func RequireTrade(svc *service.TradeService) func(http.Handler) http.Handler`
  - `func Trade(ctx context.Context) domain.Trade`

- [ ] **Step 1: Viết `backend/internal/httpapi/trade_dto.go`**

```go
package httpapi

import (
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/service"
)

// tradeDTO là hợp đồng của một lệnh: 17 trường input, cộng id/account_id/stt,
// cộng toàn bộ trường suy diễn.
//
// Phẳng chứ không lồng — frontend hiển thị bảng, mỗi cột một trường; lồng
// thêm một tầng chỉ để "gọn" sẽ bắt mọi chỗ dùng phải tự mở ra.
//
// Mọi trường tiền là CHUỖI JSON: decimal.Decimal của shopspring marshal ra
// chuỗi, và đó chính là lý do frontend không mất chữ số.
type tradeDTO struct {
	ID        int64  `json:"id"`
	AccountID int64  `json:"account_id"`
	STT       int    `json:"stt"`
	EnteredAt string `json:"entered_at"`

	Symbol       string           `json:"symbol"`
	Direction    string           `json:"direction"`
	Entry        *decimal.Decimal `json:"entry"`
	Exit         *decimal.Decimal `json:"exit"`
	Volume       *decimal.Decimal `json:"volume"`
	Profit       decimal.Decimal  `json:"profit"`
	ProfitTheory *decimal.Decimal `json:"profit_theory"`
	Fee          decimal.Decimal  `json:"fee"`

	Setup          string `json:"setup"`
	Timeframe      string `json:"timeframe"`
	EntryQuality   string `json:"entry_quality"`
	InTradeQuality string `json:"in_trade_quality"`
	ExitQuality    string `json:"exit_quality"`
	Psychology     string `json:"psychology"`
	Notes          string `json:"notes"`

	Net     decimal.Decimal `json:"net"`
	WinLoss int             `json:"win_loss"`
	WinSign int             `json:"win_sign"`

	ScoreEntry   int    `json:"score_entry"`
	ScoreInTrade int    `json:"score_in_trade"`
	ScoreExit    int    `json:"score_exit"`
	ScorePsych   int    `json:"score_psych"`
	ScoreTotal   *int   `json:"score_total"`
	TradeClass   string `json:"trade_class"`

	Day      string `json:"day"`
	Week     string `json:"week"`
	WeekSort string `json:"week_sort"`
	Month    string `json:"month"`
	Weekday  string `json:"weekday"`

	CumByTrade  decimal.Decimal `json:"cum_by_trade"`
	CumByDay    decimal.Decimal `json:"cum_by_day"`
	CumTheory   decimal.Decimal `json:"cum_theory"`
	RunningPeak decimal.Decimal `json:"running_peak"`
	Drawdown    decimal.Decimal `json:"drawdown"`
}

func toTradeDTO(e metrics.Enriched) tradeDTO {
	t := e.Trade
	return tradeDTO{
		ID:        t.ID,
		AccountID: t.AccountID,
		STT:       t.STT,
		// RFC3339 ở UTC. Frontend đổi sang giờ account để hiển thị; gửi kèm
		// offset là điều kiện để nó làm được việc đó.
		EnteredAt: t.EnteredAt.UTC().Format(time.RFC3339),

		Symbol:       t.Symbol,
		Direction:    t.Direction,
		Entry:        t.Entry,
		Exit:         t.Exit,
		Volume:       t.Volume,
		Profit:       t.Profit,
		ProfitTheory: t.ProfitTheory,
		Fee:          t.Fee,

		Setup:          t.Setup,
		Timeframe:      t.Timeframe,
		EntryQuality:   t.EntryQuality,
		InTradeQuality: t.InTradeQuality,
		ExitQuality:    t.ExitQuality,
		Psychology:     t.Psychology,
		Notes:          t.Notes,

		Net:     e.Net,
		WinLoss: e.WinLoss,
		WinSign: e.WinSign,

		ScoreEntry:   e.ScoreEntry,
		ScoreInTrade: e.ScoreInTrade,
		ScoreExit:    e.ScoreExit,
		ScorePsych:   e.ScorePsych,
		ScoreTotal:   e.ScoreTotal,
		TradeClass:   e.TradeClass,

		Day:      e.Day,
		Week:     e.Week,
		WeekSort: e.WeekSort,
		Month:    e.Month,
		Weekday:  e.Weekday,

		CumByTrade:  e.CumByTrade,
		CumByDay:    e.CumByDay,
		CumTheory:   e.CumTheory,
		RunningPeak: e.RunningPeak,
		Drawdown:    e.Drawdown,
	}
}

func toTradeDTOs(rows []metrics.Enriched) []tradeDTO {
	// Slice rỗng chứ không nil: JSON phải là [] chứ không phải null.
	out := make([]tradeDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, toTradeDTO(r))
	}
	return out
}

// deletedTradeDTO là lệnh trong thùng rác — CHỈ trường input.
//
// Không có trường suy diễn, và đó là chủ ý: lệnh đã xoá không nằm trong dãy
// lũy kế, nên cum_by_trade hay drawdown của nó không có nghĩa gì. Trả về số 0
// sẽ trông như một con số thật.
type deletedTradeDTO struct {
	ID        int64           `json:"id"`
	AccountID int64           `json:"account_id"`
	STT       int             `json:"stt"`
	EnteredAt string          `json:"entered_at"`
	Symbol    string          `json:"symbol"`
	Direction string          `json:"direction"`
	Profit    decimal.Decimal `json:"profit"`
	Fee       decimal.Decimal `json:"fee"`
	Setup     string          `json:"setup"`
	Notes     string          `json:"notes"`
}

func toDeletedTradeDTOs(rows []domain.Trade) []deletedTradeDTO {
	out := make([]deletedTradeDTO, 0, len(rows))
	for _, t := range rows {
		out = append(out, deletedTradeDTO{
			ID:        t.ID,
			AccountID: t.AccountID,
			STT:       t.STT,
			EnteredAt: t.EnteredAt.UTC().Format(time.RFC3339),
			Symbol:    t.Symbol,
			Direction: t.Direction,
			Profit:    t.Profit,
			Fee:       t.Fee,
			Setup:     t.Setup,
			Notes:     t.Notes,
		})
	}
	return out
}

// tradePageDTO bọc một trang danh sách.
type tradePageDTO struct {
	Items []tradeDTO `json:"items"`
	Page  int        `json:"page"`
	Size  int        `json:"size"`
	Total int        `json:"total"`
}

// statsDTO ánh xạ 1-1 từ metrics.KPI.
//
// Con trỏ ra null khi không tính được — chưa có lệnh thua thì profit_factor
// là null chứ KHÔNG phải 0. Số 0 ở đây sẽ được đọc thành "hệ số lợi nhuận
// bằng không", tức thua sạch, ngược hẳn sự thật.
type statsDTO struct {
	TotalWin  decimal.Decimal `json:"total_win"`
	TotalLoss decimal.Decimal `json:"total_loss"`
	NetProfit decimal.Decimal `json:"net_profit"`
	TotalFees decimal.Decimal `json:"total_fees"`

	NetReturnPct *decimal.Decimal `json:"net_return_pct"`
	ProfitFactor *decimal.Decimal `json:"profit_factor"`

	WinCount    int              `json:"win_count"`
	LossCount   int              `json:"loss_count"`
	TotalTrades int              `json:"total_trades"`
	WinPct      *decimal.Decimal `json:"win_pct"`

	AveWin  *decimal.Decimal `json:"ave_win"`
	AveLoss *decimal.Decimal `json:"ave_loss"`

	BiggestWinner *decimal.Decimal `json:"biggest_winner"`
	BiggestLoser  *decimal.Decimal `json:"biggest_loser"`

	OneR         decimal.Decimal  `json:"one_r"`
	BiggestRWin  *decimal.Decimal `json:"biggest_r_win"`
	BiggestRLoss *decimal.Decimal `json:"biggest_r_loss"`
	RRActual     *decimal.Decimal `json:"rr_actual"`

	Expectancy *decimal.Decimal `json:"expectancy"`

	MaxDrawdown    decimal.Decimal  `json:"max_drawdown"`
	MaxDDPct       *decimal.Decimal `json:"max_dd_pct"`
	RecoveryFactor *decimal.Decimal `json:"recovery_factor"`

	CurrentBalance decimal.Decimal `json:"current_balance"`
}

func toStatsDTO(k metrics.KPI) statsDTO {
	return statsDTO{
		TotalWin: k.TotalWin, TotalLoss: k.TotalLoss, NetProfit: k.NetProfit, TotalFees: k.TotalFees,
		NetReturnPct: k.NetReturnPct, ProfitFactor: k.ProfitFactor,
		WinCount: k.WinCount, LossCount: k.LossCount, TotalTrades: k.TotalTrades, WinPct: k.WinPct,
		AveWin: k.AveWin, AveLoss: k.AveLoss,
		BiggestWinner: k.BiggestWinner, BiggestLoser: k.BiggestLoser,
		OneR: k.OneR, BiggestRWin: k.BiggestRWin, BiggestRLoss: k.BiggestRLoss, RRActual: k.RRActual,
		Expectancy:  k.Expectancy,
		MaxDrawdown: k.MaxDrawdown, MaxDDPct: k.MaxDDPct, RecoveryFactor: k.RecoveryFactor,
		CurrentBalance: k.CurrentBalance,
	}
}

// tradeCreateRequest là body của POST.
//
// STT có mặt và CỐ Ý không được đọc tới. Quy tắc 7 của CLAUDE.md nói "frontend
// gửi lên thì bỏ qua", mà DecodeJSON đang bật DisallowUnknownFields — bỏ
// trường này đi thì client gửi `stt` sẽ ăn 400 chứ không phải bị bỏ qua.
type tradeCreateRequest struct {
	STT            int              `json:"stt"`
	EnteredAt      time.Time        `json:"entered_at"`
	Symbol         string           `json:"symbol"`
	Direction      string           `json:"direction"`
	Entry          *decimal.Decimal `json:"entry"`
	Exit           *decimal.Decimal `json:"exit"`
	Volume         *decimal.Decimal `json:"volume"`
	Profit         decimal.Decimal  `json:"profit"`
	ProfitTheory   *decimal.Decimal `json:"profit_theory"`
	Fee            decimal.Decimal  `json:"fee"`
	Setup          string           `json:"setup"`
	Timeframe      string           `json:"timeframe"`
	EntryQuality   string           `json:"entry_quality"`
	InTradeQuality string           `json:"in_trade_quality"`
	ExitQuality    string           `json:"exit_quality"`
	Psychology     string           `json:"psychology"`
	Notes          string           `json:"notes"`
}

func (r tradeCreateRequest) toInput() service.TradeInput {
	return service.TradeInput{
		EnteredAt: r.EnteredAt, Symbol: r.Symbol, Direction: r.Direction,
		Entry: r.Entry, Exit: r.Exit, Volume: r.Volume,
		Profit: r.Profit, ProfitTheory: r.ProfitTheory, Fee: r.Fee,
		Setup: r.Setup, Timeframe: r.Timeframe,
		EntryQuality: r.EntryQuality, InTradeQuality: r.InTradeQuality,
		ExitQuality: r.ExitQuality, Psychology: r.Psychology, Notes: r.Notes,
	}
}

// tradePatchRequest dùng service.Tri cho mọi trường: khoá vắng mặt, khoá mang
// null và khoá mang giá trị là ba chuyện khác nhau.
type tradePatchRequest struct {
	EnteredAt      service.Tri[time.Time]       `json:"entered_at"`
	Symbol         service.Tri[string]          `json:"symbol"`
	Direction      service.Tri[string]          `json:"direction"`
	Entry          service.Tri[decimal.Decimal] `json:"entry"`
	Exit           service.Tri[decimal.Decimal] `json:"exit"`
	Volume         service.Tri[decimal.Decimal] `json:"volume"`
	Profit         service.Tri[decimal.Decimal] `json:"profit"`
	ProfitTheory   service.Tri[decimal.Decimal] `json:"profit_theory"`
	Fee            service.Tri[decimal.Decimal] `json:"fee"`
	Setup          service.Tri[string]          `json:"setup"`
	Timeframe      service.Tri[string]          `json:"timeframe"`
	EntryQuality   service.Tri[string]          `json:"entry_quality"`
	InTradeQuality service.Tri[string]          `json:"in_trade_quality"`
	ExitQuality    service.Tri[string]          `json:"exit_quality"`
	Psychology     service.Tri[string]          `json:"psychology"`
	Notes          service.Tri[string]          `json:"notes"`
}

func (r tradePatchRequest) toPatch() service.TradePatch {
	return service.TradePatch{
		EnteredAt: r.EnteredAt, Symbol: r.Symbol, Direction: r.Direction,
		Entry: r.Entry, Exit: r.Exit, Volume: r.Volume,
		Profit: r.Profit, ProfitTheory: r.ProfitTheory, Fee: r.Fee,
		Setup: r.Setup, Timeframe: r.Timeframe,
		EntryQuality: r.EntryQuality, InTradeQuality: r.InTradeQuality,
		ExitQuality: r.ExitQuality, Psychology: r.Psychology, Notes: r.Notes,
	}
}
```

- [ ] **Step 2: Thêm `RequireTrade` vào `backend/internal/httpapi/middleware.go`**

Sửa khối `const` thành:

```go
const (
	ctxKeyUserID ctxKey = iota
	ctxKeyAccount
	ctxKeyTrade
)
```

Thêm vào cuối file, trước `CORS`:

```go
// RequireTrade nạp lệnh theo :id, kiểm quyền sở hữu, rồi đặt CẢ lệnh và
// account của nó vào context.
//
// Đặt luôn account vì handler nào cũng cần: Enrich đòi timezone, DTO đòi
// currency. Nhờ vậy nhánh /trades/{id} dùng được Account(ctx) y hệt nhánh
// /accounts/{id}, và không handler nào phải nạp lại account.
func RequireTrade(svc *service.TradeService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
			if err != nil {
				Fail(w, http.StatusBadRequest, 1400, "id lệnh không hợp lệ")
				return
			}
			t, acc, err := svc.ForUser(r.Context(), UserID(r.Context()), id)
			if err != nil {
				FailErr(w, r, err)
				return
			}
			ctx := context.WithValue(r.Context(), ctxKeyTrade, t)
			ctx = context.WithValue(ctx, ctxKeyAccount, acc)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Trade lấy lệnh đã kiểm quyền sở hữu. Chỉ gọi được sau RequireTrade.
func Trade(ctx context.Context) domain.Trade {
	t, _ := ctx.Value(ctxKeyTrade).(domain.Trade)
	return t
}
```

- [ ] **Step 3: Viết test cho DTO**

Tạo `backend/internal/httpapi/trade_dto_test.go`:

```go
package httpapi

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// Tiền phải ra CHUỖI JSON, không phải số. Số JSON là float64 ở phía nhận,
// và 0.1 + 0.2 ở đó không bằng 0.3 — đúng thứ NUMERIC sinh ra để tránh.
func TestTradeDTOTienLaChuoiKhongPhaiSo(t *testing.T) {
	e := metrics.Enriched{
		Trade: domain.Trade{
			EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
			Profit:    decimal.RequireFromString("12345678901234567890.12"),
			Fee:       decimal.RequireFromString("2.00"),
		},
		Net: decimal.RequireFromString("12345678901234567888.12"),
	}

	b, err := json.Marshal(toTradeDTO(e))
	require.NoError(t, err)

	require.Contains(t, string(b), `"profit":"12345678901234567890.12"`,
		"phải là chuỗi có dấu nháy, và không được mất chữ số")
	require.Contains(t, string(b), `"net":"12345678901234567888.12"`)
}

func TestTradeDTOTruongChuaNhapRaNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Now().UTC()},
	}))
	require.NoError(t, err)

	for _, khoa := range []string{`"entry":null`, `"exit":null`, `"volume":null`,
		`"profit_theory":null`, `"score_total":null`} {
		require.Contains(t, string(b), khoa)
	}
}

func TestTradeDTOEnteredAtLaRFC3339UTC(t *testing.T) {
	vn := time.FixedZone("ICT", 7*3600)
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Date(2026, 6, 10, 6, 0, 0, 0, vn)},
	}))
	require.NoError(t, err)

	require.Contains(t, string(b), `"entered_at":"2026-06-09T23:00:00Z"`,
		"gửi ra UTC kèm offset để frontend tự đổi sang giờ account")
}

func TestTradeDTOsDanhSachRongRaMangRongChuKhongNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

func TestDeletedTradeDTOsDanhSachRongRaMangRong(t *testing.T) {
	b, err := json.Marshal(toDeletedTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

// KPI chưa tính được phải ra null. Số 0 ở đây bị đọc thành "hệ số lợi nhuận
// bằng không", tức thua sạch — ngược hẳn sự thật là "chưa đủ dữ liệu".
func TestStatsDTOChiSoChuaTinhDuocRaNull(t *testing.T) {
	b, err := json.Marshal(toStatsDTO(metrics.KPI{}))
	require.NoError(t, err)

	for _, khoa := range []string{`"profit_factor":null`, `"win_pct":null`,
		`"ave_win":null`, `"expectancy":null`, `"rr_actual":null`} {
		require.Contains(t, string(b), khoa)
	}
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/httpapi/ -run 'TestTradeDTO|TestDeletedTrade|TestStatsDTO' -count=1 -v 2>&1 | tail -20`
Expected: PASS, 6 test.

- [ ] **Step 5: FALSIFY việc tiền ra chuỗi**

```bash
cd backend
# Trong tradeDTO, đổi `Profit decimal.Decimal` thành `Profit float64` và
# trong toTradeDTO đổi thành `Profit: t.Profit.InexactFloat64()`
go test ./internal/httpapi/ -run TestTradeDTOTienLaChuoiKhongPhaiSo -count=1
```

Expected: ĐỎ — `"profit":12345678901234567000` (số, và mất bốn chữ số). Khôi phục.

Đây đúng là lỗi mà quy tắc "tiền là decimal" sinh ra để chặn, và nó im lặng: không có lỗi nào bật ra, chỉ có con số sai.

- [ ] **Step 6: FALSIFY mảng rỗng khác null**

```bash
cd backend
# Trong toTradeDTOs, đổi `out := make([]tradeDTO, 0, len(rows))` thành `var out []tradeDTO`
go test ./internal/httpapi/ -run TestTradeDTOsDanhSachRongRaMangRongChuKhongNull -count=1
```

Expected: ĐỎ — `expected: "[]", actual: "null"`. Khôi phục.

- [ ] **Step 7: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/httpapi/trade_dto.go backend/internal/httpapi/trade_dto_test.go \
        backend/internal/httpapi/middleware.go
git commit -m "feat(trade): add trade DTOs and the RequireTrade ownership middleware"
```

---

### Task 10: Handler và route

**Files:**
- Create: `backend/internal/httpapi/trade_handler.go`
- Modify: `backend/internal/httpapi/router.go`
- Modify: `backend/cmd/api/main.go`

**Interfaces:**
- Consumes: `TradeService` (Task 4–8), DTO và `RequireTrade` (Task 9).
- Produces: `type TradeHandler`; 9 route hoạt động; `Deps.Trade *service.TradeService`.

- [ ] **Step 1: Viết `backend/internal/httpapi/trade_handler.go`**

```go
package httpapi

import (
	"net/http"
	"strconv"

	"journal/internal/service"
)

type TradeHandler struct{ svc *service.TradeService }

// filterFromQuery đọc bộ lọc từ query string. Không kiểm giá trị: một
// `?symbol=KHONGCO` chỉ nên trả danh sách rỗng, không nên trả lỗi.
func filterFromQuery(r *http.Request) service.Filter {
	q := r.URL.Query()
	return service.Filter{
		From:       q.Get("from"),
		To:         q.Get("to"),
		Setup:      q.Get("setup"),
		Symbol:     q.Get("symbol"),
		Timeframe:  q.Get("timeframe"),
		Direction:  q.Get("direction"),
		TradeClass: q.Get("trade_class"),
	}.Normalize()
}

// soNguyen đọc một tham số số. Giá trị hỏng cho 0, và service kẹp 0 về mặc
// định — một query string gõ nhầm không nên làm gãy cả trang danh sách.
func soNguyen(r *http.Request, ten string) int {
	n, err := strconv.Atoi(r.URL.Query().Get(ten))
	if err != nil {
		return 0
	}
	return n
}

func (h *TradeHandler) List(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.List(r.Context(), Account(r.Context()), filterFromQuery(r),
		soNguyen(r, "page"), soNguyen(r, "size"))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, tradePageDTO{
		Items: toTradeDTOs(p.Items),
		Page:  p.Page,
		Size:  p.Size,
		Total: p.Total,
	})
}

func (h *TradeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req tradeCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		// entered_at thiếu offset rơi vào đây: encoding/json không parse được
		// "2026-06-09T12:00:00" thành time.Time, nên trả 400/1400.
		FailErr(w, r, err)
		return
	}
	acc := Account(r.Context())
	created, err := h.svc.Create(r.Context(), acc, req.toInput())
	if err != nil {
		FailErr(w, r, err)
		return
	}
	// Trả lệnh vừa tạo ĐÃ làm giàu: frontend chèn thẳng vào bảng mà không
	// phải gọi lại danh sách. Đọc lại từ Read vì lũy kế của lệnh mới phụ
	// thuộc toàn bộ dãy trước nó.
	h.traLenh(w, r, acc, created.ID)
}

func (h *TradeHandler) Get(w http.ResponseWriter, r *http.Request) {
	t := Trade(r.Context())
	h.traLenh(w, r, Account(r.Context()), t.ID)
}

func (h *TradeHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req tradePatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	t := Trade(r.Context())
	if err := h.svc.Update(r.Context(), t.ID, req.toPatch()); err != nil {
		FailErr(w, r, err)
		return
	}
	h.traLenh(w, r, Account(r.Context()), t.ID)
}

func (h *TradeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Delete(r.Context(), Trade(r.Context()).ID); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}

func (h *TradeHandler) Restore(w http.ResponseWriter, r *http.Request) {
	t := Trade(r.Context())
	if err := h.svc.Restore(r.Context(), t.ID); err != nil {
		FailErr(w, r, err)
		return
	}
	h.traLenh(w, r, Account(r.Context()), t.ID)
}

func (h *TradeHandler) Trash(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.Trash(r.Context(), Account(r.Context()).ID)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toDeletedTradeDTOs(rows))
}

func (h *TradeHandler) Stats(w http.ResponseWriter, r *http.Request) {
	k, err := h.svc.Stats(r.Context(), Account(r.Context()), filterFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toStatsDTO(k))
}

// Charts marshal thẳng aggregate.Charts — nó đã mang sẵn json tag từ Phase 1.
// Hình dạng JSON được ghim bằng golden test ở Task 12, thứ mà một tầng DTO
// 1-1 cũng chỉ làm được đúng như vậy nhưng tốn 200 dòng có thể trôi lệch.
func (h *TradeHandler) Charts(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.Charts(r.Context(), Account(r.Context()), filterFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, c)
}

// traLenh đọc lại một lệnh KÈM trường suy diễn.
//
// Phải đi qua Read chứ không dựng DTO từ domain.Trade: cum_by_trade,
// running_peak và drawdown của một lệnh phụ thuộc toàn bộ dãy trước nó, nên
// không tính được nếu chỉ có mình nó.
func (h *TradeHandler) traLenh(w http.ResponseWriter, r *http.Request, acc domain.Account, id int64) {
	res, err := h.svc.Read(r.Context(), acc, service.Filter{})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	for _, e := range res.All {
		if e.Trade.ID == id {
			OK(w, toTradeDTO(e))
			return
		}
	}
	// Không thấy trong dãy chưa xoá: lệnh vừa bị xoá mềm, hoặc đang ở thùng
	// rác. Trả bản thô, không bịa trường suy diễn.
	t, err := h.svc.ByID(r.Context(), id)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toDeletedTradeDTOs([]domain.Trade{t})[0])
}
```

Import cần thêm ở đầu file: `"journal/internal/domain"`.

- [ ] **Step 2: Gắn route trong `backend/internal/httpapi/router.go`**

Thêm trường vào `Deps`:

```go
	Trade       *service.TradeService
```

Rồi thêm vào trong `api.Group(func(priv chi.Router) {...})`, ngay sau `priv.Delete("/cash-flows/{id}", cf.Delete)`:

```go
			if d.Trade != nil {
				th := &TradeHandler{svc: d.Trade}
				priv.Route("/accounts/{id}", func(one chi.Router) {
					one.Use(RequireAccount(d.Account))
					one.Get("/trades", th.List)
					one.Post("/trades", th.Create)
					one.Get("/trades/trash", th.Trash)
					one.Get("/stats", th.Stats)
					one.Get("/charts", th.Charts)
				})
				priv.Route("/trades/{id}", func(one chi.Router) {
					one.Use(RequireTrade(d.Trade))
					one.Get("/", th.Get)
					one.Patch("/", th.Update)
					one.Delete("/", th.Delete)
					one.Post("/restore", th.Restore)
				})
			}
```

Lưu ý về thứ tự: `/accounts/{id}/trades/trash` phải đăng ký được cạnh `/accounts/{id}/trades`. chi phân biệt được vì `trash` là literal còn `trades` là đoạn cha khác — nếu chạy lên lỗi "routing pattern conflict" thì đổi `trash` thành một `Route` con:

```go
					one.Route("/trades", func(tr chi.Router) {
						tr.Get("/", th.List)
						tr.Post("/", th.Create)
						tr.Get("/trash", th.Trash)
					})
```

- [ ] **Step 3: Nối vào `backend/cmd/api/main.go`**

Tìm chỗ dựng `httpapi.Deps{...}` và thêm:

```go
		Trade: service.NewTradeService(
			repository.NewTradeRepo(db),
			cashFlowRepo,
			accountSvc,
		),
```

Nếu `main.go` chưa giữ `cashFlowRepo` và `accountSvc` trong biến riêng thì tách chúng ra trước, để không dựng hai `AccountService` khác nhau.

- [ ] **Step 4: Cập nhật `twoUserServer` trong `backend/internal/httpapi/account_handler_test.go`**

Thêm `Trade:` vào `httpapi.Deps{...}` để test hiện có vẫn dựng router đầy đủ:

```go
	tradeRepo := repository.NewTradeRepo(db)
	cashRepo := repository.NewCashFlowRepo(db)
	srv = httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Auth:     authSvc,
		Account:  accountSvc,
		CashFlow: service.NewCashFlowService(cashRepo, accountSvc),
		Trade:    service.NewTradeService(tradeRepo, cashRepo, accountSvc),
		Signer:   signer,
	}))
```

- [ ] **Step 5: Biên dịch và chạy toàn bộ test cũ**

Run: `cd backend && go build ./... && go test ./... -count=1`
Expected: build sạch, mọi test cũ vẫn xanh. Route mới chưa có test riêng — Task 11 làm.

- [ ] **Step 6: Kiểm tay trên stack thật**

```bash
cd /Users/mac/Workspace/MyDocuments/trading-journal-web-app
export JWT_SECRET=$(openssl rand -base64 48)
docker compose -p jrnl-3a down -v >/dev/null 2>&1
docker compose -p jrnl-3a up -d --build
for i in $(seq 60); do curl -sf http://localhost:8080/api/meta/enums >/dev/null && break; done

TOK=$(curl -s -X POST http://localhost:8080/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"t@example.com","password":"matkhaudai"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["access_token"])')
ACC=$(curl -s -X POST http://localhost:8080/api/accounts -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"code":"A1","name":"","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["id"])')

curl -s -X POST "http://localhost:8080/api/accounts/$ACC/trades" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2","entry_quality":"Đúng kế hoạch","in_trade_quality":"Tuân thủ kế hoạch","exit_quality":"Chạm Chốt lời","psychology":"Không lỗi"}' | head -c 400; echo
curl -s "http://localhost:8080/api/accounts/$ACC/trades" -H "Authorization: Bearer $TOK" | head -c 200; echo
curl -s "http://localhost:8080/api/accounts/$ACC/stats" -H "Authorization: Bearer $TOK" | head -c 200; echo
curl -s "http://localhost:8080/api/accounts/$ACC/charts" -H "Authorization: Bearer $TOK" | head -c 200; echo
docker compose -p jrnl-3a down -v
```

Expected: lệnh tạo ra trả `"stt":1`, `"net":"98"`, `"score_total":100`, `"trade_class":"Đúng kế hoạch"`, `"day":"2026-06-09"`. Danh sách trả `{"items":[...],"page":1,"size":50,"total":1}`. `/stats` trả `"one_r":"100"`. `/charts` trả `"by_setup":[...]`. Dán output thật.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/httpapi/trade_handler.go backend/internal/httpapi/router.go \
        backend/cmd/api/main.go backend/internal/httpapi/account_handler_test.go
git commit -m "feat(trade): mount nine trade endpoints"
```

---

### Task 11: Test HTTP — envelope, quyền, phân trang, lọc

**Files:**
- Create: `backend/internal/httpapi/trade_handler_test.go`

**Interfaces:**
- Consumes: `twoUserServer`, `do`, `envelopeBody` (đã có trong `account_handler_test.go`).
- Produces: không có kiểu mới.

- [ ] **Step 1: Viết test**

Tạo `backend/internal/httpapi/trade_handler_test.go`:

```go
package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// taoAccountQuaAPI tạo một account và trả id của nó.
func taoAccountQuaAPI(t *testing.T, srv string, token, code string) int64 {
	t.Helper()
	resp, env := do(t, http.MethodPost, srv+"/api/accounts", token,
		fmt.Sprintf(`{"code":%q,"name":"","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}`, code))
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &acc))
	return acc.ID
}

const bodyLenh = `{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2"}`

func taoLenh(t *testing.T, srv string, token string, accID int64, body string) int64 {
	t.Helper()
	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv, accID), token, body)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(env.Data))
	var tr struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &tr))
	return tr.ID
}

func TestTaoLenhTraVeTruongSuyDien(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2","entry_quality":"Đúng kế hoạch","in_trade_quality":"Tuân thủ kế hoạch","exit_quality":"Chạm Chốt lời","psychology":"Không lỗi"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.EqualValues(t, 1, got["stt"])
	require.Equal(t, "98", got["net"], "net = profit − fee = 100 − 2")
	require.EqualValues(t, 100, got["score_total"])
	require.Equal(t, "Đúng kế hoạch", got["trade_class"])
	require.Equal(t, "2026-06-09", got["day"], "12:00 giờ VN ngày 09 vẫn là ngày 09")
	require.Equal(t, "2026-06-09T05:00:00Z", got["entered_at"], "trả về UTC")
}

// Quy tắc 7 của CLAUDE.md: stt do frontend gửi lên bị BỎ QUA, không phải bị
// từ chối. Trường stt tồn tại trong DTO chỉ để DisallowUnknownFields không
// biến nó thành lỗi 400.
func TestTaoLenhBoQuaSTTDoFrontendGui(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"stt":999,"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, "gửi stt không được thành lỗi")
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.EqualValues(t, 1, got["stt"], "backend cấp stt thật, bỏ qua 999")
}

// entered_at phải mang offset. "2026-06-09T12:00:00" trần trụi là mơ hồ:
// backend không có cách nào biết đó là giờ nào, và đoán bừa sẽ làm lệnh rơi
// sai ngày mà không ai hay.
func TestTaoLenhEnteredAtThieuOffsetLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00","symbol":"XAUUSD","direction":"Long","profit":"100"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestTaoLenhTruongLaLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, _ := do(t, http.MethodPost, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA,
		`{"entered_at":"2026-06-09T12:00:00Z","symbol":"X","direction":"Long","profit":"1","truong_bia":"x"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDanhSachLenhPhanTrangVaTotal(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	for i := 0; i < 3; i++ {
		taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	}

	resp, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/trades?page=1&size=2", srv.URL, acc), tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var p struct {
		Items []map[string]any `json:"items"`
		Page  int              `json:"page"`
		Size  int              `json:"size"`
		Total int              `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &p))
	require.Len(t, p.Items, 2)
	require.Equal(t, 1, p.Page)
	require.Equal(t, 2, p.Size)
	require.Equal(t, 3, p.Total)
	require.EqualValues(t, 3, p.Items[0]["stt"], "mới nhất trước")
}

func TestDanhSachLenhRongTraMangRongChuKhongNull(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")

	require.Contains(t, string(env.Data), `"items":[]`)
}

func TestDanhSachLenhLocTheoSymbol(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/trades?symbol=EURUSD", srv.URL, acc), tokenA, "")

	var p struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &p))
	require.Equal(t, 1, p.Total)
	require.Equal(t, "EURUSD", p.Items[0]["symbol"])
	require.Equal(t, "150", p.Items[0]["cum_by_trade"],
		"lũy kế vẫn tính trên TOÀN BỘ dãy dù bộ lọc chỉ giữ một lệnh")
}

func TestSuaLenhChiDoiTruongDuocGui(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	resp, env := do(t, http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), tokenA,
		`{"notes":"đã xem lại"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var got map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &got))
	require.Equal(t, "đã xem lại", got["notes"])
	require.Equal(t, "XAUUSD", got["symbol"])
	require.EqualValues(t, 1, got["stt"])
}

func TestXoaMemRoiKhoiPhuc(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	resp, _ := do(t, http.MethodDelete, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")
	require.Contains(t, string(env.Data), `"total":0`)

	_, env = do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades/trash", srv.URL, acc), tokenA, "")
	var rac []map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &rac))
	require.Len(t, rac, 1)
	require.EqualValues(t, id, rac[0]["id"])

	resp, _ = do(t, http.MethodPost, fmt.Sprintf("%s/api/trades/%d/restore", srv.URL, id), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env = do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), tokenA, "")
	require.Contains(t, string(env.Data), `"total":1`)
}

// Quyền sở hữu. Không có nhánh này thì bất kỳ ai đăng nhập đều đọc và sửa
// được lệnh của người khác chỉ bằng cách đoán id.
func TestLenhCuaNguoiKhacLa403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	id := taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	for _, c := range []struct {
		method, url string
		body        string
	}{
		{http.MethodGet, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), ""},
		{http.MethodPatch, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), `{"notes":"cua toi"}`},
		{http.MethodDelete, fmt.Sprintf("%s/api/trades/%d", srv.URL, id), ""},
		{http.MethodPost, fmt.Sprintf("%s/api/trades/%d/restore", srv.URL, id), ""},
	} {
		t.Run(c.method, func(t *testing.T) {
			resp, env := do(t, c.method, c.url, tokenB, c.body)
			require.Equal(t, http.StatusForbidden, resp.StatusCode)
			require.Equal(t, 1403, env.Code)
		})
	}
}

func TestKhongCoTokenLa401(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	resp, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/trades", srv.URL, acc), "", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
}

func TestLenhKhongTonTaiLa404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodGet, srv.URL+"/api/trades/999999", tokenA, "")

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, 1404, env.Code)
}

func TestStatsTinhTrenTapDaLocQuaAPI(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"50"}`)

	_, env := do(t, http.MethodGet,
		fmt.Sprintf("%s/api/accounts/%d/stats?symbol=EURUSD", srv.URL, acc), tokenA, "")

	var k map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &k))
	require.EqualValues(t, 1, k["total_trades"])
	require.Equal(t, "50", k["net_profit"])
	require.Equal(t, "100", k["one_r"], "1R = 10000 × 0.01, không phụ thuộc bộ lọc")
}

func TestStatsKhongCoLenhThiChiSoRaNull(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/stats", srv.URL, acc), tokenA, "")

	require.Contains(t, string(env.Data), `"profit_factor":null`)
	require.Contains(t, string(env.Data), `"win_pct":null`)
	require.Contains(t, string(env.Data), `"current_balance":"10000"`)
}

func TestChartsTraDuMuoiBonKhoa(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")
	taoLenh(t, srv.URL, tokenA, acc, bodyLenh)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/charts", srv.URL, acc), tokenA, "")

	var c map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(env.Data, &c))
	for _, khoa := range []string{
		"by_setup", "by_symbol", "by_timeframe", "by_direction", "by_weekday",
		"by_week", "by_day", "heatmap", "r_distribution", "score", "radar",
		"theory_vs_actual", "longest_win_streak", "longest_loss_streak",
	} {
		require.Contains(t, c, khoa, "thiếu nhóm %q", khoa)
	}
	require.Len(t, c, 14, "đúng 14 khoá, không thừa không thiếu")
}
```

- [ ] **Step 2: Chạy, xác nhận XANH**

Run: `cd backend && go test ./internal/httpapi/ -count=1 -v 2>&1 | tail -40`
Expected: PASS. Nếu `TestLenhCuaNguoiKhacLa403` báo 404 thay vì 403, kiểm lại `TradeService.ForUser` có gọi `s.accounts.ForUser` không.

- [ ] **Step 3: FALSIFY quyền sở hữu ở tầng HTTP**

```bash
cd backend
# Trong middleware.go, trong RequireTrade, thay lời gọi svc.ForUser bằng:
#   t, err := svc.ByID(r.Context(), id)
#   acc := domain.Account{}
go test ./internal/httpapi/ -run TestLenhCuaNguoiKhacLa403 -count=1
```

Expected: ĐỎ — user B đọc/sửa/xoá được lệnh của user A. Khôi phục.

- [ ] **Step 4: FALSIFY việc bỏ qua `stt`**

```bash
cd backend
# Trong tradeCreateRequest, xoá trường STT
go test ./internal/httpapi/ -run TestTaoLenhBoQuaSTTDoFrontendGui -count=1
```

Expected: ĐỎ — trả 400 vì `DisallowUnknownFields`, trong khi quy tắc là "bỏ qua". Khôi phục.

- [ ] **Step 5: FALSIFY việc lọc không đụng tới lũy kế**

Dùng lại đúng đột biến của Task 4 Step 5 (Enrich lần hai trên tập đã lọc), rồi chạy:

```bash
cd backend && go test ./internal/httpapi/ -run TestDanhSachLenhLocTheoSymbol -count=1
```

Expected: ĐỎ — `cum_by_trade` ra `"50"` thay vì `"150"`. Khôi phục.

- [ ] **Step 6: Chạy toàn bộ và commit**

Run: `cd backend && go test ./... -count=1 && cd .. && make lint`

```bash
git add backend/internal/httpapi/trade_handler_test.go
git commit -m "test(trade): cover envelope, ownership, filters and pagination over HTTP"
```

---

### Task 12: Golden JSON cho `/charts` và rà soát cuối Phase 3a

**Files:**
- Create: `backend/internal/httpapi/testdata/charts.golden.json`
- Modify: `backend/internal/httpapi/trade_handler_test.go`

**Interfaces:**
- Consumes: mọi thứ của Task 1–11.
- Produces: `make test` xanh trọn vẹn; 13 bất biến §7.1 của spec đã falsify.

Quyết định #3 của spec: `/charts` marshal thẳng `aggregate.Charts` thay vì viết 200 dòng DTO. Đổi lại, hình dạng JSON phải được ghim — nếu không thì một lần đổi tên trường trong `aggregate` ở Phase 4 sẽ đổi hợp đồng API mà không ai biết.

- [ ] **Step 1: Viết test golden**

Thêm vào cuối `backend/internal/httpapi/trade_handler_test.go`. Import thêm `"os"`, `"path/filepath"`, `"flag"`:

```go
// capNhatGolden cho phép sinh lại file mẫu khi hình dạng ĐỔI CÓ CHỦ Ý:
//   go test ./internal/httpapi/ -run TestChartsGiuNguyenHinhDangJSON -cap-nhat-golden
//
// Cờ này là con dao hai lưỡi: chạy nó vô thức sẽ "sửa" test thay vì sửa lỗi.
// Chỉ dùng khi đã đọc diff và xác nhận thay đổi là điều mình muốn.
var capNhatGolden = flag.Bool("cap-nhat-golden", false, "ghi lại file golden của /charts")

func TestChartsGiuNguyenHinhDangJSON(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	acc := taoAccountQuaAPI(t, srv.URL, tokenA, "A1")

	// Fixture cố định: hai lệnh, một thắng một thua, đủ để mọi nhóm có dữ
	// liệu thật thay vì toàn giá trị rỗng.
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-09T12:00:00+07:00","symbol":"XAUUSD","direction":"Long","profit":"100","fee":"2","profit_theory":"120","timeframe":"H1","setup":"Breakout","entry_quality":"Đúng kế hoạch","in_trade_quality":"Tuân thủ kế hoạch","exit_quality":"Chạm Chốt lời","psychology":"Không lỗi"}`)
	taoLenh(t, srv.URL, tokenA, acc,
		`{"entered_at":"2026-06-10T12:00:00+07:00","symbol":"EURUSD","direction":"Short","profit":"-50","fee":"1","profit_theory":"-40","timeframe":"M15","setup":"Pullback","entry_quality":"Bốc đồng","in_trade_quality":"Dời dừng lỗ ra xa","exit_quality":"Chạm Dừng lỗ","psychology":"SỢ BỎ LỠ (FOMO)"}`)

	_, env := do(t, http.MethodGet, fmt.Sprintf("%s/api/accounts/%d/charts", srv.URL, acc), tokenA, "")

	// Chuẩn hoá qua map rồi in lại có thụt lề: so sánh không phụ thuộc thứ
	// tự khoá mà encoding/json sinh ra.
	var thuc any
	require.NoError(t, json.Unmarshal(env.Data, &thuc))
	dep, err := json.MarshalIndent(thuc, "", "  ")
	require.NoError(t, err)

	duong := filepath.Join("testdata", "charts.golden.json")
	if *capNhatGolden {
		require.NoError(t, os.MkdirAll("testdata", 0o755))
		require.NoError(t, os.WriteFile(duong, append(dep, '\n'), 0o644))
		t.Log("đã ghi lại", duong)
		return
	}

	muon, err := os.ReadFile(duong)
	require.NoError(t, err, "chưa có file golden — chạy lại với -cap-nhat-golden")
	require.JSONEq(t, string(muon), string(dep),
		"hình dạng JSON của /charts đã đổi. Nếu đây là chủ ý, chạy lại với -cap-nhat-golden và đọc kỹ diff")
}
```

- [ ] **Step 2: Sinh file golden lần đầu**

```bash
cd backend
go test ./internal/httpapi/ -run TestChartsGiuNguyenHinhDangJSON -count=1 -cap-nhat-golden
```

- [ ] **Step 3: Đọc file golden bằng mắt trước khi commit**

```bash
cd backend && python3 -m json.tool internal/httpapi/testdata/charts.golden.json | head -60
```

Kiểm bằng mắt: có đủ 14 khoá; `by_symbol` có hai phần tử `XAUUSD` và `EURUSD`; `longest_win_streak` là 1; `by_weekday` đủ bảy ngày; mọi số tiền là **chuỗi** trong dấu nháy chứ không phải số trần. Nếu thấy số trần ở chỗ tiền thì dừng lại — đó là lỗi thật, không phải chuyện định dạng.

- [ ] **Step 4: Chạy lại không có cờ, xác nhận XANH**

Run: `cd backend && go test ./internal/httpapi/ -run TestChartsGiuNguyenHinhDangJSON -count=1`
Expected: PASS.

- [ ] **Step 5: FALSIFY golden test**

```bash
cd backend
# Trong internal/aggregate/pivot.go, đổi json tag của Pivot.SumNet
# từ `json:"sum_net"` thành `json:"tong_net"`
go test ./internal/httpapi/ -run TestChartsGiuNguyenHinhDangJSON -count=1
```

Expected: ĐỎ — `hình dạng JSON của /charts đã đổi`. Khôi phục.

Đây chính là thứ mà một tầng DTO 1-1 sẽ bắt được, và là lý do quyết định #3 chấp nhận marshal thẳng.

- [ ] **Step 6: Rà soát — ba package thuần vẫn thuần**

```bash
cd backend
go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... -count=1
grep -rn "gorm.io\|net/http\|database/sql" internal/scoring internal/metrics internal/aggregate | grep -v _test
```

Expected: test xanh, `grep` **không in gì**. Phase 3a chỉ được *dùng* ba package đó, không được sửa chúng.

Chạy thêm: `cd backend && go test ./internal/aggregate/ -run TestBaPackageLoiPhaiThuan -count=1 -v`

- [ ] **Step 7: Rà soát — frontend không bị đụng tới**

```bash
cd /Users/mac/Workspace/MyDocuments/trading-journal-web-app
git diff --stat main -- frontend/ | wc -l
```

Expected: `0`. 3a là phase backend; một dòng frontend nào thay đổi cũng là dấu hiệu lạc phạm vi.

- [ ] **Step 8: Chạy trọn bốn cổng**

```bash
cd /Users/mac/Workspace/MyDocuments/trading-journal-web-app
make lint
make test-pure
make test
make test-fe
```

Dán output thật của cả bốn. Không được báo xanh khi chưa chạy.

- [ ] **Step 9: Đi trọn vòng trên stack Docker thật**

```bash
export JWT_SECRET=$(openssl rand -base64 48)
docker compose -p jrnl-3a-final down -v >/dev/null 2>&1
docker compose -p jrnl-3a-final up -d --build
for i in $(seq 60); do curl -sf http://localhost:8080/api/meta/enums >/dev/null && break; done
```

Rồi làm đủ bảng dưới đây bằng `curl`, ghi lại kết quả từng dòng:

| # | Việc | Mong đợi |
|---|---|---|
| 1 | Đăng ký, tạo account vốn 10000 risk 1% | `one_r` = `"100"` |
| 2 | `POST /trades` lệnh thắng 100, phí 2, chấm điểm đủ | `stt`=1, `net`=`"98"`, `score_total`=100, `trade_class`=`"Đúng kế hoạch"` |
| 3 | `POST /trades` lệnh thua −50, phí 1 | `stt`=2, `cum_by_trade`=`"47"` |
| 4 | `GET /trades` | `total`=2, phần tử đầu có `stt`=2 |
| 5 | `GET /trades?symbol=<mã lệnh 1>` | `total`=1, `cum_by_trade` vẫn `"98"` |
| 6 | `GET /stats` | `total_trades`=2, `net_profit`=`"47"` |
| 7 | `GET /stats?symbol=<mã lệnh 1>` | `total_trades`=1, `net_profit`=`"98"` |
| 8 | `GET /charts` | đủ 14 khoá, `longest_win_streak`=1 |
| 9 | `PATCH /trades/:id` đổi `notes` | chỉ `notes` đổi, `stt` giữ nguyên |
| 10 | `PATCH /trades/:id` gửi `{"profit_theory":null}` | `profit_theory` về `null` |
| 11 | `DELETE /trades/:id` lệnh 1 | `GET /trades` còn `total`=1, `cum_by_trade` của lệnh 2 đổi |
| 12 | `GET /trades/trash` | một phần tử, không có trường suy diễn |
| 13 | `POST /trades/:id/restore` | lệnh về đúng `stt`=1, lũy kế trở lại như cũ |
| 14 | Gọi `/trades/:id` bằng token user khác | 403, code 1403 |

```bash
docker compose -p jrnl-3a-final down -v
docker volume ls | grep trading-journal-web-app_pgdata
```

Expected: volume dev của người dùng vẫn còn.

- [ ] **Step 10: Commit**

```bash
git add backend/internal/httpapi/testdata/charts.golden.json \
        backend/internal/httpapi/trade_handler_test.go
git commit -m "test(trade): pin the /charts JSON shape with a golden fixture"
```

---

## Danh sách bất biến phải FALSIFY

Trước khi báo Phase 3a xong, xác nhận từng dòng đã được xoá đi một lần và **thấy test đỏ**, kèm output thật.

| # | Bất biến | Task | Test phải đỏ |
|---|---|---|---|
| 1 | Khoá hàng account khi cấp `stt` | 1 | `TestTradeCreateSongSongKhongTrungSTT` |
| 2 | `stt` do người gọi đặt bị ghi đè | 1 | `TestTradeCreateGhiDeSTTDoNguoiGoiDat` |
| 3 | `max(stt)` quét cả lệnh đã xoá mềm | 2 | `TestTradeKhoiPhucSauKhiDaTaoLenhMoiKhongDungUNIQUE` |
| 4 | `updated_at` được bump khi sửa | 2 | `TestTradeUpdateFieldsBumpUpdatedAt` |
| 5 | Xoá hai lần lần sau báo NotFound | 2 | `TestTradeSoftDeleteHaiLanLanSauLaNotFound` |
| 6 | Lọc ngày so trên `Day`, không phải `EnteredAt` | 3 | `TestFilterSoTrenDayChuKhongPhaiEnteredAt` |
| 7 | Filter khớp chính xác, không phải chuỗi con | 3 | `TestFilterKhopChinhXacChuKhongPhaiChuoiCon` |
| 8 | Enrich chạy trước khi lọc | 4 | `TestReadLuyKeTinhTrenToanBoDuDaLoc` |
| 9 | `total` đếm tập đã lọc | 4 | `TestListTotalDemTapDaLocChuKhongPhaiToanBo` |
| 10 | `aggregate.All` nhận đúng thứ tự `(all, filtered)` | 5 | `TestChartsStreakTrenToanBoPivotTrenTapDaLoc` |
| 11 | Không đảo `Filtered` tại chỗ | 5 | `TestChartsKhongBiAnhHuongBoiListGoiTruocDo` |
| 12 | Enum rỗng là hợp lệ | 6 | `TestCreateChapNhanBonTruongChamDiemDeTrong` |
| 13 | `entered_at` quy đổi về UTC | 6 | `TestCreateQuyDoiEnteredAtVeUTC` |
| 14 | `setup` rỗng về mặc định | 6 | `TestCreateSetupRongThanhMacDinh` |
| 15 | Cờ `Set` của `Tri` | 7 | `TestTriKhoaCoMatMangNullThiSetNhungValueNil` |
| 16 | PATCH phân biệt vắng mặt với null | 7 | `TestUpdatePhanBietVangMatVoiNull` |
| 17 | Kiểm quyền sở hữu ở service | 8 | `TestForUserLenhCuaNguoiKhacLa403` |
| 18 | `ByID` nạp được lệnh đã xoá | 8 | `TestForUserVanNapDuocLenhDaXoa` |
| 19 | Tiền ra chuỗi JSON, không phải số | 9 | `TestTradeDTOTienLaChuoiKhongPhaiSo` |
| 20 | Mảng rỗng ra `[]`, không phải `null` | 9 | `TestTradeDTOsDanhSachRongRaMangRongChuKhongNull` |
| 21 | Quyền sở hữu ở tầng HTTP | 11 | `TestLenhCuaNguoiKhacLa403` |
| 22 | `stt` do frontend gửi bị bỏ qua | 11 | `TestTaoLenhBoQuaSTTDoFrontendGui` |
| 23 | Hình dạng JSON của `/charts` được ghim | 12 | `TestChartsGiuNguyenHinhDangJSON` |

**Ba điều cần cảnh giác**, rút từ Phase 2a và 2b:

- **Check không bao giờ đỏ được.** `go test -run` không khớp gì sẽ in `ok ... [no tests to run]` rồi thoát **0**. Sau mỗi lệnh falsify, đọc dòng đếm test chứ không chỉ đọc mã thoát.
- **Falsify sai chỗ.** Xoá một dòng mà test vẫn xanh thì hỏi "test này sai, hay dòng kia thừa?" trước khi kết luận. Bất biến #11 là ví dụ có sẵn: ở Task 4 nó **chưa** falsify được vì chưa ai dùng lại `Filtered`, phải đợi tới Task 5.
- **Đọc `Tests` chứ không chỉ đọc exit code.** Ở Phase 2b có một lần cả ba test đều "passed" mà cổng vẫn thoát 1 vì một unhandled rejection. Bên Go, tương ứng là test xanh nhưng `go vet` đỏ, hoặc một goroutine panic sau khi test kết thúc.

## Xong khi

- `make lint`, `make test-pure`, `make test`, `make test-fe` đều xanh, có output thật.
- 9 endpoint chạy đúng trên stack Docker thật, bảng 14 dòng ở Task 12 Step 9 đúng hết.
- `git diff main -- frontend/` rỗng.
- `grep` GORM/HTTP trong ba package thuần không in gì.
- 23 bất biến ở bảng trên đều đã falsify, có output thật.
