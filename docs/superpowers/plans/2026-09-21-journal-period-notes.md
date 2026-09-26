# Tab Ngày/Tuần và ghi chú theo kỳ — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Thêm hai tab Ngày và Tuần vào `/trades`, mỗi kỳ là một thẻ tổng kết KPI kèm ghi chú rich text riêng.

**Architecture:** Bảng `journal_notes` khoá theo `(account_id, period, period_key)`, khoá kỳ sinh từ `metrics.DateParts` để không lệch timezone. Hàm thuần `aggregate.Periods` gom lệnh theo ngày/tuần rồi gọi lại `metrics.ComputeKPI` cho từng nhóm thay vì viết lại công thức. Frontend thêm `Segmented` ba tab, trạng thái trên URL.

**Tech Stack:** Go 1.23 · chi · GORM · PostgreSQL 16 · Vite + React 19 + TypeScript · TanStack Query v5 · shadcn/ui · Tailwind v4 · Recharts

**Spec:** `docs/superpowers/specs/2026-09-21-journal-period-notes-design.md`

## Global Constraints

- **Tiền là `decimal.Decimal`, không bao giờ `float64`.** DB dùng `NUMERIC`.
- **Không lưu trường suy diễn.** Mọi KPI của kỳ tính lúc đọc, không có cột trong DB.
- **`internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần** — cấm import GORM, `net/http`, `database/sql`, `context`.
- **Lưu UTC, tính theo `accounts.timezone` (IANA), hiển thị theo timezone của account.** Không hardcode `+7`.
- **Code tiếng Anh, comment tiếng Việt.** Mọi định danh — biến, hàm, kiểu, package, file, key JSON, tên cột DB, route, message log/error, chuỗi test — viết bằng tiếng Anh. Comment và tài liệu viết bằng tiếng Việt. Ngoại lệ: dữ liệu nghiệp vụ hiển thị cho người dùng (text UI qua `i18n`).
- **Quy tắc 8:** lũy kế tính trên toàn bộ lệnh của account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI tính trên tập đã lọc.
- **Soft delete** chỉ áp cho `trades`. `journal_notes` xoá cứng, `ON DELETE CASCADE` theo account.
- **Test đi cùng feature**, không dời sang phase sau. Trước khi báo "xong" phải chạy test thật và báo kết quả thật.
- **Node cho frontend:** `~/.nvm/versions/node/v22.15.0/bin` — node mặc định của shell là v16 và làm `tsc` chết.
- Chạy test: `make test` (Go) · `npx tsc --noEmit && npm run build` (FE).

---

### Task 1: Migration và domain model cho `journal_notes`

**Files:**
- Create: `backend/migrations/0005_journal_notes.up.sql`
- Create: `backend/migrations/0005_journal_notes.down.sql`
- Modify: `backend/internal/domain/models.go` (thêm struct ở cuối, cạnh `NoteTemplate`)
- Create: `backend/internal/domain/journal_note_rules.go`
- Create: `backend/internal/domain/journal_note_rules_test.go`

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces:
  - `domain.JournalNote` struct với các trường `ID int64`, `AccountID int64`, `Period string`, `PeriodKey string`, `BodyHTML string`, `CreatedAt time.Time`, `UpdatedAt time.Time`
  - `domain.PeriodDay = "day"`, `domain.PeriodWeek = "week"` (hằng `string`)
  - `func domain.ValidPeriod(p string) bool`
  - `func domain.ValidatePeriodKey(period, key string) error`

- [x] **Step 1: Viết test thất bại cho luật khoá kỳ**

Tạo `backend/internal/domain/journal_note_rules_test.go`:

```go
package domain_test

import (
	"testing"

	"journal/internal/domain"
)

func TestValidPeriod(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"day", "day", true},
		{"week", "week", true},
		{"month is not supported", "month", false},
		{"empty", "", false},
		{"case sensitive", "Day", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := domain.ValidPeriod(tc.input); got != tc.want {
				t.Fatalf("ValidPeriod(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestValidatePeriodKey(t *testing.T) {
	tests := []struct {
		name    string
		period  string
		key     string
		wantErr bool
	}{
		{"day ok", "day", "2026-09-21", false},
		{"day rejects week key", "day", "2026-W39", true},
		{"day rejects short year", "day", "26-09-21", true},
		{"day rejects missing pad", "day", "2026-9-21", true},
		{"day rejects trailing time", "day", "2026-09-21T00:00:00Z", true},
		{"week ok", "week", "2026-W39", false},
		{"week ok week 01", "week", "2026-W01", false},
		{"week rejects unpadded", "week", "2026-W9", true},
		{"week rejects lowercase w", "week", "2026-w39", true},
		{"week rejects day key", "week", "2026-09-21", true},
		{"unknown period", "month", "2026-09", true},
		{"empty key", "day", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidatePeriodKey(tc.period, tc.key)
			if tc.wantErr && err == nil {
				t.Fatalf("ValidatePeriodKey(%q, %q) = nil, want error", tc.period, tc.key)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("ValidatePeriodKey(%q, %q) = %v, want nil", tc.period, tc.key, err)
			}
		})
	}
}
```

- [x] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/domain/ -run 'TestValidPeriod|TestValidatePeriodKey' -v`
Expected: FAIL — `undefined: domain.ValidPeriod`, `undefined: domain.ValidatePeriodKey`

- [x] **Step 3: Viết luật khoá kỳ**

Tạo `backend/internal/domain/journal_note_rules.go`:

```go
package domain

import (
	"fmt"
	"regexp"
)

// Hai giá trị kỳ được hỗ trợ. Chuỗi thường chứ không phải kiểu riêng: chúng
// đi thẳng vào cột TEXT và vào URL, nên một kiểu riêng chỉ thêm một lần ép
// kiểu ở mỗi ranh giới mà không chặn thêm lỗi nào.
const (
	PeriodDay  = "day"
	PeriodWeek = "week"
)

// Khoá ngày theo lịch ("2026-09-21") và khoá tuần theo ISO-8601 ("2026-W39").
//
// Cả hai neo hai đầu và ép zero-pad: "2026-9-21" và "2026-W9" sắp xếp SAI theo
// thứ tự chuỗi, mà thứ tự chuỗi chính là thứ tự thời gian mà thẻ kỳ dựa vào.
var (
	dayKeyRE  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	weekKeyRE = regexp.MustCompile(`^\d{4}-W\d{2}$`)
)

// ValidPeriod báo một chuỗi có phải kỳ được hỗ trợ không.
func ValidPeriod(p string) bool {
	return p == PeriodDay || p == PeriodWeek
}

// ValidatePeriodKey kiểm khoá kỳ ĐÚNG DẠNG của kỳ đó.
//
// Không kiểm ở đây thì period_key thành bãi rác chuỗi tự do: "2026-09-21" và
// "21/09/2026" cùng trỏ một ngày nhưng là hai hàng khác nhau trong bảng, và
// ràng buộc unique không nhìn ra chúng là một.
//
// Chỉ kiểm DẠNG, không kiểm ngày có thật: "2026-02-31" lọt qua. Khoá luôn do
// backend sinh từ metrics.DateParts trên một thời điểm có thật, nên một ngày
// không tồn tại chỉ có thể đến từ request bịa tay — và hậu quả tệ nhất của nó
// là một ghi chú không bao giờ có thẻ nào để hiện.
func ValidatePeriodKey(period, key string) error {
	switch period {
	case PeriodDay:
		if !dayKeyRE.MatchString(key) {
			return fmt.Errorf("khoá ngày phải có dạng YYYY-MM-DD, nhận %q", key)
		}
		return nil
	case PeriodWeek:
		if !weekKeyRE.MatchString(key) {
			return fmt.Errorf("khoá tuần phải có dạng YYYY-Www, nhận %q", key)
		}
		return nil
	default:
		return fmt.Errorf("kỳ không hợp lệ: %q", period)
	}
}
```

- [x] **Step 4: Chạy test để chắc chắn nó pass**

Run: `cd backend && go test ./internal/domain/ -run 'TestValidPeriod|TestValidatePeriodKey' -v`
Expected: PASS

- [x] **Step 5: Thêm struct `JournalNote` vào `domain/models.go`**

Thêm vào cuối `backend/internal/domain/models.go`, TRƯỚC khối `func (X) TableName()`:

```go
// JournalNote là ghi chú cho MỘT kỳ — một ngày hoặc một tuần — của một
// account.
//
// Thuộc ACCOUNT chứ không thuộc user, khác NoteTemplate: nội dung nói về các
// lệnh của một tài khoản trong kỳ đó. Người chạy hai tài khoản với hai chiến
// lược có hai bản tổng kết khác nhau cho cùng ngày thứ Hai; gắn vào user thì
// hai bản ấy đè lên nhau.
//
// PeriodKey luôn sinh từ metrics.DateParts — Day cho kỳ ngày, WeekSort cho kỳ
// tuần. Đó là chỗ duy nhất trong hệ thống quyết định một lệnh thuộc về ngày
// nào, nên ghi chú đi qua cùng hàm thì không lệch khỏi thẻ được.
//
// Không có DeletedAt: quy tắc soft delete chỉ áp cho trades vì xoá cứng lệnh
// làm sai đường equity. Ghi chú không nằm trong dãy lũy kế theo stt.
type JournalNote struct {
	ID        int64     `gorm:"column:id;primaryKey"`
	AccountID int64     `gorm:"column:account_id"`
	Period    string    `gorm:"column:period"`     // "day" | "week"
	PeriodKey string    `gorm:"column:period_key"` // "2026-09-21" | "2026-W39"
	BodyHTML  string    `gorm:"column:body_html"`
	CreatedAt time.Time `gorm:"column:created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}
```

Và thêm một dòng vào khối `TableName`:

```go
func (JournalNote) TableName() string { return "journal_notes" }
```

- [x] **Step 6: Viết migration**

Tạo `backend/migrations/0005_journal_notes.up.sql`:

```sql
CREATE TABLE journal_notes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    period     TEXT        NOT NULL,
    period_key TEXT        NOT NULL,
    body_html  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT journal_notes_period CHECK (period IN ('day', 'week'))
);

-- Ràng buộc này là thứ THỰC THI quy tắc một-ghi-chú-mỗi-kỳ, và cũng là đích
-- của ON CONFLICT trong lệnh upsert. Kiểm trong code thay cho nó sẽ bị hai
-- request song song đi qua mặt.
CREATE UNIQUE INDEX journal_notes_key
    ON journal_notes (account_id, period, period_key);
```

Tạo `backend/migrations/0005_journal_notes.down.sql`:

```sql
DROP TABLE journal_notes;
```

- [x] **Step 7: Chạy toàn bộ test của domain**

Run: `cd backend && go build ./... && go test ./internal/domain/`
Expected: PASS, build sạch

- [x] **Step 8: Commit**

```bash
git add backend/migrations/0005_journal_notes.up.sql \
        backend/migrations/0005_journal_notes.down.sql \
        backend/internal/domain/models.go \
        backend/internal/domain/journal_note_rules.go \
        backend/internal/domain/journal_note_rules_test.go
git commit -m "feat(be): bảng journal_notes và luật khoá kỳ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `aggregate.Periods` — gom lệnh theo kỳ kèm KPI

**Files:**
- Create: `backend/internal/aggregate/periods.go`
- Create: `backend/internal/aggregate/periods_test.go`

**Interfaces:**
- Consumes: `domain.PeriodDay`, `domain.PeriodWeek` (Task 1); `metrics.Enriched` với các trường `Day string`, `WeekSort string`, `Net decimal.Decimal`, `CumByTrade decimal.Decimal`, `Trade domain.Trade`; `metrics.ComputeKPI(filtered, all []metrics.Enriched, acc domain.Account, flows []domain.CashFlow) metrics.KPI`
- Produces:
  - `type aggregate.PeriodPoint struct { STT int; CumByTrade decimal.Decimal }` với json tag `stt`, `cum_by_trade`
  - `type aggregate.PeriodStat struct { Key, Start, End string; KPI metrics.KPI; Volume decimal.Decimal; Points []PeriodPoint }`
  - `func aggregate.Periods(all, filtered []metrics.Enriched, acc domain.Account, period string) []PeriodStat`

- [x] **Step 1: Viết test thất bại**

Tạo `backend/internal/aggregate/periods_test.go`:

```go
package aggregate_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/aggregate"
	"journal/internal/domain"
	"journal/internal/metrics"
)

// enrichForPeriods dựng dữ liệu test đi qua ĐÚNG đường mà production đi:
// metrics.Enrich sinh Day/WeekSort/CumByTrade, không phải test tự gán tay.
// Gán tay sẽ khiến test vẫn xanh khi quy ước gom nhóm đổi.
func enrichForPeriods(t *testing.T, acc domain.Account, trades []domain.Trade) []metrics.Enriched {
	t.Helper()
	rows, err := metrics.Enrich(trades, acc)
	if err != nil {
		t.Fatalf("Enrich: %v", err)
	}
	return rows
}

func accountVN(t *testing.T) domain.Account {
	t.Helper()
	return domain.Account{ID: 1, Timezone: "Asia/Ho_Chi_Minh", Currency: "USD"}
}

func tradeAt(stt int, iso string, profit string, t *testing.T) domain.Trade {
	t.Helper()
	at, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t.Fatalf("parse %q: %v", iso, err)
	}
	return domain.Trade{
		ID:        int64(stt),
		AccountID: 1,
		STT:       stt,
		EnteredAt: at,
		Symbol:    "XAUUSD",
		Profit:    decimal.RequireFromString(profit),
		Fee:       decimal.Zero,
	}
}

// Nửa đêm theo giờ account là ranh giới thật của một ngày, và nó KHÔNG trùng
// nửa đêm UTC. Một lệnh lúc 23:00 UTC ngày 20 là 06:00 giờ VN ngày 21.
func TestPeriodsGroupsByAccountTimezone(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-20T23:00:00Z", "10", t), // 06:00 ngày 21 giờ VN
		tradeAt(2, "2026-09-21T02:00:00Z", "20", t), // 09:00 ngày 21 giờ VN
		tradeAt(3, "2026-09-21T18:00:00Z", "30", t), // 01:00 ngày 22 giờ VN
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("số kỳ = %d, want 2: %+v", len(got), got)
	}
	if got[0].Key != "2026-09-21" {
		t.Errorf("kỳ đầu = %q, want 2026-09-21", got[0].Key)
	}
	if got[0].KPI.TotalTrades != 2 {
		t.Errorf("số lệnh ngày 21 = %d, want 2", got[0].KPI.TotalTrades)
	}
	if got[1].Key != "2026-09-22" {
		t.Errorf("kỳ hai = %q, want 2026-09-22", got[1].Key)
	}
}

// Tuần ISO vắt qua giao thừa: 31/12/2025 thuộc tuần 1 của NĂM 2026. Khoá phải
// mang năm ISO (2026-W01), không phải năm lịch (2025-W01) — nếu không, hai
// tuần khác nhau ở hai năm sẽ đè lên nhau.
func TestPeriodsWeekKeyUsesISOYear(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2025-12-31T03:00:00Z", "10", t), // 10:00 ngày 31/12 giờ VN
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodWeek)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Key != "2026-W01" {
		t.Errorf("khoá tuần = %q, want 2026-W01", got[0].Key)
	}
}

// Kỳ chỉ có lệnh HOÀ: không có lãi cũng không có lỗ, nên profit factor không
// tính được. Nó phải là nil ("không xác định"), không phải 0 — 0 đọc thành
// "thua sạch".
func TestPeriodsAllBreakEvenHasNilProfitFactor(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "0", t),
		tradeAt(2, "2026-09-21T03:00:00Z", "0", t),
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].KPI.ProfitFactor != nil {
		t.Errorf("profit factor = %v, want nil", got[0].KPI.ProfitFactor)
	}
}

// Sparkline KHÔNG rebase về 0 tại đầu kỳ: nó là một ĐOẠN của đường equity
// thật. Ngày thứ hai bắt đầu từ chỗ ngày thứ nhất dừng lại.
func TestPeriodsPointsKeepGlobalCumulative(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "100", t),
		tradeAt(2, "2026-09-22T02:00:00Z", "50", t),
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodDay)

	if len(got) != 2 {
		t.Fatalf("số kỳ = %d, want 2", len(got))
	}
	second := got[1].Points
	if len(second) != 1 {
		t.Fatalf("số điểm ngày 22 = %d, want 1", len(second))
	}
	// 100 + 50, không phải 50.
	if !second[0].CumByTrade.Equal(decimal.RequireFromString("150")) {
		t.Errorf("cum_by_trade = %s, want 150", second[0].CumByTrade)
	}
}

// Quy tắc 8: danh sách thẻ sinh từ tập ĐÃ LỌC, nhưng cum_by_trade bên trong
// vẫn là số tính từ TRỌN dãy.
func TestPeriodsListsFilteredButKeepsFullCumulative(t *testing.T) {
	acc := accountVN(t)
	all := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "100", t),
		tradeAt(2, "2026-09-22T02:00:00Z", "50", t),
	})
	filtered := all[1:] // chỉ giữ lệnh ngày 22

	got := aggregate.Periods(all, filtered, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Key != "2026-09-22" {
		t.Errorf("kỳ = %q, want 2026-09-22", got[0].Key)
	}
	if !got[0].Points[0].CumByTrade.Equal(decimal.RequireFromString("150")) {
		t.Errorf("cum_by_trade = %s, want 150 (tính từ trọn dãy)", got[0].Points[0].CumByTrade)
	}
}

// Volume cộng dồn trên các lệnh CÓ volume; lệnh để trống không đóng góp.
func TestPeriodsSumsVolume(t *testing.T) {
	acc := accountVN(t)
	one := decimal.RequireFromString("1.5")
	two := decimal.RequireFromString("2")
	trades := []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "10", t),
		tradeAt(2, "2026-09-21T03:00:00Z", "20", t),
		tradeAt(3, "2026-09-21T04:00:00Z", "30", t),
	}
	trades[0].Volume = &one
	trades[1].Volume = &two
	// trades[2].Volume để nil.
	rows := enrichForPeriods(t, acc, trades)

	got := aggregate.Periods(rows, rows, acc, domain.PeriodDay)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if !got[0].Volume.Equal(decimal.RequireFromString("3.5")) {
		t.Errorf("volume = %s, want 3.5", got[0].Volume)
	}
}

// Kỳ tuần phải mang Start/End là ngày đầu và cuối tuần ISO, để UI hiện
// "21/09 – 27/09" mà không phải tự tính lại.
func TestPeriodsWeekBounds(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-23T02:00:00Z", "10", t), // thứ Tư tuần 39
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodWeek)

	if len(got) != 1 {
		t.Fatalf("số kỳ = %d, want 1", len(got))
	}
	if got[0].Start != "2026-09-21" {
		t.Errorf("start = %q, want 2026-09-21 (thứ Hai)", got[0].Start)
	}
	if got[0].End != "2026-09-27" {
		t.Errorf("end = %q, want 2026-09-27 (Chủ nhật)", got[0].End)
	}
}

// Kỳ ngày có Start = End = chính ngày đó.
func TestPeriodsDayBounds(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "10", t),
	})

	got := aggregate.Periods(rows, rows, acc, domain.PeriodDay)

	if got[0].Start != "2026-09-21" || got[0].End != "2026-09-21" {
		t.Errorf("bounds = %q..%q, want 2026-09-21..2026-09-21", got[0].Start, got[0].End)
	}
}

// Kỳ không hợp lệ trả slice RỖNG, không panic: handler đã chặn giá trị lạ,
// nhưng một hàm thuần không được sập vì tham số sai.
func TestPeriodsUnknownPeriodReturnsEmpty(t *testing.T) {
	acc := accountVN(t)
	rows := enrichForPeriods(t, acc, []domain.Trade{
		tradeAt(1, "2026-09-21T02:00:00Z", "10", t),
	})

	if got := aggregate.Periods(rows, rows, acc, "month"); len(got) != 0 {
		t.Errorf("Periods với kỳ lạ = %+v, want rỗng", got)
	}
}
```

- [x] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/aggregate/ -run TestPeriods -v`
Expected: FAIL — `undefined: aggregate.Periods`

- [x] **Step 3: Viết `aggregate.Periods`**

Tạo `backend/internal/aggregate/periods.go`:

```go
package aggregate

