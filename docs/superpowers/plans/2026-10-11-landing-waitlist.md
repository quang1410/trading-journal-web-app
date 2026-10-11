# Landing page và danh sách chờ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing page công khai tại `/` để thu email trader vào danh sách chờ, kèm 3 câu hỏi
ngắn, và đo tỷ lệ chuyển đổi.

**Architecture:** Backend thêm bảng `waitlist_signups`, hai endpoint công khai
(`POST /api/waitlist`, `PUT /api/waitlist/answers`) đi đủ bốn tầng domain → service →
repository → httpapi, và mở rộng `/api/meta/enums` với điểm chấm và ngưỡng phân loại sinh từ
package `scoring`. Frontend thêm `features/landing/` là một chunk lazy riêng, render ở `/`
cho khách chưa đăng nhập. Mọi nhãn enum tiếng Việt lấy từ `/meta/enums`, không chép vào FE.

**Tech Stack:** Go 1.23, chi, GORM, PostgreSQL 16, testcontainers · Vite, React 19, TypeScript,
TanStack Query v5, Tailwind v4, Vitest + MSW, Playwright · `@fontsource/ibm-plex-sans`,
`@vercel/analytics`.

**Spec:** `docs/superpowers/specs/2026-10-11-landing-waitlist-design.md` ·
Mockup: `docs/design/landing-mockup.html`

## Global Constraints

- Tiền là `decimal.Decimal` / chuỗi. Ngoại lệ duy nhất: số minh hoạ cố định trong
  `features/landing/` (không đến từ backend) — xem spec §2.3. Không dùng `Number(`,
  `parseFloat(`, `parseInt(`, `toPlot(` trong `src/` (styleguard chặn).
- **Không chép chuỗi enum tiếng Việt vào `src/`** ngoài thư mục `src/test/` và file `*.test.*`.
  Lấy từ `useMetaEnums()`, hiển thị qua `enumLabel(field, value, locale, values)`.
- Không hex trong `src/` (styleguard). Chỉ dùng biến ngữ nghĩa; `docs/design/theme.css` và
  `src/styles/theme.css` **không sửa**.
- `<button>` viết tay phải có `cursor-pointer` (styleguard).
- Code tiếng Anh (định danh, key JSON, cột DB, route, log, **tên test và chuỗi `t.Run`**),
  comment và tài liệu tiếng Việt. `msg` lỗi nghiệp vụ trả client là tiếng Việt.
- Mọi chuỗi hiển thị nằm ở `frontend/src/i18n/strings.ts`, một dòng `{ vi, en }` mỗi khoá.
  Nội suy **một ngoặc** `{email}`; test chạm chuỗi có tham số phải assert chuỗi đã nội suy.
- `scoring` vẫn là package thuần: không import GORM, `net/http`, `database/sql`, `context`.
- Node ≥ 20 cho frontend: `export PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH` trước mọi
  lệnh `npx`/`npm` (node mặc định của máy là v16, làm `tsc`/`vitest` crash).
- Lệnh test: backend thuần `make test-pure`; backend đủ (cần Docker) `make test`;
  frontend `cd frontend && npx tsc --noEmit && npx vitest run <file>`; toàn bộ FE
  `make test-fe`.
- Mỗi task kết thúc bằng commit; message kết thúc bằng dòng
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Email viết hoa / có khoảng trắng đăng ký hai lần** (`" Toi@Gmail.com "` rồi
   `"toi@gmail.com"`) phải là MỘT dòng — Task 2 (`NormalizeEmail`) và Task 4 (service test
   `TestWaitlistJoinTreatsCaseAndSpacesAsSameEmail`).
2. **Bấm "Vào danh sách chờ" hai lần nhanh** không được gửi hai request song song tạo lỗi —
   nút `disabled` khi `isPending`; Task 6 test `disables the submit button while sending`.
   Phía DB, hai `INSERT` song song cùng email chỉ ra một dòng — Task 3
   `TestWaitlistInsertConcurrentSameEmailKeepsOneRow`.
3. **Người dùng đang ở bản tiếng Anh** phải thấy nhãn chấm điểm tiếng Anh ("Too early"),
   không phải chuỗi enum tiếng Việt — Task 7 test `shows English labels in the en locale`.
4. **`/meta/enums` lỗi hoặc chậm** (API cold start): landing vẫn hiện hero, form và biểu đồ;
   phiếu chấm điểm ẩn; chú thích biểu đồ vẫn có số tiền — Task 7
   `hides the ticket when meta fails`, Task 8 `still shows amounts when meta fails`.
5. **Người đã đăng nhập mở `/`** được đưa sang `/dashboard`; **khách lạ** thấy landing
   NGAY, không chờ `/auth/refresh` — Task 6 router tests.

---

## File Structure

**Backend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `backend/migrations/0007_waitlist.up.sql` / `.down.sql` | bảng `waitlist_signups` + unique index |
| `backend/internal/domain/waitlist_rules.go` | `NormalizeEmail`, `NormalizeSource`, `NormalizeLocale`, `ParseAnswers`, danh sách mã |
| `backend/internal/domain/waitlist_rules_test.go` | bảng test cho các hàm trên |
| `backend/internal/repository/waitlist.go` | `WaitlistRepo.Insert`, `.SaveAnswers` |
| `backend/internal/repository/waitlist_test.go` | race cùng email, CHECK của DB |
| `backend/internal/service/waitlist.go` | `WaitlistService.Join`, `.SaveAnswers` |
| `backend/internal/service/waitlist_test.go` | hành vi service trên memstore |
| `backend/internal/httpapi/waitlist_handler.go` | handler JSON |
| `backend/internal/httpapi/waitlist_handler_test.go` | mã trạng thái, body giống nhau, 429 |
| `backend/internal/httpapi/ratelimit.go` / `ratelimit_test.go` | middleware `RateLimit` + test đồng hồ giả |

**Backend — sửa**

| File | Sửa gì |
|---|---|
| `backend/internal/scoring/scoring.go` (+ test) | `ClassBand`, `ClassBands`; `Classify` đọc bảng |
| `backend/internal/httpapi/meta_handler.go` (+ test) | thêm `score_points`, `class_bands` |
| `backend/internal/domain/models.go` | struct `WaitlistSignup` |
| `backend/internal/service/store.go` | interface `WaitlistStore` + assertion |
| `backend/internal/service/memstore_test.go` | `memWaitlistStore` |
| `backend/internal/service/store_contract_test.go` | `waitlistStoreContract` hai lượt |
| `backend/internal/apperr/apperr.go` (+ test) | `TooManyRequests` (429/1429) |
| `backend/internal/httpapi/router.go` | `Deps.Waitlist`, nhánh `/api/waitlist` |
| `backend/cmd/api/main.go` | dựng `WaitlistService` |

**Frontend — tạo mới** (`frontend/src/features/landing/`)

| File | Trách nhiệm |
|---|---|
| `LandingPage.tsx` | bố cục, state đăng ký dùng chung, import font + CSS, `<Analytics/>` |
| `LandingNav.tsx` | thanh trên |
| `Hero.tsx` | tiêu đề, đoạn dẫn, form, khung biểu đồ |
| `landing.css` | keyframes của hiệu ứng vẽ đường duy nhất |
| `waitlist.ts` | mã câu trả lời, `looksLikeEmail`, `readSource` |
| `api.ts` | `useJoinWaitlist`, `useSaveWaitlistAnswers` |
| `ChoiceChip.tsx` | chip radio/checkbox dùng chung cho form và phiếu |
| `WaitlistForm.tsx` | bước email + bước câu hỏi |
| `ticket.ts` | hàm thuần: lựa chọn mặc định, tổng điểm, phân loại |
| `ScoreTicket.tsx` | phiếu chấm điểm |
| `ScoringSection.tsx` | khối "Bốn câu hỏi sau mỗi lệnh" |
| `gapSample.ts` | 30 lệnh minh hoạ + hàm thuần |
| `format.ts` | định dạng số minh hoạ theo locale |
| `GapChart.tsx` | biểu đồ lý thuyết và thực tế |
| `FeatureShowcase.tsx` | khối tính năng |
| `previews/DashboardPreview.tsx`, `ChallengePreview.tsx`, `PeriodPreview.tsx`, `NotePreview.tsx`, `ImportPreview.tsx` | hình minh hoạ |
| `Faq.tsx` | hỏi đáp |
| test cạnh từng file: `waitlist.test.ts`, `WaitlistForm.test.tsx`, `ticket.test.ts`, `ScoreTicket.test.tsx`, `gapSample.test.ts`, `GapChart.test.tsx`, `FeatureShowcase.test.tsx`, `Faq.test.tsx`, `LandingPage.test.tsx` |

**Frontend — sửa**

| File | Sửa gì |
|---|---|
| `frontend/package.json` | `@fontsource/ibm-plex-sans`, `@vercel/analytics` |
| `frontend/src/styles/bridge.css` | `--loss-text`, `--cta`, `--cta-foreground`, `--font-display` + utility |
| `frontend/src/styles/landingTokens.test.ts` | ghim các token trên |
| `frontend/src/features/auth/RequireAuth.tsx` | `SkipIfAuthed` |
| `frontend/src/app/router.tsx` (+ `router.test.tsx`) | route `/` |
| `frontend/src/features/meta/hooks.ts` | kiểu `score_points`, `class_bands` |
| `frontend/src/test/harness.tsx` | `makeEnums` có trường mới; `makeFullEnums()` |
| `frontend/src/i18n/strings.ts` | khoá `landing.*`, `errors.tooManyRequests` |
| `frontend/src/i18n/errors.ts` | map 1429 |
| `frontend/index.html` | meta description + OG |
| `frontend/public/og.png` | ảnh chia sẻ 1200×630 |
| `frontend/e2e/auth.spec.ts` | bước 1 không còn vào `/` |
| `frontend/e2e/landing.spec.ts` | hành trình đăng ký trên stack thật |
| `docs/superpowers/specs/2026-10-11-landing-waitlist-design.md` | §3: `SkipIfAuthed` thay `OnlyAnon` |

---

### Task 1: Điểm chấm và ngưỡng phân loại trong `/meta/enums`

**Files:**
- Modify: `backend/internal/scoring/scoring.go` (hàm `Classify`, cuối file)
- Modify: `backend/internal/scoring/scoring_test.go`
- Modify: `backend/internal/httpapi/meta_handler.go`
- Modify: `backend/internal/httpapi/meta_handler_test.go`

**Interfaces:**
- Produces: `scoring.ClassBand{Min int; Class string}`, `scoring.ClassBands []ClassBand`
  (Min giảm dần). JSON của `/api/meta/enums` thêm:
  `score_points: {entry_qualities|in_trade_qualities|exit_qualities|psychologies: {<nhãn>: int}}`
  và `class_bands: [{min: int, class: string}]` sắp `min` giảm dần.

- [ ] **Step 1: Viết test hỏng cho `ClassBands`**

Thêm vào cuối `backend/internal/scoring/scoring_test.go`:

```go
// Ngưỡng §2.6 của trading-journal-plan.md. Chép số tay ở đây chứ không đọc
// lại ClassBands, để ai sửa bảng cũng phải sửa cả test.
func TestClassBandsMatchSpec(t *testing.T) {
	require.Equal(t, []ClassBand{
		{Min: 80, Class: domain.ClassPlanned},
		{Min: 55, Class: domain.ClassNeedsWork},
		{Min: 30, Class: domain.ClassImpulsive},
		{Min: 0, Class: domain.ClassRevenge},
	}, ClassBands)
}
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd backend && go test ./internal/scoring/ -run TestClassBandsMatchSpec -count=1`
Expected: FAIL — `undefined: ClassBand`

- [ ] **Step 3: Cài đặt `ClassBands` và cho `Classify` đọc bảng**

Thay hàm `Classify` trong `backend/internal/scoring/scoring.go` bằng:

```go
// ClassBand là một bậc phân loại: tổng điểm >= Min thì thuộc Class.
type ClassBand struct {
	Min   int
	Class string
}

// ClassBands là các bậc của §2.6, sắp Min GIẢM DẦN. Classify duyệt từ trên
// xuống và lấy bậc đầu tiên khớp. /meta/enums cấp nguyên bảng này cho
// landing, nên ngưỡng chỉ nằm ở MỘT chỗ.
var ClassBands = []ClassBand{
	{Min: 80, Class: domain.ClassPlanned},
	{Min: 55, Class: domain.ClassNeedsWork},
	{Min: 30, Class: domain.ClassImpulsive},
	{Min: 0, Class: domain.ClassRevenge},
}

// Classify quy tổng điểm thành loại lệnh (§2.6). Ranh giới đóng dưới:
// đúng 80 là "Đúng kế hoạch", đúng 55 là "Cần cải thiện", đúng 30 là "Bốc đồng / FOMO".
func Classify(total *int) string {
	if total == nil {
		return domain.ClassNotEvaluated
	}
	for _, b := range ClassBands {
		if *total >= b.Min {
			return b.Class
		}
	}
	// Tổng âm không xảy ra (mỗi trục >= 0); rơi về bậc thấp nhất cho chắc.
	return ClassBands[len(ClassBands)-1].Class
}
```

- [ ] **Step 4: Chạy toàn bộ test `scoring`**

Run: `cd backend && go test ./internal/scoring/ -count=1`
Expected: PASS (cả `TestClassify` cũ lẫn test mới)

- [ ] **Step 5: Viết test hỏng cho `/meta/enums`**

Thêm vào cuối `backend/internal/httpapi/meta_handler_test.go`:

```go
// Landing dựng phiếu chấm điểm từ hai khoá này, nên chúng phải khớp bảng §2
// và §2.6 của trading-journal-plan.md. Số chép tay, không gọi scoring.
func TestMetaEnumsExposesScoring(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var env struct {
		Data struct {
			ScorePoints map[string]map[string]int `json:"score_points"`
			ClassBands  []struct {
				Min   int    `json:"min"`
				Class string `json:"class"`
			} `json:"class_bands"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))

	require.Equal(t, map[string]int{
		domain.EntryPlanned: 25, domain.EntryTooEarly: 10,
		domain.EntryTooLate: 10, domain.EntryImpulse: 0,
	}, env.Data.ScorePoints["entry_qualities"])
	require.Equal(t, map[string]int{
		domain.InTradeFollowed: 25, domain.InTradeMovedTP: 10,
		domain.InTradeMovedSL: 0, domain.InTradeWantExit: 5,
	}, env.Data.ScorePoints["in_trade_qualities"])
	require.Equal(t, map[string]int{
		domain.ExitHitTP: 25, domain.ExitHitSL: 25,
		domain.ExitTechnical: 15, domain.ExitEmotional: 0,
	}, env.Data.ScorePoints["exit_qualities"])
	require.Equal(t, map[string]int{
		domain.PsychNoError: 25, domain.PsychFOMO: 0, domain.PsychFear: 5,
		domain.PsychHope: 5, domain.PsychGreed: 5, domain.PsychRevenge: 0,
		domain.PsychAlwaysRight: 0,
	}, env.Data.ScorePoints["psychologies"])

	require.Len(t, env.Data.ClassBands, 4)
	wantMins := []int{80, 55, 30, 0}
	wantClasses := []string{domain.ClassPlanned, domain.ClassNeedsWork, domain.ClassImpulsive, domain.ClassRevenge}
	for i, b := range env.Data.ClassBands {
		require.Equal(t, wantMins[i], b.Min, "band %d", i)
		require.Equal(t, wantClasses[i], b.Class, "band %d", i)
	}
}
```

- [ ] **Step 6: Chạy, thấy fail**

Run: `cd backend && go test -short ./internal/httpapi/ -run TestMetaEnumsExposesScoring -count=1`
Expected: FAIL — `score_points` rỗng (`map[string]int(nil)`)

- [ ] **Step 7: Cài đặt trong `meta_handler.go`**

Thêm import `"journal/internal/scoring"`. Trong `OK(w, map[string]any{...})` thêm hai khoá
ngay sau `"default_setup"`:

```go
		"score_points": map[string]map[string]int{
			"entry_qualities":    scorePoints(domain.EntryQualities, scoring.Entry),
			"in_trade_qualities": scorePoints(domain.InTradeQualities, scoring.InTrade),
			"exit_qualities":     scorePoints(domain.ExitQualities, scoring.Exit),
			"psychologies":       scorePoints(domain.Psychologies, scoring.Psych),
		},
		"class_bands": classBandDTOs(),
```

Và thêm ở cuối file:

```go
// scorePoints gọi chính hàm chấm điểm cho từng nhãn, nên không có bảng điểm
// thứ hai nào để trôi lệch.
func scorePoints(labels []string, score func(string) int) map[string]int {
	out := make(map[string]int, len(labels))
	for _, l := range labels {
		out[l] = score(l)
	}
	return out
}

type classBandDTO struct {
	Min   int    `json:"min"`
	Class string `json:"class"`
}

func classBandDTOs() []classBandDTO {
	out := make([]classBandDTO, 0, len(scoring.ClassBands))
	for _, b := range scoring.ClassBands {
		out = append(out, classBandDTO{Min: b.Min, Class: b.Class})
	}
	return out
}
```

- [ ] **Step 8: Chạy lại**

Run: `cd backend && go test -short ./internal/httpapi/ -run TestMetaEnums -count=1 && make -C .. lint`
Expected: PASS, lint sạch

- [ ] **Step 9: Commit**

```bash
git add backend/internal/scoring backend/internal/httpapi/meta_handler.go backend/internal/httpapi/meta_handler_test.go
git commit -m "feat(meta): cấp điểm chấm và ngưỡng phân loại qua /meta/enums

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Luật nghiệp vụ của danh sách chờ (domain)

**Files:**
- Create: `backend/internal/domain/waitlist_rules.go`
- Create: `backend/internal/domain/waitlist_rules_test.go`
- Modify: `backend/internal/domain/models.go` (thêm struct cuối file)

**Interfaces:**
- Produces:
  - `domain.WaitlistSignup{ID int64; Email, Locale string; Source, JournalTool, PropStatus *string; Markets string; AnsweredAt *time.Time; CreatedAt time.Time}`
  - `domain.WaitlistAnswers{JournalTool *string; Markets string; PropStatus *string}`
  - `domain.NormalizeEmail(raw string) (string, error)`
  - `domain.NormalizeSource(raw string) *string`
  - `domain.NormalizeLocale(raw string) string`
  - `domain.ParseAnswers(journalTool string, markets []string, propStatus string) (WaitlistAnswers, error)`
  - `domain.JournalTools`, `domain.WaitlistMarkets`, `domain.PropStatuses` (`[]string`)

- [ ] **Step 1: Viết test hỏng**

Tạo `backend/internal/domain/waitlist_rules_test.go`:

```go
package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"plain", "toi@gmail.com", "toi@gmail.com", false},
		{"upper case and spaces", "  Toi@Gmail.COM ", "toi@gmail.com", false},
		{"plus tag", "toi+fx@gmail.com", "toi+fx@gmail.com", false},
		{"subdomain", "a@mail.example.vn", "a@mail.example.vn", false},
		{"empty", "", "", true},
		{"only spaces", "   ", "", true},
		{"missing at", "toigmail.com", "", true},
		{"missing dot in domain", "toi@localhost", "", true},
		{"domain starts with dot", "toi@.gmail.com", "", true},
		{"domain ends with dot", "toi@gmail.", "", true},
		{"display name form", "Toi <toi@gmail.com>", "", true},
		{"quoted local part with space", `"a b"@gmail.com`, "", true},
		{"two at signs", "a@b@gmail.com", "", true},
		{"too long", strings.Repeat("a", 250) + "@x.com", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := domain.NormalizeEmail(tc.input)
			if tc.wantErr {
				require.Error(t, err)
				require.Equal(t, "email không hợp lệ", err.Error())
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestNormalizeSource(t *testing.T) {
	str := func(s string) *string { return &s }
	tests := []struct {
		name  string
		input string
		want  *string
	}{
		{"empty", "", nil},
		{"plain", "fb-group-forex", str("fb-group-forex")},
		{"lower cased", "FB_Group", str("fb_group")},
		{"strips unsafe characters", "fb group<script>", str("fbgroupscript")},
		{"drops non ascii", "nhóm-zalo", str("nhm-zalo")},
		{"only unsafe", "<>!!", nil},
		{"capped at 64", strings.Repeat("a", 80), str(strings.Repeat("a", 64))},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, domain.NormalizeSource(tc.input))
		})
	}
}

func TestNormalizeLocale(t *testing.T) {
	require.Equal(t, "en", domain.NormalizeLocale("en"))
	require.Equal(t, "vi", domain.NormalizeLocale("vi"))
	require.Equal(t, "vi", domain.NormalizeLocale(""))
	require.Equal(t, "vi", domain.NormalizeLocale("fr"))
	require.Equal(t, "vi", domain.NormalizeLocale("EN"))
}

func TestParseAnswers(t *testing.T) {
	t.Run("all empty is valid", func(t *testing.T) {
		got, err := domain.ParseAnswers("", nil, "")
		require.NoError(t, err)
		require.Nil(t, got.JournalTool)
		require.Nil(t, got.PropStatus)
		require.Equal(t, "", got.Markets)
	})
	t.Run("valid codes", func(t *testing.T) {
		got, err := domain.ParseAnswers("spreadsheet", []string{"vn_stocks", "crypto"}, "active")
		require.NoError(t, err)
		require.Equal(t, "spreadsheet", *got.JournalTool)
		require.Equal(t, "active", *got.PropStatus)
		require.Equal(t, "crypto,vn_stocks", got.Markets, "markets are sorted")
	})
	t.Run("duplicate markets collapse", func(t *testing.T) {
		got, err := domain.ParseAnswers("", []string{"crypto", "crypto", "fx_gold"}, "")
		require.NoError(t, err)
		require.Equal(t, "crypto,fx_gold", got.Markets)
	})
	t.Run("unknown journal tool", func(t *testing.T) {
		_, err := domain.ParseAnswers("excel", nil, "")
		require.EqualError(t, err, `công cụ ghi nhật ký không hợp lệ: "excel"`)
	})
	t.Run("unknown market", func(t *testing.T) {
		_, err := domain.ParseAnswers("", []string{"stocks"}, "")
		require.EqualError(t, err, `thị trường không hợp lệ: "stocks"`)
	})
	t.Run("unknown prop status", func(t *testing.T) {
		_, err := domain.ParseAnswers("", nil, "yes")
		require.EqualError(t, err, `trạng thái thi quỹ không hợp lệ: "yes"`)
	})
}
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd backend && go test ./internal/domain/ -run 'TestNormalize|TestParseAnswers' -count=1`
Expected: FAIL — `undefined: domain.NormalizeEmail`

