# Phase 6 — Làm sâu kiến trúc backend: Implementation Plan

> **TRẠNG THÁI: đã thực hiện xong cả 5 task (2026-09-03).** Toàn bộ `make test`,
> `make test-pure`, `make lint`, `make test-fe` xanh. Golden file và frontend
> không đổi một byte. Working tree để nguyên, chưa commit.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa năm chỗ ma sát kiến trúc của backend về đúng hình dạng module sâu — interface nhỏ, implementation dày, seam đặt đúng chỗ. Không thêm tính năng nào cho người dùng; đổi lại: test của luật nghiệp vụ chạy không cần Docker, một dashboard chỉ nạp DB một lần thay vì ba, và mỗi luật chỉ còn đúng một bản.

**Architecture:** Năm việc, làm theo đúng thứ tự Task 1 → 5 vì Task 1 mở khoá vòng lặp test cho những task sau. Task 1 đặt seam ở tầng lưu trữ (interface do `service` khai báo, GORM repo và một adapter in-memory cùng thoả). Task 2 gộp `Read` + hai tập `All`/`Filtered` thành một module `JournalView`. Task 3 dồn luật kiểm tra lệnh về `domain`. Task 4 gộp định dạng CSV về một module. Task 5 thu gọn tầng DTO.

**Tech Stack:** Go 1.23 · chi · GORM · Postgres 16 (chỉ còn tầng repository chạm tới) · testcontainers. **Không thêm dependency nào** — không mockery, không gomock; adapter in-memory viết tay.

**Nguồn:** `docs/superpowers/specs/2026-08-16-trading-journal-design.md` · `trading-journal-plan.md` §0–§7 · `CLAUDE.md` quy tắc 1–8 · báo cáo `improve-codebase-architecture` ngày 2026-09-03.

## Số đo trước khi làm (đã chạy thật, không phải ước lượng)

| Chỉ số | Hiện tại | Cách đo |
|---|---|---|
| Interface khai báo trong backend | **0** | `grep -rn '^type .* interface' internal/` → rỗng |
| Test func **cần Postgres** | **178** | 70 `service` + 52 `repository` + 56 `httpapi` |
| Test func chạy không cần Docker | 130 | `scoring` 9 · `metrics` 30 · `aggregate` 42 · `importer` 19 · `exporter` 12 · `service` 18 |
| `make test-pure` | **7.5s** | `time go test ./internal/{scoring,metrics,aggregate,importer,exporter}/...` |
| Lần nạp toàn bảng cho 1 dashboard | **3** | `List` + `Stats` + `Charts`, mỗi cái gọi `Read` riêng |
| Lần nạp toàn bảng cho 1 lệnh POST | **2** | `repo.Create` rồi `traLenh` → `Read` |
| Số bản của luật "5 enum + DefaultSetup" | **3** | `validateTradeInput` · `patchToFields` · `dungLenh` |

**Đích đến:** 178 test cần Postgres → còn **~52** (chỉ `repository`); `service` và `httpapi` chuyển sang adapter in-memory. Dashboard: 3 lần nạp → **1**. POST: 2 lần nạp → **1**.

> Đính chính so với báo cáo HTML: báo cáo ghi "160 test cần Docker". Con số đếm đúng là **178** (báo cáo bỏ sót 3 file `httpapi` đi qua `httptest` nhưng vẫn chạm Postgres qua `twoUserServer`). Cả 5 candidate không đổi, chỉ con số này đổi.

## Quyết định đã chốt trước khi viết plan

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Interface đặt ở đâu? | **Ở `service`, phía người dùng interface** — đúng kiểu Go. Không tạo package `ports/`. `repository` không import `service`, nên không có vòng lặp import. |
| 2 | Interface to cỡ nào? | **Đúng bằng cái `service` đang gọi, không hơn.** Đã liệt kê đủ ở Task 1; ví dụ `TradeStore` có 9 method vì `service` gọi đúng 9. |
| 3 | Adapter in-memory viết tay hay sinh bằng mock? | **Viết tay.** Mock sinh sẵn kiểm được "có gọi hàm không", còn cái ta cần kiểm là *hành vi* (stt tăng dần, soft-delete, uniqueness). Thêm mockery là thêm một dependency và một bước build. |
| 4 | Có xoá test dùng Postgres không? | **Không xoá cái nào.** `repository` giữ nguyên 52 test trên Postgres thật — đó là chỗ duy nhất biết SQL. `service`/`httpapi` **chuyển** sang in-memory. |
| 5 | Test in-memory có che mất bug DB thật không? | Có nguy cơ, nên **Task 1.5 dựng contract test**: một bộ test chạy **hai lần**, một lần trên adapter GORM, một lần trên adapter in-memory. Hai adapter lệch hành vi là test đỏ. |
| 6 | `JournalView` thay hay bọc `Read`? | **Thay.** Giữ `Read` public cạnh nó là để lại đúng cái bẫy `All`/`Filtered` mà Task 2 sinh ra để đóng. |
| 7 | Task 5 có làm không? | **Có, nhưng làm cuối và chỉ phần derived.** Xem "Phạm vi Task 5" — phần input DTO giữ nguyên, có lý do. |

## Global Constraints

Mọi task đều ngầm mang theo mục này.

