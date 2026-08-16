# Phase 0 + 1 — Nền tảng và lõi tính toán — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bộ khung chạy được bằng `docker compose` (Postgres 16 + Go API + migration + CI), rồi cài đặt toàn bộ lõi tính toán thuần (`scoring`, `metrics`, `aggregate`) cho tới khi golden fixture §7 của spec xanh hoàn toàn.

**Architecture:** Ba package thuần không chạm DB, không chạm HTTP — nhận slice trade + config account, trả struct. Chúng là nơi mọi công thức nghiệp vụ sống. Tầng HTTP và tầng GORM ở các plan sau chỉ gọi vào chúng. Test của ba package này chạy dưới 1 giây và không cần Docker; nếu một ngày chúng cần Docker để chạy thì ranh giới package đã bị phá.

**Tech Stack:** Go 1.23, `shopspring/decimal`, `chi` v5, `stretchr/testify`, PostgreSQL 16, `golang-migrate`, Docker Compose, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-08-16-trading-journal-design.md`](../specs/2026-08-16-trading-journal-design.md) — đọc §5 (data model), §6 (hợp đồng ba package), §9 (testing) trước khi bắt đầu. Nghiệp vụ gốc nằm ở [`trading-journal-plan.md`](../../../trading-journal-plan.md) §2–§7.

## Global Constraints

- **Tiền là `decimal.Decimal` (`github.com/shopspring/decimal`), không bao giờ `float64`.** Trong DB là `NUMERIC`. Vi phạm điều này là lỗi nghiêm trọng nhất có thể mắc trong dự án.
- **Không lưu trường suy diễn.** DB không có cột `day`, `net`, `score_*`, `trade_class`, `week`, `month`, `weekday`, `cum_*`, `running_peak`, `drawdown`. Tất cả tính lúc đọc.
- **Ba package `internal/scoring`, `internal/metrics`, `internal/aggregate` không được import** `gorm.io/*`, `net/http`, `database/sql`, hay `context`. Có test tự động canh điều này (Task 13).
- **Chuỗi enum tiếng Việt trong `trading-journal-plan.md` §1 là key chấm điểm** — copy nguyên văn, đúng dấu, đúng hoa thường. Ví dụ `SỢ BỎ LỠ (FOMO)`, `Thoát chủ động (lý do kỹ thuật)`.
- **Timezone dùng tên IANA**, không bao giờ hardcode `+7`. `main.go` phải `import _ "time/tzdata"` vì ảnh distroless không có tzdata.
- **Tuần theo ISO-8601** (`time.Time.ISOWeek`), không phải `WEEKNUM(...,1)` của Excel.
- Go module path: `journal`. Toàn bộ backend nằm trong `backend/`.
- Commit message theo Conventional Commits (`feat:`, `test:`, `chore:`, `fix:`).

---

## Cấu trúc file

**Phase 0 — nền tảng**

| File | Trách nhiệm |
|---|---|
| `.gitignore` | bỏ qua binary, `node_modules`, `.env` |
| `CLAUDE.md` | viết lại theo spec mới (bản cũ mô tả sản phẩm khác) |
| `backend/go.mod` | module `journal` |
| `backend/cmd/api/main.go` | dựng router, đọc config, listen; import `time/tzdata` |
| `backend/internal/config/config.go` | đọc env, giá trị mặc định |
| `backend/internal/httpapi/response.go` | envelope `{code,msg,data}` — mọi handler dùng chung |
| `backend/internal/httpapi/health.go` | `GET /healthz` |
| `backend/internal/httpapi/router.go` | dựng `chi.Mux` |
| `backend/migrations/0001_init.{up,down}.sql` | DDL 4 bảng |
| `backend/Dockerfile` | multi-stage → distroless |
| `docker-compose.yml` | `db` + `migrate` + `api` |
| `Makefile` | `test`, `up`, `down`, `migrate`, `lint` |
| `.github/workflows/ci.yml` | chạy `go test ./...` |

**Phase 1 — lõi tính toán**

| File | Trách nhiệm |
|---|---|
| `backend/internal/domain/enums.go` | hằng chuỗi enum §1 + danh sách hợp lệ |
| `backend/internal/domain/models.go` | `Account`, `Trade`, `CashFlow` — struct thuần |
| `backend/internal/scoring/scoring.go` | §2: 4 hàm chấm điểm, `ScoreTotal`, `ClassifyTrade` |
| `backend/internal/metrics/derived.go` | §3.1–3.3, 3.8: `Net`, `WinLoss`, `WinSign`, nhãn ngày |
| `backend/internal/metrics/enrich.go` | §3.4–3.7: `Enriched`, `Enrich` — lũy kế, peak, drawdown |
| `backend/internal/metrics/kpi.go` | §4: `KPI`, `ComputeKPI` |
| `backend/internal/aggregate/streak.go` | §5.1 chuỗi thắng/thua |
| `backend/internal/aggregate/rdist.go` | §5.9 phân phối R, 22 bucket |
| `backend/internal/aggregate/pivot.go` | pivot dùng chung + 7 nhóm group-by |
| `backend/internal/aggregate/charts.go` | heatmap, điểm, radar, lý thuyết-vs-thực-tế, `All` |

Mỗi file `.go` đi kèm một file `_test.go` cùng thư mục.

---

## Task 1: Khởi tạo repo và viết lại CLAUDE.md

**Files:**
- Create: `.gitignore`
- Modify: `CLAUDE.md` (thay toàn bộ nội dung)

**Interfaces:**
- Consumes: không
- Produces: repo git có commit đầu tiên; `CLAUDE.md` mô tả đúng stack cho mọi task sau

- [ ] **Step 1: Khởi tạo git**

```bash
cd /Users/mac/Workspace/MyDocuments/trading-journal-web-app
git init
git branch -M main
```

- [ ] **Step 2: Tạo `.gitignore`**

```gitignore
# Go
/backend/bin/
*.test
*.out

# Node
node_modules/
dist/

# Env
.env
.env.local

# OS
.DS_Store
```

- [ ] **Step 3: Viết lại `CLAUDE.md`**

Thay **toàn bộ** file bằng nội dung dưới đây. Bản cũ mô tả stack Next.js + go-zero và data model ICT — không còn đúng.

```markdown
# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Sản phẩm

Web nhật ký giao dịch, số hoá một file Excel có sẵn. Nguồn sự thật về nghiệp vụ là
`trading-journal-plan.md` (công thức trích thẳng từ Excel). Thiết kế hệ thống nằm ở
`docs/superpowers/specs/2026-08-16-trading-journal-design.md`. Đọc cả hai trước khi code.

## Stack

- Backend: Go 1.23, chi, GORM, PostgreSQL 16, chạy trong Docker. Module path `journal`, thư mục `backend/`.
- Frontend: Vite + React 19 + TypeScript, TanStack Query v5, shadcn/ui, Tailwind v4, Recharts.
- Không dùng Next.js, không dùng go-zero.

## Quy tắc bất di bất dịch

1. **Tiền là `decimal.Decimal`, không bao giờ `float64`.** DB dùng `NUMERIC`.
2. **Không lưu trường suy diễn.** `net`, `score_*`, `cum_*`, `drawdown`, `week`, `month`,
   `weekday`, `day` đều tính lúc đọc, không có cột trong DB.
3. **`internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần** — cấm import
   GORM, `net/http`, `database/sql`, `context`. Test của chúng chạy không cần Docker.
4. **Lưu UTC, tính theo `accounts.timezone` (IANA), hiển thị theo timezone của account.**
   Không hardcode `+7`. `main.go` phải import `_ "time/tzdata"`.
5. **Chuỗi enum tiếng Việt là key chấm điểm** — copy nguyên văn từ `trading-journal-plan.md` §1.
6. **Soft delete** trades qua `deleted_at`; xoá cứng làm sai đường equity.
7. `stt` do backend cấp, frontend gửi lên thì bỏ qua.
8. Lũy kế (`cum_*`, `running_peak`, `drawdown`, streak) luôn tính trên **toàn bộ** lệnh của
   account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI thì tính trên tập đã lọc.

## Theme

`docs/design/theme.css` do chủ sản phẩm cấp, là nguồn sự thật, **không sửa**. Component chỉ dùng
biến ngữ nghĩa (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`), không hardcode hex.
Dark mode qua `[data-theme="dark"]`. Theme tắt hết `shadow-*` — phân tầng bằng border và bậc surface.
Lãi = `--primary` (teal), lỗ = `--status-error` (đỏ).

## Testing (bắt buộc)

Mỗi feature ship kèm test trong cùng lần thay đổi, không dời sang phase sau. Backend dùng
table-driven test cạnh code. Trước khi báo "xong" phải chạy test thật và báo kết quả thật.
Sửa bug thì thêm regression test fail trên code cũ, pass trên code mới.

Chạy: `make test` (Go) · `npx tsc --noEmit && npm run build` (FE).

## Roadmap

Phase 0 setup → 1 lõi tính toán thuần → 2 auth/accounts → 3 trade CRUD → 4 dashboard →
5 import CSV. Kế hoạch chi tiết ở `docs/superpowers/plans/`.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore CLAUDE.md trading-journal-plan.md docs/
git commit -m "chore: init repo, rewrite CLAUDE.md for the new stack"
```

- [ ] **Step 5: Kiểm chứng**

Chạy: `git log --oneline`
Mong đợi: đúng một commit, và `git status` sạch.

---

## Task 2: Envelope response và endpoint healthz

**Files:**
- Create: `backend/go.mod`, `backend/internal/httpapi/response.go`, `backend/internal/httpapi/health.go`, `backend/internal/httpapi/router.go`, `backend/cmd/api/main.go`, `backend/internal/config/config.go`
- Test: `backend/internal/httpapi/response_test.go`, `backend/internal/httpapi/health_test.go`

**Interfaces:**
- Consumes: không
- Produces:
  - `httpapi.OK(w http.ResponseWriter, data any)` — ghi `{"code":0,"msg":"ok","data":...}`, status 200
  - `httpapi.Fail(w http.ResponseWriter, status int, code int, msg string)` — ghi `{"code":<code>,"msg":<msg>,"data":null}`
  - `httpapi.NewRouter() http.Handler`
  - `config.Load() config.Config` với các field `Port string`, `DatabaseURL string`

Lưu ý: thư mục đặt tên `httpapi` (không phải `http` như spec ghi) để không phải đặt alias mỗi lần import `net/http`. Đây là khác biệt duy nhất so với §4 của spec.

- [ ] **Step 1: Khởi tạo module**

```bash
mkdir -p backend/cmd/api backend/internal/httpapi backend/internal/config
cd backend
go mod init journal
go get github.com/go-chi/chi/v5@latest
go get github.com/stretchr/testify@latest
```

Chưa cài `shopspring/decimal` ở đây — `go mod tidy` cuối task sẽ gỡ nó ra vì chưa dùng.
Task 6 sẽ thêm khi thực sự cần.

- [ ] **Step 2: Viết test thất bại cho envelope**

Tạo `backend/internal/httpapi/response_test.go`:

```go
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOKWrapsDataInEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()

	OK(rec, map[string]string{"hello": "world"})

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var body struct {
		Code int               `json:"code"`
		Msg  string            `json:"msg"`
		Data map[string]string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 0, body.Code)
	require.Equal(t, "ok", body.Msg)
	require.Equal(t, map[string]string{"hello": "world"}, body.Data)
}

func TestFailUsesGivenStatusAndCode(t *testing.T) {
	rec := httptest.NewRecorder()

	Fail(rec, http.StatusBadRequest, 1001, "thiếu offset trong entered_at")

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var body struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data any    `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 1001, body.Code)
	require.Equal(t, "thiếu offset trong entered_at", body.Msg)
	require.Nil(t, body.Data)
}
```

- [ ] **Step 3: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/httpapi/ -run TestOK -v`
Expected: FAIL — `undefined: OK`

- [ ] **Step 4: Cài đặt envelope**

Tạo `backend/internal/httpapi/response.go`:

```go
// Package httpapi chứa tầng HTTP: router, middleware, handler.
// Mọi response của API đều đi qua OK hoặc Fail để giữ đúng một envelope.
package httpapi

import (
	"encoding/json"
	"net/http"
)

type envelope struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data"`
}

// OK ghi response thành công: code 0, msg "ok".
func OK(w http.ResponseWriter, data any) {
	write(w, http.StatusOK, envelope{Code: 0, Msg: "ok", Data: data})
}

// Fail ghi response lỗi. status là HTTP status, code là mã lỗi nghiệp vụ
// (khác 0) để frontend phân biệt nguyên nhân mà không phải parse msg.
func Fail(w http.ResponseWriter, status, code int, msg string) {
	write(w, status, envelope{Code: code, Msg: msg, Data: nil})
}

func write(w http.ResponseWriter, status int, body envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
```

- [ ] **Step 5: Chạy test envelope**

Run: `cd backend && go test ./internal/httpapi/ -v`
Expected: PASS cả hai test.

- [ ] **Step 6: Viết test thất bại cho healthz**

Tạo `backend/internal/httpapi/health_test.go`:

```go
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHealthzReturnsOKEnvelope(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	NewRouter().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var body struct {
		Code int `json:"code"`
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 0, body.Code)
	require.Equal(t, "ok", body.Data.Status)
}

func TestUnknownRouteReturns404Envelope(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/khong-ton-tai", nil)
	rec := httptest.NewRecorder()

	NewRouter().ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)

	var body struct {
		Code int `json:"code"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.NotEqual(t, 0, body.Code)
}
```

- [ ] **Step 7: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/httpapi/ -run TestHealthz -v`
Expected: FAIL — `undefined: NewRouter`

- [ ] **Step 8: Cài đặt handler và router**

Tạo `backend/internal/httpapi/health.go`:

```go
package httpapi

import "net/http"

// Healthz báo tiến trình còn sống. Docker compose dùng endpoint này làm healthcheck.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	OK(w, map[string]string{"status": "ok"})
}
```

Tạo `backend/internal/httpapi/router.go`:

```go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter dựng toàn bộ route của API. Mọi nhánh lỗi cũng trả envelope,
// kể cả 404 và 405 — frontend chỉ cần một hàm unwrap duy nhất.
func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusNotFound, 1404, "không tìm thấy endpoint")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusMethodNotAllowed, 1405, "method không được hỗ trợ")
	})

	r.Get("/healthz", Healthz)

	return r
}
```

Tạo `backend/internal/config/config.go`:

```go
// Package config đọc cấu hình từ biến môi trường.
package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
}

func Load() Config {
	return Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal@localhost:5432/journal?sslmode=disable"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

Tạo `backend/cmd/api/main.go`:

```go
package main

import (
	"log"
	"net/http"
	"time"

	// tzdata nhúng cơ sở dữ liệu timezone vào binary. Ảnh distroless không có
	// /usr/share/zoneinfo, thiếu dòng này thì time.LoadLocation("Asia/Ho_Chi_Minh")
	// sẽ lỗi trong container và mọi phép gom nhóm theo ngày sẽ hỏng.
	_ "time/tzdata"

	"journal/internal/config"
	"journal/internal/httpapi"
)

func main() {
	cfg := config.Load()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewRouter(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("journal-api listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
```

- [ ] **Step 9: Chạy toàn bộ test**

Run: `cd backend && go mod tidy && go test ./... -v`
Expected: PASS toàn bộ.

- [ ] **Step 10: Commit**

```bash
git add backend/
git commit -m "feat: add response envelope, healthz endpoint and router"
```

---

## Task 3: Migration 0001 — DDL bốn bảng

**Files:**
- Create: `backend/migrations/0001_init.up.sql`, `backend/migrations/0001_init.down.sql`

**Interfaces:**
- Consumes: không
- Produces: schema `users`, `accounts`, `trades`, `cash_flows` cho các plan sau

Task này chưa có test tự động (chưa có tầng DB); kiểm chứng bằng cách chạy migration thật ở Task 4.

- [ ] **Step 1: Viết migration up**

Tạo `backend/migrations/0001_init.up.sql`:

```sql
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code            TEXT          NOT NULL,
    name            TEXT          NOT NULL DEFAULT '',
    initial_balance NUMERIC(18, 2) NOT NULL,
    risk_per_trade  NUMERIC(6, 4)  NOT NULL DEFAULT 0.01,
    currency        TEXT          NOT NULL DEFAULT 'USD',
    -- Tên IANA. Quyết định mọi phép gom nhóm theo ngày; đổi giá trị này là
    -- đổi cách gom nhóm của toàn bộ lịch sử lệnh.
    timezone        TEXT          NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, code)
);

CREATE TABLE trades (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT         NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- Backend cấp; quyết định thứ tự lũy kế. Frontend gửi lên thì bỏ qua.
    stt              INTEGER        NOT NULL,
    -- Lưu UTC. Trường day/week/month/weekday là suy diễn, không có cột.
    entered_at       TIMESTAMPTZ    NOT NULL,
    symbol           TEXT           NOT NULL,
    direction        TEXT           NOT NULL CHECK (direction IN ('Long', 'Short')),
    entry            NUMERIC(18, 5),
    exit             NUMERIC(18, 5),
    volume           NUMERIC(18, 4),
    profit           NUMERIC(18, 2) NOT NULL,
    profit_theory    NUMERIC(18, 2),
    fee              NUMERIC(18, 2) NOT NULL DEFAULT 0,
    setup            TEXT           NOT NULL DEFAULT 'KHÔNG CÓ SETUP',
    timeframe        TEXT           NOT NULL DEFAULT '' CHECK (timeframe IN ('', 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W')),
    entry_quality    TEXT           NOT NULL DEFAULT '' CHECK (entry_quality IN ('', 'Đúng kế hoạch', 'Quá sớm', 'Quá muộn', 'Bốc đồng')),
    in_trade_quality TEXT           NOT NULL DEFAULT '' CHECK (in_trade_quality IN ('', 'Tuân thủ kế hoạch', 'Dời Chốt lời', 'Dời dừng lỗ ra xa', 'Muốn thoát lệnh')),
    exit_quality     TEXT           NOT NULL DEFAULT '' CHECK (exit_quality IN ('', 'Chạm Chốt lời', 'Chạm Dừng lỗ', 'Thoát chủ động (lý do kỹ thuật)', 'Thoát lệnh cảm tính, sợ hãi')),
    psychology       TEXT           NOT NULL DEFAULT '' CHECK (psychology IN ('', 'Không lỗi', 'SỢ BỎ LỠ (FOMO)', 'SỢ HÃI', 'HI VỌNG', 'THAM LAM', 'GIAO DỊCH TRẢ THÙ', 'LUÔN MUỐN MÌNH ĐÚNG')),
    notes            TEXT           NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX trades_account_stt_idx ON trades (account_id, stt);
CREATE INDEX trades_account_entered_at_idx ON trades (account_id, entered_at);
CREATE INDEX trades_deleted_at_idx ON trades (deleted_at);

CREATE TABLE cash_flows (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT         NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    date       DATE           NOT NULL,
    amount     NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    type       TEXT           NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    note       TEXT           NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX cash_flows_account_idx ON cash_flows (account_id, date);
```

- [ ] **Step 2: Viết migration down**

Tạo `backend/migrations/0001_init.down.sql`:

```sql
DROP TABLE IF EXISTS cash_flows;
DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/
git commit -m "feat: add initial schema migration"
```

---

## Task 4: Docker Compose — db, migrate, api

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `docker-compose.yml`, `.env.example`

**Interfaces:**
- Consumes: `httpapi.NewRouter` (Task 2), migration 0001 (Task 3)
- Produces: `docker compose up` cho ra API sống ở `localhost:8000` với schema đã áp

- [ ] **Step 1: Tạo Dockerfile**

Tạo `backend/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/api ./cmd/api

# distroless không có shell và không có /usr/share/zoneinfo — binary tự nhúng
# tzdata qua import _ "time/tzdata" trong cmd/api/main.go.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8000
USER nonroot:nonroot
ENTRYPOINT ["/api"]
```

Tạo `backend/.dockerignore`:

```
bin/
*_test.go
```

- [ ] **Step 2: Tạo docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: journal
      POSTGRES_PASSWORD: journal
      POSTGRES_DB: journal
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U journal -d journal"]
      interval: 5s
      timeout: 3s
      retries: 10

  # Chạy một lần rồi thoát. Tách khỏi api vì ảnh distroless không có shell,
  # và vì schema nên có lịch sử migration rõ ràng thay vì AutoMigrate.
  migrate:
    image: migrate/migrate:v4.17.1
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend/migrations:/migrations:ro
    command:
      [
        "-path", "/migrations",
        "-database", "postgres://journal:journal@db:5432/journal?sslmode=disable",
        "up",
      ]

  api:
    build:
      context: ./backend
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    environment:
      PORT: "8000"
      DATABASE_URL: "postgres://journal:journal@db:5432/journal?sslmode=disable"
    ports:
      - "8000:8000"

volumes:
  pgdata:
```

- [ ] **Step 3: Tạo `.env.example`**

```dotenv
PORT=8000
DATABASE_URL=postgres://journal:journal@localhost:5432/journal?sslmode=disable
# Dùng từ Plan 2 (auth) trở đi
JWT_SECRET=doi-gia-tri-nay-truoc-khi-deploy
ACCESS_TTL=15m
REFRESH_TTL=720h
CORS_ORIGINS=http://localhost:5173
```

- [ ] **Step 4: Dựng và chạy**

Run: `docker compose up -d --build`
Expected: `db` healthy, `migrate` exit code 0, `api` running.

- [ ] **Step 5: Kiểm chứng API và schema**

```bash
curl -s localhost:8000/healthz
docker compose exec db psql -U journal -d journal -c '\dt'
```

Expected: curl trả `{"code":0,"msg":"ok","data":{"status":"ok"}}`; `\dt` liệt kê đủ 4 bảng
`accounts`, `cash_flows`, `schema_migrations`, `trades`, `users`.

- [ ] **Step 6: Dọn và commit**

```bash
docker compose down
git add backend/Dockerfile backend/.dockerignore docker-compose.yml .env.example
git commit -m "chore: add docker compose stack with postgres and migrations"
```

---

## Task 5: Makefile và CI

**Files:**
- Create: `Makefile`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: mọi thứ ở Task 2–4
- Produces: `make test` — lệnh chuẩn để chạy test, dùng ở mọi task sau

- [ ] **Step 1: Tạo Makefile**

```makefile
.PHONY: test test-pure up down logs migrate tidy

# Toàn bộ test Go.
test:
	cd backend && go test ./... -count=1

# Chỉ ba package thuần. Phải chạy dưới 1 giây và KHÔNG cần Docker —
# nếu lệnh này bắt đầu cần Postgres thì ranh giới package đã bị phá.
test-pure:
	cd backend && go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... -count=1

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

migrate:
	docker compose run --rm migrate

tidy:
	cd backend && go mod tidy
```

- [ ] **Step 2: Tạo CI workflow**

Tạo `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.23"
          cache-dependency-path: backend/go.sum
      - name: Vet
        run: cd backend && go vet ./...
      - name: Test
        run: cd backend && go test ./... -count=1
```

- [ ] **Step 3: Kiểm chứng**

Run: `make test`
Expected: PASS, và in ra `ok journal/internal/httpapi`.

- [ ] **Step 4: Commit**

```bash
git add Makefile .github/
git commit -m "chore: add makefile and CI workflow"
```

---

## Task 6: Package domain — kiểu dữ liệu và enum

**Files:**
- Create: `backend/internal/domain/enums.go`, `backend/internal/domain/models.go`
- Test: `backend/internal/domain/models_test.go`

**Interfaces:**
- Consumes: không
- Produces:
  - `domain.Account{ID, UserID int64; Code, Name string; InitialBalance, RiskPerTrade decimal.Decimal; Currency, Timezone string}`
  - `(Account).OneR() decimal.Decimal`
  - `domain.Trade{ID, AccountID int64; STT int; EnteredAt time.Time; Symbol, Direction string; Entry, Exit, Volume, Profit, Fee decimal.Decimal; ProfitTheory *decimal.Decimal; Setup, Timeframe, EntryQuality, InTradeQuality, ExitQuality, Psychology, Notes string}`
  - `domain.CashFlow{ID, AccountID int64; Date time.Time; Amount decimal.Decimal; Type string}`
  - Hằng: `domain.EntryPlanned`, `domain.ExitTP`, `domain.PsychNoError`, … (xem code)
  - `domain.ClassNotEvaluated`, `domain.ClassPlanned`, `domain.ClassNeedsWork`, `domain.ClassImpulsive`, `domain.ClassRevenge`

- [ ] **Step 1: Cài thư viện decimal**

```bash
cd backend && go get github.com/shopspring/decimal@latest
```

- [ ] **Step 2: Viết test thất bại cho OneR**

Tạo `backend/internal/domain/models_test.go`:

```go
package domain

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestOneR(t *testing.T) {
	tests := []struct {
		name    string
		balance string
		risk    string
		want    string
	}{
		{"golden fixture: 5000 x 1%", "5000", "0.01", "50"},
		{"risk 0 -> 1R bằng 0", "5000", "0", "0"},
		{"số lẻ không mất precision", "1234.56", "0.0125", "15.432"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := Account{
				InitialBalance: decimal.RequireFromString(tt.balance),
				RiskPerTrade:   decimal.RequireFromString(tt.risk),
			}
			require.True(t, acc.OneR().Equal(decimal.RequireFromString(tt.want)),
				"OneR() = %s, muốn %s", acc.OneR(), tt.want)
		})
	}
}
```

- [ ] **Step 3: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/domain/ -v`
Expected: FAIL — `undefined: Account`

- [ ] **Step 4: Cài đặt enums.go**

```go
// Package domain chứa kiểu dữ liệu nghiệp vụ thuần. Không phụ thuộc GORM,
// HTTP hay bất cứ hạ tầng nào.
package domain

// Chuỗi enum dưới đây là KEY CHẤM ĐIỂM, không phải nhãn hiển thị. Đổi chúng
// là đổi kết quả chấm điểm của toàn bộ lịch sử. Nếu cần đổi text hiển thị,
// đổi ở frontend, giữ nguyên giá trị lưu trong DB.
// Nguồn: trading-journal-plan.md §1.
const (
	DirectionLong  = "Long"
	DirectionShort = "Short"
)

const (
	EntryPlanned  = "Đúng kế hoạch"
	EntryTooEarly = "Quá sớm"
	EntryTooLate  = "Quá muộn"
	EntryImpulse  = "Bốc đồng"
)

const (
	InTradeFollowed = "Tuân thủ kế hoạch"
	InTradeMovedTP  = "Dời Chốt lời"
	InTradeMovedSL  = "Dời dừng lỗ ra xa"
	InTradeWantExit = "Muốn thoát lệnh"
)

const (
	ExitHitTP     = "Chạm Chốt lời"
	ExitHitSL     = "Chạm Dừng lỗ"
	ExitTechnical = "Thoát chủ động (lý do kỹ thuật)"
	ExitEmotional = "Thoát lệnh cảm tính, sợ hãi"
)

const (
	PsychNoError = "Không lỗi"
	PsychFOMO    = "SỢ BỎ LỠ (FOMO)"
	PsychFear    = "SỢ HÃI"
	PsychHope    = "HI VỌNG"
	PsychGreed   = "THAM LAM"
	PsychRevenge = "GIAO DỊCH TRẢ THÙ"
	PsychAlwaysRight = "LUÔN MUỐN MÌNH ĐÚNG"
)

// Loại lệnh suy ra từ tổng điểm — trading-journal-plan.md §2.6.
const (
	ClassNotEvaluated = "CHƯA ĐÁNH GIÁ"
	ClassPlanned      = "Đúng kế hoạch"
	ClassNeedsWork    = "Cần cải thiện"
	ClassImpulsive    = "Bốc đồng / FOMO"
	ClassRevenge      = "Giao dịch trả thù"
)

// DefaultSetup là giá trị mặc định khi user chưa đặt tên setup.
const DefaultSetup = "KHÔNG CÓ SETUP"

// Timeframes theo thứ tự tăng dần, dùng để sắp xếp biểu đồ theo timeframe.
var Timeframes = []string{"M1", "M5", "M15", "M30", "H1", "H4", "D1", "W"}

// Weekdays theo thứ tự hiển thị của biểu đồ theo thứ trong tuần.
var Weekdays = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
```

- [ ] **Step 5: Cài đặt models.go**

```go
package domain

import (
	"time"

	"github.com/shopspring/decimal"
)

// Account là một tài khoản giao dịch. Timezone là tên IANA và quyết định
// mọi phép gom nhóm theo ngày.
type Account struct {
	ID             int64
	UserID         int64
	Code           string
	Name           string
	InitialBalance decimal.Decimal
	RiskPerTrade   decimal.Decimal // 0.01 = 1%
	Currency       string
	Timezone       string
}

// OneR quy 1R ra tiền: vốn ban đầu nhân phần trăm rủi ro mỗi lệnh.
// Cố ý dùng vốn BAN ĐẦU, không phải balance hiện tại — xem spec quyết định #7.
func (a Account) OneR() decimal.Decimal {
	return a.InitialBalance.Mul(a.RiskPerTrade)
}

// Trade là một lệnh, chỉ gồm trường người dùng nhập. Mọi trường suy diễn
// (net, điểm, lũy kế, drawdown) nằm ở package metrics.
type Trade struct {
	ID        int64
	AccountID int64
	STT       int
	EnteredAt time.Time // luôn UTC

	Symbol    string
	Direction string
	Entry     decimal.Decimal
	Exit      decimal.Decimal
	Volume    decimal.Decimal

	Profit       decimal.Decimal
	ProfitTheory *decimal.Decimal // nil khi user để trống
	Fee          decimal.Decimal

	Setup          string
	Timeframe      string
	EntryQuality   string
	InTradeQuality string
	ExitQuality    string
	Psychology     string
	Notes          string
}

// CashFlow là một lần nạp hoặc rút tiền, dùng để tính current_balance.
type CashFlow struct {
	ID        int64
	AccountID int64
	Date      time.Time
	Amount    decimal.Decimal // luôn dương
	Type      string          // "deposit" | "withdraw"
}
```

- [ ] **Step 6: Chạy test**

Run: `cd backend && go test ./internal/domain/ -v`
Expected: PASS cả 3 case.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/domain/
git commit -m "feat: add domain types and business enums"
```

---

## Task 7: Package scoring — bảng chấm điểm §2

**Files:**
- Create: `backend/internal/scoring/scoring.go`
- Test: `backend/internal/scoring/scoring_test.go`

**Interfaces:**
- Consumes: `domain` (Task 6)
- Produces:
  - `scoring.Entry(q string) int`, `scoring.Exit(q string) int`, `scoring.InTrade(q string) int`, `scoring.Psych(q string) int`
  - `scoring.Total(entry, inTrade, exit, psych string) *int` — nil khi cả bốn rỗng
  - `scoring.Classify(total *int) string`

- [ ] **Step 1: Viết test thất bại phủ 100% nhánh**

Tạo `backend/internal/scoring/scoring_test.go`:

```go
package scoring

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestEntry(t *testing.T) {
	cases := map[string]int{
		"":                    0,
		domain.EntryPlanned:   25,
		domain.EntryTooEarly:  10,
		domain.EntryTooLate:   10,
		domain.EntryImpulse:   0,
		"chuỗi lạ không khớp": 0,
	}
	for in, want := range cases {
		require.Equal(t, want, Entry(in), "Entry(%q)", in)
	}
}

func TestExit(t *testing.T) {
	cases := map[string]int{
		"":                   0,
		domain.ExitHitTP:     25,
		domain.ExitHitSL:     25, // chạm SL đúng kế hoạch vẫn là kỷ luật tốt
		domain.ExitTechnical: 15,
		domain.ExitEmotional: 0,
	}
	for in, want := range cases {
		require.Equal(t, want, Exit(in), "Exit(%q)", in)
	}
}

func TestInTrade(t *testing.T) {
	cases := map[string]int{
		"":                       0,
		domain.InTradeFollowed:   25,
		domain.InTradeMovedTP:    10,
		domain.InTradeMovedSL:    0,
		domain.InTradeWantExit:   5,
	}
	for in, want := range cases {
		require.Equal(t, want, InTrade(in), "InTrade(%q)", in)
	}
}

func TestPsych(t *testing.T) {
	cases := map[string]int{
		"":                       0,
		domain.PsychNoError:      25,
		domain.PsychFOMO:         0,
		domain.PsychFear:         5,
		domain.PsychHope:         5,
		domain.PsychGreed:        5,
		domain.PsychRevenge:      0,
		domain.PsychAlwaysRight:  0,
	}
	for in, want := range cases {
		require.Equal(t, want, Psych(in), "Psych(%q)", in)
	}
}

func TestTotalNilKhiCaBonRong(t *testing.T) {
	require.Nil(t, Total("", "", "", ""))
}

func TestTotalKhongNilKhiCoItNhatMotField(t *testing.T) {
	got := Total("", "", "", domain.PsychFOMO)
	require.NotNil(t, got)
	require.Equal(t, 0, *got, "FOMO được 0 điểm nhưng lệnh vẫn coi là đã chấm")
}

func TestTotalVaClassify(t *testing.T) {
	tests := []struct {
		name      string
		entry     string
		inTrade   string
		exit      string
		psych     string
		wantTotal int
		wantClass string
	}{
		{"tất cả tốt nhất = 100", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychNoError, 100, domain.ClassPlanned},
		{"biên 80", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychFear, 80, domain.ClassPlanned},
		{"75", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychFOMO, 75, domain.ClassNeedsWork},
		{"biên 55", domain.EntryPlanned, domain.InTradeMovedTP, domain.ExitTechnical, domain.PsychFear, 55, domain.ClassNeedsWork},
		{"65", domain.EntryPlanned, domain.InTradeMovedTP, domain.ExitHitSL, domain.PsychFear, 65, domain.ClassNeedsWork},
		{"biên 30", domain.EntryTooEarly, domain.InTradeWantExit, domain.ExitTechnical, domain.PsychFOMO, 30, domain.ClassImpulsive},
		{"25", domain.EntryTooEarly, domain.InTradeMovedTP, domain.ExitEmotional, domain.PsychFear, 25, domain.ClassRevenge},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			total := Total(tt.entry, tt.inTrade, tt.exit, tt.psych)
			require.NotNil(t, total)
			require.Equal(t, tt.wantTotal, *total)
			require.Equal(t, tt.wantClass, Classify(total))
		})
	}
}

func TestClassifyNilLaChuaDanhGia(t *testing.T) {
	require.Equal(t, domain.ClassNotEvaluated, Classify(nil))
}

func TestClassifyBienChinhXac(t *testing.T) {
	tests := []struct {
		total int
		want  string
	}{
		{100, domain.ClassPlanned},
		{80, domain.ClassPlanned},
		{79, domain.ClassNeedsWork},
		{55, domain.ClassNeedsWork},
		{54, domain.ClassImpulsive},
		{30, domain.ClassImpulsive},
		{29, domain.ClassRevenge},
		{0, domain.ClassRevenge},
	}
	for _, tt := range tests {
		total := tt.total
		require.Equal(t, tt.want, Classify(&total), "Classify(%d)", tt.total)
	}
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/scoring/ -v`
Expected: FAIL — `undefined: Entry`

- [ ] **Step 3: Cài đặt scoring.go**

```go
// Package scoring cài đặt bảng chấm điểm giao dịch của
// trading-journal-plan.md §2. Thuần: không I/O, không state.
package scoring

import "journal/internal/domain"

// Entry chấm chất lượng vào lệnh (§2.1).
func Entry(q string) int {
	switch q {
	case domain.EntryPlanned:
		return 25
	case domain.EntryTooEarly, domain.EntryTooLate:
		return 10
	default: // rỗng, "Bốc đồng", hoặc giá trị lạ
		return 0
	}
}

// Exit chấm chất lượng thoát lệnh (§2.2). Chạm Dừng lỗ vẫn được 25 điểm vì
// đây chấm kỷ luật thực thi, không chấm lãi lỗ.
func Exit(q string) int {
	switch q {
	case domain.ExitHitTP, domain.ExitHitSL:
		return 25
	case domain.ExitTechnical:
		return 15
	default:
		return 0
	}
}

// InTrade chấm hành vi trong lệnh (§2.3).
func InTrade(q string) int {
	switch q {
	case domain.InTradeFollowed:
		return 25
	case domain.InTradeMovedTP:
		return 10
	case domain.InTradeWantExit:
		return 5
	default:
		return 0
	}
}

// Psych chấm tâm lý (§2.4).
func Psych(q string) int {
	switch q {
	case domain.PsychNoError:
		return 25
	case domain.PsychFear, domain.PsychHope, domain.PsychGreed:
		return 5
	default:
		return 0
	}
}

// Total cộng bốn trục (§2.5). Trả nil khi CẢ BỐN field đều rỗng — nghĩa là
// lệnh chưa được chấm, khác hẳn với lệnh được chấm 0 điểm.
func Total(entry, inTrade, exit, psych string) *int {
	if entry == "" && inTrade == "" && exit == "" && psych == "" {
		return nil
	}
	total := Entry(entry) + InTrade(inTrade) + Exit(exit) + Psych(psych)
	return &total
}

// Classify quy tổng điểm thành loại lệnh (§2.6). Ranh giới đóng dưới:
// đúng 80 là "Đúng kế hoạch", đúng 55 là "Cần cải thiện", đúng 30 là "Bốc đồng / FOMO".
func Classify(total *int) string {
	if total == nil {
		return domain.ClassNotEvaluated
	}
	switch {
	case *total >= 80:
		return domain.ClassPlanned
	case *total >= 55:
		return domain.ClassNeedsWork
	case *total >= 30:
		return domain.ClassImpulsive
	default:
		return domain.ClassRevenge
	}
}
```

- [ ] **Step 4: Chạy test**

Run: `cd backend && go test ./internal/scoring/ -v`
Expected: PASS toàn bộ.

- [ ] **Step 5: Kiểm tra độ phủ**

Run: `cd backend && go test ./internal/scoring/ -cover`
Expected: `coverage: 100.0% of statements`. Nếu thấp hơn, thiếu nhánh — bổ sung case.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/scoring/
git commit -m "feat: add trade scoring per spec section 2"
```

---

## Task 8: metrics — trường suy diễn từng lệnh, không lũy kế

**Files:**
- Create: `backend/internal/metrics/derived.go`
- Test: `backend/internal/metrics/derived_test.go`

**Interfaces:**
- Consumes: `domain` (Task 6)
- Produces:
  - `metrics.Net(t domain.Trade) decimal.Decimal`
  - `metrics.WinLoss(net decimal.Decimal) int` — 1 khi `net >= 0`
  - `metrics.WinSign(net decimal.Decimal) int` — 1 hoặc −1
  - `metrics.DateParts(enteredAt time.Time, loc *time.Location) (day, week, month, weekday string)`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/internal/metrics/derived_test.go`:

```go
package metrics

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func TestNet(t *testing.T) {
	tests := []struct {
		name   string
		profit string
		fee    string
		want   string
	}{
		{"lãi không phí", "100", "0", "100"},
		{"lỗ không phí", "-50", "0", "-50"},
		{"phí ăn hết lãi", "10", "12", "-2"},
		{"số lẻ giữ nguyên precision", "0.15", "0.05", "0.10"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Net(domain.Trade{Profit: dec(tt.profit), Fee: dec(tt.fee)})
			require.True(t, got.Equal(dec(tt.want)), "Net = %s, muốn %s", got, tt.want)
		})
	}
}

func TestWinLossVaWinSign(t *testing.T) {
	tests := []struct {
		net          string
		wantWinLoss  int
		wantWinSign  int
	}{
		{"100", 1, 1},
		{"-50", 0, -1},
		{"0", 1, 1}, // net = 0 tính là KHÔNG THUA
	}
	for _, tt := range tests {
		t.Run(tt.net, func(t *testing.T) {
			require.Equal(t, tt.wantWinLoss, WinLoss(dec(tt.net)))
			require.Equal(t, tt.wantWinSign, WinSign(dec(tt.net)))
		})
	}
}

func TestDatePartsTheoTimezoneCuaAccount(t *testing.T) {
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)

	tests := []struct {
		name        string
		utc         string
		loc         *time.Location
		wantDay     string
		wantWeek    string
		wantMonth   string
		wantWeekday string
	}{
		{
			name:        "golden fixture 2026-06-09 giờ VN",
			utc:         "2026-06-09T05:00:00Z", // 12:00 +07
			loc:         vn,
			wantDay:     "2026-06-09",
			wantWeek:    "W24",
			wantMonth:   "06/2026",
			wantWeekday: "Tue",
		},
		{
			name:        "23:00 UTC rơi sang ngày hôm sau ở giờ VN",
			utc:         "2026-06-09T23:00:00Z", // 06:00 +07 ngày 10
			loc:         vn,
			wantDay:     "2026-06-10",
			wantWeek:    "W24",
			wantMonth:   "06/2026",
			wantWeekday: "Wed",
		},
		{
			name:        "cùng thời điểm nhưng gom theo UTC thì là ngày 09",
			utc:         "2026-06-09T23:00:00Z",
			loc:         time.UTC,
			wantDay:     "2026-06-09",
			wantWeek:    "W24",
			wantMonth:   "06/2026",
			wantWeekday: "Tue",
		},
		{
			name:        "sát nửa đêm giờ VN vẫn nằm trong ngày đó",
			utc:         "2026-06-10T16:59:59Z", // 23:59:59 +07
			loc:         vn,
			wantDay:     "2026-06-10",
			wantWeek:    "W24",
			wantMonth:   "06/2026",
			wantWeekday: "Wed",
		},
		{
			name:        "ISO week vắt qua năm: 01/01/2027 thuộc tuần 53 của 2026",
			utc:         "2027-01-01T05:00:00Z",
			loc:         vn,
			wantDay:     "2027-01-01",
			wantWeek:    "W53",
			wantMonth:   "01/2027",
			wantWeekday: "Fri",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at, err := time.Parse(time.RFC3339, tt.utc)
			require.NoError(t, err)

			day, week, month, weekday := DateParts(at, tt.loc)
			require.Equal(t, tt.wantDay, day)
			require.Equal(t, tt.wantWeek, week)
			require.Equal(t, tt.wantMonth, month)
			require.Equal(t, tt.wantWeekday, weekday)
		})
	}
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/metrics/ -v`
Expected: FAIL — `undefined: Net`

- [ ] **Step 3: Cài đặt derived.go**

```go
// Package metrics tính trường suy diễn của từng lệnh và KPI toàn tài khoản
// theo trading-journal-plan.md §3 và §4. Thuần: không I/O, không DB.
package metrics

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// Net là lãi lỗ thực: profit trừ phí (§3.1).
func Net(t domain.Trade) decimal.Decimal {
	return t.Profit.Sub(t.Fee)
}

// WinLoss trả 1 khi net >= 0 (§3.2). Lưu ý net = 0 tính là KHÔNG THUA,
// nhưng ở §4 nó không được đếm vào win_count lẫn loss_count.
func WinLoss(net decimal.Decimal) int {
	if net.IsNegative() {
		return 0
	}
	return 1
}

// WinSign trả 1 hoặc −1, dùng cho thuật toán chuỗi thắng/thua (§5.1).
func WinSign(net decimal.Decimal) int {
	if net.IsNegative() {
		return -1
	}
	return 1
}

// DateParts quy thời điểm vào lệnh (lưu UTC) về timezone của account rồi
// sinh các nhãn dùng để gom nhóm. Đây là chỗ DUY NHẤT trong hệ thống quyết
// định một lệnh thuộc về ngày nào — mọi biểu đồ theo ngày/tuần/tháng/thứ đều
// bắt nguồn từ đây.
//
// Tuần theo ISO-8601 (spec quyết định #5), không phải WEEKNUM kiểu Excel.
func DateParts(enteredAt time.Time, loc *time.Location) (day, week, month, weekday string) {
	local := enteredAt.In(loc)
	_, isoWeek := local.ISOWeek()
	return local.Format("2006-01-02"),
		fmt.Sprintf("W%d", isoWeek),
		local.Format("01/2006"),
		local.Format("Mon")
}
```

- [ ] **Step 4: Chạy test**

Run: `cd backend && go test ./internal/metrics/ -v`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/metrics/
git commit -m "feat: add per-trade derived fields with account-timezone date parts"
```

---

## Task 9: metrics.Enrich — lũy kế, running peak, drawdown

**Files:**
- Create: `backend/internal/metrics/enrich.go`
- Test: `backend/internal/metrics/enrich_test.go`

**Interfaces:**
- Consumes: `scoring` (Task 7), `metrics.Net`/`WinLoss`/`WinSign`/`DateParts` (Task 8)
- Produces:
  - `metrics.Enriched` — struct có field: `Trade domain.Trade`, `Net`, `CumByTrade`, `CumByDay`, `CumTheory`, `RunningPeak`, `Drawdown` (đều `decimal.Decimal`), `WinLoss`, `WinSign`, `ScoreEntry`, `ScoreExit`, `ScoreInTrade`, `ScorePsych` (đều `int`), `ScoreTotal *int`, `TradeClass`, `Day`, `Week`, `Month`, `Weekday` (đều `string`)
  - `metrics.Enrich(trades []domain.Trade, acc domain.Account) ([]Enriched, error)`

- [ ] **Step 1: Viết test thất bại — golden fixture §7 phần per-trade**

Tạo `backend/internal/metrics/enrich_test.go`:

```go
package metrics

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// goldenAccount và goldenTrades tái hiện fixture ở trading-journal-plan.md §7.
// entered_at đặt lúc 12:00 giờ VN để `day` khớp đúng cột "day" của bảng gốc.
func goldenAccount() domain.Account {
	return domain.Account{
		ID:             1,
		Code:           "ACC1",
		InitialBalance: dec("5000"),
		RiskPerTrade:   dec("0.01"),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

func vnNoon(t *testing.T, date string) time.Time {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	parsed, err := time.ParseInLocation("2006-01-02 15:04", date+" 12:00", vn)
	require.NoError(t, err)
	return parsed.UTC()
}

func ptr(s string) *decimal.Decimal {
	d := dec(s)
	return &d
}

func goldenTrades(t *testing.T) []domain.Trade {
	t.Helper()
	return []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("100"), ProfitTheory: ptr("50"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-09"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("-50"), ProfitTheory: ptr("100"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-10"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("100"), ProfitTheory: ptr("-50"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-11"), Symbol: "xau", Direction: domain.DirectionLong, Profit: dec("200"), ProfitTheory: nil, Fee: dec("0")},
	}
}

func TestEnrichGoldenFixturePerTrade(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)
	require.Len(t, rows, 4)

	want := []struct {
		net         string
		winLoss     int
		cumByTrade  string
		cumByDay    string
		cumTheory   string
		runningPeak string
		drawdown    string
		weekday     string
	}{
		{"100", 1, "100", "50", "50", "100", "0", "Tue"},
		{"-50", 0, "50", "50", "150", "100", "50", "Tue"},
		{"100", 1, "150", "150", "100", "150", "0", "Wed"},
		{"200", 1, "350", "350", "100", "350", "0", "Thu"},
	}

	for i, w := range want {
		got := rows[i]
		require.True(t, got.Net.Equal(dec(w.net)), "dòng %d Net = %s, muốn %s", i+1, got.Net, w.net)
		require.Equal(t, w.winLoss, got.WinLoss, "dòng %d WinLoss", i+1)
		require.True(t, got.CumByTrade.Equal(dec(w.cumByTrade)), "dòng %d CumByTrade = %s, muốn %s", i+1, got.CumByTrade, w.cumByTrade)
		require.True(t, got.CumByDay.Equal(dec(w.cumByDay)), "dòng %d CumByDay = %s, muốn %s", i+1, got.CumByDay, w.cumByDay)
		require.True(t, got.CumTheory.Equal(dec(w.cumTheory)), "dòng %d CumTheory = %s, muốn %s", i+1, got.CumTheory, w.cumTheory)
		require.True(t, got.RunningPeak.Equal(dec(w.runningPeak)), "dòng %d RunningPeak = %s, muốn %s", i+1, got.RunningPeak, w.runningPeak)
		require.True(t, got.Drawdown.Equal(dec(w.drawdown)), "dòng %d Drawdown = %s, muốn %s", i+1, got.Drawdown, w.drawdown)
		require.Equal(t, w.weekday, got.Weekday, "dòng %d Weekday", i+1)
		require.Nil(t, got.ScoreTotal, "dòng %d chưa chấm điểm", i+1)
		require.Equal(t, domain.ClassNotEvaluated, got.TradeClass, "dòng %d", i+1)
	}
}

func TestEnrichRunningPeakSanTaiKhongKhiThuaNgayLenhDau(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("-100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("200"), Fee: dec("0")},
	}

	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	// Đỉnh bị sàn tại 0, nên drawdown phản ánh mức âm so với mốc 0.
	require.True(t, rows[0].RunningPeak.Equal(dec("0")))
	require.True(t, rows[0].Drawdown.Equal(dec("100")))
	require.True(t, rows[1].RunningPeak.Equal(dec("0")))
	require.True(t, rows[1].Drawdown.Equal(dec("150")))
	require.True(t, rows[2].CumByTrade.Equal(dec("50")))
	require.True(t, rows[2].RunningPeak.Equal(dec("50")))
	require.True(t, rows[2].Drawdown.Equal(dec("0")))
}

func TestEnrichSapXepTheoSTTDuKhiDauVaoLonXon(t *testing.T) {
	acc := goldenAccount()
	in := goldenTrades(t)
	shuffled := []domain.Trade{in[2], in[0], in[3], in[1]}

	rows, err := Enrich(shuffled, acc)
	require.NoError(t, err)

	require.Equal(t, []int{1, 2, 3, 4}, []int{rows[0].Trade.STT, rows[1].Trade.STT, rows[2].Trade.STT, rows[3].Trade.STT})
	require.True(t, rows[3].CumByTrade.Equal(dec("350")))
}

func TestEnrichCumByDayGiongNhauChoMoiLenhTrongCungNgay(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)

	require.Equal(t, rows[0].Day, rows[1].Day)
	require.True(t, rows[0].CumByDay.Equal(rows[1].CumByDay))
}

func TestEnrichProfitTheoryNilDongGopKhong(t *testing.T) {
	rows, err := Enrich(goldenTrades(t), goldenAccount())
	require.NoError(t, err)
	require.True(t, rows[3].CumTheory.Equal(rows[2].CumTheory), "lệnh 4 để trống profit_theory nên cum_theory không đổi")
}

func TestEnrichChamDiemDayDu(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{{
		STT:            1,
		EnteredAt:      vnNoon(t, "2026-06-09"),
		Profit:         dec("100"),
		Fee:            dec("0"),
		EntryQuality:   domain.EntryPlanned,
		InTradeQuality: domain.InTradeFollowed,
		ExitQuality:    domain.ExitHitTP,
		Psychology:     domain.PsychNoError,
	}}

	rows, err := Enrich(trades, acc)
	require.NoError(t, err)
	require.NotNil(t, rows[0].ScoreTotal)
	require.Equal(t, 100, *rows[0].ScoreTotal)
	require.Equal(t, domain.ClassPlanned, rows[0].TradeClass)
	require.Equal(t, 25, rows[0].ScoreEntry)
	require.Equal(t, 25, rows[0].ScoreExit)
	require.Equal(t, 25, rows[0].ScoreInTrade)
	require.Equal(t, 25, rows[0].ScorePsych)
}

func TestEnrichTimezoneSaiTraLoi(t *testing.T) {
	acc := goldenAccount()
	acc.Timezone = "Asia/Khong_Ton_Tai"

	_, err := Enrich(goldenTrades(t), acc)
	require.Error(t, err)
}

func TestEnrichTimezoneRongMacDinhVeGioVN(t *testing.T) {
	acc := goldenAccount()
	acc.Timezone = ""

	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)
	require.Equal(t, "2026-06-09", rows[0].Day)
}

func TestEnrichDanhSachRong(t *testing.T) {
	rows, err := Enrich(nil, goldenAccount())
	require.NoError(t, err)
	require.Empty(t, rows)
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/metrics/ -run TestEnrich -v`
Expected: FAIL — `undefined: Enrich`

- [ ] **Step 3: Cài đặt enrich.go**

```go
package metrics

import (
	"fmt"
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/scoring"
)

// DefaultTimezone dùng khi account chưa đặt timezone.
const DefaultTimezone = "Asia/Ho_Chi_Minh"

// Enriched là một lệnh kèm toàn bộ trường suy diễn. Không có gì ở đây được
// lưu xuống DB — tất cả tính lại mỗi lần đọc.
type Enriched struct {
	Trade domain.Trade

	Net     decimal.Decimal
	WinLoss int
	WinSign int

	ScoreEntry   int
	ScoreExit    int
	ScoreInTrade int
	ScorePsych   int
	ScoreTotal   *int
	TradeClass   string

	Day     string // "2026-06-09" theo timezone của account
	Week    string // "W24", ISO-8601
	Month   string // "06/2026"
	Weekday string // "Tue"

	CumByTrade  decimal.Decimal
	CumByDay    decimal.Decimal
	CumTheory   decimal.Decimal
	RunningPeak decimal.Decimal
	Drawdown    decimal.Decimal
}

// Enrich tính mọi trường suy diễn cho một danh sách lệnh CỦA CÙNG MỘT account.
// Trộn lệnh của nhiều account vào đây sẽ cho lũy kế sai.
//
// Đầu vào không cần sắp xếp sẵn — hàm tự sort theo STT vì mọi trường lũy kế
// phụ thuộc thứ tự đó.
//
// Lỗi duy nhất có thể xảy ra là timezone của account không phải tên IANA hợp lệ.
func Enrich(trades []domain.Trade, acc domain.Account) ([]Enriched, error) {
	tzName := acc.Timezone
	if tzName == "" {
		tzName = DefaultTimezone
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		return nil, fmt.Errorf("timezone %q của account không hợp lệ: %w", tzName, err)
	}

	sorted := make([]domain.Trade, len(trades))
	copy(sorted, trades)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].STT < sorted[j].STT })

	rows := make([]Enriched, 0, len(sorted))

	cum := decimal.Zero
	cumTheory := decimal.Zero
	peak := decimal.Zero // sàn tại 0 theo §3.7

	// Tổng net theo từng ngày, dùng để dựng cum_by_day ở lượt thứ hai.
	netByDay := map[string]decimal.Decimal{}

	for _, t := range sorted {
		net := Net(t)
		cum = cum.Add(net)

		if t.ProfitTheory != nil {
			cumTheory = cumTheory.Add(*t.ProfitTheory)
		}

		if cum.GreaterThan(peak) {
			peak = cum
		}

		day, week, month, weekday := DateParts(t.EnteredAt, loc)
		netByDay[day] = netByDay[day].Add(net)

		total := scoring.Total(t.EntryQuality, t.InTradeQuality, t.ExitQuality, t.Psychology)

		rows = append(rows, Enriched{
			Trade:        t,
			Net:          net,
			WinLoss:      WinLoss(net),
			WinSign:      WinSign(net),
			ScoreEntry:   scoring.Entry(t.EntryQuality),
			ScoreExit:    scoring.Exit(t.ExitQuality),
			ScoreInTrade: scoring.InTrade(t.InTradeQuality),
			ScorePsych:   scoring.Psych(t.Psychology),
			ScoreTotal:   total,
			TradeClass:   scoring.Classify(total),
			Day:          day,
			Week:         week,
			Month:        month,
			Weekday:      weekday,
			CumByTrade:   cum,
			CumTheory:    cumTheory,
			RunningPeak:  peak,
			Drawdown:     peak.Sub(cum),
		})
	}

	fillCumByDay(rows, netByDay)
	return rows, nil
}

// fillCumByDay gán cum_by_day = tổng net của MỌI ngày <= ngày của lệnh đó.
// Định nghĩa theo ngày (không theo thứ tự STT) nên kết quả không đổi khi
// người dùng nhập lệnh của một ngày cũ vào sau — đúng ý "lũy kế tới hết ngày" ở §3.5.
func fillCumByDay(rows []Enriched, netByDay map[string]decimal.Decimal) {
	days := make([]string, 0, len(netByDay))
	for d := range netByDay {
		days = append(days, d)
	}
	sort.Strings(days) // định dạng YYYY-MM-DD nên sort chuỗi = sort ngày

	cumByDay := make(map[string]decimal.Decimal, len(days))
	running := decimal.Zero
	for _, d := range days {
		running = running.Add(netByDay[d])
		cumByDay[d] = running
	}

	for i := range rows {
		rows[i].CumByDay = cumByDay[rows[i].Day]
	}
}
```

- [ ] **Step 4: Chạy test**

Run: `cd backend && go test ./internal/metrics/ -v`
Expected: PASS toàn bộ, gồm cả golden fixture per-trade.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/metrics/
git commit -m "feat: add Enrich with cumulative equity, running peak and drawdown"
```

---

## Task 10: metrics.ComputeKPI — 24 chỉ số §4

**Files:**
- Create: `backend/internal/metrics/kpi.go`
- Test: `backend/internal/metrics/kpi_test.go`

**Interfaces:**
- Consumes: `Enriched` (Task 9), `domain.Account`, `domain.CashFlow`
- Produces:
  - `metrics.KPI` — struct, các trường có thể không xác định dùng `*decimal.Decimal`
  - `metrics.ComputeKPI(rows []Enriched, acc domain.Account, flows []domain.CashFlow) KPI`

- [ ] **Step 1: Viết test thất bại — golden fixture §7 phần KPI + edge case §6**

Tạo `backend/internal/metrics/kpi_test.go`:

```go
package metrics

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// requireDec so sánh sau khi làm tròn, dùng cho các giá trị chia không hết
// như ave_win = 400/3.
func requireDec(t *testing.T, got *decimal.Decimal, want string, places int32) {
	t.Helper()
	require.NotNil(t, got, "muốn %s nhưng nhận nil", want)
	require.Equal(t, want, got.Round(places).String())
}

func TestComputeKPIGoldenFixture(t *testing.T) {
	acc := goldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)

	require.True(t, kpi.TotalWin.Equal(dec("400")))
	require.True(t, kpi.TotalLoss.Equal(dec("-50")))
	require.True(t, kpi.NetProfit.Equal(dec("350")))
	requireDec(t, kpi.NetReturnPct, "0.07", 4)
	require.True(t, kpi.TotalFees.Equal(dec("0")))
	requireDec(t, kpi.ProfitFactor, "8", 4)
	require.Equal(t, 3, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.Equal(t, 4, kpi.TotalTrades)
	requireDec(t, kpi.WinPct, "0.75", 4)
	requireDec(t, kpi.AveWin, "133.3333", 4)
	requireDec(t, kpi.AveLoss, "-50", 4)
	requireDec(t, kpi.BiggestWinner, "200", 4)
	requireDec(t, kpi.BiggestLoser, "-50", 4)
	require.True(t, kpi.OneR.Equal(dec("50")))
	requireDec(t, kpi.BiggestRWin, "4", 4)
	requireDec(t, kpi.BiggestRLoss, "-1", 4)
	requireDec(t, kpi.RRActual, "2.6667", 4)
	requireDec(t, kpi.Expectancy, "87.5", 4)
	require.True(t, kpi.MaxDrawdown.Equal(dec("50")))
	requireDec(t, kpi.MaxDDPct, "-0.009346", 6)
	requireDec(t, kpi.RecoveryFactor, "7", 4)
	require.True(t, kpi.CurrentBalance.Equal(dec("5350")))
}

func TestComputeKPIKhongCoLenhNao(t *testing.T) {
	acc := goldenAccount()
	kpi := ComputeKPI(nil, acc, nil)

	require.True(t, kpi.TotalWin.Equal(decimal.Zero))
	require.True(t, kpi.TotalLoss.Equal(decimal.Zero))
	require.True(t, kpi.NetProfit.Equal(decimal.Zero))
	require.Equal(t, 0, kpi.TotalTrades)
	require.Nil(t, kpi.ProfitFactor)
	require.Nil(t, kpi.WinPct)
	require.Nil(t, kpi.AveWin)
	require.Nil(t, kpi.AveLoss)
	require.Nil(t, kpi.BiggestWinner)
	require.Nil(t, kpi.BiggestLoser)
	require.Nil(t, kpi.Expectancy)
	require.Nil(t, kpi.RecoveryFactor)
	require.True(t, kpi.CurrentBalance.Equal(dec("5000")))
}

func TestComputeKPIChuaCoLenhThuaThiProfitFactorNil(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("50"), Fee: dec("0")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Nil(t, kpi.ProfitFactor, "total_loss = 0 thì không chia được")
	require.Nil(t, kpi.RecoveryFactor, "max_drawdown = 0 thì không chia được")
	require.Nil(t, kpi.AveLoss)
	require.Nil(t, kpi.RRActual)
}

func TestComputeKPILenhHoaKhongVaoWinLossCount(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("0"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("-40"), Fee: dec("0")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Equal(t, 1, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.Equal(t, 2, kpi.TotalTrades, "lệnh net = 0 bị loại khỏi total_trades")
	require.True(t, kpi.NetProfit.Equal(dec("60")))
}

func TestComputeKPIRiskBangKhongThiChiSoRNil(t *testing.T) {
	acc := goldenAccount()
	acc.RiskPerTrade = dec("0")
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.True(t, kpi.OneR.Equal(decimal.Zero))
	require.Nil(t, kpi.BiggestRWin)
	require.Nil(t, kpi.BiggestRLoss)
}

func TestComputeKPIPhiAnHetLaiThanhLenhThua(t *testing.T) {
	acc := goldenAccount()
	trades := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("10"), Fee: dec("12")},
	}
	rows, err := Enrich(trades, acc)
	require.NoError(t, err)

	kpi := ComputeKPI(rows, acc, nil)
	require.Equal(t, 0, kpi.WinCount)
	require.Equal(t, 1, kpi.LossCount)
	require.True(t, kpi.TotalLoss.Equal(dec("-2")))
}

func TestComputeKPICurrentBalanceCongNapTruRut(t *testing.T) {
	acc := goldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	flows := []domain.CashFlow{
		{Amount: dec("1000"), Type: "deposit"},
		{Amount: dec("300"), Type: "withdraw"},
	}

	kpi := ComputeKPI(rows, acc, flows)
	require.True(t, kpi.CurrentBalance.Equal(dec("6050")), "5000 + 350 + 1000 − 300")
}

func TestComputeKPIDoiThuTuKhongDoiTongNhungDoiDrawdown(t *testing.T) {
	acc := goldenAccount()

	// Cùng một tập lãi lỗ {100, −50, −50, 200}, chỉ khác thứ tự.
	// A: hai lệnh thua liên tiếp -> equity 100 → 50 → 0, drawdown chạm 100.
	orderA := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-12"), Profit: dec("200"), Fee: dec("0")},
	}
	// B: hai lệnh thua bị tách ra -> equity 100 → 50 → 250 → 200, drawdown tối đa chỉ 50.
	orderB := []domain.Trade{
		{STT: 1, EnteredAt: vnNoon(t, "2026-06-09"), Profit: dec("100"), Fee: dec("0")},
		{STT: 2, EnteredAt: vnNoon(t, "2026-06-10"), Profit: dec("-50"), Fee: dec("0")},
		{STT: 3, EnteredAt: vnNoon(t, "2026-06-11"), Profit: dec("200"), Fee: dec("0")},
		{STT: 4, EnteredAt: vnNoon(t, "2026-06-12"), Profit: dec("-50"), Fee: dec("0")},
	}

	rowsA, err := Enrich(orderA, acc)
	require.NoError(t, err)
	rowsB, err := Enrich(orderB, acc)
	require.NoError(t, err)

	kpiA := ComputeKPI(rowsA, acc, nil)
	kpiB := ComputeKPI(rowsB, acc, nil)

	require.True(t, kpiA.NetProfit.Equal(kpiB.NetProfit), "tổng không đổi khi đổi thứ tự")
	require.Equal(t, kpiA.TotalTrades, kpiB.TotalTrades)
	require.True(t, kpiA.TotalWin.Equal(kpiB.TotalWin))

	require.True(t, kpiA.MaxDrawdown.Equal(dec("100")), "hai lệnh thua liên tiếp")
	require.True(t, kpiB.MaxDrawdown.Equal(dec("50")), "cùng dữ liệu, thứ tự khác, drawdown khác")
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/metrics/ -run TestComputeKPI -v`
Expected: FAIL — `undefined: ComputeKPI`

- [ ] **Step 3: Cài đặt kpi.go**

```go
package metrics

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// KPI là bộ chỉ số toàn tài khoản theo trading-journal-plan.md §4.
// Trường con trỏ nghĩa là "không xác định" (chia cho 0, hoặc chưa có dữ liệu)
// — frontend hiển thị "—" thay vì 0, vì 0 và "không tính được" khác nhau.
type KPI struct {
	TotalWin  decimal.Decimal
	TotalLoss decimal.Decimal // âm
	NetProfit decimal.Decimal
	TotalFees decimal.Decimal

	NetReturnPct *decimal.Decimal // net_profit / vốn ban đầu
	ProfitFactor *decimal.Decimal // −total_win / total_loss

	WinCount    int
	LossCount   int
	TotalTrades int // win + loss, KHÔNG gồm lệnh net = 0
	WinPct      *decimal.Decimal

	AveWin  *decimal.Decimal
	AveLoss *decimal.Decimal // âm

	BiggestWinner *decimal.Decimal
	BiggestLoser  *decimal.Decimal

	OneR         decimal.Decimal
	BiggestRWin  *decimal.Decimal
	BiggestRLoss *decimal.Decimal
	RRActual     *decimal.Decimal // −ave_win / ave_loss

	Expectancy *decimal.Decimal // kỳ vọng $ mỗi lệnh

	MaxDrawdown    decimal.Decimal
	MaxDDPct       *decimal.Decimal // âm
	RecoveryFactor *decimal.Decimal

	CurrentBalance decimal.Decimal
}

// ComputeKPI tính toàn bộ chỉ số trên TẬP ĐÃ LỌC. Các trường lũy kế bên trong
// rows (CumByTrade, Drawdown) phải được tính từ dãy đầy đủ trước đó — xem
// quy tắc filter ở §7.1 của spec.
func ComputeKPI(rows []Enriched, acc domain.Account, flows []domain.CashFlow) KPI {
	k := KPI{
		TotalWin:  decimal.Zero,
		TotalLoss: decimal.Zero,
		TotalFees: decimal.Zero,
		OneR:      acc.OneR(),
	}

	var maxPeak, maxDD decimal.Decimal
	var biggestWin, biggestLoss *decimal.Decimal

	for _, r := range rows {
		k.TotalFees = k.TotalFees.Add(r.Trade.Fee)

		switch {
		case r.Net.IsPositive():
			k.TotalWin = k.TotalWin.Add(r.Net)
			k.WinCount++
		case r.Net.IsNegative():
			k.TotalLoss = k.TotalLoss.Add(r.Net)
			k.LossCount++
		}
		// net = 0: không cộng vào đâu cả, không đếm.

		if biggestWin == nil || r.Net.GreaterThan(*biggestWin) {
			v := r.Net
			biggestWin = &v
		}
		if biggestLoss == nil || r.Net.LessThan(*biggestLoss) {
			v := r.Net
			biggestLoss = &v
		}
		if r.Drawdown.GreaterThan(maxDD) {
			maxDD = r.Drawdown
		}
		if r.RunningPeak.GreaterThan(maxPeak) {
			maxPeak = r.RunningPeak
		}
	}

	k.NetProfit = k.TotalWin.Add(k.TotalLoss)
	k.TotalTrades = k.WinCount + k.LossCount
	k.BiggestWinner = biggestWin
	k.BiggestLoser = biggestLoss
	k.MaxDrawdown = maxDD

	if !acc.InitialBalance.IsZero() {
		k.NetReturnPct = ptrDec(k.NetProfit.Div(acc.InitialBalance))
	}
	if !k.TotalLoss.IsZero() {
		k.ProfitFactor = ptrDec(k.TotalWin.Neg().Div(k.TotalLoss))
	}
	if k.TotalTrades > 0 {
		k.WinPct = ptrDec(decimal.NewFromInt(int64(k.WinCount)).Div(decimal.NewFromInt(int64(k.TotalTrades))))
	}
	if k.WinCount > 0 {
		k.AveWin = ptrDec(k.TotalWin.Div(decimal.NewFromInt(int64(k.WinCount))))
	}
	if k.LossCount > 0 {
		k.AveLoss = ptrDec(k.TotalLoss.Div(decimal.NewFromInt(int64(k.LossCount))))
	}
	if !k.OneR.IsZero() {
		if biggestWin != nil {
			k.BiggestRWin = ptrDec(biggestWin.Div(k.OneR))
		}
		if biggestLoss != nil {
			k.BiggestRLoss = ptrDec(biggestLoss.Div(k.OneR))
		}
	}
	if k.AveWin != nil && k.AveLoss != nil && !k.AveLoss.IsZero() {
		k.RRActual = ptrDec(k.AveWin.Neg().Div(*k.AveLoss))
	}
	if k.WinPct != nil && k.AveWin != nil && k.AveLoss != nil {
		win := k.WinPct.Mul(*k.AveWin)
		loss := decimal.NewFromInt(1).Sub(*k.WinPct).Mul(*k.AveLoss)
		k.Expectancy = ptrDec(win.Add(loss))
	}
	// Mẫu số là đỉnh equity tuyệt đối: đỉnh lãi lũy kế cộng vốn ban đầu.
	if denom := maxPeak.Add(acc.InitialBalance); !denom.IsZero() {
		k.MaxDDPct = ptrDec(maxDD.Neg().Div(denom))
	}
	if !maxDD.IsZero() {
		k.RecoveryFactor = ptrDec(k.NetProfit.Div(maxDD))
	}

	k.CurrentBalance = acc.InitialBalance.Add(k.NetProfit).Add(netCashFlow(flows))
	return k
}

func netCashFlow(flows []domain.CashFlow) decimal.Decimal {
	total := decimal.Zero
	for _, f := range flows {
		if f.Type == "withdraw" {
			total = total.Sub(f.Amount)
			continue
		}
		total = total.Add(f.Amount)
	}
	return total
}

func ptrDec(d decimal.Decimal) *decimal.Decimal { return &d }
```

- [ ] **Step 4: Chạy test**

Run: `cd backend && go test ./internal/metrics/ -v`
Expected: PASS toàn bộ. Nếu `MaxDDPct` lệch, kiểm tra mẫu số phải là `max(running_peak) + IB` = 5350, không phải chỉ IB.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/metrics/
git commit -m "feat: add account KPI computation per spec section 4"
```

---

## Task 11: aggregate — chuỗi thắng/thua và phân phối R

**Files:**
- Create: `backend/internal/aggregate/streak.go`, `backend/internal/aggregate/rdist.go`
- Test: `backend/internal/aggregate/streak_test.go`, `backend/internal/aggregate/rdist_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched` (Task 9)
- Produces:
  - `aggregate.Streaks(rows []metrics.Enriched) (longestWin, longestLoss int)`
  - `aggregate.RBucket{Label string; Wins, Losses, Count int}`
  - `aggregate.RDistribution(rows []metrics.Enriched, oneR decimal.Decimal) []RBucket`

- [ ] **Step 1: Viết test thất bại cho streak**

Tạo `backend/internal/aggregate/streak_test.go`:

```go
package aggregate

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func testAccount() domain.Account {
	return domain.Account{
		InitialBalance: dec("5000"),
		RiskPerTrade:   dec("0.01"),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

// enrichProfits dựng nhanh danh sách Enriched từ dãy lãi lỗ, mỗi lệnh một ngày
// liên tiếp bắt đầu từ 2026-06-09.
func enrichProfits(t *testing.T, profits ...string) []metrics.Enriched {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	base := time.Date(2026, 6, 9, 12, 0, 0, 0, vn)

	trades := make([]domain.Trade, 0, len(profits))
	for i, p := range profits {
		trades = append(trades, domain.Trade{
			STT:       i + 1,
			EnteredAt: base.AddDate(0, 0, i).UTC(),
			Symbol:    "xau",
			Direction: domain.DirectionLong,
			Profit:    dec(p),
			Fee:       decimal.Zero,
		})
	}

	rows, err := metrics.Enrich(trades, testAccount())
	require.NoError(t, err)
	return rows
}

func TestStreaksGoldenFixture(t *testing.T) {
	rows := enrichProfits(t, "100", "-50", "100", "200")

	win, loss := Streaks(rows)
	require.Equal(t, 2, win)
	require.Equal(t, 1, loss)
}

func TestStreaksChuoiThuaDai(t *testing.T) {
	rows := enrichProfits(t, "-10", "-20", "-30", "50", "-5")

	win, loss := Streaks(rows)
	require.Equal(t, 1, win)
	require.Equal(t, 3, loss)
}

func TestStreaksLenhHoaTinhLaThang(t *testing.T) {
	rows := enrichProfits(t, "100", "0", "50")

	win, loss := Streaks(rows)
	require.Equal(t, 3, win, "net = 0 có win_sign = 1 nên chuỗi thắng không đứt")
	require.Equal(t, 0, loss)
}

func TestStreaksDanhSachRong(t *testing.T) {
	win, loss := Streaks(nil)
	require.Equal(t, 0, win)
	require.Equal(t, 0, loss)
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/aggregate/ -v`
Expected: FAIL — `undefined: Streaks`

- [ ] **Step 3: Cài đặt streak.go**

```go
// Package aggregate gom nhóm lệnh thành dữ liệu cho biểu đồ
// (trading-journal-plan.md §5). Thuần: không I/O, không DB.
package aggregate

import "journal/internal/metrics"

// Streaks tìm chuỗi thắng dài nhất và chuỗi thua dài nhất theo thứ tự STT (§5.1).
// Trả về hai số dương; chuỗi thua trả về độ dài, không phải số âm.
func Streaks(rows []metrics.Enriched) (longestWin, longestLoss int) {
	streak := 0
	for _, r := range rows {
		if r.WinSign > 0 {
			if streak > 0 {
				streak++
			} else {
				streak = 1
			}
		} else {
			if streak < 0 {
				streak--
			} else {
				streak = -1
			}
		}

		if streak > longestWin {
			longestWin = streak
		}
		if -streak > longestLoss {
			longestLoss = -streak
		}
	}
	return longestWin, longestLoss
}
```

- [ ] **Step 4: Chạy test streak**

Run: `cd backend && go test ./internal/aggregate/ -run TestStreaks -v`
Expected: PASS cả 4 case.

- [ ] **Step 5: Viết test thất bại cho phân phối R**

Tạo `backend/internal/aggregate/rdist_test.go`:

```go
package aggregate

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func bucketByLabel(t *testing.T, buckets []RBucket, label string) RBucket {
	t.Helper()
	for _, b := range buckets {
		if b.Label == label {
			return b
		}
	}
	t.Fatalf("không tìm thấy bucket %q", label)
	return RBucket{}
}

func TestRDistributionGiuDuThuTu22Bucket(t *testing.T) {
	buckets := RDistribution(nil, dec("50"))
	require.Len(t, buckets, 22)
	require.Equal(t, "Dưới -20R", buckets[0].Label)
	require.Equal(t, "0R to -1R", buckets[10].Label)
	require.Equal(t, "0R to 1R", buckets[11].Label)
	require.Equal(t, "Trên 20R", buckets[21].Label)
	for _, b := range buckets {
		require.Equal(t, 0, b.Count)
	}
}

func TestRDistributionPhanBucketDungBien(t *testing.T) {
	// oneR = 50 nên net 100 = 2R, net -50 = -1R, ...
	// Quy ước: mỗi bucket là nửa mở [lo, hi) trên trục số, nghĩa là bucket âm
	// CHỨA đầu sâu hơn và KHÔNG chứa đầu gần 0. Đúng -1R nằm ở "0R to -1R",
	// đúng -2R nằm ở "-1R to -2R".
	rows := enrichProfits(t,
		"100",   // 2R    -> "2R to 3R"
		"-50",   // -1R   -> "0R to -1R"
		"-100",  // -2R   -> "-1R to -2R"
		"25",    // 0.5R  -> "0R to 1R"
		"-25",   // -0.5R -> "0R to -1R"
		"1050",  // 21R   -> "Trên 20R"
		"-1050", // -21R  -> "Dưới -20R"
		"0",     // 0R    -> "0R to 1R"
	)

	buckets := RDistribution(rows, dec("50"))

	require.Equal(t, 1, bucketByLabel(t, buckets, "2R to 3R").Count)
	require.Equal(t, 2, bucketByLabel(t, buckets, "0R to -1R").Count, "đúng -1R và -0.5R")
	require.Equal(t, 1, bucketByLabel(t, buckets, "-1R to -2R").Count, "đúng -2R")
	require.Equal(t, 2, bucketByLabel(t, buckets, "0R to 1R").Count, "0.5R và đúng 0R")
	require.Equal(t, 1, bucketByLabel(t, buckets, "Trên 20R").Count)
	require.Equal(t, 1, bucketByLabel(t, buckets, "Dưới -20R").Count)
}

func TestRDistributionTachThangThua(t *testing.T) {
	rows := enrichProfits(t, "100", "150", "-100")

	buckets := RDistribution(rows, dec("50"))

	b2R := bucketByLabel(t, buckets, "2R to 3R")
	require.Equal(t, 1, b2R.Wins)
	require.Equal(t, 0, b2R.Losses)

	b3R := bucketByLabel(t, buckets, "3R to 4R")
	require.Equal(t, 1, b3R.Wins)

	bLoss := bucketByLabel(t, buckets, "-1R to -2R")
	require.Equal(t, 0, bLoss.Wins)
	require.Equal(t, 1, bLoss.Losses)
}

func TestRDistributionOneRBangKhongTraBucketRong(t *testing.T) {
	rows := enrichProfits(t, "100", "-50")

	buckets := RDistribution(rows, decimal.Zero)

	require.Len(t, buckets, 22, "vẫn trả đủ nhãn để biểu đồ không vỡ")
	for _, b := range buckets {
		require.Equal(t, 0, b.Count, "không chia được cho 0 thì không xếp lệnh nào")
	}
}
```

- [ ] **Step 6: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/aggregate/ -run TestRDistribution -v`
Expected: FAIL — `undefined: RDistribution`

- [ ] **Step 7: Cài đặt rdist.go**

```go
package aggregate

import (
	"github.com/shopspring/decimal"

	"journal/internal/metrics"
)

// RBucket là một cột của histogram phân phối R.
type RBucket struct {
	Label  string `json:"label"`
	Count  int    `json:"count"`
	Wins   int    `json:"wins"`
	Losses int    `json:"losses"`
}

// rBucketDef mô tả một khoảng R. Khoảng là nửa mở trên trục số: lo <= r < hi.
// hasLo/hasHi = false nghĩa là vô cực về phía đó.
//
// Hệ quả cho các bucket âm: bucket chứa đầu SÂU HƠN và không chứa đầu gần 0.
// Đúng -1R rơi vào "0R to -1R"; đúng -2R rơi vào "-1R to -2R". Không có lệnh
// nào bị đếm hai lần hoặc lọt khe.
type rBucketDef struct {
	label string
	lo    float64
	hi    float64
	hasLo bool
	hasHi bool
}

// Thứ tự và nhãn lấy nguyên văn từ trading-journal-plan.md §5.9, kể cả nhãn
// "5R to R6" viết nhầm trong sheet gốc — giữ nguyên để khớp với file cũ.
var rBucketDefs = []rBucketDef{
	{label: "Dưới -20R", hi: -20, hasHi: true},
	{label: "-15R to -20R", lo: -20, hi: -15, hasLo: true, hasHi: true},
	{label: "-10R to -15R", lo: -15, hi: -10, hasLo: true, hasHi: true},
	{label: "-8R to -10R", lo: -10, hi: -8, hasLo: true, hasHi: true},
	{label: "-6R to -8R", lo: -8, hi: -6, hasLo: true, hasHi: true},
	{label: "-5R to -6R", lo: -6, hi: -5, hasLo: true, hasHi: true},
	{label: "-4R to -5R", lo: -5, hi: -4, hasLo: true, hasHi: true},
	{label: "-3R to -4R", lo: -4, hi: -3, hasLo: true, hasHi: true},
	{label: "-2R to -3R", lo: -3, hi: -2, hasLo: true, hasHi: true},
	{label: "-1R to -2R", lo: -2, hi: -1, hasLo: true, hasHi: true},
	{label: "0R to -1R", lo: -1, hi: 0, hasLo: true, hasHi: true},
	{label: "0R to 1R", lo: 0, hi: 1, hasLo: true, hasHi: true},
	{label: "1R to 2R", lo: 1, hi: 2, hasLo: true, hasHi: true},
	{label: "2R to 3R", lo: 2, hi: 3, hasLo: true, hasHi: true},
	{label: "3R to 4R", lo: 3, hi: 4, hasLo: true, hasHi: true},
	{label: "4R to 5R", lo: 4, hi: 5, hasLo: true, hasHi: true},
	{label: "5R to R6", lo: 5, hi: 6, hasLo: true, hasHi: true},
	{label: "6R to 8R", lo: 6, hi: 8, hasLo: true, hasHi: true},
	{label: "8R to 10R", lo: 8, hi: 10, hasLo: true, hasHi: true},
	{label: "10R to 15R", lo: 10, hi: 15, hasLo: true, hasHi: true},
	{label: "15R to 20R", lo: 15, hi: 20, hasLo: true, hasHi: true},
	{label: "Trên 20R", lo: 20, hasLo: true},
}

// RDistribution xếp mỗi lệnh vào bucket theo R = net / oneR (§5.9).
// Luôn trả đủ 22 bucket theo đúng thứ tự, kể cả bucket rỗng, để biểu đồ giữ
// nguyên trục qua các lần lọc. oneR = 0 thì không xếp lệnh nào (tránh chia 0).
func RDistribution(rows []metrics.Enriched, oneR decimal.Decimal) []RBucket {
	buckets := make([]RBucket, len(rBucketDefs))
	for i, d := range rBucketDefs {
		buckets[i] = RBucket{Label: d.label}
	}
	if oneR.IsZero() {
		return buckets
	}

	for _, r := range rows {
		ratio, _ := r.Net.Div(oneR).Float64()
		idx := bucketIndex(ratio)
		buckets[idx].Count++
		if r.Net.IsNegative() {
			buckets[idx].Losses++
			continue
		}
		buckets[idx].Wins++
	}
	return buckets
}

func bucketIndex(r float64) int {
	for i, d := range rBucketDefs {
		if d.hasLo && r < d.lo {
			continue
		}
		if d.hasHi && r >= d.hi {
			continue
		}
		return i
	}
	return len(rBucketDefs) - 1
}
```

- [ ] **Step 8: Chạy test**

Run: `cd backend && go test ./internal/aggregate/ -v`
Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/aggregate/
git commit -m "feat: add win/loss streaks and R distribution buckets"
```

---

## Task 12: aggregate — bảy nhóm pivot

**Files:**
- Create: `backend/internal/aggregate/pivot.go`
- Test: `backend/internal/aggregate/pivot_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched` (Task 9), `domain.Timeframes`, `domain.Weekdays` (Task 6)
- Produces:
  - `aggregate.Pivot{Key string; Count, WinCount int; SumNet, AveNet, WinRate decimal.Decimal}`
  - `aggregate.BySetup(rows) []Pivot` (top 6), `BySymbol(rows) []Pivot` (top 6)
  - `aggregate.ByTimeframe(rows) []Pivot`, `ByDirection(rows) []Pivot`
  - `aggregate.WeekdayStat{Pivot; ProfitPositive, ProfitNegative decimal.Decimal}`, `ByWeekday(rows) []WeekdayStat`
  - `aggregate.ByWeek(rows) []Pivot`
  - `aggregate.DayStat{Day string; Count int; SumNet, CumByDay decimal.Decimal}`, `ByDay(rows) []DayStat`

Quy ước: `WinCount` đếm lệnh `net > 0`; `Count` đếm mọi lệnh trong nhóm kể cả `net = 0`;
`WinRate = WinCount / Count`. Top 6 sắp theo `Count` giảm dần, hoà thì theo `Key` tăng dần.

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/internal/aggregate/pivot_test.go`:

```go
package aggregate

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// enrichCustom dựng Enriched từ các lệnh đã khai báo đầy đủ hơn enrichProfits.
func enrichCustom(t *testing.T, trades []domain.Trade) []metrics.Enriched {
	t.Helper()
	rows, err := metrics.Enrich(trades, testAccount())
	require.NoError(t, err)
	return rows
}

func vnTrade(t *testing.T, stt int, date, symbol, setup, tf, direction, profit string) domain.Trade {
	t.Helper()
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	at, err := time.ParseInLocation("2006-01-02 15:04", date+" 12:00", vn)
	require.NoError(t, err)

	return domain.Trade{
		STT:       stt,
		EnteredAt: at.UTC(),
		Symbol:    symbol,
		Setup:     setup,
		Timeframe: tf,
		Direction: direction,
		Profit:    dec(profit),
		Fee:       dec("0"),
	}
}

func pivotByKey(t *testing.T, pivots []Pivot, key string) Pivot {
	t.Helper()
	for _, p := range pivots {
		if p.Key == key {
			return p
		}
	}
	t.Fatalf("không tìm thấy pivot %q", key)
	return Pivot{}
}

func TestBySetupTinhDungCacChiSo(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"),
		vnTrade(t, 3, "2026-06-10", "eur", "OB", "H1", domain.DirectionShort, "60"),
	})

	pivots := BySetup(rows)

	fvg := pivotByKey(t, pivots, "FVG")
	require.Equal(t, 2, fvg.Count)
	require.Equal(t, 1, fvg.WinCount)
	require.True(t, fvg.SumNet.Equal(dec("60")))
	require.True(t, fvg.AveNet.Equal(dec("30")))
	require.Equal(t, "0.5", fvg.WinRate.Round(4).String())

	ob := pivotByKey(t, pivots, "OB")
	require.Equal(t, 1, ob.Count)
	require.True(t, ob.SumNet.Equal(dec("60")))
}

func TestBySetupChiLayTop6TheoSoLenh(t *testing.T) {
	trades := []domain.Trade{}
	// setup A có 7 lệnh, B 6, C 5, D 4, E 3, F 2, G 1 -> G bị loại.
	counts := map[string]int{"A": 7, "B": 6, "C": 5, "D": 4, "E": 3, "F": 2, "G": 1}
	stt := 0
	for _, name := range []string{"A", "B", "C", "D", "E", "F", "G"} {
		for i := 0; i < counts[name]; i++ {
			stt++
			trades = append(trades, vnTrade(t, stt, "2026-06-09", "xau", name, "M15", domain.DirectionLong, "10"))
		}
	}

	pivots := BySetup(enrichCustom(t, trades))

	require.Len(t, pivots, 6)
	require.Equal(t, "A", pivots[0].Key)
	require.Equal(t, "F", pivots[5].Key)
}

func TestByTimeframeGiuThuTuTangDan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "H1", domain.DirectionLong, "10"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M5", domain.DirectionLong, "10"),
		vnTrade(t, 3, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10"),
	})

	pivots := ByTimeframe(rows)

	require.Equal(t, []string{"M5", "M15", "H1"}, []string{pivots[0].Key, pivots[1].Key, pivots[2].Key})
}

func TestByDirectionLuonCoDuHaiNhom(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
	})

	pivots := ByDirection(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, domain.DirectionLong, pivots[0].Key)
	require.Equal(t, domain.DirectionShort, pivots[1].Key)
	require.Equal(t, 0, pivots[1].Count)
	require.True(t, pivots[1].WinRate.IsZero())
}

func TestByWeekdayDuBayNgayVaTachAmDuong(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"), // Tue
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"), // Tue
		vnTrade(t, 3, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "60"),  // Wed
	})

	stats := ByWeekday(rows)

	require.Len(t, stats, 7)
	require.Equal(t, "Mon", stats[0].Key)
	require.Equal(t, "Sun", stats[6].Key)

	tue := stats[1]
	require.Equal(t, "Tue", tue.Key)
	require.Equal(t, 2, tue.Count)
	require.True(t, tue.ProfitPositive.Equal(dec("100")))
	require.True(t, tue.ProfitNegative.Equal(dec("-40")))
	require.True(t, tue.SumNet.Equal(dec("60")))
}

func TestByWeekSapTheoNhan(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"), // W24
		vnTrade(t, 2, "2026-06-16", "xau", "FVG", "M15", domain.DirectionLong, "50"),  // W25
	})

	pivots := ByWeek(rows)

	require.Len(t, pivots, 2)
	require.Equal(t, "W24", pivots[0].Key)
	require.Equal(t, "W25", pivots[1].Key)
}

func TestByDayKemDuongCumByDay(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-50"),
		vnTrade(t, 3, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "100"),
	})

	days := ByDay(rows)

	require.Len(t, days, 2)
	require.Equal(t, "2026-06-09", days[0].Day)
	require.True(t, days[0].SumNet.Equal(dec("50")))
	require.True(t, days[0].CumByDay.Equal(dec("50")))
	require.Equal(t, 2, days[0].Count)

	require.Equal(t, "2026-06-10", days[1].Day)
	require.True(t, days[1].SumNet.Equal(dec("100")))
	require.True(t, days[1].CumByDay.Equal(dec("150")))
}

func TestPivotDanhSachRong(t *testing.T) {
	require.Empty(t, BySetup(nil))
	require.Empty(t, ByWeek(nil))
	require.Empty(t, ByDay(nil))
	require.Len(t, ByDirection(nil), 2)
	require.Len(t, ByWeekday(nil), 7)
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/aggregate/ -run TestBySetup -v`
Expected: FAIL — `undefined: BySetup`

- [ ] **Step 3: Cài đặt pivot.go**

```go
package aggregate

import (
	"sort"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// Pivot là một nhóm trong biểu đồ group-by (§5).
// Count đếm mọi lệnh trong nhóm kể cả net = 0; WinCount chỉ đếm net > 0.
type Pivot struct {
	Key      string          `json:"key"`
	Count    int             `json:"count"`
	WinCount int             `json:"win_count"`
	SumNet   decimal.Decimal `json:"sum_net"`
	AveNet   decimal.Decimal `json:"ave_net"`
	WinRate  decimal.Decimal `json:"win_rate"` // 0..1
}

// WeekdayStat bổ sung phần lãi và phần lỗ tách riêng để vẽ cột xanh/đỏ.
type WeekdayStat struct {
	Pivot
	ProfitPositive decimal.Decimal `json:"profit_positive"`
	ProfitNegative decimal.Decimal `json:"profit_negative"`
}

// DayStat là một ngày trên biểu đồ P&L theo ngày, kèm điểm của đường lũy kế.
type DayStat struct {
	Day      string          `json:"day"`
	Count    int             `json:"count"`
	SumNet   decimal.Decimal `json:"sum_net"`
	CumByDay decimal.Decimal `json:"cum_by_day"`
}

type acc struct {
	count    int
	winCount int
	sumNet   decimal.Decimal
	positive decimal.Decimal
	negative decimal.Decimal
}

func (a acc) toPivot(key string) Pivot {
	p := Pivot{
		Key:      key,
		Count:    a.count,
		WinCount: a.winCount,
		SumNet:   a.sumNet,
		AveNet:   decimal.Zero,
		WinRate:  decimal.Zero,
	}
	if a.count > 0 {
		n := decimal.NewFromInt(int64(a.count))
		p.AveNet = a.sumNet.Div(n)
		p.WinRate = decimal.NewFromInt(int64(a.winCount)).Div(n)
	}
	return p
}

func groupBy(rows []metrics.Enriched, key func(metrics.Enriched) string) map[string]acc {
	out := map[string]acc{}
	for _, r := range rows {
		k := key(r)
		a := out[k]
		a.count++
		a.sumNet = a.sumNet.Add(r.Net)
		switch {
		case r.Net.IsPositive():
			a.winCount++
			a.positive = a.positive.Add(r.Net)
		case r.Net.IsNegative():
			a.negative = a.negative.Add(r.Net)
		}
		out[k] = a
	}
	return out
}

// topN sắp theo số lệnh giảm dần, hoà thì theo tên tăng dần, rồi cắt n phần tử.
func topN(groups map[string]acc, n int) []Pivot {
	pivots := make([]Pivot, 0, len(groups))
	for k, a := range groups {
		pivots = append(pivots, a.toPivot(k))
	}
	sort.Slice(pivots, func(i, j int) bool {
		if pivots[i].Count != pivots[j].Count {
			return pivots[i].Count > pivots[j].Count
		}
		return pivots[i].Key < pivots[j].Key
	})
	if len(pivots) > n {
		pivots = pivots[:n]
	}
	return pivots
}

// BySetup trả 6 setup nhiều lệnh nhất (§5.1 trong danh sách aggregation).
func BySetup(rows []metrics.Enriched) []Pivot {
	return topN(groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Setup }), 6)
}

// BySymbol trả 6 mã nhiều lệnh nhất.
func BySymbol(rows []metrics.Enriched) []Pivot {
	return topN(groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Symbol }), 6)
}

// ByTimeframe trả các timeframe có xuất hiện, giữ thứ tự M1 → W.
func ByTimeframe(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Timeframe })
	pivots := make([]Pivot, 0, len(groups))
	for _, tf := range domain.Timeframes {
		if a, ok := groups[tf]; ok {
			pivots = append(pivots, a.toPivot(tf))
		}
	}
	return pivots
}

// ByDirection luôn trả đúng hai nhóm Long và Short, kể cả khi một bên chưa có lệnh,
// để biểu đồ so sánh không bị mất cột.
func ByDirection(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Trade.Direction })
	return []Pivot{
		groups[domain.DirectionLong].toPivot(domain.DirectionLong),
		groups[domain.DirectionShort].toPivot(domain.DirectionShort),
	}
}

// ByWeekday luôn trả đủ 7 ngày theo thứ tự Mon..Sun.
func ByWeekday(rows []metrics.Enriched) []WeekdayStat {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Weekday })
	stats := make([]WeekdayStat, 0, 7)
	for _, wd := range domain.Weekdays {
		a := groups[wd]
		stats = append(stats, WeekdayStat{
			Pivot:          a.toPivot(wd),
			ProfitPositive: a.positive,
			ProfitNegative: a.negative,
		})
	}
	return stats
}

// ByWeek gom theo nhãn tuần ISO, sắp theo nhãn.
func ByWeek(rows []metrics.Enriched) []Pivot {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Week })
	pivots := make([]Pivot, 0, len(groups))
	for k, a := range groups {
		pivots = append(pivots, a.toPivot(k))
	}
	sort.Slice(pivots, func(i, j int) bool { return pivots[i].Key < pivots[j].Key })
	return pivots
}

// ByDay gom theo ngày, kèm giá trị lũy kế cuối ngày để vẽ đường tăng trưởng.
func ByDay(rows []metrics.Enriched) []DayStat {
	groups := groupBy(rows, func(r metrics.Enriched) string { return r.Day })

	// CumByDay đã tính sẵn trong Enrich và giống nhau cho mọi lệnh cùng ngày.
	cum := map[string]decimal.Decimal{}
	for _, r := range rows {
		cum[r.Day] = r.CumByDay
	}

	days := make([]DayStat, 0, len(groups))
	for k, a := range groups {
		days = append(days, DayStat{Day: k, Count: a.count, SumNet: a.sumNet, CumByDay: cum[k]})
	}
	sort.Slice(days, func(i, j int) bool { return days[i].Day < days[j].Day })
	return days
}
```

- [ ] **Step 4: Chạy test**

Run: `cd backend && go test ./internal/aggregate/ -v`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/aggregate/
git commit -m "feat: add group-by pivots for setup, symbol, timeframe, direction, weekday, week and day"
```

---

## Task 13: aggregate.All — heatmap, điểm, radar, lý thuyết vs thực tế

**Files:**
- Create: `backend/internal/aggregate/charts.go`
- Test: `backend/internal/aggregate/charts_test.go`, `backend/internal/aggregate/purity_test.go`

**Interfaces:**
- Consumes: mọi thứ ở Task 11–12
- Produces:
  - `aggregate.HeatmapCell{Day string; SumNet decimal.Decimal; Count int}`, `aggregate.HeatmapMonth{Month string; Cells []HeatmapCell}`
  - `aggregate.ScoreSummary{ScoredCount int; AvgScoreTotal *decimal.Decimal}`
  - `aggregate.Radar{AvgEntry, AvgInTrade, AvgExit, AvgPsych *decimal.Decimal}`
  - `aggregate.TheoryPoint{STT int; CumTheory, CumByTrade decimal.Decimal}`
  - `aggregate.Charts` — gộp cả 12 nhóm
  - `aggregate.All(rows []metrics.Enriched, account domain.Account) Charts`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/internal/aggregate/charts_test.go`:

```go
package aggregate

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestHeatmapGomTheoThangVaNgay(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "100"),
		vnTrade(t, 2, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "-40"),
		vnTrade(t, 3, "2026-07-01", "xau", "FVG", "M15", domain.DirectionLong, "60"),
	})

	months := Heatmap(rows)

	require.Len(t, months, 2)
	require.Equal(t, "06/2026", months[0].Month)
	require.Len(t, months[0].Cells, 1)
	require.Equal(t, "2026-06-09", months[0].Cells[0].Day)
	require.True(t, months[0].Cells[0].SumNet.Equal(dec("60")))
	require.Equal(t, 2, months[0].Cells[0].Count)
	require.Equal(t, "07/2026", months[1].Month)
}

func TestScoreSummaryChiTinhTrenLenhDaCham(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		{STT: 1, EnteredAt: vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryPlanned, InTradeQuality: domain.InTradeFollowed,
			ExitQuality: domain.ExitHitTP, Psychology: domain.PsychNoError}, // 100
		{STT: 2, EnteredAt: vnTrade(t, 2, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryTooEarly, InTradeQuality: domain.InTradeMovedTP,
			ExitQuality: domain.ExitTechnical, Psychology: domain.PsychFear}, // 10+10+15+5 = 40
		{STT: 3, EnteredAt: vnTrade(t, 3, "2026-06-11", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0")}, // chưa chấm
	})

	s := ScoreAvg(rows)

	require.Equal(t, 2, s.ScoredCount)
	require.NotNil(t, s.AvgScoreTotal)
	require.Equal(t, "70", s.AvgScoreTotal.Round(4).String(), "(100+40)/2, lệnh chưa chấm bị loại")
}

func TestScoreSummaryKhongCoLenhNaoDaCham(t *testing.T) {
	rows := enrichProfits(t, "100", "-50")

	s := ScoreAvg(rows)

	require.Equal(t, 0, s.ScoredCount)
	require.Nil(t, s.AvgScoreTotal)
}

func TestRadarLoaiLenhChuaCham(t *testing.T) {
	rows := enrichCustom(t, []domain.Trade{
		{STT: 1, EnteredAt: vnTrade(t, 1, "2026-06-09", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0"),
			EntryQuality: domain.EntryPlanned, InTradeQuality: domain.InTradeFollowed,
			ExitQuality: domain.ExitHitTP, Psychology: domain.PsychNoError},
		{STT: 2, EnteredAt: vnTrade(t, 2, "2026-06-10", "xau", "FVG", "M15", domain.DirectionLong, "10").EnteredAt,
			Profit: dec("10"), Fee: dec("0")}, // chưa chấm, phải bị loại
	})

	r := RadarAvg(rows)

	require.NotNil(t, r.AvgEntry)
	require.Equal(t, "25", r.AvgEntry.Round(4).String())
	require.Equal(t, "25", r.AvgPsych.Round(4).String())
}

func TestTheoryVsActual(t *testing.T) {
	rows := enrichCustom(t, goldenTradesForCharts(t))

	points := TheoryVsActual(rows)

	require.Len(t, points, 4)
	require.Equal(t, 1, points[0].STT)
	require.True(t, points[0].CumTheory.Equal(dec("50")))
	require.True(t, points[0].CumByTrade.Equal(dec("100")))
	require.True(t, points[3].CumTheory.Equal(dec("100")))
	require.True(t, points[3].CumByTrade.Equal(dec("350")))
}

func TestAllTraDuMuoiHaiNhom(t *testing.T) {
	rows := enrichCustom(t, goldenTradesForCharts(t))

	charts := All(rows, testAccount())

	require.NotEmpty(t, charts.BySetup)
	require.NotEmpty(t, charts.BySymbol)
	require.NotEmpty(t, charts.ByTimeframe)
	require.Len(t, charts.ByDirection, 2)
	require.Len(t, charts.ByWeekday, 7)
	require.NotEmpty(t, charts.ByWeek)
	require.NotEmpty(t, charts.ByDay)
	require.NotEmpty(t, charts.Heatmap)
	require.Len(t, charts.RDistribution, 22)
	require.Equal(t, 0, charts.Score.ScoredCount, "fixture §7 chưa chấm điểm lệnh nào")
	require.Nil(t, charts.Radar.AvgEntry, "không có lệnh đã chấm thì radar để trống")
	require.Len(t, charts.TheoryVsActual, 4)
	require.Equal(t, 2, charts.LongestWinStreak)
	require.Equal(t, 1, charts.LongestLossStreak)
}

func TestAllVoiDanhSachRongKhongPanic(t *testing.T) {
	charts := All(nil, testAccount())

	require.Len(t, charts.ByDirection, 2)
	require.Len(t, charts.ByWeekday, 7)
	require.Len(t, charts.RDistribution, 22)
	require.Equal(t, 0, charts.LongestWinStreak)
	require.Nil(t, charts.Score.AvgScoreTotal)
}

// goldenTradesForCharts là fixture §7 với setup/symbol/timeframe điền sẵn.
func goldenTradesForCharts(t *testing.T) []domain.Trade {
	t.Helper()
	theory := []string{"50", "100", "-50", ""}
	profits := []string{"100", "-50", "100", "200"}
	days := []string{"2026-06-09", "2026-06-09", "2026-06-10", "2026-06-11"}

	trades := make([]domain.Trade, 0, 4)
	for i := range profits {
		tr := vnTrade(t, i+1, days[i], "xau", "FVG", "M15", domain.DirectionLong, profits[i])
		if theory[i] != "" {
			v := dec(theory[i])
			tr.ProfitTheory = &v
		}
		trades = append(trades, tr)
	}
	return trades
}
```

Tạo `backend/internal/aggregate/purity_test.go`:

```go
package aggregate_test

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Ba package lõi phải thuần. Test này canh ranh giới đó — nếu ai đó lỡ import
// GORM hay net/http vào chúng, test đỏ ngay thay vì phát hiện sau nhiều tháng.
//
// Chỉ soi import TRỰC TIẾP, không soi `go list -deps`: shopspring/decimal có
// import database/sql/driver để cài Scanner/Valuer, và đó là chuyện bình thường
// của một thư viện số — không phải dấu hiệu package của ta chạm DB.
func TestPurePackagesKhongImportHaTang(t *testing.T) {
	forbidden := []string{"gorm.io", "net/http", "database/sql", "context"}
	pkgs := []string{
		"journal/internal/scoring",
		"journal/internal/metrics",
		"journal/internal/aggregate",
	}

	for _, p := range pkgs {
		out, err := exec.Command("go", "list", "-f", `{{join .Imports "\n"}}`, p).Output()
		require.NoError(t, err, "go list %s", p)

		for _, imp := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			for _, bad := range forbidden {
				require.False(t, imp == bad || strings.HasPrefix(imp, bad+"/"),
					"%s import %s — ba package lõi phải thuần", p, imp)
			}
		}
	}
}
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/aggregate/ -run TestHeatmap -v`
Expected: FAIL — `undefined: Heatmap`

- [ ] **Step 3: Cài đặt charts.go**

```go
package aggregate

import (
	"sort"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// HeatmapCell là một ô ngày trong lịch nhiệt.
type HeatmapCell struct {
	Day    string          `json:"day"`
	SumNet decimal.Decimal `json:"sum_net"`
	Count  int             `json:"count"`
}

// HeatmapMonth gom các ô theo tháng. Backend chỉ trả dữ liệu theo ngày;
// việc dựng lưới 7 cột là chuyện của frontend.
type HeatmapMonth struct {
	Month string        `json:"month"` // "06/2026"
	Cells []HeatmapCell `json:"cells"` // sắp theo ngày tăng dần
}

// ScoreSummary là điểm trung bình, chỉ tính trên lệnh ĐÃ CHẤM. Mục tiêu >= 80.
type ScoreSummary struct {
	ScoredCount   int              `json:"scored_count"`
	AvgScoreTotal *decimal.Decimal `json:"avg_score_total"`
}

// Radar là bốn trục điểm trung bình; trục nào thấp là điểm yếu.
type Radar struct {
	AvgEntry   *decimal.Decimal `json:"avg_entry"`
	AvgInTrade *decimal.Decimal `json:"avg_in_trade"`
	AvgExit    *decimal.Decimal `json:"avg_exit"`
	AvgPsych   *decimal.Decimal `json:"avg_psych"`
}

// TheoryPoint so sánh đường lãi lý thuyết với đường lãi thực tế theo STT.
type TheoryPoint struct {
	STT        int             `json:"stt"`
	CumTheory  decimal.Decimal `json:"cum_theory"`
	CumByTrade decimal.Decimal `json:"cum_by_trade"`
}

// Charts gộp cả 12 nhóm biểu đồ của §5 vào một response, vì tất cả đều xuất
// phát từ cùng một lần load danh sách lệnh.
type Charts struct {
	BySetup     []Pivot       `json:"by_setup"`
	BySymbol    []Pivot       `json:"by_symbol"`
	ByTimeframe []Pivot       `json:"by_timeframe"`
	ByDirection []Pivot       `json:"by_direction"`
	ByWeekday   []WeekdayStat `json:"by_weekday"`
	ByWeek      []Pivot       `json:"by_week"`
	ByDay       []DayStat     `json:"by_day"`

	Heatmap       []HeatmapMonth `json:"heatmap"`
	RDistribution []RBucket      `json:"r_distribution"`
	Score         ScoreSummary   `json:"score"`
	Radar         Radar          `json:"radar"`
	TheoryVsActual []TheoryPoint `json:"theory_vs_actual"`

	LongestWinStreak  int `json:"longest_win_streak"`
	LongestLossStreak int `json:"longest_loss_streak"`
}

// Heatmap gom lệnh thành lưới lịch theo tháng rồi theo ngày.
func Heatmap(rows []metrics.Enriched) []HeatmapMonth {
	type key struct{ month, day string }
	cells := map[key]HeatmapCell{}

	for _, r := range rows {
		k := key{month: r.Month, day: r.Day}
		c := cells[k]
		c.Day = r.Day
		c.SumNet = c.SumNet.Add(r.Net)
		c.Count++
		cells[k] = c
	}

	byMonth := map[string][]HeatmapCell{}
	for k, c := range cells {
		byMonth[k.month] = append(byMonth[k.month], c)
	}

	months := make([]HeatmapMonth, 0, len(byMonth))
	for m, cs := range byMonth {
		sort.Slice(cs, func(i, j int) bool { return cs[i].Day < cs[j].Day })
		months = append(months, HeatmapMonth{Month: m, Cells: cs})
	}
	// Nhãn tháng là MM/yyyy nên sort chuỗi sẽ sai thứ tự năm; sort theo ngày
	// đầu tiên của tháng, vốn đã ở dạng YYYY-MM-DD.
	sort.Slice(months, func(i, j int) bool {
		return months[i].Cells[0].Day < months[j].Cells[0].Day
	})
	return months
}

// ScoreAvg tính điểm trung bình trên các lệnh đã chấm (§5.10).
func ScoreAvg(rows []metrics.Enriched) ScoreSummary {
	sum := 0
	count := 0
	for _, r := range rows {
		if r.ScoreTotal == nil {
			continue
		}
		sum += *r.ScoreTotal
		count++
	}
	if count == 0 {
		return ScoreSummary{}
	}
	avg := decimal.NewFromInt(int64(sum)).Div(decimal.NewFromInt(int64(count)))
	return ScoreSummary{ScoredCount: count, AvgScoreTotal: &avg}
}

// RadarAvg tính trung bình bốn trục, chỉ trên lệnh đã chấm (§5.11).
func RadarAvg(rows []metrics.Enriched) Radar {
	var entry, inTrade, exit, psych int
	count := 0
	for _, r := range rows {
		if r.ScoreTotal == nil {
			continue
		}
		entry += r.ScoreEntry
		inTrade += r.ScoreInTrade
		exit += r.ScoreExit
		psych += r.ScorePsych
		count++
	}
	if count == 0 {
		return Radar{}
	}
	n := decimal.NewFromInt(int64(count))
	avg := func(total int) *decimal.Decimal {
		v := decimal.NewFromInt(int64(total)).Div(n)
		return &v
	}
	return Radar{
		AvgEntry:   avg(entry),
		AvgInTrade: avg(inTrade),
		AvgExit:    avg(exit),
		AvgPsych:   avg(psych),
	}
}

// TheoryVsActual trả hai chuỗi theo STT để vẽ chồng lên nhau (§5.12).
func TheoryVsActual(rows []metrics.Enriched) []TheoryPoint {
	points := make([]TheoryPoint, 0, len(rows))
	for _, r := range rows {
		points = append(points, TheoryPoint{
			STT:        r.Trade.STT,
			CumTheory:  r.CumTheory,
			CumByTrade: r.CumByTrade,
		})
	}
	return points
}

// All dựng toàn bộ dữ liệu biểu đồ trong một lượt.
func All(rows []metrics.Enriched, account domain.Account) Charts {
	win, loss := Streaks(rows)
	return Charts{
		BySetup:        BySetup(rows),
		BySymbol:       BySymbol(rows),
		ByTimeframe:    ByTimeframe(rows),
		ByDirection:    ByDirection(rows),
		ByWeekday:      ByWeekday(rows),
		ByWeek:         ByWeek(rows),
		ByDay:          ByDay(rows),
		Heatmap:        Heatmap(rows),
		RDistribution:  RDistribution(rows, account.OneR()),
		Score:          ScoreAvg(rows),
		Radar:          RadarAvg(rows),
		TheoryVsActual: TheoryVsActual(rows),

		LongestWinStreak:  win,
		LongestLossStreak: loss,
	}
}
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `cd backend && go test ./... -count=1 -v`
Expected: PASS toàn bộ, gồm cả `TestPurePackagesKhongImportHaTang`.

- [ ] **Step 5: Kiểm chứng ràng buộc tốc độ**

Run: `cd backend && time go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... -count=1`
Expected: PASS, tổng thời gian dưới 1 giây, không cần Docker chạy.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/aggregate/
git commit -m "feat: add heatmap, score, radar, theory-vs-actual and Charts aggregate"
```

---

## Kiểm chứng cuối plan

- [ ] `make test` xanh
- [ ] `make test-pure` xanh và chạy dưới 1 giây
- [ ] `docker compose up -d --build` cho ra `curl localhost:8000/healthz` trả envelope đúng
- [ ] `docker compose exec db psql -U journal -d journal -c '\dt'` liệt kê đủ 4 bảng nghiệp vụ
- [ ] `cd backend && go test ./internal/scoring/ -cover` báo 100%
- [ ] Golden fixture §7 xanh cả phần per-trade (Task 9) lẫn phần KPI (Task 10)
- [ ] `git log --oneline` cho thấy commit theo từng task, không có commit gộp cả plan

Xong plan này, backend đã có toàn bộ công thức nghiệp vụ với test bảo vệ, nhưng chưa có
đường nào từ HTTP xuống DB. Plan tiếp theo (auth + accounts) sẽ dựng tầng repository và
handler đầu tiên, gọi vào đúng các hàm ở đây.

## Cố ý để lại cho plan sau

Những mục này có trong spec nhưng chưa thuộc phạm vi plan này — ghi ra để không ai tưởng là sót:

- `docker-compose.dev.yml` (air hot-reload, Vite dev server, mount source) — cần khi đã có
  frontend, thuộc Plan 2.
- Tầng GORM, `ServiceContext`, repository — Plan 2.
- CORS whitelist, JWT, `JWT_SECRET`/`ACCESS_TTL`/`REFRESH_TTL` — Plan 2 (đã có sẵn trong `.env.example`).
- Cấp `stt` trong transaction, soft delete, restore — Plan 3.
- Quy tắc filter §7.1 của spec (lũy kế trên toàn bộ, KPI trên tập đã lọc) — thực thi ở tầng
  service của Plan 3/4; ở plan này chỉ có các hàm thuần để tầng đó gọi.
- Toàn bộ frontend.
