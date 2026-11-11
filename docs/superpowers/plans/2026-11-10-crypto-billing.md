# Thanh toán gói Pro bằng crypto — Plan triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng mua gói Pro (tháng/năm) bằng USDT/USDC qua NOWPayments; webhook xác nhận
thì `users.plan_expires_at` được cộng kỳ; hai tính năng (tài khoản thứ hai, import CSV) chỉ
mở cho Pro.

**Architecture:** Catalogue gói và phép tính hết hạn là code thuần trong `internal/domain`.
`BillingService` chỉ biết hai seam: `BillingStore` (payments + cột plan của users, settle
idempotent trong một transaction) và `InvoiceProvider` (tạo invoice). Package
`internal/nowpayments` là adapter HTTP duy nhất biết tới NOWPayments, kể cả xác minh chữ ký
IPN. Handler HTTP mỏng, gate 402 ở service (tài khoản) và middleware (import). Frontend thêm
trang `/billing`, banner sắp hết hạn, và ánh xạ code 1402 thành lời mời nâng cấp.

**Tech Stack:** Go 1.23, chi, GORM, PostgreSQL 16, testcontainers; React 19, TanStack Query v5,
msw, vitest. Không thêm thư viện mới: HMAC dùng `crypto/hmac` + `crypto/sha512`.

**Spec:** `docs/superpowers/specs/2026-11-10-crypto-billing-design.md`

## Global Constraints

- Tiền là `decimal.Decimal`, cột `NUMERIC`; không `float64` (CLAUDE.md quy tắc 1).
- `plan` là giá trị suy diễn từ `plan_expires_at`, **không** có cột `plan` (quy tắc 2).
- `internal/domain` thuần: cấm GORM, `net/http`, `database/sql`, `context` (quy tắc 3).
- Thời gian lưu UTC; mọi hàm nhận `now time.Time` làm tham số, không gọi `time.Now()` trong domain/service.
- Code tiếng Anh, comment tiếng Việt; `msg` của `apperr.*` là text UI tiếng Việt (quy tắc 9).
- Mọi chuỗi UI nằm ở `frontend/src/i18n/strings.ts`, song ngữ, nội suy một ngoặc `{n}`.
- Không dùng form control gốc của trình duyệt; dùng `components/ui`.
- Không có bước commit trong plan này: để nguyên working tree, báo file đã đổi.
- Giá mặc định: `pro_monthly` 9 USD / 30 ngày, `pro_yearly` 79 USD / 365 ngày (spec §3).
- Free: tối đa 1 tài khoản giao dịch, không import CSV. Replay không gate (spec §4).

## Review Focus

Năm tình huống spec ngụ ý nhưng dễ bị bỏ sót; mỗi dòng đã được ghim bằng test ở task tương ứng.

1. **IPN gửi lại nhiều lần với `finished`** → chỉ cộng kỳ một lần (Task 2 contract test `Settle` lần hai trả `false`; Task 4 `TestHandleIPNFinishedTwiceExtendsOnce`).
2. **IPN có chữ ký đúng nhưng `price_amount` khác số tiền của payment** (kẻ tấn công có tài khoản NOWPayments riêng không làm được, nhưng lỗi cấu hình thì có) → 400, không settle (Task 4 `TestHandleIPNAmountMismatchRejected`).
3. **Gia hạn khi còn hạn** → cộng tiếp từ ngày hết hạn cũ, không từ `now` (Task 1 `TestNextExpiryStacksOnRemaining`).
4. **Pro hết hạn đúng lúc đang có 2 tài khoản** → vẫn đọc/ghi được cả hai, chỉ không tạo thêm (Task 5 `TestAccountCreateBlockedForFreeWithOneAccount` chỉ chặn Create; List không đổi).
5. **IPN tới trước khi người dùng quay lại app** → trang `/billing?checkout=done` poll và tự dừng khi thấy Pro (Task 7 `billing.test.tsx` "stops polling once pro").

---

### Task 1: Catalogue gói và phép tính hết hạn (domain thuần)

**Files:**
- Create: `backend/internal/domain/plan.go`
- Test: `backend/internal/domain/plan_test.go`

**Interfaces:**
- Produces:
  - `type PlanCode string`; const `PlanProMonthly PlanCode = "pro_monthly"`, `PlanProYearly PlanCode = "pro_yearly"`.
  - `type Plan struct { Code PlanCode; PriceUSD decimal.Decimal; PeriodDays int }`.
  - `func LookupPlan(code string) (Plan, bool)` — trim, so khớp chính xác.
  - `func Plans() []Plan` — thứ tự: monthly, yearly.
  - `func PlanOf(expiresAt *time.Time, now time.Time) string` — `"pro"` khi `expiresAt != nil && expiresAt.After(now)`, ngược lại `"free"`.
  - `func NextExpiry(current *time.Time, now time.Time, periodDays int) time.Time` — gốc = `current` nếu còn hạn, ngược lại `now`; cộng `periodDays*24h`; kết quả `.UTC()`.

