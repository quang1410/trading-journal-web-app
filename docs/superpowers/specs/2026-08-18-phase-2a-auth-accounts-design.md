# Thiết kế — Phase 2a: Auth, Accounts, Cash Flows (backend)

Ngày: 2026-08-18
Trạng thái: đã chốt
Spec mẹ: `docs/superpowers/specs/2026-08-16-trading-journal-design.md` (§3, §4, §5.1, §5.2, §5.4, §7, §7.2)

## 1. Phạm vi

Spec mẹ §10 gộp Phase 2 thành "Auth + accounts + cash_flows (BE + FE)". Khối lượng đó lớn hơn
một plan: nó gồm cả tầng repository/service chưa tồn tại, package `auth`, 11 endpoint, **và**
toàn bộ frontend dựng từ số không (chưa có Vite scaffold, chưa có service `web` trong compose,
chưa nối theme).

Vì vậy Phase 2 tách đôi:

- **2a (tài liệu này)** — backend: repository, service, auth, middleware, 11 endpoint, test
  chạy trên Postgres thật.
- **2b (spec riêng, viết sau)** — frontend: Vite scaffold, theme, trang đăng nhập, trang
  accounts. Viết khi đã có API chạy được để dựng giao diện đối chiếu, thay vì dựng theo hợp
  đồng trên giấy.

Sau 2a, `curl` phải đi trọn vòng: đăng ký → đăng nhập → tạo account → thêm cash flow → refresh
token → logout.

## 2. Bối cảnh đã có

Phase 0+1 để lại: ba package thuần (`scoring`, `metrics`, `aggregate`) đã xong và có test
không cần Docker; `domain` có `Account`/`Trade`/`CashFlow`; `httpapi` có envelope + router +
`/healthz`; migration `0001` đã tạo `users`, `accounts`, `trades`, `cash_flows` đúng hình dạng
của spec mẹ §5.

Chưa có: kết nối DB (`main.go` không mở DB), tầng repository, tầng service, package `auth`,
middleware xác thực.

## 3. Quyết định của phase này

Bốn điểm spec mẹ để mở, chốt tại đây:

| # | Vấn đề | Quyết định | Vì sao |
|---|---|---|---|
| 1 | Tách BE/FE | 2a backend trước, 2b frontend sau | Mỗi plan review được; FE dựng trên API thật |
| 2 | Lưu refresh token ở đâu | Bảng `refresh_tokens` + xoay vòng + **phát hiện tái sử dụng** | §7.2 nói "xoay vòng mỗi lần refresh"; xoay vòng chỉ cưỡng chế được khi có state phía server. Không có phát hiện tái sử dụng thì xoay vòng gần như vô nghĩa |
| 3 | Test tầng DB | Postgres thật qua testcontainers | Trả nợ hai minor bị hoãn của Phase 1 (NULL round-trip, cô lập account). Test `t.Skip()` khi thiếu env trông y hệt test pass |
| 4 | Ai được đăng ký | **Chỉ user đầu tiên**, sau đó đóng | Sản phẩm một người dùng. Không cần seed script, không cần env flag dễ quên tắt |

## 4. Package và ranh giới

```
handler (httpapi) → service → repository (GORM) → Postgres
                       └── auth (argon2id, JWT)
```

| Package | Nội dung | Test cần Docker |
|---|---|---|
| `internal/auth/` | argon2id hash/verify, JWT ký/parse, sinh token ngẫu nhiên | Không |
| `internal/repository/` | GORM: `UserRepo`, `AccountRepo`, `CashFlowRepo`, `RefreshTokenRepo` | Có |
| `internal/service/` | `AuthService`, `AccountService` — validate, transaction, điều phối | Có |
| `internal/httpapi/` | handler, `RequireAuth`, `RequireAccount`, DTO | Có |

**Hai sai lệch có chủ ý so với layout §4 của spec mẹ:**

1. Package HTTP giữ tên `httpapi`, không đổi thành `http`. Tên `http` đụng tên import của
   stdlib ở mọi call site; `httpapi` đã dựng từ Phase 0.
2. `auth` không nhận `context.Context` từ DB và không import GORM — nó chỉ làm mật mã. Nhờ vậy
   test của nó chạy không cần Docker.

**Bất biến phải giữ:** 2a **không thêm dòng nào** vào `scoring`/`metrics`/`aggregate`.
`make test-pure` phải vẫn xanh dưới 1 giây và không cần Docker. Đó là tín hiệu ranh giới còn
nguyên.

## 5. Migration `0002` — refresh_tokens

```sql
CREATE TABLE refresh_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- SHA-256 của token thô. Token thô KHÔNG BAO GIỜ được lưu.
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
```

Token thô là 32 byte ngẫu nhiên mã base64url, **không phải JWT**. Mỗi lần dùng đều phải tra DB
nên token tự mô tả không mang lại gì, đồng thời giữ khoá ký ra khỏi credential sống lâu nhất.