- **Không đổi một byte nào của JSON API.** Đây là refactor. Golden test `internal/httpapi/testdata/charts.golden.json` và toàn bộ test `httpapi` là lưới an toàn — chúng phải xanh **mà không sửa file kỳ vọng**. Sửa golden file = đã làm hỏng hợp đồng với frontend.
- **`make test-fe` và `make e2e` phải xanh y như trước.** Frontend `src/` không được sửa dòng nào trong phase này. (Ngoại lệ đã ghi nhận ở cuối tài liệu: bốn selector trong `e2e/auth.spec.ts` đã lỗi thời TỪ TRƯỚC phase này và được sửa kèm — tệp test, không phải code sản phẩm.)
- **Giữ nguyên 8 quy tắc bất di bất dịch của `CLAUDE.md`.** Đặc biệt quy tắc 3 (`scoring`/`metrics`/`aggregate` thuần) và quy tắc 8 (lũy kế trên toàn bộ, KPI trên tập lọc, `current_balance` là ngoại lệ).
- **Tiền là `decimal.Decimal`.** Adapter in-memory cũng phải giữ `decimal`, cấm quy về `float64` cho tiện.
- **Mỗi task chạy test thật rồi mới đánh dấu xong.** Mỗi bất biến ghi trong plan phải **falsify**: phá thật, xem test đỏ, khôi phục.
- **Không commit.** Kết thúc mỗi task ở "test xanh", để nguyên working tree. Chủ repo tự review và tự commit.
- Lệnh test: `make test-pure` · `make test` (cần Docker) · `make lint` · `make test-fe`.

## Bất biến của phase — mỗi task phải giữ

| # | Bất biến | Cách falsify |
|---|---|---|
| I1 | JSON response không đổi | Sửa một tên field trong DTO → test `httpapi` phải đỏ |
| I2 | Lũy kế tính trên **toàn bộ**, KPI trên **tập lọc** | Đổi `All` thành `Filtered` ở `ComputeKPI` → test phải đỏ |
| I3 | `current_balance` **không** chịu bộ lọc | Truyền `Filtered` vào chỗ tính số dư → test phải đỏ |
| I4 | `stt` cấp tuần tự, quét cả lệnh đã xoá mềm | In-memory adapter chỉ đếm lệnh chưa xoá → contract test phải đỏ |
| I5 | Hai adapter cùng hành vi | Cho in-memory trả `nil` thay `ErrNotFound` → contract test phải đỏ |

---

## Task 1 — Đặt seam ở tầng lưu trữ

**Vì sao trước tiên:** 178 test đang phải chờ Postgres để kiểm những luật không hề chạm SQL. Mọi task sau đều viết test, nên task này rẻ hơn khi làm đầu tiên và đắt dần nếu để sau.

### 1.1 Khai báo interface

- [ ] Tạo `backend/internal/service/store.go`, khai báo đúng những gì `service` đang gọi (đã liệt kê bằng `grep`, không thừa method nào):

```go
// TradeStore là seam giữa service và nơi cất lệnh. GORM repo và adapter
// in-memory của test cùng thoả interface này.
type TradeStore interface {
    ListByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)
    ListDeletedByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)
    ByID(ctx context.Context, id int64) (domain.Trade, error)
    Create(ctx context.Context, t domain.Trade) (domain.Trade, error)
    CreateBatch(ctx context.Context, accountID int64, ts []domain.Trade) ([]domain.Trade, error)
    UpdateFields(ctx context.Context, id int64, fields map[string]any) error
    SoftDelete(ctx context.Context, id int64) error
    Restore(ctx context.Context, id int64) error
    Facets(ctx context.Context, accountID int64) (symbols, setups []string, err error)
}

type AccountStore interface {
    ListByUser(ctx context.Context, userID int64) ([]domain.Account, error)
    Create(ctx context.Context, a domain.Account) (domain.Account, error)
    ByID(ctx context.Context, id int64) (domain.Account, error)
    Update(ctx context.Context, a domain.Account) error
}

type CashFlowStore interface {
    ListByAccount(ctx context.Context, accountID int64) ([]domain.CashFlow, error)
    Create(ctx context.Context, cf domain.CashFlow) (domain.CashFlow, error)
    ByID(ctx context.Context, id int64) (domain.CashFlow, error)
    DeleteOwned(ctx context.Context, id, accountID int64) error
}

type UserStore interface {
    Count(ctx context.Context) (int64, error)
    Create(ctx context.Context, email, passwordHash string) (repository.UserRow, error)
    ByEmail(ctx context.Context, email string) (repository.UserRow, error)
    ByID(ctx context.Context, id int64) (repository.UserRow, error)
}

type RefreshTokenStore interface {
    Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error
    ByHash(ctx context.Context, tokenHash string) (repository.RefreshTokenRow, error)
    Revoke(ctx context.Context, id int64, at time.Time) error
    RevokeAllForUser(ctx context.Context, userID int64, at time.Time) error
}
```

- [ ] **Lưu ý về `UserRow`/`RefreshTokenRow`:** hai kiểu này đang khai báo trong `repository`, nên `service` vẫn import `repository` để nói tên chúng. Chấp nhận ở task này (chưa phá được vòng phụ thuộc nào cả, `service` vốn đã import `repository`). Nếu muốn cắt hẳn, chuyển hai struct đó sang `domain` — **làm ở 1.6, tuỳ chọn**, và chỉ khi 1.1–1.5 đã xanh.