- [ ] **Step 1: Viết test fail**

```go
func TestLookupPlan(t *testing.T) {
	p, ok := domain.LookupPlan(" pro_yearly ")
	require.True(t, ok)
	require.Equal(t, domain.PlanProYearly, p.Code)
	require.True(t, p.PriceUSD.Equal(decimal.NewFromInt(79)))
	require.Equal(t, 365, p.PeriodDays)
	_, ok = domain.LookupPlan("gold")
	require.False(t, ok)
}

func TestPlanOf(t *testing.T) {
	now := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	future, past := now.Add(time.Hour), now.Add(-time.Hour)
	require.Equal(t, "free", domain.PlanOf(nil, now))
	require.Equal(t, "free", domain.PlanOf(&past, now))
	require.Equal(t, "free", domain.PlanOf(&now, now)) // bằng now là hết hạn
	require.Equal(t, "pro", domain.PlanOf(&future, now))
}

func TestNextExpiryStacksOnRemaining(t *testing.T) {
	now := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	cur := now.Add(10 * 24 * time.Hour)
	require.Equal(t, now.Add(40*24*time.Hour), domain.NextExpiry(&cur, now, 30))
}

func TestNextExpiryFromNowWhenExpiredOrNil(t *testing.T) {
	now := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	past := now.Add(-time.Hour)
	require.Equal(t, now.Add(30*24*time.Hour), domain.NextExpiry(&past, now, 30))
	require.Equal(t, now.Add(365*24*time.Hour), domain.NextExpiry(nil, now, 365))
}
```

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd backend && go test ./internal/domain/ -run 'TestLookupPlan|TestPlanOf|TestNextExpiry' -v`
Expected: FAIL, `undefined: domain.LookupPlan`.

- [ ] **Step 3: Cài đặt `plan.go` theo Interfaces**

Giá khai báo bằng `decimal.NewFromInt`, không literal chuỗi. Comment đầu file ghi rõ đây là
nơi DUY NHẤT đổi giá.

- [ ] **Step 4: Chạy, xác nhận pass**

Run: `cd backend && go test ./internal/domain/ -count=1`
Expected: PASS.

---

### Task 2: Migration, PaymentRepo, BillingStore và contract test

**Files:**
- Create: `backend/migrations/0010_billing.up.sql`, `backend/migrations/0010_billing.down.sql`
- Create: `backend/internal/repository/payment.go`
- Modify: `backend/internal/repository/user.go` (thêm trường `PlanExpiresAt *time.Time \`gorm:"column:plan_expires_at"\``)
- Modify: `backend/internal/service/store.go` (thêm `BillingStore`, dòng assert `_ BillingStore = (*repository.PaymentRepo)(nil)`)
- Modify: `backend/internal/service/memstore_test.go` (thêm `memBillingStore`, dùng chung `rows` với `memUserStore` qua con trỏ)
- Modify: `backend/internal/service/store_contract_test.go` (thêm `billingStoreContract` + hai hàm `TestBillingStoreContract_InMemory/_Postgres`)

**Interfaces:**
- Consumes: `domain.Plan`, `domain.NextExpiry` (Task 1).
- Produces:

```go
// repository/payment.go
type PaymentRow struct {
	ID                int64           `gorm:"column:id;primaryKey"`
	UserID            int64           `gorm:"column:user_id"`
	PlanCode          string          `gorm:"column:plan_code"`
	AmountUSD         decimal.Decimal `gorm:"column:amount_usd"`
	PeriodDays        int             `gorm:"column:period_days"`
	Status            string          `gorm:"column:status"` // pending|paid|underpaid|expired|failed|refunded
	Provider          string          `gorm:"column:provider"`
	ProviderInvoiceID string          `gorm:"column:provider_invoice_id"`
	ProviderPaymentID string          `gorm:"column:provider_payment_id"`
	ProviderStatus    string          `gorm:"column:provider_status"`
	PayCurrency       string          `gorm:"column:pay_currency"`
	ActuallyPaid      *decimal.Decimal `gorm:"column:actually_paid"`
	PaidAt            *time.Time      `gorm:"column:paid_at"`
	CreatedAt, UpdatedAt time.Time
}
type PaymentRepo struct{ db *gorm.DB }
func NewPaymentRepo(db *gorm.DB) *PaymentRepo

// service/store.go
type SettleInput struct {
	PaymentID         int64
	ProviderPaymentID string
	PayCurrency       string
	ActuallyPaid      decimal.Decimal
	Now               time.Time
}
type BillingStore interface {
	CreatePayment(ctx context.Context, p repository.PaymentRow) (repository.PaymentRow, error)
	// SetInvoice ghi provider_invoice_id sau khi tạo invoice thành công.
	SetInvoice(ctx context.Context, paymentID int64, invoiceID string) error
	PaymentByID(ctx context.Context, id int64) (repository.PaymentRow, error)
	ListPaymentsByUser(ctx context.Context, userID int64) ([]repository.PaymentRow, error) // created_at DESC
	// UpdateProviderStatus ghi trạng thái trung gian; đổi status khi newStatus != "" và payment còn pending.
	UpdateProviderStatus(ctx context.Context, paymentID int64, providerStatus, newStatus string, now time.Time) error
	// Settle: trong MỘT transaction, nếu payment còn `pending` thì set paid + paid_at và
	// users.plan_expires_at = NextExpiry(hiện tại, now, period_days). Trả (newExpiry, true).
	// Đã paid rồi → (zero, false, nil). Không tìm thấy → repository.ErrNotFound.
	Settle(ctx context.Context, in SettleInput) (newExpiry time.Time, settled bool, err error)
	PlanExpiresAt(ctx context.Context, userID int64) (*time.Time, error)
	// RecordWebhookEvent trả false khi (provider, dedupeKey) đã có — KHÔNG lỗi.
	RecordWebhookEvent(ctx context.Context, provider, dedupeKey string, payload []byte, now time.Time) (recorded bool, err error)
}
```

