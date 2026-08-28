# Phase 5 — Import / Export CSV: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổ được file Excel cũ (đã export sang CSV) vào một account, có preview + dry-run trước khi ghi; và xuất ngược danh sách lệnh ra CSV theo bộ lọc đang xem. Đây là phase cuối của roadmap ở spec mẹ §10.

**Architecture:** Một package thuần mới `internal/importer` — parse + map + validate CSV, **không** chạm DB, không `net/http`, không `context`. Nó là chỗ duy nhất biết về header tiếng Việt của Excel và về mapping `BUY/SELL → Long/Short`. Service ghép nó với `TradeRepo` qua một đường ghi hàng loạt mới. Export đi hướng ngược lại, dùng lại `metrics.Enriched` mà `TradeService.Read` đã dựng sẵn nên không có công thức nào bị viết lại lần hai.

**Tech Stack:** Go 1.23 · `encoding/csv` (thư viện chuẩn, **không thêm dependency**) · chi · GORM · Postgres 16 · React 19 · TanStack Query v5 · Vitest + MSW.

**Spec:** `docs/superpowers/specs/2026-08-16-trading-journal-design.md` §8.4, §10 · `trading-journal-plan.md` §0 (bảng cột), §1 (enum + ràng buộc direction)

## Quyết định đã chốt trước khi viết plan

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Định dạng import | **CSV only.** Không thêm excelize. User export Excel → CSV. Bỏ được một dependency ~5MB cùng toàn bộ mã xử lý serial date và merged cell của Excel. |
| 2 | Tầng chạy | **API + trang `/import`.** `POST /api/accounts/{id}/import`, `dry_run` quyết định có ghi hay không. |
| 3 | Nội dung export | **CSV lệnh, gồm cả cột derived.** Layout theo `trading-journal-plan.md` §0 để mở ra giống file gốc; 17 cột input vẫn đủ nên round-trip lại được. |

## Global Constraints

Mọi task đều ngầm mang theo mục này.

- **Tiền là `decimal.Decimal`, không bao giờ `float64`** — kể cả khi parse CSV. Dùng `decimal.NewFromString`, cấm `strconv.ParseFloat`.
- **`internal/importer` là package thuần.** Cấm import GORM, `net/http`, `database/sql`, `context`. Test của nó chạy không cần Docker, và phải nằm trong `make test-pure`.
- **Chuỗi enum tiếng Việt copy nguyên văn** từ `domain` — cấm gõ lại chuỗi literal trong `importer`, phải tham chiếu hằng số của `domain`.
- **Không lưu trường suy diễn.** Cột derived trong file import bị **bỏ qua**, không đọc. Cột derived trong file export được tính lúc xuất, không lấy từ DB.
- **`stt` do backend cấp.** Cột STT trong file import bị bỏ qua (quy tắc 7 của CLAUDE.md). Thứ tự `stt` cấp theo thứ tự dòng trong file.
- **`entered_at` lưu UTC**, quy đổi từ ngày trong file theo `accounts.timezone`. Không hardcode `+7`.
- **Import là all-or-nothing**: một transaction, có lỗi thì rollback sạch. Không có trạng thái "nhập được một nửa".
- Mỗi task chạy test thật rồi mới đánh dấu xong. Mỗi bất biến ghi trong plan phải **falsify**: phá thật, xem test đỏ, khôi phục.
- Lệnh test: `make test-pure` (importer) · `make test` (cần Docker) · `make test-fe`.

## Ràng buộc bắt buộc — direction

`trading-journal-plan.md` §1 ghi rõ, và đây là lý do phase này tồn tại được: file Excel gốc lưu `BUY`/`SELL`, web lưu `Long`/`Short`. Parser **phải** nhận cả bốn chuỗi, so sánh không phân biệt hoa thường:

| Chuỗi trong file | Lưu vào DB |
|---|---|
| `BUY`, `Long` | `Long` |
| `SELL`, `Short` | `Short` |

Thiếu mapping này thì **mọi dòng** của file cũ fail ở cột direction. Task 2 có test ghim đúng bốn chuỗi này.

