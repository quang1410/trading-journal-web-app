# Thiết kế — Mẫu ghi chú (note templates)

Ngày: 2026-09-09
Trạng thái: đã duyệt, chuyển sang implementation plan
Spec mẹ: [`2026-08-16-trading-journal-design.md`](2026-08-16-trading-journal-design.md)
Nền tảng: ô ghi chú rich text — `frontend/src/lib/richText.ts`,
`frontend/src/components/ui/rich-text-editor.tsx`

> Ghi chú: `richText.ts:183` và `richText.test.ts:212` trích một spec
> `2026-09-05-dynamic-journal-design.md` **không có trong repo**. Tài liệu này không
> dựa vào nó; mọi khẳng định về hành vi hiện hành đều trích thẳng code và test.

## 1. Vấn đề

Ô **Ghi chú** của form nhập lệnh là một ô soạn thảo trống. Người dùng mở nó ra và
không biết nên viết gì, nên ghi chú giữa các lệnh không cùng một khung — mỗi lệnh
ghi một kiểu, về sau không đọc lại được để so sánh.

Cái thiếu là một **khung có sẵn**: một checklist các điều kiện cần soát trước khi
vào lệnh, chèn vào ô ghi chú bằng một cú bấm, rồi người dùng chỉ việc tick và điền.
Khung đó phải **tái sử dụng được nhiều lần** và người dùng tự sửa được — checklist
giao dịch tiến hoá theo thời gian.

Ví dụ thật của chủ sản phẩm:

```
HTF PDA - FVG - H1
Asia/London  BSL/SSL liquidity - M15 Minor BSL
Liquidity sweep
DOL rõ
NQ/ES SMT
Reclaim
Displacement
Venom
Entry model
≥2R
Link trade:
H1
M15
M1
```

## 2. Quyết định chốt trong buổi thiết kế này

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Template là **HTML phẳng** (`body_html`), không phải danh sách mục có cấu trúc | `notes` đã lưu HTML đã sanitize. Template dùng đúng định dạng đó nên tái dùng nguyên `sanitizeNoteHtml` + `RichTextEditor`, không cần bảng thứ hai, không cần render mục → HTML rồi parse HTML → mục |
| 2 | Không làm bảng `note_template_items` | Bảng đó chỉ phục vụ phân tích ("tỷ lệ thắng khi có tick Venom") — nhu cầu chưa được yêu cầu. YAGNI. Thêm sau là một migration cộng thêm, không phải viết lại |
| 3 | Không lưu template dạng markdown | Sẽ phải thêm tầng dịch markdown → Quill HTML mà repo chưa có, và tạo nguồn sự thật thứ hai về định dạng |
| 4 | Template thuộc **user**, không thuộc account | Checklist ICT không phụ thuộc tài khoản nào. Tạo một lần, dùng ở mọi account, không phải tạo lại khi mở tài khoản mới |
| 5 | Xoá **cứng**, không soft delete | Quy tắc 6 của CLAUDE.md chỉ áp cho `trades` (xoá cứng lệnh làm sai đường equity). Template không nằm trong dãy lũy kế theo `stt` — giống `cash_flows` |
| 6 | Kiểm quyền sở hữu trong service, **không** thêm middleware `RequireNoteTemplate` | Query `WHERE id = ? AND user_id = ?` là đủ, ít tầng hơn, và khiến "template của người khác" không phân biệt được với "template không tồn tại" |
| 7 | Chèn **thêm vào cuối**, không thay thế, không chèn tại con trỏ | Không bao giờ mất chữ người dùng đã gõ. Và vì nối vào cuối nên không cần biết vị trí con trỏ — đây là điều kiện để quyết định 8 chạy được |
| 8 | Chèn bằng **bump `editorKey`**, không thêm ref mệnh lệnh vào `RichTextEditor` | `TradeFormDialog` đã có sẵn cơ chế này cho "Lưu và thêm tiếp". Không sửa một dòng nào trong component dùng chung — `rich-text-editor.tsx` đã đủ tinh tế |
| 9 | Định dạng là **checkbox** (`data-list="unchecked"`) | Tick được từng điều kiện đã thoả. `sanitizeNoteHtml` đã cho phép sẵn, và `noteToText` đã đổi thành `[x]`/`[ ]` nên CSV xuất ra đọc được ngay |
| 10 | Backend **không** sanitize `body_html`, chỉ giới hạn độ dài | Nhất quán với `notes` đang có: backend không sanitize, FE sanitize lúc lưu *và* lúc render. Xem §7 — đây là lựa chọn có ý thức, không phải bỏ sót |