- [ ] **Step 1: Viết migration**

`0010_billing.up.sql`:

```sql
ALTER TABLE users ADD COLUMN plan_expires_at TIMESTAMPTZ NULL;

CREATE TABLE payments (
    id                  BIGSERIAL     PRIMARY KEY,
    user_id             BIGINT        NOT NULL REFERENCES users(id),
    plan_code           TEXT          NOT NULL,
    amount_usd          NUMERIC(12,2) NOT NULL,
    period_days         INTEGER       NOT NULL,
    status              TEXT          NOT NULL DEFAULT 'pending',
    provider            TEXT          NOT NULL,
    provider_invoice_id TEXT          NOT NULL DEFAULT '',
    provider_payment_id TEXT          NOT NULL DEFAULT '',
    provider_status     TEXT          NOT NULL DEFAULT '',
    pay_currency        TEXT          NOT NULL DEFAULT '',
    actually_paid       NUMERIC(24,8) NULL,
    paid_at             TIMESTAMPTZ   NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT payments_status CHECK (status IN ('pending','paid','underpaid','expired','failed','refunded'))
);
CREATE INDEX payments_user_created ON payments (user_id, created_at DESC);

CREATE TABLE billing_webhook_events (
    id          BIGSERIAL   PRIMARY KEY,
    provider    TEXT        NOT NULL,
    dedupe_key  TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_webhook_events_unique UNIQUE (provider, dedupe_key)
);
```

`down.sql` drop hai bảng theo thứ tự ngược và `ALTER TABLE users DROP COLUMN plan_expires_at`.

- [ ] **Step 2: Viết contract test fail** trong `store_contract_test.go`, theo đúng khuôn `userStoreContract`: `eachStore func(t) (service.BillingStore, userID int64)`.

Các case bắt buộc (tên subtest):
- `create then by id` — round trip, `Status == "pending"`, `AmountUSD` giữ đúng 2 số lẻ.
- `settle once extends plan` — user chưa có hạn, `Settle` với `Now=T` → `newExpiry == T + 30d`, `settled == true`, `PlanExpiresAt == &newExpiry`, payment `paid`, `PaidAt == &T`.
- `settle twice is noop` — gọi lại cùng input → `settled == false`, hạn không đổi.
- `settle stacks on remaining days` — cài hạn `T+10d` (qua một `Settle` trước), `Settle` kỳ 30 → `T+40d`.
- `settle unknown payment` → `repository.ErrNotFound`.
- `update provider status keeps pending` — `UpdateProviderStatus(id, "confirming", "", now)` → status vẫn `pending`, `ProviderStatus == "confirming"`; rồi `("partially_paid", "underpaid", now)` → `Status == "underpaid"`; sau đó `Settle` → `settled == false` (chỉ pending mới settle được).
- `record webhook event dedupes` — lần 1 `true`, lần 2 cùng key `false`, không lỗi.
- `list by user is newest first`.

- [ ] **Step 3: Chạy, xác nhận fail biên dịch**

Run: `cd backend && go test ./internal/service/ -run TestBillingStoreContract -short -v`
Expected: FAIL, `undefined: service.BillingStore`.

- [ ] **Step 4: Cài đặt `PaymentRepo`** với `Settle` dùng `db.Transaction`: `SELECT ... FOR UPDATE` payment, kiểm `status == "pending"`, đọc `users.plan_expires_at`, tính bằng `domain.NextExpiry`, hai `UPDATE`. Lỗi dịch qua `translate(err)` như các repo khác.

- [ ] **Step 5: Cài đặt `memBillingStore`** dùng `sync.Mutex`; nhận `*memUserStore` để đọc/ghi `PlanExpiresAt` trên cùng map `rows`.

- [ ] **Step 6: Chạy cả hai adapter**

Run: `cd backend && go test ./internal/service/ ./internal/repository/ -run 'Billing|Payment' -count=1`
Expected: PASS cả `_InMemory` lẫn `_Postgres` (Postgres cần Docker).