### 1.2 Đổi service sang nhận interface

- [ ] `TradeService`, `AccountService`, `CashFlowService`, `AuthService`, `ImportService`: đổi field và tham số constructor từ `*repository.XRepo` sang `XStore`.
- [ ] **Không sửa thân hàm nào.** Method set giống hệt nên code gọi không đổi. Đây là bước cơ học; nếu phải sửa logic thì interface đã khai sai.
- [ ] `cmd/api/main.go` không cần sửa: `*repository.TradeRepo` tự thoả `TradeStore`.
- [ ] Chạy: `make test` — phải xanh **toàn bộ**, chưa test nào đổi. Đây là cổng chặn của bước này.

### 1.3 Viết adapter in-memory

- [ ] Tạo `backend/internal/service/memstore_test.go` (đuôi `_test.go` — adapter chỉ để test, không lọt vào binary production).
- [ ] `memTradeStore` phải tái hiện đúng những hành vi mà `service` **thật sự dựa vào**:
  - `stt` cấp tuần tự, `max(stt)+1`, **quét cả lệnh đã xoá mềm** (I4).
  - `ListByAccount` chỉ trả lệnh chưa xoá, **sắp theo `stt` tăng dần**.
  - `ListDeletedByAccount` chỉ trả lệnh đã xoá.
  - `SoftDelete` lần hai → `repository.ErrNotFound`. `Restore` lệnh chưa xoá → `ErrNotFound`.
  - `UpdateFields` trên lệnh đã xoá → `ErrNotFound`; nhận `map[string]any`, `nil` ghi được xuống 4 cột NULLable.
  - `Facets` loại chuỗi rỗng, sắp theo bảng chữ cái, chỉ tính lệnh chưa xoá.
  - `CreateBatch` cấp dãy `stt` liên tiếp theo đúng thứ tự slice; lỗi giữa chừng → không ghi dòng nào.
  - `Create` trùng `Code` account → `repository.ErrDuplicate` (cho `memAccountStore`).
- [ ] Giữ `decimal.Decimal` nguyên vẹn, **cấm** đổi sang `float64`.

### 1.4 Chuyển test service sang in-memory

- [ ] `internal/service/trade_test.go` (40 test), `account_test.go` (8), `auth_test.go` (12), `import_test.go` (10): đổi `testdb.New(t)` → adapter in-memory.
- [ ] **Ngoại lệ, giữ trên Postgres:** test nào đang khẳng định hành vi *của DB* thì để nguyên và chuyển sang `repository`. Đã soát: `trade_test.go:457` và `:499` (`NULL` round-trip của `decimal`) là hai chỗ như vậy — chúng thuộc về `repository/trade_mapping_test.go`.
- [ ] Chạy `go test ./internal/service/... -count=1` **khi đã tắt Docker**. Xanh = seam đã thật.

### 1.5 Contract test — hàng rào chống hai adapter trôi lệch

**Đây là bước quan trọng nhất của Task 1.** Không có nó, adapter in-memory sẽ dần dần "dễ tính" hơn Postgres và test xanh sẽ nói dối.

- [ ] Tạo `backend/internal/service/store_contract_test.go`: một bộ test viết **một lần**, nhận `TradeStore`, chạy **hai lần** — một lần với `memTradeStore`, một lần với `repository.NewTradeRepo(testdb.New(t))`.
- [ ] Bộ contract phải phủ: cấp `stt` tuần tự · `stt` quét cả lệnh đã xoá (I4) · thứ tự `ListByAccount` · `ErrNotFound` khi xoá hai lần · `ErrNotFound` khi restore lệnh chưa xoá · `CreateBatch` cấp dãy liên tiếp · `Facets` loại chuỗi rỗng · `UpdateFields` ghi `nil` xuống cột NULLable.
- [ ] Lượt chạy trên Postgres nằm trong `make test`; lượt in-memory nằm trong `make test-pure`.
- [ ] **Falsify I5:** sửa `memTradeStore.SoftDelete` cho trả `nil` thay vì `ErrNotFound` ở lần xoá thứ hai → contract test phải đỏ. Khôi phục.
- [ ] **Falsify I4:** sửa `memTradeStore` chỉ đếm `stt` của lệnh chưa xoá → contract test phải đỏ. Khôi phục.

### 1.6 (Tuỳ chọn) Chuyển `UserRow`/`RefreshTokenRow` sang `domain`

- [ ] Chỉ làm khi 1.1–1.5 đã xanh. Mục tiêu: `service` hết import `repository`. Nếu tốn hơn ~30 phút thì bỏ, không đáng.

### 1.7 Nghiệm thu Task 1

- [ ] `make test` xanh · `make lint` sạch.
- [ ] `go test ./internal/service/... -count=1` xanh **khi Docker đã tắt**.
- [ ] Cập nhật `make test-pure` trong `Makefile`: thêm `./internal/service/...`.
- [ ] Ghi lại số đo mới: bao nhiêu test còn cần Postgres, `make test-pure` chạy mất bao lâu.

---

## Task 2 — Gộp `Read` thành module `JournalView`

**Phụ thuộc:** Task 1 (để test task này không cần Docker).

**Vấn đề đang có:** `All` và `Filtered` cùng kiểu `[]metrics.Enriched`. Đảo chỗ hai tham số vẫn biên dịch, vẫn ra số — chỉ là số sai. Chính comment ở `service/trade.go:265` đã thừa nhận điều này và phải dùng test riêng để ghim. Type an toàn hơn test ở chỗ nó chặn lúc biên dịch.

