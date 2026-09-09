# Mẫu ghi chú (note templates) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng lưu được các mẫu checklist ghi chú và chèn vào ô Ghi chú của form nhập lệnh bằng một cú bấm.

**Architecture:** Template là một khối HTML phẳng (`body_html`) cùng định dạng với cột `notes` đang có, thuộc về **user** (không thuộc account), xoá cứng. Backend đi đúng 5 tầng của repo: domain rules thuần → repository GORM → seam interface trong `service/store.go` (hai adapter ghim bằng contract test) → service dịch lỗi sang `apperr` → handler. Frontend chèn mẫu bằng cách nối HTML rồi bump `editorKey` để `RichTextEditor` dựng lại — không sửa một dòng nào trong component dùng chung đó.

**Tech Stack:** Go 1.23, chi, GORM, PostgreSQL 16, migrate/migrate v4.17.1 · Vite + React 19 + TypeScript, TanStack Query v5, radix-ui, Tailwind v4, MSW + Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-09-note-templates-design.md`](../specs/2026-09-09-note-templates-design.md)

## Global Constraints

- **Code tiếng Anh, comment tiếng Việt** (CLAUDE.md quy tắc 9). Mọi định danh — biến, hàm, kiểu, package, file, key JSON, tên cột DB, route, message log — tiếng Anh. Comment và tài liệu tiếng Việt. Ngoại lệ: **message lỗi trả cho người dùng** và **text UI** là tiếng Việt, vì đó là dữ liệu hiển thị (xem `service/account.go:69` làm mẫu).
- **KHÔNG commit.** Quy tắc cá nhân của chủ repo: không chạy `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, `git stash`, `git checkout`/`switch`. Mỗi task kết ở **"test pass"**, để nguyên working tree unstaged. Chủ repo tự review và commit.
- **Không lưu trường suy diễn** (quy tắc 2). Không áp dụng nhiều ở feature này, nhưng `position` là do backend cấp, không phải suy diễn — nó được lưu thật.
- **Soft delete chỉ cho `trades`** (quy tắc 6). `note_templates` xoá **cứng**, giống `cash_flows`.
- **`position` do backend cấp; frontend gửi lên thì bỏ qua** (quy tắc 7, giống `stt`).
- **Package thuần cấm import GORM/net-http/database-sql/context** (quy tắc 3): áp cho `internal/domain`. `internal/service` được import `context` (nó đã import sẵn) nhưng **không** được import GORM.
- **Theme:** chỉ dùng biến ngữ nghĩa (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`), không hardcode hex. Theme tắt hết `shadow-*` — phân tầng bằng border và bậc surface.
- **Giới hạn:** `MaxTemplateNameLen = 120`, `MaxTemplateBodyLen = 64 * 1024`.
- **Chạy test:** `make test` (Go, cần Docker) · `make test-pure` (Go thuần, không cần Docker) · `cd frontend && npx tsc --noEmit && npm run build` · `cd frontend && npx vitest run <path>`.
- **Sanitize:** backend **không** sanitize `body_html`, chỉ kiểm độ dài. FE sanitize lúc gửi và lúc render (spec §7). Không tự ý thêm sanitizer server-side cho riêng feature này.

---

## File Structure

**Backend (tạo mới):**

| File | Trách nhiệm |
|---|---|
| `backend/migrations/0003_note_templates.up.sql` | bảng + 2 index |
| `backend/migrations/0003_note_templates.down.sql` | drop bảng |
| `backend/internal/domain/note_template_rules.go` | validate thuần + hằng giới hạn |
| `backend/internal/domain/note_template_rules_test.go` | table-driven |
| `backend/internal/repository/notetemplate.go` | GORM, mọi query lọc theo `user_id` |
| `backend/internal/repository/notetemplate_test.go` | Postgres thật |
| `backend/internal/service/notetemplate.go` | dịch lỗi repo → `apperr` |
| `backend/internal/service/notetemplate_test.go` | trên adapter in-memory |
| `backend/internal/httpapi/notetemplate_handler.go` | 5 route + DTO |
| `backend/internal/httpapi/notetemplate_handler_test.go` | end-to-end qua httptest |

**Backend (sửa):**

| File | Sửa gì |
|---|---|
| `backend/internal/domain/models.go` | thêm struct `NoteTemplate` |
| `backend/internal/service/store.go` | thêm interface `NoteTemplateStore` |
| `backend/internal/service/memstore_test.go` | thêm `memNoteTemplateStore` |
| `backend/internal/service/store_contract_test.go` | thêm contract + 2 hàm Test |
| `backend/internal/httpapi/router.go` | thêm `Deps.NoteTemplate` + mount 5 route |
| `backend/cmd/api/main.go` | nối repo → service → Deps |

**Frontend (tạo mới):**

| File | Trách nhiệm |
|---|---|
| `frontend/src/components/ui/dropdown-menu.tsx` | bọc `DropdownMenu` của radix-ui theo khuôn `popover.tsx` |
| `frontend/src/features/noteTemplates/types.ts` | 3 type |
| `frontend/src/features/noteTemplates/hooks.ts` | 1 query + 4 mutation |
| `frontend/src/features/noteTemplates/hooks.test.tsx` | MSW |
| `frontend/src/features/noteTemplates/TemplateMenu.tsx` | dropdown "Chèn mẫu" |
| `frontend/src/features/noteTemplates/templateMenu.test.tsx` | |
| `frontend/src/features/noteTemplates/TemplateManagerDialog.tsx` | CRUD |
| `frontend/src/features/noteTemplates/templateManagerDialog.test.tsx` | gồm ca Esc |

**Frontend (sửa):**

| File | Sửa gì |
|---|---|
| `frontend/src/lib/queryKeys.ts` | thêm `noteTemplates` |
| `frontend/src/i18n/strings.ts` | ~18 chuỗi mới (vi + en) |
| `frontend/src/features/trades/TradeFormDialog.tsx` | `insertTemplate` + gắn `TemplateMenu` |
| `frontend/src/features/trades/tradeForm.test.tsx` | 3 ca mới |

**Thứ tự phụ thuộc:** Task 1 → 2 → 3 → 4 → 5 (backend xong, API chạy) → 6 → 7 → 8 → 9 (frontend).

---

### Task 1: Migration + domain model + validate rules

Tầng đáy: bảng, struct, và luật thuần. Không có gì phụ thuộc tầng khác nên đây là task đầu.

**Files:**
- Create: `backend/migrations/0003_note_templates.up.sql`
- Create: `backend/migrations/0003_note_templates.down.sql`
- Create: `backend/internal/domain/note_template_rules.go`
- Test: `backend/internal/domain/note_template_rules_test.go`
- Modify: `backend/internal/domain/models.go` (thêm struct vào cuối file)

**Interfaces:**
- Consumes: không có (task đầu).
- Produces:
  - `domain.NoteTemplate` struct — trường `ID, UserID int64`, `Name, BodyHTML string`, `Position int`, `CreatedAt, UpdatedAt time.Time`
  - `domain.MaxTemplateNameLen = 120`, `domain.MaxTemplateBodyLen = 64 * 1024`
  - `domain.ValidateNoteTemplate(t *NoteTemplate) error` — trim tại chỗ rồi kiểm; trả `*apperr.Error` 400 khi sai

- [ ] **Step 1: Viết test fail trước**

Tạo `backend/internal/domain/note_template_rules_test.go`:

```go
package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestValidateNoteTemplate(t *testing.T) {
	cases := []struct {
		name    string
		in      domain.NoteTemplate
		wantErr bool
	}{
		{
			name: "hợp lệ",
			in:   domain.NoteTemplate{Name: "Setup A", BodyHTML: "<p>x</p>"},
		},
		{
			name:    "tên rỗng",
			in:      domain.NoteTemplate{Name: "", BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name:    "tên toàn khoảng trắng",
			in:      domain.NoteTemplate{Name: "   \t ", BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name:    "tên quá dài",
			in:      domain.NoteTemplate{Name: strings.Repeat("a", domain.MaxTemplateNameLen+1), BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name: "tên dài đúng bằng giới hạn thì được",
			in:   domain.NoteTemplate{Name: strings.Repeat("a", domain.MaxTemplateNameLen), BodyHTML: "<p>x</p>"},
		},
		{
			name:    "thân rỗng",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: ""},
			wantErr: true,
		},
		{
			name:    "thân chỉ có đoạn rỗng của Quill",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: "   "},
			wantErr: true,
		},
		{
			name:    "thân quá dài",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: strings.Repeat("x", domain.MaxTemplateBodyLen+1)},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.in
			err := domain.ValidateNoteTemplate(&in)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

// Trim phải GHI LẠI vào con trỏ, không chỉ dùng để kiểm: nếu chỉ kiểm thì
// khoảng trắng đầu/cuối vẫn xuống DB, và "Setup A " với "Setup A" thành hai
// mẫu khác nhau dù UNIQUE index dùng lower() vẫn coi chúng là hai.
func TestValidateNoteTemplateGhiLaiGiaTriDaTrim(t *testing.T) {
	in := domain.NoteTemplate{Name: "  Setup A  ", BodyHTML: "  <p>x</p>  "}

	require.NoError(t, domain.ValidateNoteTemplate(&in))

	require.Equal(t, "Setup A", in.Name)
	require.Equal(t, "<p>x</p>", in.BodyHTML)
}
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd backend && go test ./internal/domain/ -run TestValidateNoteTemplate -count=1`
Expected: FAIL — compile error `undefined: domain.NoteTemplate`, `undefined: domain.ValidateNoteTemplate`.

- [ ] **Step 3: Thêm struct vào `models.go`**

Thêm vào cuối `backend/internal/domain/models.go`:

```go
// NoteTemplate là một khung ghi chú tái sử dụng được, thuộc về USER chứ không
// thuộc account: checklist vào lệnh không phụ thuộc tài khoản nào, tạo một lần
// dùng ở mọi account.
//
// BodyHTML lưu ĐÚNG định dạng của cột trades.notes — HTML của Quill — nên chèn
// mẫu vào ghi chú chỉ là nối chuỗi, không cần tầng dịch nào ở giữa.
type NoteTemplate struct {
	ID        int64
	UserID    int64
	Name      string
	BodyHTML  string
	Position  int
	CreatedAt time.Time
	UpdatedAt time.Time
}
```

Nếu `models.go` chưa import `time` thì thêm; kiểm bằng `grep -n '"time"' internal/domain/models.go`.

- [ ] **Step 4: Viết `note_template_rules.go`**

Tạo `backend/internal/domain/note_template_rules.go`:

```go
package domain

import (
	"fmt"
	"strings"

	"journal/internal/apperr"
)

// Giới hạn độ dài. MaxTemplateBodyLen là hàng rào chống phình to, KHÔNG phải
// hàng rào an ninh: backend cố ý không sanitize HTML (xem spec §7), việc đó do
// frontend làm cả lúc lưu và lúc render, đúng như cột trades.notes đang làm.
const (
	MaxTemplateNameLen = 120
	MaxTemplateBodyLen = 64 * 1024
)

// ValidateNoteTemplate kiểm và CHUẨN HOÁ tại chỗ.
//
// Ghi giá trị đã trim trở lại con trỏ, giống ValidateTrade làm với Notes: chỉ
// kiểm mà không ghi lại thì khoảng trắng đầu/cuối vẫn xuống DB.
func ValidateNoteTemplate(t *NoteTemplate) error {
	t.Name = strings.TrimSpace(t.Name)
	t.BodyHTML = strings.TrimSpace(t.BodyHTML)

	if t.Name == "" {
		return apperr.Validation("tên mẫu không được để trống")
	}
	if len(t.Name) > MaxTemplateNameLen {
		return apperr.Validation(fmt.Sprintf("tên mẫu dài quá %d ký tự", MaxTemplateNameLen))
	}
	if t.BodyHTML == "" {
		return apperr.Validation("nội dung mẫu không được để trống")
	}
	if len(t.BodyHTML) > MaxTemplateBodyLen {
		return apperr.Validation(fmt.Sprintf("nội dung mẫu dài quá %d ký tự", MaxTemplateBodyLen))
	}
	return nil
}
```

**ĐÃ KIỂM (2026-09-09) — dùng bản dưới, không dùng bản `apperr` ở trên.**
`internal/domain` **không** import `apperr` ở bất kỳ đâu, và `trade_rules.go:19`
nói rõ *"Package vẫn THUẦN: chỉ strings và fmt, không hạ tầng"*. Thêm import đó phá
quy tắc 3. Khuôn thật của repo: domain trả lỗi thường, service bọc thành
`apperr.Validation(err.Error())` — xem `service/trade.go:141-143`.

Vì vậy `note_template_rules.go` **không** import `apperr`; thay hai dòng
`apperr.Validation(...)` bằng lỗi thường:

```go
package domain

import (
	"fmt"
	"strings"
)

// Giới hạn độ dài. MaxTemplateBodyLen là hàng rào chống phình to, KHÔNG phải
// hàng rào an ninh: backend cố ý không sanitize HTML (xem spec §7), việc đó do
// frontend làm cả lúc lưu và lúc render, đúng như cột trades.notes đang làm.
const (
	MaxTemplateNameLen = 120
	MaxTemplateBodyLen = 64 * 1024
)

// ErrTemplateNameEmpty và bạn bè là lỗi của những trường bắt buộc, đặt tên
// theo đúng khuôn ErrSymbolEmpty của trade_rules.go.
var (
	ErrTemplateNameEmpty = fmt.Errorf("tên mẫu không được để trống")
	ErrTemplateBodyEmpty = fmt.Errorf("nội dung mẫu không được để trống")
)

// ValidateNoteTemplate kiểm và CHUẨN HOÁ tại chỗ.
//
// Ghi giá trị đã trim trở lại con trỏ, giống ValidateTrade làm với Notes: chỉ
// kiểm mà không ghi lại thì khoảng trắng đầu/cuối vẫn xuống DB.
//
// Trả lỗi THƯỜNG, không phải *apperr.Error: package này thuần (quy tắc 3), nên
// việc dịch sang 400 là của service — xem service/trade.go:141.
func ValidateNoteTemplate(t *NoteTemplate) error {
	t.Name = strings.TrimSpace(t.Name)
	t.BodyHTML = strings.TrimSpace(t.BodyHTML)

	if t.Name == "" {
		return ErrTemplateNameEmpty
	}
	if len(t.Name) > MaxTemplateNameLen {
		return fmt.Errorf("tên mẫu dài quá %d ký tự", MaxTemplateNameLen)
	}
	if t.BodyHTML == "" {
		return ErrTemplateBodyEmpty
	}
	if len(t.BodyHTML) > MaxTemplateBodyLen {
		return fmt.Errorf("nội dung mẫu dài quá %d ký tự", MaxTemplateBodyLen)
	}
	return nil
}
```

**Hệ quả cho Task 3:** `service.Create` và `service.Update` phải bọc
`domain.ValidateNoteTemplate` bằng `apperr.Validation(err.Error())`, y như
`tradeFromInput` đang làm.

- [ ] **Step 5: Viết migration**

`backend/migrations/0003_note_templates.up.sql`:

```sql
CREATE TABLE note_templates (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    body_html  TEXT        NOT NULL,
    position   INT         NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trùng tên là lỗi người dùng cần THẤY, không phải hai mẫu giống nhau nằm im
-- cạnh nhau. lower() để "Setup A" và "setup a" là một.
CREATE UNIQUE INDEX note_templates_user_name ON note_templates (user_id, lower(name));

-- Danh sách luôn đọc theo đúng thứ tự này.
CREATE INDEX note_templates_user_pos ON note_templates (user_id, position, id);
```

`backend/migrations/0003_note_templates.down.sql`:

```sql
DROP TABLE note_templates;
```

- [ ] **Step 6: Chạy test để chắc nó pass**

Run: `cd backend && go test ./internal/domain/ -run TestValidateNoteTemplate -count=1 -v`
Expected: PASS, 10 subtest xanh.

- [ ] **Step 7: Kiểm migration chạy thật trên Postgres**

Run: `cd backend && go test ./internal/testdb/ -count=1` — nếu package này không có test, thay bằng `cd backend && go test ./internal/repository/ -run TestAccount -count=1`.
Expected: PASS. `testdb.New` glob mọi `*.up.sql` và chạy theo thứ tự tên, nên `0003` bị áp dụng ở đây; migration sai cú pháp sẽ làm mọi test repository đỏ.

- [ ] **Step 8: Cổng chặn**

Run: `cd backend && gofmt -l . && go vet ./...`
Expected: `gofmt -l` không in file nào, `go vet` không báo gì.

- [ ] **Step 9: Dừng ở đây — KHÔNG commit**

Để nguyên working tree unstaged. Báo file đã đổi.

---

### Task 2: Repository + contract test hai adapter

**Files:**
- Create: `backend/internal/repository/notetemplate.go`
- Test: `backend/internal/repository/notetemplate_test.go`
- Modify: `backend/internal/service/store.go` (thêm interface)
- Modify: `backend/internal/service/memstore_test.go` (thêm adapter in-memory)
- Modify: `backend/internal/service/store_contract_test.go` (thêm contract + 2 hàm Test)

**Interfaces:**
- Consumes: `domain.NoteTemplate` (Task 1).
- Produces:
  - `repository.NewNoteTemplateRepo(db *gorm.DB) *NoteTemplateRepo`
  - `service.NoteTemplateStore` interface với 5 method:
    - `ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error)`
    - `Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error)`
    - `UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error`
    - `DeleteOwned(ctx context.Context, id, userID int64) error`
    - `ReorderOwned(ctx context.Context, userID int64, ids []int64) error`

- [ ] **Step 1: Viết contract test fail trước**

Thêm vào cuối `backend/internal/service/store_contract_test.go`:

```go
// ─────────────────────────────────────────────────────────────────────────
// NoteTemplateStore

func sampleTemplate(userID int64, name string) domain.NoteTemplate {
	return domain.NoteTemplate{UserID: userID, Name: name, BodyHTML: "<p>" + name + "</p>"}
}

// noteTemplateStoreContract là bộ khẳng định dùng chung cho hai adapter.
//
// eachStore trả store rỗng kèm HAI user id: mọi method của seam này nhận
// userID và tự lọc theo nó, nên phần quan trọng nhất của hợp đồng là "user B
// không chạm được mẫu của user A" — cần hai user thật để kiểm.
func noteTemplateStoreContract(
	t *testing.T,
	eachStore func(t *testing.T) (service.NoteTemplateStore, int64, int64),
) {
	t.Run("position cấp tuần tự từ 1", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		for i, want := range []int{1, 2, 3} {
			got, err := st.Create(newCtx(), sampleTemplate(userA, "M"+itoaInt(i)))
			require.NoError(t, err)
			require.Equal(t, want, got.Position, "mẫu thứ %d", i+1)
		}
	})

	t.Run("position do người gọi đặt bị ghi đè", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		in := sampleTemplate(userA, "A")
		in.Position = 999
		got, err := st.Create(newCtx(), in)
		require.NoError(t, err)
		require.Equal(t, 1, got.Position)
	})

	t.Run("position đếm riêng theo từng user", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		_, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)
		gotB, err := st.Create(newCtx(), sampleTemplate(userB, "B"))
		require.NoError(t, err)
		require.Equal(t, 1, gotB.Position, "mẫu đầu của user B phải là 1, không phải 2")
	})

	t.Run("trùng tên trong cùng user trả ErrDuplicate", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		_, err := st.Create(newCtx(), sampleTemplate(userA, "Setup A"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTemplate(userA, "Setup A"))
		require.ErrorIs(t, err, repository.ErrDuplicate)
	})

	t.Run("trùng tên khác hoa thường vẫn là trùng", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		_, err := st.Create(newCtx(), sampleTemplate(userA, "Setup A"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTemplate(userA, "setup a"))
		require.ErrorIs(t, err, repository.ErrDuplicate)
	})

	t.Run("hai user trùng tên nhau thì KHÔNG phải trùng", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		_, err := st.Create(newCtx(), sampleTemplate(userA, "Setup A"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTemplate(userB, "Setup A"))
		require.NoError(t, err)
	})

	t.Run("ListByUser sắp theo position và chỉ trả mẫu của user đó", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		_, err := st.Create(newCtx(), sampleTemplate(userA, "A1"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTemplate(userA, "A2"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTemplate(userB, "B1"))
		require.NoError(t, err)

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Len(t, rows, 2)
		require.Equal(t, "A1", rows[0].Name)
		require.Equal(t, "A2", rows[1].Name)
	})

	t.Run("ListByUser của user chưa có mẫu trả slice rỗng, không lỗi", func(t *testing.T) {
		st, _, userB := eachStore(t)
		rows, err := st.ListByUser(newCtx(), userB)
		require.NoError(t, err)
		require.Empty(t, rows)
	})

	t.Run("UpdateOwned sửa được mẫu của mình", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		created, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)

		require.NoError(t, st.UpdateOwned(newCtx(), created.ID, userA, map[string]any{"name": "A đã sửa"}))

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		require.Equal(t, "A đã sửa", rows[0].Name)
	})

	t.Run("UpdateOwned mẫu của user khác trả ErrNotFound", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		created, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)

		err = st.UpdateOwned(newCtx(), created.ID, userB, map[string]any{"name": "cướp"})
		require.ErrorIs(t, err, repository.ErrNotFound)

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Equal(t, "A", rows[0].Name, "mẫu của A không được đổi")
	})

	t.Run("DeleteOwned xoá được mẫu của mình", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		created, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)

		require.NoError(t, st.DeleteOwned(newCtx(), created.ID, userA))

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Empty(t, rows)
	})

	t.Run("DeleteOwned lần hai trả ErrNotFound", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		created, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)
		require.NoError(t, st.DeleteOwned(newCtx(), created.ID, userA))
		require.ErrorIs(t, st.DeleteOwned(newCtx(), created.ID, userA), repository.ErrNotFound)
	})

	t.Run("DeleteOwned mẫu của user khác trả ErrNotFound và không xoá", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		created, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)

		require.ErrorIs(t, st.DeleteOwned(newCtx(), created.ID, userB), repository.ErrNotFound)

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Len(t, rows, 1, "mẫu của A phải còn nguyên")
	})

	t.Run("ReorderOwned gán lại position theo thứ tự mảng", func(t *testing.T) {
		st, userA, _ := eachStore(t)
		a, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)
		b, err := st.Create(newCtx(), sampleTemplate(userA, "B"))
		require.NoError(t, err)
		c, err := st.Create(newCtx(), sampleTemplate(userA, "C"))
		require.NoError(t, err)

		require.NoError(t, st.ReorderOwned(newCtx(), userA, []int64{c.ID, a.ID, b.ID}))

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		require.Equal(t, []string{"C", "A", "B"}, []string{rows[0].Name, rows[1].Name, rows[2].Name})
		require.Equal(t, []int{1, 2, 3}, []int{rows[0].Position, rows[1].Position, rows[2].Position})
	})

	t.Run("ReorderOwned chứa id của user khác thì KHÔNG đổi gì", func(t *testing.T) {
		st, userA, userB := eachStore(t)
		a, err := st.Create(newCtx(), sampleTemplate(userA, "A"))
		require.NoError(t, err)
		foreign, err := st.Create(newCtx(), sampleTemplate(userB, "B"))
		require.NoError(t, err)

		err = st.ReorderOwned(newCtx(), userA, []int64{foreign.ID, a.ID})
		require.Error(t, err)

		rows, err := st.ListByUser(newCtx(), userA)
		require.NoError(t, err)
		require.Equal(t, 1, rows[0].Position, "A phải giữ nguyên position 1")
	})
}

