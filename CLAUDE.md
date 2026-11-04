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
   `weekday`, `day`, `hold_seconds` đều tính lúc đọc, không có cột trong DB.
3. **`internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần** — cấm import
   GORM, `net/http`, `database/sql`, `context`. Test của chúng chạy không cần Docker.
4. **Lưu UTC, tính theo `accounts.timezone` (IANA), hiển thị theo timezone của account.**
   Không hardcode `+7`. `main.go` phải import `_ "time/tzdata"`.
5. **Chuỗi enum tiếng Việt là key chấm điểm** — copy nguyên văn từ `trading-journal-plan.md` §1.
6. **Soft delete** trades qua `deleted_at`; xoá cứng làm sai đường equity.
7. `stt` do backend cấp, frontend gửi lên thì bỏ qua.
8. Lũy kế (`cum_*`, `running_peak`, `drawdown`, streak) luôn tính trên **toàn bộ** lệnh của
   account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI thì tính trên tập đã lọc.

   Hai điểm đã chốt khi đối chiếu file Excel gốc:

   - **Ngoại lệ:** `current_balance` và tổng nạp/rút **không chịu bộ lọc** — luôn tính
     trên toàn bộ lệnh + toàn bộ cash flow của account. Số dư tài khoản không phụ thuộc
     vào việc người dùng đang xem tháng nào. (Excel làm giống vậy: `Dashboard!V3`/`S3`
     `VLOOKUP` thẳng vào `Settings`, không đi qua pivot.)
     Đã cài đặt: `metrics.ComputeKPI(filtered, all, acc, flows)` — số dư tính
     trên `all`, phần KPI còn lại tính trên `filtered`.
   - **Không phải ngoại lệ:** chuỗi lý thuyết-vs-thực tế **giữ nguyên quy tắc 8** — không
     rebase về 0 tại đầu khoảng lọc. Excel *có* rebase (`Master!BN6`/`BO6` trừ đi
     `$BL$4`/`$BL$5`); web cố ý làm khác cho nhất quán với `cum_by_trade` và đường equity.

9. **Code tiếng Anh, comment tiếng Việt.** Mọi định danh trong code — tên biến, hàm, kiểu,
   package, file, key JSON, tên cột DB, route, message log/error, chuỗi test — đều viết bằng
   tiếng Anh. Comment và tài liệu (`docs/`, CLAUDE.md) viết bằng tiếng Việt.

   Ngoại lệ duy nhất: **dữ liệu nghiệp vụ hiển thị cho người dùng** vẫn là tiếng Việt —
   giá trị enum chấm điểm (quy tắc 5), header CSV import/export theo file Excel gốc, và
   text trên UI. Đó là dữ liệu, không phải định danh code.

   Thuộc ngoại lệ này: **`msg` của lỗi nghiệp vụ trả về client** (`apperr.Validation`,
   `apperr.Conflict`… và mọi lỗi được bọc bằng `apperr.Validation(err.Error())` —
   luật trong `domain/`, lỗi đọc CSV của `importer/`). Frontend hiện
   nguyên văn `msg` cho người dùng tiếng Việt (`i18n/errors.ts`), nên đây là text UI.
   Lỗi nội bộ (`fmt.Errorf("...: %w")` bọc lỗi hạ tầng) và log vẫn là tiếng Anh.

## Theme

`docs/design/theme.css` do chủ sản phẩm cấp, là nguồn sự thật, **không sửa**. Component chỉ dùng
biến ngữ nghĩa (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`), không hardcode hex.
Dark mode qua `[data-theme="dark"]`. Theme tắt hết `shadow-*` — phân tầng bằng border và bậc surface.
Lãi = teal, lỗ = `--status-error` (đỏ). **Chữ** lãi / kết quả tốt dùng `text-profit`
(`--profit-text` trong `bridge.css`: teal/900 ở theme sáng, `--primary` ở theme tối) —
`--primary` trần trên nền trắng chỉ đạt 2,55:1. Nút, thanh đo, đường biểu đồ vẫn `--primary`.
Tương tự, **chữ** lỗ / lỗi dùng `text-loss`, chữ cảnh báo dùng `text-warn` — không dùng
`text-destructive` / `text-warning` cho chữ (styleguard chặn); `bg-destructive` vẫn hợp lệ.

## i18n

Mọi chuỗi hiển thị nằm ở `frontend/src/i18n/strings.ts`, song ngữ `{ vi, en }` trong cùng
một mục — thêm một chuỗi là thêm đúng một dòng.

**Nội suy dùng MỘT ngoặc: `{n}`, không phải `{{n}}`.** `config.ts` đặt
`interpolation: { prefix: "{", suffix: "}" }`, khác mặc định của react-i18next. Viết hai
ngoặc vẫn biên dịch, vẫn qua mọi test khác, và hiện nguyên văn `{{n}} lệnh` lên màn hình —
nên test nào chạm chuỗi có tham số phải assert kết quả đã nội suy, không chỉ assert khoá.

