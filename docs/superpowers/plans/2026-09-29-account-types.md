# Loại tài khoản, vòng thi quỹ và làm lại trang Tài khoản — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account có loại Cá nhân / Quỹ; account quỹ mang vòng (Vòng 1, Vòng 2, Funded), trạng thái (Đang thi, Đã qua, Thất bại), tên quỹ, mục tiêu lợi nhuận và max drawdown; trang `/accounts` đổi từ bảng sang danh sách chia nhóm có thanh vòng thi.

**Architecture:** Sáu cột mới trên `accounts` (migration 0006) với CHECK constraint giữ hình dạng dữ liệu. Luật chuẩn hoá + validate nằm ở `domain` (thuần), service gọi chúng. Tiến độ thi (`profit_pct`, `target_progress`, `drawdown_pct`, `drawdown_usage`) là trường suy diễn tính trong `metrics.ComputeChallenge` trên toàn bộ lệnh, trả qua `/stats`. Frontend tách hàm thuần (`challenge.ts`) khỏi component; trang gọi `/stats` không filter cho từng account bằng `useQueries`.

**Tech Stack:** Go 1.23 · chi · GORM · PostgreSQL 16 · Vite + React 19 + TypeScript · TanStack Query v5 · shadcn/ui · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-09-29-account-types-design.md`

## Global Constraints

- **Tiền là `decimal.Decimal`, không bao giờ `float64`.** DB dùng `NUMERIC`. Tỷ lệ (`profit_target`, `max_drawdown_limit`) lưu dạng **phân số** `NUMERIC(6,4)`, giống `risk_per_trade`: `0.1` = 10%.
- **Không lưu trường suy diễn.** `profit_pct`, `target_progress`, `drawdown_pct`, `drawdown_usage` tính lúc đọc, không có cột.
- **`internal/metrics` là package thuần** — cấm import GORM, `net/http`, `database/sql`, `context`.
- **Tiến độ thi KHÔNG chịu bộ lọc** — cùng ngoại lệ với `current_balance` (CLAUDE.md quy tắc 8): tính trên `all`, không phải `filtered`.
- **Code tiếng Anh, comment tiếng Việt.** Định danh, key JSON, tên cột, route, chuỗi test viết tiếng Anh. Ngoại lệ: thông điệp validation của service hiển thị thẳng cho người dùng tiếng Việt (ApiError.msg), nên viết tiếng Việt như `service/account.go` đang làm.
- **Giá trị enum mới là ASCII và KHÔNG phải key chấm điểm:** `personal`/`prop`, `phase_1`/`phase_2`/`funded`, `in_progress`/`passed`/`failed`. Nhãn nằm ở `frontend/src/i18n/enumLabels.ts`; danh sách giá trị cấp qua `/meta/enums`.
- **i18n nội suy MỘT ngoặc `{n}`**, không phải `{{n}}`. Test chạm chuỗi có tham số phải assert chuỗi đã nội suy.
- **Theme:** chỉ dùng biến ngữ nghĩa (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`). Không hex, không `shadow-*`. Lãi/đã qua = `--primary`, lỗ/thất bại = `--status-error`.
- **Không ép tiền sang số** (`Number(`, `parseFloat(`, `parseInt(` bị `styleguard.test.ts` cấm). Độ rộng thanh đo dựng bằng chuỗi (`meterWidth`), không qua `toPlot`.
- **Không commit.** Mỗi task kết thúc ở "test pass"; để thay đổi trong working tree, chủ repo tự review và commit.
- **Node cho frontend:** `~/.nvm/versions/node/v22.15.0/bin` (`.nvmrc` = 22.15.0) — node mặc định của shell là v16 và làm `tsc` chết. Mọi lệnh `npx`/`npm` dưới đây chạy với `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH`.
- Chạy test: `make test` (Go, cần Docker) · `make test-pure` (Go thuần, không Docker) · `cd frontend && npx tsc --noEmit && npm run test && npm run build` (FE).

## Review Focus

1. **Dữ liệu cũ sau migration** — mọi account đang có phải thành `personal`, đọc/sửa bình thường, và một `domain.Account{}` dựng tay (không đi qua service, như các test seed) vẫn INSERT được. → Task 2, sub-test "Create với Type rỗng đọc lại là personal" trong store contract (chạy cả in-memory lẫn Postgres).
2. **Lên vòng mà trạng thái cũ là `passed`** — PATCH chỉ gửi `challenge_phase` phải đưa trạng thái về `in_progress`, nếu không Funded sẽ mang `passed` và bị DB từ chối bằng lỗi 500 khó hiểu. → Task 3, `TestAccountUpdatePhaseChangeResetsStatus`; Task 10 dựa vào hành vi này.
3. **Xoá trống mục tiêu/giới hạn khi sửa** — ô để trống phải gửi `null` và backend phải xoá thật (Tristate), không giữ số cũ. → Task 4 `TestPatchNullClearsProfitTarget`, Task 9 test "xoá trống mục tiêu gửi null".
4. **Account quỹ chưa có lệnh / lãi âm / vượt mục tiêu** — thanh đo không được vỡ (âm → 0%, > 100% → 100%), không NaN. → Task 5 `TestComputeChallengeNoTrades`, Task 6 `meterWidth` table test.
5. **Trang có account nhưng meta/stats chưa về hoặc lỗi** — trang vẫn hiện danh tính và nút, chỉ thiếu thanh vòng/số dư; không trắng trang. → Task 8 test "stats lỗi vẫn hiện account".

---

### Task 1: Hằng số, trường model và luật thử thách ở `domain`

**Files:**
- Modify: `backend/internal/domain/models.go` (struct `Account`)
- Create: `backend/internal/domain/account_rules.go`
- Create: `backend/internal/domain/account_rules_test.go`

**Interfaces:**
- Consumes: `domain.Valid(allowed []string, v string) bool` (có sẵn ở `enums.go`)
- Produces:
  - Hằng `domain.AccountPersonal = "personal"`, `domain.AccountProp = "prop"`
  - Hằng `domain.PhaseOne = "phase_1"`, `domain.PhaseTwo = "phase_2"`, `domain.PhaseFunded = "funded"`
  - Hằng `domain.ChallengeInProgress = "in_progress"`, `domain.ChallengePassed = "passed"`, `domain.ChallengeFailed = "failed"`
  - `var domain.AccountTypes, domain.ChallengePhases, domain.ChallengeStatuses []string`
  - `const domain.MaxPropFirmLen = 64`
  - Trường mới của `domain.Account`: `Type string`, `PropFirm string`, `ChallengePhase *string`, `ChallengeStatus *string`, `ProfitTarget *decimal.Decimal`, `MaxDrawdownLimit *decimal.Decimal`
  - `func (a *Account) NormalizeChallenge()`
  - `func (a Account) ValidateChallenge() error`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/internal/domain/account_rules_test.go`:

```go
package domain_test

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func accStr(s string) *string { return &s }

