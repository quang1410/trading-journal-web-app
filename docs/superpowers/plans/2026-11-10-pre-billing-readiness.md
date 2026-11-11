# Sẵn sàng cho người dùng ngoài trước khi thu phí — Plan tổng

> **For agentic workers:** Đây là plan TỔNG gồm nhiều hạng mục độc lập. Mỗi hạng mục (R-1 → R-10)
> đi qua quy trình 6 bước của CLAUDE.md như một ticket riêng; bước BA viết `tickets/K-xx.md` và
> plan chi tiết theo TDD từ mục "Thiết kế" + "Nghiệm thu" ở đây. Không có bước commit.

Ngày: 2026-11-10 · Trạng thái: đề xuất, chờ chủ dự án duyệt · Đứng TRƯỚC plan
`2026-11-10-crypto-billing.md`.

**Goal:** Một trader lạ (ngoài Việt Nam) tự đăng ký bằng mã mời, tự xử lý được mật khẩu, tự xoá
được tài khoản, biết mình đang đồng ý điều gì, và dữ liệu của họ không mất khi hạ tầng lỗi. Khi
những điều đó đúng thì mới có tư cách thu tiền.

**Architecture:** Thêm một seam `Mailer` (gửi email qua HTTP API, adapter log ở dev) và hai bảng
`invites`, `password_resets`; mở `Register` theo mã mời thay cho luật "chỉ user đầu tiên". Trang
`/settings` gom đổi mật khẩu, export, xoá tài khoản. Pháp lý là hai trang tĩnh song ngữ. Vận hành
(backup, giám sát, header bảo mật) là cấu hình, không phải code nghiệp vụ.

**Tech Stack:** như CLAUDE.md. Email: Resend (HTTP API, free 3 000 mail/tháng, không SMTP) sau
interface `Mailer`. Giám sát: Sentry free + Better Stack/UptimeRobot (chủ dự án chọn, K-20).

**Spec:** `docs/roadmap/2026-10-31-roadmap-11-2026-01-2027.md` §3 (D1, D2), §5 nhánh GO tháng 1;
`docs/superpowers/specs/2026-11-10-crypto-billing-design.md` §1.

## 1. Đã có (không làm lại)

| Việc | Bằng chứng |
|---|---|
| Rate limit login/register/refresh/waitlist, lockout, cổng băm argon2 | K-04 `0f2fe90`, `httpapi/ratelimit.go` |
| Xoay refresh token trong một transaction | K-02 `5e89489` |
| Trần body JSON 2 MiB, ghi chú 131 072 ký tự, import 4 MB | K-03 `d60dc73` |
| E2E chạy được local (`make e2e`), CI chạy Go + FE unit | K-42, `.github/workflows/ci.yml` |
| Landing + waitlist có câu hỏi thị trường | `features/landing`, `waitlist_signups` |

## 2. Còn thiếu, theo thứ tự làm

Ưu tiên: **P0** = chưa xong thì chưa mời ai · **P1** = cần trước khi thu tiền · **P2** = nên có.
Cỡ: S ≤ 2 ngày · M 3–5 ngày · L > 1 tuần.

