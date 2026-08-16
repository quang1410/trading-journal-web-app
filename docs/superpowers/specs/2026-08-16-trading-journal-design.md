# Thiết kế — Trading Journal Web App

Ngày: 2026-08-16
Trạng thái: chờ duyệt để chuyển sang implementation plan

## 1. Bối cảnh và nguồn spec

Số hoá một file Excel nhật ký giao dịch. Nguồn sự thật duy nhất về nghiệp vụ là
[`trading-journal-plan.md`](../../../trading-journal-plan.md) — spec trích trực tiếp từ công thức Excel
gốc, gồm bảng chấm điểm §2, trường suy diễn §3, KPI §4, aggregation §5, edge case §6 và
golden fixture §7.

`CLAUDE.md` hiện tại trong repo mô tả một sản phẩm khác (stack Next.js + go-zero, data model
ICT với `macro_window`/SMT/risk-guard). Nó **đã lỗi thời và sẽ được viết lại** theo thiết kế này.
Không port bất cứ thứ gì từ đó.

Repo hiện chưa có code — đây là dự án mới hoàn toàn.

## 2. Quyết định đã chốt

| # | Quyết định | Chốt |
|---|---|---|
| 1 | Nguồn spec | `trading-journal-plan.md`; bỏ `CLAUDE.md` cũ |
| 2 | Phạm vi user | Multi-user từ đầu (bảng `users` + JWT, mọi query scope theo user) |
| 3 | Nhập liệu | Nhập tay trước; import CSV/Excel để phase cuối |
| 4 | Dashboard | Làm đủ 12 nhóm §5 + toàn bộ KPI §4 |
| 5 | `week` | **ISO-8601** (`time.ISOWeek`), không dùng `WEEKNUM(...,1)` kiểu Excel |
| 6 | `net = 0` | `win_loss = 1`, `win_sign = 1`, nhưng **không** vào `win_count`/`loss_count`/`total_trades` |
| 7 | `one_R` | `initial_balance × risk_per_trade`, **cố định theo vốn ban đầu** |
| 8 | Lệnh chưa chấm điểm | `score_total = null`, `trade_class = "CHƯA ĐÁNH GIÁ"`, loại khỏi avg score và radar |
| 9 | Kiến trúc tính toán | Pure compute trong Go, tính lại mỗi request; **không** lưu trường suy diễn |
| 10 | Tầng DB | GORM + Postgres 16 |
| 11 | Frontend | Vite + React 19 + TypeScript (React thuần, **không** Next.js) |
| 12 | Theme | `docs/design/theme.css` do user cấp — nguồn sự thật, không sửa |
| 13 | Màu P&L | Lãi = `--primary` teal `#12b886`; lỗ = `--status-error` `#ef4444` |
| 14 | Thời gian | Lưu `entered_at TIMESTAMPTZ` **UTC**; form nhập ngày **và giờ** |
| 15 | Timezone gom nhóm | Theo `accounts.timezone` (IANA, mặc định `Asia/Ho_Chi_Minh`), **không** theo timezone trình duyệt |

## 3. Kiến trúc

```
Browser (Vite SPA — dev :5173, prod nginx :8080)
   │  fetch /api/*   Authorization: Bearer <access token>
   ▼
journal-api (Go 1.23, chi, :8000)
   handler → service → repository (GORM) → Postgres 16
                └── scoring / metrics / aggregate  (pure, không chạm DB)
```

Toàn bộ chạy bằng `docker compose up`. Ba service: `db`, `api`, `web`.

**Nguyên tắc bất biến:** ba package `scoring`, `metrics`, `aggregate` không import GORM,
không import `net/http`, không nhận `context.Context`. Chúng nhận slice trade + config account
và trả struct. Đây là điều kiện để golden fixture §7 chạy như unit test thuần, không cần Docker.