## Bản đồ file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `backend/internal/importer/header.go` | nhận diện header tiếng Việt §0 → chỉ số cột |
| `backend/internal/importer/parse.go` | CSV → `[]RowResult`; chỗ **duy nhất** biết layout file |
| `backend/internal/importer/normalize.go` | `BUY/SELL → Long/Short`, trim, chuẩn hoá enum, parse ngày & số |
| `backend/internal/importer/importer_test.go` | table-driven, chạy trong `make test-pure` |
| `backend/internal/importer/testdata/*.csv` | file mẫu: hợp lệ, có BUY/SELL, hỏng từng kiểu |
| `backend/internal/exporter/csv.go` | `[]metrics.Enriched` → CSV theo layout §0 |
| `backend/internal/exporter/csv_test.go` | ghim thứ tự cột và định dạng số |
| `backend/internal/service/import.go` | ghép importer + repo, transaction, dry-run |
| `backend/internal/service/import_test.go` | test service, cần Docker |
| `backend/internal/httpapi/import_handler.go` | multipart upload, `dry_run`, envelope |
| `backend/internal/httpapi/import_handler_test.go` | test handler |
| `backend/internal/httpapi/export_handler.go` | trả `text/csv` + `Content-Disposition` |
| `backend/internal/httpapi/export_handler_test.go` | test handler |
| `frontend/src/features/import/types.ts` | kiểu của báo cáo import |
| `frontend/src/features/import/hooks.ts` | `useImportPreview`, `useImportCommit` |
| `frontend/src/features/import/ImportPage.tsx` | chọn file → preview → xác nhận |
| `frontend/src/features/import/PreviewTable.tsx` | bảng dòng lỗi + dòng hợp lệ |
| `frontend/src/features/import/import.test.tsx` | test trang |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `backend/internal/repository/trade.go` | thêm `CreateBatch` — một transaction, một lần cấp dãy `stt` |
| `backend/internal/repository/trade_test.go` | test `CreateBatch` giữ đúng thứ tự `stt` |
| `backend/internal/httpapi/router.go` | thêm `POST /accounts/{id}/import`, `GET /accounts/{id}/trades.csv` |
| `backend/Makefile` (gốc repo) | `test-pure` thêm `./internal/importer/... ./internal/exporter/...` |
| `frontend/src/lib/api.ts` | thêm `postForm` (multipart) và `getBlob` (tải file) |
| `frontend/src/lib/queryKeys.ts` | khoá cho import |
| `frontend/src/app/router.tsx` | route `/import` |
| `frontend/src/app/AppShell.tsx` | NavLink `/import` |
| `frontend/src/features/trades/TradesPage.tsx` | nút "Xuất CSV" dùng bộ lọc hiện tại |
| `frontend/src/i18n/strings.ts` | chuỗi import/export |

---

### Task 1: `CreateBatch` — đường ghi hàng loạt

`TradeRepo.Create` khoá hàng account rồi `MAX(stt)+1` cho **mỗi** lệnh. Gọi nó 500 lần là 500 transaction lồng nhau và 500 lần khoá — chậm, và tệ hơn là không nguyên tử: đứt giữa chừng để lại nửa file trong DB.

**Files:**
- Modify: `backend/internal/repository/trade.go`
- Test: `backend/internal/repository/trade_test.go` (đã có, nối thêm)

**Interfaces:**
- Consumes: `domain.Trade`
- Provides: `func (r *TradeRepo) CreateBatch(ctx context.Context, accountID int64, ts []domain.Trade) ([]domain.Trade, error)`

**Steps:**
- [ ] Viết test trước: chèn 3 lệnh vào account đã có 2 lệnh → `stt` ra `3,4,5` đúng thứ tự slice đầu vào.
- [ ] Test: một lệnh trong lô vi phạm CHECK (direction rác) → **không lệnh nào** được ghi, `ListByAccount` vẫn trả đúng 2 lệnh cũ.
- [ ] Test: lô rỗng → trả slice rỗng, không lỗi, không mở transaction thừa.
- [ ] Cài đặt: một `Transaction`, `SELECT id FROM accounts WHERE id = ? FOR UPDATE` **một lần**, `COALESCE(MAX(stt),0)` một lần, rồi gán `stt = base+i+1` và `tx.CreateInBatches`.
- [ ] Ghi comment nêu rõ vì sao khoá một lần thay vì mỗi dòng một lần.
- [ ] `make test` xanh.

**Falsify:** bỏ `FOR UPDATE` → test chạy song song hai lô phải đỏ vì trùng `stt`.

---

### Task 2: `importer` — chuẩn hoá giá trị (package thuần)

Task này trước parse, vì parse đứng trên nó. Đây là chỗ ràng buộc `BUY/SELL` sống.

**Files:**
- Create: `backend/internal/importer/normalize.go`, `backend/internal/importer/importer_test.go`

**Interfaces:**
- Consumes: `domain` (hằng số enum)
- Provides:
  - `func NormalizeDirection(s string) (string, error)`
  - `func NormalizeEnum(s string, allowed []string) (string, error)` — rỗng là hợp lệ, trả rỗng
  - `func ParseMoney(s string) (decimal.Decimal, error)` — rỗng → 0
  - `func ParseMoneyPtr(s string) (*decimal.Decimal, error)` — rỗng → nil
  - `func ParseDay(s string, loc *time.Location) (time.Time, error)`