`0002_refresh_tokens.down.sql` chỉ `DROP TABLE refresh_tokens;`.

## 6. Luồng auth

### 6.1 `POST /api/auth/register`

Chỉ thành công khi bảng `users` rỗng. Ngược lại `403`, code `1403`,
msg `"đã có tài khoản, đăng ký đã đóng"`.

Băm mật khẩu bằng argon2id (tham số: time 1, memory 64MB, threads 4, keyLen 32, salt 16 byte
ngẫu nhiên; lưu ở dạng chuỗi encode chuẩn `$argon2id$v=19$m=...,t=...,p=...$salt$hash` để đổi
tham số sau này không phá hash cũ).

Trả `{access_token, user}` + set cookie refresh.

### 6.2 `POST /api/auth/login`

Sai email và sai mật khẩu trả **cùng một** `401 "email hoặc mật khẩu không đúng"`. Khi email
không tồn tại vẫn chạy verify argon2id trên một hash giả, để thời gian phản hồi không tiết lộ
email nào đã đăng ký.

### 6.3 `POST /api/auth/refresh`

1. Đọc cookie, băm SHA-256, tra `refresh_tokens.token_hash`.
2. Không thấy → `401`.
3. Thấy nhưng `revoked_at IS NOT NULL` → **token đã xoay vòng bị dùng lại**. Đây là dấu hiệu
   token bị đánh cắp: thu hồi **toàn bộ** token của user đó, trả `401`
   `"phiên đăng nhập không hợp lệ, đăng nhập lại"`.
4. `expires_at` đã qua → `401`.
5. Hợp lệ → thu hồi token hiện tại, phát cặp mới, set lại cookie.

Cookie: `httpOnly`, `SameSite=Lax`, `Secure` khi không phải môi trường dev, `Path=/api/auth`.

### 6.4 `POST /api/auth/logout`

Thu hồi token đang gửi lên (nếu có), xoá cookie, luôn trả `200`. Gọi hai lần không phải lỗi.

### 6.5 Access token

JWT HS256, claim `sub` = user id, `iat`, `exp`. TTL từ `ACCESS_TTL` (mặc định `15m`).
`REFRESH_TTL` mặc định `720h` (30 ngày).

**`JWT_SECRET` không có giá trị mặc định.** Rỗng thì API từ chối khởi động. Một fallback tiện
cho dev chính là đường một khoá ký đã biết đi thẳng vào production.

## 7. Middleware — cổng kiểm tra sở hữu

`RequireAuth`: đọc `Authorization: Bearer`, verify JWT, đặt `user_id` vào context. Thiếu hoặc
sai → `401` theo envelope.

`RequireAccount`: đọc `:id`, nạp account. Không có → `404`. Có nhưng `user_id` khác → **`403`**
(spec mẹ §7.2 nói rõ 403, chấp nhận việc này để lộ sự tồn tại của id). Hợp lệ → đặt
`domain.Account` vào context.

Phase 3 và 4 gắn thẳng lên hai middleware này. Đây là chỗ duy nhất cưỡng chế quy tắc "mọi
endpoint dữ liệu kiểm tra account thuộc về user trong token".

`DELETE /api/cash-flows/:id` không có `:account_id` trên URL nên không dùng được
`RequireAccount`. Handler của nó nạp cash flow → nạp account của cash flow đó → so `user_id`,
trả `404` khi không có và `403` khi thuộc user khác, đúng cùng quy ước. Service làm việc này
trong một transaction để không có khoảng hở giữa lúc kiểm tra và lúc xoá.

CORS: middleware whitelist đọc `CORS_ORIGINS`, mặc định rỗng nghĩa là không cho origin ngoài.
Dev đi qua proxy của Vite nên không chạm CORS; whitelist chỉ dành cho trường hợp deploy tách
domain (spec mẹ §11).

## 8. Endpoint (11)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/accounts
POST   /api/accounts
PATCH  /api/accounts/:id

GET    /api/accounts/:id/cash-flows
POST   /api/accounts/:id/cash-flows
DELETE /api/cash-flows/:id