Vì sao không đẩy tính toán xuống SQL: bảng chấm điểm §2 dùng chuỗi tiếng Việt làm key và
công thức lũy kế/drawdown/streak phụ thuộc thứ tự — viết trong SQL vừa khó test (bắt buộc có
Postgres) vừa khó đọc. Quy mô vài nghìn lệnh/account, tính trong RAM tốn dưới 1ms.

Cache kết quả theo account là tối ưu hoá có thể thêm sau mà không đổi kiến trúc; **không làm bây giờ**.

## 4. Repo layout

```
backend/
  cmd/api/main.go
  internal/
    domain/          # Trade, Account, User, enum §1 — không phụ thuộc gì
    scoring/         # §2: map điểm 4 trục, score_total, trade_class      (pure)
    metrics/         # §3 derived per-trade + §4 KPI account              (pure)
    aggregate/       # §5: 12 pivot, R-binning, streak, heatmap           (pure)
    repository/      # GORM: TradeRepo, AccountRepo, UserRepo, CashFlowRepo
    service/         # ghép repo + pure package, transaction
    http/            # chi router, handler, middleware (auth, envelope, recover, log)
    auth/            # JWT, argon2id
    config/          # đọc env
  migrations/        # golang-migrate, .up.sql/.down.sql đánh số
  Dockerfile
frontend/
  src/
    app/             # router, providers (QueryClient, ThemeProvider)
    components/ui/   # shadcn
    components/      # component dùng chung (StatTile, MoneyText, DataTable…)
    features/
      auth/ accounts/ trades/ dashboard/ import/
    lib/             # api client, unwrap envelope, format tiền/%/R, decimal
    styles/          # theme.css (copy từ docs/design), bridge.css
  Dockerfile         # build → nginx
docs/
  design/theme.css
  superpowers/specs/
docker-compose.yml
docker-compose.dev.yml
Makefile
```

## 5. Data model

Tiền dùng `NUMERIC`, **không bao giờ** `float`. Trong Go dùng `shopspring/decimal`;
serialize JSON dưới dạng **string** để frontend không mất precision.

### 5.1 `users`

| cột | kiểu | ghi chú |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `email` | TEXT UNIQUE NOT NULL | |
| `password_hash` | TEXT NOT NULL | argon2id |
| `created_at` | TIMESTAMPTZ | |

### 5.2 `accounts`

| cột | kiểu | ghi chú |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `user_id` | BIGINT FK → users | |
| `code` | TEXT NOT NULL | ví dụ `ACC1`; UNIQUE `(user_id, code)` |
| `name` | TEXT | |
| `initial_balance` | NUMERIC(18,2) NOT NULL | `IB` trong §4 |
| `risk_per_trade` | NUMERIC(6,4) NOT NULL DEFAULT 0.01 | 0.01 = 1% |
| `currency` | TEXT NOT NULL DEFAULT 'USD' | |
| `timezone` | TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' | tên IANA; quyết định mọi phép gom nhóm theo ngày |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 5.3 `trades` — chỉ 17 trường input của §0, cộng `stt` do backend cấp

(Form nhập liệu vì thế có 16 field: 17 trường input trừ `account_code`, vốn suy ra từ URL.)

| cột | kiểu | ghi chú |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `account_id` | BIGINT FK → accounts | |
| `stt` | INT NOT NULL | backend cấp; UNIQUE `(account_id, stt)` |
| `entered_at` | TIMESTAMPTZ NOT NULL | thời điểm vào lệnh, lưu **UTC**; thay cho cột `day` của Excel |
| `symbol` | TEXT NOT NULL | |
| `direction` | TEXT NOT NULL | CHECK ∈ {`Long`,`Short`} |
| `entry` / `exit` | NUMERIC(18,5) | giá |
| `volume` | NUMERIC(18,4) | |
| `profit` | NUMERIC(18,2) NOT NULL | |
| `profit_theory` | NUMERIC(18,2) NULL | fixture STT 4 để trống |
| `fee` | NUMERIC(18,2) NOT NULL DEFAULT 0 | |
| `setup` | TEXT NOT NULL DEFAULT 'KHÔNG CÓ SETUP' | user tự định nghĩa, không CHECK |
| `timeframe` | TEXT | CHECK ∈ {M1,M5,M15,M30,H1,H4,D1,W} |
| `entry_quality` | TEXT | CHECK theo §1, cho phép rỗng |
| `in_trade_quality` | TEXT | CHECK theo §1, cho phép rỗng |
| `exit_quality` | TEXT | CHECK theo §1, cho phép rỗng |
| `psychology` | TEXT | CHECK theo §1, cho phép rỗng |
| `notes` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ NULL | soft delete, có index |

