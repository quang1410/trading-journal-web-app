# Phase 2a — Auth, Accounts, Cash Flows (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend half of Phase 2 — user registration/login with rotating refresh tokens, account CRUD, and cash flows — so that `curl` can walk the whole loop against a running `docker compose up`.

**Architecture:** Adds the three layers Phase 0+1 left unbuilt: `repository` (the only package that touches GORM), `service` (validation, transactions, business rules), and handlers plus middleware in the existing `httpapi`. A new `auth` package holds argon2id and JWT and touches no I/O. Errors travel as `*apperr.Error` carrying HTTP status, business code and a Vietnamese message, so `service` never imports `net/http` and `httpapi` never re-implements business rules. Every DB-backed test runs against a real Postgres 16 started by testcontainers with the real `migrations/` applied.

**Tech Stack:** Go 1.23, chi v5, GORM + `gorm.io/driver/postgres`, `golang.org/x/crypto/argon2`, `github.com/golang-jwt/jwt/v5`, `github.com/testcontainers/testcontainers-go`, `shopspring/decimal`, testify.

**Spec:** `docs/superpowers/specs/2026-08-18-phase-2a-auth-accounts-design.md` (and its parent, `docs/superpowers/specs/2026-08-16-trading-journal-design.md`)

## Global Constraints

Every task's requirements implicitly include this section.

- **Money is `decimal.Decimal`, never `float64`.** DB columns are `NUMERIC`. Money serialises to JSON as a **string**.
- **`internal/scoring`, `internal/metrics`, `internal/aggregate` must not be modified by any task in this plan.** They may not import GORM, `net/http`, `database/sql`, or `context`. `make test-pure` must stay green, under 1 second, and must not need Docker. `internal/aggregate/purity_test.go` enforces this — if it fails, a boundary was broken.
- **`internal/domain` gains struct tags and `TableName()` methods only.** It must not import GORM, `net/http`, or `context`. Struct tags require no imports; `gorm.DeletedAt` does, so it is not used — soft delete is done with an explicit `.Where("deleted_at IS NULL")` in Phase 3.
- **`internal/auth` must not import GORM, `context`, or `net/http`.** Its tests must pass without Docker.
- Vietnamese enum strings are scoring keys — copy them **byte for byte** from `trading-journal-plan.md` §1. Never retype them from memory.
- Timestamps are stored UTC. Never hardcode `+7`. `cmd/api/main.go` must keep its `_ "time/tzdata"` import.
- All responses, including errors, 404 and 405, use the envelope `{"code":…,"msg":…,"data":…}` via `httpapi.OK` / `httpapi.Fail` / `httpapi.FailErr`.
- Business error codes: `1400` validate · `1401` unauthenticated · `1403` forbidden · `1404` not found · `1405` method · `1409` conflict · `1500` internal.
- Commit after every task. Run the stated verification command and paste its real output — never claim green without running it.

## File Structure

| File | Responsibility |
|---|---|
| `backend/internal/apperr/apperr.go` | `Error{Status,Code,Msg}` + constructors. The shared error vocabulary between `service` and `httpapi`. |
| `backend/internal/config/config.go` (modify) | Adds `JWTSecret`, `AccessTTL`, `RefreshTTL`, `CORSOrigins`, `Env`. `Load` now returns an error. |
| `backend/internal/testdb/testdb.go` | Starts one Postgres container per test process, applies `migrations/`, truncates between cases. Imported only by tests. |
| `backend/internal/repository/store.go` | `Open(dsn)`, `ErrNotFound`, `ErrDuplicate`. |
| `backend/internal/repository/{user,account,cashflow,refreshtoken}.go` | One row struct + one repo per table. |
| `backend/internal/auth/password.go` | argon2id hash/verify + `VerifyDummy` for timing balance. |
| `backend/internal/auth/token.go` | JWT HS256 sign/parse, refresh token generation + SHA-256 hashing. |
| `backend/internal/service/auth.go` | Register / Login / Refresh (rotation + reuse detection) / Logout. |
| `backend/internal/service/account.go` | Account + cash flow validation, ownership resolution. |
| `backend/internal/httpapi/dto.go` | Request/response shapes. Domain structs are never marshalled directly. |
| `backend/internal/httpapi/middleware.go` | `RequireAuth`, `RequireAccount`, CORS. |
| `backend/internal/httpapi/{auth,account,cashflow,meta}_handler.go` | One handler file per resource. |
| `backend/internal/domain/enums.go` (modify) | Full allowlists + `Valid` helper. |
| `backend/migrations/0002_refresh_tokens.{up,down}.sql` | The `refresh_tokens` table. |

---

### Task 1: Error vocabulary and config

**Files:**
- Create: `backend/internal/apperr/apperr.go`, `backend/internal/apperr/apperr_test.go`
- Modify: `backend/internal/config/config.go`, `backend/cmd/api/main.go`
- Create: `backend/internal/config/config_test.go`
- Modify: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `apperr.Error{Status,Code int; Msg string}`; `apperr.Validation/Unauthorized/Forbidden/NotFound/Conflict(msg string) *apperr.Error`; `apperr.As(err error) *apperr.Error`. `config.Load() (Config, error)` with fields `Port, DatabaseURL, JWTSecret string; AccessTTL, RefreshTTL time.Duration; CORSOrigins []string; Env string`.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/apperr/apperr_test.go`:

```go
package apperr_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
)

func TestConstructorsCarryStatusVaCode(t *testing.T) {
	cases := []struct {
		name       string
		err        *apperr.Error
		wantStatus int
		wantCode   int
	}{
		{"validate", apperr.Validation("sai"), 400, 1400},
		{"chưa auth", apperr.Unauthorized("chưa đăng nhập"), 401, 1401},
		{"cấm", apperr.Forbidden("không phải của bạn"), 403, 1403},
		{"không thấy", apperr.NotFound("không có"), 404, 1404},
		{"trùng", apperr.Conflict("đã tồn tại"), 409, 1409},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.wantStatus, c.err.Status)
			require.Equal(t, c.wantCode, c.err.Code)
			require.NotEmpty(t, c.err.Msg)
		})
	}
}

// As phải xuyên qua được lớp bọc %w — service hay bọc lỗi khi đi qua nhiều tầng.
func TestAsXuyenQuaLopBoc(t *testing.T) {
	wrapped := fmt.Errorf("tầng ngoài: %w", apperr.NotFound("không có account"))

	got := apperr.As(wrapped)

	require.NotNil(t, got)
	require.Equal(t, 404, got.Status)
	require.Equal(t, "không có account", got.Msg)
}

func TestAsTraNilVoiLoiThuong(t *testing.T) {
	require.Nil(t, apperr.As(fmt.Errorf("lỗi thường")))
	require.Nil(t, apperr.As(nil))
}
```

Create `backend/internal/config/config_test.go`:

```go
package config_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/config"
)

// JWT_SECRET không có mặc định: một fallback tiện cho dev chính là đường một
// khoá ký đã biết đi thẳng vào production.
func TestLoadTuChoiKhiThieuJWTSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "JWT_SECRET")
}

func TestLoadDungMacDinhKhiThieuTTL(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")

	c, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 15*time.Minute, c.AccessTTL)
	require.Equal(t, 720*time.Hour, c.RefreshTTL)
	require.Equal(t, "8000", c.Port)
	require.Equal(t, "dev", c.Env)
	require.Empty(t, c.CORSOrigins)
}

func TestLoadDocTTLVaCORSTuEnv(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")
	t.Setenv("ACCESS_TTL", "5m")
	t.Setenv("REFRESH_TTL", "48h")
	t.Setenv("CORS_ORIGINS", "https://a.example, https://b.example")

	c, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 5*time.Minute, c.AccessTTL)
	require.Equal(t, 48*time.Hour, c.RefreshTTL)
	require.Equal(t, []string{"https://a.example", "https://b.example"}, c.CORSOrigins)
}

func TestLoadTuChoiTTLSaiDinhDang(t *testing.T) {
	t.Setenv("JWT_SECRET", "khoa-test")
	t.Setenv("ACCESS_TTL", "mười lăm phút")

	_, err := config.Load()

	require.Error(t, err)
	require.Contains(t, err.Error(), "ACCESS_TTL")
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/apperr/... ./internal/config/... -count=1`
Expected: FAIL — `no required module provides package journal/internal/apperr`, and `config.Load()` returning one value instead of two.

- [ ] **Step 3: Write `apperr`**

Create `backend/internal/apperr/apperr.go`:

```go
// Package apperr là từ vựng lỗi chung giữa service và httpapi.
// service tạo lỗi kèm status + mã nghiệp vụ, httpapi chỉ việc dịch sang
// envelope — nhờ vậy service không phải import net/http, và httpapi không
// phải biết luật nghiệp vụ.
package apperr

import (
	"errors"
	"fmt"
)

// Error là lỗi nghiệp vụ hiển thị được cho người dùng cuối.
type Error struct {
	Status int    // HTTP status
	Code   int    // mã nghiệp vụ, luôn khác 0
	Msg    string // thông điệp tiếng Việt, hiển thị thẳng cho user
}

func (e *Error) Error() string {
	return fmt.Sprintf("%d/%d: %s", e.Status, e.Code, e.Msg)
}

func Validation(msg string) *Error   { return &Error{Status: 400, Code: 1400, Msg: msg} }
func Unauthorized(msg string) *Error { return &Error{Status: 401, Code: 1401, Msg: msg} }
func Forbidden(msg string) *Error    { return &Error{Status: 403, Code: 1403, Msg: msg} }
func NotFound(msg string) *Error     { return &Error{Status: 404, Code: 1404, Msg: msg} }
func Conflict(msg string) *Error     { return &Error{Status: 409, Code: 1409, Msg: msg} }

// As trả về *Error nếu err là hoặc bọc một *Error, ngược lại nil.
func As(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return nil
}
```

- [ ] **Step 4: Rewrite `config`**

Replace `backend/internal/config/config.go` with:

```go
// Package config đọc cấu hình từ biến môi trường.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	CORSOrigins []string
	Env         string // "dev" | "prod"; quyết định cookie có Secure hay không
}

// Load đọc toàn bộ cấu hình. Trả lỗi thay vì giá trị mặc định ở những chỗ
// mà một mặc định sai sẽ đi thẳng vào production mà không ai nhận ra.
func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal@localhost:5432/journal?sslmode=disable"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Env:         env("ENV", "dev"),
	}
	if c.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET rỗng: API từ chối khởi động, không có khoá ký mặc định")
	}

	var err error
	if c.AccessTTL, err = dur("ACCESS_TTL", 15*time.Minute); err != nil {
		return Config{}, err
	}
	if c.RefreshTTL, err = dur("REFRESH_TTL", 720*time.Hour); err != nil {
		return Config{}, err
	}

	if raw := os.Getenv("CORS_ORIGINS"); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				c.CORSOrigins = append(c.CORSOrigins, trimmed)
			}
		}
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func dur(key string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s không phải khoảng thời gian hợp lệ (%q): %w", key, raw, err)
	}
	return d, nil
}
```

- [ ] **Step 5: Update `main.go` for the new `Load` signature**

In `backend/cmd/api/main.go`, replace the `cfg := config.Load()` line with:

```go
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("cấu hình không hợp lệ: %v", err)
	}
```

Keep the `_ "time/tzdata"` import exactly as it is. If `log` is not already imported, add it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && go build ./... && go test ./internal/apperr/... ./internal/config/... -count=1`
Expected: PASS for both packages, and the build succeeds.

- [ ] **Step 7: Give compose a secret to pass through**

In `docker-compose.yml`, under the `api` service's `environment:` block, add:

```yaml
      JWT_SECRET: ${JWT_SECRET:?dat JWT_SECRET trong file .env}
      ACCESS_TTL: ${ACCESS_TTL:-15m}
      REFRESH_TTL: ${REFRESH_TTL:-720h}
      ENV: ${ENV:-dev}
```

The `:?` form makes `docker compose up` fail loudly with that message when the variable is missing, instead of booting with a placeholder key. Create `.env.example`:

```
# Sao chép thành .env rồi đổi giá trị. File .env KHÔNG commit.
# Sinh khoá: openssl rand -base64 48
JWT_SECRET=doi-gia-tri-nay-truoc-khi-deploy
ACCESS_TTL=15m
REFRESH_TTL=720h
ENV=dev
```

Append `.env` to `.gitignore` if it is not already there.

- [ ] **Step 8: Verify compose still parses**

Run: `docker compose --env-file .env.example config --quiet && echo "compose OK"`
Expected: `compose OK` with no error.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/apperr backend/internal/config backend/cmd/api/main.go docker-compose.yml .env.example .gitignore
git commit -m "feat(config): add apperr vocabulary and required JWT_SECRET config"
```

---

### Task 2: Real-Postgres test harness, DB connection, and the NULL round-trip debt

This task closes the first of three deferred debts from Phase 1: `Trade.Entry/Exit/Volume` were changed to `*decimal.Decimal` with only compile-time evidence.

**Files:**
- Create: `backend/internal/testdb/testdb.go`
- Create: `backend/internal/repository/store.go`
- Create: `backend/internal/repository/trade_mapping_test.go`
- Modify: `backend/internal/domain/models.go` (struct tags + `TableName()` only)
- Modify: `Makefile`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `repository.Open(dsn string) (*gorm.DB, error)`; `repository.ErrNotFound`, `repository.ErrDuplicate`; `testdb.New(t *testing.T) *gorm.DB` (container started once per test process, migrations applied, tables truncated before return); `testdb.Truncate(t *testing.T, db *gorm.DB)`. `domain.Account/Trade/CashFlow` gain `TableName()` and explicit column tags.

- [ ] **Step 1: Add the dependencies**

Run:

```bash
cd backend
go get gorm.io/gorm@v1.25.12
go get gorm.io/driver/postgres@v1.5.11
go get github.com/testcontainers/testcontainers-go@v0.34.0
go get github.com/testcontainers/testcontainers-go/modules/postgres@v0.34.0
go mod tidy
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/repository/trade_mapping_test.go`:

```go
package repository_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/testdb"
)