---

### Task 3: Adapter NOWPayments (tạo invoice, xác minh IPN)

**Files:**
- Create: `backend/internal/nowpayments/client.go`, `backend/internal/nowpayments/ipn.go`
- Test: `backend/internal/nowpayments/client_test.go`, `backend/internal/nowpayments/ipn_test.go`

**Interfaces:**
- Produces:

```go
type Client struct {
	BaseURL   string // mặc định "https://api.nowpayments.io/v1"; sandbox "https://api-sandbox.nowpayments.io/v1"
	APIKey    string
	IPNSecret string
	HTTP      *http.Client // nil → client mặc định timeout 15s
}
type CreateInvoiceInput struct {
	OrderID        string // payments.id dạng chuỗi
	PriceUSD       decimal.Decimal
	Description    string
	IPNCallbackURL string
	SuccessURL     string
	CancelURL      string
}
type Invoice struct{ ID, URL string }
func (c Client) CreateInvoice(ctx context.Context, in CreateInvoiceInput) (Invoice, error)

type IPN struct {
	PaymentID     string          // json "payment_id" (số trong JSON → đọc qua json.Number)
	PaymentStatus string          // "payment_status"
	OrderID       string          // "order_id"
	PriceAmount   decimal.Decimal // "price_amount"
	PayCurrency   string          // "pay_currency"
	ActuallyPaid  decimal.Decimal // "actually_paid", 0 nếu thiếu
	Raw           []byte
}
var ErrBadSignature = errors.New("nowpayments: bad ipn signature")
// VerifyIPN: HMAC-SHA512(secret, JSON với key sắp xếp đệ quy, không khoảng trắng) so
// hex với sig bằng hmac.Equal; sai → ErrBadSignature. Parse bằng json.Decoder.UseNumber
// để số được in lại NGUYÊN VĂN khi sắp xếp lại.
func (c Client) VerifyIPN(body []byte, sig string) (IPN, error)
```

- [ ] **Step 1: Viết test IPN fail**

```go
const ipnSecret = "test-ipn-secret"
// Chữ ký tính trên body ĐÃ sắp xếp key: {"order_id":"7","payment_status":"finished","price_amount":9}
const ipnSig = "3866d03c0a10dbdca1deae6762dc6371ee4c63841e7253363c933a6c4e28c57033b213861638cb6e790a1237f37294b3f006c671abe0e6feec462cb8276e6768"

func TestVerifyIPNSortsKeysBeforeHashing(t *testing.T) {
	c := nowpayments.Client{IPNSecret: ipnSecret}
	body := []byte(`{"price_amount":9,"payment_status":"finished","order_id":"7"}`)
	ipn, err := c.VerifyIPN(body, ipnSig)
	require.NoError(t, err)
	require.Equal(t, "7", ipn.OrderID)
	require.Equal(t, "finished", ipn.PaymentStatus)
	require.True(t, ipn.PriceAmount.Equal(decimal.NewFromInt(9)))
}

func TestVerifyIPNRejectsBadSignature(t *testing.T) {
	c := nowpayments.Client{IPNSecret: ipnSecret}
	_, err := c.VerifyIPN([]byte(`{"order_id":"7","payment_status":"finished","price_amount":9}`), "00")
	require.ErrorIs(t, err, nowpayments.ErrBadSignature)
	_, err = c.VerifyIPN([]byte(`{"order_id":"8","payment_status":"finished","price_amount":9}`), ipnSig)
	require.ErrorIs(t, err, nowpayments.ErrBadSignature)
}

func TestVerifyIPNKeepsNumberTextVerbatim(t *testing.T) {
	// 9.10 phải được in lại là 9.10, không phải 9.1 — nếu không chữ ký sai dù secret đúng.
	c := nowpayments.Client{IPNSecret: ipnSecret}
	body := []byte(`{"price_amount":9.10}`)
	sig := hex.EncodeToString(hmacSHA512(ipnSecret, body)) // helper trong test
	_, err := c.VerifyIPN(body, sig)
	require.NoError(t, err)
}
```

- [ ] **Step 2: Viết test client fail** với `httptest.Server`: assert request tới `/invoice`, header `x-api-key`, body có `price_currency == "usd"`, `order_id == "42"`, `ipn_callback_url`; server trả `{"id":"inv1","invoice_url":"https://pay.example/inv1"}` → `Invoice{ID:"inv1", URL:...}`. Case thứ hai: server trả 403 → lỗi chứa `"nowpayments: create invoice: status 403"`.

- [ ] **Step 3: Chạy, xác nhận fail**

Run: `cd backend && go test ./internal/nowpayments/ -v`
Expected: FAIL, package chưa tồn tại.

- [ ] **Step 4: Cài đặt `client.go` và `ipn.go`**

