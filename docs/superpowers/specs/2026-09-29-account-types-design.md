# Loại tài khoản (cá nhân / quỹ), vòng thi và làm lại trang Tài khoản — thiết kế

Ngày: 2026-09-29 · Plan: `docs/superpowers/plans/2026-09-29-account-types.md`

## 1. Bài toán

Người dùng giao dịch trên hai kiểu tài khoản khác nhau về bản chất:

- **Cá nhân** — tiền của mình, không có luật ngoài.
- **Quỹ (prop firm)** — thi qua **Vòng 1 → Vòng 2 → Funded**, mỗi vòng có kết cục
  **Đang thi / Đã qua / Thất bại**, kèm hai luật chính: mục tiêu lợi nhuận và giới hạn drawdown.

Trang `/accounts` hiện là một bảng sáu cột, không phân biệt hai kiểu, và phần nạp/rút
treo lơ lửng bên dưới cho account đang chọn. Người có năm account thi quỹ không nhìn
ra được account nào đang thi, account nào đã chết.

## 2. Các quyết định đã chốt với chủ sản phẩm

| Câu hỏi | Chốt |
|---|---|
| Chuyển vòng lưu thế nào | **Sửa tay trên một account.** Cột `challenge_phase` + `challenge_status`. Không có bảng lịch sử. Quỹ cấp login mới cho vòng sau thì người dùng tự tạo account mới. |
| Pass/fail lấy từ đâu | **Người dùng tự chọn.** Backend KHÔNG tự kết luận pass/fail. |
| Thông tin thêm | Tên quỹ, mục tiêu lợi nhuận (%), max drawdown (%). Hai con số sau **chỉ để hiển thị tiến độ**. |
| Bố cục | Danh sách chia nhóm Quỹ / Cá nhân, mỗi account một hàng có thanh vòng thi. Nạp/rút mở trong panel bên phải. |

## 3. Mô hình dữ liệu

Migration `0006_account_challenge` thêm vào `accounts`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `account_type` | `TEXT NOT NULL DEFAULT 'personal'` | `personal` \| `prop` |
| `prop_firm` | `TEXT NOT NULL DEFAULT ''` | ≤ 64 ký tự |
| `challenge_phase` | `TEXT NULL` | `phase_1` \| `phase_2` \| `funded` |
| `challenge_status` | `TEXT NULL` | `in_progress` \| `passed` \| `failed` |
| `profit_target` | `NUMERIC(6,4) NULL` | phân số, `0.1` = 10%, khoảng (0, 1] |
| `max_drawdown_limit` | `NUMERIC(6,4) NULL` | phân số, khoảng (0, 1] |

Ràng buộc (DB thực thi, service kiểm trước để trả 400 dễ đọc):

1. `personal` ⇒ bốn cột thử thách là NULL và `prop_firm = ''`.
2. `prop` ⇒ `challenge_phase` và `challenge_status` NOT NULL.
3. `funded` không bao giờ `passed` — không còn vòng nào phía sau để qua.

Giá trị enum là ASCII, **không phải key chấm điểm** (khác quy tắc 5): nhãn tiếng Việt
nằm ở FE (`enumLabels.ts`), danh sách giá trị cấp qua `/meta/enums`.

Hàng cũ nhận `personal` qua DEFAULT, không cần backfill.

### Luật chuẩn hoá (service, trước khi validate)

- `account_type` rỗng → `personal`.
- Chuyển về `personal` → xoá sạch dữ liệu thử thách (không báo lỗi — đó là ý định của người dùng).
- Chuyển sang `prop` mà thiếu vòng/trạng thái → `phase_1` / `in_progress`.
- PATCH đổi `challenge_phase` mà không gửi `challenge_status` → trạng thái về `in_progress`.
  Lên vòng mới là bắt đầu một lượt thi mới; giữ `passed` của vòng cũ là nói dối.
- `profit_target` / `max_drawdown_limit` là Tristate trong PATCH: vắng = giữ, `null` = xoá.

## 4. Tiến độ thử thách — trường suy diễn, không lưu

`metrics.ComputeChallenge(all, acc)` (package thuần) trả `nil` cho account cá nhân, còn
lại:

| Trường | Công thức |
|---|---|
| `profit_pct` | Σ net của **toàn bộ** lệnh ÷ vốn ban đầu |
| `target_progress` | `profit_pct ÷ profit_target`; nil nếu không đặt mục tiêu |
| `drawdown_pct` | max `drawdown` của toàn bộ dãy ÷ vốn ban đầu (số dương) |
| `drawdown_usage` | `drawdown_pct ÷ max_drawdown_limit`; nil nếu không đặt giới hạn |