- [ ] **Step 3: Thêm struct vào cuối `backend/internal/domain/models.go`**

```go
// WaitlistSignup là một người để lại email ở landing. Chưa phải user: bảng
// không có khoá ngoại tới users, và việc mở tài khoản cho họ là chuyện sau.
//
// Markets là chuỗi mã nối bằng dấu phẩy, đã sắp xếp ("crypto,vn_stocks"),
// rỗng nghĩa là chưa chọn — đọc thẳng được trong Supabase, khỏi cần kiểu mảng.
type WaitlistSignup struct {
	ID          int64      `gorm:"column:id;primaryKey"`
	Email       string     `gorm:"column:email"`
	Locale      string     `gorm:"column:locale"`
	Source      *string    `gorm:"column:source"`
	JournalTool *string    `gorm:"column:journal_tool"`
	Markets     string     `gorm:"column:markets"`
	PropStatus  *string    `gorm:"column:prop_status"`
	AnsweredAt  *time.Time `gorm:"column:answered_at"`
	CreatedAt   time.Time  `gorm:"column:created_at"`
}
```

(`models.go` đã import `time`.)

- [ ] **Step 4: Tạo `backend/internal/domain/waitlist_rules.go`**

```go
package domain

import (
	"errors"
	"fmt"
	"net/mail"
	"slices"
	"sort"
	"strings"
)

// Mã câu trả lời của form danh sách chờ. ASCII, ổn định — nhãn hiển thị nằm
// ở strings.ts của frontend. CHECK của migration 0007 liệt kê đúng các mã
// này; thêm mã là sửa cả hai chỗ.
var (
	JournalTools    = []string{"spreadsheet", "notion", "other_app", "none"}
	WaitlistMarkets = []string{"fx_gold", "crypto", "vn_stocks", "vn_derivatives"}
	PropStatuses    = []string{"active", "past", "never"}
)

const (
	maxEmailLen  = 254 // RFC 5321
	maxSourceLen = 64
)

var errInvalidEmail = errors.New("email không hợp lệ")

// WaitlistAnswers là ba câu trả lời đã kiểm. nil / "" nghĩa là bỏ qua câu đó.
type WaitlistAnswers struct {
	JournalTool *string
	Markets     string
	PropStatus  *string
}

// NormalizeEmail trim + lowercase rồi kiểm dạng. Giá trị trả về đi thẳng vào
// cột UNIQUE, nên " Toi@Gmail.com" và "toi@gmail.com" là MỘT người.
//
// mail.ParseAddress nhận cả dạng "Tên <a@x.com>" và local part có ngoặc kép;
// cả hai bị từ chối ở đây vì người gõ vào ô email không bao giờ có ý đó.
func NormalizeEmail(raw string) (string, error) {
	e := strings.ToLower(strings.TrimSpace(raw))
	if e == "" || len(e) > maxEmailLen || strings.ContainsAny(e, " \"<>") {
		return "", errInvalidEmail
	}
	addr, err := mail.ParseAddress(e)
	if err != nil || addr.Address != e {
		return "", errInvalidEmail
	}
	host := e[strings.LastIndex(e, "@")+1:]
	if !strings.Contains(host, ".") || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return "", errInvalidEmail
	}
	return e, nil
}

// NormalizeSource giữ nhãn nguồn (?ref= / ?utm_source=) ở dạng an toàn để gom
// nhóm: chữ thường, chỉ a-z 0-9 _ . -, tối đa 64 ký tự. Rỗng sau khi lọc là
// không có nguồn. Không báo lỗi: một link chia sẻ gõ sai không được làm hỏng
// lượt đăng ký.
func NormalizeSource(raw string) *string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(raw)) {
		if b.Len() >= maxSourceLen {
			break
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return nil
	}
	s := b.String()
	return &s
}

// NormalizeLocale chỉ nhận đúng "en"; mọi giá trị khác là "vi", ngôn ngữ mặc
// định của landing.
func NormalizeLocale(raw string) string {
	if raw == "en" {
		return "en"
	}
	return "vi"
}

// ParseAnswers kiểm mã của ba câu hỏi. Thị trường trùng bị gộp, rồi sắp xếp
// để cùng một lựa chọn luôn cho cùng một chuỗi.
func ParseAnswers(journalTool string, markets []string, propStatus string) (WaitlistAnswers, error) {
	var out WaitlistAnswers
	if journalTool != "" {
		if !slices.Contains(JournalTools, journalTool) {
			return WaitlistAnswers{}, fmt.Errorf("công cụ ghi nhật ký không hợp lệ: %q", journalTool)
		}
		out.JournalTool = &journalTool
	}
	seen := map[string]bool{}
	for _, m := range markets {
		if !slices.Contains(WaitlistMarkets, m) {
			return WaitlistAnswers{}, fmt.Errorf("thị trường không hợp lệ: %q", m)
		}
		seen[m] = true
	}
	codes := make([]string, 0, len(seen))
	for m := range seen {
		codes = append(codes, m)
	}
	sort.Strings(codes)
	out.Markets = strings.Join(codes, ",")
	if propStatus != "" {
		if !slices.Contains(PropStatuses, propStatus) {
			return WaitlistAnswers{}, fmt.Errorf("trạng thái thi quỹ không hợp lệ: %q", propStatus)
		}
		out.PropStatus = &propStatus
	}
	return out, nil
}
```

- [ ] **Step 5: Chạy lại**

Run: `cd backend && go test ./internal/domain/ -count=1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/domain
git commit -m "feat(domain): luật chuẩn hoá email, nguồn và câu trả lời của danh sách chờ

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bảng `waitlist_signups`, repository và hợp đồng store

**Files:**
- Create: `backend/migrations/0007_waitlist.up.sql`, `backend/migrations/0007_waitlist.down.sql`
- Create: `backend/internal/repository/waitlist.go`
- Create: `backend/internal/repository/waitlist_test.go`
- Modify: `backend/internal/service/store.go` (interface + assertion)
- Modify: `backend/internal/service/memstore_test.go` (adapter RAM)
- Modify: `backend/internal/service/store_contract_test.go` (contract hai lượt)

**Interfaces:**
- Consumes: `domain.WaitlistSignup`, `domain.WaitlistAnswers` (Task 2)
- Produces:
  - `service.WaitlistStore` interface:
    `Insert(ctx context.Context, s domain.WaitlistSignup) error`,
    `SaveAnswers(ctx context.Context, email string, a domain.WaitlistAnswers) error`
  - `repository.NewWaitlistRepo(db *gorm.DB) *WaitlistRepo`
  - (test) `newMemWaitlistStore() *memWaitlistStore` với `get(email string) (domain.WaitlistSignup, bool)`

- [ ] **Step 1: Viết migration**

`backend/migrations/0007_waitlist.up.sql`:

```sql
CREATE TABLE waitlist_signups (
    id           BIGSERIAL   PRIMARY KEY,
    email        TEXT        NOT NULL,
    locale       TEXT        NOT NULL DEFAULT 'vi',
    source       TEXT        NULL,
    journal_tool TEXT        NULL,
    markets      TEXT        NOT NULL DEFAULT '',
    prop_status  TEXT        NULL,
    answered_at  TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_locale       CHECK (locale IN ('vi', 'en')),
    CONSTRAINT waitlist_email_len    CHECK (char_length(email) <= 254),
    CONSTRAINT waitlist_source_len   CHECK (char_length(source) <= 64),
    CONSTRAINT waitlist_journal_tool CHECK (journal_tool IN ('spreadsheet', 'notion', 'other_app', 'none')),
    CONSTRAINT waitlist_prop_status  CHECK (prop_status IN ('active', 'past', 'never'))
);

-- email được lưu ĐÃ chuẩn hoá (trim + lowercase, domain.NormalizeEmail), nên
-- index thường là đủ, không cần lower(email). Ràng buộc này là thứ thực thi
-- "mỗi email một dòng" và là đích của ON CONFLICT: kiểm trong code thay nó sẽ
-- bị hai request song song đi qua mặt.
CREATE UNIQUE INDEX waitlist_signups_email ON waitlist_signups (email);
```

`backend/migrations/0007_waitlist.down.sql`:

```sql
DROP TABLE waitlist_signups;
```

- [ ] **Step 2: Viết test repository hỏng**

Tạo `backend/internal/repository/waitlist_test.go`:

```go
package repository_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// Hai người bấm cùng lúc (hoặc một người bấm hai lần) với cùng email phải ra
// đúng một dòng và không request nào lỗi. Đây là lý do dùng ON CONFLICT thay
// vì "đọc xem có chưa rồi mới ghi".
func TestWaitlistInsertConcurrentSameEmailKeepsOneRow(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewWaitlistRepo(db)

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.Insert(ctx, domain.WaitlistSignup{Email: "race@example.com", Locale: "vi"})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	var n int64
	require.NoError(t, db.Model(&domain.WaitlistSignup{}).Where("email = ?", "race@example.com").Count(&n).Error)
	require.EqualValues(t, 1, n)
}

// CHECK của DB là lưới cuối: domain.ParseAnswers đã chặn mã lạ, nhưng một
// đường ghi khác trong tương lai không được lách qua được.
func TestWaitlistDatabaseRejectsUnknownJournalTool(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewWaitlistRepo(db)
	require.NoError(t, repo.Insert(ctx, domain.WaitlistSignup{Email: "a@example.com", Locale: "vi"}))

	bad := "excel"
	err := repo.SaveAnswers(ctx, "a@example.com", domain.WaitlistAnswers{JournalTool: &bad})
	require.Error(t, err)
}
```

- [ ] **Step 3: Chạy, thấy fail**

Run: `cd backend && go test ./internal/repository/ -run TestWaitlist -count=1`
Expected: FAIL — `undefined: repository.NewWaitlistRepo`

- [ ] **Step 4: Tạo `backend/internal/repository/waitlist.go`**

```go
package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type WaitlistRepo struct{ db *gorm.DB }

func NewWaitlistRepo(db *gorm.DB) *WaitlistRepo { return &WaitlistRepo{db: db} }

// Insert thêm một email. Email đã có thì KHÔNG làm gì và KHÔNG báo lỗi:
// service trả cùng một phản hồi cho email mới và cũ, nên tầng này không được
// biến "đã có" thành ErrDuplicate.
func (r *WaitlistRepo) Insert(ctx context.Context, s domain.WaitlistSignup) error {
	const q = `INSERT INTO waitlist_signups (email, locale, source)
	           VALUES (?, ?, ?)
	           ON CONFLICT (email) DO NOTHING`
	return translate(r.db.WithContext(ctx).Exec(q, s.Email, s.Locale, s.Source).Error)
}

// SaveAnswers ghi ba câu trả lời đúng MỘT lần: điều kiện answered_at IS NULL
// làm lần gửi thứ hai (hoặc người khác biết email) thành no-op. Email không
// tồn tại cũng là no-op — không trả ErrNotFound, để handler không lộ email
// nào đã đăng ký.
func (r *WaitlistRepo) SaveAnswers(ctx context.Context, email string, a domain.WaitlistAnswers) error {
	const q = `UPDATE waitlist_signups
	           SET journal_tool = ?, markets = ?, prop_status = ?, answered_at = now()
	           WHERE email = ? AND answered_at IS NULL`
	return translate(r.db.WithContext(ctx).Exec(q, a.JournalTool, a.Markets, a.PropStatus, email).Error)
}
```

- [ ] **Step 5: Chạy test repository**

Run: `cd backend && go test ./internal/repository/ -run TestWaitlist -count=1`
Expected: PASS (cần Docker; testdb tự chạy migration 0007)

- [ ] **Step 6: Khai interface trong `backend/internal/service/store.go`**

Thêm sau khối `JournalNoteStore`:

```go
// WaitlistStore là nơi cất danh sách chờ của landing.
//
// Hai hành vi là HỢP ĐỒNG, service dựa vào chúng để không lộ email nào đã
// đăng ký:
//
//  1. Insert với email đã có KHÔNG lỗi và KHÔNG đổi dòng cũ (locale, source
//     của lần đầu được giữ).
//  2. SaveAnswers chỉ ghi khi dòng tồn tại VÀ chưa trả lời; mọi trường hợp
//     khác là no-op không lỗi.
type WaitlistStore interface {
	Insert(ctx context.Context, s domain.WaitlistSignup) error
	SaveAnswers(ctx context.Context, email string, a domain.WaitlistAnswers) error
}
```

Và thêm vào khối `var ( ... )` assertion ở cuối file:

```go
	_ WaitlistStore     = (*repository.WaitlistRepo)(nil)
```

- [ ] **Step 7: Viết adapter RAM**

Thêm vào cuối `backend/internal/service/memstore_test.go`:

```go
// memWaitlistStore giữ danh sách chờ trong RAM, khoá theo email đã chuẩn hoá
// — đúng như unique index của bảng thật.
type memWaitlistStore struct {
	mu     sync.Mutex
	rows   map[string]domain.WaitlistSignup
	nextID int64
}

func newMemWaitlistStore() *memWaitlistStore {
	return &memWaitlistStore{rows: map[string]domain.WaitlistSignup{}, nextID: 1}
}

func (m *memWaitlistStore) Insert(_ context.Context, s domain.WaitlistSignup) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.rows[s.Email]; ok {
		return nil // ON CONFLICT DO NOTHING
	}
	s.ID = m.nextID
	m.nextID++
	s.CreatedAt = time.Now()
	m.rows[s.Email] = s
	return nil
}

func (m *memWaitlistStore) SaveAnswers(_ context.Context, email string, a domain.WaitlistAnswers) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.rows[email]
	if !ok || row.AnsweredAt != nil {
		return nil
	}
	now := time.Now()
	row.JournalTool, row.Markets, row.PropStatus, row.AnsweredAt = a.JournalTool, a.Markets, a.PropStatus, &now
	m.rows[email] = row
	return nil
}

// get chỉ dành cho test: interface cố ý không có hàm đọc vì service không cần.
func (m *memWaitlistStore) get(email string) (domain.WaitlistSignup, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.rows[email]
	return row, ok
}
```

- [ ] **Step 8: Viết contract test**

Thêm vào cuối `backend/internal/service/store_contract_test.go` (thêm import `"errors"` và
`"gorm.io/gorm"` nếu chưa có):

```go
// waitlistStoreContract ghim hai hành vi mà service dựa vào. eachStore trả
// store rỗng kèm một hàm đọc riêng cho test, vì WaitlistStore cố ý không có
// hàm đọc.
func waitlistStoreContract(
	t *testing.T,
	eachStore func(t *testing.T) (service.WaitlistStore, func(email string) (domain.WaitlistSignup, bool)),
) {
	src := "fb-group"

	t.Run("insert stores a new row", func(t *testing.T) {
		st, read := eachStore(t)
		require.NoError(t, st.Insert(newCtx(), domain.WaitlistSignup{Email: "a@example.com", Locale: "en", Source: &src}))
		got, ok := read("a@example.com")
		require.True(t, ok)
		require.Equal(t, "en", got.Locale)
		require.Equal(t, "fb-group", *got.Source)
		require.Nil(t, got.AnsweredAt)
		require.Equal(t, "", got.Markets)
	})

	t.Run("insert with an existing email keeps the first row", func(t *testing.T) {
		st, read := eachStore(t)
		require.NoError(t, st.Insert(newCtx(), domain.WaitlistSignup{Email: "a@example.com", Locale: "vi", Source: &src}))
		require.NoError(t, st.Insert(newCtx(), domain.WaitlistSignup{Email: "a@example.com", Locale: "en"}))
		got, ok := read("a@example.com")
		require.True(t, ok)
		require.Equal(t, "vi", got.Locale)
		require.NotNil(t, got.Source)
		require.Equal(t, "fb-group", *got.Source)
	})

	t.Run("answers are saved once", func(t *testing.T) {
		st, read := eachStore(t)
		require.NoError(t, st.Insert(newCtx(), domain.WaitlistSignup{Email: "a@example.com", Locale: "vi"}))
		tool, prop := "notion", "past"
		require.NoError(t, st.SaveAnswers(newCtx(), "a@example.com",
			domain.WaitlistAnswers{JournalTool: &tool, Markets: "crypto", PropStatus: &prop}))

		other := "none"
		require.NoError(t, st.SaveAnswers(newCtx(), "a@example.com",
			domain.WaitlistAnswers{JournalTool: &other, Markets: "fx_gold"}))

		got, _ := read("a@example.com")
		require.NotNil(t, got.AnsweredAt)
		require.Equal(t, "notion", *got.JournalTool)
		require.Equal(t, "crypto", got.Markets)
		require.Equal(t, "past", *got.PropStatus)
	})

	t.Run("answers for an unknown email are a no-op", func(t *testing.T) {
		st, read := eachStore(t)
		require.NoError(t, st.SaveAnswers(newCtx(), "ghost@example.com", domain.WaitlistAnswers{}))
		_, ok := read("ghost@example.com")
		require.False(t, ok)
	})
}

func TestWaitlistStoreContract_InMemory(t *testing.T) {
	waitlistStoreContract(t, func(t *testing.T) (service.WaitlistStore, func(string) (domain.WaitlistSignup, bool)) {
		st := newMemWaitlistStore()
		return st, st.get
	})
}

func TestWaitlistStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	waitlistStoreContract(t, func(t *testing.T) (service.WaitlistStore, func(string) (domain.WaitlistSignup, bool)) {
		db := testdb.New(t)
		read := func(email string) (domain.WaitlistSignup, bool) {
			var row domain.WaitlistSignup
			err := db.Where("email = ?", email).Take(&row).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.WaitlistSignup{}, false
			}
			require.NoError(t, err)
			return row, true
		}
		return repository.NewWaitlistRepo(db), read
	})
}
```

- [ ] **Step 9: Chạy cả hai lượt**

Run: `cd backend && go test ./internal/service/ -run TestWaitlistStoreContract -count=1 -v 2>&1 | grep -E '^(=== RUN|--- (PASS|FAIL)|ok|FAIL)'`
Expected: `TestWaitlistStoreContract_InMemory` và `TestWaitlistStoreContract_Postgres` đều PASS
với 4 subtest mỗi lượt.

- [ ] **Step 10: Commit**

```bash
git add backend/migrations/0007_waitlist.*.sql backend/internal/repository/waitlist*.go backend/internal/service/store.go backend/internal/service/memstore_test.go backend/internal/service/store_contract_test.go
git commit -m "feat(waitlist): bảng waitlist_signups, repository và contract test

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `WaitlistService`

**Files:**
- Create: `backend/internal/service/waitlist.go`
- Create: `backend/internal/service/waitlist_test.go`

**Interfaces:**
- Consumes: `service.WaitlistStore` (Task 3), `domain.Normalize*`, `domain.ParseAnswers` (Task 2)
- Produces:
  - `service.NewWaitlistService(store WaitlistStore) *WaitlistService`
  - `service.WaitlistJoin{Email, Locale, Source, Honeypot string}`
  - `(*WaitlistService).Join(ctx, WaitlistJoin) error`
  - `service.WaitlistAnswersInput{Email, JournalTool string; Markets []string; PropStatus string}`
  - `(*WaitlistService).SaveAnswers(ctx, WaitlistAnswersInput) error`
  - Lỗi đầu vào là `*apperr.Error` 400/1400; lỗi store được bọc `fmt.Errorf("...: %w")`.