Ranh giới chuỗi→số của tiền là `features/dashboard/prepare.ts` và CHỈ ở đó (`toPlot`).
Component không tự ép kiểu; cổng canh nằm ở `src/test/styleguard.test.ts`.

## Testing (bắt buộc)

Mỗi feature ship kèm test trong cùng lần thay đổi, không dời sang phase sau. Backend dùng
table-driven test cạnh code. Trước khi báo "xong" phải chạy test thật và báo kết quả thật.
Sửa bug thì thêm regression test fail trên code cũ, pass trên code mới.

Chạy: `make test` (Go) · `npx tsc --noEmit && npm run build` (FE).

## Roadmap

Phase 0 setup → 1 lõi tính toán thuần → 2 auth/accounts → 3 trade CRUD → 4 dashboard →
5 import CSV. Kế hoạch chi tiết ở `docs/superpowers/plans/`.

Từ 11/2026: lộ trình 3 tháng ở `docs/roadmap/2026-10-31-roadmap-11-2026-01-2027.md`, việc
hằng ngày theo `docs/roadmap/kanban.md`.

## Quy trình làm việc (bắt buộc)

Chủ dự án duyệt từng bước; Claude không tự chuyển sang ticket mới khi chưa được OK.

### Đầu phiên — khi được hỏi "đang làm tới đâu / định hướng thế nào"

Đọc `docs/roadmap/kanban.md`, `git status`, `git log` gần nhất và các ticket đang dở trong
`docs/roadmap/tickets/`, rồi báo cáo ngắn:

1. Đã xong gì (kể từ lần báo trước), commit nào.
2. Đang dở gì, đang ở bước nào của quy trình dưới đây.
3. Đề xuất ticket tiếp theo (lấy từ trên xuống trong cột **Cần làm**) và lý do.
4. Việc đang chờ chủ dự án (cột **Chờ chủ dự án**, quyết định D1–D5 trong lộ trình).

Rồi **dừng, chờ OK**. Không code trước khi được duyệt.

### Mỗi ticket đi qua 6 bước, theo thứ tự

Tên ở cột "Ai" là tên file trong `.claude/agents/` (vd `product-manager` →
`.claude/agents/product-manager.md`). Gọi bằng Agent tool với agent có `name:` trong file đó;
nếu phiên chưa nạp agent thì dùng `general-purpose` và bảo nó đọc file persona trước khi làm.
BA, QC và PO chỉ đọc và chạy test, không sửa code.

| # | Bước | Ai | Đầu ra |
|---|---|---|---|
| 1 | **BA check** | `product-manager` + `design-ux-architect` (ticket có UI thêm `design-ui-designer`) | `docs/roadmap/tickets/K-xx.md`: bối cảnh, phạm vi / ngoài phạm vi, tiêu chí nghiệm thu đo được, edge case, quy tắc CLAUDE.md bị chạm. Chỗ mơ hồ thì hỏi chủ dự án, không tự đoán |
| 2 | **Dev** | Claude | Code theo TDD: test fail trước, rồi sửa. Chạy test thật (mục Testing) |
| 3 | **Review** | skill `code-review` (so với nhánh `main`, spec là file ticket) | Sửa hết finding đúng; finding bỏ qua phải ghi lý do vào ticket |
| 4 | **QC/QA** | `testing-reality-checker` + `testing-evidence-collector`; thêm `testing-api-tester` (API), `testing-accessibility-auditor` (UI), `testing-performance-benchmarker` (truy vấn/bundle) khi liên quan | Đối chiếu từng tiêu chí nghiệm thu với bằng chứng (output test, file:dòng). Fail thì quay lại bước 2 |
| 5 | **PO nghiệm thu** | `product-manager` | Kết luận đạt / chưa đạt theo tiêu chí ở bước 1, ghi vào ticket |
| 6 | **Báo cáo + lên plan tiếp** | Claude | Báo chủ dự án: làm gì, kết quả test, kết quả review/QC/PO, rủi ro còn lại; đề xuất ticket kế tiếp. **Dừng, chờ OK** |

### Khi chủ dự án OK

- Commit ticket đó (một ticket một commit, message tiếng Việt theo kiểu các commit cũ).
  Push / mở PR chỉ khi được yêu cầu.
- Kanban: chuyển thẻ sang cột **Xong**, ghi ngày, commit hash, ghi chú ngắn.
- Ticket file: đánh dấu `Trạng thái: Xong`.
- Thẻ mới phát sinh trong lúc làm (finding chưa sửa, ý tưởng) → thêm vào **Cần làm** hoặc
  **Backlog** kèm mức ưu tiên, không âm thầm làm luôn.