## 3. Phạm vi

**Làm:** migration `0003`, `domain.NoteTemplate` + rules thuần, repo, seam + service,
5 endpoint, và phía frontend: hooks, dropdown chèn mẫu, dialog quản lý mẫu, chuỗi i18n.

**Không làm:** template điền sẵn các trường khác (symbol/timeframe/setup) — đã chốt là
chỉ ô ghi chú. Không làm template dùng chung giữa nhiều user. Không làm phân tích theo
mục đã tick.

## 4. Những thứ đã có, không làm lại

| Đã có | Bằng chứng |
|---|---|
| `notes` lưu HTML của Quill; `noteToHtml`/`noteToText`/`sanitizeNoteHtml` | `frontend/src/lib/richText.ts`, `richText.test.ts` |
| `sanitizeNoteHtml` giữ `data-list="checked\|unchecked"` trên `ol`/`ul`/`li` | `richText.ts:189-192` |
| `noteToText` đổi checkbox thành `[x] ` / `[ ] ` | `richText.ts:80-82` |
| `RichTextEditor` — editor không kiểm soát, sanitize cả lúc nạp và lúc đổi | `components/ui/rich-text-editor.tsx:146-158` |
| `editorKey` để buộc dựng lại editor | `features/trades/TradeFormDialog.tsx:260, 591` |
| `repository.ErrDuplicate` → `apperr.Conflict` (409) | `repository/store.go:62`, `service/account.go:68` |
| Seam interface + hai adapter (Postgres/memstore) ghim bằng contract test | `service/store.go`, `service/store_contract_test.go` |
| `RequireAuth` + `httpapi.UserID(ctx)` | `httpapi/middleware.go:34-46` |

## 5. Dữ liệu

Migration `backend/migrations/0003_note_templates.up.sql`:

```sql
CREATE TABLE note_templates (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT   NOT NULL,
  body_html  TEXT   NOT NULL,
  position   INT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trùng tên là lỗi người dùng cần thấy, không phải hai mẫu giống nhau nằm im.
-- lower() để "Setup A" và "setup a" là một.
CREATE UNIQUE INDEX note_templates_user_name ON note_templates (user_id, lower(name));

-- Danh sách luôn đọc theo (user_id, position, id).
CREATE INDEX note_templates_user_pos ON note_templates (user_id, position, id);
```

`0003_note_templates.down.sql`: `DROP TABLE note_templates;`

`ON DELETE CASCADE`: xoá user thì mẫu của họ đi theo. Không có ai khác tham chiếu tới
mẫu, nên cascade ở đây không kéo theo gì ngoài dự đoán.

`position` là `INT` do backend cấp, mặc định `max(position)+1` trong phạm vi user.
Frontend gửi lên thì bỏ qua — cùng kỷ luật với `stt` của trade (quy tắc 7).

## 6. Backend

### 6.1 Domain

`internal/domain/models.go` — thêm:

```go
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

`internal/domain/note_template_rules.go` — **thuần**, không import GORM/net/http:

- `Name`: trim; rỗng sau trim → lỗi validate; dài quá `MaxTemplateNameLen = 120` → lỗi.
- `BodyHTML`: trim; rỗng sau trim → lỗi (mẫu rỗng không chèn được gì);
  dài quá `MaxTemplateBodyLen = 64 * 1024` → lỗi.
- Hàm `ValidateNoteTemplate(t *NoteTemplate) error` ghi lại giá trị đã trim vào con trỏ,
  đúng kiểu `domain.ValidateTrade` đang làm với `Notes` (`trade_rules.go:180`).

### 6.2 Repository

`internal/repository/notetemplate.go`, theo khuôn `cashflow.go`:

```go
ListByUser(ctx, userID) ([]domain.NoteTemplate, error)   // ORDER BY position ASC, id ASC
Create(ctx, t) (domain.NoteTemplate, error)              // position = max+1 trong tx
UpdateOwned(ctx, id, userID int64, fields map[string]any) error
DeleteOwned(ctx, id, userID int64) error
ReorderOwned(ctx, userID int64, ids []int64) error       // một tx, gán position theo thứ tự mảng
```

Mọi method có `userID` trong `WHERE`. Không tìm thấy → `repository.ErrNotFound`.
`Create` trùng tên → `repository.ErrDuplicate` (index ở §5 lo phần phát hiện).

`Create` và `ReorderOwned` chạy trong transaction: `max(position)+1` đọc-rồi-ghi mà
không có tx thì hai request song song cấp cùng một `position`.

### 6.3 Seam

`internal/service/store.go` — thêm interface, rộng đúng bằng những gì service gọi:

```go
// NoteTemplateStore là nơi cất mẫu ghi chú.
//
// Mọi method nhận userID và tự lọc theo nó: quyền sở hữu là phần của HỢP ĐỒNG,
// không phải việc service nhớ kiểm. Thao tác trên mẫu của người khác trả
// repository.ErrNotFound — không phải Forbidden, để không tiết lộ mẫu đó có tồn tại.
type NoteTemplateStore interface {
	ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error)
	Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error)
	UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error
	DeleteOwned(ctx context.Context, id, userID int64) error
	ReorderOwned(ctx context.Context, userID int64, ids []int64) error
}
```

Hai adapter: `*repository.NoteTemplateRepo` (Postgres) và `memNoteTemplateStore` (test),
ghim bằng contract test dùng chung — đúng kỷ luật đã có trong `store_contract_test.go`.

### 6.4 Service

`internal/service/notetemplate.go`:

- `List(ctx, userID)`
- `Create(ctx, userID, in)` — validate qua domain; `ErrDuplicate` → `apperr.Conflict`
- `Update(ctx, userID, id, patch)` — patch dùng `Tristate[string]` như `service/trade.go`
  cho `name`/`body_html`; `ErrNotFound` → `apperr.NotFound`; `ErrDuplicate` → 409
- `Delete(ctx, userID, id)`
- `Reorder(ctx, userID, ids)` — mảng `ids` phải là **đúng tập** id của user, không thiếu
  không thừa; lệch → `apperr.Validation`. Kiểm ở service để một mảng cắt cụt không
  âm thầm dồn các mẫu còn lại về `position` sai.

### 6.5 HTTP

`internal/httpapi/notetemplate.go`, mount dưới `priv` (sau `RequireAuth`), **không**
dưới `/accounts/{id}` — mẫu thuộc user:

| Method | Path | Việc |
|---|---|---|
| GET | `/api/note-templates` | danh sách theo `position` |
| POST | `/api/note-templates` | tạo; 409 nếu trùng tên |
| PATCH | `/api/note-templates/{id}` | sửa tên và/hoặc thân |
| DELETE | `/api/note-templates/{id}` | xoá cứng |
| PUT | `/api/note-templates/order` | đổi thứ tự, body `{"ids":[3,1,2]}` |

Đăng ký trong `router.go` trong khối `priv` đã có, gác bằng `if d.NoteTemplate != nil`
theo đúng khuôn các handler khác.

DTO riêng, không marshal thẳng `domain.NoteTemplate`: struct domain sẽ mang tag GORM,
lôi ra API là rò rỉ tầng lưu trữ (cùng lý do `Enriched`/`KPI` có DTO ở Phase 3a).
Key JSON: `id`, `name`, `body_html`, `position`, `created_at`, `updated_at`.

## 7. Sanitize — ranh giới tin cậy

Backend hiện **không** sanitize HTML ghi chú. `TradeTable.tsx:317` sanitize lại lúc
render chính vì vậy, và `RichTextEditor` sanitize cả lúc nạp `defaultValue` từ DB
(`rich-text-editor.tsx:150`) — với chú thích nói rõ: một ghi chú cũ nhiễm thẻ lạ
"không được phép chạy chỉ vì nó đã nằm sẵn trong cơ sở dữ liệu".

Template đi theo **đúng ranh giới đó**:

- FE sanitize `body_html` trước khi POST/PATCH (`sanitizeNoteHtml`).
- FE sanitize lại trước khi render preview trong dialog quản lý.
- FE sanitize lại sau khi nối vào `notes` — việc này xảy ra tự nhiên vì
  `RichTextEditor` sanitize `defaultValue` lúc dựng.
- Backend chỉ kiểm **độ dài** (`MaxTemplateBodyLen`), không parse HTML.

Đây là lựa chọn nhất quán, không phải bỏ sót. Nếu sau này quyết định sanitize phía
server thì phải làm cho **cả** `notes` và `body_html` trong cùng một lần thay đổi —
sanitize riêng một trong hai sẽ tạo ra hai chuẩn.

## 8. Frontend

### 8.1 Vấn đề kỹ thuật và cách giải

`RichTextEditor` là component **không kiểm soát**: nó đọc `defaultValue` đúng một lần
lúc dựng, và `quillRef` là biến riêng bên trong. Không có cách nào chèn nội dung từ
ngoài vào.

Cách giải — dùng lại `editorKey` mà `TradeFormDialog` đã có:

```ts
function insertTemplate(bodyHtml: string) {
  const current = getValues("notes");
  const merged = current === "" ? bodyHtml : current + bodyHtml;
  setValue("notes", merged, { shouldDirty: true });
  setEditorKey((k) => k + 1); // editor dựng lại, đọc merged qua defaultValue
}
```

`shouldDirty: true` là bắt buộc: `patchFromDirty` chỉ gửi lên trường đã dirty, nên
chèn mẫu mà không đánh dấu thì sửa một lệnh cũ sẽ không lưu được ghi chú vừa chèn.

Đánh đổi đã nhận: editor dựng lại nên con trỏ về đầu. Với thao tác "chèn mẫu rồi bắt
đầu điền" thì đó gần như là hành vi mong muốn, và nó là giá để **không** phải mở một
API mệnh lệnh mới trên component dùng chung.

### 8.2 Các file

| File | Việc |
|---|---|
| `features/noteTemplates/types.ts` | `NoteTemplate`, `NoteTemplateCreate`, `NoteTemplatePatch` |
| `features/noteTemplates/hooks.ts` | `useNoteTemplates`, `useCreate/Update/Delete/Reorder` |
| `features/noteTemplates/TemplateMenu.tsx` | dropdown "Chèn mẫu" |
| `features/noteTemplates/TemplateManagerDialog.tsx` | CRUD + soạn thân mẫu |
| `lib/queryKeys.ts` | `noteTemplates: ["note-templates"]` |
| `i18n/strings.ts` | chuỗi UI mới (vi + en) |
| `features/trades/TradeFormDialog.tsx` | nút chèn + `insertTemplate` |

`qk.noteTemplates` **không** nằm dưới tiền tố `["accounts", id]`: mẫu thuộc user nên
đổi account không được làm mất cache, và invalidate `accounts` không được quét nó.

### 8.3 UX

Cạnh nhãn "Ghi chú" (`TradeFormDialog.tsx:573`), thêm nút phụ căn phải:

```
Ghi chú                          [ Chèn mẫu ▾ ]
┌──────────────────────────────────────────────┐
│ toolbar…                                     │
```

Menu: danh sách mẫu theo `position` → gạch ngang → **"Quản lý mẫu…"**.
Chưa có mẫu nào thì menu chỉ hiện một dòng mời tạo mẫu đầu tiên (dẫn thẳng vào dialog
quản lý), không hiện menu rỗng.

`TemplateManagerDialog` là **dialog lồng** trong form lệnh. Ràng buộc: `Esc` đóng lớp
trong trước và **không** được đóng form lệnh — mất lệnh đang gõ là hỏng dữ liệu người
dùng. Repo đã có tiền lệ hai lớp (`AlertDialog` xác nhận nằm trong `TradeFormDialog`),
theo đúng khuôn đó, và có test riêng cho ca này (§9).

### 8.4 Mẫu ví dụ lưu ra sao

Checklist ở §1 lưu thành:

```html
<p><strong>HTF PDA - FVG - H1</strong></p>
<ol>
  <li data-list="unchecked">Asia/London BSL/SSL liquidity - M15 Minor BSL</li>
  <li data-list="unchecked">Liquidity sweep</li>
  <li data-list="unchecked">DOL rõ</li>
  <li data-list="unchecked">NQ/ES SMT</li>
  <li data-list="unchecked">Reclaim</li>
  <li data-list="unchecked">Displacement</li>
  <li data-list="unchecked">Venom</li>
  <li data-list="unchecked">Entry model</li>
  <li data-list="unchecked">≥2R</li>
