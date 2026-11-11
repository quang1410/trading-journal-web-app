# Thiết kế: thanh toán gói Pro bằng crypto (USDT/USDC)

Ngày: 2026-11-10 · Trạng thái: đề xuất, chờ chủ dự án duyệt · Quyết định lộ trình: D5

## 1. Bối cảnh và quyết định đã chốt

- Chủ dự án chốt: **chỉ một kênh thanh toán là crypto**, không VietQR, không thẻ.
- Tệp người dùng: trader **quốc tế**, không chỉ Việt Nam. Niêm yết giá bằng **USD**, nhận
  stablecoin (USDT TRC20 là mặc định, USDC tuỳ chọn) để không chịu biến động giá giữa lúc
  tạo hoá đơn và lúc nhận tiền.
- Mô hình: **trả trước theo kỳ** (prepaid), không thu định kỳ tự động. Hết hạn thì người dùng
  tự gia hạn. Gia hạn sớm **cộng dồn** vào ngày hết hạn hiện tại, không làm mất ngày còn lại.
- Hiện trạng: chưa có khái niệm plan, chưa có bảng payments, chưa có email. Auth chỉ cho
  user đầu tiên đăng ký (`auth.go`), nên trước khi bán thật phải xong nhánh GO tháng 1 của
  lộ trình (mời theo mã, xác minh email). Thiết kế này **không** phụ thuộc vào việc đó và có
  thể làm trước, nhưng chưa được bật ở production cho tới khi các mục P0 bảo mật xong.

## 2. Nhà cung cấp

Dùng cổng trung gian **NOWPayments** (hosted invoice + IPN webhook), không tự giữ private
key, không tự theo dõi blockchain. Lý do: hỗ trợ USDT TRC20/USDC, có sandbox, merchant Việt
Nam đăng ký được, phí ~0,5–1%. Toàn bộ chi tiết nhà cung cấp nằm sau một interface trong
service (`InvoiceProvider`) để sau này thay bằng BTCPay hay Coinbase Commerce mà không chạm
service/handler.

Luồng:

1. Người dùng bấm "Thanh toán bằng crypto" cho một gói → `POST /api/billing/checkout`.
2. Backend tạo dòng `payments` (status `pending`), gọi NOWPayments tạo invoice với
   `order_id = payments.id`, trả `invoice_url`. Frontend chuyển hướng tới đó.
3. Người dùng chọn coin và chuyển tiền trên trang của NOWPayments.
4. NOWPayments gọi `POST /api/billing/webhooks/nowpayments` (IPN) mỗi lần đổi trạng thái,
   ký HMAC-SHA512 bằng IPN secret, header `x-nowpayments-sig`.
5. Backend xác minh chữ ký, đối chiếu `order_id` và `price_amount` với dòng payments, rồi:
   - `finished` → **settle**: đánh dấu `paid` và cộng kỳ vào `users.plan_expires_at`,
     trong MỘT transaction, idempotent (gọi lại bao nhiêu lần cũng chỉ cộng một lần).
   - `partially_paid` → `underpaid`, không cộng. `expired`/`failed`/`refunded` → ghi trạng
     thái tương ứng. Các trạng thái trung gian (`waiting`, `confirming`, `confirmed`,
     `sending`) → cập nhật `provider_status`, không đổi `status`.
6. Người dùng quay về `/billing?checkout=done`; trang poll `GET /api/billing/me` tới khi
   thấy Pro.

## 3. Gói và giá (giá trị mặc định, đổi ở một chỗ)

| Mã gói | Giá | Kỳ |
|---|---|---|
| `pro_monthly` | 9 USD | 30 ngày |
| `pro_yearly` | 79 USD | 365 ngày |

Plan của user là **giá trị suy diễn**: `pro` khi `plan_expires_at > now`, ngược lại `free`.
Không có cột `plan` (quy tắc 2 CLAUDE.md).

## 4. Quyền theo gói (phạm vi tối thiểu)

| Tính năng | Free | Pro |
|---|---|---|
| Tài khoản giao dịch | 1 | Không giới hạn |
| Ghi lệnh, dashboard, ghi chú, mẫu ghi chú, export CSV | Có | Có |
| Import CSV | Không | Có |
| Replay | Giữ nguyên hiện trạng, **không** đưa vào Pro cho tới khi D2 chốt dữ liệu có license | |

Gate ở backend trả `402 Payment Required`, code `1402`. Frontend hiện lời mời nâng cấp kèm
link `/billing`. Chủ dự án và người được mời beta được cấp Pro bằng tay (SQL
`UPDATE users SET plan_expires_at = ...`), không cần cơ chế riêng.

## 5. Dữ liệu

- `users.plan_expires_at TIMESTAMPTZ NULL`.
- `payments`: `id, user_id, plan_code, amount_usd NUMERIC(12,2), period_days INT, status,
  provider, provider_invoice_id, provider_payment_id, pay_currency, actually_paid NUMERIC
  NULL, provider_status, created_at, updated_at, paid_at NULL`.
  `status ∈ {pending, paid, underpaid, expired, failed, refunded}`.
- `billing_webhook_events`: `id, provider, dedupe_key, payload JSONB, received_at`,
  UNIQUE `(provider, dedupe_key)`. Lưu nguyên văn mọi IPN hợp lệ để đối chiếu khi tranh chấp.

## 6. Ngoài phạm vi

- Email nhắc hết hạn (chưa có hạ tầng email). Thay bằng banner trong app khi còn ≤ 7 ngày.
- Hoàn tiền tự động, coupon, affiliate, hoá đơn PDF.
- Gói team, nhiều người dùng một account.
- Thay đổi lời hứa "miễn phí giai đoạn đầu" ở landing chỉ đổi text, không đổi luật đăng ký.

## 7. Rủi ro và cách xử lý

- **Webhook giả**: chỉ tin IPN có chữ ký đúng; thêm kiểm `order_id` thuộc về payment đang
  `pending` và `price_amount` khớp. Sai một trong ba → 400, không ghi gì.
- **Gọi lại / trùng**: `Settle` idempotent bằng điều kiện `status = 'pending'` trong transaction
  và UNIQUE trên `billing_webhook_events`.
- **Trả thiếu**: để `underpaid`, không cộng ngày; trang `/billing` hiện trạng thái để người
  dùng liên hệ. Xử lý tay.
- **Pháp lý**: nhận crypto cho dịch vụ còn xám ở Việt Nam. Trang `/billing` ghi rõ "không hoàn
  tiền sau khi giao dịch đã xác nhận". Cần tham khảo tư vấn trước khi mở bán thật.