Sắp xếp key: unmarshal body vào `map[string]any` với `UseNumber`, rồi `json.Marshal` (Go sắp xếp key của map, giữ `json.Number` nguyên văn; `json.Marshal` escape `<`,`>`,`&` — dùng `json.Encoder` với `SetEscapeHTML(false)` và cắt `\n` cuối). Thêm comment: thuật toán này theo tài liệu IPN của NOWPayments; **phải** kiểm lại bằng sandbox ở Task 6 Step 7.

- [ ] **Step 5: Chạy, xác nhận pass**

Run: `cd backend && go test ./internal/nowpayments/ -count=1`
Expected: PASS.

---

### Task 4: `BillingService` và `apperr.PaymentRequired`

**Files:**
- Modify: `backend/internal/apperr/apperr.go` (thêm `func PaymentRequired(msg string) *Error { Status: 402, Code: 1402 }`)
- Create: `backend/internal/service/billing.go`
- Test: `backend/internal/service/billing_test.go` (dùng `memBillingStore` + `fakeInvoiceProvider`)

**Interfaces:**
- Consumes: Task 1 domain, Task 2 `BillingStore`, Task 3 `nowpayments.IPN` (chỉ kiểu dữ liệu; service **không** import `nowpayments` — xem `IPNEvent` dưới).
- Produces:

```go
type InvoiceProvider interface {
	CreateInvoice(ctx context.Context, in InvoiceRequest) (InvoiceResult, error)
}
type InvoiceRequest struct {
	OrderID     string
	PriceUSD    decimal.Decimal
	Description string
}
type InvoiceResult struct{ ID, URL string }

const ProviderNOWPayments = "nowpayments"

type BillingService struct { /* store BillingStore; provider InvoiceProvider; Now func() time.Time */ }
func NewBillingService(store BillingStore, provider InvoiceProvider, now func() time.Time) *BillingService

type CheckoutResult struct { PaymentID int64; InvoiceURL string }
// Checkout: LookupPlan sai → apperr.Validation("gói không hợp lệ"); tạo payment pending;
// gọi provider với OrderID = strconv.FormatInt(paymentID, 10); lỗi provider → fmt.Errorf("create invoice: %w");
// thành công → SetInvoice.
func (s *BillingService) Checkout(ctx context.Context, userID int64, planCode string) (CheckoutResult, error)

type BillingStatus struct {
	Plan      string     // "free" | "pro"
	ExpiresAt *time.Time
	Plans     []domain.Plan
}
func (s *BillingService) Status(ctx context.Context, userID int64) (BillingStatus, error)
func (s *BillingService) IsPro(ctx context.Context, userID int64) (bool, error)
func (s *BillingService) ListPayments(ctx context.Context, userID int64) ([]repository.PaymentRow, error)

// IPNEvent là phần service cần từ một IPN đã xác minh chữ ký (handler chuyển từ nowpayments.IPN).
type IPNEvent struct {
	ProviderPaymentID string
	ProviderStatus    string
	OrderID           string
	PriceAmount       decimal.Decimal
	PayCurrency       string
	ActuallyPaid      decimal.Decimal
	Raw               []byte
}
// HandleIPN: OrderID không phải số / không có payment → apperr.NotFound("không tìm thấy giao dịch");
// PriceAmount != payment.AmountUSD → apperr.Validation("số tiền không khớp");
// RecordWebhookEvent(provider, ProviderPaymentID+":"+ProviderStatus) trả false → return nil (đã xử lý);
// map trạng thái: finished → Settle; partially_paid → "underpaid"; expired → "expired";
// failed → "failed"; refunded → "refunded"; còn lại → UpdateProviderStatus(…, "", now).
func (s *BillingService) HandleIPN(ctx context.Context, ev IPNEvent) error
```

- [ ] **Step 1: Viết test fail** (bảng, mỗi case một subtest):