**Steps:**
- [ ] Test `NormalizeDirection` ghim **cả bốn** chuỗi + biến thể hoa thường: `BUY`,`buy`,`Long`,`LONG` → `Long`; `SELL`,`sell`,`Short` → `Short`; `""` và `"XYZ"` → lỗi.
- [ ] Test `ParseMoney`: `"1234.56"`, `"-500"`, `"1,234.56"` (dấu phẩy ngăn nghìn của Excel), `""` → 0, `"abc"` → lỗi. **Cấm `ParseFloat`** — dùng `decimal.NewFromString` sau khi đã bỏ dấu phẩy.
- [ ] Test `ParseMoneyPtr`: `""` → nil (đây là `profit_theory` để trống của fixture STT 4), `"0"` → con trỏ tới 0. Hai thứ này **khác nhau** và test phải phân biệt.
- [ ] Test `ParseDay`: `"2026-06-09"`, `"09/06/2026"`, `"6/9/2026"`; với `loc = Asia/Ho_Chi_Minh` → `entered_at` là 12:00 giờ VN quy về UTC (`05:00Z`). Chọn 12:00 chứ không phải 00:00 để lệch timezone không đẩy lệnh sang ngày khác.
- [ ] Test `NormalizeEnum` với `domain.Psychologies`: khớp nguyên văn kể cả dấu tiếng Việt; `""` hợp lệ; sai chính tả → lỗi có nêu tên cột.
- [ ] Cài đặt. Cấm gõ lại chuỗi enum literal — tham chiếu `domain.*`.
- [ ] `make test-pure` xanh, chạy dưới 1 giây.

**Falsify:** xoá nhánh `BUY` → test đỏ ngay dòng đầu.

---

### Task 3: `importer` — header và parse

**Files:**
- Create: `backend/internal/importer/header.go`, `backend/internal/importer/parse.go`, `backend/internal/importer/testdata/*.csv`

**Interfaces:**
- Provides:
  - `type RowError struct { Line int; Column string; Msg string }`
  - `type Report struct { Rows []domain.Trade; Errors []RowError; Skipped int }`
  - `func Parse(r io.Reader, loc *time.Location) (Report, error)`

**Steps:**
- [ ] `testdata/happy.csv`: header tiếng Việt đúng §0, 4 dòng khớp golden fixture của spec §7.
- [ ] `testdata/excel_buy_sell.csv`: y hệt nhưng direction là `BUY`/`SELL` → parse ra cùng kết quả. Đây là test chứng minh đọc được file cũ.
- [ ] `testdata/broken.csv`: dòng 2 direction rác, dòng 4 profit rác, dòng 5 thiếu symbol → `Report.Errors` có đúng 3 phần tử, **kèm số dòng đúng** (tính cả dòng header), và `Rows` chứa các dòng còn lại.
- [ ] Test header: nhận diện không phân biệt hoa thường và bỏ khoảng trắng thừa (`"Long/ Short"` có dấu cách lẻ trong file gốc). Thiếu cột bắt buộc (`Day`, `Symbol`, `Profit`) → lỗi cấp file, không phải lỗi dòng.
- [ ] Test: cột derived (`Tổng điểm`, `Profit cộng dồn…`, `Drawdown`) có trong file thì **bỏ qua im lặng**, không lỗi, không ghi.
- [ ] Test: cột `STT` và `Account` bị bỏ qua.
- [ ] Test: dòng trống hoàn toàn → tăng `Skipped`, không tính là lỗi (Excel export hay để lại dòng trống ở cuối).
- [ ] Test: BOM `﻿` ở đầu file không làm hỏng nhận diện cột đầu tiên.
- [ ] Cài đặt bằng `encoding/csv`, `FieldsPerRecord = -1`.
- [ ] `make test-pure` xanh.

**Falsify:** đổi một tên cột trong `header.go` → test header đỏ.

---

### Task 4: `exporter` — CSV ra (package thuần)

**Files:**
- Create: `backend/internal/exporter/csv.go`, `backend/internal/exporter/csv_test.go`

**Interfaces:**
- Consumes: `[]metrics.Enriched`
- Provides: `func WriteCSV(w io.Writer, rows []metrics.Enriched) error`