// Migration 0001 để entry/exit/volume/profit_theory NULLable. Trước bản sửa
// con trỏ, decimal.Decimal.Scan(nil) lỗi "could not convert value '<nil>' to
// byte array". Test này là bằng chứng chạy thật, không chỉ bằng chứng biên dịch.
func TestTradeNullDecimalRoundTrip(t *testing.T) {
	db := testdb.New(t)

	var userID int64
	require.NoError(t, db.Raw(
		`INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x') RETURNING id`,
	).Scan(&userID).Error)

	var accountID int64
	require.NoError(t, db.Raw(
		`INSERT INTO accounts (user_id, code, initial_balance) VALUES (?, 'ACC1', 10000) RETURNING id`,
		userID,
	).Scan(&accountID).Error)

	tr := domain.Trade{
		AccountID: accountID,
		STT:       1,
		EnteredAt: time.Date(2026, 6, 9, 8, 30, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.NewFromInt(100),
		Fee:       decimal.Zero,
		Setup:     domain.DefaultSetup,
	}
	require.NoError(t, db.Create(&tr).Error)
	require.NotZero(t, tr.ID, "GORM phải nhận lại id do BIGSERIAL cấp")

	var got domain.Trade
	require.NoError(t, db.First(&got, tr.ID).Error)

	require.Nil(t, got.Entry, "entry NULL phải đọc ra nil, không phải lỗi Scan")
	require.Nil(t, got.Exit)
	require.Nil(t, got.Volume)
	require.Nil(t, got.ProfitTheory)
	require.Equal(t, 1, got.STT, "cột stt phải map đúng, không bị GORM đổi thành s_t_t")
	require.True(t, got.Profit.Equal(decimal.NewFromInt(100)))
}

// NUMERIC(18,5) phải giữ nguyên 5 chữ số thập phân qua một vòng ghi/đọc.
func TestTradeDecimalGiuNguyenDoChinhXac(t *testing.T) {
	db := testdb.New(t)

	var userID int64
	require.NoError(t, db.Raw(
		`INSERT INTO users (email, password_hash) VALUES ('b@example.com', 'x') RETURNING id`,
	).Scan(&userID).Error)
	var accountID int64
	require.NoError(t, db.Raw(
		`INSERT INTO accounts (user_id, code, initial_balance) VALUES (?, 'ACC1', 10000) RETURNING id`,
		userID,
	).Scan(&accountID).Error)

	entry := decimal.RequireFromString("2345.67891")
	tr := domain.Trade{
		AccountID: accountID,
		STT:       1,
		EnteredAt: time.Date(2026, 6, 9, 8, 30, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Entry:     &entry,
		Profit:    decimal.RequireFromString("-123.45"),
		Fee:       decimal.RequireFromString("2.50"),
		Setup:     domain.DefaultSetup,
	}
	require.NoError(t, db.Create(&tr).Error)

	var got domain.Trade
	require.NoError(t, db.First(&got, tr.ID).Error)

	require.NotNil(t, got.Entry)
	require.True(t, got.Entry.Equal(entry), "đọc ra %s, mong đợi %s", got.Entry, entry)
	require.True(t, got.Profit.Equal(decimal.RequireFromString("-123.45")))
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && go test ./internal/repository/... -count=1`
Expected: FAIL — `no required module provides package journal/internal/testdb`.

- [ ] **Step 4: Tag the domain models for GORM**

In `backend/internal/domain/models.go`, add explicit column tags and `TableName()` methods. Tags are metadata only — `domain` gains **no new imports**, so the purity guarantee is untouched. Explicit tags are required because GORM's default naming turns `STT` into `s_t_t`.

```go
func (Account) TableName() string  { return "accounts" }
func (Trade) TableName() string    { return "trades" }
func (CashFlow) TableName() string { return "cash_flows" }
```

Add these tags to the existing fields (do not reorder or rename fields):

```go
// Account
ID             int64           `gorm:"column:id;primaryKey"`
UserID         int64           `gorm:"column:user_id"`
Code           string          `gorm:"column:code"`
Name           string          `gorm:"column:name"`
InitialBalance decimal.Decimal `gorm:"column:initial_balance"`
RiskPerTrade   decimal.Decimal `gorm:"column:risk_per_trade"`
Currency       string          `gorm:"column:currency"`
Timezone       string          `gorm:"column:timezone"`

// Trade
ID        int64     `gorm:"column:id;primaryKey"`
AccountID int64     `gorm:"column:account_id"`
STT       int       `gorm:"column:stt"`
EnteredAt time.Time `gorm:"column:entered_at"`

Symbol    string `gorm:"column:symbol"`
Direction string `gorm:"column:direction"`

Entry  *decimal.Decimal `gorm:"column:entry"`
Exit   *decimal.Decimal `gorm:"column:exit"`
Volume *decimal.Decimal `gorm:"column:volume"`

Profit       decimal.Decimal  `gorm:"column:profit"`
ProfitTheory *decimal.Decimal `gorm:"column:profit_theory"`
Fee          decimal.Decimal  `gorm:"column:fee"`

Setup          string `gorm:"column:setup"`
Timeframe      string `gorm:"column:timeframe"`
EntryQuality   string `gorm:"column:entry_quality"`
InTradeQuality string `gorm:"column:in_trade_quality"`
ExitQuality    string `gorm:"column:exit_quality"`
Psychology     string `gorm:"column:psychology"`
Notes          string `gorm:"column:notes"`

// CashFlow
ID        int64           `gorm:"column:id;primaryKey"`
AccountID int64           `gorm:"column:account_id"`
Date      time.Time       `gorm:"column:date"`
Amount    decimal.Decimal `gorm:"column:amount"`
Type      string          `gorm:"column:type"`
```

- [ ] **Step 5: Write `repository.Open`**

Create `backend/internal/repository/store.go`:

```go
// Package repository là tầng DUY NHẤT được phép chạm GORM. Mọi tầng trên nó
// nhận và trả kiểu của domain hoặc kiểu row khai báo tại đây.
package repository

import (
	"errors"
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Lỗi quy ước của tầng repository. Tầng service dịch chúng sang apperr —
// repository không biết gì về HTTP status.
var (
	ErrNotFound  = errors.New("không tìm thấy bản ghi")
	ErrDuplicate = errors.New("bản ghi đã tồn tại")
)

// Open mở kết nối tới Postgres.
//
// TranslateError bật để lỗi 23505 của Postgres về thành gorm.ErrDuplicatedKey,
// nhờ vậy repository không phải import driver pgx chỉ để đọc mã lỗi.
func Open(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:         logger.Default.LogMode(logger.Silent),
		TranslateError: true,
	})
	if err != nil {
		return nil, fmt.Errorf("mở database: %w", err)
	}
	return db, nil
}

// translate đổi lỗi GORM sang lỗi quy ước của package này.
func translate(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		return ErrNotFound
	case errors.Is(err, gorm.ErrDuplicatedKey):
		return ErrDuplicate
	default:
		return err
	}
}
```

- [ ] **Step 6: Write the test harness**

Create `backend/internal/testdb/testdb.go`:

```go
// Package testdb dựng một Postgres THẬT cho test của các tầng chạm DB.
// Chỉ file _test.go được import package này.
//
// Vì sao không dùng mock: hai lỗi mà Phase 1 phải hoãn lại — NULL round-trip
// của decimal và ràng buộc UNIQUE — đều vô hình với mock. Một test skip khi
// thiếu env trông y hệt một test pass.
package testdb

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"gorm.io/gorm"

	"journal/internal/repository"
)

var (
	once    sync.Once
	shared  *gorm.DB
	initErr error
)

// New trả kết nối tới Postgres thật đã chạy đủ migrations, dữ liệu đã sạch.
// Container khởi động một lần cho mỗi process test (mỗi package Go là một
// process, nên các package chạy song song mỗi cái một container).
func New(t *testing.T) *gorm.DB {
	t.Helper()
	once.Do(func() { shared, initErr = start() })
	if initErr != nil {
		t.Fatalf("dựng Postgres cho test: %v", initErr)
	}
	Truncate(t, shared)
	return shared
}

func start() (*gorm.DB, error) {
	ctx := context.Background()
	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("journal_test"),
		tcpostgres.WithUsername("journal"),
		tcpostgres.WithPassword("journal"),
		testcontainers.WithWaitStrategy(
			// Postgres in ra dòng này hai lần: một lần khi initdb xong, một
			// lần khi server thật sự sẵn sàng. Chờ lần thứ hai.
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		return nil, fmt.Errorf("khởi động container postgres: %w", err)
	}

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, fmt.Errorf("lấy connection string: %w", err)
	}

	db, err := repository.Open(dsn)
	if err != nil {
		return nil, err
	}
	if err := applyMigrations(db); err != nil {
		return nil, err
	}
	return db, nil
}

// applyMigrations chạy chính các file .up.sql mà production dùng, theo thứ tự
// tên. Cố ý không dùng AutoMigrate: test phải kiểm được cả CHECK constraint
// và UNIQUE index viết tay trong migration.
func applyMigrations(db *gorm.DB) error {
	dir := migrationsDir()
	files, err := filepath.Glob(filepath.Join(dir, "*.up.sql"))
	if err != nil {
		return fmt.Errorf("tìm migration: %w", err)
	}
	if len(files) == 0 {
		return fmt.Errorf("không tìm thấy migration nào trong %s", dir)
	}
	sort.Strings(files)
	for _, f := range files {
		content, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("đọc %s: %w", f, err)
		}
		if err := db.Exec(string(content)).Error; err != nil {
			return fmt.Errorf("chạy %s: %w", filepath.Base(f), err)
		}
	}
	return nil
}

func migrationsDir() string {
	_, thisFile, _, _ := runtime.Caller(0) // .../backend/internal/testdb/testdb.go
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
}

// Truncate xoá sạch dữ liệu, giữ nguyên schema. Danh sách bảng đọc từ
// pg_tables nên migration mới không cần sửa hàm này.
func Truncate(t *testing.T, db *gorm.DB) {
	t.Helper()
	var tables []string
	err := db.Raw(
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
	).Scan(&tables).Error
	if err != nil {
		t.Fatalf("liệt kê bảng: %v", err)
	}
	if len(tables) == 0 {
		t.Fatal("không có bảng nào — migration chưa chạy?")
	}
	quoted := make([]string, len(tables))
	for i, name := range tables {
		quoted[i] = fmt.Sprintf("%q", name)
	}
	// RESTART IDENTITY để id bắt đầu lại từ 1; CASCADE để khỏi lo thứ tự FK.
	stmt := fmt.Sprintf("TRUNCATE %s RESTART IDENTITY CASCADE", joinComma(quoted))
	if err := db.Exec(stmt).Error; err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && go test ./internal/repository/... -count=1 -v 2>&1 | tail -20`
Expected: PASS for both tests. The first run pulls `postgres:16-alpine`, so allow a minute.

- [ ] **Step 8: FALSIFY the NULL test — required, not optional**

A test that passes because it checks nothing is worse than no test. Prove this one discriminates.

Temporarily change `Entry *decimal.Decimal` back to `Entry decimal.Decimal` in `backend/internal/domain/models.go` (and the `Entry: &entry` line in the precision test to `Entry: entry`), then run:

Run: `cd backend && go test ./internal/repository/... -count=1 -run TestTradeNullDecimalRoundTrip 2>&1 | tail -20`
Expected: FAIL, with a Scan error mentioning converting `<nil>`.

Then revert both edits and confirm `git diff backend/internal/domain/models.go` shows only the tag/`TableName` additions from Step 4. Record the observed failure message in the ledger.

- [ ] **Step 9: Document the Docker requirement**

In the `Makefile`, change the comment above `test` to:

```make
# Toàn bộ test Go. Từ Phase 2a trở đi lệnh này CẦN Docker: test của
# repository/service/httpapi chạy trên Postgres thật qua testcontainers.
# Không có Docker thì dùng `make test-pure`.
test:
	cd backend && go test ./... -count=1 -timeout 300s
```

In `.github/workflows/ci.yml`, change the test step to:

```yaml
      - name: Test
        run: cd backend && go test ./... -count=1 -timeout 300s
```

No Docker setup step is needed — the `ubuntu-latest` runner ships with Docker running.

- [ ] **Step 10: Verify the whole suite and the purity boundary**

Run: `cd backend && go vet ./... && go test ./... -count=1 -timeout 300s` then `make test-pure`
Expected: every package passes; `make test-pure` still completes in about a second without touching Docker.

- [ ] **Step 11: Commit**

```bash
git add backend/internal/testdb backend/internal/repository backend/internal/domain/models.go backend/go.mod backend/go.sum Makefile .github/workflows/ci.yml
git commit -m "feat(repository): add real-Postgres test harness and DB connection"
```

---

### Task 3: Password hashing (argon2id)

**Files:**
- Create: `backend/internal/auth/password.go`, `backend/internal/auth/password_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `auth.HashPassword(password string) (string, error)`; `auth.VerifyPassword(password, encoded string) (bool, error)`; `auth.ErrHashInvalid`; `auth.VerifyDummy(password string)`.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/auth/password_test.go`:

```go
package auth_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
)

func TestHashRoiVerifyDungMatKhau(t *testing.T) {
	encoded, err := auth.HashPassword("mat-khau-rat-dai-va-an-toan")
	require.NoError(t, err)

	ok, err := auth.VerifyPassword("mat-khau-rat-dai-va-an-toan", encoded)

	require.NoError(t, err)
	require.True(t, ok)
}

func TestVerifyTraFalseVoiMatKhauSai(t *testing.T) {
	encoded, err := auth.HashPassword("mat-khau-dung")
	require.NoError(t, err)

	ok, err := auth.VerifyPassword("mat-khau-sai", encoded)

	require.NoError(t, err, "sai mật khẩu không phải lỗi hệ thống, chỉ là false")
	require.False(t, ok)
}

// Salt ngẫu nhiên: hai lần băm cùng một mật khẩu phải ra hai chuỗi khác nhau,
// nếu không thì bảng rainbow dùng lại được.
func TestHaiLanHashCungMatKhauRaHaiChuoiKhacNhau(t *testing.T) {
	a, err := auth.HashPassword("cùng một mật khẩu")
	require.NoError(t, err)
	b, err := auth.HashPassword("cùng một mật khẩu")
	require.NoError(t, err)

	require.NotEqual(t, a, b)

	// Nhưng cả hai vẫn verify được.
	okA, err := auth.VerifyPassword("cùng một mật khẩu", a)
	require.NoError(t, err)
	require.True(t, okA)
	okB, err := auth.VerifyPassword("cùng một mật khẩu", b)
	require.NoError(t, err)
	require.True(t, okB)
}

// Tham số nằm trong chuỗi hash để đổi được về sau mà không phá hash cũ.
func TestChuoiHashChuaThamSo(t *testing.T) {
	encoded, err := auth.HashPassword("bất kỳ")
	require.NoError(t, err)

	require.True(t, strings.HasPrefix(encoded, "$argon2id$v=19$m=65536,t=1,p=4$"),
		"định dạng thực tế: %s", encoded)
	require.Len(t, strings.Split(encoded, "$"), 6)
}

func TestVerifyTuChoiChuoiHashHong(t *testing.T) {
	cases := map[string]string{
		"rỗng":            "",
		"không đủ đoạn":   "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA",
		"sai thuật toán":  "$bcrypt$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		"sai version":     "$argon2id$v=13$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		"tham số không đọc được": "$argon2id$v=19$m=abc,t=1,p=4$c2FsdA$aGFzaA",
		"salt không phải base64": "$argon2id$v=19$m=65536,t=1,p=4$!!!$aGFzaA",
	}
	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			ok, err := auth.VerifyPassword("bất kỳ", encoded)
			require.ErrorIs(t, err, auth.ErrHashInvalid)
			require.False(t, ok)
		})
	}
}

// VerifyDummy chạy khi email không tồn tại, để thời gian phản hồi của
// /login không tiết lộ email nào đã đăng ký. Nó không được panic.
func TestVerifyDummyKhongPanic(t *testing.T) {
	require.NotPanics(t, func() { auth.VerifyDummy("bất kỳ") })
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/auth/... -count=1`
Expected: FAIL — `no Go files in .../internal/auth` or `undefined: auth.HashPassword`.

- [ ] **Step 3: Write the implementation**

Run `cd backend && go get golang.org/x/crypto@v0.31.0` first, then create `backend/internal/auth/password.go`:

```go
// Package auth lo phần mật mã của xác thực: băm mật khẩu và ký token.
// KHÔNG import GORM, net/http hay context — test của package này chạy
// không cần Docker, và đó là điều kiện để giữ nó như vậy.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Tham số argon2id. Được ghi thẳng vào chuỗi hash nên đổi về sau không phá
// hash cũ: VerifyPassword đọc tham số từ chính chuỗi đang kiểm.
const (
	argonIters   uint32 = 1
	argonMemory  uint32 = 64 * 1024 // KiB
	argonThreads uint8  = 4
	argonKeyLen  uint32 = 32
	argonSaltLen        = 16
)

// ErrHashInvalid nghĩa là chuỗi hash trong DB hỏng, KHÁC với "sai mật khẩu".
// Sai mật khẩu trả (false, nil).
var ErrHashInvalid = errors.New("chuỗi hash không đúng định dạng")

// HashPassword trả chuỗi dạng $argon2id$v=19$m=65536,t=1,p=4$<salt>$<hash>.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("sinh salt: %w", err)
	}
	sum := argon2.IDKey([]byte(password), salt, argonIters, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonIters, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum)), nil
}

// VerifyPassword so mật khẩu với chuỗi hash.
// Trả (true, nil) khi khớp, (false, nil) khi sai mật khẩu,
// (false, ErrHashInvalid) khi chuỗi hash hỏng.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return false, ErrHashInvalid
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrHashInvalid
	}

	var memory, iters uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iters, &threads); err != nil {
		return false, ErrHashInvalid
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrHashInvalid
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, ErrHashInvalid
	}

	got := argon2.IDKey([]byte(password), salt, iters, memory, threads, uint32(len(want)))
	// So sánh hằng thời gian: so byte-by-byte thường sẽ rò rỉ độ dài tiền tố khớp.
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// dummyHash là hash của một mật khẩu không ai dùng.
var dummyHash string

func init() {
	h, err := HashPassword("mat-khau-gia-chi-de-can-bang-thoi-gian")
	if err != nil {
		panic(fmt.Sprintf("không dựng được dummy hash: %v", err))
	}
	dummyHash = h
}