### 2.1 Dựng module

- [ ] Tạo `backend/internal/service/journal.go`:

```go
// JournalView là ảnh chụp đã-nạp-và-làm-giàu của một account trong một
// request. Nạp MỘT lần, Enrich MỘT lần, rồi phục vụ mọi cách đọc.
//
// Hai tập KHÔNG lộ ra ngoài dưới dạng slice trần: đó chính là cái bẫy
// wrong-argument mà module này sinh ra để đóng.
type JournalView struct {
    all      []metrics.Enriched // toàn bộ lệnh chưa xoá, theo thứ tự stt
    filtered []metrics.Enriched // tập đã áp bộ lọc hiển thị
    account  domain.Account
}

func (s *TradeService) Load(ctx context.Context, acc domain.Account, f Filter) (*JournalView, error)

func (v *JournalView) Page(page, size int) Page
func (v *JournalView) KPI(flows []domain.CashFlow) metrics.KPI // số dư dùng all, phần còn lại dùng filtered
func (v *JournalView) Charts() aggregate.Charts                // streak dùng all, pivot dùng filtered
func (v *JournalView) CSVRows() []metrics.Enriched             // export dùng filtered
func (v *JournalView) ByID(id int64) (metrics.Enriched, bool)  // cho traLenh
```

- [ ] Field viết thường (không export): ngoài package không ai lấy được slice trần, nên không ai truyền nhầm được.
- [ ] Quy tắc 8 chuyển từ *lời văn trong comment* thành *code bên trong module*: `KPI()` tự biết số dư lấy `all`, phần còn lại lấy `filtered`.

### 2.2 Đổi các chỗ gọi

- [ ] `List`, `Stats`, `Charts` của `TradeService` gọi `Load` rồi hỏi view.
- [ ] `export_handler.go:27` → `Load(...).CSVRows()`.
- [ ] `trade_handler.go:155` `traLenh` → `Load(...).ByID(id)`.
- [ ] **Xoá hẳn** `Read` và `ReadResult` public. Còn để đó là còn nguyên cái bẫy.

### 2.3 Bỏ lần nạp thứ hai ở đường ghi

- [ ] `Create`/`Update`/`Restore` hiện làm: ghi DB → `traLenh` → `Load` (nạp lại toàn bảng). Đây là **2 lần nạp cho 1 request**.
- [ ] Gộp: `Create` trả thẳng `*JournalView` đã nạp sau khi ghi, handler lấy `ByID` từ đó. Một lần nạp.
- [ ] **Không đổi JSON trả về.** Test `httpapi` là trọng tài.

### 2.4 Test

- [ ] Test `Page`/`KPI`/`Charts`/`CSVRows` chạy trên adapter in-memory, **không** cần Docker.
- [ ] **Falsify I2:** sửa `KPI()` cho tính toàn bộ trên `filtered` → test phải đỏ. Khôi phục.
- [ ] **Falsify I3:** sửa `KPI()` cho tính `current_balance` trên `filtered` → test phải đỏ. Khôi phục.
- [ ] Test đếm số lần nạp: adapter in-memory đếm lời gọi `ListByAccount`; một `Load` = **đúng 1**; một `Create` + trả về = **đúng 1**.
- [ ] `make test` · `make test-fe` · `make e2e` xanh.

---

## Task 3 — Dồn luật kiểm tra lệnh về `domain`

**Phụ thuộc:** Task 1.

**Vấn đề đang có:** bảng 5 enum + fallback `DefaultSetup` + quy tắc trim được chép ba lần ở ba package: `validateTradeInput` (`service/trade.go:150`), `patchToFields` (`service/trade.go:311`), `dungLenh` (`importer/parse.go:120`). Chuỗi enum tiếng Việt là **khoá chấm điểm** (quy tắc 5), nên hai bản lệch nhau không gây lỗi — nó gây **điểm sai**, im lặng.

### 3.1 Đưa luật vào `domain`

- [ ] Tạo `backend/internal/domain/trade_rules.go`. `domain` hiện chỉ có *dữ liệu* (danh sách enum); task này cho nó *luật*:

```go
// NormalizeEnum trả giá trị đã chuẩn hoá. Chuỗi rỗng HỢP LỆ — lệnh chưa
// đánh giá là trạng thái hợp lệ (spec mẹ quyết định #8).
func NormalizeEnum(field EnumField, raw string) (string, error)

// NormalizeSetup trim, rỗng thì về DefaultSetup.
func NormalizeSetup(raw string) string

// ValidateTrade kiểm và chuẩn hoá TẠI CHỖ toàn bộ trường của một lệnh.
func ValidateTrade(t *Trade) error
```

- [ ] `EnumField` là kiểu enum nội bộ gói cả `[]string` hợp lệ lẫn thông điệp lỗi tiếng Việt — hôm nay ba nơi đang tự ghép cặp này bằng tay.
- [ ] **Giữ nguyên từng chữ của thông điệp lỗi tiếng Việt.** Chúng hiển thị thẳng cho người dùng và test `httpapi` đang khẳng định chúng.

### 3.2 Ba chỗ gọi cùng dùng một luật