func accDec(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func propAccount() domain.Account {
	return domain.Account{
		Type:            domain.AccountProp,
		PropFirm:        "FTMO",
		ChallengePhase:  accStr(domain.PhaseOne),
		ChallengeStatus: accStr(domain.ChallengeInProgress),
	}
}

func TestNormalizeChallenge(t *testing.T) {
	t.Run("empty type becomes personal", func(t *testing.T) {
		a := domain.Account{}
		a.NormalizeChallenge()
		require.Equal(t, domain.AccountPersonal, a.Type)
	})

	t.Run("personal clears every challenge field", func(t *testing.T) {
		a := propAccount()
		a.Type = domain.AccountPersonal
		a.ProfitTarget = accDec("0.1")
		a.MaxDrawdownLimit = accDec("0.1")

		a.NormalizeChallenge()

		require.Equal(t, "", a.PropFirm)
		require.Nil(t, a.ChallengePhase)
		require.Nil(t, a.ChallengeStatus)
		require.Nil(t, a.ProfitTarget)
		require.Nil(t, a.MaxDrawdownLimit)
	})

	t.Run("prop without phase starts at phase 1 in progress", func(t *testing.T) {
		a := domain.Account{Type: domain.AccountProp}
		a.NormalizeChallenge()
		require.Equal(t, domain.PhaseOne, *a.ChallengePhase)
		require.Equal(t, domain.ChallengeInProgress, *a.ChallengeStatus)
	})

	t.Run("prop keeps what was sent", func(t *testing.T) {
		a := propAccount()
		a.ChallengePhase = accStr(domain.PhaseFunded)
		a.ChallengeStatus = accStr(domain.ChallengeFailed)

		a.NormalizeChallenge()

		require.Equal(t, domain.PhaseFunded, *a.ChallengePhase)
		require.Equal(t, domain.ChallengeFailed, *a.ChallengeStatus)
		require.Equal(t, "FTMO", a.PropFirm)
	})
}

func TestValidateChallenge(t *testing.T) {
	tests := []struct {
		name    string
		mangle  func(a *domain.Account)
		wantErr bool
	}{
		{"valid prop", func(a *domain.Account) {}, false},
		{"personal is valid", func(a *domain.Account) { *a = domain.Account{Type: domain.AccountPersonal} }, false},
		{"unknown type", func(a *domain.Account) { a.Type = "company" }, true},
		{"empty type is not normalized here", func(a *domain.Account) { a.Type = "" }, true},
		{"unknown phase", func(a *domain.Account) { a.ChallengePhase = accStr("phase_3") }, true},
		{"missing phase", func(a *domain.Account) { a.ChallengePhase = nil }, true},
		{"unknown status", func(a *domain.Account) { a.ChallengeStatus = accStr("paused") }, true},
		{"missing status", func(a *domain.Account) { a.ChallengeStatus = nil }, true},
		{"funded cannot be passed", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseFunded)
			a.ChallengeStatus = accStr(domain.ChallengePassed)
		}, true},
		{"funded can fail", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseFunded)
			a.ChallengeStatus = accStr(domain.ChallengeFailed)
		}, false},
		{"phase 2 can be passed", func(a *domain.Account) {
			a.ChallengePhase = accStr(domain.PhaseTwo)
			a.ChallengeStatus = accStr(domain.ChallengePassed)
		}, false},
		// "ê" là 2 byte: 64 ký tự = 128 byte. Đếm theo byte thì ca này sai.
		{"prop firm of 64 runes", func(a *domain.Account) { a.PropFirm = strings.Repeat("ê", 64) }, false},
		{"prop firm of 65 runes", func(a *domain.Account) { a.PropFirm = strings.Repeat("ê", 65) }, true},
		{"profit target zero", func(a *domain.Account) { a.ProfitTarget = accDec("0") }, true},
		{"profit target over 100%", func(a *domain.Account) { a.ProfitTarget = accDec("1.01") }, true},
		{"profit target exactly 100%", func(a *domain.Account) { a.ProfitTarget = accDec("1") }, false},
		{"max drawdown negative", func(a *domain.Account) { a.MaxDrawdownLimit = accDec("-0.1") }, true},
		{"max drawdown 10%", func(a *domain.Account) { a.MaxDrawdownLimit = accDec("0.1") }, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			a := propAccount()
			tc.mangle(&a)
			err := a.ValidateChallenge()
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd backend && go test ./internal/domain/ -run 'Challenge' -count=1`
Expected: FAIL biên dịch — `unknown field Type in struct literal of type domain.Account`, `undefined: domain.AccountProp`.

- [ ] **Step 3: Thêm trường vào `domain.Account`**

Trong `backend/internal/domain/models.go`, thay struct `Account` bằng:

```go
type Account struct {
	ID             int64           `gorm:"column:id;primaryKey"`
	UserID         int64           `gorm:"column:user_id"`
	Code           string          `gorm:"column:code"`
	Name           string          `gorm:"column:name"`
	InitialBalance decimal.Decimal `gorm:"column:initial_balance"`
	RiskPerTrade   decimal.Decimal `gorm:"column:risk_per_trade"` // 0.01 = 1%
	Currency       string          `gorm:"column:currency"`
	Timezone       string          `gorm:"column:timezone"`

	// Loại tài khoản và vòng thi quỹ — luật nằm ở account_rules.go.
	//
	// default:personal là để một domain.Account{} dựng tay (test seed đi
	// thẳng vào repository, không qua service) vẫn INSERT được: GORM gán giá
	// trị mặc định cho trường rỗng thay vì ghi "" vào cột có CHECK.
	Type             string           `gorm:"column:account_type;default:personal"`
	PropFirm         string           `gorm:"column:prop_firm"`
	ChallengePhase   *string          `gorm:"column:challenge_phase"`
	ChallengeStatus  *string          `gorm:"column:challenge_status"`
	ProfitTarget     *decimal.Decimal `gorm:"column:profit_target"`      // phân số: 0.1 = 10%
	MaxDrawdownLimit *decimal.Decimal `gorm:"column:max_drawdown_limit"` // phân số
}
```

- [ ] **Step 4: Viết luật**

Tạo `backend/internal/domain/account_rules.go`:

```go
package domain

import (
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/shopspring/decimal"
)

// Loại tài khoản. KHÁC các enum ở enums.go: đây không phải key chấm điểm mà
// là giá trị ASCII của hợp đồng API — nhãn tiếng Việt nằm ở frontend
// (enumLabels.ts). Khớp CHECK constraint của migration 0006.
const (
	AccountPersonal = "personal"
	AccountProp     = "prop"
)

// Vòng thi của tài khoản quỹ, theo đúng thứ tự đi qua.
const (
	PhaseOne    = "phase_1"
	PhaseTwo    = "phase_2"
	PhaseFunded = "funded"
)

// Kết cục của vòng hiện tại. Người dùng tự chọn — backend không suy ra
// pass/fail từ luật của quỹ (spec §2).
const (
	ChallengeInProgress = "in_progress"
	ChallengePassed     = "passed"
	ChallengeFailed     = "failed"
)

// Thứ tự là thứ tự hiển thị. ChallengePhases còn là thứ tự của thanh vòng
// thi trên frontend, nên đổi thứ tự ở đây là đổi hình của thanh đó.
var (
	AccountTypes      = []string{AccountPersonal, AccountProp}
	ChallengePhases   = []string{PhaseOne, PhaseTwo, PhaseFunded}
	ChallengeStatuses = []string{ChallengeInProgress, ChallengePassed, ChallengeFailed}
)

// MaxPropFirmLen đếm theo KÝ TỰ, không theo byte: "Quỹ Việt" là 8 ký tự
// nhưng 11 byte.
const MaxPropFirmLen = 64

// NormalizeChallenge đưa dữ liệu thử thách về hình dạng hợp lệ TRƯỚC khi
// validate. Đây là ý định của người dùng, không phải lỗi của họ:
//
//   - Type rỗng là tài khoản cá nhân (mặc định của cột).
//   - Chuyển về cá nhân thì dữ liệu thi không còn nghĩa gì, xoá sạch. Báo lỗi
//     "còn tên quỹ" ở đây chỉ bắt người dùng xoá tay từng ô.
//   - Tài khoản quỹ mới mà chưa nói vòng nào thì bắt đầu ở Vòng 1, đang thi.
func (a *Account) NormalizeChallenge() {
	if a.Type == "" {
		a.Type = AccountPersonal
	}
	if a.Type != AccountProp {
		a.PropFirm = ""
		a.ChallengePhase, a.ChallengeStatus = nil, nil
		a.ProfitTarget, a.MaxDrawdownLimit = nil, nil
		return
	}
	if a.ChallengePhase == nil {
		p := PhaseOne
		a.ChallengePhase = &p
	}
	if a.ChallengeStatus == nil {
		s := ChallengeInProgress
		a.ChallengeStatus = &s
	}
}

// ValidateChallenge kiểm dữ liệu thử thách ĐÃ chuẩn hoá. Các luật ở đây trùng
// với CHECK của migration 0006 — DB là hàng rào cuối, còn đây là chỗ trả về
// một câu người dùng đọc được thay vì lỗi 500.
func (a Account) ValidateChallenge() error {
	if !Valid(AccountTypes, a.Type) {
		return fmt.Errorf("loại tài khoản %q không hợp lệ", a.Type)
	}
	if a.Type == AccountPersonal {
		return nil
	}
	if utf8.RuneCountInString(a.PropFirm) > MaxPropFirmLen {
		return fmt.Errorf("tên quỹ dài quá %d ký tự", MaxPropFirmLen)
	}
	if a.ChallengePhase == nil || !Valid(ChallengePhases, *a.ChallengePhase) {
		return errors.New("vòng thi không hợp lệ")
	}
	if a.ChallengeStatus == nil || !Valid(ChallengeStatuses, *a.ChallengeStatus) {
		return errors.New("trạng thái vòng thi không hợp lệ")
	}
	// Funded là vòng cuối: không còn vòng nào phía sau để "qua".
	if *a.ChallengePhase == PhaseFunded && *a.ChallengeStatus == ChallengePassed {
		return errors.New("tài khoản funded không có trạng thái đã qua")
	}
	if !fractionInRange(a.ProfitTarget) {
		return errors.New("mục tiêu lợi nhuận phải lớn hơn 0 và không quá 100%")
	}
	if !fractionInRange(a.MaxDrawdownLimit) {
		return errors.New("max drawdown phải lớn hơn 0 và không quá 100%")
	}
	return nil
}

// fractionInRange: nil nghĩa là "quỹ không đặt luật này" — hợp lệ.
func fractionInRange(v *decimal.Decimal) bool {
	return v == nil || (v.IsPositive() && !v.GreaterThan(decimal.NewFromInt(1)))
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `cd backend && go test ./internal/domain/ -count=1`
Expected: PASS (cả test cũ của package).

---

### Task 2: Migration 0006 và lưu/đọc ở repository

**Files:**
- Create: `backend/migrations/0006_account_challenge.up.sql`
- Create: `backend/migrations/0006_account_challenge.down.sql`
- Modify: `backend/internal/repository/account.go` (hàm `Update`)
- Modify: `backend/internal/service/memstore_test.go` (`memAccountStore.Create`, `memAccountStore.Update`)
- Modify: `backend/internal/service/store_contract_test.go` (`accountStoreContract`)
- Test: `backend/internal/repository/account_test.go`

**Interfaces:**
- Consumes: các trường và hằng của Task 1
- Produces: sáu cột `account_type`, `prop_firm`, `challenge_phase`, `challenge_status`, `profit_target`, `max_drawdown_limit`; `AccountRepo.Update` ghi cả sáu cột.

- [ ] **Step 1: Viết test contract thất bại (chạy cho cả in-memory lẫn Postgres)**

Trong `backend/internal/service/store_contract_test.go`, thêm hai sub-test vào cuối thân `accountStoreContract` (ngay trước dấu `}` đóng hàm):

```go
	// Hàng cũ và domain.Account{} dựng tay (test seed) không có Type. Cột có
	// DEFAULT 'personal' + CHECK, nên INSERT chuỗi rỗng sẽ bị từ chối.
	t.Run("Create với Type rỗng đọc lại là personal", func(t *testing.T) {
		st, uid := eachStore(t)
		a, err := st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.NoError(t, err)

		got, err := st.ByID(newCtx(), a.ID)
		require.NoError(t, err)
		require.Equal(t, domain.AccountPersonal, got.Type)
		require.Nil(t, got.ChallengePhase)
		require.Nil(t, got.ProfitTarget)
	})

	t.Run("Update ghi và đọc lại dữ liệu thử thách", func(t *testing.T) {
		st, uid := eachStore(t)
		a, err := st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.NoError(t, err)

		phase, status := domain.PhaseTwo, domain.ChallengeInProgress
		target := decimal.RequireFromString("0.05")
		a.Type = domain.AccountProp
		a.PropFirm = "FTMO"
		a.ChallengePhase, a.ChallengeStatus = &phase, &status
		a.ProfitTarget = &target
		require.NoError(t, st.Update(newCtx(), a))

		got, err := st.ByID(newCtx(), a.ID)
		require.NoError(t, err)
		require.Equal(t, domain.AccountProp, got.Type)
		require.Equal(t, "FTMO", got.PropFirm)
		require.Equal(t, domain.PhaseTwo, *got.ChallengePhase)
		require.Equal(t, domain.ChallengeInProgress, *got.ChallengeStatus)
		require.Equal(t, "0.05", got.ProfitTarget.String())
		require.Nil(t, got.MaxDrawdownLimit)

		// Quay về cá nhân: NULL phải được GHI xuống, không phải bị bỏ qua.
		a.Type = domain.AccountPersonal
		a.PropFirm = ""
		a.ChallengePhase, a.ChallengeStatus, a.ProfitTarget = nil, nil, nil
		require.NoError(t, st.Update(newCtx(), a))

		got, err = st.ByID(newCtx(), a.ID)
		require.NoError(t, err)
		require.Equal(t, domain.AccountPersonal, got.Type)
		require.Nil(t, got.ChallengePhase)
		require.Nil(t, got.ProfitTarget)
	})
```

Thêm test chỉ-Postgres vào cuối `backend/internal/repository/account_test.go` — ghim rằng CHECK của DB thật sự chặn, phòng khi service bị đi vòng:

```go
func TestAccountDBRejectsBadChallengeShape(t *testing.T) {
	cases := map[string]func(a *domain.Account){
		"funded cannot be passed": func(a *domain.Account) {
			p, s := domain.PhaseFunded, domain.ChallengePassed
			a.Type, a.ChallengePhase, a.ChallengeStatus = domain.AccountProp, &p, &s
		},
		"prop needs a phase": func(a *domain.Account) {
			s := domain.ChallengeInProgress
			a.Type, a.ChallengeStatus = domain.AccountProp, &s
		},
		"personal cannot carry a phase": func(a *domain.Account) {
			p, s := domain.PhaseOne, domain.ChallengeInProgress
			a.Type, a.ChallengePhase, a.ChallengeStatus = domain.AccountPersonal, &p, &s
		},
		"unknown type": func(a *domain.Account) { a.Type = "company" },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			db := testdb.New(t)
			userID := seedUser(t, repository.NewUserRepo(db), "a@example.com")
			a := newAccount(userID, "ACC1")
			mangle(&a)

			_, err := repository.NewAccountRepo(db).Create(ctx, a)

			require.Error(t, err)
		})
	}
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd backend && go test ./internal/service/ ./internal/repository/ -run 'AccountStoreContract|TestAccountDBRejects' -count=1 -timeout 300s`
Expected: FAIL — bản in-memory: `expected "personal", actual ""`; bản Postgres: `column "account_type" of relation "accounts" does not exist`.

- [ ] **Step 3: Viết migration**

Tạo `backend/migrations/0006_account_challenge.up.sql`:

```sql
-- Loại tài khoản và vòng thi quỹ. Spec: docs/superpowers/specs/2026-09-29-account-types-design.md §3.
-- Hàng cũ nhận 'personal' qua DEFAULT, bốn cột thử thách để NULL — thoả mọi CHECK dưới đây
-- nên không cần backfill.
ALTER TABLE accounts
    ADD COLUMN account_type       TEXT          NOT NULL DEFAULT 'personal',
    ADD COLUMN prop_firm          TEXT          NOT NULL DEFAULT '',
    ADD COLUMN challenge_phase    TEXT,
    ADD COLUMN challenge_status   TEXT,
    -- Phân số, như risk_per_trade: 0.1 = 10%.
    ADD COLUMN profit_target      NUMERIC(6, 4),
    ADD COLUMN max_drawdown_limit NUMERIC(6, 4);

ALTER TABLE accounts
    ADD CONSTRAINT accounts_type CHECK (account_type IN ('personal', 'prop')),
    ADD CONSTRAINT accounts_challenge_phase CHECK (challenge_phase IN ('phase_1', 'phase_2', 'funded')),
    ADD CONSTRAINT accounts_challenge_status CHECK (challenge_status IN ('in_progress', 'passed', 'failed')),
    -- Tài khoản quỹ PHẢI có vòng và trạng thái; tài khoản cá nhân KHÔNG được mang gì của quỹ.
    ADD CONSTRAINT accounts_challenge_shape CHECK (
        (account_type = 'personal'
            AND challenge_phase IS NULL AND challenge_status IS NULL
            AND profit_target IS NULL AND max_drawdown_limit IS NULL
            AND prop_firm = '')
        OR (account_type = 'prop'
            AND challenge_phase IS NOT NULL AND challenge_status IS NOT NULL)
    ),
    -- Funded là vòng cuối, không có vòng nào phía sau để "qua".
    ADD CONSTRAINT accounts_funded_not_passed CHECK (
        NOT (challenge_phase = 'funded' AND challenge_status = 'passed')
    );
```

Tạo `backend/migrations/0006_account_challenge.down.sql`:

```sql
-- DROP COLUMN kéo theo mọi CHECK có nhắc tới cột đó.
ALTER TABLE accounts
    DROP COLUMN max_drawdown_limit,
    DROP COLUMN profit_target,
    DROP COLUMN challenge_status,
    DROP COLUMN challenge_phase,
    DROP COLUMN prop_firm,
    DROP COLUMN account_type;
```

- [ ] **Step 4: Ghi sáu cột ở repository**

Trong `backend/internal/repository/account.go`, thay map của `Updates` trong hàm `Update` bằng:

```go
		Updates(map[string]any{
			"code":            a.Code,
			"name":            a.Name,
			"initial_balance": a.InitialBalance,
			"risk_per_trade":  a.RiskPerTrade,
			"currency":        a.Currency,
			"timezone":        a.Timezone,
			// Con trỏ nil đi xuống thành NULL. Dùng map chứ không Updates(struct)
			// chính vì lý do này: Updates(struct) BỎ QUA trường zero-value, nên
			// chuyển quỹ về cá nhân sẽ để lại vòng thi cũ trong DB.
			"account_type":       a.Type,
			"prop_firm":          a.PropFirm,
			"challenge_phase":    a.ChallengePhase,
			"challenge_status":   a.ChallengeStatus,
			"profit_target":      a.ProfitTarget,
			"max_drawdown_limit": a.MaxDrawdownLimit,
			"updated_at":         gorm.Expr("now()"),
		}).Error
```

- [ ] **Step 5: Cho bản in-memory khớp hành vi của DB**

Trong `backend/internal/service/memstore_test.go`, ở `memAccountStore.Create`, thêm ngay trước dòng `a.ID = m.nextID`:

```go
	// Khớp DEFAULT 'personal' của migration 0006.
	if a.Type == "" {
		a.Type = domain.AccountPersonal
	}
```

Ở `memAccountStore.Update`, thêm ngay sau dòng `old.Timezone = a.Timezone`:

```go
	old.Type = a.Type
	old.PropFirm = a.PropFirm
	old.ChallengePhase = a.ChallengePhase
	old.ChallengeStatus = a.ChallengeStatus
	old.ProfitTarget = a.ProfitTarget
	old.MaxDrawdownLimit = a.MaxDrawdownLimit
```

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `cd backend && go test ./internal/service/ ./internal/repository/ -count=1 -timeout 300s`
Expected: PASS — gồm toàn bộ test cũ của hai package (các test seed account bằng `domain.Account{}` không có Type phải vẫn xanh nhờ `default:personal`).

---

### Task 3: Service tạo/sửa account với dữ liệu thử thách

**Files:**
- Modify: `backend/internal/service/account.go`
- Test: `backend/internal/service/account_test.go`

**Interfaces:**
- Consumes: `NormalizeChallenge`, `ValidateChallenge` (Task 1); `service.Tristate[T]` (có sẵn ở `tristate.go`)
- Produces:
  - `service.AccountCreate` thêm `Type string`, `PropFirm string`, `ChallengePhase *string`, `ChallengeStatus *string`, `ProfitTarget *decimal.Decimal`, `MaxDrawdownLimit *decimal.Decimal`
  - `service.AccountPatch` thêm `Type *string`, `PropFirm *string`, `ChallengePhase *string`, `ChallengeStatus *string`, `ProfitTarget Tristate[decimal.Decimal]`, `MaxDrawdownLimit Tristate[decimal.Decimal]`
  - Luật: PATCH đổi `ChallengePhase` mà không gửi `ChallengeStatus` → trạng thái về `in_progress`.

- [ ] **Step 1: Viết test thất bại**

Trong `backend/internal/service/account_test.go`, thêm `"journal/internal/domain"` vào khối import, rồi thêm vào cuối file:

```go
func svcStr(s string) *string { return &s }

func svcDec(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func validProp() service.AccountCreate {
	c := validCreate()
	c.Code = "FT1"
	c.Type = domain.AccountProp
	c.PropFirm = "FTMO"
	return c
}

func TestAccountCreateDefaultsToPersonal(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validCreate())

	require.NoError(t, err)
	require.Equal(t, domain.AccountPersonal, acc.Type)
	require.Nil(t, acc.ChallengePhase)
}

func TestAccountCreatePropStartsAtPhaseOne(t *testing.T) {
	svc, userID, _ := newAccountService(t)

	acc, err := svc.Create(context.Background(), userID, validProp())

	require.NoError(t, err)
	require.Equal(t, domain.AccountProp, acc.Type)
	require.Equal(t, "FTMO", acc.PropFirm)
	require.Equal(t, domain.PhaseOne, *acc.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *acc.ChallengeStatus)
}

func TestAccountCreatePersonalDropsChallengeFields(t *testing.T) {
	svc, userID, _ := newAccountService(t)
	in := validCreate()
	in.PropFirm = "FTMO"
	in.ChallengePhase = svcStr(domain.PhaseTwo)
	in.ProfitTarget = svcDec("0.1")

	acc, err := svc.Create(context.Background(), userID, in)

	require.NoError(t, err)
	require.Equal(t, "", acc.PropFirm)
	require.Nil(t, acc.ChallengePhase)
	require.Nil(t, acc.ProfitTarget)
}

func TestAccountCreateRejectsBadChallenge(t *testing.T) {
	cases := map[string]func(c *service.AccountCreate){
		"unknown type": func(c *service.AccountCreate) { c.Type = "company" },
		"funded passed": func(c *service.AccountCreate) {
			c.ChallengePhase = svcStr(domain.PhaseFunded)
			c.ChallengeStatus = svcStr(domain.ChallengePassed)
		},
		"unknown phase":      func(c *service.AccountCreate) { c.ChallengePhase = svcStr("phase_9") },
		"target zero":        func(c *service.AccountCreate) { c.ProfitTarget = svcDec("0") },
		"target over 100%":   func(c *service.AccountCreate) { c.ProfitTarget = svcDec("2") },
		"drawdown over 100%": func(c *service.AccountCreate) { c.MaxDrawdownLimit = svcDec("1.5") },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			svc, userID, _ := newAccountService(t)
			in := validProp()
			mangle(&in)

			_, err := svc.Create(context.Background(), userID, in)

			e := apperr.As(err)
			require.NotNil(t, e, "phải là lỗi nghiệp vụ, không phải lỗi hạ tầng")
			require.Equal(t, 400, e.Status)
		})
	}
}

// Lên vòng mới là bắt đầu một lượt thi mới. Giữ "passed" của Vòng 2 khi lên
// Funded thì DB từ chối (accounts_funded_not_passed) và người dùng nhận 500.
func TestAccountUpdatePhaseChangeResetsStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengeStatus: svcStr(domain.ChallengePassed)})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengePhase: svcStr(domain.PhaseTwo)})

	require.NoError(t, err)
	require.Equal(t, domain.PhaseTwo, *updated.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *updated.ChallengeStatus)
}

func TestAccountUpdatePhaseWithStatusKeepsStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ChallengePhase:  svcStr(domain.PhaseFunded),
		ChallengeStatus: svcStr(domain.ChallengeFailed),
	})

	require.NoError(t, err)
	require.Equal(t, domain.ChallengeFailed, *updated.ChallengeStatus)
}

func TestAccountUpdateSamePhaseDoesNotResetStatus(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)
	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengeStatus: svcStr(domain.ChallengeFailed)})
	require.NoError(t, err)

	// Form gửi lại đúng vòng cũ (ví dụ vì người dùng bấm qua bấm lại) không
	// được hồi sinh một account đã thất bại.
	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{ChallengePhase: svcStr(domain.PhaseOne)})

	require.NoError(t, err)
	require.Equal(t, domain.ChallengeFailed, *updated.ChallengeStatus)
}

func TestAccountUpdateFundedPassedRejected(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validProp())
	require.NoError(t, err)

	_, err = svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ChallengePhase:  svcStr(domain.PhaseFunded),
		ChallengeStatus: svcStr(domain.ChallengePassed),
	})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
}

func TestAccountUpdateToPersonalClearsChallenge(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	in := validProp()
	in.ProfitTarget = svcDec("0.1")
	acc, err := svc.Create(ctx, userID, in)
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Type: svcStr(domain.AccountPersonal)})

	require.NoError(t, err)
	require.Equal(t, domain.AccountPersonal, updated.Type)
	require.Equal(t, "", updated.PropFirm)
	require.Nil(t, updated.ChallengePhase)
	require.Nil(t, updated.ProfitTarget)
}

func TestAccountUpdatePersonalToPropStartsAtPhaseOne(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	acc, err := svc.Create(ctx, userID, validCreate())
	require.NoError(t, err)

	updated, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Type: svcStr(domain.AccountProp)})

	require.NoError(t, err)
	require.Equal(t, domain.PhaseOne, *updated.ChallengePhase)
	require.Equal(t, domain.ChallengeInProgress, *updated.ChallengeStatus)
}

func TestAccountUpdateProfitTargetTristate(t *testing.T) {
	ctx := context.Background()
	svc, userID, _ := newAccountService(t)
	in := validProp()
	in.ProfitTarget = svcDec("0.1")
	acc, err := svc.Create(ctx, userID, in)
	require.NoError(t, err)

	kept, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{Name: svcStr("x")})
	require.NoError(t, err)
	require.Equal(t, "0.1", kept.ProfitTarget.String(), "khoá vắng mặt thì giữ nguyên")

	cleared, err := svc.Update(ctx, userID, acc.ID, service.AccountPatch{
		ProfitTarget: service.Tristate[decimal.Decimal]{Set: true, Value: nil},
	})
	require.NoError(t, err)
	require.Nil(t, cleared.ProfitTarget, "null thì xoá")
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd backend && go test -short ./internal/service/ -run 'TestAccount' -count=1`
Expected: FAIL biên dịch — `unknown field Type in struct literal of type service.AccountCreate`.

- [ ] **Step 3: Cài đặt**

Trong `backend/internal/service/account.go`:

Thay comment + struct `AccountCreate` bằng:

```go
// AccountCreate là input tạo account. Các trường tiền và định danh bắt buộc;
// trường thử thách tuỳ chọn và được NormalizeChallenge điền mặc định.
type AccountCreate struct {
	Code           string
	Name           string
	Currency       string
	Timezone       string
	InitialBalance decimal.Decimal
	RiskPerTrade   decimal.Decimal

	Type             string
	PropFirm         string
	ChallengePhase   *string
	ChallengeStatus  *string
	ProfitTarget     *decimal.Decimal
	MaxDrawdownLimit *decimal.Decimal
}
```

Thay struct `AccountPatch` bằng:

```go
// AccountPatch là input sửa account. Trường nil nghĩa là "không đổi".
//
// ProfitTarget và MaxDrawdownLimit là Tristate vì người dùng XOÁ được chúng
// (quỹ không đặt luật đó): con trỏ thường không phân biệt được "đừng đụng
// vào" với "xoá đi".
type AccountPatch struct {
	Code           *string
	Name           *string
	Currency       *string
	Timezone       *string
	InitialBalance *decimal.Decimal
	RiskPerTrade   *decimal.Decimal

	Type             *string
	PropFirm         *string
	ChallengePhase   *string
	ChallengeStatus  *string
	ProfitTarget     Tristate[decimal.Decimal]
	MaxDrawdownLimit Tristate[decimal.Decimal]
}
```

Trong `Create`, thay khối dựng `a := domain.Account{...}` bằng:

```go
	a := domain.Account{
		UserID:           userID,
		Code:             strings.TrimSpace(in.Code),
		Name:             strings.TrimSpace(in.Name),
		Currency:         strings.TrimSpace(in.Currency),
		Timezone:         strings.TrimSpace(in.Timezone),
		InitialBalance:   in.InitialBalance,
		RiskPerTrade:     in.RiskPerTrade,
		Type:             strings.TrimSpace(in.Type),
		PropFirm:         strings.TrimSpace(in.PropFirm),
		ChallengePhase:   in.ChallengePhase,
		ChallengeStatus:  in.ChallengeStatus,
		ProfitTarget:     in.ProfitTarget,
		MaxDrawdownLimit: in.MaxDrawdownLimit,
	}
	a.NormalizeChallenge()
```

Trong `Update`, thêm ngay sau khối `if p.RiskPerTrade != nil { ... }`:

```go
	if p.Type != nil {
		a.Type = strings.TrimSpace(*p.Type)
	}
	if p.PropFirm != nil {
		a.PropFirm = strings.TrimSpace(*p.PropFirm)
	}
	if p.ChallengePhase != nil {
		// Lên vòng mới mà không nói trạng thái = bắt đầu một lượt thi mới ở
		// vòng đó. Gửi lại đúng vòng cũ thì KHÔNG phải lên vòng, giữ nguyên
		// trạng thái — nếu không, một account thất bại hồi sinh vì một lần
		// bấm nhầm trong form.
		moved := a.ChallengePhase == nil || *a.ChallengePhase != *p.ChallengePhase
		if moved && p.ChallengeStatus == nil {
			s := domain.ChallengeInProgress
			a.ChallengeStatus = &s
		}
		phase := *p.ChallengePhase
		a.ChallengePhase = &phase
	}
	if p.ChallengeStatus != nil {
		s := *p.ChallengeStatus
		a.ChallengeStatus = &s
	}
	if v, ok := p.ProfitTarget.Get(); ok {
		a.ProfitTarget = v
	}
	if v, ok := p.MaxDrawdownLimit.Get(); ok {
		a.MaxDrawdownLimit = v
	}
	a.NormalizeChallenge()
```

Trong `validateAccount`, thay dòng `return nil` cuối hàm bằng:

```go
	if err := a.ValidateChallenge(); err != nil {
		return apperr.Validation(err.Error())
	}
	return nil
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd backend && go test -short ./internal/service/ -count=1`
Expected: PASS (cả test cũ).

---

### Task 4: DTO HTTP và `/meta/enums`

**Files:**
- Modify: `backend/internal/httpapi/dto.go` (`accountDTO`, `toAccountDTO`, `accountCreateRequest`, `accountPatchRequest`)
- Modify: `backend/internal/httpapi/account_handler.go` (`Create`, `Update`)
- Modify: `backend/internal/httpapi/meta_handler.go`
- Test: `backend/internal/httpapi/account_handler_test.go`, `backend/internal/httpapi/meta_handler_test.go`

**Interfaces:**
- Consumes: `service.AccountCreate`, `service.AccountPatch` (Task 3); `domain.AccountTypes`, `domain.ChallengePhases`, `domain.ChallengeStatuses` (Task 1)
- Produces: JSON account có thêm `account_type`, `prop_firm`, `challenge_phase`, `challenge_status`, `profit_target`, `max_drawdown_limit`; `/meta/enums` có thêm `account_types`, `challenge_phases`, `challenge_statuses`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `backend/internal/httpapi/account_handler_test.go`:

```go
const bodyProp = `{"code":"FT1","name":"FTMO 100k","currency":"USD","timezone":"UTC",` +
	`"initial_balance":"100000","risk_per_trade":"0.01",` +
	`"account_type":"prop","prop_firm":"FTMO","profit_target":"0.1","max_drawdown_limit":"0.1"}`

func TestCreatePropAccountRoundTrip(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	body := string(env.Data)
	require.Contains(t, body, `"account_type":"prop"`)
	require.Contains(t, body, `"prop_firm":"FTMO"`)
	require.Contains(t, body, `"challenge_phase":"phase_1"`)
	require.Contains(t, body, `"challenge_status":"in_progress"`)
	require.Contains(t, body, `"profit_target":"0.1"`, "tỷ lệ là chuỗi JSON: %s", body)
	require.Contains(t, body, `"max_drawdown_limit":"0.1"`)
}

func TestPersonalAccountHasNullChallenge(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	_, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	body := string(env.Data)
	require.Contains(t, body, `"account_type":"personal"`)
	require.Contains(t, body, `"prop_firm":""`)
	require.Contains(t, body, `"challenge_phase":null`)
	require.Contains(t, body, `"challenge_status":null`)
	require.Contains(t, body, `"profit_target":null`)
	require.Contains(t, body, `"max_drawdown_limit":null`)
}

func TestPatchNullClearsProfitTarget(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/"+itoa(acc.ID), tokenA,
		`{"profit_target":null}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	require.Contains(t, string(env.Data), `"profit_target":null`)
	require.Contains(t, string(env.Data), `"max_drawdown_limit":"0.1"`, "khoá không gửi thì giữ nguyên")
}

func TestPatchAdvancePhaseResetsStatus(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))
	url := srv.URL + "/api/accounts/" + itoa(acc.ID)
	_, _ = do(t, http.MethodPatch, url, tokenA, `{"challenge_status":"passed"}`)

	resp, env := do(t, http.MethodPatch, url, tokenA, `{"challenge_phase":"phase_2"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	require.Contains(t, string(env.Data), `"challenge_phase":"phase_2"`)
	require.Contains(t, string(env.Data), `"challenge_status":"in_progress"`)
}

func TestPatchFundedPassedReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/"+itoa(acc.ID), tokenA,
		`{"challenge_phase":"funded","challenge_status":"passed"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}
```

Thêm vào cuối `backend/internal/httpapi/meta_handler_test.go`:

```go
func TestMetaEnumsIncludesAccountEnums(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	var env struct {
		Data struct {
			AccountTypes      []string `json:"account_types"`
			ChallengePhases   []string `json:"challenge_phases"`
			ChallengeStatuses []string `json:"challenge_statuses"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	require.Equal(t, domain.AccountTypes, env.Data.AccountTypes)
	require.Equal(t, domain.ChallengePhases, env.Data.ChallengePhases)
	require.Equal(t, domain.ChallengeStatuses, env.Data.ChallengeStatuses)
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd backend && go test ./internal/httpapi/ -run 'Prop|Personal|PatchNull|PatchAdvance|PatchFunded|MetaEnums' -count=1 -timeout 300s`
Expected: FAIL — `"account_type":"prop"` không có trong body; `account_types` rỗng.

- [ ] **Step 3: Cài đặt DTO**

Trong `backend/internal/httpapi/dto.go`, thay `accountDTO` và `toAccountDTO` bằng:

```go
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

	// Tài khoản cá nhân: bốn trường con trỏ ra null, prop_firm ra "".
	Type             string           `json:"account_type"`
	PropFirm         string           `json:"prop_firm"`
	ChallengePhase   *string          `json:"challenge_phase"`
	ChallengeStatus  *string          `json:"challenge_status"`
	ProfitTarget     *decimal.Decimal `json:"profit_target"`
	MaxDrawdownLimit *decimal.Decimal `json:"max_drawdown_limit"`
}

func toAccountDTO(a domain.Account) accountDTO {
	return accountDTO{
		ID:               a.ID,
		Code:             a.Code,
		Name:             a.Name,
		InitialBalance:   a.InitialBalance,
		RiskPerTrade:     a.RiskPerTrade,
		Currency:         a.Currency,
		Timezone:         a.Timezone,
		OneR:             a.OneR(),
		Type:             a.Type,
		PropFirm:         a.PropFirm,
		ChallengePhase:   a.ChallengePhase,
		ChallengeStatus:  a.ChallengeStatus,
		ProfitTarget:     a.ProfitTarget,
		MaxDrawdownLimit: a.MaxDrawdownLimit,
	}
}
```

Thay `accountCreateRequest` và `accountPatchRequest` bằng:

```go
type accountCreateRequest struct {
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	Currency       string          `json:"currency"`
	Timezone       string          `json:"timezone"`
	InitialBalance decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   decimal.Decimal `json:"risk_per_trade"`

	Type             string           `json:"account_type"`
	PropFirm         string           `json:"prop_firm"`
	ChallengePhase   *string          `json:"challenge_phase"`
	ChallengeStatus  *string          `json:"challenge_status"`
	ProfitTarget     *decimal.Decimal `json:"profit_target"`
	MaxDrawdownLimit *decimal.Decimal `json:"max_drawdown_limit"`
}

// Con trỏ nghĩa là "khoá này không có trong body" — PATCH là partial update.
// Hai tỷ lệ là Tristate: null trong body nghĩa là XOÁ, khác với vắng mặt.
type accountPatchRequest struct {
	Code           *string          `json:"code"`
	Name           *string          `json:"name"`
	Currency       *string          `json:"currency"`
	Timezone       *string          `json:"timezone"`
	InitialBalance *decimal.Decimal `json:"initial_balance"`
	RiskPerTrade   *decimal.Decimal `json:"risk_per_trade"`

	Type             *string                           `json:"account_type"`
	PropFirm         *string                           `json:"prop_firm"`
	ChallengePhase   *string                           `json:"challenge_phase"`
	ChallengeStatus  *string                           `json:"challenge_status"`
	ProfitTarget     service.Tristate[decimal.Decimal] `json:"profit_target"`
	MaxDrawdownLimit service.Tristate[decimal.Decimal] `json:"max_drawdown_limit"`
}
```

Nếu `dto.go` chưa import `"journal/internal/service"` thì thêm vào khối import.

- [ ] **Step 4: Truyền trường qua handler**

Trong `backend/internal/httpapi/account_handler.go`, ở `Create`, thay literal `service.AccountCreate{...}` bằng:

```go
	acc, err := h.svc.Create(r.Context(), UserID(r.Context()), service.AccountCreate{
		Code:             req.Code,
		Name:             req.Name,
		Currency:         req.Currency,
		Timezone:         req.Timezone,
		InitialBalance:   req.InitialBalance,
		RiskPerTrade:     req.RiskPerTrade,
		Type:             req.Type,
		PropFirm:         req.PropFirm,
		ChallengePhase:   req.ChallengePhase,
		ChallengeStatus:  req.ChallengeStatus,
		ProfitTarget:     req.ProfitTarget,
		MaxDrawdownLimit: req.MaxDrawdownLimit,
	})
```

Ở `Update`, thay literal `service.AccountPatch{...}` bằng:

```go
		service.AccountPatch{
			Code:             req.Code,
			Name:             req.Name,
			Currency:         req.Currency,
			Timezone:         req.Timezone,
			InitialBalance:   req.InitialBalance,
			RiskPerTrade:     req.RiskPerTrade,
			Type:             req.Type,
			PropFirm:         req.PropFirm,
			ChallengePhase:   req.ChallengePhase,
			ChallengeStatus:  req.ChallengeStatus,
			ProfitTarget:     req.ProfitTarget,
			MaxDrawdownLimit: req.MaxDrawdownLimit,
		})
```

- [ ] **Step 5: Cấp enum qua `/meta/enums`**

Trong `backend/internal/httpapi/meta_handler.go`, thêm ba dòng vào map, ngay sau `"cash_flow_types"`:

```go
		"account_types":      domain.AccountTypes,
		"challenge_phases":   domain.ChallengePhases,
		"challenge_statuses": domain.ChallengeStatuses,
```

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `cd backend && go test ./internal/httpapi/ -count=1 -timeout 300s`
Expected: PASS (cả test cũ, gồm `TestPatchLaPartial`).

---

### Task 5: `metrics.ComputeChallenge` và khoá `challenge` trong `/stats`

**Files:**
- Create: `backend/internal/metrics/challenge.go`
- Create: `backend/internal/metrics/challenge_test.go`
- Modify: `backend/internal/metrics/kpi.go` (struct `KPI`, cuối `ComputeKPI`)
- Modify: `backend/internal/httpapi/trade_dto.go` (`statsDTO`, `toStatsDTO`)
- Test: `backend/internal/httpapi/trade_dto_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched` (`Net`, `Drawdown`), `ptrDec` (có sẵn ở `kpi.go`), trường `Type`/`ProfitTarget`/`MaxDrawdownLimit` của account (Task 1)
- Produces:
  - `type metrics.Challenge struct { ProfitPct decimal.Decimal; TargetProgress *decimal.Decimal; DrawdownPct decimal.Decimal; DrawdownUsage *decimal.Decimal }`
  - `func metrics.ComputeChallenge(all []Enriched, acc domain.Account) *Challenge`
  - `KPI.Challenge *Challenge`
  - JSON `/stats`: `"challenge": {"profit_pct","target_progress","drawdown_pct","drawdown_usage"} | null`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/internal/metrics/challenge_test.go`:

```go
package metrics

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func propGoldenAccount() domain.Account {
	acc := goldenAccount() // vốn 5000
	acc.Type = domain.AccountProp
	acc.ProfitTarget = ptr("0.1")
	acc.MaxDrawdownLimit = ptr("0.05")
	return acc
}

func TestComputeChallengeGolden(t *testing.T) {
	acc := propGoldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	c := ComputeChallenge(rows, acc)

	require.NotNil(t, c)
	// Σnet = 100 − 50 + 100 + 200 = 350 trên vốn 5000.
	require.Equal(t, "0.07", c.ProfitPct.String())
	requireDec(t, c.TargetProgress, "0.7", 4) // 7% / 10%
	// Đỉnh 100 sau lệnh 1, lệnh 2 lỗ 50 → drawdown lớn nhất 50 = 1% vốn.
	require.Equal(t, "0.01", c.DrawdownPct.String())
	requireDec(t, c.DrawdownUsage, "0.2", 4) // 1% / 5%
}

func TestComputeChallengeNilForPersonal(t *testing.T) {
	acc := goldenAccount() // Type rỗng = cá nhân
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	require.Nil(t, ComputeChallenge(rows, acc))
}

func TestComputeChallengeWithoutRulesHasNilRatios(t *testing.T) {
	acc := goldenAccount()
	acc.Type = domain.AccountProp
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	c := ComputeChallenge(rows, acc)

	require.NotNil(t, c)
	require.Equal(t, "0.07", c.ProfitPct.String())
	require.Nil(t, c.TargetProgress, "không đặt mục tiêu thì không có tiến độ — không phải 0")
	require.Nil(t, c.DrawdownUsage)
}

func TestComputeChallengeNoTrades(t *testing.T) {
	acc := propGoldenAccount()

	c := ComputeChallenge(nil, acc)

	require.NotNil(t, c)
	require.True(t, c.ProfitPct.IsZero())
	require.True(t, c.DrawdownPct.IsZero())
	requireDec(t, c.TargetProgress, "0", 4)
	requireDec(t, c.DrawdownUsage, "0", 4)
}

// Tiến độ thi là tình trạng THẬT của account — cùng ngoại lệ với
// CurrentBalance ở quy tắc 8. Đảo hai tham số filtered/all của ComputeKPI sẽ
// làm đúng một trong hai assert dưới đây sai.
func TestComputeKPIChallengeIgnoresFilter(t *testing.T) {
	acc := propGoldenAccount()
	rows, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)

	k := ComputeKPI(rows[:1], rows, acc, nil)

	require.True(t, k.NetProfit.Equal(dec("100")), "NetProfit tính trên tập đã lọc")
	require.NotNil(t, k.Challenge)
	require.Equal(t, "0.07", k.Challenge.ProfitPct.String(), "Challenge tính trên toàn bộ")
}
```

Thêm vào cuối `backend/internal/httpapi/trade_dto_test.go`:

```go
func TestStatsDTOChallengeNullForPersonal(t *testing.T) {
	b, err := json.Marshal(toStatsDTO(metrics.KPI{}))
	require.NoError(t, err)
	require.Contains(t, string(b), `"challenge":null`)
}

func TestStatsDTOChallengeShape(t *testing.T) {
	progress := decimal.RequireFromString("0.7")
	b, err := json.Marshal(toStatsDTO(metrics.KPI{Challenge: &metrics.Challenge{
		ProfitPct:      decimal.RequireFromString("0.07"),
		TargetProgress: &progress,
		DrawdownPct:    decimal.RequireFromString("0.01"),
	}}))
	require.NoError(t, err)
	require.Contains(t, string(b),
		`"challenge":{"profit_pct":"0.07","target_progress":"0.7","drawdown_pct":"0.01","drawdown_usage":null}`)
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd backend && go test ./internal/metrics/ ./internal/httpapi/ -run 'Challenge' -count=1 -timeout 300s`
Expected: FAIL biên dịch — `undefined: ComputeChallenge`, `unknown field Challenge in struct literal of type metrics.KPI`.

- [ ] **Step 3: Cài đặt hàm thuần**

Tạo `backend/internal/metrics/challenge.go`:

```go
package metrics

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
)

// Challenge là tiến độ thi quỹ, suy ra lúc đọc — không có cột nào trong DB.
// Mọi tỷ lệ là PHÂN SỐ, như net_return_pct: 0.07 = 7%.
type Challenge struct {
	// ProfitPct = Σ net của TOÀN BỘ lệnh / vốn ban đầu. Có thể âm.
	ProfitPct decimal.Decimal
	// TargetProgress = ProfitPct / mục tiêu. nil khi quỹ không đặt mục tiêu —
	// khác 0: 0 đọc thành "chưa tiến chút nào", nil là "không có đích để đo".
	TargetProgress *decimal.Decimal
	// DrawdownPct = drawdown lớn nhất của toàn bộ dãy / vốn ban đầu, số dương.
	DrawdownPct decimal.Decimal
	// DrawdownUsage = DrawdownPct / giới hạn. >= 1 là đã chạm giới hạn.
	DrawdownUsage *decimal.Decimal
}

// ComputeChallenge trả nil cho tài khoản cá nhân.
//
// `all` phải là dãy CHƯA lọc: tiến độ thi là tình trạng thật của account,
// không đổi theo tháng người dùng đang xem — cùng ngoại lệ với CurrentBalance
// ở quy tắc 8 của CLAUDE.md.
//
// Drawdown đo từ ĐỈNH equity (Enrich đặt running_peak sàn tại 0, tức sàn tại
// vốn ban đầu), không phải drawdown tĩnh tính từ vốn. Với cùng dãy lệnh, số
// này luôn >= số của quỹ dùng luật tĩnh: nếu sai thì sai về phía thận trọng.
// Cash flow không tính vào — account quỹ không nạp/rút (spec §4).
func ComputeChallenge(all []Enriched, acc domain.Account) *Challenge {
	if acc.Type != domain.AccountProp || !acc.InitialBalance.IsPositive() {
		return nil
	}

	net, maxDD := decimal.Zero, decimal.Zero
	for _, r := range all {
		net = net.Add(r.Net)
		if r.Drawdown.GreaterThan(maxDD) {
			maxDD = r.Drawdown
		}
	}

	c := &Challenge{
		ProfitPct:   net.Div(acc.InitialBalance),
		DrawdownPct: maxDD.Div(acc.InitialBalance),
	}
	if acc.ProfitTarget != nil && acc.ProfitTarget.IsPositive() {
		c.TargetProgress = ptrDec(c.ProfitPct.Div(*acc.ProfitTarget))
	}
	if acc.MaxDrawdownLimit != nil && acc.MaxDrawdownLimit.IsPositive() {
		c.DrawdownUsage = ptrDec(c.DrawdownPct.Div(*acc.MaxDrawdownLimit))
	}
	return c
}
```

- [ ] **Step 4: Gắn vào KPI**

Trong `backend/internal/metrics/kpi.go`, thêm vào cuối struct `KPI` (sau `NetCashFlow decimal.Decimal`):

```go

	// Challenge là tiến độ thi quỹ, nil với tài khoản cá nhân. Như
	// CurrentBalance: tính trên `all`, KHÔNG chịu bộ lọc.
	Challenge *Challenge
```

Trong `ComputeKPI`, thay dòng `return k` cuối hàm bằng:

```go
	k.Challenge = ComputeChallenge(all, acc)
	return k
```

- [ ] **Step 5: Đưa ra JSON**

Trong `backend/internal/httpapi/trade_dto.go`, thêm vào cuối struct `statsDTO` (sau `NetCashFlow`):

```go

	Challenge *challengeDTO `json:"challenge"`
```

Thêm ngay trên `func toStatsDTO`:

```go
type challengeDTO struct {
	ProfitPct      decimal.Decimal  `json:"profit_pct"`
	TargetProgress *decimal.Decimal `json:"target_progress"`
	DrawdownPct    decimal.Decimal  `json:"drawdown_pct"`
	DrawdownUsage  *decimal.Decimal `json:"drawdown_usage"`
}

// Con trỏ nil phải ra null, không phải object rỗng: FE đọc "challenge: null"
// là "đây là tài khoản cá nhân".
func toChallengeDTO(c *metrics.Challenge) *challengeDTO {
	if c == nil {
		return nil
	}
	return &challengeDTO{
		ProfitPct:      c.ProfitPct,
		TargetProgress: c.TargetProgress,
		DrawdownPct:    c.DrawdownPct,
		DrawdownUsage:  c.DrawdownUsage,
	}
}
```

Trong `toStatsDTO`, đổi dòng `CurrentBalance: k.CurrentBalance, NetCashFlow: k.NetCashFlow,` thành:

```go
		CurrentBalance: k.CurrentBalance, NetCashFlow: k.NetCashFlow,
		Challenge: toChallengeDTO(k.Challenge),
```

- [ ] **Step 6: Chạy toàn bộ backend**

Run: `make test && make lint`
Expected: PASS toàn bộ; `gofmt` không còn file nào.

---

### Task 6: Nền frontend — kiểu, enum, chuỗi, hàm thuần

**Files:**
- Modify: `frontend/src/features/accounts/types.ts`
- Modify: `frontend/src/features/trades/types.ts` (type `Stats`)
- Modify: `frontend/src/features/meta/hooks.ts` (type `MetaEnums`)
- Modify: `frontend/src/i18n/enumLabels.ts`
- Modify: `frontend/src/i18n/strings.ts`
- Create: `frontend/src/features/accounts/challenge.ts`
- Create: `frontend/src/features/accounts/challenge.test.ts`
- Modify (fixture): `frontend/src/test/harness.tsx` (`makeAccount`, `makeEnums`), `frontend/src/test/tradeFactory.ts` (`makeStats`), `frontend/src/features/accounts/cashflow.test.tsx` (`tk`), `frontend/src/features/trades/tradeForm.test.tsx` (`makeAccount`), `frontend/src/features/accounts/accounts.test.tsx` (`color`)

**Interfaces:**
- Consumes: JSON của Task 4–5
- Produces:
  - `type AccountType = "personal" | "prop"`; `Account` thêm `account_type`, `prop_firm`, `challenge_phase: string | null`, `challenge_status: string | null`, `profit_target: string | null`, `max_drawdown_limit: string | null`
  - `type Challenge = { profit_pct: string; target_progress: string | null; drawdown_pct: string; drawdown_usage: string | null }`; `Stats.challenge: Challenge | null`
  - `MetaEnums.account_types`, `.challenge_phases`, `.challenge_statuses: string[]`
  - `EnumField` thêm `"account_type" | "challenge_phase" | "challenge_status"`
  - Từ `challenge.ts`: `phaseSteps`, `nextPhase`, `statusOptionsFor`, `challengeActions`, `meterWidth`, `drawdownTone`, `isReached`, `splitByType`, `readTypeFilter`, `isOptionalPercent`, `percentOrNull`, `TYPE_FILTERS` và các kiểu `StepState`, `Step`, `ChallengeAction`, `DrawdownTone`, `TypeFilter`

- [ ] **Step 1: Viết test thất bại cho hàm thuần**

Tạo `frontend/src/features/accounts/challenge.test.ts`:

```ts
import { makeAccount } from "@/test/harness";
import {
  challengeActions,
  drawdownTone,
  isOptionalPercent,
  isReached,
  meterWidth,
  nextPhase,
  percentOrNull,
  phaseSteps,
  readTypeFilter,
  splitByType,
  statusOptionsFor,
} from "./challenge";

const PHASES = ["phase_1", "phase_2", "funded"];
const STATUSES = ["in_progress", "passed", "failed"];
const states = (phase: string | null, status: string | null) =>
  phaseSteps(PHASES, phase, status).map((s) => s.state);

describe("phaseSteps", () => {
  test.each([
    ["phase_1", "in_progress", ["current", "upcoming", "upcoming"]],
    ["phase_1", "passed", ["done", "upcoming", "upcoming"]],
    ["phase_1", "failed", ["failed", "upcoming", "upcoming"]],
    ["phase_2", "in_progress", ["done", "current", "upcoming"]],
    ["phase_2", "failed", ["done", "failed", "upcoming"]],
    ["funded", "in_progress", ["done", "done", "current"]],
    ["funded", "failed", ["done", "done", "failed"]],
  ])("%s + %s", (phase, status, want) => {
    expect(states(phase, status)).toEqual(want);
  });

  test("vòng lạ hoặc thiếu thì cả thanh là 'chưa tới', không đoán", () => {
    expect(states(null, null)).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(states("phase_9", "in_progress")).toEqual(["upcoming", "upcoming", "upcoming"]);
  });
});

test("nextPhase", () => {
  expect(nextPhase(PHASES, "phase_1")).toBe("phase_2");
  expect(nextPhase(PHASES, "phase_2")).toBe("funded");
  expect(nextPhase(PHASES, "funded")).toBeNull();
  expect(nextPhase(PHASES, null)).toBeNull();
});

test("statusOptionsFor: funded không có 'đã qua'", () => {
  expect(statusOptionsFor(STATUSES, "phase_1")).toEqual(STATUSES);
  expect(statusOptionsFor(STATUSES, "funded")).toEqual(["in_progress", "failed"]);
});

describe("challengeActions", () => {
  const kinds = (phase: string, status: string) =>
    challengeActions(PHASES, phase, status).map((a) => a.kind);

  test("đang thi ở vòng 1: qua hoặc thất bại", () => {
    expect(kinds("phase_1", "in_progress")).toEqual(["pass", "fail"]);
  });
  test("đã qua vòng 1: lên vòng 2, gửi đúng một khoá", () => {
    expect(challengeActions(PHASES, "phase_1", "passed")).toEqual([
      { kind: "advance", patch: { challenge_phase: "phase_2" } },
    ]);
  });
  test("funded đang giao dịch: chỉ thất bại", () => {
    expect(kinds("funded", "in_progress")).toEqual(["fail"]);
  });
  test("đã thất bại: không còn thao tác nhanh nào", () => {
    expect(kinds("phase_2", "failed")).toEqual([]);
  });
});

test.each([
  [null, "0%"],
  ["0", "0%"],
  ["-0.2", "0%"],
  ["0.425", "42.5%"],
  ["0.33333", "33.3%"],
  ["1", "100%"],
  ["1.8", "100%"],
])("meterWidth(%s) = %s", (ratio, want) => {
  expect(meterWidth(ratio)).toBe(want);
});

test.each([
  [null, "calm"],
  ["0.2", "calm"],
  ["0.5", "warning"],
  ["0.79", "warning"],
  ["0.8", "danger"],
  ["1.2", "danger"],
])("drawdownTone(%s) = %s", (usage, want) => {
  expect(drawdownTone(usage)).toBe(want);
});

test("isReached", () => {
  expect(isReached(null)).toBe(false);
  expect(isReached("0.99")).toBe(false);
  expect(isReached("1")).toBe(true);
});

test("splitByType: quỹ xếp đang thi → đã qua → thất bại, cùng trạng thái theo id", () => {
  const acc = (id: number, status: string | null, type: "personal" | "prop" = "prop") =>
    makeAccount({ id, account_type: type, challenge_phase: type === "prop" ? "phase_1" : null, challenge_status: status });
  const { prop, personal } = splitByType([
    acc(1, "failed"),
    acc(2, null, "personal"),
    acc(3, "passed"),
    acc(4, "in_progress"),
    acc(5, "in_progress"),
  ]);
  expect(prop.map((a) => a.id)).toEqual([4, 5, 3, 1]);
  expect(personal.map((a) => a.id)).toEqual([2]);
});

test("readTypeFilter: giá trị lạ về 'all'", () => {
  expect(readTypeFilter(new URLSearchParams("type=prop"))).toBe("prop");
  expect(readTypeFilter(new URLSearchParams("type=personal"))).toBe("personal");
  expect(readTypeFilter(new URLSearchParams("type=x"))).toBe("all");
  expect(readTypeFilter(new URLSearchParams())).toBe("all");
});

test("isOptionalPercent và percentOrNull", () => {
  expect(isOptionalPercent("")).toBe(true);
  expect(isOptionalPercent("  ")).toBe(true);
  expect(isOptionalPercent("8")).toBe(true);
  expect(isOptionalPercent("100")).toBe(true);
  expect(isOptionalPercent("0")).toBe(false);
  expect(isOptionalPercent("100.5")).toBe(false);
  expect(isOptionalPercent("abc")).toBe(false);
  expect(percentOrNull("")).toBeNull();
  expect(percentOrNull(" 8 ")).toBe("0.08");
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/accounts/challenge.test.ts`
Expected: FAIL — `Failed to resolve import "./challenge"`.

- [ ] **Step 3: Mở rộng kiểu**

`frontend/src/features/accounts/types.ts` — thay toàn bộ bằng:

```ts
// Mọi trường tiền là CHUỖI. Backend marshal decimal ra chuỗi JSON chính vì
// float làm mất chữ số; khai kiểu number ở đây là ném đi điều đó ngay tại
// ranh giới.
export type AccountType = "personal" | "prop";

export type Account = {
  id: number;
  code: string;
  name: string;
  initial_balance: string;
  risk_per_trade: string; // phân số: "0.01" là 1%
  currency: string;
  timezone: string;
  one_r: string; // suy diễn, backend tính

  account_type: AccountType;
  prop_firm: string; // "" với tài khoản cá nhân
  // Giá trị lấy từ /meta/enums (challenge_phases, challenge_statuses).
  // null với tài khoản cá nhân.
  challenge_phase: string | null;
  challenge_status: string | null;
  profit_target: string | null; // phân số: "0.1" là 10%
  max_drawdown_limit: string | null; // phân số
};

export type AccountCreate = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  initial_balance: string;
  risk_per_trade: string;

  account_type: AccountType;
  prop_firm?: string;
  challenge_phase?: string;
  challenge_status?: string;
  // null = xoá luật này (PATCH); vắng mặt = không đổi.
  profit_target?: string | null;
  max_drawdown_limit?: string | null;
};

export type AccountPatch = Partial<AccountCreate>;
```

`frontend/src/features/trades/types.ts` — thêm ngay trên `export type Stats`:

```ts
/** Tiến độ thi quỹ. Mọi tỷ lệ là PHÂN SỐ ("0.07" = 7%). */
export type Challenge = {
  profit_pct: string;
  /** null = quỹ không đặt mục tiêu, KHÁC "0". */
  target_progress: string | null;
  drawdown_pct: string;
  /** >= 1 là đã chạm giới hạn drawdown. */
  drawdown_usage: string | null;
};
```

và thêm vào cuối type `Stats` (sau `net_cash_flow: string;`):

```ts
  /** Tiến độ thi quỹ, KHÔNG chịu bộ lọc như current_balance. null = tài khoản cá nhân. */
  challenge: Challenge | null;
```

`frontend/src/features/meta/hooks.ts` — thêm vào type `MetaEnums`, sau `cash_flow_types: string[];`:

```ts
  account_types: string[];
  challenge_phases: string[];
  challenge_statuses: string[];
```

- [ ] **Step 4: Nhãn enum và chuỗi**

`frontend/src/i18n/enumLabels.ts` — thêm ba giá trị vào union `EnumField` (sau `| "cash_flow_type"`):

```ts
  | "account_type"
  | "challenge_phase"
  | "challenge_status"
```

và thay hằng `LABELS` bằng:

```ts
const LABELS: Partial<Record<Locale, Partial<Record<EnumField, Record<string, string>>>>> = {
  vi: {
    cash_flow_type: { deposit: "Nạp", withdraw: "Rút" },
    account_type: { personal: "Cá nhân", prop: "Quỹ" },
    challenge_phase: { phase_1: "Vòng 1", phase_2: "Vòng 2", funded: "Funded" },
    challenge_status: { in_progress: "Đang thi", passed: "Đã qua", failed: "Thất bại" },
  },
  en: {
    cash_flow_type: { deposit: "Deposit", withdraw: "Withdrawal" },
    account_type: { personal: "Personal", prop: "Prop firm" },
    challenge_phase: { phase_1: "Phase 1", phase_2: "Phase 2", funded: "Funded" },
    challenge_status: { in_progress: "In progress", passed: "Passed", failed: "Failed" },
  },
};
```

`frontend/src/i18n/strings.ts` — thêm ngay sau dòng `"accounts.riskMax": ...`:

```ts
  "accounts.type": { vi: "Loại tài khoản", en: "Account type" },
  "accounts.groupProp": { vi: "Tài khoản quỹ", en: "Prop firm accounts" },
  "accounts.groupPersonal": { vi: "Tài khoản cá nhân", en: "Personal accounts" },
  "accounts.filterLabel": { vi: "Lọc theo loại tài khoản", en: "Filter by account type" },
  "accounts.filterAll": { vi: "Tất cả ({n})", en: "All ({n})" },
  "accounts.filterProp": { vi: "Quỹ ({n})", en: "Prop ({n})" },
  "accounts.filterPersonal": { vi: "Cá nhân ({n})", en: "Personal ({n})" },
  "accounts.challengeSection": { vi: "Thử thách quỹ", en: "Prop challenge" },
  "accounts.propFirm": { vi: "Tên quỹ", en: "Prop firm" },
  "accounts.propFirmMax": { vi: "tên quỹ dài quá 64 ký tự", en: "prop firm name is longer than 64 characters" },
  "accounts.phase": { vi: "Vòng", en: "Phase" },
  "accounts.status": { vi: "Trạng thái", en: "Status" },
  "accounts.fundedActive": { vi: "Đang giao dịch", en: "Trading" },
  "accounts.profitTarget": { vi: "Mục tiêu lợi nhuận (%)", en: "Profit target (%)" },
  "accounts.maxDrawdown": { vi: "Max drawdown (%)", en: "Max drawdown (%)" },
  "accounts.ruleHint": { vi: "Để trống nếu quỹ không đặt luật này. Chỉ dùng để hiện tiến độ, không tự đổi trạng thái.", en: "Leave empty if the firm has no such rule. Used only to show progress; it never changes the status." },
  "accounts.percentRange": { vi: "phải lớn hơn 0 và không quá 100%", en: "must be greater than 0 and at most 100%" },
  "accounts.fundedNotPassed": { vi: "tài khoản funded không có trạng thái đã qua", en: "a funded account cannot be marked as passed" },
  "accounts.challengeProgress": { vi: "Tiến độ vòng thi", en: "Challenge progress" },
  "accounts.stepDone": { vi: "đã qua", en: "passed" },
  "accounts.stepCurrent": { vi: "đang ở vòng này", en: "current phase" },
  "accounts.stepFailed": { vi: "thất bại", en: "failed" },
  "accounts.stepUpcoming": { vi: "chưa tới", en: "not reached" },
  "accounts.outcomeInProgress": { vi: "Đang thi {phase}", en: "In {phase}" },
  "accounts.outcomePassed": { vi: "Đã qua {phase}", en: "Passed {phase}" },
  "accounts.outcomeFailed": { vi: "Thất bại ở {phase}", en: "Failed in {phase}" },
  "accounts.outcomeFunded": { vi: "Đang giao dịch tài khoản funded", en: "Trading the funded account" },
  "accounts.outcomeFundedFailed": { vi: "Đã mất tài khoản funded", en: "Lost the funded account" },
  "accounts.meterProfit": { vi: "Lợi nhuận", en: "Profit" },
  "accounts.meterDrawdown": { vi: "Drawdown", en: "Drawdown" },
  "accounts.targetReached": { vi: "Đã đạt mục tiêu lợi nhuận", en: "Profit target reached" },
  "accounts.drawdownBreached": { vi: "Đã chạm giới hạn drawdown", en: "Drawdown limit reached" },
  "accounts.balance": { vi: "Số dư", en: "Balance" },
  "accounts.viewing": { vi: "Đang xem", en: "Viewing" },
  "accounts.view": { vi: "Xem", en: "View" },
  "accounts.viewLabel": { vi: "Xem tài khoản {name}", en: "View account {name}" },
  "accounts.cashFlow": { vi: "Nạp / rút", en: "Deposits / withdrawals" },
  "accounts.cashFlowLabel": { vi: "Nạp / rút cho {code}", en: "Deposits / withdrawals for {code}" },
  "accounts.challengeMenu": { vi: "Cập nhật vòng thi {code}", en: "Update challenge {code}" },
  "accounts.markPassed": { vi: "Đánh dấu đã qua", en: "Mark as passed" },
  "accounts.markFailed": { vi: "Đánh dấu thất bại", en: "Mark as failed" },
  "accounts.advanceTo": { vi: "Lên {phase}", en: "Move to {phase}" },
```

- [ ] **Step 5: Viết hàm thuần**

Tạo `frontend/src/features/accounts/challenge.ts`:

```ts
// Luật hiển thị của tài khoản quỹ. Thuần, không React, để test được không cần
// render — cùng lý do với identity.ts.
//
// Giá trị "funded", "passed", "in_progress", "failed" chép ở đây là hợp đồng
// ASCII của API (như "deposit"), không phải key chấm điểm; danh sách ĐẦY ĐỦ và
// thứ tự vẫn lấy từ /meta/enums qua tham số `phases`/`statuses`.
import { compareDecimal, fractionFromPercent, isPositiveNumber, roundDecimal, shiftDecimal } from "@/lib/decimal";
import type { Account } from "./types";

export type StepState = "done" | "current" | "failed" | "upcoming";
export type Step = { phase: string; state: StepState };

/**
 * Trạng thái của từng nút trên thanh vòng thi.
 *
 * Vòng trước vòng hiện tại luôn là "done": muốn tới Vòng 2 thì phải qua Vòng 1.
 * Vòng lạ (không có trong `phases`) cho cả thanh "upcoming" — vẽ sai một vòng
 * "đã qua" còn tệ hơn không vẽ gì.
 */
export function phaseSteps(phases: readonly string[], phase: string | null, status: string | null): Step[] {
  const at = phase ? phases.indexOf(phase) : -1;
  return phases.map((p, i): Step => {
    if (at < 0 || i > at) return { phase: p, state: "upcoming" };
    if (i < at) return { phase: p, state: "done" };
    if (status === "failed") return { phase: p, state: "failed" };
    if (status === "passed") return { phase: p, state: "done" };
    return { phase: p, state: "current" };
  });
}

export function nextPhase(phases: readonly string[], phase: string | null): string | null {
  const i = phase ? phases.indexOf(phase) : -1;
  return i >= 0 && i < phases.length - 1 ? phases[i + 1] : null;
}

/** Funded là vòng cuối: không còn vòng nào phía sau để "qua" (CHECK của migration 0006). */
export function statusOptionsFor(statuses: readonly string[], phase: string): string[] {
  return phase === "funded" ? statuses.filter((s) => s !== "passed") : [...statuses];
}

export type ChallengeAction =
  | { kind: "pass"; patch: { challenge_status: "passed" } }
  | { kind: "advance"; patch: { challenge_phase: string } }
  | { kind: "fail"; patch: { challenge_status: "failed" } };

/**
 * Thao tác nhanh trên hàng quỹ. Mỗi thao tác là PATCH đúng MỘT khoá.
 *
 * "advance" chỉ gửi challenge_phase: backend tự đưa trạng thái về in_progress
 * khi vòng đổi (service.Update). Gửi kèm in_progress ở đây là chép luật đó
 * sang hai nơi.
 */
export function challengeActions(
  phases: readonly string[],
  phase: string | null,
  status: string | null,
): ChallengeAction[] {
  if (!phase || !status) return [];
  const out: ChallengeAction[] = [];
  const next = nextPhase(phases, phase);
  if (status === "in_progress" && phase !== "funded") {
    out.push({ kind: "pass", patch: { challenge_status: "passed" } });
  }
  if (status === "passed" && next) {
    out.push({ kind: "advance", patch: { challenge_phase: next } });
  }
  if (status === "in_progress") {
    out.push({ kind: "fail", patch: { challenge_status: "failed" } });
  }
  return out;
}

/**
 * Độ rộng CSS của thanh đo từ một tỷ lệ phân số, kẹp trong [0, 100%].
 *
 * Làm hoàn toàn trên chuỗi: styleguard cấm ép tiền sang số ngoài
 * dashboard/prepare.ts, và độ rộng CSS nhận chuỗi "42.5%" là đủ.
 * Lãi âm → 0% (thanh rỗng, con số âm vẫn hiện bằng chữ bên cạnh).
 */
export function meterWidth(ratio: string | null | undefined): string {
  if (ratio == null) return "0%";
  const clamped = compareDecimal(ratio, "0") < 0 ? "0" : compareDecimal(ratio, "1") > 0 ? "1" : ratio;
  return `${roundDecimal(shiftDecimal(clamped, 2), 1)}%`;
}

export type DrawdownTone = "calm" | "warning" | "danger";

/**
 * Màu thanh drawdown theo mức đã dùng của giới hạn. Không dùng --primary ở
 * đây: teal có nghĩa "lãi", một thanh drawdown màu teal đọc ra là tin tốt.
 */
export function drawdownTone(usage: string | null): DrawdownTone {
  if (usage == null) return "calm";
  if (compareDecimal(usage, "0.8") >= 0) return "danger";
  if (compareDecimal(usage, "0.5") >= 0) return "warning";
  return "calm";
}

export function isReached(ratio: string | null): boolean {
  return ratio != null && compareDecimal(ratio, "1") >= 0;
}

const STATUS_RANK: Record<string, number> = { in_progress: 0, passed: 1, failed: 2 };

/**
 * Chia hai nhóm. Nhóm quỹ xếp đang thi → đã qua → thất bại: người thi quỹ
 * tích nhiều account chết theo thời gian, và chúng không được đẩy account
 * đang sống xuống dưới màn hình.
 */
export function splitByType(accounts: Account[]): { prop: Account[]; personal: Account[] } {
  const rank = (a: Account) => STATUS_RANK[a.challenge_status ?? ""] ?? 3;
  const prop = accounts
    .filter((a) => a.account_type === "prop")
    .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  return { prop, personal: accounts.filter((a) => a.account_type !== "prop") };
}

export const TYPE_FILTERS = ["all", "prop", "personal"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export function readTypeFilter(sp: URLSearchParams): TypeFilter {
  const v = sp.get("type");
  return v === "prop" || v === "personal" ? v : "all";
}

/** Ô phần trăm tuỳ chọn: trống, hoặc số trong (0, 100]. */
export function isOptionalPercent(v: string): boolean {
  const s = v.trim();
  return s === "" || (isPositiveNumber(s) && compareDecimal(s, "100") <= 0);
}

/** Ô trống gửi null (xoá luật), còn lại đổi % sang phân số. */
export function percentOrNull(v: string): string | null {
  const s = v.trim();
  return s === "" ? null : fractionFromPercent(s);
}
```

- [ ] **Step 6: Cập nhật fixture**

`frontend/src/test/harness.tsx`, trong `makeAccount`, thêm ngay sau `one_r: "100",`:

```ts
    account_type: "personal",
    prop_firm: "",
    challenge_phase: null,
    challenge_status: null,
    profit_target: null,
    max_drawdown_limit: null,
```

và trong `makeEnums`, thêm sau `cash_flow_types: ["deposit", "withdraw"],`:

```ts
    account_types: ["personal", "prop"],
    challenge_phases: ["phase_1", "phase_2", "funded"],
    challenge_statuses: ["in_progress", "passed", "failed"],
```

`frontend/src/test/tradeFactory.ts`, trong `makeStats`, thêm sau `net_cash_flow: ...,`:

```ts
    challenge: null,
```

Ba literal `Account` viết tay còn lại — `tk` trong `src/features/accounts/cashflow.test.tsx`, `makeAccount` trong `src/features/trades/tradeForm.test.tsx`, `color` trong `src/features/accounts/accounts.test.tsx` — thêm đúng sáu dòng như ở `harness.tsx` ngay sau `one_r`.

- [ ] **Step 7: Chạy test và typecheck**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/accounts/challenge.test.ts`
Expected: `tsc` không lỗi (nếu còn file test nào dựng `Account`/`Stats` bằng tay mà thiếu trường, `tsc` sẽ chỉ đúng file đó — thêm sáu dòng như trên); vitest PASS.

---

### Task 7: `ChallengeRail` và `ProgressMeter`

**Files:**
- Create: `frontend/src/features/accounts/ChallengeRail.tsx`
- Create: `frontend/src/features/accounts/ProgressMeter.tsx`
- Modify: `frontend/src/styles/index.css` (thêm khối `.challenge-rail`)
- Create: `frontend/src/features/accounts/challengeRail.test.tsx`

**Interfaces:**
- Consumes: `phaseSteps`, `meterWidth`, `DrawdownTone` (Task 6); `enumLabel` (Task 6)
- Produces:
  - `ChallengeRail({ phases: readonly string[]; phase: string | null; status: string | null })` — `<ol aria-label="Tiến độ vòng thi">`, mỗi `<li data-state=...>`, vòng hiện tại mang `aria-current="step"`
  - `ProgressMeter({ label: string; value: ReactNode; limit: string; ratio: string | null; tone: "profit" | DrawdownTone })` — `role="group"` với `aria-label={label}`

- [ ] **Step 1: Viết test thất bại**

Tạo `frontend/src/features/accounts/challengeRail.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { ChallengeRail } from "./ChallengeRail";
import { ProgressMeter } from "./ProgressMeter";

const PHASES = ["phase_1", "phase_2", "funded"];

test("thanh vòng: trạng thái nằm ở data-state VÀ ở chữ cho trình đọc màn hình", () => {
  render(<ChallengeRail phases={PHASES} phase="phase_2" status="failed" />);

  const rail = screen.getByRole("list", { name: "Tiến độ vòng thi" });
  const items = within(rail).getAllByRole("listitem");
  expect(items.map((li) => li.dataset.state)).toEqual(["done", "failed", "upcoming"]);
  expect(items[1]).toHaveAttribute("aria-current", "step");
  expect(items[1]).toHaveTextContent("Vòng 2: thất bại");
  expect(items[0]).toHaveTextContent("Vòng 1: đã qua");
});

test("chưa có danh sách vòng (meta chưa về) thì không vẽ gì", () => {
  const { container } = render(<ChallengeRail phases={[]} phase="phase_1" status="in_progress" />);
  expect(container).toBeEmptyDOMElement();
});

test("thanh đo kẹp độ rộng và giữ con số bằng chữ", () => {
  render(<ProgressMeter label="Lợi nhuận" value="12,00%" limit="10,00%" ratio="1.2" tone="profit" />);

  const meter = screen.getByRole("group", { name: "Lợi nhuận" });
  expect(meter).toHaveTextContent("12,00%");
  expect(meter).toHaveTextContent("10,00%");
  expect(meter.querySelector("[data-fill]")).toHaveStyle({ width: "100%" });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/accounts/challengeRail.test.tsx`
Expected: FAIL — không resolve được `./ChallengeRail`.

- [ ] **Step 3: Cài đặt**

Tạo `frontend/src/features/accounts/ChallengeRail.tsx`:

```tsx
import { XIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { phaseSteps } from "./challenge";

const STATE_KEY = {
  done: "accounts.stepDone",
  current: "accounts.stepCurrent",
  failed: "accounts.stepFailed",
  upcoming: "accounts.stepUpcoming",
} as const;

/**
 * Thanh ba vòng: điểm nhấn DUY NHẤT của một hàng quỹ (spec §6.3).
 *
 * Một danh sách có thứ tự thật (<ol>), vì vòng thi đúng là một chuỗi — đây
 * là chỗ hiếm hoi mà đánh số là thông tin chứ không phải trang trí.
 *
 * Trạng thái nói bằng HÌNH của nút (CSS theo data-state) và bằng CHỮ ẩn cho
 * trình đọc màn hình; màu chỉ bổ sung. Câu kết cục đầy đủ ("Thất bại ở Vòng
 * 2") nằm ngay dưới thanh, do ChallengeBlock vẽ.
 */
export function ChallengeRail({
  phases,
  phase,
  status,
}: {
  phases: readonly string[];
  phase: string | null;
  status: string | null;
}) {
  const { t, locale } = useI18n();
  const steps = phaseSteps(phases, phase, status);
  if (steps.length === 0) return null;

  return (
    <ol className="challenge-rail" aria-label={t("accounts.challengeProgress")}>
      {steps.map((s) => (
        <li key={s.phase} data-state={s.state} aria-current={s.phase === phase ? "step" : undefined}>
          <span className="challenge-node" aria-hidden>
            {s.state === "failed" && <XIcon className="size-2.5" strokeWidth={3} />}
          </span>
          <span className="challenge-label">
            {enumLabel("challenge_phase", s.phase, locale, [...phases])}
            <span className="sr-only">: {t(STATE_KEY[s.state])}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
```

Tạo `frontend/src/features/accounts/ProgressMeter.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { meterWidth, type DrawdownTone } from "./challenge";

const FILL: Record<"profit" | DrawdownTone, string> = {
  profit: "bg-primary",
  calm: "bg-border-strong",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/**
 * Một luật của quỹ: nhãn, con số hiện tại / giới hạn, và thanh.
 *
 * Thanh aria-hidden: con số bằng chữ đã nói đủ, và role="meter" đòi
 * aria-valuenow là số — tức là ép tỷ lệ sang number, điều styleguard cấm.
 */
export function ProgressMeter({
  label,
  value,
  limit,
  ratio,
  tone,
}: {
  label: string;
  value: ReactNode;
  limit: string;
  ratio: string | null;
  tone: "profit" | DrawdownTone;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs sm:grid-cols-[5rem_8.5rem_minmax(0,1fr)]"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="num">
        {value} <span className="text-muted-foreground">/ {limit}</span>
      </span>
      <span aria-hidden className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-sunken sm:col-span-1">
        <span data-fill className={cn("block h-full rounded-full", FILL[tone])} style={{ width: meterWidth(ratio) }} />
      </span>
    </div>
  );
}
```

Thêm vào cuối `frontend/src/styles/index.css`:

```css
/* Thanh vòng thi (trang Tài khoản). Mỗi <li> là một cột bằng nhau; nút nằm
   đầu cột và đoạn nối chạy từ nút tới hết cột, chạm nút của cột sau — nên
   thêm/bớt vòng thì CSS không phải đổi.

   Hình của nút là tín hiệu chính, màu chỉ bổ sung (spec §6.3):
     done      tròn đặc teal
     current   vòng teal, chấm teal ở giữa
     failed    tròn đặc đỏ, dấu ✕, đoạn nối phía sau đứt nét
     upcoming  vòng xám rỗng */
.challenge-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}

.challenge-rail > li {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.challenge-rail > li:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 5px;
  left: 18px;
  right: 6px;
  height: 2px;
  border-radius: var(--border-radius-full);
  background-color: var(--border-default);
}

.challenge-rail > li[data-state="done"]:not(:last-child)::after {
  background-color: var(--primary);
}

.challenge-rail > li[data-state="failed"]:not(:last-child)::after {
  height: 0;
  background-color: transparent;
  border-top: 2px dashed var(--border-default);
}

.challenge-node {
  display: grid;
  place-items: center;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-strong);
  border-radius: var(--border-radius-full);
  background-color: var(--surface-base);
  color: var(--primary-foreground);
}

[data-state="done"] > .challenge-node {
  border-color: var(--primary);
  background-color: var(--primary);
}

[data-state="current"] > .challenge-node {
  border-color: var(--primary);
  background: radial-gradient(circle, var(--primary) 0 2px, var(--surface-base) 2.5px);
}

[data-state="failed"] > .challenge-node {
  border-color: var(--status-error);
  background-color: var(--status-error);
}

.challenge-label {
  font-size: var(--text-xs);
  line-height: 1.2;
  color: var(--text-muted);
}

.challenge-rail > li[aria-current="step"] > .challenge-label {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd frontend && npx vitest run src/features/accounts/challengeRail.test.tsx src/test/styleguard.test.ts`
Expected: PASS — styleguard xác nhận không có hex, không có `shadow-*`.

---

### Task 8: Hàng account, trang chia nhóm, panel nạp/rút

**Files:**
- Create: `frontend/src/features/accounts/useAccountStats.ts`
- Create: `frontend/src/features/accounts/ChallengeBlock.tsx`
- Create: `frontend/src/features/accounts/AccountRow.tsx`
- Create: `frontend/src/features/accounts/CashFlowSheet.tsx`
- Modify: `frontend/src/features/accounts/CashFlowPanel.tsx` (thêm prop `showTitle`)
- Modify: `frontend/src/features/accounts/AccountsPage.tsx` (viết lại)
- Modify: `frontend/src/features/accounts/accounts.test.tsx`

**Interfaces:**
- Consumes: `splitByType`, `readTypeFilter`, `TYPE_FILTERS`, `drawdownTone`, `isReached` (Task 6); `ChallengeRail`, `ProgressMeter` (Task 7); `qk.stats`, `EMPTY_FILTER`, `toQuery`; `useActiveAccount().choose`; `accountLabel`, `accountSubLabel`, `accountChipIndex`; `signAndColor` (`lib/thresholds.ts`); `Segmented`; `Sheet`, `SheetContent`, `SheetTitle`
- Produces:
  - `useAccountStats(accounts: Account[]): Map<number, Stats | undefined>`
  - `AccountRow({ account, stats, active, onView })` — `<article aria-labelledby>` mang tên = `accountLabel(account)`; có chỗ cắm `ChallengeMenu` (Task 10)
  - `CashFlowPanel` nhận thêm `showTitle?: boolean` (mặc định `true`)

- [ ] **Step 1: Viết lại test của trang (fail trước)**

Trong `frontend/src/features/accounts/accounts.test.tsx`:

1. Thêm import `makeEnums` và `makeStats`:

```ts
import { makeEnums } from "@/test/harness";
import { makeStats } from "@/test/tradeFactory";
```

2. Thay mảng `background` bằng:

```ts
// Trang gọi /stats cho từng account và /meta/enums cho thanh vòng thi. MSW
// đang bật onUnhandledRequest:"error" — thiếu handler nền thì test đỏ vì lý
// do chẳng liên quan gì đến account.
const background = [
  http.get(`${BASE}/meta/enums`, () => envelope(makeEnums())),
  http.get(`${BASE}/accounts/:id/cash-flows`, () => envelope([])),
  http.get(`${BASE}/accounts/:id/stats`, () => envelope(makeStats({ current_balance: "10250", net_return_pct: "0.025" }))),
];
```

3. Đổi mọi `screen.findByRole("row", { name: /X/ })` thành `screen.findByRole("article", { name: /X/ })`. Tên của article là **tên** account (`accountLabel`), không phải mã — nên:
   - test "hiện risk dưới dạng % ..." : `findByRole("article", { name: "Quỹ thử thách" })`
   - test "tạo mới gửi risk dạng phân số": `findByRole("article", { name: "Quỹ thử thách" })`
   - test "sửa chỉ gửi đúng field đã đổi": lần chờ đầu `findByRole("article", { name: "Quỹ thử thách" })`, lần chờ sau `findByRole("article", { name: "Tên mới" })`
   - các test còn lại: thay tương tự theo tên account mà chúng dựng.

4. Thêm vào cuối file:

```ts
const prop = (over: Partial<typeof color> = {}) => ({
  ...color,
  id: 2,
  code: "FT-01",
  name: "FTMO 100k",
  account_type: "prop" as const,
  prop_firm: "FTMO",
  challenge_phase: "phase_1",
  challenge_status: "in_progress",
  profit_target: "0.1",
  max_drawdown_limit: "0.1",
  ...over,
});

test("chia hai nhóm, quỹ lên trước, có thanh vòng và câu kết cục", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([color, prop()])),
    http.get(`${BASE}/accounts/2/stats`, () =>
      envelope(
        makeStats({
          challenge: { profit_pct: "0.042", target_progress: "0.42", drawdown_pct: "0.021", drawdown_usage: "0.21" },
        }),
      ),
    ),
  );
  renderPage();

  const propGroup = await screen.findByRole("region", { name: /Tài khoản quỹ/ });
  const row = within(propGroup).getByRole("article", { name: "FTMO 100k" });
  expect(within(row).getByRole("list", { name: "Tiến độ vòng thi" })).toBeInTheDocument();
  expect(within(row).getByText("Đang thi Vòng 1")).toBeInTheDocument();
  expect(await within(row).findByRole("group", { name: "Lợi nhuận" })).toHaveTextContent("4,20%");

  const personalGroup = screen.getByRole("region", { name: /Tài khoản cá nhân/ });
  const personalRow = within(personalGroup).getByRole("article", { name: "Quỹ thử thách" });
  expect(within(personalRow).queryByRole("list", { name: "Tiến độ vòng thi" })).toBeNull();
});

test("bộ lọc chỉ hiện khi có cả hai loại, và lọc được", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color, prop()])));
  renderPage();

  const filter = await screen.findByRole("radiogroup", { name: "Lọc theo loại tài khoản" });
  // Nội suy MỘT ngoặc: phải ra "Quỹ (1)", không phải "Quỹ ({n})" hay "{{n}}".
  await userEvent.click(within(filter).getByRole("radio", { name: "Quỹ (1)" }));

  expect(screen.queryByRole("region", { name: /Tài khoản cá nhân/ })).toBeNull();
  expect(screen.getByRole("region", { name: /Tài khoản quỹ/ })).toBeInTheDocument();
});

test("chỉ có một loại thì không có bộ lọc", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color])));
  renderPage();
  await screen.findByRole("article", { name: "Quỹ thử thách" });
  expect(screen.queryByRole("radiogroup", { name: "Lọc theo loại tài khoản" })).toBeNull();
});

test("quỹ thất bại xuống cuối nhóm", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () =>
      envelope([prop({ id: 3, name: "Chết", challenge_status: "failed" }), prop({ id: 4, name: "Sống" })]),
    ),
  );
  renderPage();

  await screen.findByRole("article", { name: "Sống" });
  const names = screen.getAllByRole("article").map((a) => a.querySelector("h3")?.textContent);
  expect(names).toEqual(["Sống", "Chết"]);
});

test("nạp/rút mở trong panel của đúng account", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color])));
  renderPage();

  await userEvent.click(await screen.findByRole("button", { name: "Nạp / rút cho FTMO" }));

  expect(await screen.findByRole("dialog", { name: "Nạp / rút — FTMO" })).toBeInTheDocument();
});

test("stats lỗi vẫn hiện account và nút", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([color])),
    http.get(`${BASE}/accounts/:id/stats`, () => HttpResponse.json({ code: 1500, msg: "lỗi", data: null }, { status: 500 })),
  );
  renderPage();

  const row = await screen.findByRole("article", { name: "Quỹ thử thách" });
  expect(within(row).getByRole("button", { name: "Sửa FTMO" })).toBeInTheDocument();
});
```

Ghi chú: `<section>` chỉ mang role `region` khi nó có tên (`aria-labelledby`) — đúng như `AccountGroup` ở Step 7 làm. Tên nhóm gồm cả số đếm ("Tài khoản quỹ 1"), nên test dùng regex.

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/accounts/accounts.test.tsx`
Expected: FAIL — không tìm thấy role `article`.

- [ ] **Step 3: Hook stats cho nhiều account**

Tạo `frontend/src/features/accounts/useAccountStats.ts`:

```ts
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { EMPTY_FILTER, toQuery } from "@/features/trades/filters";
import type { Stats } from "@/features/trades/types";
import type { Account } from "./types";

/**
 * /stats KHÔNG filter cho từng account — số dư thật và tiến độ thi.
 *
 * Key trùng hệt useStats(id, EMPTY_FILTER) của trang Lệnh, nên hai trang dùng
 * chung cache, và mọi chỗ đang invalidate statsAll(id) (tạo lệnh, nạp/rút,
 * import) làm tươi luôn hàng này mà không phải nhớ thêm gì.
 *
 * N request cho N account là cố ý: một người có hàng chục account trở xuống
 * (spec §5). Endpoint tổng hợp riêng là tối ưu sớm.
 */
export function useAccountStats(accounts: Account[]): Map<number, Stats | undefined> {
  const results = useQueries({
    queries: accounts.map((a) => ({
      queryKey: qk.stats(a.id, EMPTY_FILTER),
      queryFn: () => api.get<Stats>(`/accounts/${a.id}/stats${toQuery(EMPTY_FILTER, 1)}`),
    })),
  });
  return new Map(accounts.map((a, i) => [a.id, results[i]?.data]));
}
```

- [ ] **Step 4: Khối thử thách**

Tạo `frontend/src/features/accounts/ChallengeBlock.tsx`:

```tsx
import { useMetaEnums } from "@/features/meta/hooks";
import type { Challenge } from "@/features/trades/types";
import { useI18n, type Locale, type Translate } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { formatPercent } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { drawdownTone, isReached } from "./challenge";
import { ChallengeRail } from "./ChallengeRail";
import { ProgressMeter } from "./ProgressMeter";
import type { Account } from "./types";

function outcomeText(t: Translate, locale: Locale, phases: string[], a: Account): string {
  if (a.challenge_phase === "funded") {
    return t(a.challenge_status === "failed" ? "accounts.outcomeFundedFailed" : "accounts.outcomeFunded");
  }
  const phase = enumLabel("challenge_phase", a.challenge_phase ?? "", locale, phases);
  if (a.challenge_status === "passed") return t("accounts.outcomePassed", { phase });
  if (a.challenge_status === "failed") return t("accounts.outcomeFailed", { phase });
  return t("accounts.outcomeInProgress", { phase });
}

/**
 * Cột giữa của hàng quỹ: thanh vòng, câu kết cục, hai thanh luật, gợi ý.
 *
 * Gợi ý chỉ nói, không làm (spec §6.3 nguyên tắc 5): đạt mục tiêu thì hiện
 * câu "Đã đạt mục tiêu" — người dùng tự bấm "Đánh dấu đã qua" ở menu. Và chỉ
 * hiện khi vòng còn đang thi: account đã thất bại không cần được nhắc là nó
 * chạm drawdown.
 */
export function ChallengeBlock({ account, challenge }: { account: Account; challenge: Challenge | null }) {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const phases = enums?.challenge_phases ?? [];
  const running = account.challenge_status === "in_progress";

  const profit = challenge ? signAndColor(challenge.profit_pct) : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ChallengeRail phases={phases} phase={account.challenge_phase} status={account.challenge_status} />
      <p className="text-sm">{outcomeText(t, locale, phases, account)}</p>

      {challenge && profit && account.profit_target && (
        <ProgressMeter
          label={t("accounts.meterProfit")}
          value={<span className={profit.colorClass}>{`${profit.sign}${formatPercent(challenge.profit_pct, 2, locale)}`}</span>}
          limit={formatPercent(account.profit_target, 2, locale)}
          ratio={challenge.target_progress}
          tone="profit"
        />
      )}
      {challenge && account.max_drawdown_limit && (
        <ProgressMeter
          label={t("accounts.meterDrawdown")}
          value={formatPercent(challenge.drawdown_pct, 2, locale)}
          limit={formatPercent(account.max_drawdown_limit, 2, locale)}
          ratio={challenge.drawdown_usage}
          tone={drawdownTone(challenge.drawdown_usage)}
        />
      )}

      {running && challenge && isReached(challenge.drawdown_usage) && (
        <p className="text-xs text-destructive">{t("accounts.drawdownBreached")}</p>
      )}
      {running && challenge && !isReached(challenge.drawdown_usage) && isReached(challenge.target_progress) && (
        <p className="text-xs text-primary">{t("accounts.targetReached")}</p>
      )}
    </div>
  );
}
```

Ghi chú cho test đầu ở Step 1: `formatPercent("0.042", 2, "vi")` ra `"4,20%"`, kèm dấu `+` từ `signAndColor` → chữ trong ô là `"+4,20%"`; `toHaveTextContent("4,20%")` khớp chuỗi con nên vẫn đúng.

- [ ] **Step 5: Panel nạp/rút**

Trong `frontend/src/features/accounts/CashFlowPanel.tsx`, đổi chữ ký:

```tsx
export function CashFlowPanel({ account, showTitle = true }: { account: Account; showTitle?: boolean }) {
```

và đổi dòng tiêu đề `<h2 ...>{t("cashflow.title", ...)}</h2>` thành:

```tsx
      {/* Trong Sheet thì SheetTitle đã là tiêu đề của hộp thoại; vẽ thêm h2
          này là trình đọc màn hình đọc cùng một câu hai lần. */}
      {showTitle && <h2 className="text-lg font-semibold">{t("cashflow.title", { code: account.code })}</h2>}
```

Tạo `frontend/src/features/accounts/CashFlowSheet.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { CashFlowPanel } from "./CashFlowPanel";
import type { Account } from "./types";

/**
 * Nạp/rút của MỘT account, mở từ hàng của nó.
 *
 * Trước đây panel treo dưới bảng và luôn thuộc account đang chọn ở sidebar —
 * muốn nạp cho account khác phải đổi account toàn app trước. Panel bên phải
 * gắn thẳng vào hàng nên không còn bước đó.
 *
 * Chỉ mount CashFlowPanel khi mở: mỗi panel gọi /cash-flows, và một trang
 * mười account không cần mười request cho mười panel đang đóng.
 */
export function CashFlowSheet({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("accounts.cashFlowLabel", { code: account.code })}
        onClick={() => setOpen(true)}
      >
        {t("accounts.cashFlow")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="w-full gap-4 overflow-y-auto bg-surface-modal p-6 sm:max-w-xl"
        >
          <SheetTitle>{t("cashflow.title", { code: account.code })}</SheetTitle>
          {open && <CashFlowPanel account={account} showTitle={false} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Hàng account**

Tạo `frontend/src/features/accounts/AccountRow.tsx`:

```tsx
import { useId } from "react";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";
import { formatPercent, percentFromFraction } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { cn } from "@/lib/utils";
import { AccountFormDialog } from "./AccountFormDialog";
import { CashFlowSheet } from "./CashFlowSheet";
import { ChallengeBlock } from "./ChallengeBlock";
import { accountChipIndex, accountLabel, accountSubLabel } from "./identity";
import type { Account } from "./types";

/**
 * Một hàng của sổ tài khoản (spec §6.2).
 *
 * Hàng quỹ ba cột: danh tính | thanh vòng + luật | số dư + nút. Hàng cá nhân
 * hai cột — không có cột giữa, không vẽ khung rỗng cho nó (nguyên tắc 4).
 * Dưới md mọi thứ xếp dọc theo đúng thứ tự đó.
 */
export function AccountRow({
  account,
  stats,
  active,
  onView,
}: {
  account: Account;
  stats: Stats | undefined;
  active: boolean;
  onView: () => void;
}) {
  const { t } = useI18n();
  const nameId = useId();
  const isProp = account.account_type === "prop";
  const sub = accountSubLabel(account);

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "grid gap-4 p-4 md:items-start md:gap-6",
        isProp ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]" : "md:grid-cols-[minmax(0,1fr)_auto]",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span className="account-chip mt-1" data-chip={accountChipIndex(account.id)} aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 id={nameId} className="truncate text-[length:var(--text-md)] font-semibold">
              {accountLabel(account)}
            </h3>
            {active && (
              <span className="shrink-0 rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
                {t("accounts.viewing")}
              </span>
            )}
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {sub && <span className="num">{sub}</span>}
            {isProp && account.prop_firm && <span>{account.prop_firm}</span>}
            <span>{account.timezone}</span>
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{t("accounts.risk")}</dt>
              {/* Một chuỗi duy nhất, không phải {bieu_thuc}% — tách làm hai text
                  node thì getByText("1%") không khớp được. */}
              <dd className="num">{`${percentFromFraction(account.risk_per_trade)}%`}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{t("accounts.oneR")}</dt>
              <dd>
                <MoneyText value={account.one_r} currency={account.currency} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {isProp && <ChallengeBlock account={account} challenge={stats?.challenge ?? null} />}

      <div className="flex flex-col gap-3 md:items-end">
        <Balance account={account} stats={stats} />
        <div className="flex flex-wrap gap-2 md:justify-end">
          {!active && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("accounts.viewLabel", { name: accountLabel(account) })}
              onClick={onView}
            >
              {t("accounts.view")}
            </Button>
          )}
          <CashFlowSheet account={account} />
          <AccountFormDialog account={account} />
          {/* Task 10 cắm ChallengeMenu vào đây. */}
        </div>
      </div>
    </article>
  );
}

/**
 * Số dư thật + lãi/lỗ trên vốn ban đầu. Stats chưa về hoặc lỗi thì vẽ vạch
 * ngang: hàng vẫn dùng được (sửa, nạp/rút), chỉ thiếu con số.
 */
function Balance({ account, stats }: { account: Account; stats: Stats | undefined }) {
  const { t, locale } = useI18n();
  const ret = stats?.net_return_pct ?? null;
  const tone = ret ? signAndColor(ret) : null;

  return (
    <div role="group" aria-label={t("accounts.balance")} className="flex flex-col md:items-end">
      <span className="text-[length:var(--text-md)] font-medium">
        {stats ? (
          <MoneyText value={stats.current_balance} currency={account.currency} />
        ) : (
          <span className="text-muted-foreground">{t("common.noValue")}</span>
        )}
      </span>
      {ret && tone && <span className={cn("num text-xs", tone.colorClass)}>{`${tone.sign}${formatPercent(ret, 2, locale)}`}</span>}
    </div>
  );
}
```

- [ ] **Step 7: Viết lại trang**

Thay toàn bộ `frontend/src/features/accounts/AccountsPage.tsx` bằng:

```tsx
import { useId } from "react";
import { useSearchParams } from "react-router";
import { ErrorBlock } from "@/components/AccountGate";
import { Loading } from "@/components/Loading";
import { Segmented } from "@/components/ui/segmented";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";
import { useActiveAccount } from "./activeAccount";
import { AccountFormDialog } from "./AccountFormDialog";
import { AccountRow } from "./AccountRow";
import { readTypeFilter, splitByType, TYPE_FILTERS, type TypeFilter } from "./challenge";
import { useAccounts } from "./hooks";
import type { Account } from "./types";
import { useAccountStats } from "./useAccountStats";

const FILTER_KEY = {
  all: "accounts.filterAll",
  prop: "accounts.filterProp",
  personal: "accounts.filterPersonal",
} as const;

export function AccountsPage() {
  const { data, isPending, error } = useAccounts();
  const { account: active, choose } = useActiveAccount();
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();

  const accounts = data ?? [];
  const stats = useAccountStats(accounts);
  const { prop, personal } = splitByType(accounts);

  // Bộ lọc chỉ có nghĩa khi có cả hai loại. Có một loại mà vẫn hiện nó là
  // bày ra ba nút, hai trong đó cho cùng một kết quả.
  const showFilter = prop.length > 0 && personal.length > 0;
  const filter: TypeFilter = showFilter ? readTypeFilter(sp) : "all";
  const count: Record<TypeFilter, number> = { all: accounts.length, prop: prop.length, personal: personal.length };

  function setFilter(v: TypeFilter) {
    const next = new URLSearchParams(sp);
    if (v === "all") next.delete("type");
    else next.set("type", v);
    setSp(next, { replace: true });
  }

  const groupProps = { stats, activeId: active?.id ?? null, onView: choose };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("accounts.title")}</h1>
        <AccountFormDialog />
      </header>

      {isPending && <Loading row={3} />}
      {error && <ErrorBlock error={error} />}
      {data && data.length === 0 && <p className="text-muted-foreground">{t("accounts.empty")}</p>}

      {showFilter && (
        <Segmented
          className="w-auto self-start"
          label={t("accounts.filterLabel")}
          value={filter}
          onChange={setFilter}
          options={TYPE_FILTERS}
          renderOption={(o) => t(FILTER_KEY[o], { n: count[o] })}
        />
      )}

      {prop.length > 0 && filter !== "personal" && (
        <AccountGroup title={t("accounts.groupProp")} accounts={prop} {...groupProps} />
      )}
      {personal.length > 0 && filter !== "prop" && (
        <AccountGroup title={t("accounts.groupPersonal")} accounts={personal} {...groupProps} />
      )}
    </section>
  );
}

/**
 * Một nhóm = MỘT khung viền, các account là hàng ngăn bằng vạch — trang sổ
 * cái, không phải lưới thẻ (spec §6.3 nguyên tắc 2). Theme tắt shadow nên
 * phân tầng bằng border + bg-card trên nền trang.
 */
function AccountGroup({
  title,
  accounts,
  stats,
  activeId,
  onView,
}: {
  title: string;
  accounts: Account[];
  stats: Map<number, Stats | undefined>;
  activeId: number | null;
  onView: (id: number) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="flex items-baseline gap-2 text-[length:var(--text-md)] font-semibold">
        {title}
        <span className="num text-sm font-normal text-muted-foreground">{accounts.length}</span>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {accounts.map((a) => (
          <li key={a.id}>
            <AccountRow account={a} stats={stats.get(a.id)} active={a.id === activeId} onView={() => onView(a.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`useActiveAccount()` trả `{ account, accounts, choose }`, với `choose: (id: number) => void` — đúng như `AccountSwitcher.tsx` đang gọi `choose(+v)`.

- [ ] **Step 8: Chạy test, xác nhận pass**

Run: `cd frontend && npx vitest run src/features/accounts/ src/app/`
Expected: PASS. Nếu `src/app/shell.test.tsx` hay test nào khác render `/accounts` báo `onUnhandledRequest` cho `/meta/enums` hoặc `/accounts/:id/stats`, thêm handler đó vào `server.use(...)` nền của file ấy (dùng `makeEnums()` / `makeStats()`) — không nới `onUnhandledRequest`.

---

### Task 9: Form thêm/sửa có loại tài khoản và nhóm thử thách

**Files:**
- Modify: `frontend/src/features/accounts/AccountFormDialog.tsx`
- Test: `frontend/src/features/accounts/accounts.test.tsx`

**Interfaces:**
- Consumes: `isOptionalPercent`, `percentOrNull`, `statusOptionsFor` (Task 6); `useMetaEnums` (Task 6); `Segmented`
- Produces: POST/PATCH mang `account_type`, `prop_firm`, `challenge_phase`, `challenge_status`, `profit_target`, `max_drawdown_limit` đúng ngữ nghĩa của Task 4 (PATCH chỉ gửi khoá đã đổi; ô tỷ lệ để trống gửi `null`).

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `frontend/src/features/accounts/accounts.test.tsx` (dùng lại helper `prop()` của Task 8; thêm `waitFor` vào import từ `@testing-library/react`):

```ts
test("tạo tài khoản quỹ gửi loại, vòng và mục tiêu dạng phân số", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      const fresh = { ...prop(), ...submitted, id: 9 };
      store.push(fresh);
      return envelope(fresh);
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "FT1");
  await userEvent.type(within(box).getByLabelText("Tên"), "FTMO 100k");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "100000");
  await userEvent.type(within(box).getByLabelText("Tên quỹ"), "FTMO");
  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 2" }));
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "8");
  await userEvent.type(within(box).getByLabelText("Max drawdown (%)"), "10");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted).toMatchObject({
    account_type: "prop",
    prop_firm: "FTMO",
    challenge_phase: "phase_2",
    challenge_status: "in_progress",
    profit_target: "0.08",
    max_drawdown_limit: "0.1",
  });
});

test("tạo tài khoản cá nhân không gửi trường nào của quỹ", async () => {
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([])),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope({ ...color, ...submitted });
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "MAIN");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "5000");
  expect(within(box).queryByLabelText("Tên quỹ")).toBeNull();
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted).toMatchObject({ account_type: "personal" });
  expect(submitted).not.toHaveProperty("challenge_phase");
  expect(submitted).not.toHaveProperty("profit_target");
});