import (
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// PeriodPoint là một điểm trên sparkline của thẻ kỳ.
//
// CumByTrade là giá trị TOÀN CỤC, không rebase về 0 tại đầu kỳ: đường trên thẻ
// là một ĐOẠN của đường equity thật. Rebase làm thẻ đẹp hơn nhưng nói sai về
// vị trí tài khoản — cùng lý lẽ đã chốt cho chuỗi lý thuyết-vs-thực tế ở quy
// tắc 8 của CLAUDE.md.
type PeriodPoint struct {
	STT        int             `json:"stt"`
	CumByTrade decimal.Decimal `json:"cum_by_trade"`
}

// PeriodStat là một ngày hoặc một tuần trên tab Ngày/Tuần.
//
// KPI nhúng nguyên metrics.KPI thay vì chép lại từng trường: mọi chỉ số trên
// thẻ đã có định nghĩa đúng và có test ở đó. Chép ra sẽ tạo một bản sao trôi
// lệch khỏi bản gốc ở lần sửa công thức tiếp theo.
//
// CurrentBalance và NetCashFlow bên trong KPI luôn bằng 0 ở đây và KHÔNG có
// nghĩa: số dư là một mốc tại một thời điểm, không phải đại lượng của một
// khoảng. Tầng DTO ở httpapi cắt chúng khỏi JSON.
type PeriodStat struct {
	Key    string          `json:"key"`   // "2026-09-21" | "2026-W39"
	Start  string          `json:"start"` // ngày đầu kỳ, "YYYY-MM-DD"
	End    string          `json:"end"`   // ngày cuối kỳ, "YYYY-MM-DD"
	KPI    metrics.KPI     `json:"kpi"`
	Volume decimal.Decimal `json:"volume"`
	Points []PeriodPoint   `json:"points"`
}

// Periods gom tập ĐÃ LỌC theo ngày hoặc tuần, mỗi nhóm một thẻ kèm KPI đầy đủ.
//
// Nhận cả `all` lẫn `filtered` theo đúng mẫu của All: danh sách thẻ sinh từ
// `filtered`, còn các trường lũy kế bên trong mỗi Enriched là số tính từ TRỌN
// dãy vì metrics.Enrich đã chạy trước khi lọc (quy tắc 8).
//
// `all` hiện chỉ dùng để khẳng định quy ước đó ở chữ ký hàm; mọi số trên thẻ
// đều đọc từ `filtered`. Giữ tham số vì đảo hai tập là lỗi im lặng mà chữ ký
// thống nhất với All giúp người đọc nhận ra ngay.
func Periods(all, filtered []metrics.Enriched, acc domain.Account, period string) []PeriodStat {
	_ = all

	keyOf, ok := periodKeyFunc(period)
	if !ok {
		return nil
	}

	// Gom theo khoá, GIỮ thứ tự stt bên trong mỗi nhóm: filtered đã sắp theo
	// stt từ Enrich, nên append tuần tự là đủ.
	groups := map[string][]metrics.Enriched{}
	order := make([]string, 0, len(filtered))
	for _, e := range filtered {
		k := keyOf(e)
		if _, seen := groups[k]; !seen {
			order = append(order, k)
		}
		groups[k] = append(groups[k], e)
	}

	// Sắp theo khoá tăng dần. Cả hai dạng khoá đều zero-pad nên thứ tự chuỗi
	// trùng thứ tự thời gian — đó là lý do ValidatePeriodKey ép zero-pad.
	sort.Strings(order)

	out := make([]PeriodStat, 0, len(order))
	for _, k := range order {
		rows := groups[k]
		start, end := periodBounds(period, rows[0], acc)
		out = append(out, PeriodStat{
			Key:   k,
			Start: start,
			End:   end,
			// Truyền (rows, rows): số dư không có nghĩa ở cấp kỳ, nên không
			// có tập "toàn bộ" nào cần đến ở đây. flows rỗng vì cùng lý do —
			// NetCashFlow của một ngày không phải một đại lượng.
			KPI:    metrics.ComputeKPI(rows, rows, acc, nil),
			Volume: sumVolume(rows),
			Points: pointsOf(rows),
		})
	}
	return out
}

// periodKeyFunc trả hàm lấy khoá kỳ của một lệnh, và false khi kỳ không hợp lệ.
//
// Khoá lấy THẲNG từ trường mà metrics.Enrich đã tính, không tự quy đổi lại từ
// EnteredAt: Enrich là chỗ duy nhất quyết định một lệnh thuộc ngày nào, và hai
// đường quy đổi song song sẽ lệch nhau ở đúng những lệnh sát nửa đêm.
func periodKeyFunc(period string) (func(metrics.Enriched) string, bool) {
	switch period {
	case domain.PeriodDay:
		return func(e metrics.Enriched) string { return e.Day }, true
	case domain.PeriodWeek:
		return func(e metrics.Enriched) string { return e.WeekSort }, true
	default:
		return nil, false
	}
}

// periodBounds trả ngày đầu và ngày cuối của kỳ chứa lệnh `sample`.
//
// Kỳ ngày: cả hai là chính ngày đó. Kỳ tuần: thứ Hai và Chủ nhật của tuần ISO,
// tính bằng cách lùi/tiến từ chính thời điểm của lệnh trong timezone account —
// không phân tích chuỗi khoá, vì khoá tuần không chứa đủ thông tin để dựng
// lại ngày mà không lặp lại luật ISO lần thứ hai.
func periodBounds(period string, sample metrics.Enriched, acc domain.Account) (string, string) {
	if period == domain.PeriodDay {
		return sample.Day, sample.Day
	}
	loc, err := time.LoadLocation(acc.Timezone)
	if err != nil {
		// Enrich đã từ chối timezone sai trước khi tới đây, nên nhánh này chỉ
		// còn là lưới an toàn: trả chính ngày của lệnh thay vì panic.
		return sample.Day, sample.Day
	}
	local := sample.Trade.EnteredAt.In(loc)
	// time.Weekday() cho Chủ nhật = 0; tuần ISO bắt đầu thứ Hai nên Chủ nhật
	// phải tính là ngày thứ 7, không phải ngày thứ 0.
	offset := (int(local.Weekday()) + 6) % 7
	monday := local.AddDate(0, 0, -offset)
	sunday := monday.AddDate(0, 0, 6)
	return monday.Format("2006-01-02"), sunday.Format("2006-01-02")
}

// sumVolume cộng volume của các lệnh CÓ volume.
//
// Lệnh để trống volume không đóng góp và cũng không làm tổng thành "không xác
// định": một lệnh thiếu khối lượng vẫn là một lệnh thật, chỉ là chưa ghi đủ.
func sumVolume(rows []metrics.Enriched) decimal.Decimal {
	sum := decimal.Zero
	for _, e := range rows {
		if e.Trade.Volume != nil {
			sum = sum.Add(*e.Trade.Volume)
		}
	}
	return sum
}

func pointsOf(rows []metrics.Enriched) []PeriodPoint {
	out := make([]PeriodPoint, 0, len(rows))
	for _, e := range rows {
		out = append(out, PeriodPoint{STT: e.Trade.STT, CumByTrade: e.CumByTrade})
	}
	return out
}
```

- [x] **Step 4: Chạy test để chắc chắn nó pass**

Run: `cd backend && go test ./internal/aggregate/ -run TestPeriods -v`
Expected: PASS, cả 8 test

- [x] **Step 5: Xác nhận package vẫn THUẦN**

Run: `cd backend && go list -deps ./internal/aggregate/ | grep -E 'gorm|net/http|database/sql' || echo "PURE"`
Expected: in ra `PURE` — không có import cấm nào (quy tắc 3)

- [x] **Step 6: Commit**

```bash
git add backend/internal/aggregate/periods.go backend/internal/aggregate/periods_test.go
git commit -m "feat(be): aggregate.Periods gom lệnh theo ngày/tuần kèm KPI

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Repository `JournalNoteRepo` với upsert

**Files:**
- Create: `backend/internal/repository/journalnote.go`
- Create: `backend/internal/repository/journalnote_test.go`

**Interfaces:**
- Consumes: `domain.JournalNote` (Task 1); `repository.ErrNotFound`, `repository.translate` (đã có trong package)
- Produces:
  - `func repository.NewJournalNoteRepo(db *gorm.DB) *JournalNoteRepo`
  - `func (r *JournalNoteRepo) ListByAccount(ctx context.Context, accountID int64, period string) ([]domain.JournalNote, error)`
  - `func (r *JournalNoteRepo) Upsert(ctx context.Context, n domain.JournalNote) (domain.JournalNote, error)`
  - `func (r *JournalNoteRepo) DeleteOwned(ctx context.Context, accountID int64, period, key string) error`

- [x] **Step 1: Viết test thất bại**

Tạo `backend/internal/repository/journalnote_test.go`. Xem `backend/internal/repository/cashflow_test.go` để biết cách dựng DB test (`testdb.New`) và cách tạo account mẫu trong package này; dùng CÙNG helper đó.

```go
package repository_test

import (
	"context"
	"errors"
	"testing"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// Upsert hai lần cùng khoá phải cho ra MỘT hàng mang nội dung lần sau. Đây là
// toàn bộ lý do dùng PUT thay vì POST+PATCH: client biết khoá trước, nên "tạo"
// và "sửa" là một thao tác.
func TestJournalNoteUpsertReplacesExisting(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	first, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    domain.PeriodDay,
		PeriodKey: "2026-09-21",
		BodyHTML:  "<p>vào lệnh sớm</p>",
	})
	if err != nil {
		t.Fatalf("upsert lần đầu: %v", err)
	}

	second, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    domain.PeriodDay,
		PeriodKey: "2026-09-21",
		BodyHTML:  "<p>bài học: chờ nến đóng</p>",
	})
	if err != nil {
		t.Fatalf("upsert lần hai: %v", err)
	}

	if second.ID != first.ID {
		t.Errorf("id = %d, want %d — upsert phải sửa hàng cũ, không tạo hàng mới", second.ID, first.ID)
	}
	if second.BodyHTML != "<p>bài học: chờ nến đóng</p>" {
		t.Errorf("body = %q, want nội dung lần hai", second.BodyHTML)
	}

	list, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("số ghi chú = %d, want 1", len(list))
	}
}

// Cùng khoá ngày ở HAI kỳ khác nhau là hai ghi chú khác nhau — "2026-09-21"
// kỳ day và một khoá tuần không được đụng nhau.
func TestJournalNoteSeparatesPeriods(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	if _, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>ngày</p>",
	}); err != nil {
		t.Fatalf("upsert day: %v", err)
	}
	if _, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: accountID, Period: domain.PeriodWeek, PeriodKey: "2026-W39", BodyHTML: "<p>tuần</p>",
	}); err != nil {
		t.Fatalf("upsert week: %v", err)
	}

	days, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	if err != nil {
		t.Fatalf("list day: %v", err)
	}
	if len(days) != 1 || days[0].BodyHTML != "<p>ngày</p>" {
		t.Errorf("ghi chú ngày = %+v, want đúng một bản ghi của kỳ day", days)
	}

	weeks, err := repo.ListByAccount(ctx, accountID, domain.PeriodWeek)
	if err != nil {
		t.Fatalf("list week: %v", err)
	}
	if len(weeks) != 1 || weeks[0].BodyHTML != "<p>tuần</p>" {
		t.Errorf("ghi chú tuần = %+v, want đúng một bản ghi của kỳ week", weeks)
	}
}

// Ghi chú của account KHÁC không lọt vào danh sách.
func TestJournalNoteListIsScopedToAccount(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	mine := seedAccountID(t, db, "mine@example.com", "MINE")
	theirs := seedAccountID(t, db, "theirs@example.com", "THEIRS")

	if _, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: theirs, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>của người khác</p>",
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	list, err := repo.ListByAccount(ctx, mine, domain.PeriodDay)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("số ghi chú = %d, want 0 — không được thấy ghi chú của account khác", len(list))
	}
}

// Xoá ghi chú không tồn tại trả ErrNotFound, không phải nil: xoá hai lần phải
// phân biệt được với xoá thành công.
func TestJournalNoteDeleteMissingReturnsNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	err := repo.DeleteOwned(ctx, accountID, domain.PeriodDay, "2026-09-21")
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// Xoá ghi chú của account khác cũng là ErrNotFound — cố ý không phải Forbidden,
// để không tiết lộ rằng ghi chú đó có thật.
func TestJournalNoteDeleteOtherAccountReturnsNotFound(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	mine := seedAccountID(t, db, "mine@example.com", "MINE")
	theirs := seedAccountID(t, db, "theirs@example.com", "THEIRS")

	if _, err := repo.Upsert(ctx, domain.JournalNote{
		AccountID: theirs, Period: domain.PeriodDay, PeriodKey: "2026-09-21", BodyHTML: "<p>x</p>",
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	err := repo.DeleteOwned(ctx, mine, domain.PeriodDay, "2026-09-21")
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// Danh sách sắp theo khoá TĂNG DẦN, và vì khoá zero-pad nên đó cũng là thứ tự
// thời gian.
func TestJournalNoteListIsSortedByKey(t *testing.T) {
	db := testdb.New(t)
	repo := repository.NewJournalNoteRepo(db)
	ctx := context.Background()
	accountID := seedAccountID(t, db, "a@example.com", "ACC1")

	for _, key := range []string{"2026-09-22", "2026-09-02", "2026-09-11"} {
		if _, err := repo.Upsert(ctx, domain.JournalNote{
			AccountID: accountID, Period: domain.PeriodDay, PeriodKey: key, BodyHTML: "<p>x</p>",
		}); err != nil {
			t.Fatalf("upsert %s: %v", key, err)
		}
	}

	list, err := repo.ListByAccount(ctx, accountID, domain.PeriodDay)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	want := []string{"2026-09-02", "2026-09-11", "2026-09-22"}
	for i, w := range want {
		if list[i].PeriodKey != w {
			t.Errorf("list[%d] = %q, want %q", i, list[i].PeriodKey, w)
		}
	}
}
```

**Đã xác nhận:** helper thật là `seedAccountID(t *testing.T, db *gorm.DB, email, code string) int64` ở `backend/internal/repository/cashflow_test.go:17`. Mỗi lần gọi phải truyền email và code KHÁC nhau, vì cả hai đều có ràng buộc unique.

- [x] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/repository/ -run TestJournalNote -v`
Expected: FAIL — `undefined: repository.NewJournalNoteRepo`

- [x] **Step 3: Viết repository**

Tạo `backend/internal/repository/journalnote.go`:

```go
package repository

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"journal/internal/domain"
)

type JournalNoteRepo struct{ db *gorm.DB }

func NewJournalNoteRepo(db *gorm.DB) *JournalNoteRepo { return &JournalNoteRepo{db: db} }

// ListByAccount trả ghi chú của MỘT kỳ, sắp theo khoá tăng dần.
//
// Khoá zero-pad nên thứ tự chuỗi trùng thứ tự thời gian; không cần ORDER BY
// nào phức tạp hơn.
func (r *JournalNoteRepo) ListByAccount(
	ctx context.Context, accountID int64, period string,
) ([]domain.JournalNote, error) {
	var rows []domain.JournalNote
	err := r.db.WithContext(ctx).
		Where("account_id = ? AND period = ?", accountID, period).
		Order("period_key ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// Upsert ghi nội dung cho một kỳ, tạo mới nếu chưa có.
//
// ON CONFLICT trên đúng ràng buộc unique (account_id, period, period_key) —
// nên chính CSDL là thứ thực thi quy tắc một-ghi-chú-mỗi-kỳ. Một lần kiểm
// "đã tồn tại chưa" trong code sẽ bị hai request song song đi qua mặt: cả hai
// đọc thấy "chưa có", cả hai INSERT, một cái vỡ.
//
// Chỉ ghi đè body_html và updated_at. created_at giữ nguyên của lần đầu, nên
// "ghi chú này viết từ bao giờ" không bị mỗi lần sửa xoá mất.
func (r *JournalNoteRepo) Upsert(
	ctx context.Context, n domain.JournalNote,
) (domain.JournalNote, error) {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "account_id"}, {Name: "period"}, {Name: "period_key"}},
			DoUpdates: clause.Assignments(map[string]any{"body_html": n.BodyHTML, "updated_at": gorm.Expr("now()")}),
		}).
		Create(&n).Error
	if err != nil {
		return domain.JournalNote{}, translate(err)
	}
	// Đọc lại để trả về id và hai mốc thời gian THẬT của hàng trong bảng.
	// Nhánh DO UPDATE không nạp ngược created_at vào struct, nên trả `n` trần
	// sẽ báo một created_at bằng zero-time cho ghi chú vừa sửa.
	var saved domain.JournalNote
	err = r.db.WithContext(ctx).
		Where("account_id = ? AND period = ? AND period_key = ?", n.AccountID, n.Period, n.PeriodKey).
		First(&saved).Error
	if err != nil {
		return domain.JournalNote{}, translate(err)
	}
	return saved, nil
}