</ol>
<p>Link trade:</p>
<p>H1: </p>
<p>M15: </p>
<p>M1: </p>
```

Ba dòng H1/M15/M1 là đoạn văn thường, không tick: chúng là chỗ dán link, không phải
điều kiện cần thoả.

Hệ quả sẵn có: `noteToText` đổi checkbox thành `[x]`/`[ ]`, nên CSV xuất ra hiện
`[x] Venom` — đọc được ngay trong Excel. Không cần làm gì thêm; đó là lý do định dạng
checkbox thắng ở quyết định 9.

## 9. Test

**Backend:**

| Test | Ca phủ |
|---|---|
| `domain/note_template_rules_test.go` | table-driven: tên rỗng/toàn trắng/quá dài, thân rỗng/quá dài, trim ghi lại đúng |
| `repository/notetemplate_test.go` | Postgres thật: `position` tự tăng, trùng tên → `ErrDuplicate`, `*Owned` không chạm mẫu user khác |
| `service/store_contract_test.go` | **cùng** bộ ca chạy trên cả hai adapter |
| `service/notetemplate_test.go` | dịch lỗi → `apperr` đúng mã; `Reorder` với mảng thiếu/thừa id → 400 |
| `httpapi/notetemplate_test.go` | 5 route; mượn id của user khác → **404** (không phải 403) |

**Frontend:**

| Test | Ca phủ |
|---|---|
| `noteTemplates/hooks.test.tsx` | query + 4 mutation, invalidate đúng key |
| `noteTemplates/templateMenu.test.tsx` | menu rỗng mời tạo mẫu; danh sách đúng thứ tự; chèn gọi đúng callback |
| `noteTemplates/templateManagerDialog.test.tsx` | CRUD; **Esc không đóng form cha** |
| `trades/tradeForm.test.tsx` | thêm: chèn vào ô trống; chèn khi **đã có chữ** thì chữ cũ còn nguyên ở trên; trường `notes` được đánh dirty |

Chạy: `make test` (Go) · `npx tsc --noEmit && npm run build` (FE).

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Dialog lồng: `Esc` đóng cả form lệnh, mất lệnh đang gõ | Test riêng cho đúng ca này (§9); theo khuôn `AlertDialog` đã chạy |
| Chèn mẫu không đánh dirty → sửa lệnh cũ không lưu được ghi chú | `shouldDirty: true`, và một test khẳng định nó (§9) |
| `max(position)+1` đọc-rồi-ghi bị đua | Bọc transaction trong `Create` và `ReorderOwned` (§6.2) |
| Backend không sanitize `body_html` | Ranh giới tin cậy nói rõ ở §7; giới hạn độ dài chặn phình to; nhất quán với `notes` đang có |
| `Reorder` kiểm tập id rồi mới ghi, hai lời gọi không cùng transaction | **Chấp nhận.** Xoá một mẫu ở thiết bị khác đúng vào khe đó → 404 dù `ids` hợp lệ lúc gửi. Không hỏng dữ liệu (`ReorderOwned` tất-cả-hoặc-không); tải lại trang là hết. Đóng hẳn phải nới seam interface — không đáng |