- [ ] `validateTradeInput` → gọi `domain.ValidateTrade`.
- [ ] `patchToFields` → giữ phần dịch `Tri` sang map cột (đó là việc riêng của nó), nhưng phần kiểm enum/setup/trim gọi sang `domain`.
- [ ] `dungLenh` của `importer` → gọi `domain.NormalizeEnum`/`NormalizeSetup`. `importer` giữ riêng phần đọc CSV (`BUY/SELL → Long/Short`, parse ngày, parse số) — đó là luật *của định dạng file*, không phải luật của lệnh.
- [ ] `importer` vẫn là package thuần: `domain` không import GORM/http/context. **Chạy `TestBaPackageLoiPhaiThuan` để xác nhận.**

### 3.3 Test

- [ ] Table-driven test cho `domain/trade_rules.go`, chạy trong `make test-pure`.
- [ ] **Falsify:** bỏ một chuỗi khỏi `domain.EntryQualities` → test của **cả ba** đường (create, patch, import) phải đỏ. Trước task này chỉ một đường đỏ. Đây chính là bằng chứng ba bản đã gộp thành một.
- [ ] `make test-pure` · `make test` xanh.

---

## Task 4 — Gộp định dạng CSV về một module

**Phụ thuộc:** không (làm độc lập được, nhưng để sau cho gọn).

**Vấn đề đang có:** `vanBan` (thêm nháy) ở `exporter/csv.go` và `goNhayDan` (gỡ nháy) ở `importer/parse.go` là một **cặp nghịch đảo** nằm ở hai package. Tên cột export phải nằm sẵn trong bảng alias của importer thì round-trip mới chạy. Ràng buộc đó hiện chỉ được giữ bằng một test, không bằng cấu trúc.

### 4.1 Dựng module

- [ ] Tạo `backend/internal/csvformat/` — package thuần:
  - `columns.go` — thứ tự cột export + bảng alias import, **cùng một chỗ**.
  - `escape.go` — `Escape`/`Unescape` nằm cạnh nhau, kèm test round-trip khẳng định `Unescape(Escape(s)) == s`.
- [ ] `exporter` và `importer` giữ nguyên phần I/O của mình, chỉ đọc định dạng từ `csvformat`.
- [ ] **Không đổi header file xuất ra.** File cũ người dùng đã tải về phải nhập lại được.

### 4.2 Test

- [ ] Property test: với mọi chuỗi trong tập mẫu (gồm chuỗi bắt đầu bằng `=`, `+`, `-`, `@`, tab, CR), `Unescape(Escape(s)) == s`.
- [ ] Test khẳng định: mọi tên cột trong `columns.go` đều nhận diện được bởi chính bảng alias của nó.
- [ ] **Falsify:** đổi một tên cột export → test round-trip phải đỏ.
- [ ] `make test-pure` xanh; thêm `./internal/csvformat/...` vào `make test-pure`.

---

## Task 5 — Thu gọn tầng DTO

**Phụ thuộc:** Task 2 (vì `JournalView` đã đổi cách handler lấy dữ liệu).

**Làm cuối cùng, và có lý do:** đây là candidate `Speculative` duy nhất. Nó đánh đổi *một chút* an toàn (hình dạng JSON bám vào một kiểu của `domain`) lấy ~150 dòng bớt lặp. Nếu Task 1–4 đã tiêu hết ngân sách thì **bỏ task này cũng được** — bốn task trước không phụ thuộc vào nó.

### Phạm vi Task 5 — cố ý hẹp

- [ ] **Làm:** phần **derived** của `tradeDTO` (23 field) đang chép y nguyên `metrics.Enriched`. Gắn json tag vào `metrics.Enriched` rồi nhúng.
- [ ] **KHÔNG làm:** `tradeCreateRequest` và `tradePatchRequest` giữ nguyên. Chúng *trông* như lặp nhưng thật ra đang gánh quyết định: `DisallowUnknownFields` cộng field `STT` cố ý không đọc (quy tắc 7), và `Tri[T]` ba trạng thái. Gộp chúng lại là phá quy tắc 7.
- [ ] **Cân nhắc ngược lại:** `trade_handler.go:150` đã lập luận cho hướng ngược — marshal thẳng `aggregate.Charts` thay vì giữ DTO 1-1. Task này áp đúng lập luận đó cho phần derived. Nếu lúc làm thấy `metrics` phải gánh json tag làm bẩn package thuần, **dừng lại và báo cáo** thay vì cố làm cho xong.

### 5.1 Thực hiện

- [ ] Gắn json tag vào `metrics.Enriched` (json tag là metadata của thư viện chuẩn, **không** phá quy tắc 3 — `encoding/json` không nằm trong danh sách cấm).
- [ ] Nhúng vào `tradeDTO`, giữ mapping viết tay đúng chỗ DTO thật sự khác model: `entered_at` định dạng RFC3339, `stt` bỏ qua lúc create.
- [ ] Chạy test `httpapi` — **golden file không được sửa**. Đây là cổng chặn: JSON giống hệt trước.

### 5.2 Test

- [ ] **Falsify I1:** đổi một json tag → test `httpapi` phải đỏ. Khôi phục.
- [ ] `make test` · `make test-fe` · `make e2e` xanh.

---

## Nghiệm thu cả phase