// DeleteOwned xoá CỨNG một ghi chú của account.
//
// RowsAffected == 0 nghĩa là không có hàng nào khớp CẢ ba cột. Ghi chú của
// account khác và ghi chú không tồn tại cho ra cùng một lỗi, cố ý: 404 không
// tiết lộ rằng ghi chú đó có thật.
func (r *JournalNoteRepo) DeleteOwned(
	ctx context.Context, accountID int64, period, key string,
) error {
	res := r.db.WithContext(ctx).
		Where("account_id = ? AND period = ? AND period_key = ?", accountID, period, key).
		Delete(&domain.JournalNote{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
```

- [x] **Step 4: Chạy test để chắc chắn nó pass**

Run: `cd backend && go test ./internal/repository/ -run TestJournalNote -v`
Expected: PASS, cả 6 test. Test này CẦN Docker (Postgres).

- [x] **Step 5: Commit**

```bash
git add backend/internal/repository/journalnote.go backend/internal/repository/journalnote_test.go
git commit -m "feat(be): JournalNoteRepo với upsert theo ràng buộc unique

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Service `JournalNoteService` + seam interface

**Files:**
- Create: `backend/internal/service/journalnote.go`
- Create: `backend/internal/service/journalnote_test.go`
- Modify: `backend/internal/service/store.go` (thêm interface + dòng khẳng định biên dịch)
- Modify: `backend/internal/service/memstore_test.go` (thêm adapter trong RAM)

**Interfaces:**
- Consumes: `repository.NewJournalNoteRepo` và ba method của nó (Task 3); `domain.ValidPeriod`, `domain.ValidatePeriodKey`, `domain.JournalNote` (Task 1); `apperr.Validation`, `apperr.NotFound` (đã có)
- Produces:
  - `type service.JournalNoteStore interface` với `ListByAccount(ctx, accountID int64, period string) ([]domain.JournalNote, error)`, `Upsert(ctx, n domain.JournalNote) (domain.JournalNote, error)`, `DeleteOwned(ctx, accountID int64, period, key string) error`
  - `func service.NewJournalNoteService(store JournalNoteStore) *JournalNoteService`
  - `func (s *JournalNoteService) List(ctx context.Context, accountID int64, period string) ([]domain.JournalNote, error)`
  - `func (s *JournalNoteService) Save(ctx context.Context, accountID int64, period, key, bodyHTML string) (domain.JournalNote, bool, error)` — bool thứ hai là `deleted`
  - `func (s *JournalNoteService) Delete(ctx context.Context, accountID int64, period, key string) error`

- [x] **Step 1: Thêm seam interface vào `store.go`**

Thêm vào cuối `backend/internal/service/store.go`:

```go
// JournalNoteStore là nơi cất ghi chú theo kỳ.
//
// Mọi method nhận accountID và TỰ lọc theo nó: quyền sở hữu là phần của HỢP
// ĐỒNG, không phải việc service phải nhớ kiểm. Thao tác lên ghi chú của
// account khác trả repository.ErrNotFound — cố ý không phải Forbidden, để
// không tiết lộ rằng ghi chú đó tồn tại.
//
// Hai hành vi là hợp đồng, không phải chi tiết cài đặt:
//
//  1. ListByAccount sắp theo period_key TĂNG DẦN và chỉ trả ghi chú của đúng
//     kỳ được hỏi.
//  2. Upsert khoá trên (account_id, period, period_key): gọi hai lần cùng khoá
//     cho ra MỘT hàng mang nội dung lần sau, giữ nguyên created_at lần đầu.
type JournalNoteStore interface {
	ListByAccount(ctx context.Context, accountID int64, period string) ([]domain.JournalNote, error)
	Upsert(ctx context.Context, n domain.JournalNote) (domain.JournalNote, error)
	DeleteOwned(ctx context.Context, accountID int64, period, key string) error
}
```

Và thêm một dòng vào khối `var (...)` khẳng định lúc biên dịch:

```go
	_ JournalNoteStore  = (*repository.JournalNoteRepo)(nil)
```

- [x] **Step 2: Viết test thất bại cho service**

Tạo `backend/internal/service/journalnote_test.go`:

```go
package service_test

import (
	"context"
	"testing"

	"journal/internal/domain"
	"journal/internal/service"
)

func TestJournalNoteSaveRejectsBadPeriod(t *testing.T) {
	svc := service.NewJournalNoteService(newMemJournalNoteStore())

	_, _, err := svc.Save(context.Background(), 1, "month", "2026-09", "<p>x</p>")
	if err == nil {
		t.Fatal("Save với kỳ 'month' = nil, want lỗi")
	}
}

func TestJournalNoteSaveRejectsBadKey(t *testing.T) {
	svc := service.NewJournalNoteService(newMemJournalNoteStore())

	_, _, err := svc.Save(context.Background(), 1, domain.PeriodDay, "21/09/2026", "<p>x</p>")
	if err == nil {
		t.Fatal("Save với khoá sai dạng = nil, want lỗi")
	}
}

// Body rỗng là lệnh XOÁ: người dùng xoá sạch chữ rồi lưu thì kỳ vọng ghi chú
// biến mất, không phải một bản ghi rỗng làm thẻ hiện một mục trống.
func TestJournalNoteSaveWithEmptyBodyDeletes(t *testing.T) {
	store := newMemJournalNoteStore()
	svc := service.NewJournalNoteService(store)
	ctx := context.Background()

	if _, _, err := svc.Save(ctx, 1, domain.PeriodDay, "2026-09-21", "<p>có nội dung</p>"); err != nil {
		t.Fatalf("Save: %v", err)
	}

	_, deleted, err := svc.Save(ctx, 1, domain.PeriodDay, "2026-09-21", "  ")
	if err != nil {
		t.Fatalf("Save body rỗng: %v", err)
	}
	if !deleted {
		t.Error("deleted = false, want true")
	}

	list, err := svc.List(ctx, 1, domain.PeriodDay)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("số ghi chú = %d, want 0", len(list))
	}
}

// Xoá một ghi chú CHƯA từng tồn tại bằng body rỗng KHÔNG phải lỗi: kết quả
// mong muốn — kỳ đó không có ghi chú — đã đúng sẵn.
func TestJournalNoteSaveEmptyOnMissingIsNotAnError(t *testing.T) {
	svc := service.NewJournalNoteService(newMemJournalNoteStore())

	_, deleted, err := svc.Save(context.Background(), 1, domain.PeriodDay, "2026-09-21", "")
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if !deleted {
		t.Error("deleted = false, want true")
	}
}

func TestJournalNoteListRejectsBadPeriod(t *testing.T) {
	svc := service.NewJournalNoteService(newMemJournalNoteStore())

	if _, err := svc.List(context.Background(), 1, "month"); err == nil {
		t.Fatal("List với kỳ 'month' = nil, want lỗi")
	}
}

func TestJournalNoteSaveThenList(t *testing.T) {
	svc := service.NewJournalNoteService(newMemJournalNoteStore())
	ctx := context.Background()

	saved, deleted, err := svc.Save(ctx, 1, domain.PeriodWeek, "2026-W39", "<p>tuần tốt</p>")
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if deleted {
		t.Error("deleted = true, want false")
	}
	if saved.BodyHTML != "<p>tuần tốt</p>" {
		t.Errorf("body = %q", saved.BodyHTML)
	}

	list, err := svc.List(ctx, 1, domain.PeriodWeek)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("số ghi chú = %d, want 1", len(list))
	}
}
```

- [x] **Step 3: Thêm adapter trong RAM vào `memstore_test.go`**

Mở `backend/internal/service/memstore_test.go` và thêm vào cuối. Đọc các adapter sẵn có trong file đó trước để khớp phong cách đặt tên.

```go
// memJournalNoteStore là adapter trong RAM của JournalNoteStore.
//
// Khoá map ghép ba thành phần đúng như unique index của bảng thật — đó là chỗ
// hợp đồng "upsert khoá trên (account, period, key)" được giữ ở phía RAM.
type memJournalNoteStore struct {
	rows   map[string]domain.JournalNote
	nextID int64
}

func newMemJournalNoteStore() *memJournalNoteStore {
	return &memJournalNoteStore{rows: map[string]domain.JournalNote{}, nextID: 1}
}

func (m *memJournalNoteStore) key(accountID int64, period, periodKey string) string {
	return fmt.Sprintf("%d|%s|%s", accountID, period, periodKey)
}

func (m *memJournalNoteStore) ListByAccount(
	_ context.Context, accountID int64, period string,
) ([]domain.JournalNote, error) {
	out := []domain.JournalNote{}
	for _, n := range m.rows {
		if n.AccountID == accountID && n.Period == period {
			out = append(out, n)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].PeriodKey < out[j].PeriodKey })
	return out, nil
}

func (m *memJournalNoteStore) Upsert(
	_ context.Context, n domain.JournalNote,
) (domain.JournalNote, error) {
	k := m.key(n.AccountID, n.Period, n.PeriodKey)
	if old, ok := m.rows[k]; ok {
		// Giữ id và created_at của lần đầu, đúng như nhánh DO UPDATE của SQL.
		old.BodyHTML = n.BodyHTML
		m.rows[k] = old
		return old, nil
	}
	n.ID = m.nextID
	m.nextID++
	m.rows[k] = n
	return n, nil
}

func (m *memJournalNoteStore) DeleteOwned(
	_ context.Context, accountID int64, period, key string,
) error {
	k := m.key(accountID, period, key)
	if _, ok := m.rows[k]; !ok {
		return repository.ErrNotFound
	}
	delete(m.rows, k)
	return nil
}
```

Bảo đảm file có import `fmt`, `sort`, `context`, `journal/internal/domain`, `journal/internal/repository`.

- [x] **Step 4: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/service/ -run TestJournalNote -v`
Expected: FAIL — `undefined: service.NewJournalNoteService`

- [x] **Step 5: Viết service**

Tạo `backend/internal/service/journalnote.go`:

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

type JournalNoteService struct{ store JournalNoteStore }

func NewJournalNoteService(store JournalNoteStore) *JournalNoteService {
	return &JournalNoteService{store: store}
}

// List trả mọi ghi chú của một kỳ.
//
// Ghi chú KHÔNG chịu bộ lọc lệnh: nó gắn với khoá kỳ, nên thẻ nào hiện ra thì
// ghi chú của kỳ đó đi kèm, bất kể bộ lọc nào đã tạo ra danh sách thẻ.
func (s *JournalNoteService) List(
	ctx context.Context, accountID int64, period string,
) ([]domain.JournalNote, error) {
	if !domain.ValidPeriod(period) {
		return nil, apperr.Validation(fmt.Sprintf("kỳ không hợp lệ: %q", period))
	}
	rows, err := s.store.ListByAccount(ctx, accountID, period)
	if err != nil {
		return nil, fmt.Errorf("liệt kê ghi chú kỳ: %w", err)
	}
	return rows, nil
}

// Save ghi nội dung cho một kỳ. Trả thêm cờ `deleted` khi body rỗng.
//
// Body rỗng xử như XOÁ: người dùng xoá sạch chữ rồi lưu thì kỳ vọng ghi chú
// biến mất, không phải một bản ghi rỗng làm thẻ hiện một mục trống. Xoá một
// ghi chú chưa từng tồn tại KHÔNG phải lỗi — kết quả mong muốn đã đúng sẵn.
func (s *JournalNoteService) Save(
	ctx context.Context, accountID int64, period, key, bodyHTML string,
) (domain.JournalNote, bool, error) {
	if !domain.ValidPeriod(period) {
		return domain.JournalNote{}, false, apperr.Validation(fmt.Sprintf("kỳ không hợp lệ: %q", period))
	}
	// domain trả lỗi THƯỜNG (package thuần, quy tắc 3); bọc thành *apperr.Error
	// ở đây để httpapi dịch ra 400 — cùng khuôn NoteTemplateService.Create.
	if err := domain.ValidatePeriodKey(period, key); err != nil {
		return domain.JournalNote{}, false, apperr.Validation(err.Error())
	}

	if strings.TrimSpace(bodyHTML) == "" {
		err := s.store.DeleteOwned(ctx, accountID, period, key)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return domain.JournalNote{}, false, fmt.Errorf("xoá ghi chú kỳ: %w", err)
		}
		return domain.JournalNote{}, true, nil
	}

	saved, err := s.store.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    period,
		PeriodKey: key,
		BodyHTML:  bodyHTML,
	})
	if err != nil {
		return domain.JournalNote{}, false, fmt.Errorf("lưu ghi chú kỳ: %w", err)
	}
	return saved, false, nil
}

// Delete xoá hẳn ghi chú của một kỳ.
//
// Khác Save với body rỗng ở đúng một chỗ: ở đây "không có gì để xoá" LÀ lỗi
// 404, vì người dùng chủ động bấm xoá một thứ họ tin là đang tồn tại.
func (s *JournalNoteService) Delete(
	ctx context.Context, accountID int64, period, key string,
) error {
	if !domain.ValidPeriod(period) {
		return apperr.Validation(fmt.Sprintf("kỳ không hợp lệ: %q", period))
	}
	if err := domain.ValidatePeriodKey(period, key); err != nil {
		return apperr.Validation(err.Error())
	}
	if err := s.store.DeleteOwned(ctx, accountID, period, key); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy ghi chú cho kỳ này")
		}
		return fmt.Errorf("xoá ghi chú kỳ: %w", err)
	}
	return nil
}
```

**Đã xác nhận:** `apperr.NotFound(msg string) *Error` tồn tại ở `backend/internal/apperr/apperr.go:26`.

- [x] **Step 6: Chạy test để chắc chắn nó pass**

Run: `cd backend && go test ./internal/service/ -run TestJournalNote -v`
Expected: PASS, cả 6 test

- [x] **Step 7: Chạy toàn bộ test service để chắc chắn chưa vỡ gì**

Run: `cd backend && go build ./... && go test ./internal/service/`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add backend/internal/service/journalnote.go \
        backend/internal/service/journalnote_test.go \
        backend/internal/service/store.go \
        backend/internal/service/memstore_test.go
git commit -m "feat(be): JournalNoteService, body rỗng xử như xoá

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `TradeService.Periods` và JournalView

**Files:**
- Modify: `backend/internal/service/journal.go` (thêm method vào `JournalView`)
- Modify: `backend/internal/service/trade.go` (thêm method vào `TradeService`)
- Create: `backend/internal/service/journal_periods_test.go`

**Interfaces:**
- Consumes: `aggregate.Periods` (Task 2); `JournalView.Load`, `service.Filter` (đã có)
- Produces:
  - `func (v *JournalView) Periods(period string) []aggregate.PeriodStat`
  - `func (s *TradeService) Periods(ctx context.Context, acc domain.Account, f Filter, period string) ([]aggregate.PeriodStat, error)`

- [x] **Step 1: Viết test thất bại**

Tạo `backend/internal/service/journal_periods_test.go`. Trước khi viết, đọc `backend/internal/service/journal_test.go` để dùng CÙNG helper dựng `TradeService` với store trong RAM.

```go
package service_test

import (
	"context"
	"testing"

	"journal/internal/domain"
	"journal/internal/service"
)

// Periods đi qua Load nên nó thừa hưởng đúng quy tắc 8: thẻ sinh từ tập đã
// lọc, còn lũy kế bên trong tính từ trọn dãy.
func TestTradeServicePeriodsReturnsDayCards(t *testing.T) {
	svc, acc := newTradeServiceWithTrades(t)

	got, err := svc.Periods(context.Background(), acc, service.Filter{}, domain.PeriodDay)
	if err != nil {
		t.Fatalf("Periods: %v", err)
	}
	if len(got) == 0 {
		t.Fatal("số thẻ = 0, want > 0")
	}
	// Khoá sắp tăng dần.
	for i := 1; i < len(got); i++ {
		if got[i-1].Key >= got[i].Key {
			t.Errorf("thẻ %d (%q) không đứng trước thẻ %d (%q)", i-1, got[i-1].Key, i, got[i].Key)
		}
	}
}

func TestTradeServicePeriodsRejectsUnknownPeriod(t *testing.T) {
	svc, acc := newTradeServiceWithTrades(t)

	_, err := svc.Periods(context.Background(), acc, service.Filter{}, "month")
	if err == nil {
		t.Fatal("Periods với kỳ 'month' = nil, want lỗi")
	}
}
```

**Lưu ý:** `newTradeServiceWithTrades` là helper bạn phải viết trong file test này (hoặc tái dùng helper tương đương đã có — chạy `grep -rn "func newTradeService" backend/internal/service/` trước). Nó dựng `service.NewTradeService` với store trong RAM đã nạp sẵn vài lệnh ở ít nhất hai ngày khác nhau, timezone `Asia/Ho_Chi_Minh`, và trả về `(*service.TradeService, domain.Account)`.

- [x] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/service/ -run TestTradeServicePeriods -v`
Expected: FAIL — `svc.Periods undefined`

- [x] **Step 3: Thêm method vào `JournalView`**

Thêm vào `backend/internal/service/journal.go`, ngay SAU method `Charts`:

```go
// Periods dựng thẻ tổng kết theo ngày hoặc theo tuần.
//
// aggregate.Periods nhận (all, filtered) đúng thứ tự đó, cùng quy ước với
// Charts: danh sách thẻ sinh từ tập đã lọc, còn lũy kế bên trong mỗi lệnh là
// số tính từ trọn dãy.
func (v *JournalView) Periods(period string) []aggregate.PeriodStat {
	return aggregate.Periods(v.all, v.filtered, v.account, period)
}
```

- [x] **Step 4: Thêm method vào `TradeService`**

Mở `backend/internal/service/trade.go`, tìm method `Charts` (chạy `grep -n "func (s \*TradeService) Charts" backend/internal/service/trade.go`) và thêm method này ngay sau nó, khớp phong cách của `Charts`:

```go
// Periods trả thẻ tổng kết theo kỳ cho tab Ngày/Tuần.
//
// Chặn kỳ lạ ở ĐÂY chứ không để aggregate.Periods trả slice rỗng đi tiếp:
// "?period=month" là lỗi của người gọi, và một danh sách rỗng đọc thành
// "tài khoản này chưa có lệnh nào" — một câu trả lời sai cho một câu hỏi sai.
func (s *TradeService) Periods(
	ctx context.Context, acc domain.Account, f Filter, period string,
) ([]aggregate.PeriodStat, error) {
	if !domain.ValidPeriod(period) {
		return nil, apperr.Validation(fmt.Sprintf("kỳ không hợp lệ: %q", period))
	}
	v, err := s.Load(ctx, acc, f)
	if err != nil {
		return nil, err
	}
	return v.Periods(period), nil
}
```

Bảo đảm `trade.go` đã import `journal/internal/aggregate`, `journal/internal/apperr` và `fmt`. Nếu thiếu, thêm.

- [x] **Step 5: Chạy test để chắc chắn nó pass**

Run: `cd backend && go test ./internal/service/ -run TestTradeServicePeriods -v`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add backend/internal/service/journal.go \
        backend/internal/service/trade.go \
        backend/internal/service/journal_periods_test.go
git commit -m "feat(be): TradeService.Periods dựng thẻ theo kỳ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: HTTP handler và route

**Files:**
- Create: `backend/internal/httpapi/journalnote_handler.go`
- Create: `backend/internal/httpapi/journalnote_handler_test.go`
- Modify: `backend/internal/httpapi/router.go`
- Modify: `backend/cmd/api/main.go`

**Interfaces:**
- Consumes: `service.NewJournalNoteService`, `JournalNoteService.List/Save/Delete` (Task 4); `TradeService.Periods` (Task 5); `repository.NewJournalNoteRepo` (Task 3); `filterFromQuery`, `Account(r.Context())`, `OK`, `Fail`, `FailErr`, `DecodeJSON` (đã có)
- Produces:
  - Route `GET /api/accounts/{id}/periods?period=day|week`
  - Route `GET /api/accounts/{id}/period-notes?period=day|week`
  - Route `PUT /api/accounts/{id}/period-notes/{period}/{key}`
  - Route `DELETE /api/accounts/{id}/period-notes/{period}/{key}`
  - `Deps.JournalNote *service.JournalNoteService`

- [x] **Step 1: Viết test thất bại**

Tạo `backend/internal/httpapi/journalnote_handler_test.go`. Đọc `backend/internal/httpapi/notetemplate_handler_test.go` trước để dùng CÙNG cách dựng router test và cùng helper đọc envelope.

```go
package httpapi_test

import (
	"net/http"
	"testing"
)

// Khoá sai dạng bị chặn ở 400 TRƯỚC khi chạm DB: period_key là bãi rác chuỗi
// tự do nếu không có cổng này.
func TestPeriodNotePutRejectsBadKey(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	res := srv.do(t, http.MethodPut, "/api/accounts/1/period-notes/day/21-09-2026",
		`{"body_html":"<p>x</p>"}`)

	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", res.StatusCode)
	}
}

func TestPeriodNotePutRejectsBadPeriod(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	res := srv.do(t, http.MethodPut, "/api/accounts/1/period-notes/month/2026-09",
		`{"body_html":"<p>x</p>"}`)

	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", res.StatusCode)
	}
}

// Lưu rồi đọc lại: vòng đời đầy đủ qua HTTP.
func TestPeriodNotePutThenList(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	put := srv.do(t, http.MethodPut, "/api/accounts/1/period-notes/day/2026-09-21",
		`{"body_html":"<p>vào lệnh sớm</p>"}`)
	if put.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200", put.StatusCode)
	}

	list := srv.do(t, http.MethodGet, "/api/accounts/1/period-notes?period=day", "")
	if list.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", list.StatusCode)
	}
}