- [ ] **Step 1: Viết test hỏng**

Tạo `backend/internal/service/waitlist_test.go`:

```go
package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/service"
)

func TestWaitlistJoinStoresNormalizedRow(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: " Toi@Gmail.com ", Locale: "en", Source: "FB-Group"})
	require.NoError(t, err)

	got, ok := st.get("toi@gmail.com")
	require.True(t, ok)
	require.Equal(t, "en", got.Locale)
	require.Equal(t, "fb-group", *got.Source)
}

func TestWaitlistJoinTreatsCaseAndSpacesAsSameEmail(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: " Toi@Gmail.com ", Locale: "vi"}))
	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@gmail.com", Locale: "en"}))

	require.Len(t, st.rows, 1)
	got, _ := st.get("toi@gmail.com")
	require.Equal(t, "vi", got.Locale, "the first signup wins")
}

// Bot điền ô ẩn: trả thành công như thường để nó không biết mình bị lọc,
// nhưng không ghi gì.
func TestWaitlistJoinHoneypotStoresNothing(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: "bot@example.com", Honeypot: "http://spam.example"})
	require.NoError(t, err)
	require.Empty(t, st.rows)
}

// Honeypot kiểm TRƯỚC email: bot gửi email rác vẫn nhận 200, không nhận một
// 400 tiết lộ rằng có luật kiểm email.
func TestWaitlistJoinHoneypotWinsOverInvalidEmail(t *testing.T) {
	svc := service.NewWaitlistService(newMemWaitlistStore())
	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "not-an-email", Honeypot: "x"}))
}

func TestWaitlistJoinRejectsInvalidEmail(t *testing.T) {
	svc := service.NewWaitlistService(newMemWaitlistStore())

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@localhost"})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
	require.Equal(t, 1400, e.Code)
	require.Equal(t, "email không hợp lệ", e.Msg)
}

func TestWaitlistSaveAnswers(t *testing.T) {
	t.Run("saves for a known email", func(t *testing.T) {
		st := newMemWaitlistStore()
		svc := service.NewWaitlistService(st)
		require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@gmail.com"}))

		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{
			Email: "TOI@gmail.com", JournalTool: "spreadsheet", Markets: []string{"vn_stocks", "crypto"}, PropStatus: "never",
		})
		require.NoError(t, err)

		got, _ := st.get("toi@gmail.com")
		require.Equal(t, "spreadsheet", *got.JournalTool)
		require.Equal(t, "crypto,vn_stocks", got.Markets)
		require.Equal(t, "never", *got.PropStatus)
		require.NotNil(t, got.AnsweredAt)
	})

	t.Run("unknown email is not an error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		require.NoError(t, svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{Email: "ghost@example.com"}))
	})

	t.Run("unknown code is a validation error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{Email: "a@example.com", JournalTool: "excel"})
		e := apperr.As(err)
		require.NotNil(t, e)
		require.Equal(t, 1400, e.Code)
	})

	t.Run("invalid email is a validation error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{Email: "nope"})
		require.Equal(t, 1400, apperr.As(err).Code)
	})
}
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd backend && go test -short ./internal/service/ -run TestWaitlist -count=1`
Expected: FAIL — `undefined: service.NewWaitlistService`

- [ ] **Step 3: Tạo `backend/internal/service/waitlist.go`**

```go
package service

import (
	"context"
	"fmt"
	"strings"

	"journal/internal/apperr"
	"journal/internal/domain"
)

type WaitlistService struct{ store WaitlistStore }

func NewWaitlistService(store WaitlistStore) *WaitlistService {
	return &WaitlistService{store: store}
}

// WaitlistJoin là input của Join. Honeypot là ô ẩn trên form: người thật
// không thấy nên để trống, bot điền mọi ô nên điền vào.
type WaitlistJoin struct {
	Email    string
	Locale   string
	Source   string
	Honeypot string
}

// Join thêm email vào danh sách chờ.
//
// Email mới, email đã có và request của bot đều trả nil: người gọi không phân
// biệt được ba trường hợp, nên không ai dò được email nào đã đăng ký.
func (s *WaitlistService) Join(ctx context.Context, in WaitlistJoin) error {
	if strings.TrimSpace(in.Honeypot) != "" {
		return nil
	}
	email, err := domain.NormalizeEmail(in.Email)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	row := domain.WaitlistSignup{
		Email:  email,
		Locale: domain.NormalizeLocale(in.Locale),
		Source: domain.NormalizeSource(in.Source),
	}
	if err := s.store.Insert(ctx, row); err != nil {
		return fmt.Errorf("insert waitlist signup: %w", err)
	}
	return nil
}

// WaitlistAnswersInput là ba câu trả lời không bắt buộc, gửi sau khi Join.
type WaitlistAnswersInput struct {
	Email       string
	JournalTool string
	Markets     []string
	PropStatus  string
}

// SaveAnswers ghi câu trả lời một lần cho email đã đăng ký. Email lạ hoặc đã
// trả lời rồi vẫn trả nil, cùng lý do với Join.
func (s *WaitlistService) SaveAnswers(ctx context.Context, in WaitlistAnswersInput) error {
	email, err := domain.NormalizeEmail(in.Email)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	answers, err := domain.ParseAnswers(in.JournalTool, in.Markets, in.PropStatus)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	if err := s.store.SaveAnswers(ctx, email, answers); err != nil {
		return fmt.Errorf("save waitlist answers: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Chạy lại**

Run: `cd backend && go test -short ./internal/service/ -run TestWaitlist -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/service/waitlist.go backend/internal/service/waitlist_test.go
git commit -m "feat(waitlist): WaitlistService.Join và SaveAnswers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Endpoint công khai, giới hạn tần suất, nối vào main

**Files:**
- Modify: `backend/internal/apperr/apperr.go`, `backend/internal/apperr/apperr_test.go`
- Create: `backend/internal/httpapi/ratelimit.go`, `backend/internal/httpapi/ratelimit_test.go`
- Create: `backend/internal/httpapi/waitlist_handler.go`, `backend/internal/httpapi/waitlist_handler_test.go`
- Modify: `backend/internal/httpapi/router.go`
- Modify: `backend/cmd/api/main.go`

**Interfaces:**
- Consumes: `service.WaitlistService` (Task 4)
- Produces:
  - `apperr.TooManyRequests(msg string) *Error` (429/1429)
  - `httpapi.RateLimit(limit int, window time.Duration, now func() time.Time) func(http.Handler) http.Handler`
  - `httpapi.Deps.Waitlist *service.WaitlistService`
  - HTTP: `POST /api/waitlist` body `{email, locale, source, website}` → `{"joined": true}`;
    `PUT /api/waitlist/answers` body `{email, journal_tool, markets, prop_status}` → `{"saved": true}`.
    Khoá lạ trong body → 400 (DecodeJSON có `DisallowUnknownFields`).

- [ ] **Step 1: Test hỏng cho `TooManyRequests`**

Trong `backend/internal/apperr/apperr_test.go`, thêm một dòng vào bảng `cases` của
`TestConstructorsCarryStatusAndCode`:

```go
		{"too many requests", apperr.TooManyRequests("chậm lại"), 429, 1429},
```

Run: `cd backend && go test ./internal/apperr/ -count=1`
Expected: FAIL — `undefined: apperr.TooManyRequests`

- [ ] **Step 2: Cài đặt**

Thêm vào `backend/internal/apperr/apperr.go` sau `Conflict`:

```go
func TooManyRequests(msg string) *Error { return &Error{Status: 429, Code: 1429, Msg: msg} }
```

Run: `cd backend && go test ./internal/apperr/ -count=1` → PASS

- [ ] **Step 3: Test hỏng cho `RateLimit`**

Tạo `backend/internal/httpapi/ratelimit_test.go`:

```go
package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/httpapi"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func hit(h http.Handler, ip string) int {
	req := httptest.NewRequest(http.MethodPost, "/api/waitlist", nil)
	req.RemoteAddr = ip
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestRateLimitBlocksAfterLimitAndRecovers(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := httpapi.RateLimit(5, time.Minute, clock.now)(ok)

	for i := 0; i < 5; i++ {
		require.Equal(t, http.StatusOK, hit(h, "203.0.113.7"), "request %d", i+1)
	}
	require.Equal(t, http.StatusTooManyRequests, hit(h, "203.0.113.7"))

	// IP khác có bộ đếm riêng.
	require.Equal(t, http.StatusOK, hit(h, "198.51.100.2"))

	// Cửa sổ trượt: sau đúng một phút, lượt cũ nhất rơi khỏi cửa sổ.
	clock.t = clock.t.Add(time.Minute + time.Second)
	require.Equal(t, http.StatusOK, hit(h, "203.0.113.7"))
}

func TestRateLimitIgnoresPort(t *testing.T) {
	clock := &fakeClock{t: time.Now()}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := httpapi.RateLimit(1, time.Minute, clock.now)(ok)

	require.Equal(t, http.StatusOK, hit(h, "203.0.113.7:5000"))
	require.Equal(t, http.StatusTooManyRequests, hit(h, "203.0.113.7:6000"),
		"same IP on another port is the same visitor")
}
```

Run: `cd backend && go test -short ./internal/httpapi/ -run TestRateLimit -count=1`
Expected: FAIL — `undefined: httpapi.RateLimit`

- [ ] **Step 4: Tạo `backend/internal/httpapi/ratelimit.go`**

```go
package httpapi

import (
	"net"
	"net/http"
	"sync"
	"time"

	"journal/internal/apperr"
)

// maxTrackedIPs là ngưỡng dọn map: vượt ngưỡng thì quét bỏ IP không còn lượt
// nào trong cửa sổ, để bộ nhớ không phình mãi.
const maxTrackedIPs = 10_000

// RateLimit cho mỗi IP tối đa `limit` request trong một cửa sổ trượt dài
// `window`. Vượt ngưỡng thì trả 429.
//
// Bộ đếm nằm trong bộ nhớ của MỘT process. Trên Vercel mỗi instance của
// function có bộ đếm riêng, nên đây là hàng rào tốt-nhất-có-thể chứ không
// phải bảo đảm (spec landing §4.4). Phải mount SAU middleware.RealIP để
// RemoteAddr là IP thật của khách.
func RateLimit(limit int, window time.Duration, now func() time.Time) func(http.Handler) http.Handler {
	var mu sync.Mutex
	hits := map[string][]time.Time{}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			t := now()
			cutoff := t.Add(-window)

			mu.Lock()
			kept := make([]time.Time, 0, limit)
			for _, h := range hits[ip] {
				if h.After(cutoff) {
					kept = append(kept, h)
				}
			}
			allowed := len(kept) < limit
			if allowed {
				kept = append(kept, t)
			}
			hits[ip] = kept
			if len(hits) > maxTrackedIPs {
				for k, v := range hits {
					if len(v) == 0 || !v[len(v)-1].After(cutoff) {
						delete(hits, k)
					}
				}
			}
			mu.Unlock()

			if !allowed {
				FailErr(w, r, apperr.TooManyRequests("gửi quá nhiều lần, thử lại sau một phút"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP bỏ cổng khỏi RemoteAddr. Sau middleware.RealIP, RemoteAddr thường
// đã là IP trần; khi chạy không qua proxy thì nó vẫn mang dạng "ip:port".
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
```

Run: `cd backend && go test -short ./internal/httpapi/ -run TestRateLimit -count=1` → PASS

- [ ] **Step 5: Test hỏng cho handler**

Tạo `backend/internal/httpapi/waitlist_handler_test.go`:

```go
package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/domain"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

const waitlistPath = "/api/waitlist"

func waitlistServer(t *testing.T) (*httptest.Server, *gorm.DB) {
	t.Helper()
	db := testdb.New(t)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Waitlist: service.NewWaitlistService(repository.NewWaitlistRepo(db)),
	}))
	t.Cleanup(srv.Close)
	return srv, db
}

func countSignups(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Model(&domain.WaitlistSignup{}).Count(&n).Error)
	return n
}

func TestWaitlistJoinNeedsNoAuth(t *testing.T) {
	srv, db := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@gmail.com","locale":"vi","source":"fb-group","website":""}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"joined":true}`, string(env.Data))
	require.EqualValues(t, 1, countSignups(t, db))
}

// Email mới, email đã có và bot nhận phản hồi GIỐNG HỆT nhau: không ai dò
// được email nào đã nằm trong danh sách.
func TestWaitlistJoinResponsesAreIdentical(t *testing.T) {
	srv, db := waitlistServer(t)
	bodies := []string{
		`{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`,
		`{"email":"TOI@gmail.com","locale":"en","source":"","website":""}`,
		`{"email":"bot@example.com","locale":"vi","source":"","website":"http://spam"}`,
	}
	var first string
	for i, b := range bodies {
		resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "", b)
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d", i)
		if i == 0 {
			first = string(env.Data)
			continue
		}
		require.Equal(t, first, string(env.Data), "request %d", i)
	}
	require.EqualValues(t, 1, countSignups(t, db))
}

func TestWaitlistJoinInvalidEmail(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@localhost","locale":"vi","source":"","website":""}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.Equal(t, "email không hợp lệ", env.Msg)
}

func TestWaitlistJoinRejectsUnknownField(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "", `{"email":"toi@gmail.com","admin":true}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestWaitlistAnswersSavedOnce(t *testing.T) {
	srv, db := waitlistServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`)

	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"spreadsheet","markets":["crypto"],"prop_status":"active"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"saved":true}`, string(env.Data))

	resp, _ = do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"none","markets":[],"prop_status":"never"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var row domain.WaitlistSignup
	require.NoError(t, db.Where("email = ?", "toi@gmail.com").Take(&row).Error)
	require.Equal(t, "spreadsheet", *row.JournalTool)
	require.Equal(t, "crypto", row.Markets)
}

func TestWaitlistAnswersUnknownCode(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"excel","markets":[],"prop_status":""}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, `công cụ ghi nhật ký không hợp lệ: "excel"`, env.Msg)
}

// Sáu request trong một phút từ cùng một IP: lần thứ sáu bị chặn, cả khi nó
// là PUT /answers chứ không phải POST — hai endpoint dùng chung một bộ đếm.
func TestWaitlistRateLimited(t *testing.T) {
	srv, _ := waitlistServer(t)
	body := `{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`
	for i := 0; i < 5; i++ {
		resp, _ := do(t, http.MethodPost, srv.URL+waitlistPath, "", body)
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d", i+1)
	}
	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"","markets":[],"prop_status":""}`)
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	require.Equal(t, 1429, env.Code)
	require.Equal(t, "gửi quá nhiều lần, thử lại sau một phút", env.Msg)
}
```

Run: `cd backend && go test ./internal/httpapi/ -run TestWaitlist -count=1`
Expected: FAIL — `unknown field Waitlist in struct literal`

- [ ] **Step 6: Tạo `backend/internal/httpapi/waitlist_handler.go`**

```go
package httpapi

import (
	"net/http"

	"journal/internal/service"
)

type WaitlistHandler struct{ svc *service.WaitlistService }

// website là ô honeypot của form: người thật để trống.
type waitlistJoinRequest struct {
	Email   string `json:"email"`
	Locale  string `json:"locale"`
	Source  string `json:"source"`
	Website string `json:"website"`
}

type waitlistAnswersRequest struct {
	Email       string   `json:"email"`
	JournalTool string   `json:"journal_tool"`
	Markets     []string `json:"markets"`
	PropStatus  string   `json:"prop_status"`
}

func (h *WaitlistHandler) Join(w http.ResponseWriter, r *http.Request) {
	var req waitlistJoinRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	err := h.svc.Join(r.Context(), service.WaitlistJoin{
		Email: req.Email, Locale: req.Locale, Source: req.Source, Honeypot: req.Website,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"joined": true})
}

func (h *WaitlistHandler) SaveAnswers(w http.ResponseWriter, r *http.Request) {
	var req waitlistAnswersRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	err := h.svc.SaveAnswers(r.Context(), service.WaitlistAnswersInput{
		Email: req.Email, JournalTool: req.JournalTool, Markets: req.Markets, PropStatus: req.PropStatus,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"saved": true})
}
```

- [ ] **Step 7: Nối router**

Trong `backend/internal/httpapi/router.go`:

1. Thêm `"time"` vào import.
2. Thêm trường vào `Deps` sau `JournalNote`:

```go
	Waitlist     *service.WaitlistService
```

3. Ngay sau dòng `api.Get("/meta/enums", MetaEnums)` thêm:

```go
		// Danh sách chờ của landing: công khai như /meta/enums, nằm ngoài mọi
		// guard đăng nhập. Hai endpoint dùng chung MỘT bộ đếm tần suất, vì
		// RateLimit được dựng một lần cho cả nhánh.
		if d.Waitlist != nil {
			wh := &WaitlistHandler{svc: d.Waitlist}
			api.Route("/waitlist", func(wl chi.Router) {
				wl.Use(RateLimit(5, time.Minute, time.Now))
				wl.Post("/", wh.Join)
				wl.Put("/answers", wh.SaveAnswers)
			})
		}
```

4. Trong `backend/cmd/api/main.go`, thêm vào `deps` sau `JournalNote`:

```go
		Waitlist:     service.NewWaitlistService(repository.NewWaitlistRepo(db)),
```

- [ ] **Step 8: Chạy toàn bộ backend**

Run: `make test && make lint`
Expected: PASS toàn bộ, lint sạch

- [ ] **Step 9: Commit**

```bash
git add backend/internal/apperr backend/internal/httpapi backend/cmd/api/main.go
git commit -m "feat(waitlist): POST /api/waitlist, PUT /api/waitlist/answers và giới hạn tần suất

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Khung landing tại `/`, token, font, form danh sách chờ

**Files:**
- Modify: `frontend/package.json` (qua `npm install`)
- Modify: `frontend/src/styles/bridge.css`
- Create: `frontend/src/styles/landingTokens.test.ts`
- Modify: `frontend/src/features/auth/RequireAuth.tsx`
- Modify: `frontend/src/app/router.tsx`, `frontend/src/app/router.test.tsx`
- Modify: `frontend/e2e/auth.spec.ts` (bước 1)
- Modify: `frontend/src/i18n/strings.ts`, `frontend/src/i18n/errors.ts`
- Create: `frontend/src/features/landing/{LandingPage,LandingNav,Hero,ChoiceChip,WaitlistForm}.tsx`
- Create: `frontend/src/features/landing/{waitlist,api}.ts`
- Create: `frontend/src/features/landing/landing.css`
- Create: `frontend/src/features/landing/{waitlist.test.ts,WaitlistForm.test.tsx}`
- Modify: `docs/superpowers/specs/2026-10-11-landing-waitlist-design.md` (§3)

**Interfaces:**
- Consumes: `POST /api/waitlist`, `PUT /api/waitlist/answers` (Task 5)
- Produces:
  - `SkipIfAuthed({children})` trong `features/auth/RequireAuth.tsx`
  - `LandingPage()`; `type SignupState = { email: string; answered: boolean }`
  - `Hero({ signup, onJoined, onAnswered, chart }: { …; chart?: ReactNode })` — Task 8 truyền `chart`
  - `WaitlistForm({ idPrefix, signup, onJoined, onAnswered })`
  - `ChoiceChip({ id, name, type, checked, onChange, children })`
  - `looksLikeEmail(s)`, `readSource(search)`, `JOURNAL_TOOLS`, `MARKETS`, `PROP_STATUSES`
  - Utility Tailwind: `font-display`, `text-loss`, `bg-cta`, `text-cta-foreground`

- [ ] **Step 1: Cài phụ thuộc**

```bash
export PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH
cd frontend && npm install @fontsource/ibm-plex-sans@^5 @vercel/analytics@^1
```

Expected: `package.json` có thêm hai dòng trong `dependencies`.

- [ ] **Step 2: Test hỏng cho token**

Tạo `frontend/src/styles/landingTokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";

const bridge = readFileSync(fromFrontend("src/styles/bridge.css"), "utf8");

// Tailwind v4 chỉ đúc utility cho tên đã khai trong @theme. Thiếu một dòng
// --color-* thì `text-loss` là một lớp không tồn tại — không lỗi build, chỉ
// là chữ lỗ hiện màu mặc định.
test("landing tokens are declared for both themes and exposed to Tailwind", () => {
  const light = /:root,\s*\[data-theme="light"\]\s*\{[^}]*\}/.exec(bridge)?.[0] ?? "";
  const dark = /\[data-theme="dark"\]\s*\{[^}]*\}/.exec(bridge)?.[0] ?? "";
  for (const token of ["--loss-text", "--cta", "--cta-foreground"]) {
    expect(light, `${token} missing in light theme`).toContain(`${token}:`);
    expect(dark, `${token} missing in dark theme`).toContain(`${token}:`);
  }
  expect(bridge).toContain("--color-loss: var(--loss-text);");
  expect(bridge).toContain("--color-cta: var(--cta);");
  expect(bridge).toContain("--color-cta-foreground: var(--cta-foreground);");
  expect(bridge).toMatch(/--font-display:\s*"IBM Plex Sans"/);
});
```