Index: `(account_id, stt)` unique, `(account_id, entered_at)`, `(deleted_at)`.

**Không có cột** cho `day`, `net`, `score_*`, `trade_class`, `week`, `month`, `weekday`,
`cum_*`, `running_peak`, `drawdown`. Tất cả là derived, tính lúc đọc.

Giá trị enum lưu **đúng chuỗi tiếng Việt** trong §1 vì chúng là key chấm điểm. Nếu sau này
đổi text hiển thị, phải thêm cột `code` ổn định — không đổi chuỗi trong DB.

### 5.4 `cash_flows`

| cột | kiểu | ghi chú |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `account_id` | BIGINT FK | |
| `date` | DATE NOT NULL | |
| `amount` | NUMERIC(18,2) NOT NULL | luôn dương |
| `type` | TEXT NOT NULL | CHECK ∈ {`deposit`,`withdraw`} |
| `note` | TEXT | |

Cần cho `current_balance = IB + net_profit + Σnạp − Σrút` (§4).

### 5.5 Quy tắc `stt`

`stt` quyết định thứ tự lũy kế nên **frontend không được gửi**. Khi tạo lệnh, backend lấy
`max(stt)+1` trong cùng account, trong một transaction có khoá hàng account. Soft-delete để
lại lỗ hổng trong dãy `stt` — chấp nhận; lũy kế chỉ duyệt lệnh chưa xoá theo `stt` tăng dần.

Phase đầu **không hỗ trợ chèn lệnh vào giữa hoặc đổi thứ tự**. Sửa `entered_at` không đổi `stt`.

### 5.6 Thời gian và timezone

Quy tắc một câu: **lưu UTC, tính theo timezone của account, hiển thị theo timezone của account.**

- DB lưu `entered_at TIMESTAMPTZ` ở UTC. Postgres tự chuẩn hoá, không lưu offset gốc.
- Frontend gửi ISO-8601 **có offset** khi tạo/sửa lệnh, ví dụ `2026-06-09T14:30:00+07:00`.
  Backend không đoán timezone từ chuỗi thiếu offset — thiếu offset thì trả 400.
- `day` là **trường suy diễn**: `day = entered_at.In(account.Timezone).Format("2006-01-02")`.
  `week` (ISO), `month`, `weekday` đều suy ra từ `day` này. Không có cột `day` trong DB.
- Mọi phép gom nhóm — `cum_by_day`, P&L theo ngày, heatmap, weekday, week — dùng `day` nói trên,
  tức luôn theo timezone của account, **không** theo timezone máy người dùng. Nhờ vậy cùng một
  account cho ra cùng một con số bất kể mở từ đâu.
- Frontend hiển thị mốc giờ bằng `Intl.DateTimeFormat` với `timeZone` = timezone của account
  (lấy từ `GET /accounts`), **không** dùng giờ máy. Nếu hai giá trị lệch nhau, UI hiện nhãn nhỏ
  "giờ tài khoản (Asia/Ho_Chi_Minh)" để không gây hiểu nhầm.
- Dùng tên IANA, **không bao giờ** hardcode `+7` — offset thay đổi theo lịch sử và theo DST ở
  nhiều vùng. Container backend phải cài `tzdata` (hoặc import `time/tzdata` trong Go) vì ảnh
  distroless không có sẵn cơ sở dữ liệu timezone.