// Body rỗng xoá ghi chú, và trả 200 chứ không 404: kết quả mong muốn đã đạt.
func TestPeriodNotePutEmptyBodyDeletes(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	srv.do(t, http.MethodPut, "/api/accounts/1/period-notes/day/2026-09-21",
		`{"body_html":"<p>x</p>"}`)
	res := srv.do(t, http.MethodPut, "/api/accounts/1/period-notes/day/2026-09-21",
		`{"body_html":""}`)

	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
}

// Xoá ghi chú không tồn tại là 404: người dùng chủ động bấm xoá một thứ họ
// tin là đang có.
func TestPeriodNoteDeleteMissingReturns404(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	res := srv.do(t, http.MethodDelete, "/api/accounts/1/period-notes/day/2026-09-21", "")

	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", res.StatusCode)
	}
}

func TestPeriodsRejectsUnknownPeriod(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	res := srv.do(t, http.MethodGet, "/api/accounts/1/periods?period=month", "")

	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", res.StatusCode)
	}
}

// Không có tham số period thì mặc định là "day" — tab mặc định của UI.
func TestPeriodsDefaultsToDay(t *testing.T) {
	srv := newJournalNoteTestServer(t)

	res := srv.do(t, http.MethodGet, "/api/accounts/1/periods", "")

	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
}
```

**Lưu ý:** `newJournalNoteTestServer` và method `do` là helper bạn viết trong file test này, theo đúng khuôn của `notetemplate_handler_test.go`. Nó phải dựng router với `Deps` đủ để gắn nhánh route này (bao gồm `Trade` và `JournalNote`), auth giả lập một user sở hữu account id 1, và store trong RAM.

- [x] **Step 2: Chạy test để chắc chắn nó fail**

Run: `cd backend && go test ./internal/httpapi/ -run 'TestPeriodNote|TestPeriods' -v`
Expected: FAIL — route chưa tồn tại, trả 404

- [x] **Step 3: Viết handler**

Tạo `backend/internal/httpapi/journalnote_handler.go`:

```go
package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"

	"journal/internal/aggregate"
	"journal/internal/domain"
	"journal/internal/service"
)

type JournalNoteHandler struct {
	notes  *service.JournalNoteService
	trades *service.TradeService
}

// DTO riêng, không marshal thẳng domain.JournalNote: struct domain mang tag
// GORM, lôi ra API là rò rỉ tầng lưu trữ (cùng lý do noteTemplateDTO tồn tại).
type journalNoteDTO struct {
	Period    string    `json:"period"`
	PeriodKey string    `json:"period_key"`
	BodyHTML  string    `json:"body_html"`
	UpdatedAt time.Time `json:"updated_at"`
}

func toJournalNoteDTO(n domain.JournalNote) journalNoteDTO {
	return journalNoteDTO{
		Period:    n.Period,
		PeriodKey: n.PeriodKey,
		BodyHTML:  n.BodyHTML,
		UpdatedAt: n.UpdatedAt,
	}
}

