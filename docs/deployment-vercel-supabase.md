# Deploy Vercel + Supabase

Tài liệu này triển khai frontend Vite và backend Go hiện có lên Vercel
Services, dùng Supabase làm PostgreSQL. Không cần chuyển project sang Next.js.

## Kiến trúc

```text
Browser -> Vercel /api/* -> Go service -> Supabase PostgreSQL
        -> Vercel frontend (các route React khác)
```

`vercel.json` ở thư mục root đã cấu hình hai service:

- `web`: build `frontend/` bằng Vite và fallback route React về `index.html`.
- `api`: build `backend/` bằng Go, entrypoint `cmd/api/main.go`.
- `/api/*` và `/healthz` được route vào `api` trước catch-all frontend.

## 1. Tạo Supabase project

1. Tạo một project Free tại [Supabase](https://supabase.com/dashboard).
2. Chọn region gần người dùng và region chạy Vercel nhất có thể.
3. Đặt database password mạnh và lưu ở password manager.
4. Lấy connection string trong **Connect**.

Dùng direct connection hoặc session pooler để chạy migration. Dùng transaction
pooler port `6543` cho runtime Vercel. Connection runtime cần có:

```text
sslmode=require
```

## 2. Chạy migration

Cài `golang-migrate` nếu máy chưa có, sau đó chạy từ thư mục repository:

```bash
migrate -path backend/migrations \
  -database 'postgres://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres?sslmode=require' \
  up
```

Kiểm tra trong Supabase SQL Editor rằng các bảng sau đã tồn tại:

```text
users
accounts
trades
cash_flows
refresh_tokens
schema_migrations
```

Không chạy migration bằng `docker-compose.yml` trên Vercel. Compose chỉ dùng
cho local development.

### Nếu đã chạy SQL thủ công

Nếu đã dán và chạy cả hai file `.up.sql` trong Supabase SQL Editor thì không
chạy lại lệnh `migrate ... up` ngay, vì các bảng đã tồn tại nhưng có thể chưa
có bảng theo dõi migration. Trước tiên kiểm tra:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;

select * from schema_migrations;
```

Nếu cả hai migration đã chạy đủ và `schema_migrations` chưa tồn tại, có thể
tạo trạng thái ban đầu cho golang-migrate:

```sql
create table if not exists schema_migrations (
    version bigint not null primary key,
    dirty boolean not null
);

insert into schema_migrations (version, dirty)
values (2, false)
on conflict (version) do update set dirty = excluded.dirty;
```

Chỉ chạy đoạn này khi chắc chắn cả `0001_init.up.sql` và
`0002_refresh_tokens.up.sql` đã chạy thành công. Nếu chỉ chạy file `0001`,
không đánh dấu version `2`.

## 3. Tạo Vercel project

1. Push repository lên GitHub.
2. Import repository vào Vercel.
3. Giữ project root ở thư mục root của repository.
4. Chọn Framework là **Services**.
5. Bật Go runtime nếu Vercel yêu cầu quyền runtime.
6. Để Vercel dùng `vercel.json` trong repository.

Vercel Services hiện là Beta nhưng có trên Hobby plan. Frontend và backend sẽ
dùng chung một domain, nên cookie refresh hiện tại tiếp tục hoạt động.

## 4. Environment Variables

Thêm các biến cho **Production**:

```text
DATABASE_URL=postgres://postgres.<PROJECT-REF>:<PASSWORD>@aws-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require
JWT_SECRET=<secret-ngau-nhien-dai>
ENV=prod
ACCESS_TTL=15m
REFRESH_TTL=720h
CORS_ORIGINS=
```

Sinh JWT secret bằng:

```bash
openssl rand -base64 48
```

Frontend không cần `VITE_API_BASE_URL`; mặc định trong code là `/api`. Không
đặt database URL hoặc JWT secret dưới tên bắt đầu bằng `VITE_`.

Nếu dùng Preview Deployment, nên tạo Supabase project thứ hai cho preview và
đặt `DATABASE_URL` khác trong môi trường Preview. Không cho preview ghi vào
database production.

## 5. Kiểm tra trước khi deploy production

Chạy local:

```bash
make test
make test-fe
```

Sau khi có Preview URL, kiểm tra:

```bash
curl -i https://<preview>.vercel.app/healthz
curl -i https://<preview>.vercel.app/api/meta/enums
```

Trong trình duyệt kiểm tra các luồng:

- Đăng ký và đăng nhập.
- Reload trang vẫn còn phiên đăng nhập.
- Tạo account và trade.
- Sửa, xoá mềm và restore trade.
- Mở trực tiếp `/dashboard`, `/accounts` và `/trades` rồi refresh.
- Kiểm tra user này không đọc được account của user khác.
- Kiểm tra số tiền decimal, timezone và các biểu đồ.

Chỉ sau khi Preview xanh mới deploy hoặc promote Production.

## Giới hạn Free

- Vercel Hobby có giới hạn invocation, CPU và bandwidth; đây là plan cho mục
  đích cá nhân, không thương mại.
- Supabase Free có 500 MB database và 5 GB egress.
- Supabase Free có thể pause project sau một thời gian không hoạt động.
- Supabase Free không thay thế chiến lược backup. Nên tự chạy `pg_dump` định
  kỳ nếu dữ liệu có giá trị.
