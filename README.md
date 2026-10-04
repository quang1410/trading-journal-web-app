# Trading Journal

Web nhật ký giao dịch, số hoá file Excel *Nhật Ký Giao Dịch* có sẵn. Mọi công thức —
chấm điểm lệnh, lũy kế, drawdown, streak, KPI, các biểu đồ dashboard — được trích thẳng từ
công thức Excel gốc rồi viết lại bằng Go, có test đối chiếu với số liệu của file Excel.

Ứng dụng dành cho **một người dùng**: chỉ user đầu tiên đăng ký được, sau đó đăng ký tự đóng.

## Tính năng

- **Tài khoản giao dịch** — nhiều tài khoản, phân loại quỹ/cá nhân, vòng thi, trạng thái;
  mỗi tài khoản có vốn ban đầu, rủi ro mỗi lệnh, timezone riêng và lịch sử nạp/rút.
- **Nhật ký lệnh** — thêm/sửa/xoá lệnh (xoá mềm, có thùng rác để khôi phục), chấm điểm
  vào lệnh / trong lệnh / thoát lệnh / tâm lý, thời gian giữ lệnh, ghi chú rich text và
  mẫu ghi chú (checklist) dùng lại được.
- **Dashboard** — 27 KPI và 13 nhóm biểu đồ: đường equity, drawdown, thống kê theo setup,
  symbol, timeframe, hướng lệnh, thứ, tuần, ngày, heatmap tháng, phân phối R, phân phối thời
  gian giữ lệnh, radar tâm lý, lợi nhuận lý thuyết so với thực tế.
- **Tổng kết theo kỳ** — tab Ngày/Tuần với thẻ tổng kết và ghi chú riêng cho từng kỳ.
- **Import/Export CSV** — nhập lệnh từ CSV theo header của file Excel gốc, xuất đúng tập
  lệnh đang lọc trên màn hình.
- Giao diện song ngữ Việt/Anh, theme sáng/tối.

## Stack

| Tầng | Công nghệ |
|---|---|
| Backend | Go 1.23, chi, GORM, PostgreSQL 16, golang-migrate |
| Frontend | Vite, React 19, TypeScript, TanStack Query v5, shadcn/ui, Tailwind v4, Recharts, i18next |
| Test | `go test` + testcontainers, Vitest + Testing Library + MSW, Playwright (E2E) |
| Hạ tầng | Docker Compose (local), Vercel + Supabase (production) |

## Chạy local