// make(..., 0, n) chứ không var: slice rỗng phải marshal thành [] chứ không
// phải null — null.map(...) là crash ở frontend.
func toJournalNoteDTOs(list []domain.JournalNote) []journalNoteDTO {
	out := make([]journalNoteDTO, 0, len(list))
	for _, n := range list {
		out = append(out, toJournalNoteDTO(n))
	}
	return out
}

// periodStatDTO cắt CurrentBalance và NetCashFlow khỏi KPI của kỳ.
//
// Hai trường đó luôn bằng 0 ở cấp kỳ và không mang nghĩa nào: số dư là một mốc
// tại một thời điểm, không phải đại lượng của một khoảng. Để lọt ra JSON thì
// frontend có hai con số 0 trông như dữ liệu thật.
type periodStatDTO struct {
	Key    string                  `json:"key"`
	Start  string                  `json:"start"`
	End    string                  `json:"end"`
	Volume decimal.Decimal         `json:"volume"`
	Points []aggregate.PeriodPoint `json:"points"`
	KPI    statsDTO                `json:"kpi"`
}

type journalNotePutRequest struct {
	BodyHTML string `json:"body_html"`
}

// periodFromQuery đọc kỳ từ query, mặc định "day".
//
// Mặc định chứ không bắt buộc: "day" là tab đầu tiên của UI, nên URL trần phải
// trả về đúng thứ người dùng thấy khi bấm vào tab đó.
func periodFromQuery(r *http.Request) string {
	if p := r.URL.Query().Get("period"); p != "" {
		return p
	}
	return domain.PeriodDay
}

func (h *JournalNoteHandler) Periods(w http.ResponseWriter, r *http.Request) {
	stats, err := h.trades.Periods(r.Context(), Account(r.Context()), filterFromQuery(r), periodFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	out := make([]periodStatDTO, 0, len(stats))
	for _, s := range stats {
		out = append(out, periodStatDTO{
			Key:    s.Key,
			Start:  s.Start,
			End:    s.End,
			Volume: s.Volume,
			Points: s.Points,
			KPI:    toStatsDTO(s.KPI),
		})
	}
	OK(w, out)
}

func (h *JournalNoteHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.notes.List(r.Context(), Account(r.Context()).ID, periodFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toJournalNoteDTOs(list))
}

// Save là PUT: khoá (account, period, key) do CLIENT biết trước, nên "tạo" và
// "sửa" là cùng một thao tác. Body rỗng nghĩa là xoá — xem service.Save.
func (h *JournalNoteHandler) Save(w http.ResponseWriter, r *http.Request) {
	var req journalNotePutRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	saved, deleted, err := h.notes.Save(
		r.Context(),
		Account(r.Context()).ID,
		chi.URLParam(r, "period"),
		chi.URLParam(r, "key"),
		req.BodyHTML,
	)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	if deleted {
		OK(w, nil)
		return
	}
	OK(w, toJournalNoteDTO(saved))
}

func (h *JournalNoteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	err := h.notes.Delete(
		r.Context(),
		Account(r.Context()).ID,
		chi.URLParam(r, "period"),
		chi.URLParam(r, "key"),
	)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
```

**Lưu ý:** `statsDTO` và `toStatsDTO` đã tồn tại — xác nhận tên thật bằng `grep -n "statsDTO\|func toStatsDTO" backend/internal/httpapi/*.go` và dùng đúng tên đó.

- [x] **Step 4: Gắn route**

Trong `backend/internal/httpapi/router.go`, thêm trường vào `Deps`:

```go
	JournalNote  *service.JournalNoteService
```

Rồi bên trong khối `one.Route("/accounts/{id}", ...)`, ngay SAU khối `if d.Trade != nil { ... }`, thêm:

```go
					// Thẻ kỳ và ghi chú kỳ cần CẢ hai service: thẻ lấy số từ
					// TradeService, ghi chú lấy nội dung từ JournalNoteService.
					// Thiếu một trong hai thì nhánh không gắn — cùng quy ước
					// "trường nil nghĩa là nhánh đó không có" của Deps.
					if d.Trade != nil && d.JournalNote != nil {
						jn := &JournalNoteHandler{notes: d.JournalNote, trades: d.Trade}
						one.Get("/periods", jn.Periods)
						one.Get("/period-notes", jn.List)
						one.Route("/period-notes/{period}/{key}", func(pn chi.Router) {
							pn.Put("/", jn.Save)
							pn.Delete("/", jn.Delete)
						})
					}
```

- [x] **Step 5: Nối dây trong `main.go`**

Trong `backend/cmd/api/main.go`, tìm chỗ dựng `NoteTemplateService` (chạy `grep -n "NoteTemplate" backend/cmd/api/main.go`) và thêm ngay cạnh:

```go
	journalNoteSvc := service.NewJournalNoteService(repository.NewJournalNoteRepo(db))
```

Rồi thêm vào literal `httpapi.Deps{...}`:

```go
		JournalNote:  journalNoteSvc,
```

- [x] **Step 6: Chạy test để chắc chắn nó pass**

Run: `cd backend && go build ./... && go test ./internal/httpapi/ -run 'TestPeriodNote|TestPeriods' -v`
Expected: PASS, cả 7 test

- [x] **Step 7: Chạy TOÀN BỘ test backend**

Run: `cd backend && make test` (hoặc `make test` từ thư mục gốc — kiểm `Makefile` để biết đúng chỗ chạy)
Expected: PASS toàn bộ, không có test cũ nào vỡ

- [x] **Step 8: Commit**

```bash
git add backend/internal/httpapi/journalnote_handler.go \
        backend/internal/httpapi/journalnote_handler_test.go \
        backend/internal/httpapi/router.go \
        backend/cmd/api/main.go
git commit -m "feat(be): route /periods và /period-notes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — kiểu dữ liệu, query key và hook

**Files:**
- Create: `frontend/src/features/trades/periodTypes.ts`
- Create: `frontend/src/features/trades/periodHooks.ts`
- Modify: `frontend/src/lib/queryKeys.ts`

**Interfaces:**
- Consumes: JSON của `GET /periods`, `GET /period-notes`, `PUT`/`DELETE /period-notes/{period}/{key}` (Task 6); `api.get/put/del` từ `@/lib/api`; `TradeFilter` từ `./filters`
- Produces:
  - `type PeriodKind = "day" | "week"`
  - `type PeriodPoint = { stt: number; cum_by_trade: string }`
  - `type PeriodStat = { key: string; start: string; end: string; volume: string; points: PeriodPoint[]; kpi: PeriodKpi }`
  - `type PeriodKpi` — các trường dùng trên thẻ
  - `type PeriodNote = { period: string; period_key: string; body_html: string; updated_at: string }`
  - `usePeriods(accountId: number, filter: TradeFilter, period: PeriodKind)`
  - `usePeriodNotes(accountId: number, period: PeriodKind)`
  - `useSavePeriodNote(accountId: number, period: PeriodKind)`
  - `qk.periods(accountId, filter, period)`, `qk.periodsAll(accountId)`, `qk.periodNotes(accountId, period)`

- [x] **Step 1: Thêm query key**

Trong `frontend/src/lib/queryKeys.ts`, thêm vào object `qk` (sau `charts`):

```ts
  // Thẻ kỳ nằm dưới tiền tố ["accounts", id]: chúng là số liệu của account và
  // phải bay theo mọi lần lệnh thay đổi, giống charts.
  periods: (accountId: number, f: TradeFilter, period: string) =>
    ["accounts", accountId, "periods", period, f] as const,
  periodsAll: (accountId: number) => ["accounts", accountId, "periods"] as const,

  // Ghi chú kỳ KHÔNG chịu bộ lọc nên key không mang filter: nó gắn với khoá
  // kỳ, và thẻ nào hiện ra thì ghi chú của kỳ đó đi kèm.
  periodNotes: (accountId: number, period: string) =>
    ["accounts", accountId, "period-notes", period] as const,
```

- [x] **Step 2: Viết kiểu dữ liệu**

Tạo `frontend/src/features/trades/periodTypes.ts`:

```ts
/**
 * Kiểu của tab Ngày/Tuần.
 *
 * Tiền luôn là CHUỖI ở phía frontend, không phải number: backend gửi
 * decimal dạng chuỗi để không mất chữ số, và ép sang number là đúng chỗ mất
 * nó (quy tắc 1 của CLAUDE.md nhìn từ phía này).
 */

export type PeriodKind = "day" | "week";

export type PeriodPoint = {
  stt: number;
  cum_by_trade: string;
};

/**
 * Các chỉ số hiện trên thẻ. Tên trường khớp ĐÚNG json tag của statsDTO bên
 * backend, nên không có tầng ánh xạ nào ở giữa để lệch.
 *
 * Trường có thể null nghĩa là "không tính được" — chia cho 0, hoặc chưa đủ dữ
 * liệu. Thẻ hiện "—" cho chúng, vì 0 và "không xác định" khác nhau.
 */
export type PeriodKpi = {
  net_profit: string;
  total_win: string;
  total_loss: string;
  total_fees: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_pct: string | null;
  profit_factor: string | null;
  biggest_winner: string | null;
  biggest_loser: string | null;
};

export type PeriodStat = {
  key: string;
  start: string;
  end: string;
  volume: string;
  points: PeriodPoint[];
  kpi: PeriodKpi;
};

export type PeriodNote = {
  period: string;
  period_key: string;
  body_html: string;
  updated_at: string;
};
```

**Đã xác nhận:** các json tag trên khớp đúng `statsDTO` ở `backend/internal/httpapi/trade_dto.go:164`.

- [x] **Step 3: Viết hook**

Tạo `frontend/src/features/trades/periodHooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { writeParams } from "./filters";
import type { TradeFilter } from "./filters";
import type { PeriodKind, PeriodNote, PeriodStat } from "./periodTypes";

/**
 * Query string của thẻ kỳ: bộ lọc hiện có cộng thêm `period`.
 *
 * Dùng lại writeParams để bảy ô lọc không phải liệt kê lần thứ hai ở đây —
 * thêm ô lọc thứ tám thì tab Ngày/Tuần tự hiểu, không cần ai nhớ sửa chỗ này.
 */
function periodQuery(filter: TradeFilter, period: PeriodKind): string {
  const sp = writeParams(filter, 1);
  sp.delete("page");
  sp.delete("size");
  sp.set("period", period);
  return sp.toString();
}

export function usePeriods(accountId: number, filter: TradeFilter, period: PeriodKind) {
  return useQuery({
    queryKey: qk.periods(accountId, filter, period),
    queryFn: () =>
      api.get<PeriodStat[]>(`/accounts/${accountId}/periods?${periodQuery(filter, period)}`),
  });
}

/**
 * Ghi chú của MỌI kỳ trong một lần gọi.
 *
 * Một request cho cả danh sách chứ không một request mỗi thẻ: ba mươi thẻ trên
 * màn hình là ba mươi request, và chúng đều trả về vài trăm byte.
 */
export function usePeriodNotes(accountId: number, period: PeriodKind) {
  return useQuery({
    queryKey: qk.periodNotes(accountId, period),
    queryFn: () =>
      api.get<PeriodNote[]>(`/accounts/${accountId}/period-notes?period=${period}`),
  });
}

/**
 * Lưu ghi chú cho một kỳ. Body rỗng nghĩa là xoá — backend xử như vậy, nên
 * frontend không cần một mutation riêng cho nút xoá.
 */
export function useSavePeriodNote(accountId: number, period: PeriodKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, bodyHtml }: { key: string; bodyHtml: string }) =>
      api.put<PeriodNote | null>(`/accounts/${accountId}/period-notes/${period}/${key}`, {
        body_html: bodyHtml,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.periodNotes(accountId, period) }),
  });
}
```

- [x] **Step 4: Kiểm tra biên dịch**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npx tsc --noEmit
```
Expected: không lỗi. Nếu `writeParams` có chữ ký khác, sửa `periodQuery` cho khớp — đọc `frontend/src/features/trades/filters.ts` để biết chữ ký thật.

- [x] **Step 5: Commit**

```bash
git add frontend/src/features/trades/periodTypes.ts \
        frontend/src/features/trades/periodHooks.ts \
        frontend/src/lib/queryKeys.ts
git commit -m "feat(fe): kiểu và hook cho thẻ kỳ và ghi chú kỳ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend — hộp soạn ghi chú kỳ

**Files:**
- Create: `frontend/src/features/trades/PeriodNoteDialog.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `useSavePeriodNote` (Task 7); `RichTextEditor` từ `@/components/ui/rich-text-editor`; `TemplateMenu` từ `@/features/noteTemplates/TemplateMenu`; `sanitizeNoteHtml`, `isEmptyNote` từ `@/lib/richText`; `Dialog` từ `@/components/ui/dialog`
- Produces: `<PeriodNoteDialog accountId period periodKey title initialHtml open onOpenChange />`