- `TestCheckoutCreatesPendingAndReturnsInvoiceURL` — fake provider ghi lại `OrderID == "1"`, `PriceUSD == 9`; kết quả có `InvoiceURL`; store có payment `pending`, `ProviderInvoiceID == "inv1"`.
- `TestCheckoutRejectsUnknownPlan` — `apperr.As(err).Code == 1400`.
- `TestCheckoutProviderErrorLeavesPendingRow` — provider trả lỗi → err không phải `*apperr.Error`; vẫn có dòng pending (để đối chiếu sau).
- `TestHandleIPNFinishedExtendsPlan` — sau Checkout, IPN `finished` với `PriceAmount 9`, `Now = T` → `Status.Plan == "pro"`, `ExpiresAt == T+30d`.
- `TestHandleIPNFinishedTwiceExtendsOnce` — gửi hai lần cùng `ProviderPaymentID` → hạn không đổi, cả hai trả nil.
- `TestHandleIPNAmountMismatchRejected` — `PriceAmount 1` → code 1400, plan vẫn free.
- `TestHandleIPNUnknownOrderRejected` — `OrderID "999"` → code 1404.
- `TestHandleIPNPartiallyPaidMarksUnderpaid` — status payment `underpaid`, plan free.
- `TestHandleIPNIntermediateKeepsPending` — `confirming` → vẫn `pending`, `ProviderStatus == "confirming"`.

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd backend && go test ./internal/service/ -run 'TestCheckout|TestHandleIPN' -short -v`
Expected: FAIL, `undefined: service.NewBillingService`.

- [ ] **Step 3: Cài đặt `apperr.PaymentRequired` và `billing.go`** theo Interfaces.

- [ ] **Step 4: Chạy, xác nhận pass**

Run: `cd backend && go test ./internal/service/ ./internal/apperr/ -short -count=1`
Expected: PASS.

---

### Task 5: Gate theo gói — tài khoản thứ hai và import CSV

**Files:**
- Modify: `backend/internal/service/account.go` (thêm `func (s *AccountService) WithPlanGate(plans PlanReader, now func() time.Time) *AccountService`; trong `Create`, trước `validateAccount`: nếu gate bật, `PlanOf == "free"` và `len(ListByUser) >= FreeAccountLimit` → `apperr.PaymentRequired("gói Free chỉ có 1 tài khoản giao dịch, nâng cấp Pro để thêm")`)
- Modify: `backend/internal/service/store.go` (thêm `type PlanReader interface { PlanExpiresAt(ctx, userID int64) (*time.Time, error) }`; `BillingStore` đã thoả)
- Modify: `backend/internal/httpapi/middleware.go` (thêm `func RequirePro(svc *service.BillingService) func(http.Handler) http.Handler` — `IsPro(UserID(ctx))` false → `FailErr` với `apperr.PaymentRequired("import CSV chỉ có ở gói Pro")`)
- Test: `backend/internal/service/account_test.go`, `backend/internal/httpapi/middleware_test.go`

**Interfaces:**
- Consumes: `BillingService.IsPro` (Task 4), `PlanReader`.
- Produces: `const FreeAccountLimit = 1` trong `service/account.go`.

- [ ] **Step 1: Viết test fail**

- `TestAccountCreateBlockedForFreeWithOneAccount` — gate bật, user free đã có 1 account → Create thứ hai trả code 1402; `ListByUser` vẫn trả 1.
- `TestAccountCreateAllowedForPro` — `PlanExpiresAt = now+1h` → tạo được account thứ hai.
- `TestAccountCreateWithoutGateUnchanged` — không gọi `WithPlanGate` → tạo được nhiều account (giữ hành vi cũ cho mọi test hiện có).
- `TestRequireProReturns402ForFree` (httpapi): bọc một handler giả bằng chain `RequireAuth(signer)` → `RequirePro(svc)` trực tiếp, KHÔNG qua `Deps` (trường `Deps.Billing` chỉ có ở Task 6); `svc` dựng từ `memBillingStore`-tương-đương trong `httpapi_test` hoặc DB thật qua `testdb`. Free → 402, body `code == 1402`; pro → 200.

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd backend && go test ./internal/service/ -run 'TestAccountCreate' -short -v`
Expected: FAIL, `WithPlanGate undefined`.

- [ ] **Step 3: Cài đặt** theo Files.

- [ ] **Step 4: Chạy toàn bộ service + httpapi**

Run: `cd backend && go test ./internal/service/ ./internal/httpapi/ -count=1`
Expected: PASS, không test cũ nào đỏ (gate mặc định tắt).

---

### Task 6: HTTP handler, router, config, main

**Files:**
- Create: `backend/internal/httpapi/billing_handler.go`
- Modify: `backend/internal/httpapi/router.go` (thêm `Billing *service.BillingService`, `IPNVerifier IPNVerifier` vào `Deps`; gắn route)
- Modify: `backend/internal/config/config.go` (thêm `NOWPaymentsAPIKey`, `NOWPaymentsIPNSecret`, `NOWPaymentsBaseURL` mặc định prod, `AppURL`; đặt một trong hai key/secret mà thiếu cái kia → lỗi Load; có key mà `AppURL` rỗng → lỗi Load)
- Modify: `backend/cmd/api/main.go` (dựng `nowpayments.Client`, `service.NewBillingService`, gắn `WithPlanGate` cho `accountSvc` khi billing bật)
- Test: `backend/internal/httpapi/billing_handler_test.go`, `backend/internal/config/config_test.go`

**Interfaces:**
- Consumes: Task 3 `nowpayments.Client`, Task 4 service.
- Produces:

```go
// httpapi
type IPNVerifier interface { VerifyIPN(body []byte, sig string) (nowpayments.IPN, error) }
type BillingHandler struct { svc *service.BillingService; verifier IPNVerifier }
// Routes (trong nhánh priv, sau RequireAuth):
//   GET  /api/billing/me        → {"plan":"free|pro","expires_at":<RFC3339|null>,"plans":[{"code","price_usd":"9","period_days":30}]}
//   POST /api/billing/checkout  body {"plan":"pro_monthly"} → {"payment_id":1,"invoice_url":"..."}; rate limit SharedRateLimit(d.Limiter,"checkout",10,time.Hour)
//   GET  /api/billing/payments  → [{"id","plan":"pro_monthly","amount_usd":"9","status","pay_currency","created_at","paid_at"}]
// Route công khai (NGOÀI RequireAuth):
//   POST /api/billing/webhooks/nowpayments → đọc body tối đa MaxJSONBodyBytes; thiếu header x-nowpayments-sig
//        hoặc ErrBadSignature → 400 code 1400 msg "chữ ký webhook không hợp lệ"; còn lại → svc.HandleIPN; OK(w, {"received":true})
// Import: route one.Post("/import") bọc thêm RequirePro(d.Billing) KHI d.Billing != nil.
```