| # | Hạng mục | Ưu tiên | Cỡ | Vì sao chặn |
|---|---|---|---|---|
| R-1 | Hạ tầng email (`Mailer`) + xác minh email | P0 | M | Mọi thứ sau (quên mật khẩu, mời, nhắc hết hạn, biên lai) đều cần gửi mail |
| R-2 | Đăng ký bằng mã mời, bỏ luật "chỉ user đầu tiên" | P0 | M | Hiện không ai ngoài chủ dự án đăng ký được; luật cũ có TOCTOU |
| R-3 | Quên / đặt lại mật khẩu, đổi mật khẩu, `/auth/me` | P0 | M | Không có thì mỗi người quên mật khẩu là một lần sửa DB bằng tay |
| R-4 | Trang `/settings`: export toàn bộ dữ liệu, xoá tài khoản | P0 | M | Người dùng quốc tế (GDPR/UK) có quyền lấy và xoá dữ liệu; thu tiền mà không cho xoá là rủi ro |
| R-5 | Điều khoản dịch vụ + Chính sách quyền riêng tư, checkbox đồng ý khi đăng ký | P0 | S | Không có hợp đồng thì không có cơ sở thu tiền hay từ chối hoàn tiền |
| R-6 | Header bảo mật (CSP, HSTS, …) trong `vercel.json` | P1 | S | Ghi chú render HTML qua sanitizer tự viết; CSP là lớp chặn thứ hai |
| R-7 | Trần chống lạm dụng (số account, lệnh, import/ngày) độc lập với gói | P1 | S | Một người dùng free import 1 GB CSV là kéo sập pooler cho mọi người |
| R-8 | K-30: nhiều tab refresh cùng lúc bị đăng xuất | P1 | M | Lỗi người dùng thật gặp ngay ngày đầu, rồi họ nghĩ app mất dữ liệu |
| R-9 | Vận hành: backup có thử khôi phục (K-19), giám sát lỗi + uptime (K-20), dọn `rate_limit_counters` | P0 | S | Supabase Free tạm dừng DB sau 7 ngày không hoạt động; mất dữ liệu người trả tiền là hết sản phẩm |
| R-10 | Replay cho người ngoài: tắt kéo TradingView ở prod (`tvfeed` giả Origin), giữ nến đóng gói + Yahoo | P1 | S | D2 chưa chốt; để người lạ bấm "Cập nhật" kéo TradingView là rủi ro pháp lý và IP bị chặn |
| R-11 | Làm quen: checklist 3 bước (K-27) + link góp ý / liên hệ hỗ trợ trong app | P2 | M | Người lạ không có ai ngồi cạnh chỉ; không có kênh phản hồi thì không có dữ liệu cho D1 |
| R-12 | CI: `make e2e` + test bảng route `chi.Walk` (K-12); k6 smoke 20 người dùng ảo lên `/stats`, `/charts` | P2 | M | Nhánh route gắn có điều kiện; mời 20 người rồi mới biết pooler đủ hay không là muộn |

Sau R-12 mới bắt đầu `2026-11-10-crypto-billing.md`.

## 3. Thiết kế và nghiệm thu từng hạng mục

### R-1 · Hạ tầng email + xác minh email

**Thiết kế**
- `backend/internal/mailer/`: `type Message struct { To, Subject, Text, HTML string }`;
  `type Mailer interface { Send(ctx, Message) error }`; `ResendMailer{APIKey, From, HTTP}` gọi
  `POST https://api.resend.com/emails`; `LogMailer` in ra log (dev/test). Config `RESEND_API_KEY`,
  `MAIL_FROM`; thiếu key ở `ENV=prod` → `config.Load` lỗi; ở dev → `LogMailer`.
- Nội dung mail song ngữ theo `users.locale` (thêm cột `locale TEXT NOT NULL DEFAULT 'vi'`,
  gửi từ FE lúc đăng ký). Template là hàm Go trả `Message`, test snapshot.
- Migration: `users.email_verified_at TIMESTAMPTZ NULL`; bảng `email_tokens(id, user_id, purpose
  TEXT CHECK (purpose IN ('verify','reset')), token_hash BYTEA UNIQUE, expires_at, used_at)`.
  Token thô 32 byte random, chỉ lưu SHA-256. Verify TTL 24 h, reset TTL 1 h (R-3 dùng chung bảng).
- Route: `POST /auth/verify/request` (đăng nhập, rate limit 3/giờ), `POST /auth/verify` body
  `{token}` (công khai). Chưa xác minh thì vẫn dùng app được 7 ngày (banner nhắc), sau đó
  `RequireAuth` trả 403 code `1403` msg "hãy xác minh email để tiếp tục" trừ các route auth.
- FE: trang `/verify-email?token=…`, banner trong `AppShell` khi chưa xác minh.

**Nghiệm thu**
- Test Go: token sai/hết hạn/dùng rồi → 400; dùng đúng → `email_verified_at` set, token `used_at`
  set, dùng lại → 400. `LogMailer` nhận đúng `To` và link chứa token thô. Ngày thứ 8 chưa xác
  minh → `/accounts` trả 403, `/auth/refresh` vẫn 200.