Run: `cd frontend && npx vitest run src/styles/landingTokens.test.ts`
Expected: FAIL — `--loss-text missing in light theme`

- [ ] **Step 3: Thêm token vào `frontend/src/styles/bridge.css`**

Thay hai khối `--profit-text` ở đầu file bằng:

```css
:root,
[data-theme="light"] {
  --profit-text: var(--color-teal-900);
  /* Chữ số lỗ. --status-error trên nền trắng chỉ đạt 3,76:1; red/700 đạt
     6,5:1. Mảng màu lỗ (vùng gạch, thanh) vẫn dùng --status-error. */
  --loss-text: var(--color-red-700);
  /* Nút hành động chính của landing. Chữ trắng trên --primary chỉ đạt
     2,55:1 — cùng lý do với --profit-text. */
  --cta: var(--color-teal-900);
  --cta-foreground: var(--color-white);
}

[data-theme="dark"] {
  --profit-text: var(--primary);
  --loss-text: var(--color-red-300);
  --cta: var(--primary);
  --cta-foreground: var(--gray-950);
}
```

Trong `@theme inline { … }`, thêm sau `--font-mono`:

```css
  /* Chỉ dùng cho tiêu đề landing. Font được import trong chunk landing, nên
     app không tải thêm byte nào; ngoài landing lớp này rơi về Inter. */
  --font-display: "IBM Plex Sans", "Inter Variable", ui-sans-serif, system-ui, sans-serif;
```

và sau `--color-profit: var(--profit-text);`:

```css
  --color-loss: var(--loss-text);
  --color-cta: var(--cta);
  --color-cta-foreground: var(--cta-foreground);
```

Run: `npx vitest run src/styles/landingTokens.test.ts` → PASS

- [ ] **Step 4: Thêm chuỗi**

Trong `frontend/src/i18n/strings.ts`, thêm vào nhóm `errors.*` (cạnh `"errors.conflict"`):

```ts
  "errors.tooManyRequests": { vi: "Gửi quá nhiều lần, thử lại sau một phút", en: "Too many attempts, try again in a minute" },
```

và thêm một khối mới ngay trước dòng `} as const satisfies Record<string, Bilingual>;`:

```ts
  "landing.nav.label": { vi: "Trang giới thiệu", en: "Landing page" },
  "landing.nav.scoring": { vi: "Chấm điểm", en: "Scoring" },
  "landing.nav.features": { vi: "Tính năng", en: "Features" },
  "landing.nav.faq": { vi: "Hỏi đáp", en: "FAQ" },
  "landing.nav.login": { vi: "Đăng nhập", en: "Log in" },
  "landing.hero.eyebrow": { vi: "Đang nhận đăng ký dùng thử", en: "Now taking early access sign-ups" },
  "landing.hero.titleLead": { vi: "Lệnh lãi chưa chắc là", en: "A winning trade is not always" },
  "landing.hero.titleEmphasis": { vi: "lệnh đúng.", en: "a good trade." },
  "landing.hero.lede": { vi: "Nhật ký chấm điểm từng lệnh theo kế hoạch của bạn: vào lệnh, trong lệnh, thoát lệnh và tâm lý.", en: "A journal that scores every trade against your plan: entry, in-trade, exit and psychology." },
  "landing.hero.ledeStrong": { vi: "Cuối tháng, bạn biết mình đã mất bao nhiêu vì làm khác kế hoạch.", en: "At month end, you know how much breaking the plan cost you." },
  "landing.signup.emailLabel": { vi: "Email", en: "Email" },
  "landing.signup.emailPlaceholder": { vi: "email@cua-ban.com", en: "you@example.com" },
  "landing.signup.honeypotLabel": { vi: "Để trống ô này", en: "Leave this empty" },
  "landing.signup.submit": { vi: "Vào danh sách chờ", en: "Join the waitlist" },
  "landing.signup.hint": { vi: "Chỉ gửi email khi mở cho bạn dùng.", en: "We only email you when your access opens." },
  "landing.signup.invalidEmail": { vi: "Email chưa đúng dạng. Ví dụ: ten@gmail.com", en: "That email doesn't look right. Example: name@gmail.com" },
  "landing.signup.networkError": { vi: "Chưa gửi được. Kiểm tra kết nối rồi thử lại.", en: "Couldn't send. Check your connection and try again." },
  "landing.signup.joined": { vi: "Đã thêm vào danh sách chờ.", en: "You're on the waitlist." },
  "landing.signup.inviteTo": { vi: "Thư mời sẽ gửi tới {email}.", en: "Your invite will go to {email}." },
  "landing.answers.optional": { vi: "Không bắt buộc", en: "Optional" },
  "landing.answers.multiple": { vi: "Chọn nhiều", en: "Pick any" },
  "landing.answers.toolQuestion": { vi: "Bạn đang ghi nhật ký bằng gì?", en: "What do you journal with today?" },
  "landing.answers.toolSpreadsheet": { vi: "Excel / Google Sheets", en: "Excel / Google Sheets" },
  "landing.answers.toolNotion": { vi: "Notion", en: "Notion" },
  "landing.answers.toolOtherApp": { vi: "Ứng dụng khác", en: "Another app" },
  "landing.answers.toolNone": { vi: "Chưa ghi", en: "I don't yet" },
  "landing.answers.marketQuestion": { vi: "Bạn giao dịch thị trường nào?", en: "Which markets do you trade?" },
  "landing.answers.marketFxGold": { vi: "Forex / Vàng", en: "Forex / Gold" },
  "landing.answers.marketCrypto": { vi: "Crypto", en: "Crypto" },
  "landing.answers.marketVnStocks": { vi: "Chứng khoán VN", en: "Vietnam stocks" },
  "landing.answers.marketVnDerivatives": { vi: "Phái sinh VN", en: "Vietnam derivatives" },
  "landing.answers.propQuestion": { vi: "Bạn có đang thi quỹ không?", en: "Are you doing a prop firm challenge?" },
  "landing.answers.propActive": { vi: "Đang thi", en: "Right now" },
  "landing.answers.propPast": { vi: "Đã từng", en: "In the past" },
  "landing.answers.propNever": { vi: "Chưa", en: "Never" },
  "landing.answers.submit": { vi: "Gửi câu trả lời", en: "Send answers" },
  "landing.answers.saved": { vi: "Đã lưu câu trả lời.", en: "Answers saved." },
  "landing.answers.thanks": { vi: "Cảm ơn bạn, hẹn gặp khi đến lượt.", en: "Thanks, see you when it's your turn." },
  "landing.closing.title": { vi: "Dùng thử sớm", en: "Get early access" },
  "landing.closing.body": { vi: "Ứng dụng đang mở cho từng nhóm nhỏ. Để lại email, bạn nhận thư mời khi đến lượt.", en: "We're opening access in small groups. Leave your email and you'll get an invite when it's your turn." },
```

- [ ] **Step 5: Map lỗi 1429**

Trong `frontend/src/i18n/errors.ts`, thêm vào `keyByCode`:

```ts
    1429: "errors.tooManyRequests",
```

- [ ] **Step 6: Test hỏng cho tiện ích**

Tạo `frontend/src/features/landing/waitlist.test.ts`:

```ts
import { looksLikeEmail, readSource } from "./waitlist";

test("looksLikeEmail accepts plain addresses and trims", () => {
  expect(looksLikeEmail("toi@gmail.com")).toBe(true);
  expect(looksLikeEmail("  toi@gmail.com ")).toBe(true);
  expect(looksLikeEmail("toi@localhost")).toBe(false);
  expect(looksLikeEmail("toi gmail.com")).toBe(false);
  expect(looksLikeEmail("")).toBe(false);
});

test("readSource prefers utm_source over ref", () => {
  expect(readSource("?utm_source=fb&ref=zalo")).toBe("fb");
  expect(readSource("?ref=zalo")).toBe("zalo");
  expect(readSource("")).toBe("");
});
```

Run: `npx vitest run src/features/landing/waitlist.test.ts`
Expected: FAIL — cannot find module `./waitlist`

- [ ] **Step 7: Tạo `frontend/src/features/landing/waitlist.ts`**

```ts
import type { TranslationKey } from "@/i18n";

/**
 * Mã câu trả lời — khớp domain.JournalTools / WaitlistMarkets / PropStatuses
 * của backend và CHECK của migration 0007. ASCII nên không phải chuỗi enum
 * chấm điểm; nhãn hiển thị nằm ở strings.ts.
 */
export const JOURNAL_TOOLS = ["spreadsheet", "notion", "other_app", "none"] as const;
export const MARKETS = ["fx_gold", "crypto", "vn_stocks", "vn_derivatives"] as const;
export const PROP_STATUSES = ["active", "past", "never"] as const;

export type JournalTool = (typeof JOURNAL_TOOLS)[number];
export type Market = (typeof MARKETS)[number];
export type PropStatus = (typeof PROP_STATUSES)[number];

export const TOOL_LABEL: Record<JournalTool, TranslationKey> = {
  spreadsheet: "landing.answers.toolSpreadsheet",
  notion: "landing.answers.toolNotion",
  other_app: "landing.answers.toolOtherApp",
  none: "landing.answers.toolNone",
};
export const MARKET_LABEL: Record<Market, TranslationKey> = {
  fx_gold: "landing.answers.marketFxGold",
  crypto: "landing.answers.marketCrypto",
  vn_stocks: "landing.answers.marketVnStocks",
  vn_derivatives: "landing.answers.marketVnDerivatives",
};
export const PROP_LABEL: Record<PropStatus, TranslationKey> = {
  active: "landing.answers.propActive",
  past: "landing.answers.propPast",
  never: "landing.answers.propNever",
};

/** Kiểm sơ bộ để báo lỗi ngay tại ô nhập. Luật thật nằm ở domain.NormalizeEmail. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Nhãn nguồn của lượt truy cập: ?utm_source= trước, rồi ?ref=. Backend tự lọc ký tự. */
export function readSource(search: string): string {
  const params = new URLSearchParams(search);
  return params.get("utm_source") ?? params.get("ref") ?? "";
}
```

Run: `npx vitest run src/features/landing/waitlist.test.ts` → PASS

- [ ] **Step 8: Tạo `frontend/src/features/landing/api.ts`**

```ts
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Locale } from "@/i18n";

export type WaitlistJoinBody = { email: string; locale: Locale; source: string; website: string };
export type WaitlistAnswersBody = {
  email: string;
  journal_tool: string;
  markets: string[];
  prop_status: string;
};

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: (body: WaitlistJoinBody) => api.post<{ joined: boolean }>("/waitlist", body),
  });
}

export function useSaveWaitlistAnswers() {
  return useMutation({
    mutationFn: (body: WaitlistAnswersBody) => api.put<{ saved: boolean }>("/waitlist/answers", body),
  });
}
```

- [ ] **Step 9: Tạo `frontend/src/features/landing/ChoiceChip.tsx`**

```tsx
import type { ChangeEventHandler, ReactNode } from "react";

type Props = {
  id: string;
  name: string;
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  children: ReactNode;
};

/**
 * Một lựa chọn dạng viên thuốc. Input thật nằm phủ lên viên (trong suốt), nên
 * bàn phím, trình đọc màn hình và nhóm radio vẫn chạy như input thường.
 */
export function ChoiceChip({ id, name, type, checked, onChange, children }: Props) {
  return (
    <label htmlFor={id} className="relative cursor-pointer">
      <input
        id={id}
        name={name}
        type={type}
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span className="inline-block rounded-full border border-input bg-card px-3 py-1.5 text-sm leading-tight text-foreground hover:border-border-strong peer-checked:border-primary peer-checked:bg-interactive-bg-pressed peer-checked:font-medium peer-checked:text-profit peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
        {children}
      </span>
    </label>
  );
}
```

- [ ] **Step 10: Viết test hỏng cho form**

Tạo `frontend/src/features/landing/WaitlistForm.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, renderApp, resetAll } from "@/test/harness";
import { LandingPage } from "./LandingPage";

beforeEach(() => resetAll({ loggedIn: false }));

function joinHandler(onBody?: (b: unknown) => void) {
  return http.post(`${BASE}/waitlist`, async ({ request }) => {
    onBody?.(await request.json());
    return envelope({ joined: true });
  });
}

test("shows an inline error for a malformed email and sends nothing", async () => {
  let called = false;
  server.use(joinHandler(() => (called = true)));
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@localhost");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(within(hero).getByRole("alert")).toHaveTextContent("Email chưa đúng dạng. Ví dụ: ten@gmail.com");
  expect(called).toBe(false);
});

test("joining reveals the questions with the email interpolated, in both forms", async () => {
  let sent: unknown;
  server.use(joinHandler((b) => (sent = b)));
  renderApp(<LandingPage />, { path: "/?ref=fb-group" });

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), " toi@gmail.com ");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  const confirmations = await screen.findAllByText("Thư mời sẽ gửi tới toi@gmail.com.");
  expect(confirmations).toHaveLength(2);
  expect(sent).toEqual({ email: "toi@gmail.com", locale: "vi", source: "fb-group", website: "" });
  expect(screen.getAllByRole("group", { name: /Bạn đang ghi nhật ký bằng gì\?/ })).toHaveLength(2);
});

test("sends the answers once and thanks the user", async () => {
  let answers: unknown;
  server.use(
    joinHandler(),
    http.put(`${BASE}/waitlist/answers`, async ({ request }) => {
      answers = await request.json();
      return envelope({ saved: true });
    }),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));
  await within(hero).findByText("Thư mời sẽ gửi tới toi@gmail.com.");

  await userEvent.click(within(hero).getByRole("radio", { name: "Excel / Google Sheets" }));
  await userEvent.click(within(hero).getByRole("checkbox", { name: "Crypto" }));
  await userEvent.click(within(hero).getByRole("checkbox", { name: "Chứng khoán VN" }));
  await userEvent.click(within(hero).getByRole("radio", { name: "Đã từng" }));
  await userEvent.click(within(hero).getByRole("button", { name: "Gửi câu trả lời" }));

  expect(await screen.findAllByText("Đã lưu câu trả lời.")).toHaveLength(2);
  expect(answers).toEqual({
    email: "toi@gmail.com",
    journal_tool: "spreadsheet",
    markets: ["crypto", "vn_stocks"],
    prop_status: "past",
  });
});

test("shows the server message on 429", async () => {
  server.use(
    http.post(`${BASE}/waitlist`, () =>
      errorEnvelope(1429, "gửi quá nhiều lần, thử lại sau một phút", 429),
    ),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(await within(hero).findByRole("alert")).toHaveTextContent("gửi quá nhiều lần, thử lại sau một phút");
});

test("shows the generic message on a server error", async () => {
  server.use(http.post(`${BASE}/waitlist`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(await within(hero).findByRole("alert")).toHaveTextContent("Chưa gửi được. Kiểm tra kết nối rồi thử lại.");
});

test("disables the submit button while sending", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  server.use(
    http.post(`${BASE}/waitlist`, async () => {
      await gate;
      return envelope({ joined: true });
    }),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  const button = within(hero).getByRole("button", { name: "Vào danh sách chờ" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  release();
  await within(hero).findByText("Thư mời sẽ gửi tới toi@gmail.com.");
});
```

Run: `npx vitest run src/features/landing/WaitlistForm.test.tsx`
Expected: FAIL — cannot find module `./LandingPage`

- [ ] **Step 11: Tạo `frontend/src/features/landing/WaitlistForm.tsx`**