// VerifyDummy chạy một phép băm giả có cùng chi phí với một lần verify thật.
// Login gọi nó khi email không tồn tại, để thời gian phản hồi không tiết lộ
// email nào đã đăng ký. Kết quả cố ý bị bỏ đi.
func VerifyDummy(password string) {
	_, _ = VerifyPassword(password, dummyHash)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && go test ./internal/auth/... -count=1 -v 2>&1 | tail -25`
Expected: PASS, including all six subtests of `TestVerifyTuChoiChuoiHashHong`.

- [ ] **Step 5: Confirm the package needs no Docker**

Run: `cd backend && go list -f '{{join .Imports "\n"}}' ./internal/auth`
Expected: only stdlib and `golang.org/x/crypto/argon2`. No `gorm.io/*`, no `net/http`, no `context`.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/auth backend/go.mod backend/go.sum
git commit -m "feat(auth): add argon2id password hashing with timing-balanced dummy verify"
```

---

### Task 4: Access tokens and refresh tokens

**Files:**
- Create: `backend/internal/auth/token.go`, `backend/internal/auth/token_test.go`

**Interfaces:**
- Consumes: nothing from Task 3 (same package, separate file).
- Produces: `auth.NewSigner(secret string, accessTTL time.Duration) *auth.Signer`; `(*Signer).SignAccess(userID int64) (string, error)`; `(*Signer).ParseAccess(token string) (int64, error)`; `auth.ErrInvalidToken`; `auth.NewRefreshToken() (string, error)`; `auth.HashRefreshToken(raw string) string`. The `Signer` has an unexported `now func() time.Time` field that same-package tests replace to simulate expiry.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/auth/token_test.go` — note this is `package auth` (internal), so it can swap the clock:

```go
package auth

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSignRoiParseTraVeUserID(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)

	token, err := s.SignAccess(42)
	require.NoError(t, err)

	got, err := s.ParseAccess(token)

	require.NoError(t, err)
	require.Equal(t, int64(42), got)
}

func TestParseTuChoiTokenHetHan(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	base := time.Date(2026, 8, 18, 10, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return base }

	token, err := s.SignAccess(42)
	require.NoError(t, err)

	// Ngay trước khi hết hạn: còn dùng được.
	s.now = func() time.Time { return base.Add(14 * time.Minute) }
	_, err = s.ParseAccess(token)
	require.NoError(t, err)

	// Sau khi hết hạn: hỏng.
	s.now = func() time.Time { return base.Add(16 * time.Minute) }
	_, err = s.ParseAccess(token)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiTokenKyBangKhoaKhac(t *testing.T) {
	signer := NewSigner("khoa-that", 15*time.Minute)
	keAnCap := NewSigner("khoa-gia", 15*time.Minute)

	token, err := keAnCap.SignAccess(42)
	require.NoError(t, err)

	_, err = signer.ParseAccess(token)

	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiTokenBiSua(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	token, err := s.SignAccess(42)
	require.NoError(t, err)

	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)
	// Đổi payload thành sub = 999 mà giữ nguyên chữ ký cũ.
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"999"}`))

	_, err = s.ParseAccess(strings.Join(parts, "."))

	require.ErrorIs(t, err, ErrInvalidToken)
}

// alg=none là lỗ hổng JWT kinh điển: token không chữ ký được chấp nhận nếu
// thư viện tin vào header. WithValidMethods phải chặn nó.
func TestParseTuChoiAlgNone(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"42"}`))

	_, err := s.ParseAccess(header + "." + payload + ".")

	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestParseTuChoiRacHoanToan(t *testing.T) {
	s := NewSigner("khoa-bi-mat", 15*time.Minute)
	for _, bad := range []string{"", "abc", "a.b.c", "....."} {
		_, err := s.ParseAccess(bad)
		require.ErrorIs(t, err, ErrInvalidToken, "input: %q", bad)
	}
}

func TestNewRefreshTokenSinhGiaTriKhacNhau(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		tok, err := NewRefreshToken()
		require.NoError(t, err)
		require.Len(t, tok, 43, "32 byte mã base64url không đệm dài 43 ký tự")
		require.False(t, seen[tok], "sinh trùng token ở lần %d", i)
		seen[tok] = true
	}
}

func TestHashRefreshTokenOnDinhVaKhacNhau(t *testing.T) {
	require.Equal(t, HashRefreshToken("abc"), HashRefreshToken("abc"))
	require.NotEqual(t, HashRefreshToken("abc"), HashRefreshToken("abd"))
	require.Len(t, HashRefreshToken("abc"), 64, "sha256 hex dài 64 ký tự")
	require.NotContains(t, HashRefreshToken("abc"), "abc", "hash không được chứa token thô")
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/auth/... -count=1 -run 'Token|Sign|Parse|Hash'`
Expected: FAIL — `undefined: NewSigner`.

- [ ] **Step 3: Write the implementation**

Run `cd backend && go get github.com/golang-jwt/jwt/v5@v5.2.1` first, then create `backend/internal/auth/token.go`:

```go
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken gộp mọi lý do access token không dùng được: sai chữ ký,
// hết hạn, sai thuật toán, rác. Cố ý không phân biệt — client không cần biết
// lý do, và phân biệt ra là cho kẻ tấn công thêm tín hiệu.
var ErrInvalidToken = errors.New("access token không hợp lệ")

// Signer ký và kiểm access token JWT HS256.
type Signer struct {
	secret    []byte
	accessTTL time.Duration
	now       func() time.Time // tiêm được để test hết hạn
}

func NewSigner(secret string, accessTTL time.Duration) *Signer {
	return &Signer{secret: []byte(secret), accessTTL: accessTTL, now: time.Now}
}

// SignAccess phát access token cho user.
func (s *Signer) SignAccess(userID int64) (string, error) {
	now := s.now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
	})
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("ký access token: %w", err)
	}
	return signed, nil
}

// ParseAccess trả user id trong token, hoặc ErrInvalidToken.
func (s *Signer) ParseAccess(raw string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(raw, &claims,
		func(*jwt.Token) (any, error) { return s.secret, nil },
		// WithValidMethods chặn alg=none và mọi thuật toán ngoài HS256.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(s.now),
	)
	if err != nil {
		return 0, ErrInvalidToken
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalidToken
	}
	return id, nil
}

// NewRefreshToken sinh token thô 32 byte ngẫu nhiên, mã base64url không đệm.
// Cố ý KHÔNG phải JWT: mỗi lần dùng đều phải tra DB nên token tự mô tả không
// mang lại gì, mà lại kéo khoá ký vào credential sống lâu nhất hệ thống.
func NewRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("sinh refresh token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashRefreshToken băm token thô để lưu DB. Token thô KHÔNG BAO GIỜ được lưu:
// đọc trộm được bảng refresh_tokens cũng không mạo danh được ai.
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && go test ./internal/auth/... -count=1 -v 2>&1 | tail -30`
Expected: PASS for every test in the package, including Task 3's.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/auth backend/go.mod backend/go.sum
git commit -m "feat(auth): add HS256 access tokens and hashed refresh tokens"
```

---

### Task 5: Migration 0002, UserRepo, RefreshTokenRepo

**Files:**
- Create: `backend/migrations/0002_refresh_tokens.up.sql`, `backend/migrations/0002_refresh_tokens.down.sql`
- Create: `backend/internal/repository/user.go`, `backend/internal/repository/user_test.go`
- Create: `backend/internal/repository/refreshtoken.go`, `backend/internal/repository/refreshtoken_test.go`

**Interfaces:**
- Consumes: `repository.Open`, `repository.ErrNotFound`, `repository.ErrDuplicate`, `repository.translate` (Task 2); `testdb.New` (Task 2).
- Produces:
  - `repository.UserRow{ID int64; Email, PasswordHash string; CreatedAt, UpdatedAt time.Time}`
  - `repository.NewUserRepo(db *gorm.DB) *UserRepo` with `Count(ctx) (int64, error)`, `Create(ctx, email, passwordHash string) (UserRow, error)`, `ByEmail(ctx, email string) (UserRow, error)`, `ByID(ctx, id int64) (UserRow, error)`
  - `repository.RefreshTokenRow{ID, UserID int64; TokenHash string; ExpiresAt time.Time; RevokedAt *time.Time; CreatedAt time.Time}`
  - `repository.NewRefreshTokenRepo(db *gorm.DB) *RefreshTokenRepo` with `Create(ctx, userID int64, tokenHash string, expiresAt time.Time) error`, `ByHash(ctx, tokenHash string) (RefreshTokenRow, error)`, `Revoke(ctx, id int64, at time.Time) error`, `RevokeAllForUser(ctx, userID int64, at time.Time) error`

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0002_refresh_tokens.up.sql`:

```sql
CREATE TABLE refresh_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- SHA-256 hex của token thô. Token thô KHÔNG BAO GIỜ được lưu.
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    -- NULL nghĩa là còn sống. Đặt giá trị khi xoay vòng hoặc khi logout.
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
```

Create `backend/migrations/0002_refresh_tokens.down.sql`:

```sql
DROP TABLE refresh_tokens;
```

- [ ] **Step 2: Write the failing tests**

Create `backend/internal/repository/user_test.go`:

```go
package repository_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/testdb"
)

func TestUserCountRongLucDau(t *testing.T) {
	repo := repository.NewUserRepo(testdb.New(t))

	n, err := repo.Count(context.Background())

	require.NoError(t, err)
	require.Equal(t, int64(0), n)
}

func TestUserCreateRoiDocLai(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))

	created, err := repo.Create(ctx, "a@example.com", "hash-gia")
	require.NoError(t, err)
	require.NotZero(t, created.ID)
	require.False(t, created.CreatedAt.IsZero(), "DEFAULT now() phải đọc ngược về struct")

	byEmail, err := repo.ByEmail(ctx, "a@example.com")
	require.NoError(t, err)
	require.Equal(t, created.ID, byEmail.ID)
	require.Equal(t, "hash-gia", byEmail.PasswordHash)

	byID, err := repo.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "a@example.com", byID.Email)

	n, err := repo.Count(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
}

func TestUserCreateTrungEmailTraErrDuplicate(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))
	_, err := repo.Create(ctx, "a@example.com", "hash-gia")
	require.NoError(t, err)

	_, err = repo.Create(ctx, "a@example.com", "hash-khac")

	require.ErrorIs(t, err, repository.ErrDuplicate)
}

func TestUserKhongTonTaiTraErrNotFound(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))

	_, err := repo.ByEmail(ctx, "khong-co@example.com")
	require.ErrorIs(t, err, repository.ErrNotFound)

	_, err = repo.ByID(ctx, 999)
	require.ErrorIs(t, err, repository.ErrNotFound)
}
```

Create `backend/internal/repository/refreshtoken_test.go`:

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/testdb"
)

func seedUser(t *testing.T, repo *repository.UserRepo, email string) int64 {
	t.Helper()
	u, err := repo.Create(context.Background(), email, "hash-gia")
	require.NoError(t, err)
	return u.ID
}

func TestRefreshTokenCreateRoiDocTheoHash(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	expires := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)

	require.NoError(t, tokens.Create(ctx, userID, "hash-1", expires))

	got, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	require.Equal(t, userID, got.UserID)
	require.Nil(t, got.RevokedAt, "token mới phải còn sống")
	require.WithinDuration(t, expires, got.ExpiresAt.UTC(), time.Second)
}

func TestRefreshTokenHashKhongTonTai(t *testing.T) {
	db := testdb.New(t)
	tokens := repository.NewRefreshTokenRepo(db)

	_, err := tokens.ByHash(context.Background(), "khong-co")

	require.ErrorIs(t, err, repository.ErrNotFound)
}

func TestRefreshTokenRevokeDatRevokedAt(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	require.NoError(t, tokens.Create(ctx, userID, "hash-1", time.Now().Add(time.Hour)))
	row, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	at := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, tokens.Revoke(ctx, row.ID, at))

	after, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err, "thu hồi KHÔNG xoá bản ghi — phải còn để phát hiện tái sử dụng")
	require.NotNil(t, after.RevokedAt)
	require.WithinDuration(t, at, after.RevokedAt.UTC(), time.Second)
}

// Đây là hàm mà phát hiện tái sử dụng dựa vào: một token bị replay thì mọi
// phiên của user đó phải chết, không chỉ token bị replay.
func TestRevokeAllForUserChiChamUserDo(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	nan := seedUser(t, users, "nan@example.com")
	khac := seedUser(t, users, "khac@example.com")
	require.NoError(t, tokens.Create(ctx, nan, "hash-nan-1", time.Now().Add(time.Hour)))
	require.NoError(t, tokens.Create(ctx, nan, "hash-nan-2", time.Now().Add(time.Hour)))
	require.NoError(t, tokens.Create(ctx, khac, "hash-khac", time.Now().Add(time.Hour)))

	require.NoError(t, tokens.RevokeAllForUser(ctx, nan, time.Now()))

	for _, h := range []string{"hash-nan-1", "hash-nan-2"} {
		row, err := tokens.ByHash(ctx, h)
		require.NoError(t, err)
		require.NotNil(t, row.RevokedAt, "%s phải bị thu hồi", h)
	}
	other, err := tokens.ByHash(ctx, "hash-khac")
	require.NoError(t, err)
	require.Nil(t, other.RevokedAt, "token của user khác KHÔNG được đụng tới")
}

// Thu hồi lần hai không được ghi đè thời điểm thu hồi lần đầu.
func TestRevokeAllForUserKhongGhiDeTokenDaThuHoi(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	require.NoError(t, tokens.Create(ctx, userID, "hash-1", time.Now().Add(time.Hour)))
	row, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	first := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	require.NoError(t, tokens.Revoke(ctx, row.ID, first))

	require.NoError(t, tokens.RevokeAllForUser(ctx, userID, time.Now()))

	after, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	require.WithinDuration(t, first, after.RevokedAt.UTC(), time.Second)
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/repository/... -count=1`
Expected: FAIL — `undefined: repository.NewUserRepo`.

- [ ] **Step 4: Write `user.go`**

Create `backend/internal/repository/user.go`:

```go
package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// UserRow ánh xạ bảng users. Không dùng domain.User vì user chưa xuất hiện
// trong bất kỳ công thức nghiệp vụ nào — nó thuần tuý là chuyện hạ tầng.
type UserRow struct {
	ID           int64     `gorm:"column:id;primaryKey"`
	Email        string    `gorm:"column:email"`
	PasswordHash string    `gorm:"column:password_hash"`
	CreatedAt    time.Time `gorm:"column:created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at"`
}

func (UserRow) TableName() string { return "users" }

type UserRepo struct{ db *gorm.DB }

func NewUserRepo(db *gorm.DB) *UserRepo { return &UserRepo{db: db} }

// Count đếm tổng số user. Register dùng nó để cưỡng chế luật "chỉ user đầu tiên".
func (r *UserRepo) Count(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&UserRow{}).Count(&n).Error
	return n, translate(err)
}

func (r *UserRepo) Create(ctx context.Context, email, passwordHash string) (UserRow, error) {
	row := UserRow{Email: email, PasswordHash: passwordHash}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return UserRow{}, translate(err)
	}
	return row, nil
}

func (r *UserRepo) ByEmail(ctx context.Context, email string) (UserRow, error) {
	var row UserRow
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&row).Error
	return row, translate(err)
}

func (r *UserRepo) ByID(ctx context.Context, id int64) (UserRow, error) {
	var row UserRow
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&row).Error
	return row, translate(err)
}
```

- [ ] **Step 5: Write `refreshtoken.go`**

Create `backend/internal/repository/refreshtoken.go`:

```go
package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// RefreshTokenRow ánh xạ bảng refresh_tokens.
// RevokedAt là con trỏ: NULL nghĩa là token còn sống.
type RefreshTokenRow struct {
	ID        int64      `gorm:"column:id;primaryKey"`
	UserID    int64      `gorm:"column:user_id"`
	TokenHash string     `gorm:"column:token_hash"`
	ExpiresAt time.Time  `gorm:"column:expires_at"`
	RevokedAt *time.Time `gorm:"column:revoked_at"`
	CreatedAt time.Time  `gorm:"column:created_at"`
}

func (RefreshTokenRow) TableName() string { return "refresh_tokens" }

type RefreshTokenRepo struct{ db *gorm.DB }

func NewRefreshTokenRepo(db *gorm.DB) *RefreshTokenRepo { return &RefreshTokenRepo{db: db} }

func (r *RefreshTokenRepo) Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error {
	row := RefreshTokenRow{UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt}
	return translate(r.db.WithContext(ctx).Create(&row).Error)
}

func (r *RefreshTokenRepo) ByHash(ctx context.Context, tokenHash string) (RefreshTokenRow, error) {
	var row RefreshTokenRow
	err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&row).Error
	return row, translate(err)
}

// Revoke đánh dấu một token là đã thu hồi. Cố ý KHÔNG xoá bản ghi: bản ghi
// đã thu hồi chính là thứ để phát hiện token bị đánh cắp rồi dùng lại.
func (r *RefreshTokenRepo) Revoke(ctx context.Context, id int64, at time.Time) error {
	return translate(r.db.WithContext(ctx).Model(&RefreshTokenRow{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", at).Error)
}

// RevokeAllForUser giết mọi phiên còn sống của một user. Gọi khi phát hiện
// một token đã xoay vòng bị dùng lại. Điều kiện revoked_at IS NULL giữ nguyên
// thời điểm thu hồi của những token đã chết từ trước.
func (r *RefreshTokenRepo) RevokeAllForUser(ctx context.Context, userID int64, at time.Time) error {
	return translate(r.db.WithContext(ctx).Model(&RefreshTokenRow{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", at).Error)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/repository/... -count=1 -v 2>&1 | tail -30`
Expected: PASS for every test, including Task 2's two mapping tests.

- [ ] **Step 7: Verify the migration is reversible**

Run:

```bash
docker compose --env-file .env.example run --rm migrate -path=/migrations -database "$DATABASE_URL" down 1
docker compose --env-file .env.example run --rm migrate
```

Expected: `0002` rolls back and re-applies with no error. If the compose `migrate` service does not accept those arguments, instead verify by hand with `psql`: apply `0002_refresh_tokens.down.sql` then `0002_refresh_tokens.up.sql` and confirm `\d refresh_tokens` matches.

- [ ] **Step 8: Commit**

```bash
git add backend/migrations backend/internal/repository
git commit -m "feat(repository): add refresh_tokens migration, UserRepo and RefreshTokenRepo"
```

---

### Task 6: AuthService — register, login, refresh with reuse detection, logout

This task closes the second deferred debt: the replay path exercised end to end.

**Files:**
- Create: `backend/internal/service/auth.go`, `backend/internal/service/auth_test.go`

**Interfaces:**
- Consumes: `repository.UserRepo`, `repository.RefreshTokenRepo`, `repository.ErrNotFound`, `repository.ErrDuplicate` (Task 5); `auth.Signer`, `auth.HashPassword`, `auth.VerifyPassword`, `auth.VerifyDummy`, `auth.NewRefreshToken`, `auth.HashRefreshToken` (Tasks 3–4); `apperr` (Task 1).
- Produces: `service.Session{AccessToken, RefreshToken string; RefreshExpiry time.Time; User repository.UserRow}`; `service.NewAuthService(users *repository.UserRepo, tokens *repository.RefreshTokenRepo, signer *auth.Signer, refreshTTL time.Duration) *AuthService` with `Register(ctx, email, password string) (Session, error)`, `Login(ctx, email, password string) (Session, error)`, `Refresh(ctx, rawToken string) (Session, error)`, `Logout(ctx, rawToken string) error`. The struct has an exported-for-test `Now func() time.Time` field defaulting to `time.Now`.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/service/auth_test.go`:

```go
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

func newAuthService(t *testing.T) *service.AuthService {
	t.Helper()
	db := testdb.New(t)
	return service.NewAuthService(
		repository.NewUserRepo(db),
		repository.NewRefreshTokenRepo(db),
		auth.NewSigner("khoa-test", 15*time.Minute),
		720*time.Hour,
	)
}

func TestRegisterUserDauTienThanhCong(t *testing.T) {
	svc := newAuthService(t)

	s, err := svc.Register(context.Background(), "a@example.com", "mat-khau-du-dai")

	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.NotEmpty(t, s.RefreshToken)
	require.Equal(t, "a@example.com", s.User.Email)
	require.NotEqual(t, "mat-khau-du-dai", s.User.PasswordHash, "mật khẩu phải được băm")
}

// Đăng ký đóng sau user đầu tiên — quyết định #4 của spec 2a.
func TestRegisterLanThuHaiBiTuChoi(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	_, err = svc.Register(ctx, "b@example.com", "mat-khau-du-dai")

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
	require.Equal(t, 1403, e.Code)
	require.Equal(t, "đã có tài khoản, đăng ký đã đóng", e.Msg)
}

func TestRegisterTuChoiInputHong(t *testing.T) {
	cases := map[string]struct{ email, password string }{
		"email rỗng":        {"", "mat-khau-du-dai"},
		"email không có @":  {"khong-phai-email", "mat-khau-du-dai"},
		"mật khẩu quá ngắn": {"a@example.com", "ngan"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			svc := newAuthService(t)

			_, err := svc.Register(context.Background(), c.email, c.password)

			e := apperr.As(err)
			require.NotNil(t, e)
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestLoginDungMatKhau(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	s, err := svc.Login(ctx, "a@example.com", "mat-khau-du-dai")

	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.NotEmpty(t, s.RefreshToken)
}

// Sai email và sai mật khẩu phải KHÔNG phân biệt được từ phía client.
func TestLoginSaiEmailVaSaiMatKhauTraCungMotLoi(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	_, errSaiMatKhau := svc.Login(ctx, "a@example.com", "mat-khau-sai")
	_, errSaiEmail := svc.Login(ctx, "khong-co@example.com", "mat-khau-du-dai")

	a, b := apperr.As(errSaiMatKhau), apperr.As(errSaiEmail)
	require.NotNil(t, a)
	require.NotNil(t, b)
	require.Equal(t, 401, a.Status)
	require.Equal(t, a.Code, b.Code)
	require.Equal(t, a.Msg, b.Msg)
	require.Equal(t, "email hoặc mật khẩu không đúng", a.Msg)
}

func TestRefreshXoayVongTokenCu(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	first, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	second, err := svc.Refresh(ctx, first.RefreshToken)

	require.NoError(t, err)
	require.NotEqual(t, first.RefreshToken, second.RefreshToken, "refresh phải phát token mới")
	require.NotEmpty(t, second.AccessToken)
}

// ĐÂY LÀ TEST QUAN TRỌNG NHẤT CỦA TASK: dùng lại một token đã xoay vòng nghĩa
// là token đó bị đánh cắp — mọi phiên của user đó phải chết, kể cả phiên hợp lệ.
func TestRefreshDungLaiTokenDaXoayVongGietMoiPhien(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	first, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)
	second, err := svc.Refresh(ctx, first.RefreshToken)
	require.NoError(t, err)

	// Kẻ tấn công dùng lại token đã chết.
	_, err = svc.Refresh(ctx, first.RefreshToken)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
	require.Equal(t, "phiên đăng nhập không hợp lệ, đăng nhập lại", e.Msg)

	// Và token HỢP LỆ của người dùng thật cũng phải chết theo.
	_, err = svc.Refresh(ctx, second.RefreshToken)
	require.NotNil(t, apperr.As(err), "phiên hợp lệ phải bị giết theo khi phát hiện tái sử dụng")
}

func TestRefreshTuChoiTokenKhongTonTai(t *testing.T) {
	svc := newAuthService(t)

	_, err := svc.Refresh(context.Background(), "token-bia-ra")

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
}

func TestRefreshTuChoiTokenHetHan(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	base := time.Date(2026, 8, 18, 10, 0, 0, 0, time.UTC)
	svc.Now = func() time.Time { return base }
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	svc.Now = func() time.Time { return base.Add(721 * time.Hour) } // refreshTTL là 720h

	_, err = svc.Refresh(ctx, s.RefreshToken)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
}

func TestLogoutThuHoiTokenDangDung(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))

	_, err = svc.Refresh(ctx, s.RefreshToken)
	require.NotNil(t, apperr.As(err), "token đã logout không được refresh nữa")
}

// Logout là idempotent: gọi hai lần, gọi với token rác, đều không phải lỗi.
func TestLogoutIdempotent(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, "token-bia-ra"))
	require.NoError(t, svc.Logout(ctx, ""))
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/service/... -count=1`
Expected: FAIL — `no Go files` / `undefined: service.NewAuthService`.

- [ ] **Step 3: Write the implementation**

Create `backend/internal/service/auth.go`:

```go
// Package service ghép repository với các package thuần, giữ luật nghiệp vụ
// và ranh giới transaction. Không import net/http — lỗi trả về là *apperr.Error,
// tầng httpapi dịch sang envelope.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/repository"
)

// Thông điệp cố ý dùng chung cho mọi lý do đăng nhập hỏng: phân biệt ra là
// cho kẻ tấn công biết email nào đã đăng ký.
const msgSaiThongTinDangNhap = "email hoặc mật khẩu không đúng"

// Dùng chung cho mọi lý do refresh hỏng, vì lý do tương tự.
const msgPhienKhongHopLe = "phiên đăng nhập không hợp lệ, đăng nhập lại"

const minPasswordLen = 8

// Session là kết quả của một lần đăng nhập/đăng ký/refresh.
// RefreshToken là token THÔ, chỉ tồn tại trong response này một lần duy nhất —
// DB chỉ giữ hash của nó.
type Session struct {
	AccessToken   string
	RefreshToken  string
	RefreshExpiry time.Time
	User          repository.UserRow
}

type AuthService struct {
	users      *repository.UserRepo
	tokens     *repository.RefreshTokenRepo
	signer     *auth.Signer
	refreshTTL time.Duration

	// Now tiêm được để test hết hạn. Mặc định time.Now.
	Now func() time.Time
}

func NewAuthService(
	users *repository.UserRepo,
	tokens *repository.RefreshTokenRepo,
	signer *auth.Signer,
	refreshTTL time.Duration,
) *AuthService {
	return &AuthService{
		users:      users,
		tokens:     tokens,
		signer:     signer,
		refreshTTL: refreshTTL,
		Now:        time.Now,
	}
}

// Register chỉ thành công khi CHƯA có user nào. Sản phẩm dùng cho một người;
// mở đăng ký cho cả thế giới là lỗ hổng, không phải tính năng.
func (s *AuthService) Register(ctx context.Context, email, password string) (Session, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || !strings.Contains(email, "@") {
		return Session{}, apperr.Validation("email không hợp lệ")
	}
	if len(password) < minPasswordLen {
		return Session{}, apperr.Validation(fmt.Sprintf("mật khẩu phải dài ít nhất %d ký tự", minPasswordLen))
	}

	n, err := s.users.Count(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("đếm user: %w", err)
	}
	if n > 0 {
		return Session{}, apperr.Forbidden("đã có tài khoản, đăng ký đã đóng")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return Session{}, fmt.Errorf("băm mật khẩu: %w", err)
	}

	user, err := s.users.Create(ctx, email, hash)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return Session{}, apperr.Conflict("email đã được dùng")
		}
		return Session{}, fmt.Errorf("tạo user: %w", err)
	}
	return s.issue(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, email, password string) (Session, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	user, err := s.users.ByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Vẫn băm một lần để thời gian phản hồi không tiết lộ email nào tồn tại.
			auth.VerifyDummy(password)
			return Session{}, apperr.Unauthorized(msgSaiThongTinDangNhap)
		}
		return Session{}, fmt.Errorf("tìm user: %w", err)
	}

	ok, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return Session{}, fmt.Errorf("kiểm mật khẩu: %w", err)
	}
	if !ok {
		return Session{}, apperr.Unauthorized(msgSaiThongTinDangNhap)
	}
	return s.issue(ctx, user)
}

// Refresh xoay vòng token. Một token ĐÃ THU HỒI mà còn được gửi lên nghĩa là
// nó bị đánh cắp: giết mọi phiên của user đó, không chỉ token bị gửi lại.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (Session, error) {
	if rawToken == "" {
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}

	row, err := s.tokens.ByHash(ctx, auth.HashRefreshToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
		}
		return Session{}, fmt.Errorf("tìm refresh token: %w", err)
	}

	now := s.Now()

	if row.RevokedAt != nil {
		if err := s.tokens.RevokeAllForUser(ctx, row.UserID, now); err != nil {
			return Session{}, fmt.Errorf("thu hồi toàn bộ phiên: %w", err)
		}
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}
	if !row.ExpiresAt.After(now) {
		return Session{}, apperr.Unauthorized(msgPhienKhongHopLe)
	}

	if err := s.tokens.Revoke(ctx, row.ID, now); err != nil {
		return Session{}, fmt.Errorf("thu hồi token cũ: %w", err)
	}

	user, err := s.users.ByID(ctx, row.UserID)
	if err != nil {
		return Session{}, fmt.Errorf("tìm user của token: %w", err)
	}
	return s.issue(ctx, user)
}

// Logout luôn thành công: gọi hai lần, hay gọi với token rác, đều không phải lỗi.
func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	row, err := s.tokens.ByHash(ctx, auth.HashRefreshToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("tìm refresh token: %w", err)
	}
	if row.RevokedAt != nil {
		return nil
	}
	return s.tokens.Revoke(ctx, row.ID, s.Now())
}

func (s *AuthService) issue(ctx context.Context, user repository.UserRow) (Session, error) {
	access, err := s.signer.SignAccess(user.ID)
	if err != nil {
		return Session{}, fmt.Errorf("ký access token: %w", err)
	}
	raw, err := auth.NewRefreshToken()
	if err != nil {
		return Session{}, fmt.Errorf("sinh refresh token: %w", err)
	}
	expiry := s.Now().Add(s.refreshTTL)
	if err := s.tokens.Create(ctx, user.ID, auth.HashRefreshToken(raw), expiry); err != nil {
		return Session{}, fmt.Errorf("lưu refresh token: %w", err)
	}
	return Session{AccessToken: access, RefreshToken: raw, RefreshExpiry: expiry, User: user}, nil
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && go test ./internal/service/... -count=1 -v 2>&1 | tail -30`
Expected: PASS for all tests.

- [ ] **Step 5: FALSIFY the reuse-detection test**

Temporarily replace the `RevokeAllForUser` call inside the `row.RevokedAt != nil` branch with nothing (leave only the `return`), then run:

Run: `cd backend && go test ./internal/service/... -count=1 -run TestRefreshDungLaiTokenDaXoayVongGietMoiPhien`
Expected: FAIL on the last assertion — the legitimate session survives. Restore the call and confirm the test passes again. Record the observed failure in the ledger.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/service
git commit -m "feat(service): add AuthService with refresh rotation and reuse detection"
```

---

### Task 7: Auth over HTTP — envelope errors, RequireAuth, cookies

**Files:**
- Create: `backend/internal/httpapi/dto.go`, `backend/internal/httpapi/middleware.go`, `backend/internal/httpapi/auth_handler.go`
- Create: `backend/internal/httpapi/middleware_test.go`, `backend/internal/httpapi/auth_handler_test.go`
- Modify: `backend/internal/httpapi/response.go`, `backend/internal/httpapi/router.go`, `backend/internal/httpapi/health_test.go`

**Interfaces:**
- Consumes: `service.AuthService`, `service.Session` (Task 6); `auth.Signer` (Task 4); `apperr.As` (Task 1); `testdb.New` (Task 2).
- Produces: `httpapi.Deps{Auth *service.AuthService; Signer *auth.Signer; Secure bool}` — later tasks add fields to this struct; `httpapi.NewRouter(d Deps) http.Handler`; `httpapi.FailErr(w http.ResponseWriter, r *http.Request, err error)`; `httpapi.RequireAuth(signer *auth.Signer) func(http.Handler) http.Handler`; `httpapi.UserID(ctx context.Context) int64`; cookie name constant `refresh_token` on path `/api/auth`.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/httpapi/middleware_test.go`:

```go
package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
)

// RequireAuth được test trực tiếp trên một handler giả, để không phải mượn
// một endpoint nghiệp vụ nào làm bia đỡ.
func TestRequireAuth(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)

	var seenUserID int64
	protected := httpapi.RequireAuth(signer)(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			seenUserID = httpapi.UserID(r.Context())
			httpapi.OK(w, map[string]string{"ok": "yes"})
		}))

	cases := []struct {
		name       string
		header     string
		wantStatus int
	}{
		{"không có header", "", http.StatusUnauthorized},
		{"sai scheme", "Basic " + token, http.StatusUnauthorized},
		{"token rác", "Bearer abc.def.ghi", http.StatusUnauthorized},
		{"Bearer rỗng", "Bearer ", http.StatusUnauthorized},
		{"token hợp lệ", "Bearer " + token, http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			seenUserID = 0
			req := httptest.NewRequest(http.MethodGet, "/bat-ky", nil)
			if c.header != "" {
				req.Header.Set("Authorization", c.header)
			}
			rec := httptest.NewRecorder()

			protected.ServeHTTP(rec, req)

			require.Equal(t, c.wantStatus, rec.Code)
			require.Contains(t, rec.Body.String(), `"code"`, "lỗi cũng phải đi qua envelope")
			if c.wantStatus == http.StatusOK {
				require.Equal(t, int64(7), seenUserID, "user id phải vào được context")
			} else {
				require.Zero(t, seenUserID)
			}
		})
	}
}

// Scheme "bearer" viết thường vẫn phải nhận — RFC 6750 nói scheme không phân biệt hoa thường.
func TestRequireAuthChapNhanSchemeVietThuong(t *testing.T) {
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	token, err := signer.SignAccess(7)
	require.NoError(t, err)
	protected := httpapi.RequireAuth(signer)(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) { httpapi.OK(w, nil) }))
	req := httptest.NewRequest(http.MethodGet, "/bat-ky", nil)
	req.Header.Set("Authorization", "bearer "+token)
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
}
```

Create `backend/internal/httpapi/auth_handler_test.go`:

```go
package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// newServer dựng router thật trên DB thật, kèm client giữ cookie như trình duyệt.
func newServer(t *testing.T) (*httptest.Server, *http.Client) {
	t.Helper()
	db := testdb.New(t)
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	authSvc := service.NewAuthService(
		repository.NewUserRepo(db),
		repository.NewRefreshTokenRepo(db),
		signer,
		720*time.Hour,
	)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Auth: authSvc, Signer: signer}))
	t.Cleanup(srv.Close)

	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return srv, &http.Client{Jar: jar}
}

type envelopeBody struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func post(t *testing.T, c *http.Client, url, body string) (*http.Response, envelopeBody) {
	t.Helper()
	resp, err := c.Post(url, "application/json", strings.NewReader(body))
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var env envelopeBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp, env
}

func TestRegisterTraTokenVaDatCookie(t *testing.T) {
	srv, client := newServer(t)

	resp, env := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)

	var data struct {
		AccessToken string `json:"access_token"`
		User        struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &data))
	require.NotEmpty(t, data.AccessToken)
	require.Equal(t, "a@example.com", data.User.Email)
	require.NotZero(t, data.User.ID)
	require.NotContains(t, string(env.Data), "password", "response không được lộ mật khẩu hay hash")

	var refresh *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "refresh_token" {
			refresh = c
		}
	}
	require.NotNil(t, refresh, "phải set cookie refresh_token")
	require.True(t, refresh.HttpOnly, "cookie refresh phải HttpOnly")
	require.Equal(t, "/api/auth", refresh.Path)
	require.Equal(t, http.SameSiteLaxMode, refresh.SameSite)
	require.NotEmpty(t, refresh.Value)
}

func TestRegisterLanHaiTra403(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	resp, env := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"b@example.com","password":"mat-khau-du-dai"}`)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
	require.Equal(t, "đã có tài khoản, đăng ký đã đóng", env.Msg)
}

func TestLoginSaiMatKhauTra401(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	resp, env := post(t, client, srv.URL+"/api/auth/login",
		`{"email":"a@example.com","password":"mat-khau-sai"}`)

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
	require.Equal(t, "email hoặc mật khẩu không đúng", env.Msg)
}

func TestJSONHongTra400(t *testing.T) {
	srv, client := newServer(t)

	resp, env := post(t, client, srv.URL+"/api/auth/register", `{"email":`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

// Vòng đời đầy đủ, đúng như trình duyệt sẽ chạy: cookie tự đi theo client.
func TestVongDoiRefreshVaPhatHienTaiSuDung(t *testing.T) {
	srv, client := newServer(t)
	registerResp, _ := post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)
	var cookieDau string
	for _, c := range registerResp.Cookies() {
		if c.Name == "refresh_token" {
			cookieDau = c.Value
		}
	}
	require.NotEmpty(t, cookieDau)

	// Refresh bình thường: cookie mới khác cookie cũ.
	refreshResp, env := post(t, client, srv.URL+"/api/auth/refresh", "")
	require.Equal(t, http.StatusOK, refreshResp.StatusCode)
	require.Equal(t, 0, env.Code)
	var cookieMoi string
	for _, c := range refreshResp.Cookies() {
		if c.Name == "refresh_token" {
			cookieMoi = c.Value
		}
	}
	require.NotEmpty(t, cookieMoi)
	require.NotEqual(t, cookieDau, cookieMoi, "refresh phải xoay vòng cookie")

	// Kẻ tấn công gửi lại cookie CŨ bằng một client riêng.
	keTanCong := &http.Client{}
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: cookieDau})
	replayResp, err := keTanCong.Do(req)
	require.NoError(t, err)
	defer func() { _ = replayResp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, replayResp.StatusCode)

	// Và phiên hợp lệ của người dùng thật cũng phải chết theo.
	deadResp, _ := post(t, client, srv.URL+"/api/auth/refresh", "")
	require.Equal(t, http.StatusUnauthorized, deadResp.StatusCode,
		"phát hiện tái sử dụng phải giết cả phiên đang hợp lệ")
}

func TestLogoutXoaCookieVaChanRefresh(t *testing.T) {
	srv, client := newServer(t)
	_, _ = post(t, client, srv.URL+"/api/auth/register",
		`{"email":"a@example.com","password":"mat-khau-du-dai"}`)

	logoutResp, env := post(t, client, srv.URL+"/api/auth/logout", "")

	require.Equal(t, http.StatusOK, logoutResp.StatusCode)
	require.Equal(t, 0, env.Code)
	var cleared bool
	for _, c := range logoutResp.Cookies() {
		if c.Name == "refresh_token" && c.MaxAge < 0 {
			cleared = true
		}
	}
	require.True(t, cleared, "logout phải xoá cookie (MaxAge âm)")

	// Gọi lại logout không phải lỗi.
	again, _ := post(t, client, srv.URL+"/api/auth/logout", "")
	require.Equal(t, http.StatusOK, again.StatusCode)
}

func TestRefreshKhongCoCookieTra401(t *testing.T) {
	srv, _ := newServer(t)
	client := &http.Client{}

	resp, env := post(t, client, srv.URL+"/api/auth/refresh", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1401, env.Code)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/httpapi/... -count=1`
Expected: FAIL — `undefined: httpapi.Deps`, `undefined: httpapi.RequireAuth`.

- [ ] **Step 3: Extend `response.go`**

Append to `backend/internal/httpapi/response.go` (and add `log`, `journal/internal/apperr`, and `github.com/go-chi/chi/v5/middleware` to its imports):

```go
// FailErr dịch một lỗi sang envelope. Lỗi mang *apperr.Error là lỗi nghiệp vụ
// hiển thị được; mọi lỗi khác là lỗi hạ tầng hoặc lập trình — trả 500 với
// thông điệp chung và ghi chi tiết vào log, không đẩy chi tiết ra cho client.
func FailErr(w http.ResponseWriter, r *http.Request, err error) {
	if e := apperr.As(err); e != nil {
		Fail(w, e.Status, e.Code, e.Msg)
		return
	}
	log.Printf("lỗi không mong đợi [request_id=%s] %s %s: %v",
		middleware.GetReqID(r.Context()), r.Method, r.URL.Path, err)
	Fail(w, http.StatusInternalServerError, 1500, "lỗi hệ thống")
}

// DecodeJSON đọc body JSON vào dst, trả *apperr.Error khi body hỏng.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperr.Validation("dữ liệu gửi lên không đọc được")
	}
	return nil
}
```

- [ ] **Step 4: Write `middleware.go`**

Create `backend/internal/httpapi/middleware.go`:

```go
package httpapi

import (
	"context"
	"net/http"
	"strings"

	"journal/internal/auth"
)

type ctxKey int

const (
	ctxKeyUserID ctxKey = iota
	ctxKeyAccount
)

// RequireAuth chặn request không mang access token hợp lệ và đặt user id vào
// context. Mọi endpoint dữ liệu phải đi qua đây.
func RequireAuth(signer *auth.Signer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				Fail(w, http.StatusUnauthorized, 1401, "chưa đăng nhập")
				return
			}
			userID, err := signer.ParseAccess(raw)
			if err != nil {
				Fail(w, http.StatusUnauthorized, 1401, "phiên đăng nhập đã hết hạn")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyUserID, userID)))
		})
	}
}

// UserID lấy user id đã xác thực. Trả 0 nếu chưa qua RequireAuth.
func UserID(ctx context.Context) int64 {
	id, _ := ctx.Value(ctxKeyUserID).(int64)
	return id
}

// bearerToken đọc "Authorization: Bearer <token>". Scheme không phân biệt
// hoa thường theo RFC 6750.
func bearerToken(r *http.Request) string {
	const prefix = "bearer "
	h := r.Header.Get("Authorization")
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}
```

- [ ] **Step 5: Write `dto.go`**

Create `backend/internal/httpapi/dto.go`:

```go
package httpapi

import "journal/internal/service"

// DTO là hợp đồng với frontend. Struct của domain và của repository KHÔNG
// được marshal thẳng: chúng đổi hình dạng vì lý do nội bộ, hợp đồng API thì không.

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userDTO struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

type sessionDTO struct {
	AccessToken string  `json:"access_token"`
	User        userDTO `json:"user"`
}

func toSessionDTO(s service.Session) sessionDTO {
	return sessionDTO{
		AccessToken: s.AccessToken,
		User:        userDTO{ID: s.User.ID, Email: s.User.Email},
	}
}
```

- [ ] **Step 6: Write `auth_handler.go`**

Create `backend/internal/httpapi/auth_handler.go`:

```go
package httpapi

import (
	"net/http"
	"time"

	"journal/internal/service"
)

const refreshCookieName = "refresh_token"

// refreshCookiePath giới hạn cookie chỉ đi kèm request tới /api/auth/*,
// nên nó không bị gửi kèm mọi request dữ liệu.
const refreshCookiePath = "/api/auth"

type AuthHandler struct {
	svc *service.AuthService
	// secure bật cờ Secure của cookie. Tắt ở dev vì dev chạy http.
	secure bool
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	s, err := h.svc.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	s, err := h.svc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.Refresh(r.Context(), h.readRefreshCookie(r))
	if err != nil {
		// Phiên đã chết thì cookie cũng phải đi, nếu không trình duyệt sẽ
		// gửi lại mãi một token không bao giờ dùng được nữa.
		h.clearRefreshCookie(w)
		FailErr(w, r, err)
		return
	}
	h.setRefreshCookie(w, s)
	OK(w, toSessionDTO(s))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Logout(r.Context(), h.readRefreshCookie(r)); err != nil {
		FailErr(w, r, err)
		return
	}
	h.clearRefreshCookie(w)
	OK(w, nil)
}

func (h *AuthHandler) readRefreshCookie(r *http.Request) string {
	c, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, s service.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    s.RefreshToken,
		Path:     refreshCookiePath,
		Expires:  s.RefreshExpiry,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}
```

- [ ] **Step 7: Rewrite `router.go`**

Replace `backend/internal/httpapi/router.go` with:

```go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"journal/internal/auth"
	"journal/internal/service"
)

// Deps là mọi thứ router cần để dựng handler. Các task sau thêm trường vào
// đây; trường nil nghĩa là nhánh route đó không được gắn, nhờ vậy test dựng
// được router tối thiểu.
type Deps struct {
	Auth   *service.AuthService
	Signer *auth.Signer
	Secure bool // bật cờ Secure của cookie; bật ở prod
}

// NewRouter dựng toàn bộ route của API. Mọi nhánh lỗi cũng trả envelope,
// kể cả 404 và 405 — frontend chỉ cần một hàm unwrap duy nhất.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusNotFound, 1404, "không tìm thấy endpoint")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		Fail(w, http.StatusMethodNotAllowed, 1405, "method không được hỗ trợ")
	})

	r.Get("/healthz", Healthz)

	r.Route("/api", func(api chi.Router) {
		if d.Auth != nil {
			h := &AuthHandler{svc: d.Auth, secure: d.Secure}
			api.Route("/auth", func(a chi.Router) {
				a.Post("/register", h.Register)
				a.Post("/login", h.Login)
				a.Post("/refresh", h.Refresh)
				a.Post("/logout", h.Logout)
			})
		}
	})

	return r
}
```

Update every `NewRouter()` call in `backend/internal/httpapi/health_test.go` to `NewRouter(Deps{})` (or `httpapi.NewRouter(httpapi.Deps{})` if that test is an external test package).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/httpapi/... -count=1 -v 2>&1 | tail -40`
Expected: PASS for every test, including the pre-existing health and response tests.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/httpapi
git commit -m "feat(httpapi): add auth endpoints, RequireAuth middleware and refresh cookies"
```

---

### Task 8: AccountRepo and AccountService

**Files:**
- Create: `backend/internal/repository/account.go`, `backend/internal/repository/account_test.go`
- Create: `backend/internal/service/account.go`, `backend/internal/service/account_test.go`

**Interfaces:**
- Consumes: `repository.Open`, `translate`, `ErrNotFound`, `ErrDuplicate` (Task 2); `apperr` (Task 1); `domain.Account` (already exists, tagged in Task 2).
- Produces:
  - `repository.NewAccountRepo(db *gorm.DB) *AccountRepo` with `ListByUser(ctx, userID int64) ([]domain.Account, error)`, `Create(ctx, a domain.Account) (domain.Account, error)`, `ByID(ctx, id int64) (domain.Account, error)`, `Update(ctx, a domain.Account) error`
  - `service.AccountCreate{Code, Name, Currency, Timezone string; InitialBalance, RiskPerTrade decimal.Decimal}`
  - `service.AccountPatch{Code, Name, Currency, Timezone *string; InitialBalance, RiskPerTrade *decimal.Decimal}`
  - `service.NewAccountService(accounts *repository.AccountRepo) *AccountService` with `List(ctx, userID int64) ([]domain.Account, error)`, `Create(ctx, userID int64, in AccountCreate) (domain.Account, error)`, `ForUser(ctx, userID, accountID int64) (domain.Account, error)`, `Update(ctx, userID, accountID int64, p AccountPatch) (domain.Account, error)`

- [ ] **Step 1: Write the failing repository test**

Create `backend/internal/repository/account_test.go`:

```go
package repository_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

func newAccount(userID int64, code string) domain.Account {
	return domain.Account{
		UserID:         userID,
		Code:           code,
		Name:           "Tài khoản chính",
		InitialBalance: decimal.RequireFromString("10000.00"),
		RiskPerTrade:   decimal.RequireFromString("0.0100"),
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

func TestAccountCreateRoiDocLai(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")

	created, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)
	require.NotZero(t, created.ID)

	got, err := accounts.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "ACC1", got.Code)
	require.Equal(t, "Asia/Ho_Chi_Minh", got.Timezone)
	require.True(t, got.InitialBalance.Equal(decimal.RequireFromString("10000")),
		"đọc ra %s", got.InitialBalance)
	require.True(t, got.RiskPerTrade.Equal(decimal.RequireFromString("0.01")),
		"NUMERIC(6,4) phải giữ đúng 0.01, đọc ra %s", got.RiskPerTrade)
	require.True(t, got.OneR().Equal(decimal.RequireFromString("100")),
		"1R = 10000 × 0.01 = 100, tính ra %s", got.OneR())
}

func TestAccountTrungCodeCungUserTraErrDuplicate(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")
	_, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)

	_, err = accounts.Create(ctx, newAccount(userID, "ACC1"))

	require.ErrorIs(t, err, repository.ErrDuplicate)
}

// UNIQUE là (user_id, code), không phải (code): hai user được dùng cùng mã.
func TestAccountTrungCodeKhacUserVanTao(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	a := seedUser(t, users, "a@example.com")
	b := seedUser(t, users, "b@example.com")
	_, err := accounts.Create(ctx, newAccount(a, "ACC1"))
	require.NoError(t, err)

	_, err = accounts.Create(ctx, newAccount(b, "ACC1"))

	require.NoError(t, err)
}

func TestAccountListByUserChiTraCuaUserDo(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	a := seedUser(t, users, "a@example.com")
	b := seedUser(t, users, "b@example.com")
	_, err := accounts.Create(ctx, newAccount(a, "ACC1"))
	require.NoError(t, err)
	_, err = accounts.Create(ctx, newAccount(a, "ACC2"))
	require.NoError(t, err)
	_, err = accounts.Create(ctx, newAccount(b, "CUA-B"))
	require.NoError(t, err)

	list, err := accounts.ListByUser(ctx, a)

	require.NoError(t, err)
	require.Len(t, list, 2)
	require.Equal(t, "ACC1", list[0].Code, "sắp theo id tăng dần")
	require.Equal(t, "ACC2", list[1].Code)
	for _, acc := range list {
		require.Equal(t, a, acc.UserID)
	}
}

func TestAccountUpdateGhiDeTruongDaDoi(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	accounts := repository.NewAccountRepo(db)
	userID := seedUser(t, users, "a@example.com")
	created, err := accounts.Create(ctx, newAccount(userID, "ACC1"))
	require.NoError(t, err)

	created.Name = "Tên mới"
	created.RiskPerTrade = decimal.RequireFromString("0.0200")
	require.NoError(t, accounts.Update(ctx, created))

	got, err := accounts.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "Tên mới", got.Name)
	require.True(t, got.RiskPerTrade.Equal(decimal.RequireFromString("0.02")))
	require.Equal(t, userID, got.UserID, "update không được đổi chủ sở hữu")
}

func TestAccountByIDKhongTonTai(t *testing.T) {
	accounts := repository.NewAccountRepo(testdb.New(t))

	_, err := accounts.ByID(context.Background(), 999)

	require.ErrorIs(t, err, repository.ErrNotFound)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && go test ./internal/repository/... -count=1 -run Account`
Expected: FAIL — `undefined: repository.NewAccountRepo`.

- [ ] **Step 3: Write `account.go` in `repository`**

Create `backend/internal/repository/account.go`:

```go
package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

// AccountRepo dùng thẳng domain.Account: account xuất hiện trong công thức
// nghiệp vụ (OneR, timezone gom nhóm) nên nó là kiểu domain thật sự, khác
// với UserRow vốn thuần hạ tầng.
type AccountRepo struct{ db *gorm.DB }

func NewAccountRepo(db *gorm.DB) *AccountRepo { return &AccountRepo{db: db} }

func (r *AccountRepo) ListByUser(ctx context.Context, userID int64) ([]domain.Account, error) {
	var rows []domain.Account
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

func (r *AccountRepo) Create(ctx context.Context, a domain.Account) (domain.Account, error) {
	if err := r.db.WithContext(ctx).Create(&a).Error; err != nil {
		return domain.Account{}, translate(err)
	}
	return a, nil
}

func (r *AccountRepo) ByID(ctx context.Context, id int64) (domain.Account, error) {
	var a domain.Account
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&a).Error
	return a, translate(err)
}

// Update ghi đè các cột sửa được. user_id, id và created_at cố ý không nằm
// trong danh sách: đổi chủ sở hữu của một account không phải thao tác hợp lệ.
func (r *AccountRepo) Update(ctx context.Context, a domain.Account) error {
	err := r.db.WithContext(ctx).Model(&domain.Account{}).
		Where("id = ?", a.ID).
		Updates(map[string]any{
			"code":            a.Code,
			"name":            a.Name,
			"initial_balance": a.InitialBalance,
			"risk_per_trade":  a.RiskPerTrade,
			"currency":        a.Currency,
			"timezone":        a.Timezone,
			"updated_at":      gorm.Expr("now()"),
		}).Error
	return translate(err)
}
```

- [ ] **Step 4: Write the failing service test**

Create `backend/internal/service/account_test.go`:

```go
package service_test

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

func newAccountService(t *testing.T) (*service.AccountService, int64, int64) {
	t.Helper()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	a, err := users.Create(context.Background(), "a@example.com", "hash")
	require.NoError(t, err)
	b, err := users.Create(context.Background(), "b@example.com", "hash")
	require.NoError(t, err)
	return service.NewAccountService(repository.NewAccountRepo(db)), a.ID, b.ID
}

func validCreate() service.AccountCreate {
	return service.AccountCreate{
		Code:           "ACC1",
		Name:           "Tài khoản chính",
		Currency:       "USD",
		Timezone:       "Asia/Ho_Chi_Minh",
		InitialBalance: decimal.RequireFromString("10000"),
		RiskPerTrade:   decimal.RequireFromString("0.01"),
	}
}

func TestAccountCreateHopLe(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validCreate())

	require.NoError(t, err)
	require.NotZero(t, acc.ID)
	require.Equal(t, userID, acc.UserID)
	require.Equal(t, "ACC1", acc.Code)
}

func TestAccountCreateTuChoiInputHong(t *testing.T) {
	cases := map[string]func(c *service.AccountCreate){
		"code rỗng":            func(c *service.AccountCreate) { c.Code = "" },
		"code quá dài":         func(c *service.AccountCreate) { c.Code = string(make([]byte, 33)) },
		"vốn ban đầu bằng 0":   func(c *service.AccountCreate) { c.InitialBalance = decimal.Zero },
		"vốn ban đầu âm":       func(c *service.AccountCreate) { c.InitialBalance = decimal.RequireFromString("-1") },
		"risk bằng 0":          func(c *service.AccountCreate) { c.RiskPerTrade = decimal.Zero },
		"risk lớn hơn 1":       func(c *service.AccountCreate) { c.RiskPerTrade = decimal.RequireFromString("1.5") },
		"currency rỗng":        func(c *service.AccountCreate) { c.Currency = "" },
		"timezone không tồn tại": func(c *service.AccountCreate) { c.Timezone = "Mars/Phobos" },
		"timezone rỗng":        func(c *service.AccountCreate) { c.Timezone = "" },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			svc, userID, _ := newAccountService(t)
			in := validCreate()
			mangle(&in)

			_, err := svc.Create(context.Background(), userID, in)

			e := apperr.As(err)
			require.NotNil(t, err)
			require.NotNil(t, e, "phải là lỗi nghiệp vụ, không phải lỗi hạ tầng")
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestAccountCreateTrungCodeTra409(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	_, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)

	_, err = svc.Create(ctx, userID, validCreate())

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 409, e.Status)
	require.Equal(t, 1409, e.Code)
}

// ForUser là cổng sở hữu: 404 khi không có, 403 khi của người khác.
func TestForUserPhanBiet404Va403(t *testing.T) {
	ctx := context.Background()
	svc, chuSoHuu, nguoiKhac := newAccountService(t)
	acc, err := svc.Create(ctx, chuSoHuu, validCreate())
	require.NoError(t, err)

	got, err := svc.ForUser(ctx, chuSoHuu, acc.ID)
	require.NoError(t, err)
	require.Equal(t, acc.ID, got.ID)

	_, err = svc.ForUser(ctx, nguoiKhac, acc.ID)
	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)

	_, err = svc.ForUser(ctx, chuSoHuu, 999999)
	e = apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 404, e.Status)
}

// PATCH là partial: trường nil phải giữ nguyên giá trị cũ.
func TestAccountUpdateChiDoiTruongDuocGui(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	tenMoi := "Tên đã đổi"

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Name: &tenMoi})

	require.NoError(t, err)
	require.Equal(t, "Tên đã đổi", updated.Name)
	require.Equal(t, "ACC1", updated.Code, "code không gửi lên thì không được đổi")
	require.True(t, updated.InitialBalance.Equal(decimal.RequireFromString("10000")))
	require.Equal(t, "Asia/Ho_Chi_Minh", updated.Timezone)
}

func TestAccountUpdateVanValidate(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)
	tzHong := "Mars/Phobos"

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{Timezone: &tzHong})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestAccountUpdateCuaNguoiKhacTra403(t *testing.T) {
	ctx := context.Background()
	svc, chuSoHuu, nguoiKhac := newAccountService(t)
	acc, err := svc.Create(ctx, chuSoHuu, validCreate())
	require.NoError(t, err)
	ten := "cướp"

	_, err = svc.Update(ctx, nguoiKhac, acc.ID, service.AccountPatch{Name: &ten})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
}

func TestAccountListChiTraCuaUserDo(t *testing.T) {
	ctx := context.Background()
	svc, a, b := newAccountService(t)
	_, err := svc.Create(ctx, a, validCreate())
	require.NoError(t, err)

	listB, err := svc.List(ctx, b)

	require.NoError(t, err)
	require.Empty(t, listB, "user B không được thấy account của user A")
}
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd backend && go test ./internal/service/... -count=1 -run Account`
Expected: FAIL — `undefined: service.NewAccountService`.

- [ ] **Step 6: Write `account.go` in `service`**

Create `backend/internal/service/account.go`:

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

const maxCodeLen = 32

// AccountCreate là input tạo account. Mọi trường bắt buộc.
type AccountCreate struct {
	Code           string
	Name           string
	Currency       string
	Timezone       string
	InitialBalance decimal.Decimal
	RiskPerTrade   decimal.Decimal
}

// AccountPatch là input sửa account. Trường nil nghĩa là "không đổi".
type AccountPatch struct {
	Code           *string
	Name           *string
	Currency       *string
	Timezone       *string
	InitialBalance *decimal.Decimal
	RiskPerTrade   *decimal.Decimal
}

type AccountService struct{ accounts *repository.AccountRepo }

func NewAccountService(accounts *repository.AccountRepo) *AccountService {
	return &AccountService{accounts: accounts}
}

func (s *AccountService) List(ctx context.Context, userID int64) ([]domain.Account, error) {
	list, err := s.accounts.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê account: %w", err)
	}
	return list, nil
}

func (s *AccountService) Create(ctx context.Context, userID int64, in AccountCreate) (domain.Account, error) {
	a := domain.Account{
		UserID:         userID,
		Code:           strings.TrimSpace(in.Code),
		Name:           strings.TrimSpace(in.Name),
		Currency:       strings.TrimSpace(in.Currency),
		Timezone:       strings.TrimSpace(in.Timezone),
		InitialBalance: in.InitialBalance,
		RiskPerTrade:   in.RiskPerTrade,
	}
	if err := validateAccount(a); err != nil {
		return domain.Account{}, err
	}
	created, err := s.accounts.Create(ctx, a)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.Account{}, apperr.Conflict(fmt.Sprintf("mã tài khoản %q đã tồn tại", a.Code))
		}
		return domain.Account{}, fmt.Errorf("tạo account: %w", err)
	}
	return created, nil
}

// ForUser nạp account và cưỡng chế quyền sở hữu. Đây là hàm mà middleware
// RequireAccount gọi, và là chỗ DUY NHẤT quyết định 404 hay 403.
func (s *AccountService) ForUser(ctx context.Context, userID, accountID int64) (domain.Account, error) {
	a, err := s.accounts.ByID(ctx, accountID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.Account{}, apperr.NotFound("không tìm thấy tài khoản")
		}
		return domain.Account{}, fmt.Errorf("tìm account: %w", err)
	}
	if a.UserID != userID {
		// Spec §7.2 chốt 403 chứ không phải 404, chấp nhận việc này để lộ
		// rằng id đó có tồn tại.
		return domain.Account{}, apperr.Forbidden("tài khoản này không thuộc về bạn")
	}
	return a, nil
}

func (s *AccountService) Update(ctx context.Context, userID, accountID int64, p AccountPatch) (domain.Account, error) {
	a, err := s.ForUser(ctx, userID, accountID)
	if err != nil {
		return domain.Account{}, err
	}

	if p.Code != nil {
		a.Code = strings.TrimSpace(*p.Code)
	}
	if p.Name != nil {
		a.Name = strings.TrimSpace(*p.Name)
	}
	if p.Currency != nil {
		a.Currency = strings.TrimSpace(*p.Currency)
	}
	if p.Timezone != nil {
		a.Timezone = strings.TrimSpace(*p.Timezone)
	}
	if p.InitialBalance != nil {
		a.InitialBalance = *p.InitialBalance
	}
	if p.RiskPerTrade != nil {
		a.RiskPerTrade = *p.RiskPerTrade
	}

	if err := validateAccount(a); err != nil {
		return domain.Account{}, err
	}
	if err := s.accounts.Update(ctx, a); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.Account{}, apperr.Conflict(fmt.Sprintf("mã tài khoản %q đã tồn tại", a.Code))
		}
		return domain.Account{}, fmt.Errorf("sửa account: %w", err)
	}
	return a, nil
}

func validateAccount(a domain.Account) error {
	switch {
	case a.Code == "":
		return apperr.Validation("mã tài khoản không được để trống")
	case len(a.Code) > maxCodeLen:
		return apperr.Validation(fmt.Sprintf("mã tài khoản dài quá %d ký tự", maxCodeLen))
	case a.Currency == "":
		return apperr.Validation("đơn vị tiền tệ không được để trống")
	case len(a.Currency) > 8:
		return apperr.Validation("đơn vị tiền tệ dài quá 8 ký tự")
	case !a.InitialBalance.IsPositive():
		// Vốn ban đầu là mẫu số của net_return_pct và là gốc của 1R.
		return apperr.Validation("vốn ban đầu phải lớn hơn 0")
	case !a.RiskPerTrade.IsPositive() || a.RiskPerTrade.GreaterThan(decimal.NewFromInt(1)):
		return apperr.Validation("rủi ro mỗi lệnh phải nằm trong khoảng (0, 1]")
	}
	// Timezone sai là lỗi âm thầm nguy hiểm nhất ở đây: một tên IANA không
	// hợp lệ làm hỏng mọi phép gom nhóm theo ngày/tuần/tháng mà không báo gì.
	if a.Timezone == "" {
		return apperr.Validation("timezone không được để trống")
	}
	if _, err := time.LoadLocation(a.Timezone); err != nil {
		return apperr.Validation(fmt.Sprintf("timezone %q không phải tên IANA hợp lệ", a.Timezone))
	}
	return nil
}
```

- [ ] **Step 7: Run both suites to verify they pass**

Run: `cd backend && go test ./internal/repository/... ./internal/service/... -count=1 -v 2>&1 | tail -40`
Expected: PASS everywhere. The nine `TestAccountCreateTuChoiInputHong` subtests must all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/repository/account.go backend/internal/repository/account_test.go backend/internal/service/account.go backend/internal/service/account_test.go
git commit -m "feat(service): add account repository and service with ownership gate"
```

---

### Task 9: Account endpoints and the ownership gate over HTTP

This task closes the third deferred debt: account isolation asserted **positively**, not only by the absence of a leak.

**Files:**
- Create: `backend/internal/httpapi/account_handler.go`, `backend/internal/httpapi/account_handler_test.go`
- Modify: `backend/internal/httpapi/dto.go`, `backend/internal/httpapi/middleware.go`, `backend/internal/httpapi/router.go`

**Interfaces:**
- Consumes: `service.AccountService`, `service.AccountCreate`, `service.AccountPatch` (Task 8); `httpapi.Deps`, `RequireAuth`, `UserID`, `FailErr`, `DecodeJSON` (Task 7).
- Produces: `httpapi.RequireAccount(svc *service.AccountService) func(http.Handler) http.Handler`; `httpapi.Account(ctx context.Context) domain.Account`; `Deps` gains `Account *service.AccountService`; routes `GET/POST /api/accounts` and `PATCH /api/accounts/{id}`.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/httpapi/account_handler_test.go`:

```go
package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// twoUserServer dựng server thật với HAI user đã tồn tại, trả access token
// của từng người. Đăng ký chỉ mở cho user đầu tiên nên user thứ hai được tạo
// thẳng qua repository.
func twoUserServer(t *testing.T) (srv *httptest.Server, tokenA, tokenB string) {
	t.Helper()
	db := testdb.New(t)
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	users := repository.NewUserRepo(db)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	authSvc := service.NewAuthService(users, repository.NewRefreshTokenRepo(db), signer, 720*time.Hour)

	srv = httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Auth: authSvc, Account: accountSvc, Signer: signer,
	}))
	t.Cleanup(srv.Close)

	sessionA, err := authSvc.Register(context.Background(), "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)
	userB, err := users.Create(context.Background(), "b@example.com", "hash-gia")
	require.NoError(t, err)
	tokenB, err = signer.SignAccess(userB.ID)
	require.NoError(t, err)
	return srv, sessionA.AccessToken, tokenB
}

func do(t *testing.T, method, url, token, body string) (*http.Response, envelopeBody) {
	t.Helper()
	var rdr *strings.Reader
	if body == "" {
		rdr = strings.NewReader("")
	} else {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var env envelopeBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp, env
}

const bodyACC1 = `{"code":"ACC1","name":"Chính","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}`

func TestTaoAccountRoiLietKe(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)

	// Tiền phải serialize thành CHUỖI, không phải số — spec §5.
	require.Contains(t, string(env.Data), `"initial_balance":"10000"`,
		"tiền phải là chuỗi JSON, thực tế: %s", env.Data)
	require.Contains(t, string(env.Data), `"one_r":"100"`,
		"1R = 10000 × 0.01, thực tế: %s", env.Data)

	listResp, listEnv := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenA, "")
	require.Equal(t, http.StatusOK, listResp.StatusCode)
	var list []struct {
		ID   int64  `json:"id"`
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "ACC1", list[0].Code)
}

func TestKhongCoTokenTra401(t *testing.T) {
	srv, _, _ := twoUserServer(t)

	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/accounts", ""},
		{http.MethodPost, "/api/accounts", bodyACC1},
		{http.MethodPatch, "/api/accounts/1", `{"name":"x"}`},
	} {
		resp, env := do(t, c.method, srv.URL+c.path, "", c.body)
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode, "%s %s", c.method, c.path)
		require.Equal(t, 1401, env.Code)
	}
}

// Cô lập khẳng định DƯƠNG: B không thấy account của A, và A vẫn thấy của A.
func TestUserBKhongThayAccountCuaUserA(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	_, envB := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenB, "")
	var listB []json.RawMessage
	require.NoError(t, json.Unmarshal(envB.Data, &listB))
	require.Empty(t, listB, "B không được thấy account nào")

	_, envA := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenA, "")
	var listA []json.RawMessage
	require.NoError(t, json.Unmarshal(envA.Data, &listA))
	require.Len(t, listA, 1, "A vẫn phải thấy account của mình")
}

func TestUserBSuaAccountCuaUserATra403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	_, envA := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(envA.Data, &created))

	resp, env := do(t, http.MethodPatch,
		srv.URL+"/api/accounts/"+itoa(created.ID), tokenB, `{"name":"cướp"}`)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
}

func TestSuaAccountKhongTonTaiTra404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/999999", tokenA, `{"name":"x"}`)

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, 1404, env.Code)
}

func TestIDKhongPhaiSoTra400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/abc", tokenA, `{"name":"x"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestPatchLaPartial(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, envA := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(envA.Data, &created))

	resp, env := do(t, http.MethodPatch,
		srv.URL+"/api/accounts/"+itoa(created.ID), tokenA, `{"name":"Tên mới"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, string(env.Data), `"name":"Tên mới"`)
	require.Contains(t, string(env.Data), `"code":"ACC1"`, "code không gửi lên thì giữ nguyên")
	require.Contains(t, string(env.Data), `"initial_balance":"10000"`)
}

func TestTaoAccountTimezoneHongTra400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA,
		`{"code":"ACC1","name":"x","currency":"USD","timezone":"Mars/Phobos","initial_balance":"10000","risk_per_trade":"0.01"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.Contains(t, env.Msg, "Mars/Phobos")
}

func TestTaoAccountTrungCodeTra409(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	require.Equal(t, http.StatusConflict, resp.StatusCode)
	require.Equal(t, 1409, env.Code)
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && go test ./internal/httpapi/... -count=1 -run Account`
Expected: FAIL — `unknown field Account in struct literal of type httpapi.Deps`.

- [ ] **Step 3: Add the account DTOs**

Append to `backend/internal/httpapi/dto.go` (add `github.com/shopspring/decimal` and `journal/internal/domain` to its imports):

```go
// decimal.Decimal marshal ra CHUỖI JSON theo mặc định của shopspring/decimal —
// đúng yêu cầu spec §5, và là lý do frontend không mất precision.
type accountDTO struct {
	ID             int64           `json:"id"`
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	InitialBalance decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   decimal.Decimal `json:"risk_per_trade"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	// OneR là trường suy diễn, tính lúc đọc — không có cột trong DB.
	OneR decimal.Decimal `json:"one_r"`
}

func toAccountDTO(a domain.Account) accountDTO {
	return accountDTO{
		ID:             a.ID,
		Code:           a.Code,
		Name:           a.Name,
		InitialBalance: a.InitialBalance,
		RiskPerTrade:   a.RiskPerTrade,
		Currency:       a.Currency,
		Timezone:       a.Timezone,
		OneR:           a.OneR(),
	}
}

func toAccountDTOs(list []domain.Account) []accountDTO {
	// Khởi tạo slice rỗng chứ không nil: JSON phải là [] chứ không phải null.
	out := make([]accountDTO, 0, len(list))
	for _, a := range list {
		out = append(out, toAccountDTO(a))
	}
	return out
}

type accountCreateRequest struct {
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	InitialBalance decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   decimal.Decimal `json:"risk_per_trade"`
}

// Con trỏ nghĩa là "khoá này không có trong body" — PATCH là partial update.
type accountPatchRequest struct {
	Code           *string          `json:"code"`
	Name           *string          `json:"name"`
	Currency       *string          `json:"currency"`
	Timezone       *string          `json:"timezone"`
	InitialBalance *decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   *decimal.Decimal `json:"risk_per_trade"`
}
```

- [ ] **Step 4: Add `RequireAccount` to `middleware.go`**

Append to `backend/internal/httpapi/middleware.go` (add `strconv`, `github.com/go-chi/chi/v5`, `journal/internal/domain`, `journal/internal/service` to its imports):

```go
// RequireAccount nạp account trong URL và cưỡng chế quyền sở hữu.
// Phải mount SAU RequireAuth — nó đọc user id từ context.
func RequireAccount(svc *service.AccountService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
			if err != nil {
				Fail(w, http.StatusBadRequest, 1400, "id tài khoản không hợp lệ")
				return
			}
			acc, err := svc.ForUser(r.Context(), UserID(r.Context()), id)
			if err != nil {
				FailErr(w, r, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyAccount, acc)))
		})
	}
}

// Account lấy account đã kiểm quyền sở hữu. Chỉ gọi được sau RequireAccount.
func Account(ctx context.Context) domain.Account {
	a, _ := ctx.Value(ctxKeyAccount).(domain.Account)
	return a
}
```

- [ ] **Step 5: Write `account_handler.go`**

Create `backend/internal/httpapi/account_handler.go`:

```go
package httpapi

import (
	"net/http"

	"journal/internal/service"
)

type AccountHandler struct{ svc *service.AccountService }

func (h *AccountHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), UserID(r.Context()))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTOs(list))
}

func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req accountCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	acc, err := h.svc.Create(r.Context(), UserID(r.Context()), service.AccountCreate{
		Code:           req.Code,
		Name:           req.Name,
		Currency:       req.Currency,
		Timezone:       req.Timezone,
		InitialBalance: req.InitialBalance,
		RiskPerTrade:   req.RiskPerTrade,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTO(acc))
}

// Update chạy sau RequireAccount, nên quyền sở hữu đã được kiểm; service
// kiểm lại lần nữa vì nó cũng là API dùng được ngoài HTTP.
func (h *AccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req accountPatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	acc, err := h.svc.Update(r.Context(), UserID(r.Context()), Account(r.Context()).ID,
		service.AccountPatch{
			Code:           req.Code,
			Name:           req.Name,
			Currency:       req.Currency,
			Timezone:       req.Timezone,
			InitialBalance: req.InitialBalance,
			RiskPerTrade:   req.RiskPerTrade,
		})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toAccountDTO(acc))
}
```

- [ ] **Step 6: Mount the routes**

In `backend/internal/httpapi/router.go`, add `Account *service.AccountService` to `Deps`, and inside the `r.Route("/api", …)` block after the auth routes add:

```go
		if d.Account != nil && d.Signer != nil {
			ah := &AccountHandler{svc: d.Account}
			api.Group(func(priv chi.Router) {
				priv.Use(RequireAuth(d.Signer))
				priv.Get("/accounts", ah.List)
				priv.Post("/accounts", ah.Create)
				priv.Route("/accounts/{id}", func(one chi.Router) {
					one.Use(RequireAccount(d.Account))
					one.Patch("/", ah.Update)
				})
			})
		}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/httpapi/... -count=1 -v 2>&1 | tail -40`
Expected: PASS for every test in the package.

- [ ] **Step 8: FALSIFY the isolation test**

Temporarily change `ForUser` in `backend/internal/service/account.go` to skip its `a.UserID != userID` check, then run:

Run: `cd backend && go test ./internal/httpapi/... -count=1 -run TestUserBSuaAccountCuaUserATra403`
Expected: FAIL — B successfully patches A's account. Restore the check and confirm it passes. Record the observed failure in the ledger.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/httpapi
git commit -m "feat(httpapi): add account endpoints and RequireAccount ownership gate"
```

---

### Task 10: Cash flows

**Files:**
- Create: `backend/internal/repository/cashflow.go`, `backend/internal/repository/cashflow_test.go`
- Create: `backend/internal/service/cashflow.go`
- Create: `backend/internal/httpapi/cashflow_handler.go`, `backend/internal/httpapi/cashflow_handler_test.go`
- Modify: `backend/internal/domain/models.go` (add `Note` to `CashFlow`), `backend/internal/httpapi/dto.go`, `backend/internal/httpapi/router.go`

**Interfaces:**
- Consumes: `repository` helpers (Task 2), `service.AccountService.ForUser` (Task 8), `RequireAccount`, `Account`, `UserID` (Tasks 7, 9).
- Produces:
  - `repository.NewCashFlowRepo(db *gorm.DB) *CashFlowRepo` with `ListByAccount(ctx, accountID int64) ([]domain.CashFlow, error)`, `Create(ctx, cf domain.CashFlow) (domain.CashFlow, error)`, `ByID(ctx, id int64) (domain.CashFlow, error)`, `DeleteOwned(ctx, id, accountID int64) error`
  - `service.CashFlowCreate{Date string; Amount decimal.Decimal; Type, Note string}`
  - `service.NewCashFlowService(flows *repository.CashFlowRepo, accounts *AccountService) *CashFlowService` with `List(ctx, accountID int64)`, `Create(ctx, accountID int64, in CashFlowCreate)`, `Delete(ctx, userID, flowID int64) error`
  - `Deps` gains `CashFlow *service.CashFlowService`; routes `GET/POST /api/accounts/{id}/cash-flows`, `DELETE /api/cash-flows/{id}`

- [ ] **Step 1: Add `Note` to the domain model**

In `backend/internal/domain/models.go`, add to `CashFlow`:

```go
	Note string `gorm:"column:note"`
```

The column already exists in migration `0001` (`note TEXT NOT NULL DEFAULT ''`); the struct simply never mapped it.

- [ ] **Step 2: Write the failing repository test**

Create `backend/internal/repository/cashflow_test.go`:

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

func seedAccountID(t *testing.T, db *gorm.DB, email, code string) int64 {
	t.Helper()
	userID := seedUser(t, repository.NewUserRepo(db), email)
	acc, err := repository.NewAccountRepo(db).Create(context.Background(), newAccount(userID, code))
	require.NoError(t, err)
	return acc.ID
}

func TestCashFlowCreateVaListTheoNgay(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	for _, d := range []string{"2026-03-10", "2026-01-05", "2026-02-01"} {
		day, err := time.Parse("2006-01-02", d)
		require.NoError(t, err)
		_, err = flows.Create(ctx, domain.CashFlow{
			AccountID: accountID,
			Date:      day,
			Amount:    decimal.RequireFromString("500.00"),
			Type:      "deposit",
			Note:      d,
		})
		require.NoError(t, err)
	}

	list, err := flows.ListByAccount(ctx, accountID)

	require.NoError(t, err)
	require.Len(t, list, 3)
	require.Equal(t, "2026-01-05", list[0].Note, "phải sắp theo ngày tăng dần")
	require.Equal(t, "2026-02-01", list[1].Note)
	require.Equal(t, "2026-03-10", list[2].Note)
	require.True(t, list[0].Amount.Equal(decimal.RequireFromString("500")))
}

// CHECK (amount > 0) nằm ở migration 0001 — repository phải để DB từ chối,
// không được âm thầm cho qua.
func TestCashFlowAmountKhongDuongBiDBTuChoi(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)

	_, err = flows.Create(ctx, domain.CashFlow{
		AccountID: accountID, Date: day, Amount: decimal.Zero, Type: "deposit",
	})

	require.Error(t, err)
}

func TestCashFlowTypeNgoaiDanhSachBiDBTuChoi(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)

	_, err = flows.Create(ctx, domain.CashFlow{
		AccountID: accountID, Date: day, Amount: decimal.NewFromInt(1), Type: "chuyen-khoan",
	})

	require.Error(t, err)
}

// DeleteOwned có account_id trong mệnh đề WHERE, nên không có khe hở giữa
// lúc kiểm quyền và lúc xoá.
func TestDeleteOwnedChiXoaKhiDungAccount(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	flows := repository.NewCashFlowRepo(db)
	cuaA := seedAccountID(t, db, "a@example.com", "ACC1")
	cuaB := seedAccountID(t, db, "b@example.com", "ACC1")
	day, err := time.Parse("2006-01-02", "2026-01-05")
	require.NoError(t, err)
	cf, err := flows.Create(ctx, domain.CashFlow{
		AccountID: cuaA, Date: day, Amount: decimal.NewFromInt(100), Type: "deposit",
	})
	require.NoError(t, err)

	require.ErrorIs(t, flows.DeleteOwned(ctx, cf.ID, cuaB), repository.ErrNotFound)

	still, err := flows.ByID(ctx, cf.ID)
	require.NoError(t, err)
	require.Equal(t, cuaA, still.AccountID)

	require.NoError(t, flows.DeleteOwned(ctx, cf.ID, cuaA))
	_, err = flows.ByID(ctx, cf.ID)
	require.ErrorIs(t, err, repository.ErrNotFound)

	// Xoá cứng: gọi lại là không tìm thấy, KHÔNG phải soft delete.
	require.ErrorIs(t, flows.DeleteOwned(ctx, cf.ID, cuaA), repository.ErrNotFound)
}
```

Add `"gorm.io/gorm"` to that file's imports.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && go test ./internal/repository/... -count=1 -run CashFlow`
Expected: FAIL — `undefined: repository.NewCashFlowRepo`.

- [ ] **Step 4: Write `cashflow.go` in `repository`**

Create `backend/internal/repository/cashflow.go`:

```go
package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type CashFlowRepo struct{ db *gorm.DB }

func NewCashFlowRepo(db *gorm.DB) *CashFlowRepo { return &CashFlowRepo{db: db} }

func (r *CashFlowRepo) ListByAccount(ctx context.Context, accountID int64) ([]domain.CashFlow, error) {
	var rows []domain.CashFlow
	err := r.db.WithContext(ctx).
		Where("account_id = ?", accountID).
		Order("date ASC, id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

func (r *CashFlowRepo) Create(ctx context.Context, cf domain.CashFlow) (domain.CashFlow, error) {
	if err := r.db.WithContext(ctx).Create(&cf).Error; err != nil {
		return domain.CashFlow{}, translate(err)
	}
	return cf, nil
}

func (r *CashFlowRepo) ByID(ctx context.Context, id int64) (domain.CashFlow, error) {
	var cf domain.CashFlow
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&cf).Error
	return cf, translate(err)
}

// DeleteOwned xoá CỨNG. cash_flows không có deleted_at: quy tắc soft delete
// chỉ áp cho trades, vì xoá cứng lệnh làm sai đường equity, còn cash flow
// không nằm trong dãy lũy kế theo stt.
//
// account_id nằm ngay trong WHERE nên không có khe hở giữa lúc kiểm quyền
// sở hữu và lúc xoá.
func (r *CashFlowRepo) DeleteOwned(ctx context.Context, id, accountID int64) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND account_id = ?", id, accountID).
		Delete(&domain.CashFlow{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
```

- [ ] **Step 5: Write `cashflow.go` in `service`**

Create `backend/internal/service/cashflow.go`:

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

const dateLayout = "2006-01-02"

type CashFlowCreate struct {
	Date   string // YYYY-MM-DD
	Amount decimal.Decimal
	Type   string // "deposit" | "withdraw"
	Note   string
}

type CashFlowService struct {
	flows    *repository.CashFlowRepo
	accounts *AccountService
}

func NewCashFlowService(flows *repository.CashFlowRepo, accounts *AccountService) *CashFlowService {
	return &CashFlowService{flows: flows, accounts: accounts}
}

func (s *CashFlowService) List(ctx context.Context, accountID int64) ([]domain.CashFlow, error) {
	list, err := s.flows.ListByAccount(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return list, nil
}

func (s *CashFlowService) Create(ctx context.Context, accountID int64, in CashFlowCreate) (domain.CashFlow, error) {
	day, err := time.Parse(dateLayout, strings.TrimSpace(in.Date))
	if err != nil {
		return domain.CashFlow{}, apperr.Validation("ngày phải theo định dạng YYYY-MM-DD")
	}
	if !in.Amount.IsPositive() {
		// Chiều tiền nằm ở Type, nên số tiền luôn dương — trùng với
		// CHECK (amount > 0) của migration 0001.
		return domain.CashFlow{}, apperr.Validation("số tiền phải lớn hơn 0")
	}
	if !domain.Valid(domain.CashFlowTypes, in.Type) {
		return domain.CashFlow{}, apperr.Validation(`loại phải là "deposit" hoặc "withdraw"`)
	}

	created, err := s.flows.Create(ctx, domain.CashFlow{
		AccountID: accountID,
		Date:      day,
		Amount:    in.Amount,
		Type:      in.Type,
		Note:      strings.TrimSpace(in.Note),
	})
	if err != nil {
		return domain.CashFlow{}, fmt.Errorf("tạo cash flow: %w", err)
	}
	return created, nil
}

// Delete tự kiểm quyền sở hữu vì URL /api/cash-flows/{id} không có account id
// nên không dùng được middleware RequireAccount.
func (s *CashFlowService) Delete(ctx context.Context, userID, flowID int64) error {
	cf, err := s.flows.ByID(ctx, flowID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy giao dịch tiền")
		}
		return fmt.Errorf("tìm cash flow: %w", err)
	}
	// ForUser trả 403 khi account thuộc user khác, 404 khi account không có.
	if _, err := s.accounts.ForUser(ctx, userID, cf.AccountID); err != nil {
		return err
	}
	if err := s.flows.DeleteOwned(ctx, flowID, cf.AccountID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy giao dịch tiền")
		}
		return fmt.Errorf("xoá cash flow: %w", err)
	}
	return nil
}
```

Note: `domain.Valid` and `domain.CashFlowTypes` are added in Task 11. Add them now as part of this step so this task compiles — in `backend/internal/domain/enums.go`:

```go
// Loại giao dịch tiền — khớp CHECK constraint của migration 0001.
const (
	CashFlowDeposit  = "deposit"
	CashFlowWithdraw = "withdraw"
)

var CashFlowTypes = []string{CashFlowDeposit, CashFlowWithdraw}

// Valid kiểm một giá trị có nằm trong danh sách hợp lệ không.
func Valid(allowed []string, v string) bool {
	for _, a := range allowed {
		if a == v {
			return true
		}
	}
	return false
}
```

- [ ] **Step 6: Write the handler and its test**

Create `backend/internal/httpapi/cashflow_handler.go`:

```go
package httpapi

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"journal/internal/service"
)

type CashFlowHandler struct{ svc *service.CashFlowService }

func (h *CashFlowHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), Account(r.Context()).ID)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toCashFlowDTOs(list))
}

func (h *CashFlowHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req cashFlowCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	cf, err := h.svc.Create(r.Context(), Account(r.Context()).ID, service.CashFlowCreate{
		Date:   req.Date,
		Amount: req.Amount,
		Type:   req.Type,
		Note:   req.Note,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toCashFlowDTO(cf))
}

// Delete không đi qua RequireAccount: URL không có account id, nên service tự
// nạp cash flow rồi kiểm quyền sở hữu qua account của nó.
func (h *CashFlowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		Fail(w, http.StatusBadRequest, 1400, "id giao dịch tiền không hợp lệ")
		return
	}
	if err := h.svc.Delete(r.Context(), UserID(r.Context()), id); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
```

Append to `backend/internal/httpapi/dto.go`:

```go
type cashFlowDTO struct {
	ID     int64           `json:"id"`
	Date   string          `json:"date"` // YYYY-MM-DD
	Amount decimal.Decimal `json:"amount"`
	Type   string          `json:"type"`
	Note   string          `json:"note"`
}

func toCashFlowDTO(cf domain.CashFlow) cashFlowDTO {
	return cashFlowDTO{
		ID:     cf.ID,
		Date:   cf.Date.Format("2006-01-02"),
		Amount: cf.Amount,
		Type:   cf.Type,
		Note:   cf.Note,
	}
}

func toCashFlowDTOs(list []domain.CashFlow) []cashFlowDTO {
	out := make([]cashFlowDTO, 0, len(list))
	for _, cf := range list {
		out = append(out, toCashFlowDTO(cf))
	}
	return out
}

type cashFlowCreateRequest struct {
	Date   string          `json:"date"`
	Amount decimal.Decimal `json:"amount"`
	Type   string          `json:"type"`
	Note   string          `json:"note"`
}
```

Create `backend/internal/httpapi/cashflow_handler_test.go`:

```go
package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func createAccount(t *testing.T, srvURL, token string) int64 {
	t.Helper()
	_, env := do(t, http.MethodPost, srvURL+"/api/accounts", token, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))
	require.NotZero(t, created.ID)
	return created.ID
}

func TestCashFlowTaoRoiLietKe(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	resp, env := do(t, http.MethodPost, path, tokenA,
		`{"date":"2026-03-01","amount":"1500.50","type":"deposit","note":"nạp thêm"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, string(env.Data), `"amount":"1500.5"`,
		"tiền phải là chuỗi, thực tế: %s", env.Data)
	require.Contains(t, string(env.Data), `"date":"2026-03-01"`)

	listResp, listEnv := do(t, http.MethodGet, path, tokenA, "")
	require.Equal(t, http.StatusOK, listResp.StatusCode)
	var list []struct {
		ID   int64  `json:"id"`
		Note string `json:"note"`
	}
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "nạp thêm", list[0].Note)
}

func TestCashFlowInputHongTra400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	cases := map[string]string{
		"ngày sai định dạng": `{"date":"01/03/2026","amount":"100","type":"deposit","note":""}`,
		"số tiền bằng 0":     `{"date":"2026-03-01","amount":"0","type":"deposit","note":""}`,
		"số tiền âm":         `{"date":"2026-03-01","amount":"-5","type":"deposit","note":""}`,
		"loại lạ":            `{"date":"2026-03-01","amount":"100","type":"chuyen-khoan","note":""}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			resp, env := do(t, http.MethodPost, path, tokenA, body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)
			require.Equal(t, 1400, env.Code)
		})
	}
}

func TestCashFlowCuaAccountNguoiKhacTra403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	path := srv.URL + "/api/accounts/" + itoa(accID) + "/cash-flows"

	resp, env := do(t, http.MethodGet, path, tokenB, "")

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
}

// DELETE /api/cash-flows/{id} không có account id trên URL — đường kiểm quyền
// riêng của nó phải chặn được người khác.
func TestXoaCashFlowCuaNguoiKhacTra403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	_, env := do(t, http.MethodPost,
		srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA,
		`{"date":"2026-03-01","amount":"100","type":"deposit","note":""}`)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))

	resp, delEnv := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenB, "")
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, delEnv.Code)

	// Và bản ghi vẫn còn.
	_, listEnv := do(t, http.MethodGet, srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA, "")
	var list []json.RawMessage
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1, "cash flow không được bị xoá bởi người khác")
}

func TestXoaCashFlowCuaMinhRoiXoaLaiTra404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	accID := createAccount(t, srv.URL, tokenA)
	_, env := do(t, http.MethodPost,
		srv.URL+"/api/accounts/"+itoa(accID)+"/cash-flows", tokenA,
		`{"date":"2026-03-01","amount":"100","type":"deposit","note":""}`)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))

	resp, _ := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	again, againEnv := do(t, http.MethodDelete, srv.URL+"/api/cash-flows/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusNotFound, again.StatusCode, "xoá cứng: gọi lại phải 404")
	require.Equal(t, 1404, againEnv.Code)
}
```

- [ ] **Step 7: Mount the routes**

In `backend/internal/httpapi/router.go`, add `CashFlow *service.CashFlowService` to `Deps`, then inside the `priv.Route("/accounts/{id}", …)` block add:

```go
					one.Get("/cash-flows", cf.List)
					one.Post("/cash-flows", cf.Create)
```

and after the `priv.Route` block add:

```go
				priv.Delete("/cash-flows/{id}", cf.Delete)
```

declaring `cf := &CashFlowHandler{svc: d.CashFlow}` alongside `ah`. Guard the whole `priv.Group` on `d.Account != nil && d.CashFlow != nil && d.Signer != nil`.

Update `twoUserServer` in `account_handler_test.go` to pass `CashFlow: service.NewCashFlowService(repository.NewCashFlowRepo(db), accountSvc)` in `Deps`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && go test ./... -count=1 -timeout 300s`
Expected: PASS for every package.

- [ ] **Step 9: Commit**

```bash
git add backend/internal
git commit -m "feat: add cash flow repository, service and endpoints"
```

---

### Task 11: Enum allowlists, `/api/meta/enums`, CORS, and full wiring

Finishing task: the API becomes runnable end to end and the Phase 1 review's readiness gaps (missing enum allowlists, missing `lint` target) are closed.

**Files:**
- Modify: `backend/internal/domain/enums.go`, `backend/internal/domain/enums_test.go` (create if absent)
- Create: `backend/internal/httpapi/meta_handler.go`, `backend/internal/httpapi/meta_handler_test.go`
- Modify: `backend/internal/httpapi/middleware.go`, `backend/internal/httpapi/router.go`
- Modify: `backend/cmd/api/main.go`, `Makefile`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: `domain.Directions/EntryQualities/InTradeQualities/ExitQualities/Psychologies/TradeClasses []string`; `httpapi.CORS(origins []string) func(http.Handler) http.Handler`; `Deps` gains `CORSOrigins []string`; route `GET /api/meta/enums` (no auth — it is static reference data the login screen may need).

- [ ] **Step 1: Write the failing enum test**

Create `backend/internal/domain/enums_test.go` (or append if it exists):

```go
package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// Các chuỗi dưới đây được chép NGUYÊN VĂN từ trading-journal-plan.md §1.
// Chúng là key chấm điểm: sai một dấu là sai điểm của toàn bộ lịch sử.
// Test này cố ý viết lại chuỗi thay vì tham chiếu hằng số — so hằng số với
// chính nó thì không kiểm được gì.
func TestDanhSachEnumKhopPlanMuc1(t *testing.T) {
	require.Equal(t, []string{"Long", "Short"}, domain.Directions)
	require.Equal(t, []string{"M1", "M5", "M15", "M30", "H1", "H4", "D1", "W"}, domain.Timeframes)
	require.Equal(t,
		[]string{"Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"},
		domain.EntryQualities)
	require.Equal(t,
		[]string{"Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"},
		domain.InTradeQualities)
	require.Equal(t,
		[]string{"Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"},
		domain.ExitQualities)
	require.Equal(t,
		[]string{"Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG"},
		domain.Psychologies)
	require.Equal(t,
		[]string{"CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện", "Bốc đồng / FOMO", "Giao dịch trả thù"},
		domain.TradeClasses)
	require.Equal(t, []string{"deposit", "withdraw"}, domain.CashFlowTypes)
	require.Equal(t, "KHÔNG CÓ SETUP", domain.DefaultSetup)
}

func TestValid(t *testing.T) {
	require.True(t, domain.Valid(domain.Directions, "Long"))
	require.False(t, domain.Valid(domain.Directions, "long"), "phân biệt hoa thường")
	require.False(t, domain.Valid(domain.Directions, ""))
	require.False(t, domain.Valid(nil, "Long"))
}
```

Create `backend/internal/httpapi/meta_handler_test.go`:

```go
package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/httpapi"
)

// /api/meta/enums là dữ liệu tham chiếu tĩnh: không cần đăng nhập, và không
// cần DB — nên nó dựng được từ Deps rỗng.
func TestMetaEnumsKhongCanAuth(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var env struct {
		Code int `json:"code"`
		Data struct {
			Directions    []string `json:"directions"`
			Psychologies  []string `json:"psychologies"`
			CashFlowTypes []string `json:"cash_flow_types"`
			DefaultSetup  string   `json:"default_setup"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	require.Equal(t, 0, env.Code)
	require.Equal(t, domain.Directions, env.Data.Directions)
	require.Equal(t, domain.Psychologies, env.Data.Psychologies)
	require.Equal(t, domain.CashFlowTypes, env.Data.CashFlowTypes)
	require.Equal(t, domain.DefaultSetup, env.Data.DefaultSetup)
}

func TestCORSChiChoOriginTrongDanhSach(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		CORSOrigins: []string{"https://duoc-phep.example"},
	}))
	defer srv.Close()

	cases := map[string]struct {
		origin     string
		wantHeader string
	}{
		"origin được phép":     {"https://duoc-phep.example", "https://duoc-phep.example"},
		"origin không được phép": {"https://ke-tan-cong.example", ""},
		"không có origin":       {"", ""},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/meta/enums", nil)
			require.NoError(t, err)
			if c.origin != "" {
				req.Header.Set("Origin", c.origin)
			}
			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			defer func() { _ = resp.Body.Close() }()

			require.Equal(t, c.wantHeader, resp.Header.Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestCORSPreflightTra204(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		CORSOrigins: []string{"https://duoc-phep.example"},
	}))
	defer srv.Close()
	req, err := http.NewRequest(http.MethodOptions, srv.URL+"/api/accounts", nil)
	require.NoError(t, err)
	req.Header.Set("Origin", "https://duoc-phep.example")
	req.Header.Set("Access-Control-Request-Method", "POST")

	resp, err := http.DefaultClient.Do(req)

	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	require.Equal(t, "https://duoc-phep.example", resp.Header.Get("Access-Control-Allow-Origin"))
	require.Contains(t, resp.Header.Get("Access-Control-Allow-Headers"), "Authorization")
	require.Equal(t, "true", resp.Header.Get("Access-Control-Allow-Credentials"))
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && go test ./internal/domain/... ./internal/httpapi/... -count=1 -run 'Enum|Valid|CORS|Meta'`
Expected: FAIL — `undefined: domain.Directions`, `unknown field CORSOrigins`.

- [ ] **Step 3: Complete the enum allowlists**

Append to `backend/internal/domain/enums.go` (the `CashFlowDeposit`/`CashFlowWithdraw`/`CashFlowTypes`/`Valid` block was added in Task 10 — do not duplicate it):

```go
// Danh sách hợp lệ, dùng để validate input và để /api/meta/enums cấp dropdown
// cho frontend. Thứ tự là thứ tự hiển thị.
var (
	Directions       = []string{DirectionLong, DirectionShort}
	EntryQualities   = []string{EntryPlanned, EntryTooEarly, EntryTooLate, EntryImpulse}
	InTradeQualities = []string{InTradeFollowed, InTradeMovedTP, InTradeMovedSL, InTradeWantExit}
	ExitQualities    = []string{ExitHitTP, ExitHitSL, ExitTechnical, ExitEmotional}
	Psychologies     = []string{
		PsychNoError, PsychFOMO, PsychFear, PsychHope,
		PsychGreed, PsychRevenge, PsychAlwaysRight,
	}
	TradeClasses = []string{
		ClassNotEvaluated, ClassPlanned, ClassNeedsWork, ClassImpulsive, ClassRevenge,
	}
)
```

- [ ] **Step 4: Write the meta handler**

Create `backend/internal/httpapi/meta_handler.go`:

```go
package httpapi

import (
	"net/http"

	"journal/internal/domain"
)

// MetaEnums cấp toàn bộ enum §1 cho dropdown của frontend, để frontend không
// phải chép lại các chuỗi tiếng Việt vốn là key chấm điểm.
//
// Không yêu cầu đăng nhập: đây là dữ liệu tham chiếu tĩnh, không lộ gì.
func MetaEnums(w http.ResponseWriter, _ *http.Request) {
	OK(w, map[string]any{
		"directions":         domain.Directions,
		"timeframes":         domain.Timeframes,
		"entry_qualities":    domain.EntryQualities,
		"in_trade_qualities": domain.InTradeQualities,
		"exit_qualities":     domain.ExitQualities,
		"psychologies":       domain.Psychologies,
		"trade_classes":      domain.TradeClasses,
		"cash_flow_types":    domain.CashFlowTypes,
		"weekdays":           domain.Weekdays,
		"default_setup":      domain.DefaultSetup,
	})
}
```

- [ ] **Step 5: Write the CORS middleware**

Append to `backend/internal/httpapi/middleware.go`:

```go
// CORS chỉ cho phép origin nằm trong danh sách. Danh sách rỗng nghĩa là
// không cho origin ngoài nào — dev đi qua proxy của Vite nên không chạm CORS,
// whitelist chỉ dành cho trường hợp deploy tách domain.
func CORS(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[origin] {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				// Vary: cache trung gian không được trộn response của hai origin.
				h.Add("Vary", "Origin")
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 6: Finish the router**

In `backend/internal/httpapi/router.go`: add `CORSOrigins []string` to `Deps`, add `r.Use(CORS(d.CORSOrigins))` to the middleware chain right after `middleware.Recoverer`, and inside `r.Route("/api", …)` add:

```go
		api.Get("/meta/enums", MetaEnums)
```

- [ ] **Step 7: Wire `main.go`**

`backend/cmd/api/main.go` builds the whole graph. Keep `_ "time/tzdata"`:

```go
	db, err := repository.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("kết nối database: %v", err)
	}

	signer := auth.NewSigner(cfg.JWTSecret, cfg.AccessTTL)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	deps := httpapi.Deps{
		Auth: service.NewAuthService(
			repository.NewUserRepo(db),
			repository.NewRefreshTokenRepo(db),
			signer,
			cfg.RefreshTTL,
		),
		Account:  accountSvc,
		CashFlow: service.NewCashFlowService(repository.NewCashFlowRepo(db), accountSvc),
		Signer:   signer,
		// Cookie Secure chỉ bật ở prod: dev chạy http nên bật lên là trình
		// duyệt lặng lẽ bỏ cookie.
		Secure:      cfg.Env == "prod",
		CORSOrigins: cfg.CORSOrigins,
	}
```

Pass `deps` to `httpapi.NewRouter`.

- [ ] **Step 8: Add the `lint` target**

In the `Makefile`, add `lint` to `.PHONY` and append:

```make
# lint: gofmt + vet. Cố ý không thêm golangci-lint để khỏi thêm phụ thuộc
# và khỏi thêm một bước cài đặt vào CI.
lint:
	@cd backend && test -z "$$(gofmt -l .)" || (echo "gofmt còn file chưa format:"; gofmt -l .; exit 1)
	cd backend && go vet ./...
```

Add a `Lint` step to `.github/workflows/ci.yml` before `Test`:

```yaml
      - name: Lint
        run: make lint
```

- [ ] **Step 9: Run everything**

Run: `make lint && make test && make test-pure`
Expected: lint clean; every package passes; `test-pure` finishes in about a second without Docker.

- [ ] **Step 10: Verify the whole loop against a real stack**

Run:

```bash
cp -n .env.example .env
docker compose up -d --build
sleep 5

BASE=http://localhost:8000/api

# 1. User đầu tiên đăng ký được.
curl -s -c /tmp/jar -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"toi@example.com","password":"mat-khau-du-dai"}'

# 2. Người thứ hai thì không.
curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ke-khac@example.com","password":"mat-khau-du-dai"}'

# 3. Đăng nhập lấy access token.
TOKEN=$(curl -s -c /tmp/jar -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"toi@example.com","password":"mat-khau-du-dai"}' \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

# 4. Tạo account.
curl -s -X POST $BASE/accounts -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"ACC1","name":"Chính","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}'

# 5. Thêm cash flow.
curl -s -X POST $BASE/accounts/1/cash-flows -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-03-01","amount":"500","type":"deposit","note":"nạp thêm"}'

# 6. Enum cho dropdown.
curl -s $BASE/meta/enums

# 7. Refresh xoay vòng cookie.
cp /tmp/jar /tmp/jar-cu
curl -s -b /tmp/jar -c /tmp/jar -X POST $BASE/auth/refresh

# 8. Gửi lại cookie CŨ: phải 401, và phiên hợp lệ cũng chết theo.
curl -s -b /tmp/jar-cu -X POST $BASE/auth/refresh
curl -s -b /tmp/jar    -X POST $BASE/auth/refresh

# 9. Logout.
curl -s -b /tmp/jar -X POST $BASE/auth/logout

docker compose down
```

Expected, in order: step 1 returns `"code":0` with an `access_token`; step 2 returns `"code":1403` with `đã có tài khoản, đăng ký đã đóng`; step 4 returns the account with `"initial_balance":"10000"` and `"one_r":"100"` as **strings**; step 5 returns the cash flow; step 6 lists every enum; step 7 returns `"code":0`; **both** calls in step 8 return `"code":1401`; step 9 returns `"code":0`. Paste the real output into the ledger.

- [ ] **Step 11: Commit**

```bash
git add backend Makefile .github/workflows/ci.yml
git commit -m "feat: add enum allowlists, meta endpoint, CORS and full API wiring"
```

---

## Verification checklist for the whole plan

Run before declaring Phase 2a done, and paste real output:

- [ ] `make lint` — clean
- [ ] `make test` — all packages pass
- [ ] `make test-pure` — passes in about a second, **without Docker running**
- [ ] `cd backend && go test ./internal/aggregate/... -run TestBaPackageLoiPhaiThuan -v` — the purity test still passes; `scoring`, `metrics` and `aggregate` were never touched by this plan
- [ ] `git diff --stat 800568a..HEAD -- backend/internal/scoring backend/internal/metrics backend/internal/aggregate` — **empty**
- [ ] The Task 11 Step 10 curl walkthrough — every step matches its expected output
- [ ] All three deferred Phase 1 debts closed: NULL round-trip (Task 2), refresh replay end-to-end (Tasks 6 and 7), account isolation asserted positively (Task 9)