- Test FE: banner có nút "Gửi lại", sau bấm hiện "đã gửi"; trang verify hiện kết quả.
- Sandbox Resend gửi được 1 mail thật tới hộp thư của chủ dự án (bằng chứng ghi vào ticket).

### R-2 · Đăng ký bằng mã mời

**Thiết kế**
- Migration `invites(id, code TEXT UNIQUE, email TEXT NULL, created_at, expires_at, used_by
  BIGINT NULL REFERENCES users(id), used_at)`. `code` 10 ký tự base32 không nhầm lẫn.
- Tạo mã: lệnh `go run ./cmd/invite -email a@b.com -days 14` (in mã + gửi mail mời qua `Mailer`
  nếu có email). Không có UI admin ở giai đoạn này.
- `Register(ctx, email, password, code, locale)`: tìm invite còn hạn, chưa dùng; nếu invite có
  `email` thì phải khớp. Tạo user và đánh dấu dùng trong **một transaction** với điều kiện
  `used_by IS NULL` (chặn hai request cùng mã). Bỏ `users.Count`. Đăng ký xong gửi mail xác minh
  (R-1).
- FE `/register?code=…` điền sẵn mã, có ô mã; lỗi mã sai hiện câu riêng; checkbox đồng ý điều
  khoản (R-5).

**Nghiệm thu**
- Mã sai/hết hạn/đã dùng → 403 code `1403` msg riêng; mã gắn email khác → 403; hai request song
  song cùng mã (test `-race`, 50 lần) → đúng một user. Luật "chỉ user đầu tiên" không còn trong
  code (grep `users.Count` ở `auth.go` = 0). `auth.spec.ts` e2e cập nhật đi qua mã mời.

### R-3 · Quên / đặt lại / đổi mật khẩu, `/auth/me`

**Thiết kế**
- `POST /auth/password/forgot {email}` công khai, rate limit 3/giờ theo IP và theo email; luôn
  trả 200 giống nhau (không lộ email tồn tại). Gửi mail có link `/reset-password?token=…`.
- `POST /auth/password/reset {token, password}`: kiểm token `purpose='reset'`, đặt hash mới,
  `RevokeAllForUser` mọi refresh token, đánh dấu token dùng.
- `POST /auth/password/change {current, new}` (đăng nhập): kiểm mật khẩu cũ qua cổng băm, đổi,
  thu hồi mọi phiên khác trừ phiên hiện tại.
- `GET /auth/me` → `{id, email, locale, email_verified, created_at}` để FE không đoán từ token.
- FE: link "Quên mật khẩu?" ở login, hai trang mới, mục đổi mật khẩu trong `/settings` (R-4).

**Nghiệm thu**
- Forgot với email lạ và email có thật trả body giống hệt và cùng thời gian ±50 ms (test như
  `TestWaitlistJoinResponsesAreIdentical`). Reset xong: refresh token cũ → 401; đăng nhập bằng mật
  khẩu mới → 200. Change với mật khẩu cũ sai → 401 và tính vào lockout của K-04.

### R-4 · `/settings`: export dữ liệu, xoá tài khoản

**Thiết kế**
- `GET /me/export` → ZIP (`archive/zip` chuẩn) gồm `accounts.csv`, `trades-<code>.csv` (dùng
  `exporter` sẵn có), `cash-flows.csv`, `period-notes.csv`, `note-templates.csv`, `README.txt`
  ghi múi giờ và ngày xuất. Giới hạn 1 lần/10 phút/user.
- `DELETE /me {password}`: xác nhận mật khẩu; xoá **cứng** theo thứ tự FK trong một transaction
  (journal_notes, trades kể cả `deleted_at`, cash_flows, accounts, note_templates, refresh_tokens,
  email_tokens, invites.used_by → NULL, users). Quy tắc 6 (soft delete trades) là cho đường
  equity của account còn sống; account đã xoá thì không còn equity để sai. Xoá xong xoá cookie.
- Trang `/settings` (nav item mới): khối Mật khẩu (R-3), Ngôn ngữ, Export, Vùng nguy hiểm (gõ
  lại email để mở nút xoá, `AlertDialog`).