GET    /api/meta/enums
```

`/api/meta/enums` thuộc §7 của spec mẹ, kéo vào 2a vì nó tốn khoảng 20 dòng và buộc
`domain/enums.go` phải có đủ danh sách hợp lệ — thứ mà review toàn nhánh Phase 1 đã ghi là còn
thiếu, và validate account/trade đằng nào cũng cần.

### 8.1 Validate

| Trường | Luật | Vi phạm |
|---|---|---|
| `code` | bắt buộc, ≤ 32 ký tự | `400` |
| `(user_id, code)` | duy nhất | `409` |
| `initial_balance` | `> 0` | `400` |
| `risk_per_trade` | `0 < x ≤ 1` | `400` |
| `currency` | bắt buộc, ≤ 8 ký tự | `400` |
| `timezone` | phải qua được `time.LoadLocation` | `400` |
| cash flow `amount` | `> 0` | `400` |
| cash flow `type` | `deposit` hoặc `withdraw` | `400` |
| cash flow `date` | `YYYY-MM-DD` | `400` |

`timezone` sai là lỗi âm thầm nguy hiểm nhất trong bảng: một tên IANA không hợp lệ làm hỏng
mọi phép gom nhóm theo ngày/tuần/tháng ở Phase 4 mà không báo gì.

`PATCH /api/accounts/:id` là partial update — dùng trường con trỏ, chỉ khoá nào có trong body
mới đổi.

### 8.2 Hai hệ quả ghi vào biên bản

1. **Sửa `initial_balance` hoặc `risk_per_trade` làm đổi ngược mọi giá trị R trong lịch sử của
   account đó.** Đúng theo spec — `OneR()` lấy từ account chứ không lấy từ lệnh. Không phải bug.
2. **Xoá cash flow là xoá cứng.** `cash_flows` không có `deleted_at`; quy tắc soft delete ở
   CLAUDE.md §6 chỉ áp cho `trades` vì xoá cứng lệnh làm sai đường equity. Cash flow không nằm
   trong dãy lũy kế theo `stt`.

### 8.3 Serialize

Tiền trả về JSON dưới dạng **chuỗi** (spec mẹ §5). Có tầng DTO riêng trong `httpapi`;
**không marshal thẳng struct của `domain`** — struct domain đổi hình dạng vì lý do nội bộ thì
không được kéo theo hợp đồng API.

## 9. Config bổ sung

`config.Config` thêm: `JWTSecret`, `AccessTTL`, `RefreshTTL`, `CORSOrigins`, `Env`.

`JWT_SECRET` rỗng → `Load` trả lỗi, `main.go` thoát. Các biến còn lại có mặc định an toàn.

## 10. Testing

| Tầng | Cách test | Docker |
|---|---|---|
| `auth` | unit: hash round-trip, sai mật khẩu, JWT hết hạn, JWT bị sửa chữ ký | Không |
| `repository` | testcontainers Postgres 16, chạy `migrations/` thật, truncate giữa các case | Có |
| `service` | như trên, qua repo thật | Có |
| `httpapi` | end-to-end qua router thật + DB thật | Có |

Ba thứ **bắt buộc** phải đóng trong 2a, đều là nợ hoãn lại từ Phase 1:

1. **NULL round-trip** của `Trade.Entry/Exit/Volume`: ghi trade để trống ba trường đó rồi đọc
   lại, khẳng định nil. Hiện tại bản sửa con trỏ mới chỉ có bằng chứng ở mức biên dịch.
   Đây là test **ánh xạ schema ở tầng repository**, dùng GORM ghi thẳng `domain.Trade` — 2a
   **không** kèm `TradeRepo` CRUD hay endpoint trades (những thứ đó là Phase 3). Chỉ cần một
   test khẳng định `Scan(nil)` không lỗi và trả về nil.
2. **Cô lập account khẳng định dương**: user B `GET /api/accounts` chỉ thấy account của B;
   B `PATCH` account của A → `403`.
3. **Đường replay chạy trọn vòng**: register → login → refresh → gửi lại token đã xoay vòng →
   khẳng định mọi phiên của user đó chết.

Thói quen bắt buộc, rút từ nhận xét xuyên suốt của review Phase 1 — *"dòng code được chạy qua,
nhưng hệ quả thì không"* (10/15 minor bị hoãn có đúng hình dạng này, và đó chính là cách bug
`net == 0` ở `rdist.go` sống sót qua chính test của nó): **khẳng định giá trị mà code tính ra,
không chỉ khẳng định rằng nó đã chạy.**

`make test` sẽ dài ra khoảng 20–30 giây và cần Docker. `make test-pure` **không đổi**. CI thêm
Docker (runner `ubuntu-latest` có sẵn).

## 11. Không làm trong 2a

- Endpoint trades (Phase 3), stats/charts (Phase 4).
- Toàn bộ frontend (2b).
- Đặt lại mật khẩu, xác minh email.
- Rate limit đăng nhập. Bỏ có chủ ý: ứng dụng một người dùng, đăng ký đã đóng. Thêm khi mở
  đăng ký cho người khác.
- Cache kết quả theo account (spec mẹ §3 đã nói: không làm bây giờ).

## 12. Xong khi

`docker compose up` rồi `curl` đi trọn vòng: đăng ký user đầu tiên → đăng ký lần hai bị 403 →
đăng nhập → tạo account → thêm cash flow → refresh → gửi lại token cũ và thấy mọi phiên chết →
logout. `make test` xanh toàn bộ, `make test-pure` vẫn xanh dưới 1 giây không cần Docker.