```tsx
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useJoinWaitlist, useSaveWaitlistAnswers } from "./api";
import { ChoiceChip } from "./ChoiceChip";
import {
  JOURNAL_TOOLS,
  MARKETS,
  MARKET_LABEL,
  PROP_LABEL,
  PROP_STATUSES,
  TOOL_LABEL,
  looksLikeEmail,
  readSource,
  type Market,
} from "./waitlist";

export type SignupState = { email: string; answered: boolean };

type Props = {
  idPrefix: string;
  signup: SignupState | null;
  onJoined: (email: string) => void;
  onAnswered: () => void;
};

/**
 * Hai bước: email trước, ba câu hỏi sau. Email được lưu ngay ở bước một, nên
 * người bỏ qua khảo sát vẫn nằm trong danh sách chờ.
 *
 * Trạng thái đăng ký nằm ở LandingPage chứ không ở đây: trang có hai form,
 * đăng ký ở form này thì form kia cũng phải đổi theo.
 */
export function WaitlistForm({ idPrefix, signup, onJoined, onAnswered }: Props) {
  if (signup) return <AnswersStep idPrefix={idPrefix} signup={signup} onAnswered={onAnswered} />;
  return <EmailStep idPrefix={idPrefix} onJoined={onJoined} />;
}

/** Lỗi 4xx của backend là câu hiển thị được; mạng hỏng và 5xx dùng câu chung. */
function useSubmitError() {
  const { t, locale } = useI18n();
  return (error: unknown) =>
    error instanceof ApiError && error.status < 500
      ? errorMessage(error, locale, t)
      : t("landing.signup.networkError");
}

function EmailStep({ idPrefix, onJoined }: { idPrefix: string; onJoined: (email: string) => void }) {
  const { t, locale } = useI18n();
  const join = useJoinWaitlist();
  const submitError = useSubmitError();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [invalid, setInvalid] = useState(false);

  const emailId = `${idPrefix}-email`;
  const messageId = `${idPrefix}-email-message`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) {
      setInvalid(true);
      return;
    }
    join.mutate(
      { email: trimmed, locale, source: readSource(window.location.search), website },
      { onSuccess: () => onJoined(trimmed) },
    );
  }

  const hasError = invalid || join.isError;
  const message = invalid
    ? t("landing.signup.invalidEmail")
    : join.isError
      ? submitError(join.error)
      : t("landing.signup.hint");

  return (
    <form onSubmit={submit} noValidate className="grid max-w-[30rem] gap-2.5">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={emailId} className="sr-only">
          {t("landing.signup.emailLabel")}
        </label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          placeholder={t("landing.signup.emailPlaceholder")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setInvalid(false);
            join.reset();
          }}
          aria-invalid={hasError || undefined}
          aria-describedby={messageId}
          className="h-12 min-w-0 flex-[1_1_14rem] text-[16px]"
        />
        {/* Honeypot: ẩn khỏi người dùng và trình đọc màn hình; bot điền vào. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={`${idPrefix}-website`}>{t("landing.signup.honeypotLabel")}</label>
          <input
            id={`${idPrefix}-website`}
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={join.isPending}
          className="h-12 flex-none bg-cta px-5 text-[16px] font-semibold text-cta-foreground hover:bg-cta/90"
        >
          {t("landing.signup.submit")}
        </Button>
      </div>
      <p
        id={messageId}
        role={hasError ? "alert" : undefined}
        className={cn("text-sm", hasError ? "text-loss" : "text-muted-foreground")}
      >
        {message}
      </p>
    </form>
  );
}

function AnswersStep({
  idPrefix,
  signup,
  onAnswered,
}: {
  idPrefix: string;
  signup: SignupState;
  onAnswered: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveWaitlistAnswers();
  const submitError = useSubmitError();
  const [tool, setTool] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [prop, setProp] = useState("");

  if (signup.answered) {
    return (
      <div role="status" className="grid gap-1 rounded-lg border bg-card p-5">
        <p className="font-semibold">{t("landing.answers.saved")}</p>
        <p className="text-muted-foreground">{t("landing.answers.thanks")}</p>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { email: signup.email, journal_tool: tool, markets, prop_status: prop },
      { onSuccess: onAnswered },
    );
  }

  function toggleMarket(m: Market) {
    // Giữ thứ tự hiển thị chứ không phải thứ tự bấm: backend sắp lại đằng nào
    // cũng vậy, nhưng request ổn định thì test và log dễ đọc hơn.
    setMarkets((cur) => MARKETS.filter((x) => (x === m ? !cur.includes(m) : cur.includes(x))));
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-lg border bg-card p-5">
      <p role="status" className="font-semibold">
        {t("landing.signup.joined")}{" "}
        <span className="font-normal text-muted-foreground">
          {t("landing.signup.inviteTo", { email: signup.email })}
        </span>
      </p>

      <Question legend={t("landing.answers.toolQuestion")} note={t("landing.answers.optional")}>
        {JOURNAL_TOOLS.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-tool-${code}`}
            name={`${idPrefix}-tool`}
            type="radio"
            checked={tool === code}
            onChange={() => setTool(code)}
          >
            {t(TOOL_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <Question legend={t("landing.answers.marketQuestion")} note={t("landing.answers.multiple")}>
        {MARKETS.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-market-${code}`}
            name={`${idPrefix}-market`}
            type="checkbox"
            checked={markets.includes(code)}
            onChange={() => toggleMarket(code)}
          >
            {t(MARKET_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <Question legend={t("landing.answers.propQuestion")}>
        {PROP_STATUSES.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-prop-${code}`}
            name={`${idPrefix}-prop`}
            type="radio"
            checked={prop === code}
            onChange={() => setProp(code)}
          >
            {t(PROP_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={save.isPending}
          className="h-11 bg-cta px-5 font-semibold text-cta-foreground hover:bg-cta/90"
        >
          {t("landing.answers.submit")}
        </Button>
        {save.isError && (
          <p role="alert" className="text-sm text-loss">
            {submitError(save.error)}
          </p>
        )}
      </div>
    </form>
  );
}

function Question({ legend, note, children }: { legend: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-medium">
        {legend} {note && <small className="font-normal text-muted-foreground">{note}</small>}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
```

- [ ] **Step 12: Tạo `Hero.tsx`, `LandingNav.tsx`, `landing.css`, `LandingPage.tsx`**

`frontend/src/features/landing/LandingNav.tsx`:

```tsx
import { Link } from "react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n, type TranslationKey } from "@/i18n";

const ANCHORS: [string, TranslationKey][] = [
  ["#scoring", "landing.nav.scoring"],
  ["#features", "landing.nav.features"],
  ["#faq", "landing.nav.faq"],
];

export function LandingNav() {
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <Link to="/" aria-label={t("nav.appName")}>
        <BrandLogo />
      </Link>
      <nav aria-label={t("landing.nav.label")} className="flex items-center gap-4 text-[15px] text-muted-foreground">
        {ANCHORS.map(([href, key]) => (
          <a key={href} href={href} className="hidden hover:text-foreground md:inline">
            {t(key)}
          </a>
        ))}
        <LanguageSwitcher />
        <ThemeToggle />
        <Link to="/login" className="font-medium text-foreground">
          {t("landing.nav.login")}
        </Link>
      </nav>
    </header>
  );
}
```

`frontend/src/features/landing/Hero.tsx`:

```tsx
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import { WaitlistForm, type SignupState } from "./WaitlistForm";

type Props = {
  signup: SignupState | null;
  onJoined: (email: string) => void;
  onAnswered: () => void;
  /** Biểu đồ lý thuyết và thực tế — Task 8 truyền vào. */
  chart?: ReactNode;
};

export function Hero({ signup, onJoined, onAnswered, chart }: Props) {
  const { t } = useI18n();
  return (
    <section className="grid items-center gap-10 pt-6 pb-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-12 lg:pb-20">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-profit before:size-[7px] before:rounded-full before:bg-primary">
          {t("landing.hero.eyebrow")}
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.5rem,5.2vw,4.2rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
          {t("landing.hero.titleLead")} <em className="text-loss not-italic">{t("landing.hero.titleEmphasis")}</em>
        </h1>
        <p className="mt-5 max-w-[32em] text-[18px] text-muted-foreground">
          {t("landing.hero.lede")}{" "}
          <strong className="font-semibold text-foreground">{t("landing.hero.ledeStrong")}</strong>
        </p>
        <div data-testid="hero-signup" className="mt-8">
          <WaitlistForm idPrefix="hero" signup={signup} onJoined={onJoined} onAnswered={onAnswered} />
        </div>
      </div>
      {chart && <div className="min-w-0">{chart}</div>}
    </section>
  );
}
```

`frontend/src/features/landing/landing.css`:

```css
/* Hiệu ứng DUY NHẤT của landing: đường thực tế tự vẽ, rồi vùng gạch hiện dần.
   Nằm trong chunk landing (LandingPage import file này), không vào CSS của app. */
@keyframes landing-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes landing-fade {
  to {
    opacity: 1;
  }
}

.landing-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: landing-draw 1.3s cubic-bezier(0.3, 0.7, 0.2, 1) 0.15s forwards;
}

.landing-fade {
  opacity: 0;
  animation: landing-fade 0.5s ease-out 1.25s forwards;
}

@media (prefers-reduced-motion: reduce) {
  .landing-draw,
  .landing-fade {
    animation: none;
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
```

`frontend/src/features/landing/LandingPage.tsx`:

```tsx
import "@fontsource/ibm-plex-sans/600.css";
import "./landing.css";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Hero } from "./Hero";
import { LandingNav } from "./LandingNav";
import { WaitlistForm, type SignupState } from "./WaitlistForm";

export function LandingPage() {
  const { t } = useI18n();
  const [signup, setSignup] = useState<SignupState | null>(null);
  const onJoined = (email: string) => setSignup({ email, answered: false });
  const onAnswered = () => setSignup((s) => (s ? { ...s, answered: true } : s));

  return (
    <div className="min-h-svh bg-background px-4 text-[16px] leading-relaxed text-foreground">
      <div className="mx-auto max-w-[1120px]">
        <LandingNav />
        <main>
          <Hero signup={signup} onJoined={onJoined} onAnswered={onAnswered} />

          <section id="signup" className="border-t py-[72px]">
            <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
              <div>
                <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.16] font-semibold tracking-[-0.02em] text-balance">
                  {t("landing.closing.title")}
                </h2>
                <p className="mt-3.5 max-w-[36em] text-[18px] text-muted-foreground">{t("landing.closing.body")}</p>
              </div>
              <div data-testid="closing-signup">
                <WaitlistForm idPrefix="closing" signup={signup} onJoined={onJoined} onAnswered={onAnswered} />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Chạy test form**

Run: `npx vitest run src/features/landing/`
Expected: PASS (6 test trong `WaitlistForm.test.tsx`, 2 trong `waitlist.test.ts`)

- [ ] **Step 14: Route `/` và guard không chờ — test hỏng trước**

Trong `frontend/src/app/router.test.tsx`, thay test
`"chưa đăng nhập, vào / thì kết cục là trang đăng nhập"` bằng ba test:

```tsx
// Landing hiện NGAY, không chờ /auth/refresh: handler refresh dưới đây không
// bao giờ trả lời, và heading vẫn phải có.
// Landing gọi /meta/enums từ Task 7 trở đi; mock sẵn ở đây để hai ca "/" không
// đỏ vì request không có handler (xem src/test/setup.ts).
const enumsOk = http.get(`${BASE}/meta/enums`, () => envelope(makeEnums()));

test("anonymous visitor at / sees the landing without waiting for the session", async () => {
  server.use(enumsOk, http.post(`${BASE}/auth/refresh`, () => new Promise<never>(() => {})));
  renderPage("/");
  expect(await screen.findByRole("heading", { level: 1, name: "Lệnh lãi chưa chắc là lệnh đúng." })).toBeInTheDocument();
});

test("anonymous visitor at a private page lands on the login page", async () => {
  server.use(notLoggedIn);
  renderPage("/dashboard");
  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});

test("signed-in user at / goes to the dashboard", async () => {
  server.use(
    enumsOk,
    http.post(`${BASE}/auth/refresh`, () =>
      envelope({ access_token: "abc", user: { id: 1, email: "toi@example.com" } }),
    ),
    http.get(`${BASE}/accounts`, () => envelope([])),
  );
  renderPage("/");
  expect(await screen.findByRole("link", { name: "Tạo tài khoản giao dịch" })).toBeInTheDocument();
});
```

Thêm `import { makeEnums } from "@/test/harness";` vào đầu file. Ca cuối dùng lại bằng chứng
mà test "đăng nhập thành công thì vào bảng điều khiển" đang dùng; mở test đó ra để copy đúng
role/name của lối "Tạo tài khoản giao dịch" nếu khác.

Run: `npx vitest run src/app/router.test.tsx`
Expected: FAIL — ca đầu không thấy heading (route `/` chưa có, rơi về `*` → `/dashboard`).

- [ ] **Step 15: Cài đặt `SkipIfAuthed` và route**

Thêm vào cuối `frontend/src/features/auth/RequireAuth.tsx`:

```tsx
/**
 * Như OnlyAnon nhưng KHÔNG chờ phiên khôi phục xong: trong lúc status còn
 * "loading", trang con hiện luôn.
 *
 * Dành cho landing. Khách lạ — người landing viết cho — không có cookie
 * refresh, nên bắt họ nhìn Splash trong lúc /auth/refresh chạy (trên Vercel
 * có khi là một cold start của function) là phạt đúng người cần thấy trang
 * nhanh nhất. Người đã đăng nhập thì bị chuyển sang /dashboard ngay khi phiên
 * khôi phục xong.
 */
export function SkipIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "authed") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

Trong `frontend/src/app/router.tsx`:

1. Import: `import { OnlyAnon, RequireAuth, SkipIfAuthed } from "@/features/auth/RequireAuth";`
2. Thêm lazy import cạnh các trang khác:

```tsx
// Landing là chunk riêng: khách lạ không phải tải code của app, và người dùng
// app không phải tải font IBM Plex Sans của landing.
const LandingPage = lazy(() =>
  import("@/features/landing/LandingPage").then((m) => ({ default: m.LandingPage })),
);
```

3. Thêm route đầu tiên trong `<Routes>`:

```tsx
        <Route
          path="/"
          element={
            <SkipIfAuthed>
              <LandingPage />
            </SkipIfAuthed>
          }
        />
```

Run: `npx vitest run src/app/router.test.tsx` → PASS

- [ ] **Step 16: Sửa E2E bước 1 và spec §3**

Trong `frontend/e2e/auth.spec.ts`, thay test 1:

```ts
  test("1. chưa đăng nhập vào trang cần đăng nhập thì ra trang Đăng nhập", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });
```

Trong spec `docs/superpowers/specs/2026-10-11-landing-waitlist-design.md` §3, thay gạch đầu
dòng đầu tiên bằng:

```markdown
- `router.tsx`: thêm `<Route path="/" element={<SkipIfAuthed><LandingPage /></SkipIfAuthed>} />`.
  `SkipIfAuthed` khác `OnlyAnon` ở chỗ không hiện Splash khi phiên đang khôi phục: khách lạ
  thấy landing ngay, không chờ `/auth/refresh`. Người đã đăng nhập vẫn sang `/dashboard`.
```

- [ ] **Step 17: Kiểm tổng FE**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS toàn bộ, kể cả `styleguard.test.ts`

- [ ] **Step 18: Commit**

```bash
git add frontend docs/superpowers/specs/2026-10-11-landing-waitlist-design.md
git commit -m "feat(landing): trang / cho khách, form danh sách chờ hai bước

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Phiếu chấm điểm

**Files:**
- Modify: `frontend/src/features/meta/hooks.ts`
- Modify: `frontend/src/test/harness.tsx`
- Create: `frontend/src/features/landing/ticket.ts`, `ticket.test.ts`
- Create: `frontend/src/features/landing/ScoreTicket.tsx`, `ScoreTicket.test.tsx`
- Create: `frontend/src/features/landing/ScoringSection.tsx`
- Modify: `frontend/src/features/landing/LandingPage.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `/api/meta/enums` `score_points`, `class_bands` (Task 1); `ChoiceChip` (Task 6)
- Produces:
  - `MetaEnums.score_points: Record<ScoredField, Record<string, number>>`,
    `MetaEnums.class_bands: ClassBand[]`; `type ScoredField`, `type ClassBand = { min: number; class: string }`
  - `makeFullEnums(): MetaEnums` trong `src/test/harness.tsx` (danh sách thật, dùng lại ở Task 8, 9)
  - `SCORED_FIELDS`, `ENUM_FIELD_OF`, `defaultSelection`, `totalScore`, `classify`, `toneOf` trong `ticket.ts`

- [ ] **Step 1: Mở rộng kiểu `MetaEnums`**

Trong `frontend/src/features/meta/hooks.ts`, thêm trên `export type MetaEnums`:

```ts
/** Bốn trục chấm điểm, đúng tên khoá của /meta/enums. */
export type ScoredField = "entry_qualities" | "in_trade_qualities" | "exit_qualities" | "psychologies";

/** Một bậc phân loại: tổng điểm >= min thì thuộc class. Backend sắp min giảm dần. */
export type ClassBand = { min: number; class: string };
```

và thêm hai trường vào cuối `MetaEnums`:

```ts
  score_points: Record<ScoredField, Record<string, number>>;
  class_bands: ClassBand[];
```

- [ ] **Step 2: Cập nhật harness**

Trong `frontend/src/test/harness.tsx`, thêm vào object mặc định của `makeEnums` (trước
`...over`):

```ts
    score_points: {
      entry_qualities: { "Đúng kế hoạch": 25 },
      in_trade_qualities: { "Tuân thủ kế hoạch": 25 },
      exit_qualities: { "Chạm Chốt lời": 25 },
      psychologies: { "Không lỗi": 25 },
    },
    class_bands: [
      { min: 80, class: "Đúng kế hoạch" },
      { min: 55, class: "Cần cải thiện" },
      { min: 30, class: "Bốc đồng / FOMO" },
      { min: 0, class: "Giao dịch trả thù" },
    ],
```

và thêm hàm mới ngay sau `makeEnums`:

```ts
/**
 * Enum ĐẦY ĐỦ, đúng thứ tự của backend/internal/domain/enums.go, kèm điểm của
 * trading-journal-plan.md §2. Landing chọn lựa chọn mặc định theo điểm và trỏ
 * vào nhãn theo vị trí, nên nó cần bộ thật chứ không phải bộ một phần tử của
 * makeEnums.
 */
export function makeFullEnums(): MetaEnums {
  return makeEnums({
    entry_qualities: ["Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"],
    in_trade_qualities: ["Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"],
    exit_qualities: ["Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"],
    psychologies: [
      "Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG",
    ],
    trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện", "Bốc đồng / FOMO", "Giao dịch trả thù"],
    score_points: {
      entry_qualities: { "Đúng kế hoạch": 25, "Quá sớm": 10, "Quá muộn": 10, "Bốc đồng": 0 },
      in_trade_qualities: { "Tuân thủ kế hoạch": 25, "Dời Chốt lời": 10, "Dời dừng lỗ ra xa": 0, "Muốn thoát lệnh": 5 },
      exit_qualities: {
        "Chạm Chốt lời": 25, "Chạm Dừng lỗ": 25, "Thoát chủ động (lý do kỹ thuật)": 15, "Thoát lệnh cảm tính, sợ hãi": 0,
      },
      psychologies: {
        "Không lỗi": 25, "SỢ BỎ LỠ (FOMO)": 0, "SỢ HÃI": 5, "HI VỌNG": 5, "THAM LAM": 5,
        "GIAO DỊCH TRẢ THÙ": 0, "LUÔN MUỐN MÌNH ĐÚNG": 0,
      },
    },
  });
}
```

Run: `npx tsc --noEmit` → không lỗi (mọi chỗ dựng `MetaEnums` đều đi qua `makeEnums`; nếu
`tsc` chỉ ra chỗ khác tự dựng object, thêm hai trường y như trên).

- [ ] **Step 3: Test hỏng cho hàm thuần**

Tạo `frontend/src/features/landing/ticket.test.ts`:

```ts
import { makeFullEnums } from "@/test/harness";
import { classify, defaultSelection, toneOf, totalScore } from "./ticket";

const enums = makeFullEnums();

test("default selection is the 35-point winning trade", () => {
  const sel = defaultSelection(enums);
  expect(sel).toEqual({
    entry_qualities: "Quá sớm",
    in_trade_qualities: "Tuân thủ kế hoạch",
    exit_qualities: "Thoát lệnh cảm tính, sợ hãi",
    psychologies: "SỢ BỎ LỠ (FOMO)",
  });
  expect(totalScore(sel, enums.score_points)).toBe(35);
});

test.each([
  [100, "Đúng kế hoạch", "good"],
  [80, "Đúng kế hoạch", "good"],
  [79, "Cần cải thiện", "warn"],
  [55, "Cần cải thiện", "warn"],
  [54, "Bốc đồng / FOMO", "bad"],
  [30, "Bốc đồng / FOMO", "bad"],
  [29, "Giao dịch trả thù", "bad"],
  [0, "Giao dịch trả thù", "bad"],
])("total %i is %s (%s)", (total, cls, tone) => {
  const band = classify(total, enums.class_bands);
  expect(band?.class).toBe(cls);
  expect(toneOf(band, enums.class_bands)).toBe(tone);
});
```

Run: `npx vitest run src/features/landing/ticket.test.ts`
Expected: FAIL — cannot find module `./ticket`

- [ ] **Step 4: Tạo `frontend/src/features/landing/ticket.ts`**

```ts
import type { EnumField } from "@/i18n/enumLabels";
import type { ClassBand, MetaEnums, ScoredField } from "@/features/meta/hooks";

export const SCORED_FIELDS: readonly ScoredField[] = [
  "entry_qualities",
  "in_trade_qualities",
  "exit_qualities",
  "psychologies",
];

/** Tên trường của enumLabel cho từng trục — để hiện nhãn tiếng Anh ở locale en. */
export const ENUM_FIELD_OF: Record<ScoredField, EnumField> = {
  entry_qualities: "entry_quality",
  in_trade_qualities: "in_trade_quality",
  exit_qualities: "exit_quality",
  psychologies: "psychology",
};

/**
 * Điểm của phiếu mẫu: một lệnh LÃI 90 USD mà chỉ được 35/100.
 *
 * Chọn theo ĐIỂM chứ không theo nhãn: nhãn là key chấm điểm và không được
 * chép vào frontend (CLAUDE.md quy tắc 5). Với mỗi trục, lấy nhãn ĐẦU TIÊN
 * trong danh sách của backend có đúng số điểm này.
 */
const DEFAULT_POINTS: Record<ScoredField, number> = {
  entry_qualities: 10,
  in_trade_qualities: 25,
  exit_qualities: 0,
  psychologies: 0,
};

export type Selection = Record<ScoredField, string>;

export function defaultSelection(enums: MetaEnums): Selection {
  const pick = (field: ScoredField) =>
    enums[field].find((label) => enums.score_points[field][label] === DEFAULT_POINTS[field]) ??
    enums[field][0];
  return {
    entry_qualities: pick("entry_qualities"),
    in_trade_qualities: pick("in_trade_qualities"),
    exit_qualities: pick("exit_qualities"),
    psychologies: pick("psychologies"),
  };
}

export function totalScore(sel: Selection, points: MetaEnums["score_points"]): number {
  return SCORED_FIELDS.reduce((sum, f) => sum + (points[f][sel[f]] ?? 0), 0);
}

/** Bậc đầu tiên (min giảm dần) mà total đạt tới. */
export function classify(total: number, bands: ClassBand[]): ClassBand | undefined {
  return [...bands].sort((a, b) => b.min - a.min).find((b) => total >= b.min);
}

export type Tone = "good" | "warn" | "bad";

/** Bậc cao nhất là tốt, bậc kế là cần cải thiện, mọi bậc dưới đó là xấu. */
export function toneOf(band: ClassBand | undefined, bands: ClassBand[]): Tone {
  const rank = [...bands].sort((a, b) => b.min - a.min).findIndex((b) => b === band);
  if (rank === 0) return "good";
  if (rank === 1) return "warn";
  return "bad";
}
```

Run: `npx vitest run src/features/landing/ticket.test.ts` → PASS

- [ ] **Step 5: Thêm chuỗi**

Thêm vào khối `landing.*` của `strings.ts`:

```ts
  "landing.scoring.title": { vi: "Bốn câu hỏi sau mỗi lệnh", en: "Four questions after every trade" },
  "landing.scoring.questions": { vi: "Vào lệnh có đúng kế hoạch không? Trong lệnh có dời dừng lỗ không? Thoát vì kỹ thuật hay vì sợ? Lúc bấm nút bạn đang nghĩ gì?", en: "Did you enter on plan? Did you move your stop? Did you exit for a reason or out of fear? What were you thinking when you clicked?" },
  "landing.scoring.pointsLead": { vi: "Mỗi câu tối đa 25 điểm.", en: "Each question is worth up to 25 points." },
  "landing.scoring.pointsStrong": { vi: "Lệnh dưới đây lãi 90 USD nhưng chỉ được 35 điểm.", en: "The trade below made 90 USD but scores only 35." },
  "landing.scoring.pointsTail": { vi: "Còn một lệnh chạm dừng lỗ đúng kế hoạch vẫn đủ 25 điểm thoát lệnh.", en: "A trade that hits its planned stop still earns the full 25 exit points." },
  "landing.scoring.tryIt": { vi: "Bấm vào các lựa chọn để chấm lại.", en: "Click the options to rescore it." },
  "landing.scoring.ticketLabel": { vi: "Phiếu chấm điểm lệnh mẫu", en: "Sample trade scorecard" },
  "landing.scoring.ticketMeta": { vi: "Short · M15 · 14/10 14:32", en: "Short · M15 · Oct 14 14:32" },
  "landing.scoring.ticketPnl": { vi: "+90 USD", en: "+90 USD" },
  "landing.scoring.outOf": { vi: "/{max}", en: "/{max}" },
```

(Nhãn bốn trục dùng lại `dashboard.axisEntry`, `dashboard.axisInTrade`, `dashboard.axisExit`,
`dashboard.axisPsych` có sẵn.)

- [ ] **Step 6: Test hỏng cho component**

Tạo `frontend/src/features/landing/ScoreTicket.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { ScoringSection } from "./ScoringSection";

beforeEach(() => resetAll({ loggedIn: false }));

const enumsOk = http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums()));

test("starts at 35 points, impulsive", async () => {
  server.use(enumsOk);
  renderApp(<ScoringSection />);

  const ticket = await screen.findByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });
  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("35/100");
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Bốc đồng / FOMO");
});