- [ ] `make test` xanh · `make test-pure` xanh · `make lint` sạch · `make test-fe` xanh · `make e2e` xanh.
- [ ] `internal/httpapi/testdata/charts.golden.json` **không đổi một byte** (`git diff --exit-code` trên file đó).
- [x] Frontend **`src/` không sửa dòng nào** (`git diff --stat frontend/src/` rỗng). Riêng `e2e/auth.spec.ts` có sửa selector — xem mục cuối tài liệu.
- [ ] Bảng số đo sau/trước điền đầy đủ:

| Chỉ số | Trước | Sau (đo thật) | Đích |
|---|---|---|---|
| Test cần Postgres | 178 | **109** | ~52 (xem ghi chú) |
| `make test-pure` | 7.5s | **5s** (dù nhận thêm 3 package) | < 15s |
| Nạp toàn bảng / dashboard | 3 | **1 / view** | 1 |
| Nạp toàn bảng / POST lệnh | 1 INSERT + 1 load | **1 INSERT + 1 load** | xem đính chính |
| Bản của luật enum | 3 | **1** | 1 |
| Interface khai báo | 0 | **5** | 5 |

**Ghi chú về con số 109:** 70 test của `service` đã rời Postgres (chạy 2.1s khi
Docker tắt). Còn lại: 52 `repository` (đúng chỗ — chúng kiểm SQL thật), 56
`httpapi` (đi qua `httptest` + server thật nên vẫn chạm DB), và 1 lượt Postgres
của contract test. Hạ tiếp 56 test `httpapi` là việc của một phase sau: nó đòi
dựng router trên store in-memory, không nằm trong phạm vi Task 1.

**Đính chính đường ghi:** plan ban đầu ghi "POST nạp toàn bảng 2 lần". Đếm lại
trong code thì `Create` làm 1 INSERT + 1 `ListByAccount` (trong `traLenh`) —
không có lần nạp thừa nào để bỏ. Lần nạp đó là BẮT BUỘC: `cum_by_trade`,
`running_peak`, `drawdown` của lệnh vừa tạo phụ thuộc toàn bộ dãy trước nó.
Task 2 vì thế gộp cặp ghi-rồi-đọc vào `CreateAndLoad` để service sở hữu ràng
buộc đó, và thêm test đếm đúng 1 lần nạp — chứ không "giảm 2 xuống 1".

- [ ] Working tree để nguyên, **không commit**. Báo cáo file nào đã đổi để chủ repo tự review.

## Rủi ro và cách chặn

| Rủi ro | Mức | Chặn bằng |
|---|---|---|
| Adapter in-memory "dễ tính" hơn Postgres → test xanh giả | **Cao** | Contract test 1.5 chạy cùng bộ test trên cả hai adapter |
| Refactor làm đổi JSON mà không ai thấy | **Cao** | Golden test + toàn bộ test `httpapi` + `make e2e`, cấm sửa file kỳ vọng |
| `JournalView` làm sai quy tắc 8 (số dư/lũy kế) | Trung bình | Falsify I2 và I3 bắt buộc ở 2.4 |
| Task 3 làm lệch thông điệp lỗi tiếng Việt | Trung bình | Giữ nguyên từng chữ; test `httpapi` đang khẳng định chúng |
| Task 5 làm bẩn package thuần `metrics` | Thấp | Có cổng dừng ở 5.0; bỏ được Task 5 mà không ảnh hưởng Task 1–4 |
| Phase phình ra thành "tiện tay sửa luôn" | Trung bình | Phạm vi chốt ở đây. Thấy bug thật thì **ghi lại**, không sửa trong phase này |

## Thứ tự và điểm dừng an toàn

Task 1 → 2 → 3 → 4 → 5. **Sau mỗi task, code ở trạng thái ship được** — dừng lại ở bất cứ ranh giới nào cũng không để lại việc dở dang. Task 1 và 2 mang phần lớn giá trị; Task 4 và 5 là dọn dẹp.

---

## Phát hiện ngoài phạm vi: 3 test e2e đã lỗi thời TỪ TRƯỚC phase này

Chạy `make e2e` trong lúc nghiệm thu lộ ra ba khẳng định trong
`frontend/e2e/auth.spec.ts` không còn khớp giao diện hiện tại. **Không phải do
Phase 6** — cả ba đều là hệ quả của hai commit frontend trước đó, và `auth.spec.ts`
lần cuối được sửa ở `bbdfb5a`, tức TRƯỚC cả hai commit đó.

| Test | Khẳng định hỏng | Nguyên nhân |
|---|---|---|
| 14 (dòng 337, 345) | `.fill()` và `toHaveValue()` trên ô "Mã sản phẩm" | `607e372` đổi ô lọc thành `SearchableSelect` — nay là `<button role="combobox">`, không phải `<input>` |
| 19 (dòng 418) | `getByRole("group", {name:"Lãi ròng"})` khớp 2 phần tử | `828728f` dựng lại dashboard, thêm một nhóm "Lãi ròng" thứ hai trong `all-metrics` |
| 20 (dòng 426, 441) | cùng nguyên nhân với test 19 | như trên |
| 21 (dòng 452) | `[data-trangthai="coLenh"]` không tồn tại | `828728f` bỏ hẳn thuộc tính này; lịch nhiệt chuyển sang `MonthCalendarCard` |

**Đã kiểm chứng backend KHÔNG liên quan:** vá tạm bốn selector đó (rồi khôi phục
nguyên trạng `auth.spec.ts`) thì 22/26 test xanh, và bốn test còn lại đều chỉ hỏng
ở tầng selector. Ngoài ra đã gọi thẳng API trên stack Docker thật:

```
/stats            → net_profit 827 · current_balance 10827 · total_trades 2
/stats?symbol=... → net_profit 777 · current_balance 10827 · total_trades 1   ← I3 đúng
/trades?symbol=EURUSD → 1 dòng, cum_by_trade 827 (không phải 50)              ← quy tắc 8 đúng
/charts           → heatmap 2 ô, longest_win_streak 2, by_symbol 2            ← dữ liệu đủ
/trades.csv       → header đúng, có BOM
```

**ĐÃ SỬA (2026-09-05), có ý thức là lệch Global Constraints.** Bản ghi trước
của mục này nói "chưa sửa, vì nằm ngoài phạm vi" — không còn đúng: bốn selector
đã được cập nhật trong `frontend/e2e/auth.spec.ts` (+26/−6).

Vì sao sửa luôn thay vì tách task: đây là *test* chứ không phải code sản phẩm,
và để nguyên thì `make e2e` đỏ 4/26 vĩnh viễn — một lưới an toàn đang đỏ sẵn
thì lần sau có ai làm hỏng thật cũng không ai nhận ra. Ràng buộc "frontend
không sửa dòng nào" sinh ra để bảo vệ *hợp đồng JSON API*, và điều đó vẫn giữ
nguyên: `src/` không đổi một byte, golden file không đổi, chỉ selector trong
tệp e2e đổi.

Sau khi sửa: `make e2e` **26/26 xanh** (39.4s), `npx tsc --noEmit` sạch.

---

## Vòng review (2026-09-03, sau khi 5 task xong)

Chạy `/code-review max` — 8 agent soi song song. Mỗi phát hiện dưới đây đã được
**tự kiểm chứng lại** trước khi sửa (agent có thể báo sai), và đã sửa xong.

### Lỗi THẬT, đã kiểm chứng bằng thực nghiệm

| # | Lỗi | Bằng chứng | Cách sửa |
|---|---|---|---|
| 1 | **`make test-pure` cần Docker** — phá đúng hợp đồng target đó tuyên bố | Chạy với `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/nonexistent.sock` → FAIL cứng (`t.Fatalf`, không phải skip) | Thêm guard `testing.Short()` vào **`testdb.New`** — một chỗ, mọi caller hiện tại và tương lai tự được bọc |
| 2 | **`Escape`/`Unescape` KHÔNG nghịch đảo** — mất dữ liệu thật | Ghi chương trình thử: `"'=SUM(A1)"` → xuất → nhập ra `"=SUM(A1)"`, mất một ký tự MỖI vòng | `Escape` bọc cả ô sẵn nháy dẫn đầu; `Unescape` gỡ tương ứng. Thêm 6 ca hồi quy |
| 3 | **`TrodenEnum` nil-deref** — panic 500 khi nhập file | Thêm enum field thứ 6 quên switch → `panic: nil pointer` ở importer, và `ValidateTrade` **lặng lẽ bỏ kiểm** trường đó | Đưa accessor thành **trường `Tro` của `EnumField`** → quên là **lỗi biên dịch**, không còn hai bảng khớp nhau bằng chuỗi |
| 4 | **4/5 seam không có contract test** | `store.go` tuyên bố "ghim bằng contract test, không bằng thiện chí" nhưng chỉ `TradeStore` có | Viết contract cho `AccountStore`, `CashFlowStore`, `UserStore`, `RefreshTokenStore` — mỗi bộ chạy **hai lượt** |
| 5 | **`memRefreshTokenStore.Revoke` lệch production** | Repo thật có `WHERE revoked_at IS NULL` (giữ mốc ĐẦU — bằng chứng token bị dùng lại); fake ghi đè | Sửa fake; contract mới bắt được (đã falsify: bỏ fix → đỏ) |
| 6 | **`memAccountStore.Update` nghiêm hơn production** | Fake trả `ErrNotFound`, repo thật trả `nil` (không kiểm `RowsAffected`) | Sửa fake khớp production |
| 7 | **Purity test bỏ sót `csvformat` + `domain`** | Cả hai tự khai "package THUẦN" và đã vào lane `test-pure`, nhưng không ai canh | Mở rộng danh sách lên 5 package; đổi tên test cho khớp |
| 8 | **`Create` trả 500 cho một race có thật** | `CreateAndLoad` là hai lời gọi tách rời; xoá mềm chen giữa → lệnh ĐÃ tạo nhưng client tưởng thất bại → tạo trùng | Dùng lại đường lui của `traLenh` (trả bản thô), tách thành `traLenhTho` |
| 9 | **`CSVRows()` trả lát cắt gốc** | Một view phục vụ nhiều cách đọc; người gọi sắp xếp tại chỗ sẽ xáo dãy cho `KPI()`/`Charts()` gọi sau | Trả bản sao, như `Page()` đã làm |
| 10 | **`validateTradeInput` chép ngược thiếu** | Chỉ chép 3 trường — đúng tập domain chuẩn hoá HÔM NAY | Bỏ hẳn bản chép ngược: `lenhTuInput` trả thẳng `domain.Trade`. Đã kiểm: thêm chuẩn hoá mới ở domain thì đường API tự nhận |
| 11 | Wrapper chết `importer.NormalizeEnum` | Chỉ test của chính nó gọi; dựng `EnumField` nửa vời | Xoá; test trỏ thẳng `domain.EnumField.MatchEnum` |
| 12 | `Cot[:18]` hardcode + comment cũ nhắc `Read`/`ReadResult` | Chèn cột sẽ lặng lẽ đảo ý nghĩa hai test cấu trúc | Hằng `SoCotInput` + test canh ranh giới; dọn hết comment cũ |