func itoaInt(n int) string { return strconv.Itoa(n) }

func TestNoteTemplateStoreContract_InMemory(t *testing.T) {
	noteTemplateStoreContract(t, func(t *testing.T) (service.NoteTemplateStore, int64, int64) {
		return newMemNoteTemplateStore(), 1, 2
	})
}

func TestNoteTemplateStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	noteTemplateStoreContract(t, func(t *testing.T) (service.NoteTemplateStore, int64, int64) {
		db := testdb.New(t)
		users := repository.NewUserRepo(db)
		a, err := users.Create(newCtx(), "tplA@example.com", "hash")
		require.NoError(t, err)
		b, err := users.Create(newCtx(), "tplB@example.com", "hash")
		require.NoError(t, err)
		return repository.NewNoteTemplateRepo(db), a.ID, b.ID
	})
}
```

Thêm `"strconv"` vào import của file này nếu chưa có.

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd backend && go test ./internal/service/ -run TestNoteTemplateStoreContract -count=1`
Expected: FAIL — compile error `undefined: service.NoteTemplateStore`, `undefined: newMemNoteTemplateStore`, `undefined: repository.NewNoteTemplateRepo`.

- [ ] **Step 3: Thêm seam interface vào `store.go`**

Thêm vào `backend/internal/service/store.go`:

```go
// NoteTemplateStore là nơi cất mẫu ghi chú.
//
// Mọi method nhận userID và TỰ lọc theo nó: quyền sở hữu là phần của HỢP ĐỒNG,
// không phải việc service phải nhớ kiểm. Thao tác lên mẫu của người khác trả
// repository.ErrNotFound — cố ý không phải Forbidden, để không tiết lộ rằng
// mẫu đó có tồn tại.
//
// Ba hành vi là hợp đồng, không phải chi tiết cài đặt:
//
//  1. ListByUser sắp theo (position ASC, id ASC) và chỉ trả mẫu của user đó.
//  2. Create cấp position = max(position)+1 TRONG PHẠM VI user, ghi đè giá trị
//     người gọi đặt (quy tắc 7). Trùng (user_id, lower(name)) → ErrDuplicate.
//  3. ReorderOwned là ALL-OR-NOTHING: mảng chứa một id không thuộc user thì
//     không mẫu nào bị đổi.
type NoteTemplateStore interface {
	ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error)
	Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error)
	UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error
	DeleteOwned(ctx context.Context, id, userID int64) error
	ReorderOwned(ctx context.Context, userID int64, ids []int64) error
}
```

- [ ] **Step 4: Viết repo GORM**

Tạo `backend/internal/repository/notetemplate.go`:

```go
package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type NoteTemplateRepo struct{ db *gorm.DB }

func NewNoteTemplateRepo(db *gorm.DB) *NoteTemplateRepo { return &NoteTemplateRepo{db: db} }

func (r *NoteTemplateRepo) ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error) {
	var rows []domain.NoteTemplate
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("position ASC, id ASC").
		Find(&rows).Error
	return rows, translate(err)
}

// Create cấp position trong TRANSACTION.
//
// max(position)+1 là một lượt đọc-rồi-ghi: hai request song song của cùng một
// user mà không có tx sẽ đọc cùng một max và cấp cùng một position.
func (r *NoteTemplateRepo) Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var maxPos *int
		if err := tx.Model(&domain.NoteTemplate{}).
			Where("user_id = ?", t.UserID).
			Select("MAX(position)").
			Scan(&maxPos).Error; err != nil {
			return err
		}
		// Người gọi đặt Position thì bỏ qua — quy tắc 7, giống stt của trade.
		t.Position = 1
		if maxPos != nil {
			t.Position = *maxPos + 1
		}
		return tx.Create(&t).Error
	})
	if err != nil {
		return domain.NoteTemplate{}, translate(err)
	}
	return t, nil
}

func (r *NoteTemplateRepo) UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	res := r.db.WithContext(ctx).
		Model(&domain.NoteTemplate{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(fields)
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteOwned xoá CỨNG. note_templates không có deleted_at: quy tắc soft
// delete chỉ áp cho trades, vì xoá cứng lệnh làm sai đường equity. Mẫu ghi chú
// không nằm trong dãy lũy kế theo stt.
func (r *NoteTemplateRepo) DeleteOwned(ctx context.Context, id, userID int64) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&domain.NoteTemplate{})
	if res.Error != nil {
		return translate(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderOwned gán lại position theo thứ tự của ids, ALL-OR-NOTHING.
//
// Mỗi lượt Update mang thêm "AND user_id = ?" và đếm RowsAffected: một id
// không thuộc user làm cả transaction rollback, nên không có trạng thái nửa
// vời nào lọt ra.
func (r *NoteTemplateRepo) ReorderOwned(ctx context.Context, userID int64, ids []int64) error {
	return translate(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, id := range ids {
			res := tx.Model(&domain.NoteTemplate{}).
				Where("id = ? AND user_id = ?", id, userID).
				Update("position", i+1)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return ErrNotFound
			}
		}
		return nil
	}))
}
```

Kiểm tên bảng GORM suy ra từ `domain.NoteTemplate` có đúng là `note_templates` không. Nếu repo đã có quy ước `TableName()` cho các model khác (chạy `grep -rn "func.*TableName" internal/domain/`) thì làm theo; nếu không, GORM pluralize `NoteTemplate` → `note_templates`, đúng như cần.

- [ ] **Step 5: Viết adapter in-memory**

Thêm vào `backend/internal/service/memstore_test.go`:

```go
// memNoteTemplateStore giữ mẫu ghi chú trong RAM.
//
// Trùng tên kiểm bằng lower(name) trong phạm vi từng user — CHÍNH XÁC như
// UNIQUE index của migration 0003. Adapter dễ tính hơn Postgres ở điểm này
// sẽ làm contract test đỏ, và đó là mục đích của nó.
type memNoteTemplateStore struct {
	hat    sync.Mutex
	rows   map[int64]domain.NoteTemplate
	nextID int64
}

func newMemNoteTemplateStore() *memNoteTemplateStore {
	return &memNoteTemplateStore{rows: map[int64]domain.NoteTemplate{}, nextID: 1}
}

func (m *memNoteTemplateStore) ListByUser(_ context.Context, userID int64) ([]domain.NoteTemplate, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	out := []domain.NoteTemplate{}
	for _, r := range m.rows {
		if r.UserID == userID {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (m *memNoteTemplateStore) Create(_ context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	maxPos := 0
	for _, r := range m.rows {
		if r.UserID != t.UserID {
			continue
		}
		if strings.EqualFold(r.Name, t.Name) {
			return domain.NoteTemplate{}, repository.ErrDuplicate
		}
		if r.Position > maxPos {
			maxPos = r.Position
		}
	}
	t.ID = m.nextID
	m.nextID++
	t.Position = maxPos + 1 // ghi đè giá trị người gọi đặt — quy tắc 7
	m.rows[t.ID] = t
	return t, nil
}

func (m *memNoteTemplateStore) UpdateOwned(_ context.Context, id, userID int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	m.hat.Lock()
	defer m.hat.Unlock()
	row, ok := m.rows[id]
	if !ok || row.UserID != userID {
		return repository.ErrNotFound
	}
	if v, ok := fields["name"].(string); ok {
		for _, other := range m.rows {
			if other.ID != id && other.UserID == userID && strings.EqualFold(other.Name, v) {
				return repository.ErrDuplicate
			}
		}
		row.Name = v
	}
	if v, ok := fields["body_html"].(string); ok {
		row.BodyHTML = v
	}
	m.rows[id] = row
	return nil
}

func (m *memNoteTemplateStore) DeleteOwned(_ context.Context, id, userID int64) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	row, ok := m.rows[id]
	if !ok || row.UserID != userID {
		return repository.ErrNotFound
	}
	delete(m.rows, id)
	return nil
}

func (m *memNoteTemplateStore) ReorderOwned(_ context.Context, userID int64, ids []int64) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	// Kiểm TRƯỚC khi ghi: repo thật rollback cả transaction, adapter này phải
	// cùng hành vi all-or-nothing, không được đổi một nửa rồi mới báo lỗi.
	for _, id := range ids {
		row, ok := m.rows[id]
		if !ok || row.UserID != userID {
			return repository.ErrNotFound
		}
	}
	for i, id := range ids {
		row := m.rows[id]
		row.Position = i + 1
		m.rows[id] = row
	}
	return nil
}
```

Thêm `"strings"` vào import của `memstore_test.go` nếu chưa có.

- [ ] **Step 6: Chạy contract test — lượt in-memory**

Run: `cd backend && go test ./internal/service/ -run TestNoteTemplateStoreContract_InMemory -count=1 -v`
Expected: PASS, 15 subtest xanh.

- [ ] **Step 7: Chạy contract test — lượt Postgres**

Run: `cd backend && go test ./internal/service/ -run TestNoteTemplateStoreContract_Postgres -count=1 -v`
Expected: PASS, cùng 15 subtest. Cần Docker. Hai lượt cùng xanh là bằng chứng adapter in-memory chưa trôi lệch khỏi Postgres.

- [ ] **Step 8: Cổng chặn**

Run: `cd backend && gofmt -l . && go vet ./... && go test ./internal/... -count=1`
Expected: không file nào cần format, `go vet` im lặng, toàn bộ test cũ vẫn xanh.

- [ ] **Step 9: Dừng — KHÔNG commit**

---

### Task 3: Service + dịch lỗi sang apperr

**Files:**
- Create: `backend/internal/service/notetemplate.go`
- Test: `backend/internal/service/notetemplate_test.go`

**Interfaces:**
- Consumes: `service.NoteTemplateStore` (Task 2), `domain.ValidateNoteTemplate` (Task 1).
- Produces:
  - `service.NewNoteTemplateService(store NoteTemplateStore) *NoteTemplateService`
  - `service.NoteTemplateCreate{ Name, BodyHTML string }`
  - `service.NoteTemplatePatch{ Name, BodyHTML Tristate[string] }`
  - Method: `List(ctx, userID) ([]domain.NoteTemplate, error)`, `Create(ctx, userID int64, in NoteTemplateCreate) (domain.NoteTemplate, error)`, `Update(ctx, userID, id int64, p NoteTemplatePatch) (domain.NoteTemplate, error)`, `Delete(ctx, userID, id int64) error`, `Reorder(ctx, userID int64, ids []int64) error`

- [ ] **Step 1: Viết test fail trước**

Tạo `backend/internal/service/notetemplate_test.go`:

```go
package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/service"
)

func newTplSvc() *service.NoteTemplateService {
	return service.NewNoteTemplateService(newMemNoteTemplateStore())
}

func TestNoteTemplateCreateThenList(t *testing.T) {
	svc := newTplSvc()

	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{
		Name: "Setup A", BodyHTML: "<p>x</p>",
	})
	require.NoError(t, err)
	require.Equal(t, 1, created.Position)

	rows, err := svc.List(newCtx(), 1)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "Setup A", rows[0].Name)
}

// Validate của domain phải chạy TRƯỚC khi xuống store: tên rỗng là 400, không
// phải một hàng rác trong DB.
func TestNoteTemplateCreateTenRongLa400(t *testing.T) {
	svc := newTplSvc()

	_, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "  ", BodyHTML: "<p>x</p>"})

	require.Error(t, err)
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestNoteTemplateCreateTrungTenLa409(t *testing.T) {
	svc := newTplSvc()
	_, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "Setup A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "setup a", BodyHTML: "<p>y</p>"})

	require.Error(t, err)
	require.Equal(t, 409, apperr.As(err).Status)
}

func TestNoteTemplateUpdateSuaDuocMotTruong(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	updated, err := svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{
		Name: service.Set("A mới"),
	})

	require.NoError(t, err)
	require.Equal(t, "A mới", updated.Name)
	require.Equal(t, "<p>x</p>", updated.BodyHTML, "thân không gửi lên thì không được đổi")
}

func TestNoteTemplateUpdateCuaUserKhacLa404(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Update(newCtx(), 2, created.ID, service.NoteTemplatePatch{Name: service.Set("cướp")})

	require.Error(t, err)
	require.Equal(t, 404, apperr.As(err).Status, "phải là 404, không phải 403: không tiết lộ mẫu có tồn tại")
}

func TestNoteTemplateUpdateTenRongLa400(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{Name: service.Set("   ")})

	require.Error(t, err)
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestNoteTemplateDeleteLanHaiLa404(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)
	require.NoError(t, svc.Delete(newCtx(), 1, created.ID))

	err = svc.Delete(newCtx(), 1, created.ID)

	require.Error(t, err)
	require.Equal(t, 404, apperr.As(err).Status)
}

// Reorder nhận ĐÚNG tập id của user. Mảng cắt cụt mà cứ thế chạy sẽ dồn các
// mẫu còn lại về position sai, âm thầm.
func TestNoteTemplateReorderMangLechTapLa400(t *testing.T) {
	svc := newTplSvc()
	a, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>a</p>"})
	require.NoError(t, err)
	_, err = svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "B", BodyHTML: "<p>b</p>"})
	require.NoError(t, err)

	cases := map[string][]int64{
		"thiếu id":  {a.ID},
		"id trùng":  {a.ID, a.ID},
		"id lạ":     {a.ID, 9999},
		"mảng rỗng": {},
	}
	for name, ids := range cases {
		t.Run(name, func(t *testing.T) {
			err := svc.Reorder(newCtx(), 1, ids)
			require.Error(t, err)
			require.Equal(t, 400, apperr.As(err).Status)
		})
	}
}

func TestNoteTemplateReorderDoiThuTuThat(t *testing.T) {
	svc := newTplSvc()
	a, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>a</p>"})
	require.NoError(t, err)
	b, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "B", BodyHTML: "<p>b</p>"})
	require.NoError(t, err)

	require.NoError(t, svc.Reorder(newCtx(), 1, []int64{b.ID, a.ID}))

	rows, err := svc.List(newCtx(), 1)
	require.NoError(t, err)
	require.Equal(t, []string{"B", "A"}, []string{rows[0].Name, rows[1].Name})
}
```