test("rescoring updates the total and the class", async () => {
  server.use(enumsOk);
  renderApp(<ScoringSection />);
  const ticket = await screen.findByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });

  const entry = within(ticket).getByRole("group", { name: "Vào lệnh" });
  await userEvent.click(within(entry).getByRole("radio", { name: "Đúng kế hoạch" }));
  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("50/100");

  const exit = within(ticket).getByRole("group", { name: "Thoát lệnh" });
  await userEvent.click(within(exit).getByRole("radio", { name: "Chạm Dừng lỗ" }));
  const psych = within(ticket).getByRole("group", { name: "Tâm lý" });
  await userEvent.click(within(psych).getByRole("radio", { name: "Không lỗi" }));

  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("100/100");
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Đúng kế hoạch");
});

test("shows English labels in the en locale", async () => {
  localStorage.setItem("journal.locale", "en");
  server.use(enumsOk);
  renderApp(<ScoringSection />);

  const ticket = await screen.findByRole("form", { name: "Sample trade scorecard" });
  expect(within(ticket).getByRole("radio", { name: "Too early" })).toBeChecked();
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Impulsive / FOMO");
});

test("hides the ticket when meta fails but keeps the copy", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<ScoringSection />);

  expect(screen.getByRole("heading", { name: "Bốn câu hỏi sau mỗi lệnh" })).toBeInTheDocument();
  await screen.findByTestId("ticket-unavailable");
  expect(screen.queryByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" })).not.toBeInTheDocument();
});
```

Run: `npx vitest run src/features/landing/ScoreTicket.test.tsx`
Expected: FAIL — cannot find module `./ScoringSection`

- [ ] **Step 7: Tạo `frontend/src/features/landing/ScoreTicket.tsx`**

```tsx
import { useState } from "react";
import { useI18n, type TranslationKey } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { cn } from "@/lib/utils";
import { useMetaEnums, type MetaEnums, type ScoredField } from "@/features/meta/hooks";
import { ChoiceChip } from "./ChoiceChip";
import {
  ENUM_FIELD_OF,
  SCORED_FIELDS,
  classify,
  defaultSelection,
  toneOf,
  totalScore,
  type Selection,
  type Tone,
} from "./ticket";

const AXIS_LABEL: Record<ScoredField, TranslationKey> = {
  entry_qualities: "dashboard.axisEntry",
  in_trade_qualities: "dashboard.axisInTrade",
  exit_qualities: "dashboard.axisExit",
  psychologies: "dashboard.axisPsych",
};

const TONE_TEXT: Record<Tone, string> = { good: "text-profit", warn: "text-warning", bad: "text-loss" };
const TONE_BAR: Record<Tone, string> = { good: "bg-primary", warn: "bg-warning", bad: "bg-destructive" };

/** Mỗi trục tối đa 25 điểm (trading-journal-plan.md §2). */
const AXIS_MAX = 25;

/**
 * Phiếu chấm điểm mẫu. Nhãn, điểm và ngưỡng phân loại đều đến từ /meta/enums;
 * đang tải thì hiện khung cùng kích thước, lỗi thì ẩn hẳn (khối chữ bên cạnh
 * vẫn đứng được một mình).
 */
export function ScoreTicket() {
  const { data, isPending, isError } = useMetaEnums();
  if (isError) return <div data-testid="ticket-unavailable" hidden />;
  if (isPending) return <div aria-hidden="true" className="h-[28rem] rounded-[10px] border bg-card" />;
  return <Ticket enums={data} />;
}