### Đã bác bỏ (agent báo nhưng kiểm ra KHÔNG phải lỗi)

- **`rune(s[0])` byte-vs-rune trong `csvformat`**: quét toàn bộ Unicode → 0 false positive. Byte dẫn UTF-8 luôn ≥ 0xC0, còn tập ký tự công thức toàn ASCII. **Không sửa logic**, chỉ thêm `TestKyTuCongThucPhaiToanASCII` canh bất biến ngầm đó.
- **Nhúng `metrics.Enriched` gây trùng khoá JSON**: diff hai tập tag → 0 trùng, `Trade` đã `json:"-"`. Golden file không đổi một byte.
- **`memTradeStore` mutex deadlock**: `-race` sạch; helper không khoá, mỗi method khoá đúng một lần.

### Còn nợ, CỐ Ý không làm trong vòng này

- **Fake không mô phỏng `NUMERIC(18,2)` rounding và cắt timestamp về micro giây.** Có thật (đã đo: `100.005` → fake `100.005`, Postgres `100.01`). Không sửa vì đây là **thay đổi hành vi**, không phải sửa lỗi: cần chốt xem service có nên thấy giá trị đã làm tròn hay không. Giảm nhẹ: 52 test `repository` + 56 test `httpapi` vẫn chạy trên Postgres thật.
- **56 test `httpapi` vẫn cần Docker** (đi qua `httptest` + server thật). Hạ tiếp cần dựng router trên store in-memory — một phase riêng.

### Trạng thái sau vòng sửa

`make test` · `make test-pure` (5s, **đã kiểm chứng chạy được khi Docker hỏng**) · `make lint` · `make test-fe` (469 test) · `make e2e` (**26/26**) — tất cả xanh. Golden file và JSON API không đổi một byte.

---

## Vòng review 2 (2026-09-05, sau đợt đổi định danh Việt → Anh)

Dispatch một reviewer đọc nguyên phạm vi `607e372..working tree`. Không có
phát hiện **Critical**. Reviewer tự chạy kiểm chứng chứ không chỉ đọc: quét
vét cạn round-trip `Escape`/`Unescape` trên mọi chuỗi độ dài ≤4 (0 lỗi), và
so tập hợp string literal tiếng Việt hai đầu revision (0 chuỗi mất).

Bốn mục đã sửa trong vòng này:

| # | Phát hiện | Đã làm |
|---|---|---|
| 1 | `ListDeletedByAccount` cam kết thứ tự trong comment nhưng contract test chỉ kiểm *lọc* | Thêm 2 subtest ghim cả hai khoá sắp xếp, chạy trên **cả hai** adapter |
| 2 | Nửa HEADER của round-trip vẫn do test **chép tay** `normalizeColumnName` giữ | Dời hàm vào `csvformat.NormalizeColumnName`, importer và test cùng gọi bản thật; thêm `TestEveryAliasIsAlreadyNormalized` |
| 3 | `EnumField.Name` mang 3 vai (thông điệp, khoá alias CSV, **tên cột SQL**) nhưng comment mô tả như chuỗi hiển thị | Viết lại doc nêu rõ 3 vai; thêm `TestEnumFieldNameIsTheSharedKey` |
| 4 | Plan nói "chưa sửa frontend" trong khi cây code đã sửa | Cập nhật tài liệu (mục trên) cho khớp thực tế |

Cùng với đó: `WriteCSVFor` gọi `csvformat.Header()` thay vì ghi thẳng slice
gốc (bản sao phòng vệ vốn có test nhưng chỗ dùng thật lại đi vòng qua nó); 4
entrypoint `_Postgres` còn thiếu `testing.Short()` đã thêm; dọn nốt ~10 định
danh tiếng Việt còn sót (`ten`, `lo`, `cam`) và **2 chỗ dịch sai** của đợt
trước — `khoa` (= *khoá*/key) bị dịch máy móc thành `locked`, nay là `key`.

**Điểm đáng ghi lại về phương pháp:** cả hai test mới ở mục 1 đều được kiểm
bằng cách **phá cài đặt rồi xem chúng có đỏ không** (bỏ `ORDER BY` ở repo
thật, bỏ `sort.SliceStable` ở fake) — cả hai đỏ trên cả hai adapter, rồi mới
khôi phục. Một test mới viết mà chưa từng thấy nó đỏ thì chưa biết nó có
răng hay không.

Nghiệm thu lần cuối, **có Docker** (vòng review chạy trên máy không có Docker
nên lane Postgres khi đó chưa được kiểm):

```
make lint      sạch
make test-pure 8 package xanh
make test      13 package xanh — GỒM repository + httpapi + contract _Postgres
make test-fe   55 file / 469 test xanh, tsc sạch, build xong
make e2e       26/26 xanh (39.4s)
```

616 test backend cấp cao nhất. Golden file không đổi một byte. 0 chuỗi tiếng
Việt bị mất so với `607e372`.