**Trước khi viết:** kiểm API thật của `Tristate` — chạy `grep -n "func Set\|func None\|func (t Tristate" internal/service/tristate.go`. Nếu constructor không tên `Set` thì đổi mọi chỗ `service.Set(...)` ở trên cho khớp. Đây là điều **phải** kiểm, không đoán.

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd backend && go test ./internal/service/ -run TestNoteTemplate -count=1`
Expected: FAIL — `undefined: service.NewNoteTemplateService`.

- [ ] **Step 3: Viết service**

Tạo `backend/internal/service/notetemplate.go`:

```go
package service

import (
	"context"
	"errors"
	"fmt"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

type NoteTemplateService struct{ store NoteTemplateStore }

func NewNoteTemplateService(store NoteTemplateStore) *NoteTemplateService {
	return &NoteTemplateService{store: store}
}

type NoteTemplateCreate struct {
	Name     string
	BodyHTML string
}

// NoteTemplatePatch dùng Tristate như TradePatch: khoá vắng mặt trong JSON
// nghĩa là "không đổi", khác hẳn với "đổi thành chuỗi rỗng".
type NoteTemplatePatch struct {
	Name     Tristate[string]
	BodyHTML Tristate[string]
}

func (s *NoteTemplateService) List(ctx context.Context, userID int64) ([]domain.NoteTemplate, error) {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê note template: %w", err)
	}
	return rows, nil
}

func (s *NoteTemplateService) Create(
	ctx context.Context, userID int64, in NoteTemplateCreate,
) (domain.NoteTemplate, error) {
	t := domain.NoteTemplate{UserID: userID, Name: in.Name, BodyHTML: in.BodyHTML}
	if err := domain.ValidateNoteTemplate(&t); err != nil {
		return domain.NoteTemplate{}, err
	}
	created, err := s.store.Create(ctx, t)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.NoteTemplate{}, apperr.Conflict(fmt.Sprintf("mẫu ghi chú %q đã tồn tại", t.Name))
		}
		return domain.NoteTemplate{}, fmt.Errorf("tạo note template: %w", err)
	}
	return created, nil
}

// Update chỉ ghi những trường CÓ trong patch.
//
// Validate chạy trên bản đã GỘP (giá trị cũ + patch), không phải trên riêng
// patch: sửa mỗi tên vẫn phải kiểm tên, mà kiểm thân thì phải kiểm thân cũ —
// nếu chỉ validate patch thì một patch rỗng sẽ lọt qua mọi luật.
func (s *NoteTemplateService) Update(
	ctx context.Context, userID, id int64, p NoteTemplatePatch,
) (domain.NoteTemplate, error) {
	current, err := s.byID(ctx, userID, id)
	if err != nil {
		return domain.NoteTemplate{}, err
	}

	merged := current
	fields := map[string]any{}
	if v, ok := p.Name.Get(); ok {
		merged.Name = v
	}
	if v, ok := p.BodyHTML.Get(); ok {
		merged.BodyHTML = v
	}
	if err := domain.ValidateNoteTemplate(&merged); err != nil {
		return domain.NoteTemplate{}, err
	}
	// Lấy giá trị ĐÃ TRIM từ merged, không lấy thô từ patch.
	if _, ok := p.Name.Get(); ok {
		fields["name"] = merged.Name
	}
	if _, ok := p.BodyHTML.Get(); ok {
		fields["body_html"] = merged.BodyHTML
	}
	if len(fields) == 0 {
		return current, nil
	}

	if err := s.store.UpdateOwned(ctx, id, userID, fields); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.NoteTemplate{}, apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.NoteTemplate{}, apperr.Conflict(fmt.Sprintf("mẫu ghi chú %q đã tồn tại", merged.Name))
		}
		return domain.NoteTemplate{}, fmt.Errorf("sửa note template: %w", err)
	}
	return s.byID(ctx, userID, id)
}

func (s *NoteTemplateService) Delete(ctx context.Context, userID, id int64) error {
	if err := s.store.DeleteOwned(ctx, id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		return fmt.Errorf("xoá note template: %w", err)
	}
	return nil
}

// Reorder đòi ids là ĐÚNG tập id của user — không thiếu, không thừa, không
// trùng. Kiểm ở đây chứ không ở repo: một mảng cắt cụt mà cứ thế chạy sẽ dồn
// các mẫu không được nhắc tới về position sai, và không có gì báo cho ai biết.
func (s *NoteTemplateService) Reorder(ctx context.Context, userID int64, ids []int64) error {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("liệt kê note template: %w", err)
	}
	if len(ids) != len(rows) {
		return apperr.Validation(fmt.Sprintf("cần đúng %d id, nhận %d", len(rows), len(ids)))
	}
	owned := make(map[int64]bool, len(rows))
	for _, r := range rows {
		owned[r.ID] = true
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if !owned[id] {
			return apperr.Validation(fmt.Sprintf("id %d không thuộc danh sách mẫu", id))
		}
		if seen[id] {
			return apperr.Validation(fmt.Sprintf("id %d xuất hiện hai lần", id))
		}
		seen[id] = true
	}

	if err := s.store.ReorderOwned(ctx, userID, ids); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		return fmt.Errorf("đổi thứ tự note template: %w", err)
	}
	return nil
}

// byID không có trong seam: đọc một mẫu là lọc từ ListByUser.
//
// Thêm một method ByID vào interface chỉ để phục vụ Update sẽ bắt CẢ HAI
// adapter cài thêm, và store.go đã nói rõ interface rộng đúng bằng cái service
// gọi. Số mẫu của một người là hàng chục, không phải hàng nghìn.
func (s *NoteTemplateService) byID(ctx context.Context, userID, id int64) (domain.NoteTemplate, error) {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return domain.NoteTemplate{}, fmt.Errorf("liệt kê note template: %w", err)
	}
	for _, r := range rows {
		if r.ID == id {
			return r, nil
		}
	}
	return domain.NoteTemplate{}, apperr.NotFound("không tìm thấy mẫu ghi chú")
}
```

- [ ] **Step 4: Chạy test để chắc nó pass**

Run: `cd backend && go test ./internal/service/ -run TestNoteTemplate -count=1 -v`
Expected: PASS. Nếu `TestNoteTemplateReorderMangLechTapLa400/mảng rỗng` fail vì `len(rows)==0`, đọc lại: user có 2 mẫu nên `len(ids)=0 != 2` → 400. Đúng như mong đợi.

- [ ] **Step 5: Chạy cả package thuần**

Run: `cd backend && make test-pure`
Expected: PASS. Lệnh này không cần Docker — nếu nó bắt đầu cần Postgres thì ranh giới package đã bị phá.

- [ ] **Step 6: Cổng chặn**

Run: `cd backend && gofmt -l . && go vet ./...`
Expected: im lặng cả hai.

- [ ] **Step 7: Dừng — KHÔNG commit**

---

### Task 4: HTTP handler + DTO + 5 route

**Files:**
- Create: `backend/internal/httpapi/notetemplate_handler.go`
- Test: `backend/internal/httpapi/notetemplate_handler_test.go`
- Modify: `backend/internal/httpapi/router.go` (thêm `Deps.NoteTemplate` + mount)

**Interfaces:**
- Consumes: `service.NoteTemplateService` và các type của nó (Task 3).
- Produces:
  - `httpapi.Deps.NoteTemplate *service.NoteTemplateService`
  - 5 endpoint: `GET/POST /api/note-templates`, `PATCH/DELETE /api/note-templates/{id}`, `PUT /api/note-templates/order`
  - JSON keys: `id`, `name`, `body_html`, `position`, `created_at`, `updated_at`

- [ ] **Step 1: Viết test fail trước**

Tạo `backend/internal/httpapi/notetemplate_handler_test.go`:

```go
package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

const tplPath = "/api/note-templates"

type tplRow struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	BodyHTML string `json:"body_html"`
	Position int    `json:"position"`
}