test("ở vòng Funded không có lựa chọn Đã qua", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  const status = within(box).getByRole("radiogroup", { name: "Trạng thái" });
  expect(within(status).getByRole("radio", { name: "Đã qua" })).toBeInTheDocument();

  await userEvent.click(within(box).getByRole("radio", { name: "Funded" }));

  expect(within(status).queryByRole("radio", { name: "Đã qua" })).toBeNull();
  expect(within(status).getByRole("radio", { name: "Đang giao dịch" })).toBeInTheDocument();
});

test("chuyển quỹ về cá nhân chỉ gửi account_type", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      store[0] = { ...store[0], ...submitted } as ReturnType<typeof prop>;
      return envelope(store[0]);
    }),
  );
  renderPage();
  await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FT-01" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(within(box).getByRole("radio", { name: "Cá nhân" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).toEqual({ account_type: "personal" }));
});

test("xoá trống mục tiêu gửi null", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope({ ...store[0], ...submitted });
    }),
  );
  renderPage();
  await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FT-01" }));
  const box = await screen.findByRole("dialog");
  const target = within(box).getByLabelText("Mục tiêu lợi nhuận (%)");
  expect(target).toHaveValue("10");
  await userEvent.clear(target);
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).toEqual({ profit_target: null }));
});

test("mục tiêu quá 100% bị chặn ở client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "150");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  expect(await within(box).findByText("phải lớn hơn 0 và không quá 100%")).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/accounts/accounts.test.tsx`
Expected: FAIL — không có radio "Quỹ".

- [ ] **Step 3: Cài đặt**

Trong `frontend/src/features/accounts/AccountFormDialog.tsx`:

(a) Thêm import:

```tsx
import { Segmented } from "@/components/ui/segmented";
import { useMetaEnums } from "@/features/meta/hooks";
import { enumLabel } from "@/i18n/enumLabels";
import { isOptionalPercent, percentOrNull, statusOptionsFor } from "./challenge";
import type { AccountType } from "./types";
```

(b) Thay `makeSchema` bằng:

```tsx
function makeSchema(t: Translate) {
  const optionalPercent = z.string().refine(isOptionalPercent, t("accounts.percentRange"));
  return z
    .object({
      code: z
        .string()
        .trim()
        .min(1, t("accounts.codeRequired"))
        .max(32, t("accounts.codeMax")),
      name: z.string().trim(),
      currency: z
        .string()
        .trim()
        .min(1, t("accounts.currencyRequired"))
        .max(8, t("accounts.currencyMax")),
      timezone: z.string().min(1, t("accounts.timezoneRequired")),
      initial_balance: z.string().refine(isPositiveNumber, t("accounts.initialBalancePositive")),
      risk_percent: z
        .string()
        .refine(isPositiveNumber, t("accounts.riskPositive"))
        .refine((v) => compareDecimal(v, "100") <= 0, t("accounts.riskMax")),
      account_type: z.string(),
      prop_firm: z.string().trim().max(64, t("accounts.propFirmMax")),
      challenge_phase: z.string(),
      challenge_status: z.string(),
      profit_target_percent: optionalPercent,
      max_drawdown_percent: optionalPercent,
    })
    // Trùng CHECK accounts_funded_not_passed của migration 0006. UI đã giấu
    // lựa chọn "Đã qua" ở Funded, nên nhánh này chỉ bắt được khi ai đó sửa UI
    // mà quên luật — rẻ để giữ.
    .refine(
      (v) => !(v.account_type === "prop" && v.challenge_phase === "funded" && v.challenge_status === "passed"),
      { message: t("accounts.fundedNotPassed"), path: ["challenge_status"] },
    );
}
```

(c) Thay `DEFAULTS` và `tuAccount` bằng:

```tsx
const DEFAULTS: Fields = {
  code: "",
  name: "",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "",
  risk_percent: "1",
  account_type: "personal",
  prop_firm: "",
  challenge_phase: "phase_1",
  challenge_status: "in_progress",
  profit_target_percent: "",
  max_drawdown_percent: "",
};

function tuAccount(a: Account): Fields {
  return {
    code: a.code,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    initial_balance: a.initial_balance,
    risk_percent: percentFromFraction(a.risk_per_trade),
    account_type: a.account_type,
    prop_firm: a.prop_firm,
    // Account cá nhân vẫn cần giá trị khởi đầu: người dùng có thể chuyển nó
    // sang Quỹ ngay trong form này.
    challenge_phase: a.challenge_phase ?? "phase_1",
    challenge_status: a.challenge_status ?? "in_progress",
    profit_target_percent: a.profit_target ? percentFromFraction(a.profit_target) : "",
    max_drawdown_percent: a.max_drawdown_limit ? percentFromFraction(a.max_drawdown_limit) : "",
  };
}
```

(d) Trong thân `AccountFormDialog`, lấy thêm `watch`, `setValue`, `getValues` từ `useForm`, và thêm ngay sau `const update = useUpdateAccount();`:

```tsx
  const { data: enums } = useMetaEnums();
```

Sau khối `useForm(...)`, thêm:

```tsx
  const accountType = watch("account_type");
  const phase = watch("challenge_phase");
  const phases = enums?.challenge_phases ?? [];
  const statuses = statusOptionsFor(enums?.challenge_statuses ?? [], phase);
```

(e) Trong `submit`, thêm vào map của `patchFromDirty` (sau `risk_percent`):

```tsx
          account_type: (x) => ({ key: "account_type", value: x as AccountType }),
          prop_firm: (x) => ({ key: "prop_firm", value: x.trim() }),
          challenge_phase: (x) => ({ key: "challenge_phase", value: x }),
          challenge_status: (x) => ({ key: "challenge_status", value: x }),
          // Ô trống là "quỹ không đặt luật này": gửi null để backend xoá, không
          // bỏ khoá — bỏ khoá nghĩa là "giữ số cũ".
          profit_target_percent: (x) => ({ key: "profit_target", value: percentOrNull(x) }),
          max_drawdown_percent: (x) => ({ key: "max_drawdown_limit", value: percentOrNull(x) }),
```

và thay khối dựng `body` của nhánh tạo mới bằng:

```tsx
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
          account_type: v.account_type as AccountType,
          // Account cá nhân KHÔNG gửi trường quỹ nào: form vẫn giữ giá trị
          // khởi đầu phase_1/in_progress cho chúng, và gửi lên là nói dối.
          ...(v.account_type === "prop"
            ? {
                prop_firm: v.prop_firm.trim(),
                challenge_phase: v.challenge_phase,
                challenge_status: v.challenge_status,
                profit_target: percentOrNull(v.profit_target_percent),
                max_drawdown_limit: percentOrNull(v.max_drawdown_percent),
              }
            : {}),
        };
```

(f) Trong JSX: đổi `<DialogContent>` thành `<DialogContent className="max-h-[90vh] overflow-y-auto">`. Chèn ngay sau `<form ...>` (TRƯỚC ô Mã tài khoản):

```tsx
          <div className="flex flex-col gap-1.5">
            <span id="account-type-label" className="text-sm font-medium">
              {t("accounts.type")}
            </span>
            <Controller
              control={control}
              name="account_type"
              render={({ field }) => (
                <Segmented
                  ariaLabelledBy="account-type-label"
                  value={field.value}
                  onChange={field.onChange}
                  options={enums?.account_types ?? []}
                  renderOption={(o) => enumLabel("account_type", o, locale, enums?.account_types)}
                />
              )}
            />
          </div>
```

và chèn ngay TRƯỚC `{errorMsg && (` :

```tsx
          {accountType === "prop" && (
            <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-semibold">{t("accounts.challengeSection")}</legend>

              <Field
                name="prop_firm"
                label={t("accounts.propFirm")}
                placeholder="FTMO"
                errorMsg={errors.prop_firm?.message}
                register={register("prop_firm")}
              />

              <div className="flex flex-col gap-1.5">
                <span id="challenge-phase-label" className="text-sm font-medium">
                  {t("accounts.phase")}
                </span>
                <Controller
                  control={control}
                  name="challenge_phase"
                  render={({ field }) => (
                    <Segmented
                      ariaLabelledBy="challenge-phase-label"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // Funded không có "Đã qua": lựa chọn đó vừa biến mất
                        // khỏi màn hình, nên giá trị cũng không được ở lại.
                        if (next === "funded" && getValues("challenge_status") === "passed") {
                          setValue("challenge_status", "in_progress", { shouldDirty: true });
                        }
                      }}
                      options={phases}
                      renderOption={(o) => enumLabel("challenge_phase", o, locale, phases)}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span id="challenge-status-label" className="text-sm font-medium">
                  {t("accounts.status")}
                </span>
                <Controller
                  control={control}
                  name="challenge_status"
                  render={({ field }) => (
                    <Segmented
                      ariaLabelledBy="challenge-status-label"
                      value={field.value}
                      onChange={field.onChange}
                      options={statuses}
                      renderOption={(o) =>
                        phase === "funded" && o === "in_progress"
                          ? t("accounts.fundedActive")
                          : enumLabel("challenge_status", o, locale, enums?.challenge_statuses)
                      }
                    />
                  )}
                />
                {errors.challenge_status && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.challenge_status.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="profit_target_percent"
                  label={t("accounts.profitTarget")}
                  numeric
                  inputMode="decimal"
                  errorMsg={errors.profit_target_percent?.message}
                  register={register("profit_target_percent")}
                />
                <Field
                  name="max_drawdown_percent"
                  label={t("accounts.maxDrawdown")}
                  numeric
                  inputMode="decimal"
                  errorMsg={errors.max_drawdown_percent?.message}
                  register={register("max_drawdown_percent")}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("accounts.ruleHint")}</p>
            </fieldset>
          )}
```

Chú ý: ba `id` cố định (`account-type-label`, …) an toàn vì mỗi lần chỉ mở MỘT dialog; nếu review muốn chắc hơn, đổi sang `useId()`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd frontend && npx vitest run src/features/accounts/`
Expected: PASS — gồm các test form cũ (tạo cá nhân, sửa tên chỉ gửi `{name}`, risk > 100%).

---

### Task 10: Menu thao tác nhanh trên hàng quỹ

**Files:**
- Create: `frontend/src/features/accounts/ChallengeMenu.tsx`
- Modify: `frontend/src/features/accounts/AccountRow.tsx` (thay comment "Task 10 cắm ChallengeMenu vào đây.")
- Test: `frontend/src/features/accounts/accounts.test.tsx`

**Interfaces:**
- Consumes: `challengeActions` (Task 6); `useUpdateAccount` (`hooks.ts`); `useMetaEnums`; `DropdownMenu*`
- Produces: `ChallengeMenu({ account })` — nút `aria-label="Cập nhật vòng thi {code}"`, không render gì khi không có thao tác.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `accounts.test.tsx`:

```ts
test("đánh dấu đã qua gửi đúng một khoá và hàng cập nhật", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      store[0] = { ...store[0], ...submitted } as ReturnType<typeof prop>;
      return envelope(store[0]);
    }),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(within(row).getByRole("button", { name: "Cập nhật vòng thi FT-01" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Đánh dấu đã qua" }));

  await waitFor(() => expect(submitted).toEqual({ challenge_status: "passed" }));
  expect(await within(row).findByText("Đã qua Vòng 1")).toBeInTheDocument();
});

test("đã qua thì menu mời lên vòng kế, chỉ gửi challenge_phase", async () => {
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([prop({ challenge_status: "passed" })])),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(prop({ challenge_phase: "phase_2" }));
    }),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(within(row).getByRole("button", { name: "Cập nhật vòng thi FT-01" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Lên Vòng 2" }));

  await waitFor(() => expect(submitted).toEqual({ challenge_phase: "phase_2" }));
});

test("account đã thất bại không có menu thao tác nhanh", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([prop({ challenge_status: "failed" })])));
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  expect(within(row).queryByRole("button", { name: "Cập nhật vòng thi FT-01" })).toBeNull();
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/accounts/accounts.test.tsx -t "menu|đánh dấu|thất bại không"`
Expected: FAIL — không có nút "Cập nhật vòng thi FT-01".

- [ ] **Step 3: Cài đặt**

Tạo `frontend/src/features/accounts/ChallengeMenu.tsx`:

```tsx
import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMetaEnums } from "@/features/meta/hooks";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { errorMessage } from "@/i18n/errors";
import { challengeActions, type ChallengeAction } from "./challenge";
import { useUpdateAccount } from "./hooks";
import type { Account } from "./types";