Hai điểm cố ý:

- **Không chịu bộ lọc.** Cùng ngoại lệ với `current_balance` ở quy tắc 8: tiến độ thi
  là tình trạng thật của account, không đổi theo tháng người dùng đang xem. Tính trên
  `all`, gắn vào `KPI.Challenge`, trả trong `/stats` dưới khoá `challenge`.
- **Drawdown đo từ đỉnh equity** (`running_peak` sàn tại vốn ban đầu, đúng như
  `Enrich` đang làm), không phải drawdown tĩnh tính từ vốn. Với cùng dãy lệnh, con số
  này luôn **≥** con số của quỹ dùng luật tĩnh — sai về phía thận trọng. Cash flow
  không tính vào (account quỹ không nạp/rút).

## 5. API

- `GET/POST/PATCH /accounts` — DTO thêm `account_type`, `prop_firm`, `challenge_phase`,
  `challenge_status`, `profit_target`, `max_drawdown_limit` (tiền/tỷ lệ là chuỗi, null khi không có).
- `GET /meta/enums` — thêm `account_types`, `challenge_phases`, `challenge_statuses`.
- `GET /accounts/{id}/stats` — thêm `challenge: { profit_pct, target_progress, drawdown_pct, drawdown_usage } | null`.

Trang Accounts gọi `/stats` không filter cho từng account (`useQueries`, key trùng
`qk.stats(id, EMPTY_FILTER)` nên dùng chung cache với trang Lệnh). Số account của một
người là hàng chục trở xuống; một endpoint tổng hợp riêng là tối ưu sớm.

## 6. Thiết kế giao diện

Theme do chủ sản phẩm cấp (`docs/design/theme.css`) là cố định, nên phần "chọn màu,
chọn font" ở đây là chọn **token nào gánh ý nghĩa nào**, không phải đặt màu mới.

### 6.1 Token

| Vai | Token | Giá trị (light) |
|---|---|---|
| Nền sổ (container nhóm) | `--surface-base` | `#ffffff` |
| Rãnh của thanh đo | `--surface-sunken` | `#f2f4f7` |
| Vòng đã qua, thanh lợi nhuận, lãi | `--primary` | `#12b886` |
| Vòng thất bại, drawdown ≥ 80% giới hạn | `--status-error` | `#ef4444` |
| Drawdown 50–80% giới hạn | `--status-warning` | `#eab308` |
| Chữ phụ, vòng chưa tới | `--text-muted` / `--border-strong` | `#667085` / `#98a2b3` |

Chữ: Inter Variable cho UI, JetBrains Mono (lớp `.num`) cho mọi con số — đúng quy ước
sẵn có, không thêm typeface. Thang: tiêu đề trang 20/600 · tiêu đề nhóm 16/600 + số
đếm muted · tên account 16/600 · dòng phụ 12 muted · số dư 16 mono/500.

### 6.2 Bố cục

Desktop (≥ md) — mỗi nhóm là MỘT khung viền, các account là hàng ngăn bằng vạch, như
một trang sổ cái:

```
Tài khoản giao dịch                                        [Thêm tài khoản]
( Tất cả 4 | Quỹ 3 | Cá nhân 1 )

Tài khoản quỹ  3
┌──────────────────────────────────────────────────────────────────────────┐
│▌FTMO 100k            ●━━━━━━━○──────────○     104.250,00 $   [Sửa] [⋯] │
│ FT-01  FTMO          Vòng 1   Vòng 2   Funded     +4,25%     Nạp / rút  │
│ Rủi ro 1%  1R 1.000  Đang thi                                           │
│                      Lợi nhuận  4,25% / 10%  ▓▓▓▓░░░░░░                 │
│                      Drawdown   2,10% / 10%  ▓▓░░░░░░░░                 │
├──────────────────────────────────────────────────────────────────────────┤
│▌The5ers 60k          ●━━━━━━━●━━━━━━━━━━○      61.020,00 $   [Sửa] [⋯] │
│ T5-02  The5ers       Vòng 1   Vòng 2   Funded     +1,70%                │
│                      Đã qua vòng 2                                       │
├──────────────────────────────────────────────────────────────────────────┤
│▌FundedNext 50k       ✕─ ─ ─ ─ ○ ─ ─ ─ ─ ─○      47.100,00 $   [Sửa] [⋯] │
│ FN-03                Vòng 1   Vòng 2   Funded     −5,80%                │
│                      Thất bại ở vòng 1                                   │
└──────────────────────────────────────────────────────────────────────────┘

Tài khoản cá nhân  1
┌──────────────────────────────────────────────────────────────────────────┐
│▌Exness cent                                        5.320,00 $   [Sửa]   │
│ MAIN  Rủi ro 1%  1R 50                              +6,40%    Nạp / rút │
└──────────────────────────────────────────────────────────────────────────┘
```