- Đổi `accounts.timezone` sẽ **đổi cách gom nhóm của toàn bộ lịch sử** (một số lệnh nhảy sang
  ngày khác). Đây là hành vi đúng, nhưng UI phải cảnh báo trước khi lưu.
- `created_at`/`updated_at` lưu UTC, chỉ dùng cho audit, không tham gia tính toán.

## 6. Ba package pure — hợp đồng

### 6.1 `scoring` (§2)

```go
func ScoreEntry(q string) int      // "" → 0, "Đúng kế hoạch" → 25, ...
func ScoreExit(q string) int
func ScoreInTrade(q string) int
func ScorePsych(q string) int

// nil khi CẢ BỐN field rỗng
func ScoreTotal(entry, inTrade, exit, psych string) *int
func ClassifyTrade(total *int) string   // §2.6
```

Ranh giới `trade_class` đóng dưới: `>= 80` → `Đúng kế hoạch`; `>= 55` → `Cần cải thiện`;
`>= 30` → `Bốc đồng / FOMO`; còn lại → `Giao dịch trả thù`; `nil` → `CHƯA ĐÁNH GIÁ`.

### 6.2 `metrics`

```go
type Enriched struct {
    Trade
    Net          decimal.Decimal   // profit − fee
    WinLoss      int               // net >= 0 → 1, ngược lại 0
    WinSign      int               // net >= 0 → 1, ngược lại −1
    ScoreEntry, ScoreExit, ScoreInTrade, ScorePsych int
    ScoreTotal   *int
    TradeClass   string
    Day          string            // "2026-06-09" — entered_at quy về acc.Timezone
    Week, Month, Weekday string    // "W24", "06/2026", "Tue" — đều suy từ Day
    CumByTrade   decimal.Decimal
    CumByDay     decimal.Decimal
    CumTheory    decimal.Decimal
    RunningPeak  decimal.Decimal   // max(0, max cum_by_trade tới i) — FLOOR tại 0
    Drawdown     decimal.Decimal   // running_peak − cum_by_trade, luôn ≥ 0
}

func Enrich(trades []Trade, acc Account) ([]Enriched, error)   // trades đã sort theo stt
func ComputeKPI(rows []Enriched, acc Account, cf []CashFlow) KPI
```

`Enrich` duyệt một lượt: scoring → net/win_loss → quy `entered_at` về `acc.Timezone` để ra
`day` → week/month/weekday → lũy kế → peak/drawdown.
`cum_by_day` là giá trị lũy kế **cuối ngày**: mọi lệnh cùng một `day` mang cùng giá trị.
`acc.Timezone` là tên IANA; `Enrich` gọi `time.LoadLocation` một lần và trả lỗi nếu tên sai —
đây là lý do duy nhất `Enrich` có thể thất bại.
`profit_theory` NULL đóng góp 0 vào `cum_theory`.

`KPI` chứa đủ 24 chỉ số §4. Các trường có thể không xác định dùng con trỏ (`*decimal.Decimal`):
`profit_factor` khi `total_loss = 0`, `recovery_factor` khi `max_drawdown = 0`, mọi chỉ số R khi
`one_R = 0`, và toàn bộ KPI khi không có lệnh nào.

### 6.3 `aggregate` (§5)

```go
func All(rows []Enriched, acc Account) Charts
```

`Charts` gồm 12 nhóm: theo setup (top 6), symbol (top 6), timeframe, direction, weekday,
week, day, heatmap tháng, phân phối R, điểm trung bình, radar tâm lý, lý thuyết vs thực tế.
Mỗi pivot trả `{key, count, win_count, sum_net, ave_net, win_rate}`.

R-binning dùng đúng 22 bucket theo thứ tự trong §5.9, mỗi bucket tách số lệnh thắng/thua.
Streak theo thuật toán §5.1.

