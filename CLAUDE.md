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