- [x] **Step 1: Thêm chuỗi i18n**

Mở `frontend/src/i18n/strings.ts`, đọc cấu trúc hiện có, rồi thêm các khoá sau vào ĐÚNG chỗ của cả hai ngôn ngữ mà file đang hỗ trợ (giữ nguyên khuôn nesting của file):

```
periods.tabTrade      → "Lệnh"
periods.tabDay        → "Ngày"
periods.tabWeek       → "Tuần"
periods.addNote       → "Ghi chú"
periods.editNote      → "Sửa ghi chú"
periods.noteTitle     → "Ghi chú {{period}}"
periods.save          → "Lưu"
periods.tradeCount    → "{{n}} lệnh"
periods.grossProfit   → "Lãi gộp"
periods.winners       → "Thắng/thua"
periods.fees          → "Phí"
periods.winRate       → "Tỷ lệ thắng"
periods.volume        → "Volume"
periods.profitFactor  → "Profit factor"
periods.biggestLoser  → "Lỗ sâu nhất"
periods.biggestWinner → "Lãi cao nhất"
periods.empty         → "Chưa có lệnh nào để tổng kết"
periods.emptyHint     → "Thêm lệnh đầu tiên rồi quay lại đây."
periods.noMatch       → "Không có kỳ nào khớp bộ lọc"
periods.noMatchHint   → "Nới bộ lọc để thấy các kỳ khác."
periods.saveError     → "Không lưu được ghi chú: {{reason}}"
```

- [x] **Step 2: Viết component**

Tạo `frontend/src/features/trades/PeriodNoteDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { TemplateMenu } from "@/features/noteTemplates/TemplateMenu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/i18n/errors";
import { sanitizeNoteHtml } from "@/lib/richText";
import { useI18n } from "@/i18n";
import { useSavePeriodNote } from "./periodHooks";
import type { PeriodKind } from "./periodTypes";

/**
 * Hộp soạn ghi chú cho một kỳ.
 *
 * Dùng lại RichTextEditor và TemplateMenu của ô Notes trong form lệnh: cùng
 * trình soạn, cùng bộ mẫu, nên người dùng không phải học lần thứ hai. Mẫu ghi
 * chú lưu đúng định dạng HTML của Quill nên chèn vào đây chỉ là nối chuỗi.
 */
export function PeriodNoteDialog({
  accountId,
  period,
  periodKey,
  title,
  initialHtml,
  open,
  onOpenChange,
}: {
  accountId: number;
  period: PeriodKind;
  periodKey: string;
  title: string;
  initialHtml: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [html, setHtml] = useState(initialHtml);
  const save = useSavePeriodNote(accountId, period);

  // Nạp lại nội dung mỗi lần MỞ, không phải mỗi lần initialHtml đổi: hộp đang
  // mở mà query nền trả về vẫn sẽ ghi đè thứ người dùng đang gõ dở.
  useEffect(() => {
    if (open) setHtml(initialHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodKey]);

  async function onSave() {
    // sanitizeNoteHtml ở ranh giới LƯU, giống ô Notes của lệnh: nội dung ra
    // khỏi DB được render bằng dangerouslySetInnerHTML, nên hai đường vào phải
    // gặp nhau ở cùng một luật lọc.
    await save.mutateAsync({ key: periodKey, bodyHtml: sanitizeNoteHtml(html) });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-w KHÔNG tiền tố thua sm:max-w-lg của shadcn — phải ghi kèm sm: */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <TemplateMenu onInsert={(body) => setHtml((prev) => prev + body)} />
          <RichTextEditor value={html} onChange={setHtml} />
        </div>

        {save.error != null && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("periods.saveError", { reason: errorMessage(save.error, locale, t) })}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {t("periods.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Lưu ý:** chữ ký thật của `RichTextEditor` và `TemplateMenu` phải được xác nhận trước — đọc `frontend/src/components/ui/rich-text-editor.tsx` và `frontend/src/features/noteTemplates/TemplateMenu.tsx`, rồi sửa props cho khớp. Đặc biệt `TemplateMenu` có thể nhận tên prop khác `onInsert`.

- [x] **Step 3: Kiểm tra biên dịch**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npx tsc --noEmit
```
Expected: không lỗi

- [x] **Step 4: Commit**

```bash
git add frontend/src/features/trades/PeriodNoteDialog.tsx frontend/src/i18n/strings.ts
git commit -m "feat(fe): hộp soạn ghi chú kỳ dùng lại editor của lệnh

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Frontend — thẻ kỳ

**Files:**
- Create: `frontend/src/features/trades/PeriodCard.tsx`
- Create: `frontend/src/features/trades/PeriodSparkline.tsx`

**Interfaces:**
- Consumes: `PeriodStat`, `PeriodNote`, `PeriodKind` (Task 7); `PeriodNoteDialog` (Task 8); `MoneyText` từ `@/components/MoneyText`; `noteToOneLine` từ `@/lib/richText`; Recharts
- Produces:
  - `<PeriodSparkline points={PeriodPoint[]} positive={boolean} />`
  - `<PeriodCard accountId stat note period />`

- [x] **Step 1: Viết sparkline**

Tạo `frontend/src/features/trades/PeriodSparkline.tsx`:

```tsx
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { PeriodPoint } from "./periodTypes";

/**
 * Đường equity TRONG một kỳ, không trục, không nhãn.
 *
 * Nó trả lời "trong kỳ này tiền đi lên hay đi xuống, mượt hay gãy" — một câu
 * hỏi về HÌNH DẠNG. Thêm trục và nhãn vào một khung cao 48px chỉ làm chữ chen
 * nhau; con số chính xác đã nằm ngay cạnh, ở hàng KPI.
 *
 * KHÔNG rebase về 0 tại đầu kỳ: đây là một đoạn của đường equity thật.
 */