func createTpl(t *testing.T, srvURL, token, name, body string) tplRow {
	t.Helper()
	resp, env := do(t, http.MethodPost, srvURL+tplPath, token,
		`{"name":"`+name+`","body_html":"`+body+`"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode, "body: %s", env.Data)
	var row tplRow
	require.NoError(t, json.Unmarshal(env.Data, &row))
	require.NotZero(t, row.ID)
	return row
}

func TestNoteTemplateCreateThenList(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	created := createTpl(t, srv.URL, tokenA, "Setup A", "<p>x</p>")
	require.Equal(t, 1, created.Position)

	resp, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "Setup A", list[0].Name)
	require.Equal(t, "<p>x</p>", list[0].BodyHTML)
}

// Rỗng phải serialize thành [] chứ không phải null: null.map(...) là crash ở
// frontend. Đây là trạng thái của MỌI user vừa đăng ký.
func TestNoteTemplateEmptyListIsEmptyArray(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `[]`, string(env.Data),
		"danh sách rỗng phải là [] chứ không phải null, thực tế: %s", env.Data)
}

func TestNoteTemplateRequiresAuth(t *testing.T) {
	srv, _, _ := twoUserServer(t)

	resp, _ := do(t, http.MethodGet, srv.URL+tplPath, "", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestNoteTemplateBadInputReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	cases := map[string]string{
		"tên rỗng":            `{"name":"","body_html":"<p>x</p>"}`,
		"tên toàn trắng":      `{"name":"   ","body_html":"<p>x</p>"}`,
		"thân rỗng":           `{"name":"A","body_html":""}`,
		"JSON sai định dạng":  `{"name":`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			resp, _ := do(t, http.MethodPost, srv.URL+tplPath, tokenA, body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		})
	}
}

func TestNoteTemplateDuplicateNameReturns409(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	createTpl(t, srv.URL, tokenA, "Setup A", "<p>x</p>")

	resp, _ := do(t, http.MethodPost, srv.URL+tplPath, tokenA,
		`{"name":"setup a","body_html":"<p>y</p>"}`)

	require.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestNoteTemplatePatchUpdatesOneField(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")

	resp, env := do(t, http.MethodPatch,
		srv.URL+tplPath+"/"+itoa(created.ID), tokenA, `{"name":"A mới"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var row tplRow
	require.NoError(t, json.Unmarshal(env.Data, &row))
	require.Equal(t, "A mới", row.Name)
	require.Equal(t, "<p>x</p>", row.BodyHTML, "thân không gửi lên thì không được đổi")
}

func TestNoteTemplateDelete(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")

	resp, _ := do(t, http.MethodDelete, srv.URL+tplPath+"/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	again, _ := do(t, http.MethodDelete, srv.URL+tplPath+"/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusNotFound, again.StatusCode)
}

func TestNoteTemplateReorder(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	a := createTpl(t, srv.URL, tokenA, "A", "<p>a</p>")
	b := createTpl(t, srv.URL, tokenA, "B", "<p>b</p>")

	resp, _ := do(t, http.MethodPut, srv.URL+tplPath+"/order", tokenA,
		`{"ids":[`+itoa(b.ID)+`,`+itoa(a.ID)+`]}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Equal(t, []string{"B", "A"}, []string{list[0].Name, list[1].Name})
}

func TestNoteTemplateReorderMangLechTapLa400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	a := createTpl(t, srv.URL, tokenA, "A", "<p>a</p>")
	createTpl(t, srv.URL, tokenA, "B", "<p>b</p>")

	resp, _ := do(t, http.MethodPut, srv.URL+tplPath+"/order", tokenA,
		`{"ids":[`+itoa(a.ID)+`]}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// Cốt lõi của mô hình quyền: mượn id của người khác trả 404, KHÔNG phải 403.
// 403 tự nó xác nhận "mẫu này có tồn tại", tức là một kênh rò rỉ.
func TestNoteTemplateCuaUserKhacLa404(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")
	path := srv.URL + tplPath + "/" + itoa(created.ID)

	t.Run("PATCH", func(t *testing.T) {
		resp, _ := do(t, http.MethodPatch, path, tokenB, `{"name":"cướp"}`)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
	t.Run("DELETE", func(t *testing.T) {
		resp, _ := do(t, http.MethodDelete, path, tokenB, "")
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
	t.Run("GET danh sách của B không thấy mẫu của A", func(t *testing.T) {
		_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenB, "")
		require.JSONEq(t, `[]`, string(env.Data))
	})

	// Và mẫu của A vẫn còn nguyên sau mọi lượt tấn công ở trên.
	_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "A", list[0].Name)
}
```

Cũng phải sửa `twoUserServer` trong `account_handler_test.go` để nối `NoteTemplate` vào `Deps` — xem Step 4.

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd backend && go test ./internal/httpapi/ -run TestNoteTemplate -count=1`
Expected: FAIL — 404 trên mọi route (chưa mount), hoặc compile error nếu `Deps.NoteTemplate` chưa có.

- [ ] **Step 3: Viết handler + DTO**

Tạo `backend/internal/httpapi/notetemplate_handler.go`:

```go
package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"journal/internal/domain"
	"journal/internal/service"
)

type NoteTemplateHandler struct{ svc *service.NoteTemplateService }

// DTO riêng, không marshal thẳng domain.NoteTemplate: struct domain mang tag
// của tầng lưu trữ, lôi ra API là rò rỉ tầng đó (cùng lý do Enriched/KPI có
// DTO riêng ở Phase 3a).
type noteTemplateDTO struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	BodyHTML  string    `json:"body_html"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func toNoteTemplateDTO(t domain.NoteTemplate) noteTemplateDTO {
	return noteTemplateDTO{
		ID:        t.ID,
		Name:      t.Name,
		BodyHTML:  t.BodyHTML,
		Position:  t.Position,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

// make(..., 0, n) chứ không var: slice rỗng phải marshal thành [] chứ không
// phải null — null.map(...) là crash ở frontend.
func toNoteTemplateDTOs(list []domain.NoteTemplate) []noteTemplateDTO {
	out := make([]noteTemplateDTO, 0, len(list))
	for _, t := range list {
		out = append(out, toNoteTemplateDTO(t))
	}
	return out
}

type noteTemplateCreateRequest struct {
	Name     string `json:"name"`
	BodyHTML string `json:"body_html"`
}

// Con trỏ để phân biệt "khoá vắng mặt" với "chuỗi rỗng" — hai chuyện khác
// nhau, và Tristate của service dựa vào đúng chỗ này.
type noteTemplatePatchRequest struct {
	Name     *string `json:"name"`
	BodyHTML *string `json:"body_html"`
}

type noteTemplateOrderRequest struct {
	IDs []int64 `json:"ids"`
}

func (h *NoteTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), UserID(r.Context()))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTOs(list))
}

func (h *NoteTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req noteTemplateCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	created, err := h.svc.Create(r.Context(), UserID(r.Context()), service.NoteTemplateCreate{
		Name:     req.Name,
		BodyHTML: req.BodyHTML,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTO(created))
}

func (h *NoteTemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		FailErr(w, r, apperrBadID())
		return
	}
	var req noteTemplatePatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	var p service.NoteTemplatePatch
	if req.Name != nil {
		p.Name = service.Set(*req.Name)
	}
	if req.BodyHTML != nil {
		p.BodyHTML = service.Set(*req.BodyHTML)
	}
	updated, err := h.svc.Update(r.Context(), UserID(r.Context()), id, p)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTO(updated))
}

func (h *NoteTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		FailErr(w, r, apperrBadID())
		return
	}
	if err := h.svc.Delete(r.Context(), UserID(r.Context()), id); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}

func (h *NoteTemplateHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req noteTemplateOrderRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), UserID(r.Context()), req.IDs); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
```

**Hai chỗ phải kiểm thay vì đoán:**
1. `apperrBadID()` là placeholder. Chạy `grep -n "ParseInt" -A3 internal/httpapi/cashflow_handler.go` xem repo trả lỗi id sai kiểu gì rồi **dùng đúng cách đó** (có thể là `apperr.Validation("id không hợp lệ")`).
2. `DecodeJSON` và `OK(w, nil)` — chạy `grep -n "func DecodeJSON\|func OK" internal/httpapi/response.go` để khớp signature. Xem `cashflow_handler.go` Delete trả gì khi thành công rồi làm theo.

- [ ] **Step 4: Mount route + thêm vào Deps**

Trong `backend/internal/httpapi/router.go`, thêm trường vào `Deps`:

```go
	NoteTemplate *service.NoteTemplateService
```

Rồi mount **trong khối `priv` đã có** (cùng cấp với `priv.Delete("/cash-flows/{id}", ...)`), tức là sau `RequireAuth` nhưng **ngoài** `/accounts/{id}`:

```go
				// Mẫu ghi chú thuộc USER, không thuộc account: checklist vào
				// lệnh không phụ thuộc tài khoản nào. Vì thế route nằm ngoài
				// /accounts/{id} và không đi qua RequireAccount.
				if d.NoteTemplate != nil {
					nh := &NoteTemplateHandler{svc: d.NoteTemplate}
					priv.Route("/note-templates", func(nt chi.Router) {
						nt.Get("/", nh.List)
						nt.Post("/", nh.Create)
						// "/order" đăng ký TRƯỚC "/{id}": chi khớp pattern cụ
						// thể trước pattern có tham số, nhưng viết theo thứ tự
						// này để người đọc không phải tin vào điều đó.
						nt.Put("/order", nh.Reorder)
						nt.Patch("/{id}", nh.Update)
						nt.Delete("/{id}", nh.Delete)
					})
				}
```

Và trong `internal/httpapi/account_handler_test.go`, thêm vào `twoUserServer`:

```go
		NoteTemplate: service.NewNoteTemplateService(repository.NewNoteTemplateRepo(db)),
```

- [ ] **Step 5: Chạy test để chắc nó pass**

Run: `cd backend && go test ./internal/httpapi/ -run TestNoteTemplate -count=1 -v`
Expected: PASS toàn bộ, gồm 3 subtest của `TestNoteTemplateCuaUserKhacLa404`.

- [ ] **Step 6: Nối vào main.go**

Trong `backend/cmd/api/main.go`, tìm chỗ dựng `httpapi.Deps` và thêm:

```go
		NoteTemplate: service.NewNoteTemplateService(repository.NewNoteTemplateRepo(db)),
```

Đọc file trước để khớp tên biến `db` thật đang dùng.

- [ ] **Step 7: Chạy toàn bộ test backend**

Run: `cd backend && go build ./... && make test`
Expected: build sạch, toàn bộ test xanh (cần Docker).

- [ ] **Step 8: Cổng chặn**

Run: `cd backend && gofmt -l . && go vet ./...`
Expected: im lặng.

- [ ] **Step 9: Dừng — KHÔNG commit**

---

### Task 5: Kiểm API thật bằng tay

Backend xong. Task này **không viết code** — nó xác nhận API chạy thật trước khi frontend dựa vào nó, đúng kỷ luật đã dùng ở Phase 3 (3b dựng giao diện đối chiếu API chạy thật, không đối chiếu hợp đồng trên giấy).

**Files:** không sửa file nào.

**Interfaces:**
- Consumes: toàn bộ Task 1-4.
- Produces: một bản ghi thực tế của 5 endpoint, dùng làm nguồn cho MSW handler ở Task 7.

> **TRẠNG THÁI (2026-09-09): thay bằng test tự động, phần curl còn LẠI cho chủ repo.**
> Docker stack chưa chạy và Step 2 cần email/mật khẩu thật, nên thay vì đoán, phần
> quan trọng nhất của task này đã được kiểm bằng test đi trọn vòng HTTP + Postgres
> thật: `TestNoteTemplateChecklistThatRoundTrip` trong
> `internal/httpapi/notetemplate_handler_test.go`. Nó POST **đúng** checklist ở §1 rồi
> đọc lại từ DB, khẳng định `body_html` về NGUYÊN VẸN — `data-list="unchecked"`, `≥2R`,
> `DOL rõ` đều không biến dạng. Đã PASS.
>
> Các bước curl dưới đây vẫn còn giá trị như một lượt kiểm bằng tay của chủ repo
> (cần `make up` + tài khoản thật), nhưng **không chặn** Task 6-9.

- [ ] **Step 1: Chạy migration và bật API**

Run: `make migrate && make up && sleep 5 && docker compose logs api | tail -20`
Expected: log không có lỗi; migration `0003` đã áp dụng.

- [ ] **Step 2: Lấy token**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<email đã đăng ký>","password":"<mật khẩu>"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["access_token"])')
echo "${TOKEN:0:20}..."
```

Nếu chưa có user thì đổi `/login` thành `/register`. Kiểm tên field thật của token bằng cách in cả response ra trước.

- [ ] **Step 3: Tạo mẫu thật — chính checklist ở spec §1**

```bash
curl -s -X POST http://localhost:8000/api/note-templates \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"HTF PDA - FVG - H1","body_html":"<p><strong>HTF PDA - FVG - H1</strong></p><ol><li data-list=\"unchecked\">Asia/London BSL/SSL liquidity - M15 Minor BSL</li><li data-list=\"unchecked\">Liquidity sweep</li><li data-list=\"unchecked\">DOL rõ</li><li data-list=\"unchecked\">NQ/ES SMT</li><li data-list=\"unchecked\">Reclaim</li><li data-list=\"unchecked\">Displacement</li><li data-list=\"unchecked\">Venom</li><li data-list=\"unchecked\">Entry model</li><li data-list=\"unchecked\">≥2R</li></ol><p>Link trade:</p><p>H1: </p><p>M15: </p><p>M1: </p>"}' | python3 -m json.tool
```
Expected: `code: 0`, `position: 1`, `body_html` trả về **nguyên vẹn** — đặc biệt là `data-list="unchecked"` và ký tự `≥`.

- [ ] **Step 4: Kiểm 4 endpoint còn lại**

```bash
curl -s http://localhost:8000/api/note-templates -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s -X PATCH http://localhost:8000/api/note-templates/1 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"HTF PDA v2"}' | python3 -m json.tool
curl -s -X PUT http://localhost:8000/api/note-templates/order -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"ids":[1]}' | python3 -m json.tool
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:8000/api/note-templates/999 \
  -H "Authorization: Bearer $TOKEN"
```
Expected: list trả mảng; PATCH đổi tên và **giữ nguyên** `body_html`; order trả `code: 0`; DELETE id lạ trả **404**.

- [ ] **Step 5: Ghi lại hình dạng response thật**

Dán response JSON của `GET /api/note-templates` vào ghi chú của task. Task 7 dựng MSW handler theo **đúng** hình dạng này, không theo phỏng đoán.

- [ ] **Step 6: Dừng — KHÔNG commit**

Nếu bất kỳ bước nào lệch với mong đợi, **quay lại Task 1-4 sửa** trước khi sang frontend.

---

### Task 6: Component dropdown-menu + types + queryKeys + i18n

Hạ tầng frontend. Repo **chưa có** `dropdown-menu.tsx` — đã kiểm bằng `ls components/ui/`. Package `radix-ui` (unified) đã có trong `package.json` nên không thêm phụ thuộc.

**Files:**
- Create: `frontend/src/components/ui/dropdown-menu.tsx`
- Create: `frontend/src/features/noteTemplates/types.ts`
- Modify: `frontend/src/lib/queryKeys.ts`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: hình dạng JSON từ Task 5.
- Produces:
  - `NoteTemplate = { id: number; name: string; body_html: string; position: number; created_at: string; updated_at: string }`
  - `NoteTemplateCreate = { name: string; body_html: string }`
  - `NoteTemplatePatch = Partial<NoteTemplateCreate>`
  - `qk.noteTemplates` = `["note-templates"]`
  - Export từ `dropdown-menu.tsx`: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`
  - 18 khoá i18n dưới tiền tố `noteTemplate.*`

- [ ] **Step 1: Viết `types.ts`**

Tạo `frontend/src/features/noteTemplates/types.ts`:

```ts
/**
 * Mẫu ghi chú thuộc USER, không thuộc account — vì thế không có `account_id`.
 *
 * `body_html` là HTML của Quill, ĐÚNG cùng định dạng với `Trade.notes`. Nhờ
 * vậy chèn mẫu vào ghi chú chỉ là nối chuỗi, không cần tầng dịch nào.
 */
export type NoteTemplate = {
  id: number;
  name: string;
  body_html: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type NoteTemplateCreate = {
  name: string;
  body_html: string;
};

/** Khoá vắng mặt nghĩa là "không đổi" — backend dùng con trỏ, xem spec §6.5. */
export type NoteTemplatePatch = Partial<NoteTemplateCreate>;
```

- [ ] **Step 2: Thêm query key**

Trong `frontend/src/lib/queryKeys.ts`, thêm vào object `qk`:

```ts
  // KHÔNG nằm dưới tiền tố ["accounts", id]: mẫu ghi chú thuộc user, nên đổi
  // account không được làm mất cache, và invalidate accounts không được quét
  // nó. Đây là query key duy nhất ngoài phạm vi account.
  noteTemplates: ["note-templates"] as const,
```

- [ ] **Step 3: Viết `dropdown-menu.tsx`**

Tạo `frontend/src/components/ui/dropdown-menu.tsx`, theo **đúng** khuôn `popover.tsx` (đọc file đó trước để copy cách import và cách đặt `data-slot`):

```tsx
import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          // Theme tắt hết shadow-*: phân tầng bằng border và bậc surface, nên
          // menu dùng surface-raised + border thay vì đổ bóng.
          "z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-surface-raised p-1 text-text-primary",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
        "focus:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
```

**Phải kiểm:** tên biến theme thật. Chạy `grep -n "surface-raised\|surface-sunken" docs/design/theme.css` — nếu không có `--surface-sunken` thì đổi sang bậc surface thật đang tồn tại. **Không hardcode hex, không dùng `shadow-*`.**

- [ ] **Step 4: Thêm chuỗi i18n**

Trong `frontend/src/i18n/strings.ts`, thêm (đọc file trước để khớp đúng hình dạng object):

```ts
  "noteTemplate.insert": { vi: "Chèn mẫu", en: "Insert template" },
  "noteTemplate.manage": { vi: "Quản lý mẫu…", en: "Manage templates…" },
  "noteTemplate.emptyHint": {
    vi: "Chưa có mẫu nào — tạo mẫu đầu tiên",
    en: "No templates yet — create the first one",
  },
  "noteTemplate.managerTitle": { vi: "Quản lý mẫu ghi chú", en: "Manage note templates" },
  "noteTemplate.managerDescription": {
    vi: "Mẫu dùng chung cho mọi tài khoản. Chèn vào ô Ghi chú khi nhập lệnh.",
    en: "Templates are shared across all accounts. Insert them into the Notes field.",
  },
  "noteTemplate.name": { vi: "Tên mẫu", en: "Template name" },
  "noteTemplate.namePlaceholder": { vi: "VD: HTF PDA - FVG - H1", en: "e.g. HTF PDA - FVG - H1" },
  "noteTemplate.body": { vi: "Nội dung mẫu", en: "Template body" },
  "noteTemplate.bodyPlaceholder": {
    vi: "Checklist các điều kiện cần soát trước khi vào lệnh…",
    en: "Checklist of conditions to review before entering…",
  },
  "noteTemplate.new": { vi: "Thêm mẫu", en: "New template" },
  "noteTemplate.save": { vi: "Lưu mẫu", en: "Save template" },
  "noteTemplate.cancel": { vi: "Huỷ", en: "Cancel" },
  "noteTemplate.edit": { vi: "Sửa", en: "Edit" },
  "noteTemplate.delete": { vi: "Xoá", en: "Delete" },
  // Nhãn cho hai nút đổi thứ tự. Là aria-label, không phải text hiện ra: nút
  // chỉ có mũi tên, nên không có nhãn thì trình đọc màn hình đọc ra một nút
  // vô danh.
  "noteTemplate.moveUp": { vi: "Chuyển lên", en: "Move up" },
  "noteTemplate.moveDown": { vi: "Chuyển xuống", en: "Move down" },
  "noteTemplate.deleteConfirmTitle": { vi: "Xoá mẫu này?", en: "Delete this template?" },
  "noteTemplate.deleteConfirmBody": {
    vi: "Mẫu bị xoá vĩnh viễn. Ghi chú đã chèn vào các lệnh cũ không bị ảnh hưởng.",
    en: "The template is deleted permanently. Notes already inserted into trades are unaffected.",
  },
  "noteTemplate.nameRequired": { vi: "Tên mẫu không được để trống", en: "Template name is required" },
  "noteTemplate.bodyRequired": {
    vi: "Nội dung mẫu không được để trống",
    en: "Template body is required",
  },
```

- [ ] **Step 5: Kiểm biên dịch**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi. Nếu `radix-ui` không export `DropdownMenu` thì chạy `node -e "console.log(Object.keys(require('radix-ui')))"` để xem tên thật.

- [ ] **Step 6: Kiểm test cũ chưa vỡ**

Run: `cd frontend && npx vitest run src/i18n src/lib`
Expected: PASS. `i18n.test.tsx` có thể có test đối chiếu đủ cặp vi/en — chuỗi mới phải có **cả hai**.

- [ ] **Step 7: Dừng — KHÔNG commit**

---

### Task 7: Hooks TanStack Query + test MSW

**Files:**
- Create: `frontend/src/features/noteTemplates/hooks.ts`
- Test: `frontend/src/features/noteTemplates/hooks.test.tsx`

**Interfaces:**
- Consumes: `types.ts` và `qk.noteTemplates` (Task 6), hình dạng API từ Task 5.
- Produces:
  - `useNoteTemplates(): UseQueryResult<NoteTemplate[]>`
  - `useCreateNoteTemplate()`, `useUpdateNoteTemplate()`, `useDeleteNoteTemplate()`, `useReorderNoteTemplates()`
  - `useUpdateNoteTemplate` nhận `{ id, patch }`; `useReorderNoteTemplates` nhận `number[]`

- [ ] **Step 1: Viết test fail trước**

Tạo `frontend/src/features/noteTemplates/hooks.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import {
  useCreateNoteTemplate,
  useDeleteNoteTemplate,
  useNoteTemplates,
  useReorderNoteTemplates,
  useUpdateNoteTemplate,
} from "./hooks";
import type { NoteTemplate } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tpl = (id: number, name: string, position: number): NoteTemplate => ({
  id,
  name,
  body_html: `<p>${name}</p>`,
  position,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession({ accessToken: "tk", user: { id: 1, email: "a@b.c" } });
});

test("useNoteTemplates nạp danh sách theo position", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "A", 1), tpl(2, "B", 2)])),
  );
  const { Wrapper } = wrap();

  const { result } = renderHook(() => useNoteTemplates(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((t) => t.name)).toEqual(["A", "B"]);
});