**Steps:**
- [ ] Test ghim **thứ tự cột nguyên văn** theo `trading-journal-plan.md` §0: input trước (STT…Notes), rồi derived (Loại lệnh, Điểm…, Week, Month, net, cum_*, Running Peak, Drawdown).
- [ ] Test: tiền ra chuỗi từ `decimal.String()`, **không** qua `float`. Ghim một số 18 chữ số để lộ ngay nếu ai đó chèn `float64`.
- [ ] Test: `score_total = nil` (lệnh chưa chấm) ra ô **rỗng**, không phải `0`. Cùng lý do §2.5 của plan gốc: `0` đọc thành "chấm 0 điểm".
- [ ] Test: `profit_theory = nil` ra ô rỗng.
- [ ] Test: `notes` chứa dấu phẩy và xuống dòng được `encoding/csv` bọc ngoặc đúng.
- [ ] Test: ghi BOM `﻿` đầu file để Excel mở tiếng Việt không lỗi font.
- [ ] Test round-trip: `WriteCSV` rồi `importer.Parse` lại → 17 trường input khớp nguyên vẹn.
- [ ] `make test-pure` xanh.

**Falsify:** đổi `score_total` nil sang xuất `0` → test đỏ.

---

### Task 5: `ImportService` — ghép và transaction

**Files:**
- Create: `backend/internal/service/import.go`, `backend/internal/service/import_test.go`

**Interfaces:**
- Consumes: `importer.Parse`, `repository.TradeRepo.CreateBatch`, `domain.Account`
- Provides: `func (s *ImportService) Import(ctx context.Context, acc domain.Account, r io.Reader, dryRun bool) (importer.Report, error)`

**Steps:**
- [ ] Test: `dryRun = true` với file sạch → `Report` báo đủ số dòng, và `ListByAccount` sau đó vẫn **rỗng**. Đây là bất biến quan trọng nhất của task.
- [ ] Test: `dryRun = false` với file sạch → lệnh vào DB, `stt` liên tiếp từ `MAX+1`.
- [ ] Test: file có dòng lỗi + `dryRun = false` → **không ghi gì cả**, trả `Report` có `Errors`. All-or-nothing, không nhập một nửa.
- [ ] Test: timezone của account quyết định `entered_at`. Cùng file, account `UTC` và account `Asia/Ho_Chi_Minh` cho hai giá trị `entered_at` khác nhau nhưng cùng `day`.
- [ ] Test: account có timezone rác → lỗi validate, không panic.
- [ ] Test: giới hạn kích thước — file vượt ngưỡng (chốt 5MB) → lỗi validate rõ ràng.
- [ ] Cài đặt: nạp `time.LoadLocation(acc.Timezone)`, gọi `importer.Parse`, nếu `len(Errors) > 0` hoặc `dryRun` thì trả sớm, ngược lại `CreateBatch`.
- [ ] `make test` xanh.

**Falsify:** đảo điều kiện `dryRun` → test đầu tiên đỏ.

---

### Task 6: HTTP — endpoint import và export

**Files:**
- Create: `backend/internal/httpapi/import_handler.go`, `export_handler.go` + hai file test
- Modify: `backend/internal/httpapi/router.go`

**Interfaces:**
- Provides:
  - `POST /api/accounts/{id}/import` — multipart, field `file`, query `?dry_run=true|false`
  - `GET /api/accounts/{id}/trades.csv` — nhận **cùng bộ query filter** như `GET /trades`

**Steps:**
- [ ] Test import: multipart hợp lệ + `dry_run=true` → 200, envelope `code: 0`, body có `rows`, `errors`, `skipped`.
- [ ] Test: thiếu field `file` → 400/1400 với thông điệp tiếng Việt.
- [ ] Test: `dry_run` mặc định — **không có tham số thì coi như `true`**. Ghi rõ trong comment: mặc định phải là nhánh an toàn, không phải nhánh ghi.
- [ ] Test: account của user khác → 403 qua `RequireAccount` có sẵn.
- [ ] Test export: trả `Content-Type: text/csv; charset=utf-8` và `Content-Disposition: attachment; filename="..."`. Export **không** bọc envelope — nó là file, không phải JSON.
- [ ] Test export: bộ lọc `?symbol=XAUUSD` chỉ ra dòng khớp; dùng lại `filterFromQuery` có sẵn, không viết bản thứ hai.
- [ ] Test export: account rỗng → chỉ có dòng header, không lỗi.
- [ ] Mount route trong `router.go` dưới `RequireAccount`, đặt cạnh nhánh trade.
- [ ] `make test` + `make lint` xanh.

**Falsify:** đổi mặc định `dry_run` thành `false` → test mặc định an toàn đỏ.

---

### Task 7: Frontend — API client cho file