**Nghiệm thu**
- Export của user A không chứa lệnh của user B (test 2 user). ZIP mở được, số dòng
  `trades-*.csv` = số lệnh chưa xoá. Delete sai mật khẩu → 401, không xoá gì; đúng → mọi bảng
  không còn `user_id` đó, login lại → 401, refresh → 401. e2e: xoá tài khoản rồi về landing.

### R-5 · Điều khoản + Quyền riêng tư + đồng ý khi đăng ký

**Thiết kế**
- Hai trang tĩnh `/terms`, `/privacy` (chunk riêng như landing), nội dung Markdown song ngữ ở
  `frontend/src/features/legal/{terms,privacy}.{vi,en}.md` render qua sanitizer sẵn có; có ngày
  hiệu lực ở đầu. Nội dung tối thiểu: dữ liệu thu (email, lệnh, ghi chú, IP cho rate limit),
  nơi lưu (Supabase, vùng), xoá/export (R-4), cookie (refresh HttpOnly), không bán dữ liệu,
  thanh toán crypto không hoàn tiền sau xác nhận (dùng lại ở plan billing), luật áp dụng.
- `users.terms_accepted_at TIMESTAMPTZ`; `Register` nhận `terms_accepted: true` bắt buộc.
- Footer landing và `/register` có link; `/settings` có link.

**Nghiệm thu**
- Register thiếu `terms_accepted` → 400. Hai trang hiện đúng theo locale, có `<h1>` và
  `document.title`. Chủ dự án đọc duyệt nội dung (nghiệm thu PO, không phải test máy).

### R-6 · Header bảo mật