Cần: Docker, Go 1.23 (để chạy test backend), Node 22 (`.nvmrc`; Node < 20 bị chặn — xem
[Lưu ý](#lưu-ý)).

```bash
cp .env.example .env
# Đặt JWT_SECRET trong .env — API từ chối khởi động nếu thiếu
openssl rand -base64 48

make up        # db + migrate + api + web (bản build nginx)
```

| Service | Địa chỉ |
|---|---|
| Web | http://localhost:8080 |
| API | http://localhost:8000 (`/healthz`, `/api/...`) |
| Postgres | `localhost:5432`, user/pass/db đều là `journal` |

Mở web, đăng ký tài khoản đầu tiên, tạo tài khoản giao dịch rồi bắt đầu nhập lệnh.

### Chế độ dev (hot reload frontend)

```bash
make up-dev    # thay nginx bằng Vite dev server ở http://localhost:5173
```

Hoặc chạy Vite trên máy host, trỏ proxy vào API đang chạy trong Docker:

```bash
cd frontend
npm install
npm run dev    # proxy /api → http://localhost:8000 (đổi bằng VITE_PROXY_TARGET)
```

Frontend phải gọi API **cùng origin** (qua proxy của Vite hoặc nginx): cookie refresh là
`HttpOnly` với `Path=/api/auth`, gọi thẳng cổng 8000 từ origin khác thì mỗi lần F5 sẽ bị
đẩy về trang đăng nhập.

### Dữ liệu mẫu

```bash
EMAIL=you@example.com PASSWORD=mat-khau-cua-ban ./scripts/seed-demo.sh   # cần jq
```

Script đi qua API thật (không INSERT thẳng vào DB) và mỗi lần chạy tạo một tài khoản demo
mới. `scripts/seed-ict.py` sinh dữ liệu theo mẫu nhật ký ICT/SMC.

### Các lệnh `make` khác

| Lệnh | Việc |
|---|---|
| `make down` | Dừng stack |
| `make logs` | Theo dõi log của API |
| `make migrate` | Chạy migration |
| `make tidy` | `go mod tidy` |

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `JWT_SECRET` | — | **Bắt buộc.** Không có giá trị mặc định |
| `ACCESS_TTL` | `15m` | Thời hạn access token |
| `REFRESH_TTL` | `720h` | Thời hạn refresh token |
| `ENV` | `dev` | `prod` bật cờ `Secure` cho cookie |
| `DATABASE_URL` | Postgres của Compose | Chỉ cần đặt khi chạy backend ngoài Compose |
| `CORS_ORIGINS` | rỗng | Danh sách origin, phân tách bằng dấu phẩy. Để trống khi frontend cùng origin với API |
| `PORT` | `8000` | Cổng của API |

## Test

```bash
make test-pure   # các package thuần: chấm điểm, KPI, aggregate, import/export, service — không cần Docker
make test        # toàn bộ backend, gồm test repository/HTTP trên Postgres thật — cần Docker
make lint        # gofmt + go vet
make test-fe     # tsc + Vitest + build frontend
make e2e         # Playwright trên stack Docker thật, project cách ly, DB sạch mỗi lần chạy
```

CI (`.github/workflows/ci.yml`) chạy `make lint`, test backend và `make test-fe` cho mỗi
push lên `main` và mỗi pull request.

## Cấu trúc thư mục

```
backend/
  cmd/api/              entrypoint của API
  internal/
    scoring/            chấm điểm lệnh                        ┐
    metrics/            trường suy diễn từng lệnh, lũy kế, KPI │ thuần — không DB,
    aggregate/          các nhóm biểu đồ dashboard            ┘ không HTTP
    importer/ exporter/ csvformat/   đọc/ghi CSV
    domain/             luật nghiệp vụ, validate
    service/            nghiệp vụ, phụ thuộc interface Store
    repository/         GORM + Postgres
    httpapi/            router chi, handler, middleware
    auth/ config/ apperr/
  migrations/           SQL migration (golang-migrate)
frontend/
  src/features/         accounts, auth, dashboard, import, noteTemplates, trades
  src/i18n/strings.ts   toàn bộ chuỗi hiển thị, song ngữ vi/en
  e2e/                  test Playwright
docs/
  design/theme.css      design token — nguồn sự thật của giao diện
  superpowers/specs/    thiết kế hệ thống và từng tính năng
  superpowers/plans/    kế hoạch triển khai từng phase
scripts/                sinh dữ liệu mẫu
trading-journal-plan.md đặc tả nghiệp vụ trích từ công thức Excel
```

Mọi trường suy diễn (`net`, điểm, lũy kế, drawdown, tuần/tháng, thời gian giữ lệnh…) được
tính lại mỗi request trong ba package thuần, không lưu vào DB. Nhờ vậy sửa hay xoá một lệnh
cũ thì cả đường equity tự đúng lại.

## Tài liệu

- [`trading-journal-plan.md`](trading-journal-plan.md) — đặc tả nghiệp vụ: enum, bảng chấm
  điểm, công thức, KPI, edge case, golden fixture. Nguồn sự thật về số liệu.
- [`docs/superpowers/specs/2026-08-16-trading-journal-design.md`](docs/superpowers/specs/2026-08-16-trading-journal-design.md)
  — thiết kế hệ thống: kiến trúc, schema, API, chiến lược test.
- [`docs/deployment-vercel-supabase.md`](docs/deployment-vercel-supabase.md) — deploy lên
  Vercel + Supabase.
- [`CLAUDE.md`](CLAUDE.md) — các quy tắc bắt buộc khi sửa code.

## Deploy

Production chạy trên Vercel Services (`vercel.json`): `web` build `frontend/` bằng Vite,
`api` build `backend/` bằng Go, `/api/*` và `/healthz` được route vào `api`. Database là
Supabase PostgreSQL; migration chạy riêng bằng `golang-migrate`, không qua Compose. Hướng dẫn
từng bước ở [`docs/deployment-vercel-supabase.md`](docs/deployment-vercel-supabase.md).

## Đóng góp

Đọc [`CLAUDE.md`](CLAUDE.md) trước khi sửa code. Tóm tắt các quy tắc dễ vi phạm nhất:

- Tiền là `decimal.Decimal` ở backend và chuỗi ở frontend, không bao giờ `float64`/`number`
  (trừ lúc vẽ biểu đồ, chỉ trong `features/dashboard/prepare.ts`).
- Không thêm cột cho trường suy diễn.
- `scoring`, `metrics`, `aggregate` không được import GORM, `net/http`, `database/sql`, `context`.
- Lưu thời gian UTC, gom nhóm theo timezone của tài khoản; không hardcode `+7`.
- Chuỗi enum tiếng Việt là key chấm điểm — copy nguyên văn từ đặc tả, không sửa chữ.
- Định danh trong code viết tiếng Anh, comment và tài liệu viết tiếng Việt.
- Component chỉ dùng biến ngữ nghĩa của theme, không hardcode màu; không sửa `docs/design/theme.css`.
- Mỗi tính năng kèm test trong cùng thay đổi; sửa bug thì kèm regression test.

## Lưu ý

- **Node 16 làm sai số tiền một cách im lặng**: `Intl.NumberFormat` ép chuỗi số dài sang
  double và mất các chữ số cuối, nên `make test-fe` từ chối chạy với Node < 20. Dùng
  `nvm use`.
- Nội suy chuỗi i18n dùng **một** ngoặc nhọn `{n}`, không phải `{{n}}`.
- Đổi timezone của một tài khoản sẽ đổi cách gom nhóm theo ngày/tuần của toàn bộ lịch sử
  lệnh trong tài khoản đó.