Radar và điểm trung bình **chỉ tính trên lệnh đã chấm** (`ScoreTotal != nil`).

## 7. API

Envelope thống nhất cho mọi response: `{ "code": 0, "msg": "ok", "data": ... }`.
Lỗi trả `code != 0`, `msg` là thông điệp tiếng Việt hiển thị được, kèm HTTP status đúng
(400 validate, 401 chưa auth, 403 không thuộc user, 404, 409 trùng, 500). Một middleware lo
việc này; frontend chỉ cần một hàm unwrap.

```
POST   /api/auth/register            → {access_token, user}  + refresh cookie
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/accounts
POST   /api/accounts
PATCH  /api/accounts/:id
GET    /api/accounts/:id/cash-flows
POST   /api/accounts/:id/cash-flows
DELETE /api/cash-flows/:id

GET    /api/accounts/:id/trades   ?from&to&setup&symbol&timeframe&direction&trade_class&page&size
POST   /api/accounts/:id/trades
GET    /api/trades/:id
PATCH  /api/trades/:id
DELETE /api/trades/:id             → soft delete
POST   /api/trades/:id/restore
GET    /api/accounts/:id/trades/trash

GET    /api/accounts/:id/stats    ?from&to   → toàn bộ KPI §4
GET    /api/accounts/:id/charts   ?from&to   → cả 12 nhóm §5 trong một response
GET    /api/meta/enums                       → enum §1 cho dropdown
```

Mỗi phần tử trong `GET /trades` kèm toàn bộ trường derived của lệnh đó.

`/charts` gộp 12 nhóm vào một request vì cả 12 xuất phát từ cùng một lần load `[]Trade`;
tách thành 12 endpoint sẽ đọc DB 12 lần cho cùng dữ liệu.

### 7.1 Quy tắc filter — chỗ dễ sai nhất

- `cum_by_trade`, `cum_by_day`, `cum_theory`, `running_peak`, `drawdown`, `streak` **luôn**
  tính trên **toàn bộ** lệnh chưa xoá của account theo thứ tự `stt`. Filter chỉ lọc phần
  *hiển thị* sau khi đã tính. Lọc trước khi tính sẽ làm đường equity sai.
- KPI §4 và aggregation §5 tính trên **tập đã lọc**.
- `max_drawdown` = `max(Drawdown)` lấy trên **các lệnh nằm trong tập đã lọc**, nhưng bản thân
  giá trị `Drawdown` của từng lệnh đã được tính từ dãy đầy đủ ở bước trên.
- `from`/`to` là ngày dạng `YYYY-MM-DD`, hiểu theo **timezone của account**, bao gồm cả hai đầu
  mút. Backend đổi chúng thành khoảng UTC (`from 00:00` → `to 23:59:59.999` tại tz account) rồi
  mới so sánh với `entered_at`. Không so sánh chuỗi ngày với timestamp.
- Filter theo trường suy diễn (`trade_class`) áp dụng **sau** khi `Enrich` chạy, không phải trong SQL.
- Phân trang chỉ ảnh hưởng `GET /trades`; `/stats` và `/charts` luôn tính trên toàn bộ tập đã lọc.

### 7.2 Auth

Access token JWT 15 phút, frontend giữ **trong memory** (không localStorage). Refresh token 30
ngày trong cookie `httpOnly`, `SameSite=Lax`, xoay vòng mỗi lần refresh. Mọi endpoint dữ liệu
kiểm tra account thuộc về user trong token, trả 403 nếu không.

## 8. Frontend

Vite + React 19 + TypeScript, TanStack Query v5, React Router, shadcn/ui, Tailwind v4,
Recharts, react-hook-form + zod.

### 8.1 Theme

`docs/design/theme.css` là nguồn sự thật, **copy nguyên xi** vào `src/styles/theme.css`, không sửa.
Một file `bridge.css` riêng map token của theme sang token shadcn:

```
--background      ← --surface-raised     (chú ý: raised là nền TRANG)
--card            ← --surface-base       (base là nền THẺ — Figma cố ý đảo tên)
--popover         ← --surface-modal
--foreground      ← --text-primary
--muted-foreground← --text-muted
--border          ← --border-default
--input           ← --border-input
--ring            ← --focus-ring
--primary         ← --primary
--radius          ← --radius-default
```

Dark mode qua `[data-theme="dark"]` trên `<html>` (không phải class `.dark`, không phải
`prefers-color-scheme`). Mặc định `dark`, có toggle lưu `localStorage`.

Theme **flat**: file theme vô hiệu hoá mọi utility `shadow-*`. Phân tầng bằng border + bậc
surface. Component shadcn nào mặc định dựa vào `shadow-sm` phải đổi sang
`border border-[var(--border-default)]`.

Font: `--font-sans` = Inter, `--font-mono` = JetBrains Mono (theme tham chiếu nhưng không định
nghĩa hai biến này). **Mọi con số** — tiền, %, R, điểm — dùng mono + `font-variant-numeric: tabular-nums`.

Layout dùng sẵn `.horus-sidenav` và `.horus-page-body` của theme thay vì tự chế shell.

### 8.2 Quy ước màu

- Lãi (`net > 0`) → `var(--primary)`; lỗ (`net < 0`) → `var(--status-error)`; hoà → `var(--text-muted)`.
  Chỉ một sắc xanh trong toàn app.
- Ngưỡng §4 map thẳng vào status token:
  `profit_factor` `<1` → `--status-error`, `1–1.5` → `--status-warning`,
  `1.5–2` → `--status-success`, `>2` → `--status-info`.
  `recovery_factor` `<1` đỏ, `1–2` vàng, `>2` xanh.
  Điểm trung bình `≥ 80` → success. `expectancy > 0` → success.
- Màu chart phân loại (setup, symbol, timeframe) chưa được theme định nghĩa. Khi làm phase
  dashboard phải dùng skill `dataviz` để dựng bảng màu phân loại đạt tương phản ở cả hai theme —
  không bốc màu tuỳ tiện từ các ramp.
- Không dùng màu làm tín hiệu duy nhất: kèm dấu `+`/`−` và nhãn.

### 8.3 Hiển thị thời gian

Form nhập lệnh dùng datetime picker (ngày + giờ), mặc định "bây giờ" theo timezone của account.
FE gửi lên chuỗi ISO-8601 **kèm offset**. Khi hiển thị, dùng `Intl.DateTimeFormat` với
`timeZone` lấy từ account — **không** dùng giờ máy, để con số trên bảng luôn khớp với con số
trên biểu đồ. Trang cấu hình account có ô chọn timezone kèm cảnh báo đổi timezone sẽ tính lại
cách gom nhóm của toàn bộ lịch sử.

### 8.4 Trang

`/login`, `/register`, `/dashboard`, `/trades` (bảng + filter + form thêm/sửa), `/trades/trash`,
`/accounts` (cấu hình IB, risk%, nạp/rút), `/import` (phase cuối).

## 9. Testing

Bắt buộc: mỗi feature ship kèm test, không dời sang phase sau.