function Ticket({ enums }: { enums: MetaEnums }) {
  const { t, locale } = useI18n();
  const [sel, setSel] = useState<Selection>(() => defaultSelection(enums));
  const total = totalScore(sel, enums.score_points);
  const band = classify(total, enums.class_bands);
  const tone = toneOf(band, enums.class_bands);
  const max = AXIS_MAX * SCORED_FIELDS.length;

  return (
    <form aria-label={t("landing.scoring.ticketLabel")} className="min-w-0 rounded-[10px] border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <b className="font-mono text-[16px]">XAUUSD</b>
          <span className="font-mono text-[13px] text-muted-foreground">{t("landing.scoring.ticketMeta")}</span>
        </div>
        <div className="font-mono text-[18px] font-semibold text-profit">{t("landing.scoring.ticketPnl")}</div>
      </div>

      <div className="grid gap-[18px] p-5">
        {SCORED_FIELDS.map((field) => {
          const points = enums.score_points[field][sel[field]] ?? 0;
          return (
            <fieldset
              key={field}
              className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-0 p-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_3.5rem]"
            >
              <legend className="float-left pt-1.5 text-sm font-medium">{t(AXIS_LABEL[field])}</legend>
              <div className="col-span-full row-start-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:row-start-auto">
                {enums[field].map((label, i) => (
                  <ChoiceChip
                    key={label}
                    id={`ticket-${field}-${i}`}
                    name={`ticket-${field}`}
                    type="radio"
                    checked={sel[field] === label}
                    onChange={() => setSel((s) => ({ ...s, [field]: label }))}
                  >
                    {enumLabel(ENUM_FIELD_OF[field], label, locale, enums[field])}
                  </ChoiceChip>
                ))}
              </div>
              <div className="pt-1.5 text-right font-mono text-sm text-muted-foreground">
                <b className="font-semibold text-foreground">{points}</b>/{AXIS_MAX}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-b-[10px] border-t bg-surface-sunken px-5 py-4">
        <div data-testid="ticket-total" className="font-mono text-[30px] leading-none font-semibold">
          {total}
          <small className="text-[15px] font-normal text-muted-foreground">
            {t("landing.scoring.outOf", { max })}
          </small>
        </div>
        <div aria-hidden="true" className="h-2 max-w-64 flex-[1_1_10rem] overflow-hidden rounded-full bg-border">
          <i
            className={cn("block h-full transition-[width] duration-300", TONE_BAR[tone])}
            style={{ width: `${(total / max) * 100}%` }}
          />
        </div>
        <div data-testid="ticket-class" className={cn("text-[15px] font-semibold", TONE_TEXT[tone])}>
          {band ? enumLabel("trade_class", band.class, locale, enums.trade_classes) : ""}
        </div>
      </div>
    </form>
  );
}
```

**Lưu ý:** `text-warning` dùng màu `--status-warning` (vàng) — trên nền sáng chữ vàng thiếu
tương phản. Nếu bước kiểm tương phản ở Task 10 cho dưới 4,5:1, thêm token `--warn-text`
(sáng: `var(--status-warning-text)`, tối: `var(--status-warning)`) vào `bridge.css` theo đúng
khuôn `--loss-text` và đổi `TONE_TEXT.warn` sang `text-warn`.

- [ ] **Step 8: Tạo `frontend/src/features/landing/ScoringSection.tsx`**

```tsx
import { useI18n } from "@/i18n";
import { ScoreTicket } from "./ScoreTicket";

export function ScoringSection() {
  const { t } = useI18n();
  return (
    <section id="scoring" className="border-t py-[72px]">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
        <div className="grid gap-4 text-[17px]">
          <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.16] font-semibold tracking-[-0.02em] text-balance">
            {t("landing.scoring.title")}
          </h2>
          <p className="text-muted-foreground">{t("landing.scoring.questions")}</p>
          <p className="text-muted-foreground">
            {t("landing.scoring.pointsLead")}{" "}
            <strong className="font-semibold text-foreground">{t("landing.scoring.pointsStrong")}</strong>{" "}
            {t("landing.scoring.pointsTail")}
          </p>
          <p className="text-sm text-muted-foreground">{t("landing.scoring.tryIt")}</p>
        </div>
        <ScoreTicket />
      </div>
    </section>
  );
}
```

Trong `LandingPage.tsx`, import `ScoringSection` và đặt `<ScoringSection />` ngay sau `<Hero … />`.

- [ ] **Step 9: Chạy test**

Run: `npx vitest run src/features/landing/ && npx tsc --noEmit`
Expected: PASS. `WaitlistForm.test.tsx` giờ render cả `ScoringSection`, nên mỗi test của nó
cần handler `/meta/enums`: thêm vào `beforeEach` của file đó
`server.use(http.get(\`${BASE}/meta/enums\`, () => envelope(makeFullEnums())))` (và import
`makeFullEnums`). Chạy lại → PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat(landing): phiếu chấm điểm lấy nhãn, điểm và ngưỡng từ /meta/enums

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Biểu đồ lý thuyết và thực tế (hero)

**Files:**
- Create: `frontend/src/features/landing/gapSample.ts`, `gapSample.test.ts`
- Create: `frontend/src/features/landing/format.ts`
- Create: `frontend/src/features/landing/GapChart.tsx`, `GapChart.test.tsx`
- Modify: `frontend/src/features/landing/LandingPage.tsx` (truyền `chart` cho `Hero`)
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `makeFullEnums` (Task 7), `useMetaEnums`, `Hero.chart` (Task 6)
- Produces: `THEORY`, `DEVIATIONS`, `actualSeries()`, `cumulative()`, `sampleTotals()`,
  `worstDeviation()`, `reasonLabel()`; `formatSigned(n, locale)`, `formatPlain(n, locale)`;
  `GapChart()`

- [ ] **Step 1: Test hỏng cho dữ liệu mẫu**

Tạo `frontend/src/features/landing/gapSample.test.ts`:

```ts
import { makeFullEnums } from "@/test/harness";
import {
  DEVIATIONS,
  THEORY,
  actualSeries,
  cumulative,
  reasonLabel,
  sampleTotals,
  worstDeviation,
} from "./gapSample";
import { formatSigned } from "./format";

test("totals match the copy on the page", () => {
  expect(sampleTotals()).toEqual({ theory: 1330, actual: 190, gap: -1140 });
});

test("cumulative series start at zero and have one point per trade plus origin", () => {
  expect(cumulative(THEORY)).toHaveLength(31);
  expect(cumulative(THEORY)[0]).toBe(0);
  expect(cumulative(actualSeries()).at(-1)).toBe(190);
});

test("the worst deviation is trade #5", () => {
  expect(worstDeviation()).toBe(4);
});

// Mẫu trỏ vào nhãn theo VỊ TRÍ trong danh sách của backend. Test này ghim vị
// trí nào ra chuỗi nào — đổi thứ tự enum bên Go là test đỏ ở đây.
test("deviation reasons resolve to the intended labels", () => {
  const enums = makeFullEnums();
  const labels = Object.fromEntries(
    Object.entries(DEVIATIONS).map(([i, d]) => [i, reasonLabel(d.reason, enums)]),
  );
  expect(labels).toEqual({
    1: "Dời dừng lỗ ra xa",
    4: "Thoát lệnh cảm tính, sợ hãi",
    8: "GIAO DỊCH TRẢ THÙ",
    10: "Quá sớm",
    15: "Dời Chốt lời",
    17: "Dời dừng lỗ ra xa",
    21: "Thoát lệnh cảm tính, sợ hãi",
    26: "Quá muộn",
  });
  expect(reasonLabel(DEVIATIONS[8].reason, undefined)).toBeUndefined();
});

test("formatSigned uses the locale separator and a real minus sign", () => {
  expect(formatSigned(1330, "vi")).toBe("+1.330");
  expect(formatSigned(-1140, "vi")).toBe("−1.140");
  expect(formatSigned(1330, "en")).toBe("+1,330");
  expect(formatSigned(0, "vi")).toBe("0");
});
```

Run: `npx vitest run src/features/landing/gapSample.test.ts`
Expected: FAIL — cannot find module `./gapSample`

- [ ] **Step 2: Tạo `frontend/src/features/landing/format.ts`**

```ts
import type { Locale } from "@/i18n";

/**
 * Định dạng số MINH HOẠ của landing (USD nguyên). Không dùng cho tiền thật từ
 * backend — tiền thật là chuỗi và đi qua src/lib/decimal.ts.
 */
function formatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 2 });
}

/** "+1.330" / "−1.140" — dấu trừ thật (U+2212), thẳng hàng với dấu cộng. */
export function formatSigned(n: number, locale: Locale): string {
  const body = formatter(locale).format(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

export function formatPlain(n: number, locale: Locale): string {
  return formatter(locale).format(n);
}
```

- [ ] **Step 3: Tạo `frontend/src/features/landing/gapSample.ts`**

```ts
import type { MetaEnums, ScoredField } from "@/features/meta/hooks";

/**
 * 30 lệnh MINH HOẠ cho biểu đồ hero, đơn vị USD, 1R = 100.
 *
 * Dữ liệu tổng hợp, viết tay, không đến từ backend — nên quy tắc "tiền là
 * chuỗi" (CLAUDE.md quy tắc 1) không áp vào đây: không có chữ số nào để mất,
 * và không con số nào là tiền thật của ai. Trang ghi rõ "Dữ liệu minh hoạ".
 *
 * THEORY là kết quả nếu làm đúng kế hoạch ở mọi lệnh.
 */
export const THEORY: readonly number[] = [
  200, -100, 150, -100, 300, -100, 200, -100, -100, 250, 180, -100, -100, 220, -100,
  300, -100, -100, 200, 150, -100, 240, -100, -100, 180, -100, 210, -100, 150, -100,
];

/** Trỏ vào MỘT nhãn enum theo vị trí, vì nhãn không được chép vào frontend. */
export type EnumRef = { field: ScoredField; index: number };
export type Deviation = { actual: number; reason: EnumRef };

/** Lệnh làm khác kế hoạch. Khoá là index 0-based trong THEORY. */
export const DEVIATIONS: Readonly<Record<number, Deviation>> = {
  1: { actual: -180, reason: { field: "in_trade_qualities", index: 2 } },
  4: { actual: 90, reason: { field: "exit_qualities", index: 3 } },
  8: { actual: -250, reason: { field: "psychologies", index: 5 } },
  10: { actual: 60, reason: { field: "entry_qualities", index: 1 } },
  15: { actual: 120, reason: { field: "in_trade_qualities", index: 1 } },
  17: { actual: -200, reason: { field: "in_trade_qualities", index: 2 } },
  21: { actual: 80, reason: { field: "exit_qualities", index: 3 } },
  26: { actual: 70, reason: { field: "entry_qualities", index: 2 } },
};

export const DEVIATION_INDEXES: readonly number[] = Object.keys(DEVIATIONS)
  .map((k) => +k)
  .sort((a, b) => a - b);

export function actualSeries(): number[] {
  return THEORY.map((v, i) => DEVIATIONS[i]?.actual ?? v);
}

/** Lũy kế bắt đầu từ 0, để hai đường cùng xuất phát tại gốc. */
export function cumulative(xs: readonly number[]): number[] {
  const out = [0];
  for (const x of xs) out.push(out[out.length - 1] + x);
  return out;
}

export function sampleTotals() {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const theory = sum(THEORY);
  const actual = sum(actualSeries());
  return { theory, actual, gap: actual - theory };
}

/** Index của lệnh mất nhiều nhất so với kế hoạch — chú thích mặc định. */
export function worstDeviation(): number {
  return [...DEVIATION_INDEXES].sort(
    (a, b) => DEVIATIONS[a].actual - THEORY[a] - (DEVIATIONS[b].actual - THEORY[b]),
  )[0];
}

export function reasonLabel(ref: EnumRef, enums: MetaEnums | undefined): string | undefined {
  return enums?.[ref.field][ref.index];
}
```

(`+k` thay cho `Number(k)`: styleguard cấm chuỗi `Number(` trong `src/`.)

Run: `npx vitest run src/features/landing/gapSample.test.ts` → PASS

- [ ] **Step 4: Thêm chuỗi**

```ts
  "landing.gap.title": { vi: "Lý thuyết và thực tế", en: "Plan vs. reality" },
  "landing.gap.meta": { vi: "Dữ liệu minh hoạ · 30 lệnh · 1R = 100 USD", en: "Sample data · 30 trades · 1R = 100 USD" },
  "landing.gap.theory": { vi: "Lý thuyết", en: "Plan" },
  "landing.gap.actual": { vi: "Thực tế", en: "Actual" },
  "landing.gap.gap": { vi: "Chênh lệch", en: "Difference" },
  "landing.gap.legendTheory": { vi: "Nếu làm đúng kế hoạch", en: "If you'd followed the plan" },
  "landing.gap.legendActual": { vi: "Thực tế", en: "What actually happened" },
  "landing.gap.legendGap": { vi: "Mất vì làm khác kế hoạch", en: "Lost to breaking the plan" },
  "landing.gap.chartLabel": { vi: "Lợi nhuận lũy kế theo lệnh: đường lý thuyết nằm trên đường thực tế, phần chênh lệch tô gạch đỏ", en: "Cumulative profit by trade: the plan line sits above the actual line, the gap is hatched red" },
  "landing.gap.dotLabel": { vi: "Lệnh {n}", en: "Trade {n}" },
  "landing.gap.noteTrade": { vi: "Lệnh #{n}", en: "Trade #{n}" },
  "landing.gap.noteDetail": { vi: "Kế hoạch {plan}, thực tế {actual}, mất {lost} USD.", en: "Plan {plan}, actual {actual}, lost {lost} USD." },
```

- [ ] **Step 5: Test hỏng cho component**

Tạo `frontend/src/features/landing/GapChart.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { GapChart } from "./GapChart";

beforeEach(() => resetAll({ loggedIn: false }));

test("shows the three totals", () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);
  expect(screen.getByTestId("gap-theory")).toHaveTextContent("+1.330");
  expect(screen.getByTestId("gap-actual")).toHaveTextContent("+190");
  expect(screen.getByTestId("gap-diff")).toHaveTextContent("−1.140");
});

test("the note starts on the worst trade and follows the focused dot", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);

  const note = screen.getByTestId("gap-note");
  expect(note).toHaveTextContent("Lệnh #5");
  expect(await screen.findByText("Thoát lệnh cảm tính, sợ hãi")).toBeInTheDocument();
  expect(note).toHaveTextContent("Kế hoạch +300, thực tế +90, mất 210 USD.");

  fireEvent.focus(screen.getByRole("button", { name: "Lệnh 9" }));
  expect(note).toHaveTextContent("Lệnh #9");
  expect(note).toHaveTextContent("GIAO DỊCH TRẢ THÙ");
  expect(note).toHaveTextContent("Kế hoạch −100, thực tế −250, mất 150 USD.");
});

test("still shows amounts when meta fails", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<GapChart />);
  const note = screen.getByTestId("gap-note");
  expect(note).toHaveTextContent("Kế hoạch +300, thực tế +90, mất 210 USD.");
  expect(note).not.toHaveTextContent("Thoát lệnh cảm tính");
});
```

Run: `npx vitest run src/features/landing/GapChart.test.tsx`
Expected: FAIL — cannot find module `./GapChart`

- [ ] **Step 6: Tạo `frontend/src/features/landing/GapChart.tsx`**

```tsx
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { formatPlain, formatSigned } from "./format";
import {
  DEVIATIONS,
  DEVIATION_INDEXES,
  THEORY,
  actualSeries,
  cumulative,
  reasonLabel,
  sampleTotals,
  worstDeviation,
} from "./gapSample";

const HEIGHT = 280;
const MARGIN = { l: 46, r: 10, t: 10, b: 24 };
const STEP = 500;
/** jsdom và lần render đầu chưa có kích thước thật. */
const FALLBACK_WIDTH = 600;

/** Bề rộng thật của khung, để chữ trục không bị co nhỏ trên điện thoại. */
function useWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width || FALLBACK_WIDTH;
}

export function GapChart() {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const [active, setActive] = useState(worstDeviation);

  const theory = cumulative(THEORY);
  const actual = cumulative(actualSeries());
  const totals = sampleTotals();

  const lo = Math.min(0, ...theory, ...actual);
  const hi = Math.max(...theory, ...actual);
  const yMin = Math.floor(lo / STEP) * STEP;
  const yMax = Math.ceil(hi / STEP) * STEP;
  const x = (i: number) => MARGIN.l + (i / (theory.length - 1)) * (W - MARGIN.l - MARGIN.r);
  const y = (v: number) => MARGIN.t + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - MARGIN.t - MARGIN.b);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const gapPath =
    line(theory) +
    actual
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse()
      .join("") +
    "Z";

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += STEP) ticks.push(v);

  const dev = DEVIATIONS[active];
  const label = reasonLabel(dev.reason, enums);

  return (
    <figure className="m-0 min-w-0 rounded-[10px] border bg-card px-5 pt-5 pb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] font-semibold">{t("landing.gap.title")}</h2>
        <span className="text-[13px] text-muted-foreground">{t("landing.gap.meta")}</span>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {(
          [
            ["gap-theory", "landing.gap.theory", totals.theory, "text-profit"],
            ["gap-actual", "landing.gap.actual", totals.actual, "text-profit"],
            ["gap-diff", "landing.gap.gap", totals.gap, "text-loss"],
          ] as const
        ).map(([id, key, value, color]) => (
          <div key={id} className="grid gap-0.5">
            <dt className="text-[13px] text-muted-foreground">{t(key)}</dt>
            <dd data-testid={id} className={`m-0 font-mono text-[clamp(18px,2.4vw,24px)] font-semibold tabular-nums ${color}`}>
              {formatSigned(value, locale)}
            </dd>
          </div>
        ))}
      </dl>

      <div ref={box} className="mt-2">
        <svg
          role="img"
          aria-label={t("landing.gap.chartLabel")}
          width={W}
          height={HEIGHT}
          viewBox={`0 0 ${W} ${HEIGHT}`}
          className="block max-w-full"
        >
          <defs>
            <pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="fill-destructive/10" />
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-destructive" strokeWidth="1.4" />
            </pattern>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.l}
                x2={W - MARGIN.r}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? "stroke-input" : "stroke-border"}
              />
              <text x={MARGIN.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
                {formatSigned(v, locale)}
              </text>
            </g>
          ))}
          {[1, 10, 20, 30].map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">
              #{i}
            </text>
          ))}
          <path d={gapPath} className="landing-fade fill-[url(#gap-hatch)]" />
          <path d={line(theory)} className="fill-none stroke-muted-foreground [stroke-dasharray:5_4]" strokeWidth="1.75" />
          <path
            d={line(actual)}
            pathLength={1}
            className="landing-draw fill-none stroke-primary"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {DEVIATION_INDEXES.map((i) => (
            <circle
              key={i}
              cx={x(i + 1)}
              cy={y(actual[i + 1])}
              r={5}
              tabIndex={0}
              role="button"
              aria-label={t("landing.gap.dotLabel", { n: i + 1 })}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`landing-fade cursor-pointer stroke-destructive outline-none ${
                i === active ? "fill-destructive" : "fill-card hover:fill-destructive focus:fill-destructive"
              }`}
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-2 border-dashed border-muted-foreground" />
          {t("landing.gap.legendTheory")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-2 border-primary" />
          {t("landing.gap.legendActual")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-[18px] border border-destructive bg-[repeating-linear-gradient(45deg,var(--status-error)_0_1.5px,transparent_1.5px_5px)]" />
          {t("landing.gap.legendGap")}
        </span>
      </div>

      <p data-testid="gap-note" aria-live="polite" className="mt-3 min-h-[3.2em] border-t pt-3 text-sm">
        <b className="font-semibold">{t("landing.gap.noteTrade", { n: active + 1 })}</b>
        {label && (
          <>
            {" · "}
            <span className="font-mono text-[12.5px] text-loss">{label}</span>
          </>
        )}
        <br />
        {t("landing.gap.noteDetail", {
          plan: formatSigned(THEORY[active], locale),
          actual: formatSigned(dev.actual, locale),
          lost: formatPlain(THEORY[active] - dev.actual, locale),
        })}
      </p>
    </figure>
  );
}
```

**Lưu ý nhãn chú thích:** `label` hiện nguyên chuỗi enum tiếng Việt. Ở locale `en`, đổi thành
`enumLabel(ENUM_FIELD_OF[dev.reason.field], label, locale, enums[dev.reason.field])` (import từ
`./ticket` và `@/i18n/enumLabels`) — làm luôn trong bước này, và thêm vào `GapChart.test.tsx`:

```tsx
test("the note uses English labels in the en locale", async () => {
  localStorage.setItem("journal.locale", "en");
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);
  expect(await screen.findByText("Emotional exit, fear")).toBeInTheDocument();
});
```

- [ ] **Step 7: Gắn vào hero**

Trong `LandingPage.tsx`: `import { GapChart } from "./GapChart";` rồi đổi thành
`<Hero signup={signup} onJoined={onJoined} onAnswered={onAnswered} chart={<GapChart />} />`.

- [ ] **Step 8: Chạy test**

Run: `npx vitest run src/features/landing/ && npx tsc --noEmit && npx vitest run src/test/styleguard.test.ts`
Expected: PASS (styleguard xanh: không `Number(`, không hex, không chuỗi enum ngoài file test)

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat(landing): biểu đồ lý thuyết và thực tế ở hero

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Khối tính năng và hình minh hoạ

**Files:**
- Create: `frontend/src/features/landing/FeatureShowcase.tsx`, `FeatureShowcase.test.tsx`
- Create: `frontend/src/features/landing/previews/{DashboardPreview,ChallengePreview,PeriodPreview,NotePreview,ImportPreview}.tsx`
- Modify: `frontend/src/features/landing/LandingPage.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `useMetaEnums` (`default_setup`), `enumLabel` (`challenge_phase`), `formatSigned`,
  `formatPlain` (Task 8); khoá có sẵn `kpi.*`, `periods.*`, `accounts.*`, `noteTemplate.insert`,
  `dashboard.axis*`
- Produces: `FeatureShowcase()`

- [ ] **Step 1: Thêm chuỗi**

```ts
  "landing.features.title1": { vi: "Nhập lệnh một lần.", en: "Log the trade once." },
  "landing.features.title2": { vi: "Ứng dụng tính phần còn lại.", en: "The app does the rest." },
  "landing.features.intro": { vi: "Không cần công thức, không cần bảng pivot. Sửa hay xoá một lệnh cũ thì đường vốn, drawdown và mọi chỉ số tự tính lại.", en: "No formulas, no pivot tables. Edit or delete an old trade and the equity curve, drawdown and every metric recalculate." },
  "landing.features.dashboardTitle": { vi: "Dashboard", en: "Dashboard" },
  "landing.features.dashboardStrong": { vi: "27 chỉ số và 13 nhóm biểu đồ", en: "27 metrics and 13 chart groups" },
  "landing.features.dashboardBody": { vi: "cho từng tài khoản. Lọc theo thời gian, setup hay mã để thấy mình kiếm tiền ở đâu và mất tiền ở đâu.", en: "per account. Filter by date, setup or symbol to see where you make money and where you lose it." },
  "landing.features.groupsLabel": { vi: "Các nhóm biểu đồ", en: "Chart groups" },
  "landing.features.groupEquity": { vi: "Đường vốn và drawdown", en: "Equity and drawdown" },
  "landing.features.groupSetup": { vi: "Theo setup", en: "By setup" },
  "landing.features.groupSymbol": { vi: "Theo mã", en: "By symbol" },
  "landing.features.groupTimeframe": { vi: "Khung thời gian", en: "Timeframe" },
  "landing.features.groupDirection": { vi: "Chiều lệnh", en: "Direction" },
  "landing.features.groupWeekday": { vi: "Theo thứ", en: "By weekday" },
  "landing.features.groupWeek": { vi: "Theo tuần", en: "By week" },
  "landing.features.groupDay": { vi: "Theo ngày", en: "By day" },
  "landing.features.groupHeatmap": { vi: "Heatmap tháng", en: "Monthly heatmap" },
  "landing.features.groupR": { vi: "Phân phối R", en: "R distribution" },
  "landing.features.groupHold": { vi: "Thời gian giữ lệnh", en: "Hold time" },
  "landing.features.groupRadar": { vi: "Radar tâm lý", en: "Psychology radar" },
  "landing.features.groupTheory": { vi: "Lý thuyết và thực tế", en: "Plan vs. reality" },
  "landing.features.previewLabel": { vi: "Hình minh hoạ: {name}", en: "Illustration: {name}" },
  "landing.features.bySetup": { vi: "Lãi ròng theo setup", en: "Net profit by setup" },
  "landing.features.radarCaption": { vi: "Radar tâm lý · điểm TB / 25", en: "Psychology radar · avg score / 25" },
  "landing.features.challengeTitle": { vi: "Tài khoản quỹ và vòng thi", en: "Prop accounts and challenges" },
  "landing.features.challengeBody": { vi: "Tách tài khoản quỹ và cá nhân. Mỗi vòng thi hiện tiến độ so với mục tiêu lợi nhuận và giới hạn drawdown của quỹ.", en: "Keep prop and personal accounts apart. Each challenge phase shows progress against the firm's profit target and drawdown limit." },
  "landing.features.challengeName": { vi: "Thử thách 100K", en: "100K challenge" },
  "landing.features.periodTitle": { vi: "Tổng kết ngày và tuần", en: "Daily and weekly reviews" },
  "landing.features.periodBody": { vi: "Mỗi ngày, mỗi tuần có thẻ tổng kết và ô ghi chú riêng. Cuối tuần viết lại điều rút ra, tuần sau mở ra đọc.", en: "Every day and week gets a summary card and its own note. Write down the lesson on Sunday, read it on Monday." },
  "landing.features.periodRange": { vi: "W41 · 06/10 – 12/10", en: "W41 · Oct 6 – Oct 12" },
  "landing.features.periodNote": { vi: "Hai lệnh thua cuối tuần đều vào trước tin. Tuần sau đứng ngoài 30 phút quanh tin mạnh.", en: "Both losing trades late in the week were entered before news. Next week, stay out 30 minutes around major news." },
  "landing.features.noteTitle": { vi: "Ghi chú và checklist", en: "Notes and checklists" },
  "landing.features.noteBody": { vi: "Lưu checklist của từng setup thành mẫu. Mỗi lệnh chèn mẫu vào, tích từng bước rồi viết thêm nhận xét.", en: "Save each setup's checklist as a template. Insert it into a trade, tick each step, add your comments." },
  "landing.features.noteStep1": { vi: "Xác định vùng PDA trên H4", en: "Mark the PDA zone on H4" },
  "landing.features.noteStep2": { vi: "Chờ FVG hình thành trên H1", en: "Wait for an H1 FVG to form" },
  "landing.features.noteStep3": { vi: "Dừng lỗ dưới đáy nến tạo FVG", en: "Stop below the FVG candle low" },
  "landing.features.noteStep4": { vi: "Dời dừng lỗ về hoà vốn sau 1R", en: "Move stop to breakeven after 1R" },
  "landing.features.noteComment": { vi: "Vào sớm hơn kế hoạch 2 nến vì sợ lỡ sóng.", en: "Entered 2 candles early for fear of missing the move." },
  "landing.features.importTitle": { vi: "Nhập từ Excel", en: "Import from Excel" },
  "landing.features.importBody": { vi: "Đang ghi nhật ký bằng Excel? Xuất ra CSV rồi nhập vào. Ứng dụng đọc cột theo mẫu nhật ký và chỉ rõ dòng nào cần sửa.", en: "Journaling in Excel? Export to CSV and import it. The app reads the journal's columns and points out which rows need fixing." },
  "landing.features.importCsv": { vi: "Ngày,Mã,Long/ Short,Khung,Lãi/Lỗ\n12/09/2026,XAUUSD,BUY,H1,240\n13/09/2026,EURUSD,SELL,M15,-100", en: "Ngày,Mã,Long/ Short,Khung,Lãi/Lỗ\n12/09/2026,XAUUSD,BUY,H1,240\n13/09/2026,EURUSD,SELL,M15,-100" },
  "landing.features.importOk": { vi: "{n} dòng đọc được", en: "{n} rows read" },
  "landing.features.importErrors": { vi: "{n} dòng cần sửa", en: "{n} rows to fix" },
  "landing.features.extrasLead": { vi: "Còn có:", en: "Also:" },
  "landing.features.extras": { vi: "thời gian giữ lệnh, thùng rác để khôi phục lệnh đã xoá, xuất CSV đúng tập lệnh đang lọc, nạp và rút tách khỏi lợi nhuận, giao diện sáng và tối, tiếng Việt và English.", en: "hold time, a trash bin to restore deleted trades, CSV export of exactly the filtered trades, deposits and withdrawals kept out of profit, light and dark themes, Vietnamese and English." },
  "landing.features.origin": { vi: "Công thức chấm điểm, lũy kế và drawdown lấy từ một file nhật ký Excel đang được dùng hằng ngày, và được kiểm lại bằng chính số liệu của file đó.", en: "The scoring, running totals and drawdown formulas come from an Excel journal in daily use, and are checked against that file's own numbers." },
```

(Header CSV giữ tiếng Việt ở cả hai locale: đó là header của file Excel gốc — dữ liệu nghiệp vụ,
quy tắc 9.)

- [ ] **Step 2: Test hỏng**

Tạo `frontend/src/features/landing/FeatureShowcase.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { FeatureShowcase } from "./FeatureShowcase";

beforeEach(() => {
  resetAll({ loggedIn: false });
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
});

test("lists all five features with their illustrations", () => {
  renderApp(<FeatureShowcase />);
  for (const name of [
    "Dashboard",
    "Tài khoản quỹ và vòng thi",
    "Tổng kết ngày và tuần",
    "Ghi chú và checklist",
    "Nhập từ Excel",
  ]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Hình minh hoạ: ${name}` })).toBeInTheDocument();
  }
});

test("names all 13 chart groups", () => {
  renderApp(<FeatureShowcase />);
  const groups = screen.getByRole("list", { name: "Các nhóm biểu đồ" });
  expect(within(groups).getAllByRole("listitem")).toHaveLength(13);
});

test("the losing setup is the backend default setup", async () => {
  renderApp(<FeatureShowcase />);
  expect(await screen.findByText("KHÔNG CÓ SETUP")).toBeInTheDocument();
});

test("interpolates counts in the import preview", () => {
  renderApp(<FeatureShowcase />);
  expect(screen.getByText("128 dòng đọc được")).toBeInTheDocument();
  expect(screen.getByText("2 dòng cần sửa")).toBeInTheDocument();
});
```

Run: `npx vitest run src/features/landing/FeatureShowcase.test.tsx`
Expected: FAIL — cannot find module `./FeatureShowcase`

- [ ] **Step 3: Tạo các preview**

`frontend/src/features/landing/previews/DashboardPreview.tsx`:

```tsx
import { useI18n, type TranslationKey } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { formatSigned } from "../format";

/** Số minh hoạ — xem chú thích đầu gapSample.ts về vì sao là number. */
const KPIS: [TranslationKey, string, "up" | "down" | "plain"][] = [
  ["kpi.netProfit", "net", "up"],
  ["kpi.winPct", "win", "plain"],
  ["kpi.profitFactor", "pf", "plain"],
  ["kpi.maxDrawdown", "dd", "down"],
];
const SETUPS: [string, number][] = [
  ["FVG H1", 1420],
  ["Order block", 860],
  ["Breakout", 310],
];
const DEFAULT_SETUP_NET = -540;
const RADAR: [TranslationKey, number][] = [
  ["dashboard.axisEntry", 18],
  ["dashboard.axisInTrade", 21],
  ["dashboard.axisExit", 14],
  ["dashboard.axisPsych", 11],
];

export function DashboardPreview() {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const pct = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "percent" });
  const dec = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: 2 });
  const values: Record<string, string> = {
    net: formatSigned(2480, locale),
    win: pct.format(0.46),
    pf: dec.format(1.62),
    dd: formatSigned(-640, locale),
  };
  const setups: [string, number][] = enums ? [...SETUPS, [enums.default_setup, DEFAULT_SETUP_NET]] : SETUPS;
  const maxAbs = Math.max(...setups.map(([, v]) => Math.abs(v)));

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {KPIS.map(([key, id, tone]) => (
          <div key={id} className="min-w-0 rounded-md border bg-card px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{t(key)}</span>
            <b
              className={`mt-1 block font-mono text-[17px] font-semibold tabular-nums ${
                tone === "up" ? "text-profit" : tone === "down" ? "text-loss" : ""
              }`}
            >
              {values[id]}
            </b>
          </div>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{t("landing.features.bySetup")}</span>
          <div className="mt-2 grid gap-[7px] text-[13px]">
            {setups.map(([name, v]) => {
              // Gốc 0 nằm ở 30% bề rộng: bên phải cho lãi, bên trái cho lỗ.
              const w = (Math.abs(v) / maxAbs) * (v >= 0 ? 70 : 30);
              return (
                <div key={name} className="grid grid-cols-[9.2rem_minmax(0,1fr)_3.6rem] items-center gap-2">
                  <span className="truncate">{name}</span>
                  <span className="relative h-2.5 before:absolute before:-top-[3px] before:-bottom-[3px] before:left-[30%] before:border-l before:border-input">
                    <i
                      className={`absolute inset-y-0 rounded-sm ${v >= 0 ? "bg-primary" : "bg-destructive"}`}
                      style={v >= 0 ? { left: "30%", width: `${w}%` } : { right: "70%", width: `${w}%` }}
                    />
                  </span>
                  <span className={`text-right font-mono tabular-nums ${v >= 0 ? "text-profit" : "text-loss"}`}>
                    {formatSigned(v, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{t("landing.features.radarCaption")}</span>
          <Radar />
        </div>
      </div>
    </div>
  );
}

function Radar() {
  const { t } = useI18n();
  const cx = 130;
  const cy = 95;
  const R = 58;
  const pt = (k: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (k * Math.PI) / 2;
    return [cx + (Math.cos(a) * R * v) / 25, cy + (Math.sin(a) * R * v) / 25];
  };
  const poly = (v: (k: number) => number) => RADAR.map((_, k) => pt(k, v(k)).join(",")).join(" ");
  const labelPos: [number, number, "middle" | "start" | "end"][] = [
    [cx, 18, "middle"],
    [cx + R + 8, cy + 4, "start"],
    [cx, cy + R + 16, "middle"],
    [cx - R - 8, cy + 4, "end"],
  ];
  return (
    <svg viewBox="0 0 260 190" className="mx-auto mt-1 block h-auto w-full max-w-[260px]" aria-hidden="true">
      {[25, 12.5].map((v) => (
        <polygon key={v} points={poly(() => v)} className="fill-none stroke-border" />
      ))}
      {RADAR.map((_, k) => {
        const [x2, y2] = pt(k, 25);
        return <line key={k} x1={cx} y1={cy} x2={x2} y2={y2} className="stroke-border" />;
      })}
      <polygon points={poly((k) => RADAR[k][1])} className="fill-interactive-bg-pressed stroke-primary" strokeWidth="2" />
      {RADAR.map(([key, v], k) => (
        <text key={key} x={labelPos[k][0]} y={labelPos[k][1]} textAnchor={labelPos[k][2]} className="fill-muted-foreground text-[10.5px]">
          {t(key)} {v}
        </text>
      ))}
    </svg>
  );
}
```

`frontend/src/features/landing/previews/ChallengePreview.tsx`:

```tsx
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { formatPlain } from "../format";

const PHASES = ["phase_1", "phase_2", "funded"] as const;

export function ChallengePreview() {
  const { t, locale } = useI18n();
  const phase = (p: (typeof PHASES)[number]) => enumLabel("challenge_phase", p, locale);
  const pct = (n: number) => `${formatPlain(n, locale)}%`;
  return (
    <div className="grid gap-3 rounded-md border bg-card px-3 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b>{t("landing.features.challengeName")}</b>
        <span className="text-xs text-muted-foreground">{t("accounts.outcomeInProgress", { phase: phase("phase_2") })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-full border border-primary px-2 py-0.5 text-profit">{phase("phase_1")} ✓</span>
        <em className="text-input not-italic">—</em>
        <span className="rounded-full border border-foreground px-2 py-0.5 font-semibold">{phase("phase_2")}</span>
        <em className="text-input not-italic">—</em>
        <span className="rounded-full border border-input px-2 py-0.5 text-muted-foreground">{phase("funded")}</span>
      </div>
      {(
        [
          ["accounts.meterProfit", 3.4, 5, "bg-primary"],
          ["accounts.meterDrawdown", 2.1, 10, "bg-warning"],
        ] as const
      ).map(([key, value, limit, bar]) => (
        <div key={key} className="grid gap-1">
          <div className="flex justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t(key)}</span>
            <span className="font-mono tabular-nums">
              {pct(value)} / {pct(limit)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <i className={`block h-full rounded-full ${bar}`} style={{ width: `${(value / limit) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

`frontend/src/features/landing/previews/PeriodPreview.tsx`:

```tsx
import { useI18n, type TranslationKey } from "@/i18n";
import { formatPlain, formatSigned } from "../format";

export function PeriodPreview() {
  const { t, locale } = useI18n();
  const tabs: [TranslationKey, boolean][] = [
    ["periods.tabTrade", false],
    ["periods.tabDay", false],
    ["periods.tabWeek", true],
  ];
  const stats: [TranslationKey, string, string][] = [
    ["periods.grossProfit", formatSigned(1240, locale), "text-profit"],
    ["periods.grossLoss", formatSigned(-610, locale), "text-loss"],
    ["periods.winners", "7/5", ""],
    ["periods.profitFactor", new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: 2 }).format(2.03), ""],
  ];
  return (
    <div className="grid gap-2.5 text-[13px]">
      <div className="flex w-max gap-0.5 rounded-md border bg-card p-0.5">
        {tabs.map(([key, on]) => (
          <span key={key} className={`rounded px-2.5 py-0.5 ${on ? "bg-surface-sunken font-semibold" : "text-muted-foreground"}`}>
            {t(key)}
          </span>
        ))}
      </div>
      <div className="rounded-md border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <b>{t("landing.features.periodRange")}</b>
          <span className="text-xs text-muted-foreground">{t("periods.tradeCount", { n: formatPlain(12, locale) })}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([key, value, color]) => (
            <div key={key}>
              <span className="text-xs text-muted-foreground">{t(key)}</span>
              <b className={`block font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</b>
            </div>
          ))}
        </div>
        <p className="mt-2.5 border-t border-dashed border-input pt-2.5">{t("landing.features.periodNote")}</p>
      </div>
    </div>
  );
}
```

`frontend/src/features/landing/previews/NotePreview.tsx`:

```tsx
import { useI18n, type TranslationKey } from "@/i18n";

const STEPS: [TranslationKey, boolean][] = [
  ["landing.features.noteStep1", true],
  ["landing.features.noteStep2", true],
  ["landing.features.noteStep3", true],
  ["landing.features.noteStep4", false],
];

export function NotePreview() {
  const { t } = useI18n();
  return (
    <div className="rounded-md border bg-card px-3 py-2.5 text-[13px]">
      <span className="inline-flex items-center gap-1.5 rounded border border-input bg-card px-2 py-0.5 text-[12.5px]">
        {t("noteTemplate.insert")} · <b>HTF PDA - FVG - H1</b>
      </span>
      <ul className="mt-2 grid list-none gap-1.5 p-0">
        {STEPS.map(([key, done]) => (
          <li key={key} className={`flex items-baseline gap-2 ${done ? "text-muted-foreground line-through decoration-input" : ""}`}>
            <span
              aria-hidden="true"
              className={`size-[13px] flex-none translate-y-0.5 rounded-[3px] border-[1.5px] ${
                done ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--surface-base)]" : "border-input"
              }`}
            />
            {t(key)}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-dashed border-input pt-2.5">{t("landing.features.noteComment")}</p>
    </div>
  );
}
```

`frontend/src/features/landing/previews/ImportPreview.tsx`:

```tsx
import { useI18n } from "@/i18n";
import { formatPlain } from "../format";

export function ImportPreview() {
  const { t, locale } = useI18n();
  const [header, ...rows] = t("landing.features.importCsv").split("\n");
  return (
    <div className="grid gap-2.5 rounded-md border bg-card px-3 py-2.5">
      <pre className="m-0 overflow-x-auto font-mono text-xs leading-[1.7] text-muted-foreground">
        {header}
        {"\n"}
        <b className="font-semibold text-foreground">{rows[0]}</b>
        {"\n"}
        {rows[1]}
      </pre>
      <div className="grid w-max grid-cols-[3.5rem_auto_auto] gap-x-3 gap-y-1 font-mono text-[12.5px]">
        <span>BUY</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-profit">Long</span>
        <span>SELL</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-loss">Short</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
        <span>{t("landing.features.importOk", { n: formatPlain(128, locale) })}</span>
        <span className="text-loss">{t("landing.features.importErrors", { n: formatPlain(2, locale) })}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tạo `frontend/src/features/landing/FeatureShowcase.tsx`**

```tsx
import type { ReactNode } from "react";
import { useI18n, type TranslationKey } from "@/i18n";
import { ChallengePreview } from "./previews/ChallengePreview";
import { DashboardPreview } from "./previews/DashboardPreview";
import { ImportPreview } from "./previews/ImportPreview";
import { NotePreview } from "./previews/NotePreview";
import { PeriodPreview } from "./previews/PeriodPreview";

const GROUPS: TranslationKey[] = [
  "landing.features.groupEquity",
  "landing.features.groupSetup",
  "landing.features.groupSymbol",
  "landing.features.groupTimeframe",
  "landing.features.groupDirection",
  "landing.features.groupWeekday",
  "landing.features.groupWeek",
  "landing.features.groupDay",
  "landing.features.groupHeatmap",
  "landing.features.groupR",
  "landing.features.groupHold",
  "landing.features.groupRadar",
  "landing.features.groupTheory",
];

const CARDS: [TranslationKey, TranslationKey, () => ReactNode][] = [
  ["landing.features.challengeTitle", "landing.features.challengeBody", () => <ChallengePreview />],
  ["landing.features.periodTitle", "landing.features.periodBody", () => <PeriodPreview />],
  ["landing.features.noteTitle", "landing.features.noteBody", () => <NotePreview />],
  ["landing.features.importTitle", "landing.features.importBody", () => <ImportPreview />],
];

/** Khung "màn hình" quanh một hình minh hoạ. role="img" + tên để trình đọc màn hình không đọc từng số mẫu. */
function Screen({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div
      role="img"
      aria-label={t("landing.features.previewLabel", { name })}
      className="grid min-w-0 gap-2.5 rounded-lg border bg-surface-sunken p-3"
    >
      {children}
    </div>
  );
}

export function FeatureShowcase() {
  const { t } = useI18n();
  const dashboard = t("landing.features.dashboardTitle");
  return (
    <section id="features" className="border-t py-[72px]">
      <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.16] font-semibold tracking-[-0.02em] text-balance">
        {t("landing.features.title1")}
        <br />
        {t("landing.features.title2")}
      </h2>
      <p className="mt-3.5 max-w-[36em] text-[18px] text-muted-foreground">{t("landing.features.intro")}</p>

      <div className="mt-10 grid gap-5">
        <article className="grid min-w-0 gap-6 rounded-[10px] border bg-card p-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-8 lg:p-7">
          <div>
            <h3 className="font-display text-[24px] leading-[1.22] font-semibold">{dashboard}</h3>
            <p className="mt-2.5 text-muted-foreground">
              <strong className="font-semibold text-foreground">{t("landing.features.dashboardStrong")}</strong>{" "}
              {t("landing.features.dashboardBody")}
            </p>
            <ul aria-label={t("landing.features.groupsLabel")} className="mt-[18px] flex list-none flex-wrap gap-1.5 p-0">
              {GROUPS.map((key) => (
                <li key={key} className="rounded bg-surface-sunken px-2 py-0.5 text-[13px]">
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <Screen name={dashboard}>
            <DashboardPreview />
          </Screen>
        </article>

        <div className="grid gap-5 md:grid-cols-2">
          {CARDS.map(([titleKey, bodyKey, preview]) => (
            <article key={titleKey} className="grid min-w-0 content-start gap-[18px] rounded-[10px] border bg-card p-6">
              <div>
                <h3 className="font-display text-[20px] leading-[1.22] font-semibold">{t(titleKey)}</h3>
                <p className="mt-1.5 text-muted-foreground">{t(bodyKey)}</p>
              </div>
              <Screen name={t(titleKey)}>{preview()}</Screen>
            </article>
          ))}
        </div>
      </div>

      <p className="mt-7 max-w-[52em] text-[15px] text-muted-foreground">
        <strong className="font-semibold text-foreground">{t("landing.features.extrasLead")}</strong>{" "}
        {t("landing.features.extras")}
      </p>
      <p className="mt-3 max-w-[52em] text-[15px] text-muted-foreground">{t("landing.features.origin")}</p>
    </section>
  );
}
```

Trong `LandingPage.tsx`, đặt `<FeatureShowcase />` ngay sau `<ScoringSection />`.

- [ ] **Step 5: Chạy test**

Run: `npx vitest run src/features/landing/ && npx tsc --noEmit && npx vitest run src/test/styleguard.test.ts`
Expected: PASS. Nếu styleguard bắt `"KHÔNG CÓ SETUP"` — chuỗi đó chỉ được xuất hiện trong
file test; component lấy nó từ `enums.default_setup`.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(landing): khối tính năng kèm hình minh hoạ màn hình app

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Hỏi đáp, footer, OG, đo lượt xem, E2E và kiểm cuối

**Files:**
- Create: `frontend/src/features/landing/Faq.tsx`, `Faq.test.tsx`
- Create: `frontend/src/features/landing/LandingPage.test.tsx`
- Modify: `frontend/src/features/landing/LandingPage.tsx`
- Modify: `frontend/index.html`
- Create: `frontend/public/og.png`
- Create: `frontend/e2e/landing.spec.ts`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `class_bands` (Task 1/7), mọi khối của Task 6–9
- Produces: landing hoàn chỉnh

- [ ] **Step 1: Thêm chuỗi**

```ts
  "landing.faq.title": { vi: "Hỏi đáp", en: "FAQ" },
  "landing.faq.whenQ": { vi: "Khi nào tôi được dùng?", en: "When do I get access?" },
  "landing.faq.whenA": { vi: "Ứng dụng mở theo đợt, theo thứ tự đăng ký. Bạn nhận thư mời qua email đã để lại.", en: "Access opens in batches, in sign-up order. Your invite goes to the email you left." },
  "landing.faq.excelQ": { vi: "Tôi có nhập được nhật ký Excel đang dùng không?", en: "Can I import the Excel journal I use now?" },
  "landing.faq.excelA": { vi: "Có. Xuất file ra CSV rồi nhập vào. Ứng dụng báo rõ dòng nào sai để bạn sửa trước khi lưu.", en: "Yes. Export it to CSV and import it. The app shows which rows are wrong so you can fix them before saving." },
  "landing.faq.scoreQ": { vi: "Chấm điểm dựa trên gì?", en: "How is a trade scored?" },
  "landing.faq.scoreA": { vi: "Bốn tiêu chí, mỗi tiêu chí tối đa 25 điểm. Từ {good} điểm là đúng kế hoạch, {warn} đến dưới {good} là cần cải thiện, {bad} đến dưới {warn} là bốc đồng / FOMO, dưới {bad} là giao dịch trả thù.", en: "Four criteria, up to 25 points each. {good} and up is on plan, {warn} to {good} needs work, {bad} to {warn} is impulsive / FOMO, below {bad} is revenge trading." },
  "landing.faq.priceQ": { vi: "Có mất phí không?", en: "Does it cost anything?" },
  "landing.faq.priceA": { vi: "Người trong danh sách chờ dùng thử miễn phí trong giai đoạn đầu.", en: "People on the waitlist use it free during the early phase." },
  "landing.footer.sample": { vi: "Số liệu trên trang là minh hoạ.", en: "Figures on this page are illustrative." },
```

- [ ] **Step 2: Test hỏng cho hỏi đáp**

Tạo `frontend/src/features/landing/Faq.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { Faq } from "./Faq";

beforeEach(() => resetAll({ loggedIn: false }));

test("the scoring answer interpolates the backend thresholds", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<Faq />);

  await userEvent.click(screen.getByText("Chấm điểm dựa trên gì?"));
  expect(
    await screen.findByText(
      "Bốn tiêu chí, mỗi tiêu chí tối đa 25 điểm. Từ 80 điểm là đúng kế hoạch, 55 đến dưới 80 là cần cải thiện, 30 đến dưới 55 là bốc đồng / FOMO, dưới 30 là giao dịch trả thù.",
    ),
  ).toBeInTheDocument();
});

test("the scoring question is hidden when thresholds are unavailable", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<Faq />);
  expect(screen.getByText("Có mất phí không?")).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("Chấm điểm dựa trên gì?")).not.toBeInTheDocument();
});
```

Run: `npx vitest run src/features/landing/Faq.test.tsx` → FAIL (module chưa có)

- [ ] **Step 3: Tạo `frontend/src/features/landing/Faq.tsx`**

```tsx
import { useI18n, type TranslationKey } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";

function Item({ q, a }: { q: string; a: string }) {
  return (
    <details className="border-t py-4 last:border-b">
      <summary className="flex cursor-pointer list-none justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden after:font-mono after:text-muted-foreground after:content-['+'] [[open]>&]:after:content-['−']">
        {q}
      </summary>
      <p className="mt-2.5 max-w-[40em] text-muted-foreground">{a}</p>
    </details>
  );
}

export function Faq() {
  const { t } = useI18n();
  const { data: enums } = useMetaEnums();
  // Ngưỡng lấy từ backend (scoring.ClassBands), không gõ cứng. Chưa có thì
  // ẩn câu này thay vì hiện một câu trả lời thiếu số.
  const bands = enums ? [...enums.class_bands].sort((a, b) => b.min - a.min) : [];
  const plain: [TranslationKey, TranslationKey][] = [
    ["landing.faq.whenQ", "landing.faq.whenA"],
    ["landing.faq.excelQ", "landing.faq.excelA"],
  ];

  return (
    <section id="faq" className="border-t py-[72px]">
      <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.16] font-semibold tracking-[-0.02em]">
        {t("landing.faq.title")}
      </h2>
      <div className="mt-8 grid max-w-3xl">
        {plain.map(([q, a]) => (
          <Item key={q} q={t(q)} a={t(a)} />
        ))}
        {bands.length >= 3 && (
          <Item
            q={t("landing.faq.scoreQ")}
            a={t("landing.faq.scoreA", { good: bands[0].min, warn: bands[1].min, bad: bands[2].min })}
          />
        )}
        <Item q={t("landing.faq.priceQ")} a={t("landing.faq.priceA")} />
      </div>
    </section>
  );
}
```

Run: `npx vitest run src/features/landing/Faq.test.tsx` → PASS

- [ ] **Step 4: Hoàn thiện `LandingPage.tsx`**

Thêm import:

```tsx
import { Analytics } from "@vercel/analytics/react";
import { Faq } from "./Faq";
import { FeatureShowcase } from "./FeatureShowcase";
import { ScoringSection } from "./ScoringSection";
```

Thứ tự trong `<main>`: `Hero` → `ScoringSection` → `FeatureShowcase` → khối `#signup` → `Faq`.
Sau `</main>` thêm footer:

```tsx
        <footer className="flex flex-wrap justify-between gap-4 border-t pt-8 pb-12 text-sm text-muted-foreground">
          <span>{t("nav.appName")}</span>
          <span>{t("landing.footer.sample")}</span>
        </footer>
```

Và ngay trước thẻ đóng `</div>` ngoài cùng:

```tsx
      {/* Đo lượt xem landing (Vercel Web Analytics, không cookie). Chỉ mount ở
          đây nên không theo dõi người dùng app; chỉ chạy ở bản build. */}
      {import.meta.env.PROD && <Analytics />}
```

- [ ] **Step 5: Test lắp ráp trang**

Tạo `frontend/src/features/landing/LandingPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { LandingPage } from "./LandingPage";

beforeEach(() => {
  resetAll({ loggedIn: false });
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
});

test("renders every section in order with working anchors", () => {
  renderApp(<LandingPage />);
  const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(headings).toEqual([
    "Lý thuyết và thực tế",
    "Bốn câu hỏi sau mỗi lệnh",
    "Nhập lệnh một lần.Ứng dụng tính phần còn lại.",
    "Dùng thử sớm",
    "Hỏi đáp",
  ]);
  for (const id of ["scoring", "features", "faq"]) {
    expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getByRole("link", { name: { scoring: "Chấm điểm", features: "Tính năng", faq: "Hỏi đáp" }[id] })).toHaveAttribute("href", `#${id}`);
  }
  expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
});
```

Run: `npx vitest run src/features/landing/` → PASS

- [ ] **Step 6: Meta chia sẻ trong `frontend/index.html`**

Thêm ngay sau `<title>Nhật ký giao dịch</title>`:

```html
    <meta name="description" content="Nhật ký giao dịch chấm điểm từng lệnh theo kế hoạch: vào lệnh, trong lệnh, thoát lệnh và tâm lý. Đang nhận đăng ký dùng thử." />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="vi_VN" />
    <meta property="og:title" content="Lệnh lãi chưa chắc là lệnh đúng." />
    <meta property="og:description" content="Nhật ký chấm điểm từng lệnh theo kế hoạch của bạn. Đang nhận đăng ký dùng thử." />
    <meta property="og:image" content="/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
```

- [ ] **Step 7: Chụp `public/og.png`**

Chạy vite trên host (container :5173 là bản build cũ, không thấy code mới):

```bash
export PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH
cd frontend && npx vite --port 5199 --strictPort &
```

Tạo script tạm trong scratchpad (không commit), chạy bằng node v22:

```js
import { chromium } from "/Users/mac/Workspace/MyDocuments/trading-journal-web-app/frontend/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.addInitScript(() => localStorage.setItem("journal.theme", "light"));
await p.goto("http://localhost:5199/");
await p.waitForTimeout(2500); // chờ hiệu ứng vẽ đường xong
await p.screenshot({ path: "/Users/mac/Workspace/MyDocuments/trading-journal-web-app/frontend/public/og.png" });
await b.close();
```

`/meta/enums` cần API: nếu API không chạy, chú thích biểu đồ thiếu nhãn — chấp nhận được cho
ảnh OG, nhưng tốt hơn là chạy kèm API theo ghi chú "UI review env" (DB tạm :55432 + API :8099,
`VITE_PROXY_TARGET=http://localhost:8099`). Mở `og.png` ra xem: phải thấy tiêu đề hero và
biểu đồ, không bị cắt. Tắt vite sau khi chụp.

- [ ] **Step 8: E2E hành trình đăng ký**

Tạo `frontend/e2e/landing.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Landing trên stack thật. Chạy SAU auth.spec.ts (thứ tự chữ cái), không cần
 * user: chỉ đi qua hai endpoint công khai.
 *
 * Phần MSW không thay thế được: backend thật chuẩn hoá email và giữ dòng
 * đầu tiên, nên đăng ký lại với chữ hoa vẫn ra cùng một phản hồi.
 */
test("a visitor joins the waitlist and answers the questions", async ({ page }) => {
  await page.goto("/?ref=e2e");
  await expect(page.getByRole("heading", { level: 1, name: "Lệnh lãi chưa chắc là lệnh đúng." })).toBeVisible();

  const hero = page.getByTestId("hero-signup");
  await hero.getByLabel("Email").fill("Khach@Example.com");
  await hero.getByRole("button", { name: "Vào danh sách chờ" }).click();
  await expect(hero.getByText("Thư mời sẽ gửi tới Khach@Example.com.")).toBeVisible();

  await hero.getByText("Excel / Google Sheets").click();
  await hero.getByText("Crypto").click();
  await hero.getByText("Đang thi").click();
  await hero.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(hero.getByText("Đã lưu câu trả lời.")).toBeVisible();

  // Đăng ký lại cùng email (khác hoa thường) qua API: phản hồi y hệt lần đầu.
  const again = await page.request.post("/api/waitlist", {
    data: { email: "khach@example.com", locale: "vi", source: "", website: "" },
  });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ code: 0, msg: "ok", data: { joined: true } });
});

test("the scoring ticket loads its labels from the real backend", async ({ page }) => {
  await page.goto("/");
  const ticket = page.getByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });
  await expect(ticket.getByTestId("ticket-total")).toHaveText("35/100");
  await ticket.getByRole("group", { name: "Vào lệnh" }).getByText("Đúng kế hoạch").click();
  await expect(ticket.getByTestId("ticket-total")).toHaveText("50/100");
});
```

Run: `make e2e`
Expected: `auth.spec.ts` (bước 1 đã sửa) và `landing.spec.ts` đều PASS.

- [ ] **Step 9: Kiểm cuối (bắt buộc trước khi báo xong)**

1. `make test && make lint && make test-fe` → tất cả PASS.
2. Chunk landing không kéo Recharts/Quill:

   ```bash
   cd frontend && npm run build
   ls dist/assets | grep -i landing
   grep -l "recharts\|quill" dist/assets/LandingPage-*.js || echo "clean"
   ```

   Expected: in ra `clean`.
3. Utility mới có thật trong CSS build:

   ```bash
   for c in text-loss bg-cta text-cta-foreground font-display; do
     printf "%s " "$c"; grep -c "\.$c" dist/assets/*.css | paste -sd+ - | bc
   done
   ```

   Expected: mỗi lớp ≥ 1.
4. Chụp landing ở 1280px và 390px, cả hai theme (vite :5199 + API như Step 7). Kiểm: không
   tràn ngang (`document.documentElement.scrollWidth === innerWidth`), font tiêu đề là
   IBM Plex Sans (`getComputedStyle(h1).fontFamily`), dấu tiếng Việt không bị cắt.
5. Đo tương phản trong Playwright bằng `getComputedStyle` (ảnh dark xem qua Read hiện sai màu —
   đừng phán bằng mắt): chữ `text-loss`, chữ trên nút `bg-cta`, chữ `ticket-class` khi loại là
   "Cần cải thiện" — cả hai theme, mỗi cặp ≥ 4,5:1. Dưới ngưỡng thì xử lý theo lưu ý ở Task 7
   Step 7 rồi đo lại.
6. Dọn: tắt vite, xoá container DB tạm nếu đã dựng.

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat(landing): hỏi đáp, footer, meta chia sẻ, đo lượt xem và E2E

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Sau khi merge (việc của chủ sản phẩm, không phải code)

- Chạy migration `0007` trên Supabase trước khi deploy (`docs/deployment-vercel-supabase.md`).
- Bật Web Analytics trong project Vercel.
- Gắn nguồn vào link chia sẻ từng group: `https://<domain>/?ref=fb-group-forex`.
- Đọc kết quả bằng SQL ở §8 của spec.