test("useCreateNoteTemplate POST rồi làm mới danh sách", async () => {
  let listCalls = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => {
      listCalls++;
      return envelope([]);
    }),
    http.post(`${BASE}/note-templates`, async ({ request }) => {
      const body = (await request.json()) as { name: string; body_html: string };
      expect(body).toEqual({ name: "A", body_html: "<p>a</p>" });
      return envelope(tpl(1, "A", 1));
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(
    () => ({ list: useNoteTemplates(), create: useCreateNoteTemplate() }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  const before = listCalls;

  await result.current.create.mutateAsync({ name: "A", body_html: "<p>a</p>" });

  await waitFor(() => expect(listCalls).toBeGreaterThan(before));
});

test("useUpdateNoteTemplate PATCH đúng id và chỉ gửi field đã đổi", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(7, "A", 1)])),
    http.patch(`${BASE}/note-templates/7`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      expect(body).toEqual({ name: "A mới" });
      return envelope({ ...tpl(7, "A mới", 1) });
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useUpdateNoteTemplate(), { wrapper: Wrapper });

  const updated = await result.current.mutateAsync({ id: 7, patch: { name: "A mới" } });

  expect(updated.name).toBe("A mới");
});

test("useDeleteNoteTemplate DELETE đúng id", async () => {
  let deleted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.delete(`${BASE}/note-templates/7`, () => {
      deleted++;
      return envelope(null);
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useDeleteNoteTemplate(), { wrapper: Wrapper });

  await result.current.mutateAsync(7);

  expect(deleted).toBe(1);
});

test("useReorderNoteTemplates PUT mảng ids", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.put(`${BASE}/note-templates/order`, async ({ request }) => {
      const body = (await request.json()) as { ids: number[] };
      expect(body.ids).toEqual([3, 1, 2]);
      return envelope(null);
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useReorderNoteTemplates(), { wrapper: Wrapper });

  await result.current.mutateAsync([3, 1, 2]);
});
```

**Trước khi viết:** đọc `frontend/src/features/accounts/cashflow.test.tsx` đầu file và `frontend/src/test/server.ts` để khớp **đúng** cách `setSession` và `BASE` đang dùng ở repo. Chữ ký `setSession` ở trên là phỏng đoán — kiểm bằng `grep -n "export function setSession" -A5 src/lib/session.ts`.

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd frontend && npx vitest run src/features/noteTemplates/hooks.test.tsx`
Expected: FAIL — không resolve được `./hooks`.

- [ ] **Step 3: Viết hooks**

Tạo `frontend/src/features/noteTemplates/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { NoteTemplate, NoteTemplateCreate, NoteTemplatePatch } from "./types";

// URL KHÔNG lồng dưới account: backend là /api/note-templates, vì mẫu thuộc
// user. Xem spec §6.5.
const PATH = "/note-templates";

export function useNoteTemplates() {
  return useQuery({
    queryKey: qk.noteTemplates,
    queryFn: () => api.get<NoteTemplate[]>(PATH),
  });
}

export function useCreateNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NoteTemplateCreate) => api.post<NoteTemplate>(PATH, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

export function useUpdateNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: NoteTemplatePatch }) =>
      api.patch<NoteTemplate>(`${PATH}/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

export function useDeleteNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`${PATH}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

export function useReorderNoteTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.put<null>(`${PATH}/order`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}
```

**Phải kiểm:** `api` có method `patch` và `put` không. Chạy `grep -n "get:\|post:\|patch:\|put:\|del:" src/lib/api.ts`. Nếu thiếu `put` thì **thêm vào `api.ts`** theo đúng khuôn các method có sẵn — đừng lách bằng `post`.

- [ ] **Step 4: Chạy test để chắc nó pass**

Run: `cd frontend && npx vitest run src/features/noteTemplates/hooks.test.tsx`
Expected: PASS, 5 test.

- [ ] **Step 5: Cổng chặn**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Dừng — KHÔNG commit**

---

### Task 8: TemplateMenu + TemplateManagerDialog

**Files:**
- Create: `frontend/src/features/noteTemplates/TemplateMenu.tsx`
- Create: `frontend/src/features/noteTemplates/TemplateManagerDialog.tsx`
- Test: `frontend/src/features/noteTemplates/templateMenu.test.tsx`
- Test: `frontend/src/features/noteTemplates/templateManagerDialog.test.tsx`

**Interfaces:**
- Consumes: hooks (Task 7), `dropdown-menu.tsx` + i18n (Task 6).
- Produces:
  - `<TemplateMenu onInsert={(bodyHtml: string) => void} />`
  - `<TemplateManagerDialog open={boolean} onOpenChange={(v: boolean) => void} />`

- [ ] **Step 1: Viết test cho TemplateMenu**

Tạo `frontend/src/features/noteTemplates/templateMenu.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TemplateMenu } from "./TemplateMenu";
import type { NoteTemplate } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tpl = (id: number, name: string, position: number): NoteTemplate => ({
  id,
  name,
  body_html: `<p>${name}</p>`,
  position,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
});

function renderMenu(onInsert = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<TemplateMenu onInsert={onInsert} />, { wrapper: Wrapper });
  return { onInsert };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession({ accessToken: "tk", user: { id: 1, email: "a@b.c" } });
});

test("bấm một mẫu gọi onInsert với body_html của mẫu đó", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "Setup A", 1)])));
  const { onInsert } = renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Setup A" }));

  expect(onInsert).toHaveBeenCalledWith("<p>Setup A</p>");
});

// Menu rỗng không được là một menu TRỐNG: người dùng bấm vào rồi không hiểu
// mình đang thấy gì. Nó phải mời tạo mẫu đầu tiên.
test("chưa có mẫu nào thì hiện lời mời tạo mẫu, không hiện menu trống", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([])));
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));

  expect(await screen.findByText(/chưa có mẫu nào/i)).toBeInTheDocument();
});

test("danh sách hiện theo đúng thứ tự API trả về", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([tpl(3, "Ba", 1), tpl(1, "Một", 2), tpl(2, "Hai", 3)]),
    ),
  );
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));

  const items = await screen.findAllByRole("menuitem");
  expect(items.map((i) => i.textContent)).toEqual(
    expect.arrayContaining(["Ba", "Một", "Hai"]),
  );
  // Thứ tự phải đúng, không chỉ đủ mặt.
  const names = items.map((i) => i.textContent).filter((n) => ["Ba", "Một", "Hai"].includes(n!));
  expect(names).toEqual(["Ba", "Một", "Hai"]);
});
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd frontend && npx vitest run src/features/noteTemplates/templateMenu.test.tsx`
Expected: FAIL — không resolve được `./TemplateMenu`.

- [ ] **Step 3: Viết TemplateMenu**

Tạo `frontend/src/features/noteTemplates/TemplateMenu.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useNoteTemplates } from "./hooks";
import { TemplateManagerDialog } from "./TemplateManagerDialog";

/**
 * Nút "Chèn mẫu" cạnh nhãn Ghi chú của form nhập lệnh.
 *
 * `onInsert` nhận HTML của mẫu; nơi gọi quyết định nối vào đâu. Component này
 * cố ý KHÔNG biết gì về form lệnh — nó chỉ biết mẫu.
 */
export function TemplateMenu({ onInsert }: { onInsert: (bodyHtml: string) => void }) {
  const { t } = useI18n();
  const { data: templates } = useNoteTemplates();
  const [managerOpen, setManagerOpen] = useState(false);
  const list = templates ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            {t("noteTemplate.insert")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {list.length === 0 ? (
            // Menu rỗng là một cái bẫy: người dùng bấm vào rồi không hiểu
            // đang thấy gì. Dòng này vừa giải thích vừa dẫn tới chỗ tạo mẫu.
            <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
              {t("noteTemplate.emptyHint")}
            </DropdownMenuItem>
          ) : (
            <>
              {list.map((tpl) => (
                <DropdownMenuItem key={tpl.id} onSelect={() => onInsert(tpl.body_html)}>
                  {tpl.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
                {t("noteTemplate.manage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
```

**Phải kiểm:** `Button` có `variant="ghost"` và `size="sm"` không — chạy `grep -n "ghost\|size:" src/components/ui/button.tsx`. Dùng variant thật đang có.

`type="button"` là **bắt buộc**: nút này nằm trong `<form>` của TradeFormDialog, thiếu nó thì bấm chèn mẫu sẽ **submit form**.

- [ ] **Step 4: Viết test cho TemplateManagerDialog**

Tạo `frontend/src/features/noteTemplates/templateManagerDialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TemplateManagerDialog } from "./TemplateManagerDialog";
import type { NoteTemplate } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tpl = (id: number, name: string, position: number): NoteTemplate => ({
  id,
  name,
  body_html: `<p>${name}</p>`,
  position,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession({ accessToken: "tk", user: { id: 1, email: "a@b.c" } });
});

test("hiện danh sách mẫu đang có", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "Setup A", 1)])));

  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  expect(await screen.findByText("Setup A")).toBeInTheDocument();
});

test("tạo mẫu mới gửi name và body_html", async () => {
  let posted: unknown = null;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.post(`${BASE}/note-templates`, async ({ request }) => {
      posted = await request.json();
      return envelope(tpl(1, "Mẫu mới", 1));
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.type(screen.getByLabelText(/tên mẫu/i), "Mẫu mới");
  await userEvent.click(screen.getByRole("button", { name: /lưu mẫu/i }));

  await waitFor(() => expect(posted).not.toBeNull());
  expect((posted as { name: string }).name).toBe("Mẫu mới");
});

test("tên rỗng thì báo lỗi và KHÔNG gửi request", async () => {
  let posted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.post(`${BASE}/note-templates`, () => {
      posted++;
      return envelope(tpl(1, "x", 1));
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.click(screen.getByRole("button", { name: /lưu mẫu/i }));

  expect(await screen.findByText(/không được để trống/i)).toBeInTheDocument();
  expect(posted).toBe(0);
});

// Nút ▼ phải gửi ĐÚNG TẬP id theo thứ tự mới. Gửi mảng cắt cụt thì service
// trả 400 (Task 3) — test này là hàng rào chống đúng lỗi đó.
test("bấm ▼ ở dòng đầu gửi PUT /order với đủ id, thứ tự đã đổi", async () => {
  let sent: number[] | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([tpl(1, "A", 1), tpl(2, "B", 2), tpl(3, "C", 3)]),
    ),
    http.put(`${BASE}/note-templates/order`, async ({ request }) => {
      sent = ((await request.json()) as { ids: number[] }).ids;
      return envelope(null);
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });
  await screen.findByText("A");

  const downButtons = screen.getAllByRole("button", { name: /chuyển xuống/i });
  await userEvent.click(downButtons[0]);

  await waitFor(() => expect(sent).not.toBeNull());
  expect(sent).toEqual([2, 1, 3]);
});

test("nút ▲ của dòng đầu và ▼ của dòng cuối bị disabled", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "A", 1), tpl(2, "B", 2)])),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });
  await screen.findByText("A");

  const ups = screen.getAllByRole("button", { name: /chuyển lên/i });
  const downs = screen.getAllByRole("button", { name: /chuyển xuống/i });

  expect(ups[0]).toBeDisabled();
  expect(downs[downs.length - 1]).toBeDisabled();
});

// Ca NGUY HIỂM NHẤT của feature này. TemplateManagerDialog là dialog LỒNG
// trong TradeFormDialog. Esc phải đóng đúng lớp trong; đóng luôn form lệnh là
// mất lệnh người dùng đang gõ — hỏng dữ liệu, không phải lỗi hiển thị.
test("Esc trong dialog quản lý KHÔNG đóng dialog cha", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([])));

  function TwoLayers() {
    const [outerOpen, setOuterOpen] = useState(true);
    const [innerOpen, setInnerOpen] = useState(true);
    return (
      <Dialog open={outerOpen} onOpenChange={setOuterOpen}>
        <DialogContent>
          <p>form lệnh</p>
          <TemplateManagerDialog open={innerOpen} onOpenChange={setInnerOpen} />
        </DialogContent>
      </Dialog>
    );
  }
  render(<TwoLayers />, { wrapper });
  expect(await screen.findByText("form lệnh")).toBeInTheDocument();

  await userEvent.keyboard("{Escape}");

  await waitFor(() =>
    expect(screen.queryByText(/quản lý mẫu ghi chú/i)).not.toBeInTheDocument(),
  );
  expect(screen.getByText("form lệnh")).toBeInTheDocument();
});
```

- [ ] **Step 5: Chạy test để chắc nó fail**

Run: `cd frontend && npx vitest run src/features/noteTemplates/templateManagerDialog.test.tsx`
Expected: FAIL — không resolve được `./TemplateManagerDialog`.

- [ ] **Step 6: Viết TemplateManagerDialog**

Tạo `frontend/src/features/noteTemplates/TemplateManagerDialog.tsx`. Yêu cầu bắt buộc:

**Mỗi khoá i18n của Task 6 phải được dùng đúng một chỗ** — bảng dưới là hợp đồng, không phải gợi ý. Task 6 định nghĩa 18 khoá; thiếu chỗ nào là chuỗi chết:

| Khoá | Dùng ở đâu |
|---|---|
| `managerTitle` | `<DialogTitle>` |
| `managerDescription` | `<DialogDescription>` |
| `new` | nút mở form soạn mẫu mới |
| `name` | `<Label>` của ô tên |
| `namePlaceholder` | `placeholder` của ô tên |
| `body` | `<Label>` của ô thân mẫu |
| `bodyPlaceholder` | `placeholder` của `RichTextEditor` |
| `save` | nút lưu trong form soạn |
| `cancel` | nút huỷ trong form soạn |
| `edit` | nút Sửa trên mỗi dòng danh sách |
| `delete` | nút Xoá trên mỗi dòng danh sách |
| `deleteConfirmTitle` | `<AlertDialogTitle>` |
| `deleteConfirmBody` | `<AlertDialogDescription>` |
| `nameRequired` | lỗi validate khi tên rỗng |
| `bodyRequired` | lỗi validate khi thân rỗng |
| `moveUp` | `aria-label` của nút ▲ |
| `moveDown` | `aria-label` của nút ▼ |

Ba khoá còn lại (`insert`, `manage`, `emptyHint`) đã dùng ở `TemplateMenu` (Step 3).

1. Dùng `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` từ `@/components/ui/dialog` — đọc `TradeFormDialog.tsx` để copy đúng khuôn.
2. Danh sách mẫu + nút Sửa/Xoá mỗi dòng, và nút "Thêm mẫu".
3. Form soạn mẫu: `Input` cho tên (`<Label htmlFor>` gắn đúng để `getByLabelText(/tên mẫu/i)` tìm được) và `RichTextEditor` cho thân.
4. **Đổi thứ tự mẫu bằng hai nút "▲ / ▼" trên mỗi dòng**, gọi `useReorderNoteTemplates`.
   Nút ▲ của dòng đầu và ▼ của dòng cuối để `disabled`. Gửi lên **đúng tập** id hiện có
   theo thứ tự mới — service từ chối mảng lệch tập (400), nên không được gửi mảng cắt cụt.

   Vì sao là hai nút chứ không phải kéo-thả: kéo-thả cần một thư viện mới
   (`@dnd-kit` hoặc tương đương) mà repo chưa có, và số mẫu của một người là hàng
   chục. Hai nút không thêm phụ thuộc nào, và test được bằng `userEvent.click`.

   **Không bỏ bước này.** Không có nó thì `PUT /note-templates/order` (Task 4) và
   `useReorderNoteTemplates` (Task 7) là code chết — đã viết, đã test, không ai gọi.
5. **Sanitize `body_html` bằng `sanitizeNoteHtml` trước khi gửi** — `RichTextEditor` đã sanitize ở `onChange` nên chỉ cần không phá điều đó; không được gửi HTML thô từ nơi khác.
6. Validate phía client **trước khi** gọi mutation: tên rỗng → hiện `t("noteTemplate.nameRequired")`, không gửi request. Thân rỗng (dùng `isEmptyNote` từ `@/lib/richText`) → `t("noteTemplate.bodyRequired")`.
7. Xoá phải qua `AlertDialog` xác nhận, dùng `noteTemplate.deleteConfirmTitle`/`deleteConfirmBody`.
8. Lỗi từ server hiện qua `Alert` + `errorMessage` từ `@/i18n/errors` — copy cách `TradeFormDialog` xử lý `errorMsg`.
9. `RichTextEditor` là component **không kiểm soát**: đổi mẫu đang sửa thì phải bump một `key` để nó dựng lại, y như `editorKey` của `TradeFormDialog`. Không có `key` thì bấm "Sửa" mẫu thứ hai sẽ vẫn thấy nội dung mẫu thứ nhất.
10. **Không** hardcode màu; chỉ dùng biến ngữ nghĩa. Không dùng `shadow-*`.

- [ ] **Step 7: Chạy cả hai bộ test**

Run: `cd frontend && npx vitest run src/features/noteTemplates`
Expected: PASS toàn bộ (5 hooks + 3 menu + 6 dialog).

Nếu ca "Esc không đóng dialog cha" đỏ: Radix cần dialog lồng được **mount trong** cây của dialog cha (nó đã đúng như test dựng). Không "sửa" bằng cách chặn `onKeyDown` ở dialog cha — chặn Esc toàn cục sẽ phá cả đường đóng form bình thường. Đọc lại cách `AlertDialog` lồng trong `TradeFormDialog` đang làm.

- [ ] **Step 8: Cổng chặn**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: cả hai sạch.

- [ ] **Step 9: Dừng — KHÔNG commit**

---

### Task 9: Nối vào TradeFormDialog

Task cuối. Sau task này feature chạy end-to-end.

**Files:**
- Modify: `frontend/src/features/trades/TradeFormDialog.tsx`
- Test: `frontend/src/features/trades/tradeForm.test.tsx` (thêm 3 ca)

**Interfaces:**
- Consumes: `<TemplateMenu onInsert={...} />` (Task 8).
- Produces: không có gì cho task sau — đây là task cuối.

- [ ] **Step 1: Viết test fail trước**

Thêm vào `frontend/src/features/trades/tradeForm.test.tsx`. Đọc đầu file trước để dùng đúng helper render đã có ở đó (đừng dựng helper mới):

```tsx
// ─────────────────────────────────────────────────────────────────────────
// Chèn mẫu ghi chú

test("chèn mẫu vào ô ghi chú đang trống", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([
        {
          id: 1,
          name: "Setup A",
          body_html: "<p>checklist</p>",
          position: 1,
          created_at: "2026-09-09T00:00:00Z",
          updated_at: "2026-09-09T00:00:00Z",
        },
      ]),
    ),
  );
  // <-- dùng helper render form đã có trong file này
  renderForm();

  await userEvent.click(await screen.findByRole("button", { name: /chèn mẫu/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Setup A" }));

  await waitFor(() => expect(screen.getByLabelText(/ghi chú/i)).toHaveTextContent("checklist"));
});

// Quyết định 7 của spec: chèn thêm vào CUỐI, không thay thế. Chữ người dùng đã
// gõ không bao giờ được mất.
test("chèn mẫu khi ô ghi chú đã có chữ thì chữ cũ còn nguyên ở TRÊN", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([
        {
          id: 1,
          name: "Setup A",
          body_html: "<p>checklist</p>",
          position: 1,
          created_at: "2026-09-09T00:00:00Z",
          updated_at: "2026-09-09T00:00:00Z",
        },
      ]),
    ),
  );
  renderForm();

  const notes = screen.getByLabelText(/ghi chú/i);
  await userEvent.click(notes);
  await userEvent.type(notes, "ghi chú của tôi");

  await userEvent.click(await screen.findByRole("button", { name: /chèn mẫu/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Setup A" }));

  await waitFor(() => {
    const text = screen.getByLabelText(/ghi chú/i).textContent ?? "";
    expect(text).toContain("ghi chú của tôi");
    expect(text).toContain("checklist");
    expect(text.indexOf("ghi chú của tôi")).toBeLessThan(text.indexOf("checklist"));
  });
});

// Rủi ro #2 ở spec §10, và chú thích của patchFromDirty nói đúng nó: quên đánh
// dấu dirty thì field "lặng lẽ không bao giờ lưu, không có lỗi nào bật ra".
test("chèn mẫu khi SỬA lệnh cũ thì notes được gửi lên trong PATCH", async () => {
  let patched: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([
        {
          id: 1,
          name: "Setup A",
          body_html: "<p>checklist</p>",
          position: 1,
          created_at: "2026-09-09T00:00:00Z",
          updated_at: "2026-09-09T00:00:00Z",
        },
      ]),
    ),
    http.patch(`${BASE}/trades/:id`, async ({ request }) => {
      patched = (await request.json()) as Record<string, unknown>;
      return envelope({});
    }),
  );
  // <-- render form ở chế độ SỬA (truyền `trade`), dùng helper của file này
  renderFormForEdit();

  await userEvent.click(await screen.findByRole("button", { name: /chèn mẫu/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Setup A" }));
  await userEvent.click(screen.getByRole("button", { name: /lưu/i }));

  await waitFor(() => expect(patched).not.toBeNull());
  expect(patched).toHaveProperty("notes");
  expect(String(patched!.notes)).toContain("checklist");
});
```

**Ba chỗ phải khớp thực tế, không đoán:** tên helper render (`renderForm`/`renderFormForEdit` là placeholder — dùng tên thật trong file), `BASE`/`envelope` (có thể đã khai báo sẵn ở đầu file), và cách `RichTextEditor` hiển thị trong jsdom. Nếu Quill không chạy được trong jsdom thì `rich-text-editor.test.tsx` đã có cách xử lý — **đọc file đó trước** và làm theo, có thể phải khẳng định trên giá trị form thay vì DOM của editor.

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `cd frontend && npx vitest run src/features/trades/tradeForm.test.tsx -t "chèn mẫu"`
Expected: FAIL — không tìm thấy nút "Chèn mẫu".

- [ ] **Step 3: Thêm `insertTemplate` vào TradeFormDialog**

Trong `frontend/src/features/trades/TradeFormDialog.tsx`, thêm hàm này (cạnh chỗ khai báo `editorKey`, dòng ~260):

```tsx
  // Chèn mẫu ghi chú bằng cách NỐI HTML rồi bump editorKey.
  //
  // RichTextEditor là component KHÔNG kiểm soát: nó đọc defaultValue đúng một
  // lần lúc dựng và không có API nào chèn từ ngoài. Dựng lại editor là cơ chế
  // sẵn có của form này (xem editorKey ở nút "Lưu và thêm tiếp"), nên chèn mẫu
  // dùng lại đúng nó thay vì mở một API mệnh lệnh mới trên component dùng chung.
  //
  // Nối vào CUỐI, không thay thế: chữ người dùng đã gõ không bao giờ mất. Và
  // vì nối vào cuối nên không cần biết con trỏ ở đâu — đó là điều kiện để việc
  // dựng lại editor không làm mất gì.
  //
  // shouldDirty BẮT BUỘC: patchFromDirty chỉ gửi field đã dirty, nên thiếu cờ
  // này thì sửa một lệnh cũ sẽ KHÔNG lưu được ghi chú vừa chèn, và không có
  // lỗi nào bật ra.
  function insertTemplate(bodyHtml: string) {
    const current = getValues("notes");
    setValue("notes", current === "" ? bodyHtml : current + bodyHtml, { shouldDirty: true });
    setEditorKey((k) => k + 1);
  }
```

Kiểm `getValues` và `setValue` đã được destructure từ `useForm` chưa; nếu chưa thì thêm vào.

- [ ] **Step 4: Gắn TemplateMenu cạnh nhãn Ghi chú**

Sửa khối ở `TradeFormDialog.tsx:572-574` từ:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{translate("tradeForm.notes")}</Label>
```

thành:

```tsx
          <div className="flex flex-col gap-1.5">
            {/*
              Nút chèn mẫu nằm CÙNG HÀNG với nhãn, căn phải: nó là việc làm
              trước khi gõ ghi chú, nên đặt ở nơi mắt đã hướng tới khi bắt đầu
              điền ô này.
            */}
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="notes">{translate("tradeForm.notes")}</Label>
              <TemplateMenu onInsert={insertTemplate} />
            </div>
```

Và thêm import:

```tsx
import { TemplateMenu } from "@/features/noteTemplates/TemplateMenu";
```

- [ ] **Step 5: Chạy test để chắc nó pass**

Run: `cd frontend && npx vitest run src/features/trades/tradeForm.test.tsx`
Expected: PASS — 3 ca mới **và** toàn bộ ca cũ của file này.

- [ ] **Step 6: Chạy toàn bộ test frontend**

Run: `cd frontend && npx vitest run`
Expected: PASS toàn bộ. Đặc biệt chú ý `tradesPage.test.tsx` và `tradeTable.test.tsx` — chúng render `TradeFormDialog` nên giờ sẽ gọi `/api/note-templates`. Nếu chúng đỏ vì MSW không có handler cho route này, thêm handler mặc định trả `[]` vào `src/test/server.ts` (hoặc chỗ khai báo handler chung) thay vì sửa từng test.

- [ ] **Step 7: Cổng chặn cuối**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: cả hai sạch.

Run: `cd backend && make test && gofmt -l . && go vet ./...`
Expected: toàn bộ xanh, không file cần format.

- [ ] **Step 8: Kiểm bằng tay trên app thật**

Run: `make up-dev` (hoặc cách chạy dev thật của repo — đọc Makefile).

Kiểm đúng luồng của chủ sản phẩm:
1. Mở `/trades`, bấm thêm lệnh → thấy nút "Chèn mẫu" cạnh nhãn Ghi chú.
2. Menu rỗng → hiện lời mời tạo mẫu → mở được dialog quản lý.
3. Tạo mẫu bằng checklist thật ở spec §8.4, dùng nút checkbox của toolbar.
4. Đóng dialog quản lý bằng `Esc` → **form lệnh vẫn mở**, dữ liệu đang gõ còn nguyên.
5. Chèn mẫu → checklist hiện ra, **tick được** từng dòng.
6. Gõ thêm chữ, chèn mẫu lần hai → chữ cũ còn nguyên ở trên.
7. Lưu lệnh, mở lại để sửa → checklist và trạng thái tick còn đúng.
8. Xuất CSV → cột ghi chú hiện `[x] Venom` / `[ ] Reclaim`.
9. Đổi sang dark mode → menu và dialog đọc được, không có ô trắng lạc.

- [ ] **Step 9: Dừng — KHÔNG commit**

Để nguyên working tree unstaged. Báo lại: file đã đổi, kết quả test **thật** (số test pass/fail, không phỏng đoán), và bất cứ chỗ nào lệch khỏi plan.

---

## Ghi chú cho người thực thi

**Ba chỗ dễ sai nhất, theo thứ tự nguy hiểm:**

1. **`shouldDirty: true` khi chèn mẫu** (Task 9). Thiếu nó thì sửa lệnh cũ mất ghi chú, **không có lỗi nào bật ra**. Chú thích của `patchFromDirty` đã cảnh báo đúng lớp lỗi này.
2. **Esc trong dialog lồng** (Task 8). Đóng cả form lệnh là mất dữ liệu người dùng đang gõ. Có test riêng, đừng bỏ qua nó.
3. **`RichTextEditor` không kiểm soát** (Task 8 và 9). Không bump `key` thì nội dung cũ dính lại — cả khi chèn mẫu, cả khi đổi mẫu đang sửa.

**Chỗ plan cố ý để người thực thi tự kiểm** (đã ghi rõ tại từng bước, không phải placeholder):
- API thật của `service.Tristate` (Task 3)
- Cách repo trả lỗi id sai định dạng, và signature `DecodeJSON`/`OK` (Task 4)
- `api.put` có tồn tại trong `lib/api.ts` không (Task 7)
- Biến theme thật trong `docs/design/theme.css` (Task 6)
- `variant`/`size` thật của `Button` (Task 8)
- Tên helper render trong `tradeForm.test.tsx`, và cách Quill hoạt động trong jsdom (Task 9)

Mấy chỗ đó là **đọc rồi làm theo repo**, không phải tự quyết định thiết kế. Nếu thực tế lệch khỏi plan ở mức đổi thiết kế, **dừng và báo** thay vì tự sửa spec.