export function PeriodSparkline({ points, positive }: { points: PeriodPoint[]; positive: boolean }) {
  // Một điểm không vẽ thành đường được. Recharts vẫn nhận, nhưng kết quả là
  // một khung trống trông như lỗi tải.
  if (points.length < 2) return <div className="h-12" aria-hidden />;

  const data = points.map((p) => ({ stt: p.stt, value: +p.cum_by_trade });

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
            stroke={positive ? "var(--primary)" : "var(--status-error)"}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Lưu ý:** dòng `const data = ...` ở trên CỐ Ý cần bạn sửa dấu ngoặc cho đúng cú pháp, và quan trọng hơn: `+p.cum_by_trade` là phép ép chuỗi sang number mà cổng styleguard có thể cấm. Đọc `frontend/src/test/styleguard.test.ts` và `frontend/src/features/dashboard/prepare.ts` để xem các biểu đồ khác đang đổi chuỗi decimal sang số cho Recharts bằng cách nào, rồi dùng ĐÚNG cách đó.

- [x] **Step 2: Viết thẻ kỳ**

Tạo `frontend/src/features/trades/PeriodCard.tsx`:

```tsx
import { useState } from "react";
import { ChevronRightIcon, NotebookPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";
import { noteToOneLine } from "@/lib/richText";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PeriodNoteDialog } from "./PeriodNoteDialog";
import { PeriodSparkline } from "./PeriodSparkline";
import type { PeriodKind, PeriodNote, PeriodStat } from "./periodTypes";

/**
 * Một kỳ — một ngày hoặc một tuần — trên tab Ngày/Tuần.
 *
 * GẬP LẠI theo mặc định. Mở sẵn mọi thẻ thì mười ngày là mười màn hình cuộn,
 * và không so sánh được hai ngày cách nhau một tuần. Tầng đầu mang đúng ba thứ
 * người ta cuộn để tìm: kỳ nào, lãi lỗ bao nhiêu, mấy lệnh.
 *
 * Trạng thái gập KHÔNG lưu vào URL: nó là thói quen đọc trong một phiên, không
 * phải nội dung của trang.
 */
export function PeriodCard({
  accountId,
  stat,
  note,
  period,
  intensity,
  currency,
}: {
  accountId: number;
  stat: PeriodStat;
  note: PeriodNote | undefined;
  period: PeriodKind;
  /** 0..1 — độ lớn của kỳ này so với kỳ mạnh nhất đang hiện. */
  intensity: number;
  currency: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const positive = !stat.kpi.net_profit.startsWith("-");
  const label = period === "day" ? stat.key : `${stat.start} – ${stat.end}`;

  return (
    <article className="relative overflow-hidden rounded-md border border-border bg-surface-base">
      {/*
        Dải màu mép trái: cuộn nhanh qua ba tháng là đọc được nhịp lời/lỗ mà
        không đọc một chữ số nào. Nó KHÔNG phải kênh thông tin duy nhất — con
        số net đứng ngay cạnh, nên người không phân biệt được teal với đỏ vẫn
        đọc được thẻ.
      */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: positive ? "var(--primary)" : "var(--status-error)",
          opacity: 0.25 + intensity * 0.75,
        }}
      />

      <header className="flex flex-wrap items-center gap-3 py-3 pl-4 pr-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 cursor-pointer items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
          />
          <span className="font-medium tracking-tight">{label}</span>
          <MoneyText value={stat.kpi.net_profit} currency={currency} />
          <span className="text-sm text-muted-foreground">
            {t("periods.tradeCount", { n: String(stat.kpi.total_trades) })}
          </span>
        </button>

        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <NotebookPenIcon aria-hidden />
          {note ? t("periods.editNote") : t("periods.addNote")}
        </Button>
      </header>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <PeriodSparkline points={stat.points} positive={positive} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label={t("periods.grossProfit")}>
                <MoneyText value={stat.kpi.total_win} currency={currency} />
              </Stat>
              <Stat label={t("periods.winners")}>
                {stat.kpi.win_count} / {stat.kpi.loss_count}
              </Stat>
              <Stat label={t("periods.fees")}>
                <MoneyText value={stat.kpi.total_fees} currency={currency} />
              </Stat>
              <Stat label={t("periods.winRate")}>{percent(stat.kpi.win_pct)}</Stat>
              <Stat label={t("periods.volume")}>{stat.volume}</Stat>
              <Stat label={t("periods.profitFactor")}>{stat.kpi.profit_factor ?? "—"}</Stat>
            </dl>
          </div>

          {/*
            Ghi chú chỉ xuất hiện khi CÓ nội dung: một ô rỗng trên mỗi thẻ là
            một ô rỗng giả vờ là dữ liệu.
          */}
          {note && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              {noteToOneLine(note.body_html)}
            </p>
          )}
        </div>
      )}

      <PeriodNoteDialog
        accountId={accountId}
        period={period}
        periodKey={stat.key}
        title={t("periods.noteTitle", { period: label })}
        initialHtml={note?.body_html ?? ""}
        open={editing}
        onOpenChange={setEditing}
      />
    </article>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Tỷ lệ 0..1 của backend thành phần trăm để đọc; null thành "—". */
function percent(v: string | null): string {
  if (v === null) return "—";
  return `${Math.round(+v * 100)}%`;
}
```

**Lưu ý:** cùng cảnh báo như Task 9 Step 1 — `+v` trong `percent` có thể vi phạm cổng styleguard. Đọc `frontend/src/lib/decimal.ts` trước; nếu ở đó đã có hàm đổi chuỗi decimal sang phần trăm hoặc sang number, dùng nó. Cũng xác nhận chữ ký thật của `MoneyText` bằng cách đọc `frontend/src/components/MoneyText.tsx`.

- [x] **Step 3: Kiểm tra biên dịch**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npx tsc --noEmit
```
Expected: không lỗi

- [x] **Step 4: Commit**

```bash
git add frontend/src/features/trades/PeriodCard.tsx frontend/src/features/trades/PeriodSparkline.tsx
git commit -m "feat(fe): thẻ kỳ gập lại với dải màu mép trái

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Frontend — gắn ba tab vào TradesPage

**Files:**
- Create: `frontend/src/features/trades/PeriodList.tsx`
- Modify: `frontend/src/features/trades/TradesPage.tsx`
- Modify: `frontend/src/features/trades/filters.ts`

**Interfaces:**
- Consumes: `usePeriods`, `usePeriodNotes` (Task 7); `PeriodCard` (Task 9); `Segmented` từ `@/components/ui/segmented`; `useFilterParams` (đã có)
- Produces:
  - `readView(sp: URLSearchParams): "trades" | "day" | "week"` trong `filters.ts`
  - `<PeriodList account period filter />`

- [x] **Step 1: Thêm `readView` vào `filters.ts`**

Thêm vào `frontend/src/features/trades/filters.ts`:

```ts
export type TradeView = "trades" | "day" | "week";

/**
 * Tab đang mở, đọc từ URL.
 *
 * Trên URL chứ không trong useState: /trades?view=week&setup=A gửi cho người
 * khác thì họ mở ra thấy đúng màn hình đó, và nút Back đi đúng một bước.
 *
 * Giá trị lạ về "trades" thay vì báo lỗi: một query string gõ tay sai không
 * đáng để chặn người dùng khỏi trang.
 */
export function readView(sp: URLSearchParams): TradeView {
  const v = sp.get("view");
  return v === "day" || v === "week" ? v : "trades";
}
```

**Lưu ý:** `view` KHÔNG được thêm vào `EMPTY_FILTER` — nó không phải bộ lọc, và thêm vào đó sẽ khiến `hasFilter` báo true chỉ vì người dùng đang ở tab Ngày, rồi nút xuất CSV đổi nhãn sai theo. Cũng kiểm `writeParams` để bảo đảm nó GIỮ tham số `view` khi ghi lại query string; nếu nó dựng `URLSearchParams` từ đầu và làm rơi `view`, sửa nó nhận thêm view hoặc bảo toàn các khoá ngoài `KEYS`.

- [x] **Step 2: Viết `PeriodList`**

Tạo `frontend/src/features/trades/PeriodList.tsx`:

```tsx
import { Loading } from "@/components/Loading";
import { ErrorBlock } from "@/components/AccountGate";
import { useI18n } from "@/i18n";
import type { Account } from "@/features/accounts/types";
import { PeriodCard } from "./PeriodCard";
import { usePeriodNotes, usePeriods } from "./periodHooks";
import type { PeriodKind } from "./periodTypes";
import type { TradeFilter } from "./filters";

/**
 * Danh sách thẻ của tab Ngày hoặc tab Tuần.
 *
 * Hai query song song, KHÔNG lồng nhau: số liệu kỳ và ghi chú kỳ không phụ
 * thuộc nhau, nên chờ tuần tự chỉ làm màn hình đứng lâu gấp đôi. Thẻ vẽ được
 * ngay khi có số liệu; ghi chú về sau thì nút đổi nhãn.
 */
export function PeriodList({
  account,
  period,
  filter,
  hasFilter,
}: {
  account: Account;
  period: PeriodKind;
  filter: TradeFilter;
  hasFilter: boolean;
}) {
  const { t } = useI18n();
  const stats = usePeriods(account.id, filter, period);
  const notes = usePeriodNotes(account.id, period);

  if (stats.isPending) return <Loading row={4} />;
  if (stats.error) return <ErrorBlock error={stats.error} />;

  const rows = stats.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
        <p className="font-medium">{hasFilter ? t("periods.noMatch") : t("periods.empty")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {hasFilter ? t("periods.noMatchHint") : t("periods.emptyHint")}
        </p>
      </div>
    );
  }

  const byKey = new Map((notes.data ?? []).map((n) => [n.period_key, n]));

  // Độ đậm của dải màu tính so với kỳ MẠNH NHẤT đang hiện, không phải một mốc
  // cố định: người đánh 20 US$ một ngày và người đánh 2000 US$ đều phải thấy
  // được nhịp của chính mình.
  const peak = Math.max(...rows.map((r) => Math.abs(netOf(r.kpi.net_profit))), 1);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((stat) => (
        <PeriodCard
          key={stat.key}
          accountId={account.id}
          stat={stat}
          note={byKey.get(stat.key)}
          period={period}
          intensity={Math.abs(netOf(stat.kpi.net_profit)) / peak}
          currency={account.currency}
        />
      ))}
    </div>
  );
}
```

**Lưu ý:** `netOf` là hàm bạn phải viết hoặc thay thế — nó đổi chuỗi decimal thành number CHỈ để so sánh độ lớn tương đối (không phải để hiển thị tiền). Đọc `frontend/src/lib/decimal.ts` xem đã có sẵn hàm nào làm việc này chưa; nếu có thì dùng, nếu không thì viết trong file này kèm comment nói rõ vì sao ở đây được phép: kết quả chỉ nuôi độ mờ của một dải trang trí, không có con số nào hiện ra cho người dùng đọc.

- [x] **Step 3: Gắn tab vào TradesPage**

Trong `frontend/src/features/trades/TradesPage.tsx`:

1. Thêm import:

```tsx
import { Segmented } from "@/components/ui/segmented";
import { PeriodList } from "./PeriodList";
import { readView, type TradeView } from "./filters";
```

2. Trong `NhatKyLenh`, ngay sau dòng `const size = readSize(sp);`, thêm:

```tsx
  const view = readView(sp);

  function setView(next: TradeView) {
    const nextSp = new URLSearchParams(sp);
    if (next === "trades") nextSp.delete("view");
    else nextSp.set("view", next);
    // Sang trang 1: số trang của bảng lệnh không có nghĩa ở tab kỳ, và giữ
    // lại "page=7" sẽ dội ngược về bảng ở trang 7 khi người dùng quay lại.
    nextSp.delete("page");
    setSp(nextSp, { replace: true });
  }
```

3. Ngay SAU khối `<header>` và khối `{loiXuat != null && ...}`, TRƯỚC `{kpi.data && <StatsStrip ... />}`, thêm:

```tsx
      {/*
        Ba tab là ba CÁCH ĐỌC cùng một tập lệnh, không phải ba trang khác nhau:
        bộ lọc bên dưới áp cho cả ba, nên nó đứng ngoài và đứng sau.
      */}
      <Segmented<TradeView>
        value={view}
        onChange={setView}
        options={["trades", "day", "week"] as const}
        label={t("trades.title")}
        className="w-auto self-start"
        renderOption={(v) =>
          v === "trades" ? t("periods.tabTrade") : v === "day" ? t("periods.tabDay") : t("periods.tabWeek")
        }
      />
```

4. Bọc phần bảng lệnh hiện có. Tìm khối bắt đầu từ `{ds.isPending && <Loading row={6} />}` cho tới hết khối phân trang (kết thúc ở `)}` của `{ds.data && ds.data.items.length > 0 && ( ... )}`), rồi bọc toàn bộ trong điều kiện:

```tsx
      {view === "trades" && (
        <>
          {/* … toàn bộ nội dung cũ: Loading, ErrorBlock, empty state, TradeTable, footer phân trang … */}
        </>
      )}

      {view !== "trades" && (
        <PeriodList
          account={account}
          period={view}
          filter={deferredFilter}
          hasFilter={hasFilter}
        />
      )}
```

`StatsStrip`, `FilterBar`, `TradeFormDialog` và `AlertDialog` xoá lệnh GIỮ NGUYÊN ngoài điều kiện — KPI và bộ lọc áp cho cả ba tab, còn hai hộp thoại kia phải sống sót qua mọi tab.

- [x] **Step 4: Kiểm tra biên dịch và build**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npm run build
```
Expected: cả hai PASS

- [x] **Step 5: Chạy test frontend**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npm test -- --run
```
Expected: PASS — đặc biệt `src/test/styleguard.test.ts` phải xanh. Nếu nó chặn một phép ép kiểu số nào đó, sửa theo hướng dẫn ở Task 9.

- [x] **Step 6: Commit**

```bash
git add frontend/src/features/trades/PeriodList.tsx \
        frontend/src/features/trades/TradesPage.tsx \
        frontend/src/features/trades/filters.ts
git commit -m "feat(fe): ba tab Lệnh/Ngày/Tuần trên trang lệnh

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Kiểm tra đầu-cuối và dọn dẹp

**Files:**
- Modify: `CLAUDE.md` (nếu cần ghi quy ước mới)

- [x] **Step 1: Chạy toàn bộ test backend**

Run: `make test`
Expected: PASS toàn bộ. Chép lại con số thật vào báo cáo, không ước lượng.

- [x] **Step 2: Chạy toàn bộ kiểm tra frontend**

Run:
```bash
cd frontend && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npx tsc --noEmit \
  && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npm run build \
  && PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH" npm test -- --run
```
Expected: cả ba PASS

- [x] **Step 3: Chạy migration trên DB thật**

Run: kiểm `Makefile` để biết lệnh migrate của dự án (`grep -n "migrate" Makefile`), rồi chạy nó.
Expected: `0005_journal_notes` chạy sạch. Thử cả `down` rồi `up` lại để chắc file down đúng.

- [x] **Step 4: Thử tay trên giao diện**

Chạy app theo cách dự án vẫn dùng. Lưu ý từ memory: container `:5173` không mount `src`, nên để xem thay đổi phải chạy vite trên máy host ở cổng khác (ví dụ 5199).

Kiểm bằng mắt, theo thứ tự:

1. Mở `/trades` — tab `Lệnh` sáng, bảng hiện như cũ.
2. Bấm `Ngày` — URL thành `?view=day`, danh sách thẻ hiện ra, thẻ gập lại.
3. Bấm mũi tên trên một thẻ — mở ra, thấy sparkline và sáu ô KPI.
4. Bấm `Ghi chú` — hộp mở, gõ chữ, bấm `Lưu`. Hộp đóng, nút đổi thành `Sửa ghi chú`, tầng ghi chú hiện chữ vừa gõ.
5. Mở lại, xoá sạch chữ, `Lưu` — ghi chú biến mất, nút về `Ghi chú`.
6. Bấm `Tuần` — thẻ gom theo tuần, nhãn hiện khoảng "21/09 – 27/09".
7. Đặt một bộ lọc ở `FilterBar` — số thẻ thu hẹp theo.
8. Copy URL, mở tab mới — đúng tab và đúng bộ lọc.
9. Bấm nút Back — về đúng một bước.
10. Đổi sang dark mode — dải màu mép trái và chữ vẫn đọc được.
11. Thu hẹp cửa sổ xuống bề ngang điện thoại — thẻ không tràn ngang.
12. Dùng Tab và mũi tên trên nhóm ba tab — cả nhóm chiếm một nấc Tab, mũi tên đổi tab.

- [x] **Step 5: Ghi quy ước mới vào CLAUDE.md nếu cần**

Nếu quá trình làm phát sinh một quy ước người sau phải biết mà chưa ghi ở đâu (ví dụ: khoá kỳ luôn sinh từ `metrics.DateParts`), thêm một mục ngắn vào `CLAUDE.md`. Nếu không có gì mới, bỏ qua bước này và nói rõ là đã bỏ qua.

- [x] **Step 6: Commit cuối**

```bash
git add -A
git commit -m "test(be,fe): kiểm tra đầu-cuối tab Ngày/Tuần

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Ghi chú cho người triển khai

**Những chỗ kế hoạch này CỐ Ý để bạn xác nhận trước khi viết.** Chúng là tên thật trong repo mà kế hoạch không thể bảo đảm chính xác từ xa; kiểm rồi dùng tên thật, đừng sửa repo cho khớp kế hoạch:

1. ~~`statsDTO`~~ — đã xác nhận ở `backend/internal/httpapi/trade_dto.go:164`; json tag dùng trong `PeriodKpi` (Task 7) khớp đúng.
2. ~~`seedAccount`~~ — đã xác nhận: `seedAccountID(t, db, email, code)` ở `cashflow_test.go:17`.
3. Helper dựng `TradeService` với store RAM trong test của `service` (Task 5).
4. Helper dựng router test trong `httpapi` (Task 6).
5. Chữ ký `writeParams` trong `filters.ts` (Task 7, Task 10).
6. Props thật của `RichTextEditor`, `TemplateMenu`, `MoneyText` (Task 8, Task 9).
7. Cách đổi chuỗi decimal sang number cho Recharts mà `styleguard` cho phép (Task 9, Task 10).
8. ~~`apperr.NotFound`~~ — đã xác nhận: `apperr.NotFound(msg string) *Error` tồn tại đúng tên.

**Thứ tự task là thứ tự phụ thuộc.** Task 1→2 độc lập nhau sau khi Task 1 xong; Task 3→4→5→6 nối tiếp; Task 7→8→9→10 nối tiếp và cần Task 6 xong trước để có API thật mà gọi.