Toàn bộ nhánh billing chỉ gắn khi `d.Billing != nil && d.IPNVerifier != nil` (cùng quy ước "trường nil = không gắn").

- [ ] **Step 1: Viết test handler fail** theo khuôn `waitlistServer`/`twoUserServer`, DB thật, provider là fake trong test (`InvoiceProvider` trả URL cố định), verifier là `nowpayments.Client{IPNSecret: "s"}` và test tự ký body bằng cùng HMAC:

- `TestBillingMeStartsFree` — 200, `plan == "free"`, `plans` có 2 phần tử, `price_usd` là chuỗi `"9"` và `"79"`.
- `TestCheckoutThenIPNUpgradesToPro` — POST checkout → `invoice_url`; POST webhook body `{"order_id":"<id>","payment_id":555,"payment_status":"finished","price_amount":9,"pay_currency":"usdttrc20","actually_paid":9}` ký đúng → 200; GET me → `pro`; GET payments → 1 dòng `paid`.
- `TestWebhookBadSignatureIs400` — không chạm DB (đếm `billing_webhook_events` = 0).
- `TestWebhookNeedsNoAuth` — không gửi Bearer vẫn vào được (400 vì sai chữ ký, không phải 401).
- `TestCheckoutRequiresAuth` — không token → 401.
- `TestImportIs402ForFree` — gắn cả `Import` lẫn `Billing`; POST `/accounts/{id}/import` với user free → 402.
- Config: `TestLoadRejectsHalfNOWPaymentsConfig`, `TestLoadRequiresAppURLWhenBillingOn`.

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd backend && go test ./internal/httpapi/ -run 'Billing|Webhook|Checkout|ImportIs402' -v`
Expected: FAIL biên dịch (`Deps` chưa có `Billing`).

- [ ] **Step 3: Cài đặt handler, router, config, main.** Trong `main.go`, `nowpayments.Client` cũng được bọc thành `InvoiceProvider` bằng một adapter nhỏ trong `cmd/api` (hoặc hàm `nowpayments.Client.AsProvider(appURL string)` trả struct thoả `service.InvoiceProvider`, tự điền `IPNCallbackURL = AppURL + "/api/billing/webhooks/nowpayments"`, `SuccessURL = AppURL + "/billing?checkout=done"`, `CancelURL = AppURL + "/billing"`). Chọn cách thứ hai để `cmd/api` không có logic.

- [ ] **Step 4: Chạy toàn bộ Go**

Run: `make test && make lint`
Expected: PASS, gofmt sạch.

- [ ] **Step 5: Cập nhật `.env.example` / `docker-compose*.yml`** thêm 4 biến `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_BASE_URL`, `APP_URL` (để trống ở dev: billing không gắn).

- [ ] **Step 6: Kiểm sandbox thật (bắt buộc trước khi bật prod, ghi kết quả vào ticket)**

Đặt `NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1` với key sandbox, expose local
qua tunnel làm `APP_URL`, chạy một checkout thật, nhận IPN thật. Bằng chứng: log request IPN
và dòng `payments.status = 'paid'`. Nếu chữ ký sandbox không khớp, sửa thuật toán ở Task 3
Step 4 và cập nhật test vector.

---

### Task 7: Frontend — trang `/billing`, banner, lỗi 1402

**Files:**
- Create: `frontend/src/features/billing/types.ts`, `hooks.ts`, `BillingPage.tsx`, `PlanCard.tsx`, `PaymentsTable.tsx`, `ExpiryBanner.tsx`, `UpgradeHint.tsx`
- Modify: `frontend/src/app/router.tsx` (route `/billing` lazy, trong nhánh `RequireAuth`), `frontend/src/app/AppShell.tsx` (NavItem `nav.billing`, icon `CreditCardIcon`; render `<ExpiryBanner/>` trên `Outlet`)
- Modify: `frontend/src/lib/queryKeys.ts` (`billingMe: ["billing","me"]`, `billingPayments: ["billing","payments"]` — ngoài tiền tố accounts, cùng lý do với `noteTemplates`)
- Modify: `frontend/src/i18n/strings.ts` (các khoá `nav.billing`, `billing.*`, `errors.paymentRequired`)
- Modify: `frontend/src/i18n/errors.ts` (`1402: "errors.paymentRequired"`)
- Modify: `frontend/src/features/accounts/AccountFormDialog.tsx` và `frontend/src/features/import/ImportPage.tsx` (khi `ApiError.code === 1402` hiện `<UpgradeHint/>` có link `/billing` thay vì thông báo lỗi thường)
- Test: `frontend/src/features/billing/billing.test.tsx`, cập nhật `src/app/router.test.tsx`, `src/app/shell.test.tsx`

**Interfaces:**
- Consumes: JSON của Task 6.
- Produces:

```ts
// types.ts
export type PlanInfo = { code: "pro_monthly" | "pro_yearly"; price_usd: string; period_days: number };
export type BillingMe = { plan: "free" | "pro"; expires_at: string | null; plans: PlanInfo[] };
export type Payment = { id: number; plan: string; amount_usd: string; status: "pending"|"paid"|"underpaid"|"expired"|"failed"|"refunded"; pay_currency: string; created_at: string; paid_at: string | null };
// hooks.ts
export function useBillingMe(opts?: { pollUntilPro?: boolean }): UseQueryResult<BillingMe>  // pollUntilPro → refetchInterval 3000 khi plan === "free", false khi "pro"
export function usePayments(): UseQueryResult<Payment[]>
export function useCheckout(): UseMutationResult<{ payment_id: number; invoice_url: string }, ApiError, PlanInfo["code"]>  // onSuccess: window.location.assign(invoice_url)
```

Trang `/billing`: khối trạng thái (Free / Pro đến ngày X theo locale), hai `PlanCard` với nút
`billing.payWithCrypto`, dòng chữ nhỏ `billing.noRefund`, bảng lịch sử. Khi URL có
`?checkout=done` và plan còn free: hiện `billing.waitingConfirmation` với `role="status"`, bật
`pollUntilPro`. `ExpiryBanner`: chỉ hiện khi pro và còn ≤ 7 ngày, text
`billing.expiresInDays` với `{n}` (assert đã nội suy). Tiền hiển thị bằng `lib/format` hiện có,
không ép kiểu trong component.

- [ ] **Step 1: Viết test fail** (`billing.test.tsx`, msw theo khuôn `accounts.test.tsx`):
  - "renders free status and two plans" — thấy `$9`, `$79`, nút trả tiền ×2.
  - "checkout redirects to invoice url" — mock `window.location.assign`; click → POST body `{"plan":"pro_yearly"}` → assign được gọi với URL mock.
  - "stops polling once pro" — handler `/billing/me` trả free hai lần rồi pro; với `?checkout=done`, dùng fake timers, assert số lần gọi dừng ở 3 và text Pro hiện ra.
  - "banner shows days left when ≤ 7" — `expires_at = now + 3d` → thấy câu đã nội suy `3`; `now + 20d` → không có banner.
  - "402 on import shows upgrade hint" (trong `import` test hiện có hoặc file mới) — msw trả `{code:1402,msg:"..."}` → link tới `/billing`.
  - `router.test.tsx`: `/billing` nằm sau `RequireAuth`.

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/billing`
Expected: FAIL, module không tồn tại.