Mobile (< md) — hàng xếp dọc: danh tính → thanh vòng → thanh đo → số dư → nút.

Thứ tự trong nhóm quỹ: đang thi → đã qua → thất bại; cùng trạng thái thì theo id.
Account thất bại không bị làm mờ (giảm tương phản là giảm khả năng đọc) — chỉ xuống cuối.

Bộ lọc `Tất cả / Quỹ / Cá nhân` chỉ hiện khi có cả hai loại; trạng thái nằm trên URL
(`?type=prop`) như các tab khác của app.

### 6.3 Nguyên tắc

1. **Thanh vòng thi là điểm nhấn duy nhất.** Mọi thứ khác trong hàng ở cỡ chữ thân,
   màu trung tính. Không pill màu, không số to.
2. **Sổ cái, không phải lưới thẻ.** Một khung cho một nhóm, hàng ngăn bằng vạch
   `--border-default`. Không shadow (theme tắt), phân tầng bằng border và bậc surface.
3. **Trạng thái nói bằng hình + chữ, không chỉ bằng màu.** Nút vòng: đặc = đã qua,
   vòng rỗng = đang thi, dấu ✕ = thất bại, vòng xám = chưa tới; ngay dưới luôn có câu
   chữ ("Thất bại ở vòng 1"). Người mù màu đỏ-xanh vẫn đọc được.
4. **Tài khoản cá nhân yên lặng.** Không thanh vòng, không thanh đo — chỉ danh tính, số dư, nút.
5. **Luật chỉ gợi ý, không phán.** Đạt mục tiêu → dòng gợi ý "Đã đạt mục tiêu lợi
   nhuận" + nút "Đánh dấu đã qua" hiện ra ngay trong hàng. Người dùng bấm, backend không tự đổi.

### 6.4 Rà lại bản nháp so với lối mòn

Bản nháp đầu tiên là thứ sẽ ra cho bất kỳ "trang danh sách tài khoản" nào: lưới ba
cột thẻ bo góc giống hệt nhau, mỗi thẻ một con số dư cỡ lớn, pill trạng thái in hoa
(`PASSED`) màu xanh/đỏ, thanh tiến độ gradient. Đã sửa:

- Lưới thẻ → **hàng trong một khung sổ cái mỗi nhóm**: người dùng so các account với
  nhau theo cột (số dư thẳng hàng phải), việc lưới thẻ làm rất kém.
- Pill trạng thái → **thanh ba vòng**: pill chỉ nói "đang ở đâu", thanh nói cả "đã đi
  được bao xa, chết ở chặng nào" — đúng câu hỏi của người thi quỹ.
- Số dư cỡ lớn → số dư mono cỡ thân, canh phải: điểm nhấn đã dành cho thanh vòng.
- Chữ in hoa → sentence case. Gradient → màu phẳng từ token.

### 6.5 Form thêm/sửa

Dialog giữ nguyên các ô cũ, thêm ở đầu ô **Loại tài khoản** (Segmented `Cá nhân | Quỹ`).
Chọn Quỹ thì mở thêm nhóm "Thử thách quỹ": Tên quỹ · Vòng (Segmented 3 lựa chọn) ·
Trạng thái (Segmented; ở Funded chỉ còn `Đang giao dịch | Thất bại`) · Mục tiêu lợi nhuận
(%) · Max drawdown (%) — hai ô số đứng cạnh nhau, để trống được.

Nhãn trạng thái `in_progress` đổi theo vòng: "Đang thi" ở Vòng 1/2, "Đang giao dịch" ở Funded.

### 6.6 Thao tác nhanh

Menu `⋯` trên hàng quỹ: **Đánh dấu đã qua** (đang thi, chưa Funded) · **Lên {vòng
kế}** (đã qua) · **Đánh dấu thất bại** (đang thi). Mỗi mục là một PATCH một khoá; mọi
thứ khác đi qua dialog Sửa.

## 7. Ngoài phạm vi

- Lịch sử chuyển vòng, ngày qua/fail.
- Tự kết luận pass/fail từ luật; luật daily loss; drawdown tĩnh vs trailing tuỳ quỹ.
- Hiện tiến độ thử thách trên Dashboard / sidebar AccountSwitcher (có thể làm sau, dữ
  liệu đã có trong `/stats`).
- Xoá account.