/**
 * Ba thao tác người thi quỹ làm nhiều nhất sau khi tạo account. Mọi thứ khác
 * (đổi tên quỹ, sửa luật, quay lại vòng cũ) đi qua dialog Sửa — menu này cố
 * ý không phải một bản sao thứ hai của form.
 *
 * Không hỏi xác nhận: mọi thao tác ở đây đảo lại được bằng dialog Sửa.
 */
export function ChallengeMenu({ account }: { account: Account }) {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const update = useUpdateAccount();
  const phases = enums?.challenge_phases ?? [];
  const actions = challengeActions(phases, account.challenge_phase, account.challenge_status);
  if (actions.length === 0) return null;

  function label(a: ChallengeAction): string {
    if (a.kind === "advance") {
      return t("accounts.advanceTo", { phase: enumLabel("challenge_phase", a.patch.challenge_phase, locale, phases) });
    }
    return t(a.kind === "pass" ? "accounts.markPassed" : "accounts.markFailed");
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("accounts.challengeMenu", { code: account.code })}>
            <EllipsisIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <DropdownMenuItem key={a.kind} onSelect={() => update.mutate({ id: account.id, patch: a.patch })}>
              {label(a)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {update.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(update.error, locale, t)}
        </p>
      )}
    </div>
  );
}
```

Trong `AccountRow.tsx`: thêm `import { ChallengeMenu } from "./ChallengeMenu";` và thay dòng comment `{/* Task 10 cắm ChallengeMenu vào đây. */}` bằng:

```tsx
          {isProp && <ChallengeMenu account={account} />}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd frontend && npx vitest run src/features/accounts/`
Expected: PASS.

---

### Task 11: Kiểm tra bằng mắt và chạy toàn bộ

**Files:** không tạo file mới trong repo. Ảnh chụp để ở scratchpad.

- [ ] **Step 1: Chạy toàn bộ test và build**

Run:
```bash
make test && make lint
cd frontend && npx tsc --noEmit && npm run test && npm run build
```
Expected: tất cả PASS, build không cảnh báo mới. Báo lại kết quả THẬT (số test pass/fail), không tóm tắt "chắc là xanh".

- [ ] **Step 2: Dựng app với dữ liệu mẫu**

Dùng skill `run` (hoặc `make up` + `npm run dev`). Qua UI tạo bốn account: một cá nhân; ba quỹ — `FTMO 100k` Vòng 1 đang thi (mục tiêu 10%, DD 10%, có vài lệnh lãi); `The5ers 60k` Vòng 2 đã qua; `FundedNext 50k` Vòng 1 thất bại (có lệnh lỗ đủ để DD ≥ 80% giới hạn).

- [ ] **Step 3: Chụp và tự phê bình**

Chụp `/accounts` ở bốn trạng thái: light 1280px, dark 1280px, light 375px, và dialog Sửa của một account quỹ. Đối chiếu từng ảnh với spec §6:

- Thanh vòng có phải thứ mắt nhìn thấy đầu tiên của hàng quỹ không? Nếu số dư hay nút giành mất, hạ độ đậm của chúng.
- Ba trạng thái nút (đặc / vòng + chấm / ✕) phân biệt được khi chuyển ảnh sang xám không?
- Dark mode: đoạn nối và vòng "chưa tới" còn thấy không (`--border-default` trên `--surface-base` tối)?
- 375px: không cuộn ngang; các nút xuống dòng gọn; `ProgressMeter` xếp hai hàng.
- Focus bàn phím: Tab qua bộ lọc, nút Xem, Nạp/rút, Sửa, menu `⋯` — vòng focus thấy rõ ở cả hai theme.

Sửa những gì lệch, chạy lại Step 1, và ghi vào báo cáo cuối: đã sửa gì sau khi nhìn ảnh, cái gì cố ý để lại.