- [ ] **Step 3: Cài đặt** theo Files. Dùng `Card`, `Button`, `Table`, `Alert` từ `components/ui`; màu Pro dùng `text-profit`, trạng thái `underpaid`/`failed` dùng `text-warn`/`text-loss`.

- [ ] **Step 4: Chạy toàn bộ FE**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS, styleguard xanh, build xanh.

---

### Task 8: Landing FAQ, ticket và kanban

**Files:**
- Modify: `frontend/src/i18n/strings.ts` dòng `landing.faq.priceA` → vi: "Gói Free dùng mãi với 1 tài khoản. Gói Pro trả trước theo tháng hoặc năm, thanh toán bằng USDT/USDC." · en: "Free forever with 1 account. Pro is prepaid monthly or yearly, paid in USDT/USDC."
- Create: `docs/roadmap/tickets/K-68.md` — bối cảnh, phạm vi (Task 1–7), ngoài phạm vi (spec §6), tiêu chí nghiệm thu = Review Focus + bằng chứng sandbox (Task 6 Step 6), rủi ro pháp lý (spec §7).
- Modify: `docs/roadmap/kanban.md` — thêm K-68 vào **Cần làm** với `chờ: D1 = go, R-1..R-10 của plan 2026-11-10-pre-billing-readiness xong` ; `docs/roadmap/2026-10-31-roadmap-11-2026-01-2027.md` — dòng D5 ghi "đã chốt: crypto-only, xem spec 2026-11-10".
- Test: `frontend/src/features/landing/*.test.tsx` nếu có assert text FAQ cũ thì cập nhật.

- [ ] **Step 1: Sửa chuỗi, chạy test landing**

Run: `cd frontend && npx vitest run src/features/landing`
Expected: PASS.

- [ ] **Step 2: Viết ticket và cập nhật kanban/roadmap.**

- [ ] **Step 3: Chạy lại toàn bộ**

Run: `make test && make lint && cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tất cả xanh. Báo cáo danh sách file đã đổi, không commit.