**Thiết kế**
- `vercel.json` `headers` cho service web: `Strict-Transport-Security: max-age=63072000;
  includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(),
  geolocation=()`, `X-Frame-Options: DENY`, và `Content-Security-Policy: default-src 'self';
  script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src
  'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
  `'unsafe-inline'` cho style là bắt buộc vì Recharts và Quill đặt style inline; script không có
  ngoại lệ.
- API thêm `Cache-Control: no-store` cho mọi response có Bearer.

**Nghiệm thu**
- Chạy `npm run build && npx vite preview` với header giả lập (hoặc deploy preview) → mở
  Dashboard, Replay, ghi chú có ảnh/link: console không có lỗi CSP. Test Go: `/api/accounts` có
  `Cache-Control: no-store`. Mozilla Observatory đạt ≥ B+ trên preview (ghi ảnh vào ticket).

### R-7 · Trần chống lạm dụng

**Thiết kế** (hằng số trong `service`, không phụ thuộc gói Pro của plan billing)
- `MaxAccountsPerUser = 20`, `MaxTradesPerAccount = 50 000`, `MaxImportsPerUserPerDay = 20`
  (bộ đếm dùng chung của K-04, cửa sổ 24 h), `MaxNoteTemplatesPerUser = 50` (kiểm đã có?).
- Vượt → `apperr.Validation` với msg nêu rõ trần; import vượt → 429 qua `SharedRateLimit`.

**Nghiệm thu**
- Test bảng cho từng trần, kiểm cả biên (= trần được, +1 bị chặn). Import lần 21 trong ngày →
  429 có `Retry-After`.

### R-8 · K-30 nhiều tab refresh

**Thiết kế** (chọn một, BA quyết với chủ dự án)
- A. FE: gộp refresh giữa tab bằng Web Locks API (`navigator.locks.request("refresh", …)`), tab
  khác chờ rồi đọc token mới qua `BroadcastChannel`. Không đổi backend.
- B. BE: `Rotate` cho phép token vừa xoay trong 10 s được dùng lại một lần (grace), ghi
  `rotated_at`. Đổi hợp đồng seam.
- Đề xuất **A** vì không nới lỏng an toàn phía server.

**Nghiệm thu**
- e2e: mở 2 tab, hết hạn access token, cả hai cùng gọi API → không tab nào bị đăng xuất. Test
  tái sử dụng thật (token cũ gửi từ client khác sau khi đã xoay) vẫn thu hồi cả chuỗi.

### R-9 · Vận hành

- **Backup (K-19):** GitHub Action hằng ngày `pg_dump --format=custom` lên bucket riêng
  (Cloudflare R2 free 10 GB hoặc Backblaze B2), giữ 30 bản. Script `scripts/restore-check.sh`
  khôi phục vào Postgres Docker và đếm `users`, `trades`. Nghiệm thu: một lần khôi phục thật,
  số dòng khớp, ghi vào ticket.
- **Giám sát (K-20):** Sentry (Go + React, free) và uptime ping `/healthz` mỗi 5 phút, báo về
  email/Telegram chủ dự án. Nghiệm thu: cố ý ném lỗi ở preview → có event; tắt API → có cảnh báo.
- **Dọn bộ đếm:** cron Vercel `DELETE FROM rate_limit_counters WHERE expires_at < now()` hằng ngày
  (route `/api/cron/cleanup` với `RequireCronSecret`).
- **Supabase:** bật Point-in-Time Recovery nếu lên gói Pro; nếu còn Free, backup trên là bắt buộc.

### R-10 · Replay cho người ngoài

**Thiết kế**
- Config `REPLAY_TV_FEED=off` → `LiveBarService` chỉ dùng Yahoo + nến đã có trong DB; route
  `/replay/live/{symbol}` trả 503 code `1503` msg "nguồn dữ liệu trực tiếp tạm tắt". Cron
  `replay-bars` chỉ chạy Yahoo. Prod đặt `off` cho tới khi D2 chốt nguồn có license.
- Landing/FAQ không hứa "dữ liệu CME thời gian thực".

**Nghiệm thu**
- Test: `off` → handler không gọi `tvfeed.Fetch` (fake đếm = 0), Yahoo vẫn được gọi. FE hiện
  thông báo thay vì lỗi đỏ.

### R-11 · Làm quen và kênh phản hồi

- Checklist 3 bước trên Dashboard rỗng (tạo account → thêm lệnh / import → chấm điểm), biến mất
  khi xong; `EmptyState` chung (K-10). Link "Góp ý" ở sidebar mở `mailto:` hoặc form Tally/
  Google Form (chủ dự án chọn). Nghiệm thu: e2e người mới đi hết 3 bước trong 5 phút không cần
  hướng dẫn ngoài.

### R-12 · CI và tải

- `.github/workflows/ci.yml` thêm job `e2e` dùng `docker-compose.e2e.yml`; test
  `TestRouteTable` liệt kê route qua `chi.Walk` và so với golden file. k6 script
  `scripts/k6/dashboard.js`: 20 VU × 5 phút gọi `/stats` + `/charts` + `/trades?page=1` trên
  preview; nghiệm thu p95 < 800 ms, 0 lỗi 5xx, số kết nối pooler < 60 % trần.

## 4. Thứ tự và sprint đề xuất

| Sprint | Hạng mục | Mốc |
|---|---|---|
| S-A (2 tuần) | R-1, R-2, R-3, R-9 (backup trước, cần secret từ chủ dự án) | Mời được 3 người thân quen, họ tự đặt lại mật khẩu được |
| S-B (2 tuần) | R-4, R-5, R-6, R-7, R-10 | Mời 10–20 người từ waitlist, có điều khoản |
| S-C (2 tuần) | R-8, R-11, R-12 (+ K-20 nếu chưa) | Đo retention 2 tuần, chốt D1; nếu GO → bắt đầu plan billing |

## 5. Việc chủ dự án cần quyết hoặc cấp

1. Tài khoản Resend và domain gửi mail (cần DNS SPF/DKIM) — R-1.
2. Secret kết nối Supabase + bucket backup — R-9.
3. Chọn dịch vụ giám sát (đề xuất Sentry + Better Stack) — R-9.
4. Duyệt nội dung Điều khoản / Quyền riêng tư; cân nhắc tư vấn pháp lý về thu crypto — R-5.
5. Chốt R-8 phương án A hay B.
6. Kênh góp ý (mailto hay form) — R-11.

## 6. Thẻ kanban đề xuất (chưa thêm, chờ OK)

R-1..R-12 → K-56..K-67, cột **Cần làm**, ưu tiên theo bảng §2; K-19, K-20, K-30, K-27, K-12
hiện có được gộp vào R-9, R-8, R-11, R-12 (ghi tham chiếu, không tạo trùng). Plan billing
hiện tại đổi mã ticket thành K-68 và thêm `chờ: R-1..R-10`.