| Tầng | Nội dung test |
|---|---|
| `scoring` | Table-driven phủ 100% nhánh — đủ 20 case §2.7, biên 80/55/30, all-empty → `nil` + `CHƯA ĐÁNH GIÁ` |
| `metrics` per-trade | `net`, `win_loss` (net=0 → 1), `week` ISO, `month`, `weekday`, fee > profit → loss |
| `metrics` timezone | `entered_at` `2026-06-09T23:00:00Z` với tz `Asia/Ho_Chi_Minh` → `day = 2026-06-10`; cùng dữ liệu nhưng tz `UTC` → `2026-06-09`; lệnh sát nửa đêm rơi đúng ngày; tz sai tên → lỗi; ISO tuần vắt qua năm |
| `metrics` lũy kế | Golden fixture §7 — assert nguyên bảng 4 dòng. Fixture dựng `entered_at` lúc 12:00 giờ VN cho mỗi ngày để `day` khớp đúng bảng gốc |
| `metrics` KPI | Assert nguyên bảng 24 KPI §7 + toàn bộ edge case §6 |
| `aggregate` | R-binning từng bucket biên, streak (§5.1 → 2 / 1), heatmap, top-6, cô lập account |
| repository | Postgres thật (testcontainers): CRUD, unique `(account_id, stt)`, soft-delete filtering, cấp `stt` khi chạy song song |
| handler | `httptest`: envelope, 401/403, filter, phân trang, `stt` do FE gửi bị bỏ qua, `entered_at` thiếu offset → 400, `from`/`to` quy đổi đúng sang khoảng UTC |
| frontend | `tsc --noEmit` + `npm run build` xanh; vitest cho logic thuần: unwrap envelope, format tiền/%/R, map ngưỡng màu |

Edge case §6 bắt buộc có test: không lệnh nào; `total_loss = 0` → `profit_factor` null;
`max_drawdown = 0` → `recovery_factor` null; `net = 0`; lệnh chưa chấm điểm; cô lập account
(hai account xen kẽ, `cum_by_trade` không rò rỉ chéo); `one_R = 0`; đổi thứ tự lệnh (tổng KPI
không đổi nhưng `cum_*`/`peak`/`drawdown`/`streak` đổi); fee > profit.

`go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/...` chạy dưới 1
giây và **không cần Docker**. Đó là thước đo xem ranh giới package có còn sạch không.

## 10. Phase

| Phase | Nội dung | Xong khi |
|---|---|---|
| 0 | docker-compose (db+api+web), migration đầu, healthcheck, Makefile, CI chạy `go test ./...` | `docker compose up` lên được cả 3 service |
| 1 | **Pure core, TDD, chưa cần DB**: `scoring` → per-trade → lũy kế → KPI → `aggregate` | Golden fixture §7 xanh hoàn toàn |
| 2 | Auth + accounts + cash_flows (BE + FE) | Đăng ký/đăng nhập, tạo account, cấu hình IB/risk% |
| 3 | Trade CRUD: form 16 field, bảng + filter, soft delete + restore, trash | Nhập tay được lệnh, thấy trường derived |
| 4 | Dashboard: 24 KPI + 12 nhóm chart §5, ngưỡng màu | Dashboard khớp số của golden fixture |
| 5 | Import CSV/Excel có preview + dry-run, export | Đổ được file cũ vào |

Phase 1 làm trước cả auth vì nó là phần dễ sai nhất và không phụ thuộc gì.

## 11. Vận hành

`docker-compose.yml` (prod-like) + `docker-compose.dev.yml` (override: air hot-reload cho Go,
Vite dev server, mount source). Dev gọi `/api` qua proxy của Vite nên không dính CORS; prod
nginx serve static và proxy `/api` sang api. Backend vẫn bật CORS whitelist cho trường hợp
deploy tách domain.

Env: `DATABASE_URL`, `JWT_SECRET`, `ACCESS_TTL`, `REFRESH_TTL`, `CORS_ORIGINS`, `PORT`.
Frontend chỉ cần `VITE_API_BASE_URL` (mặc định `/api`).

Migration chạy bằng `golang-migrate` trong entrypoint của service `api`, không dùng
AutoMigrate — để schema có lịch sử rõ ràng ngay từ đầu.

## 12. Không làm

- Cơ chế license/trial của bản Excel (§9 của plan).
- Macro refresh pivot — trên web là query lại.
- Sheet `OVER DATE`, `Help`, `Explain`.
- Chèn lệnh vào giữa / đổi thứ tự `stt` (phase đầu).
- Cache tầng tính toán, microservice, realtime.
- Upload ảnh chart, daily notes — không có trong plan hiện tại.