**Files:**
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/queryKeys.ts`
- Test: `frontend/src/lib/api.test.ts` (đã có, nối thêm)

**Steps:**
- [ ] Test: `postForm` **không** đặt `Content-Type` thủ công — trình duyệt phải tự sinh boundary. Đặt tay là hỏng, và hỏng im lặng.
- [ ] Test: `postForm` vẫn gắn `Authorization` và vẫn đi qua nhánh tự refresh khi 401, y như `call` hiện tại.
- [ ] Test: `getBlob` trả `Blob`, không cố `JSON.parse`; lỗi HTTP vẫn đọc envelope để hiện đúng thông điệp.
- [ ] `npx tsc --noEmit` sạch.

---

### Task 8: Frontend — trang `/import`

**Files:**
- Create: `frontend/src/features/import/{types.ts,hooks.ts,ImportPage.tsx,PreviewTable.tsx,import.test.tsx}`
- Modify: `frontend/src/app/router.tsx`, `AppShell.tsx`, `i18n/strings.ts`

**Steps:**
- [ ] Test: chọn file → tự gọi dry-run → hiện bảng preview với số dòng hợp lệ và bảng lỗi kèm **số dòng + tên cột**.
- [ ] Test: có lỗi thì nút "Nhập" **bị vô hiệu hoá** — không cho ghi khi file còn hỏng.
- [ ] Test: file sạch → bấm "Nhập" gọi `dry_run=false`, xong thì invalidate khoá trades/stats/charts để `/trades` và `/dashboard` cập nhật ngay.
- [ ] Test: đang tải thì hiện trạng thái chờ, không cho bấm hai lần.
- [ ] Test: chưa chọn account → `AccountGate` chặn, như các trang khác.
- [ ] Dùng biến ngữ nghĩa của theme; lỗi dùng `--status-error`. Không hardcode hex, không `shadow-*`.
- [ ] Chuỗi đi qua i18n cả `vi` lẫn `en`, không hardcode trong component.
- [ ] `make test-fe` xanh.

---

### Task 9: Frontend — nút xuất CSV

**Files:**
- Modify: `frontend/src/features/trades/TradesPage.tsx`, `i18n/strings.ts`
- Test: `frontend/src/features/trades/tradesPage.test.tsx` (đã có, nối thêm)

**Steps:**
- [ ] Test: nút "Xuất CSV" gọi đúng URL **kèm bộ lọc đang xem** — xuất phải khớp cái đang nhìn thấy, không phải toàn bộ account.
- [ ] Test: tên file có mã account và ngày, ví dụ `ACC1-2026-08-28.csv`.
- [ ] Test: danh sách rỗng thì nút vẫn bấm được (ra file chỉ có header) — hoặc bị vô hiệu hoá, chọn một và ghim bằng test.
- [ ] `make test-fe` xanh.

---

### Task 10: E2E và dọn cuối

**Files:**
- Modify: `frontend/e2e/*.spec.ts`, `Makefile`, `README`/`CLAUDE.md` nếu cần

**Steps:**
- [ ] E2E: đăng nhập → `/import` → upload CSV mẫu → preview → xác nhận → `/trades` thấy đủ lệnh, `/dashboard` KPI khác 0.
- [ ] E2E: xuất CSV từ `/trades`, kiểm file tải về có dòng header.
- [ ] `Makefile`: `test-pure` bao gồm `./internal/importer/...` và `./internal/exporter/...`; chạy thử để chắc vẫn **không cần Docker** và vẫn dưới 1 giây.
- [ ] Chạy đủ ba lệnh: `make test-pure`, `make test`, `make test-fe`. Báo kết quả thật.
- [ ] Rà lại: `git diff main --stat` không đụng `docs/design/theme.css` và `frontend/src/styles/theme.css`.

---

## Rủi ro đã lường

| rủi ro | cách xử |
|---|---|
| File Excel export ra CSV bằng dấu `;` (locale châu Âu) | Task 3 dò dấu phân cách từ dòng header trước khi parse |
| Ngày ở định dạng lạ | Task 2 nhận 3 định dạng phổ biến, còn lại báo lỗi dòng có nêu giá trị gặp phải |
| File lớn làm nghẽn request | Task 5 chốt trần 5MB; vượt thì lỗi validate rõ ràng, không để timeout |
| `stt` đụng nhau khi hai import chạy song song | Task 1 khoá hàng account bằng `FOR UPDATE`, y như `Create` hiện tại |
| Người dùng import nhầm hai lần | Ngoài phạm vi phase này — không chống trùng. Ghi rõ trong UI rằng import chỉ thêm, không thay thế; xoá thì dùng thùng rác |
