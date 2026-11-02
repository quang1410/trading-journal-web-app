# Bot Telegram: bản đồ ICT cho NQ trước phiên và trước macro

Ngày: 2026-11-02. Thay cho các bản plan nháp trong hội thoại; viết lại sau khi có kết quả backtest
(`docs/ict-backtest-2026-11-02.md`).

## Mục đích

Trước mỗi phiên chủ sản phẩm trade (Asia và NY AM) và trước mỗi macro, gửi một tin Telegram tóm tắt
"bản đồ" của NQ theo phương pháp ICT mà chủ sản phẩm đang học (ghi chú video ReeseTradesNQ: tìm DOL
4 bước, IFVG model, OXXC + PO3, SMT đúng cách, stop raid). Mục tiêu là đỡ phải tự dò lại mức thanh
khoản, FVG, range và SMT trước mỗi phiên.

## Bài học từ backtest — vì sao tin KHÔNG ghi "Bias: TĂNG / GIẢM"

Luật bias đã mã hoá (DOL bước 1, range HR/LR, SMT với ES) được chạy trên 383 phiên US100/US500
(21/01 → 22/10/2026). Khi chấm công bằng (hai mục tiêu cách đều giá), mọi tín hiệu quanh 50%, không
cái nào chứng minh được lợi thế. Các con số 70–84% chỉ có được khi mục tiêu là đỉnh/đáy range, và
khi đó đoán "phía gần giá hơn" còn đúng nhiều hơn (70–90%).

Hệ quả cho thiết kế:

1. Tin đưa **dữ kiện** (mức nào, đã bị quét lúc nào, FVG nào giữ / bị phá, range loại gì, SMT ở khung
   nào) và **hai kịch bản "nếu… thì…"**, không đưa một hướng như lời dự đoán.
2. Dòng "DOL tiềm năng theo luật" vẫn có nhưng ghi rõ "chưa kiểm chứng" và không đứng đầu tin.
3. `cmd/ict-backtest` ở lại trong repo: mỗi lần sửa luật thì chạy lại. Khi nào một luật vượt 50% rõ
   ràng ở phần chấm cách đều (khoảng tin cậy 95% không chứa 50%) mới được đưa lên làm "bias".

Backtest vào lệnh M1 (phần 2–3 của báo cáo) cũng cho kết quả quanh hoà vốn: IFVG model cơ bản 31,9%
ở TP 2R, bộ lọc A+ đủ tiêu chí bắt buộc 29,6% ở TP 2R / 41,7% ở 1R, kết quả đổi dấu giữa hai nửa
năm. Nên tin trước macro chỉ báo **trạng thái từng tiêu chí A+** (đã có tích lũy chưa, đã quét chưa,
đã vào FVG khung lớn còn mới chưa, ES ra sao) để người trade tự đối chiếu checklist — không báo
"vào lệnh".

## Quyết định đã chốt

| Mục | Chốt |
|---|---|
| Mã | Tin chỉ nói về **NQ**. **ES** chỉ để so SMT. |
| Data | CME miễn phí, trễ ~10 phút: Yahoo (`NQ=F`, `ES=F`) là chính, TradingView dự phòng. Không realtime, nên bot không báo điểm vào lệnh. |
| Số tin | Tối đa **6 tin / ngày** (theo ngày New York), có chặn cứng trong DB. |
| Giờ gửi (New York) | 18:55 mở phiên Asia · 19:48 macro 19:50–20:10 · 20:48 macro 20:50–21:10 · 09:25 mở phiên NY AM · 09:48 macro 09:50–10:10 · 10:48 macro 10:50–11:10 |
| Ngày gửi | Tin Asia: Chủ nhật → thứ Năm. Tin NY AM: thứ Hai → thứ Sáu. Nến mới nhất cũ hơn 30 phút (ngày nghỉ) thì không gửi. |
| Khung | 15m → 30m → 1H → 2H → 4H → 8H → 12H → Daily, chia mốc từ 18:00 New York. |
| Range | Khung nhỏ nhất (theo thứ tự trên) có swing high còn nguyên trên giá, swing low còn nguyên dưới giá, và ít nhất một FVG chưa bị phá (khung ≥ khung range) nằm trong. |
| Khung tham chiếu | **Một khung duy nhất**, vì vào lệnh ở M1 nên khung tham chiếu càng gần M1 càng tốt: ưu tiên 15m, 15m không có thì lên 30m, rồi 1H… tới Daily. Tin không liệt kê cả 8 khung. |
| SMT | **ES chỉ để tham chiếu SMT.** NQ so với ES ở hai swing gần nhất, tìm theo cùng thứ tự 15m → Daily: lấy khung nhỏ nhất có SMT còn mới (swing sau nằm trong 20 nến gần nhất của khung đó). |

Định nghĩa từng khái niệm (FVG, bị phá, được tôn trọng, swing, HR/LR, đi ra từ BSL/SSL) nằm ở
comment của `backend/internal/ict` và đã có test; spec không chép lại để khỏi lệch.

## Nội dung tin

### Tin trước phiên (18:55, 09:25)

Gọn khoảng 8 dòng (chủ sản phẩm duyệt 02/11: bản đầy đủ nhiều thông tin quá):

```
NQ · Trước phiên NY AM · T3 03/11
Giá 21 345.25 · Premium (Midnight Open 21 300)
30m ↑ · SMT ES: tăng 15m 08:45
Range 21 300–21 420 · LR/HR
Nếu quét 21 280 London L vào FVG ↑ 21 290–21 310 (1H) rồi IFVG → LONG về 21 380 London H (ưu tiên) · lịch sử thắng 40%, TB +0.56R (15 lệnh)
Nếu quét 21 380 London H rồi IFVG → SHORT về 21 280 London L · lịch sử thắng 40%, TB -0.09R (83 lệnh)
BSL 21 380 London H · 21 420 PDH
SSL 21 280 London L
(lịch sử: vào khi có IFVG sau cú quét, SL đỉnh/đáy quét, TP mục tiêu kịch bản; chưa trừ phí)
```

- Dòng 3: khung tham chiếu (ưu tiên 15m, không có range hợp lệ mới lên khung lớn hơn), cấu trúc,
  SMT với ES ở khung nhỏ nhất có SMT còn mới.
- Hai dòng "Nếu…" (chủ sản phẩm yêu cầu giữ kịch bản nếu… thì…): theo IFVG model — quét thanh
  khoản gần giá nhất chưa bị quét (mức phiên hoặc đầu range) → vào FVG khung tham chiếu → 4H chưa bị
  phá mà cú quét đi tới (LONG: FVG tăng có đáy ≤ mức quét; SHORT ngược lại; không có thì bỏ vế FVG)
  → IFVG → về thanh khoản gần nhất phía bên kia. "(ưu tiên)" khi cùng chiều DOL của range HR/LR.
- Mỗi kịch bản kèm **winrate lịch sử** của nhóm kịch bản cùng loại (phiên × có FVG hay không), dạng
  "lịch sử thắng 31%, TB +0.91R (67 lệnh)" — luôn có R trung bình vì mục tiêu kịch bản lúc gần lúc
  xa (thắng nhiều mà lời ít, hoặc ngược lại); dưới 10 lệnh thì "chưa đủ mẫu". Walk-forward: chỉ dùng
  các phiên trước ngày tin. Cách chấm: giá quét mức → nến IFVG (giá đóng nến) → SL ở cực trị quét,
  TP là mục tiêu kịch bản, chấm tới 16:00 (NY) / 05:00 (Asia); chưa trừ phí. Code:
  `ict.BuildScenarioStats`, `PreparedSession.SimulateScenario`. Trên production, lịch sử lấy từ
  bảng `replay_bars` (NQ/ES đã lưu) thay cho US100/US500 trong `replay-data`.
- BSL / SSL: tối đa 2 mức chưa quét gần giá nhất, mức trùng giá gộp ("PDL = NY PM L"); hết thì
  "đã quét hết".
- Bỏ khỏi tin (vẫn có trong `Brief` nếu cần lại): danh sách FVG giữ / phá / mới, DOL theo luật bước
  1 (backtest ~50%), checklist A+ (chuyển sang tin trước macro).

Phiên Asia dùng bộ mức khác: PDH/PDL của ngày vừa đóng, High/Low NY AM và NY PM, giá mở 18:00.

FVG liệt kê từ **khung tham chiếu trở lên** tới 4H (theo nguyên tắc "khung gần M1 nhất"); có FVG
nào chưa từng được chạm thì đánh dấu "mới" — tiêu chí FVG khung lớn của IFVG model ưu tiên FVG mới.

### Tin trước macro (19:48, 20:48, 09:48, 10:48)

```
NQ · Macro 09:50–10:10 · nến 10:00 mở sau 12 phút
Giá 21 362.50 (nến 09:38 NY)

Từ 09:30:
• Quét: London Low 21 280.00 lúc 09:41
• SMT mới: 15m tăng 09:34
• Điều kiện FVG 1H 21 290–21 310: vẫn giữ
• Nến 15m 09:30 và 09:45: cùng râu dưới giá mở (stacking ở Discount)

Gần nhất: BSL London High 21 380.00 · SSL Asia Low 21 250.00

CHECKLIST A+ (IFVG model) — trạng thái lúc 09:38
✓ Tích lũy: 09:12–09:31, 21 318–21 341
✓ Quét: phá đáy tích lũy 21 318 lúc 09:34
✓ FVG khung lớn: chạm FVG 1H tăng 21 290–21 310 (mới)
✓ ES: giữ đáy tích lũy (SMT) → true manipulation
· PO3: nến 10:00 mở sau 12 phút
· IFVG / stop raid: bạn tự xác nhận trên chart (data trễ)
```

Mỗi dòng checklist là một hàm đã có test trong `internal/ict` (cùng code với backtest A+), nên tin
và backtest luôn dùng một định nghĩa.

Telegram giới hạn 4 096 ký tự mỗi tin; hai mẫu trên dưới 1 500 ký tự. Gửi văn bản thuần (không
`parse_mode`) để khỏi phải escape.

## Kiến trúc

```
Supabase pg_cron, mỗi phút trong giờ UTC có tin
  └─ GET /api/cron/alerts  (Authorization: Bearer CRON_SECRET)
       └─ service.AlertService.Run
            ├─ ict.DueNotice(now): chưa tới giờ tin nào → trả "no notice due", không kéo data
            ├─ kéo song song: Yahoo NQ=F + ES=F nến 1m 6 ngày và nến 1H 60 ngày (4 request);
            │  Yahoo hỏng thì TradingView cho nến 1m
            ├─ nến mới nhất cũ hơn 30 phút → bỏ (ngày nghỉ)
            ├─ ict.Analyze → ict.RenderOpen / ict.RenderMacro
            ├─ AlertNoticeStore.Claim(key, ngày, 6): đã gửi / đủ 6 tin → bỏ
            └─ telegram.Send; lỗi thì Release(key) để phút sau thử lại
```

- **Vì sao pg_cron:** Vercel Hobby chỉ cho cron mỗi ngày một lần. Supabase đang dùng sẵn, `pg_cron` +
  `pg_net` gọi được mỗi phút. Lịch UTC phủ cả giờ mùa hè lẫn mùa đông
  (`* 13-15,22-23,0-1 * * *`); giờ New York do endpoint tự tính, nên đổi giờ không phải sửa lịch.
- **Cửa sổ gửi:** tin đến hạn khi `giờ gửi ≤ now < giờ gửi + 3 phút`. Lỡ một phút thì phút sau vẫn
  gửi; trễ hơn 3 phút thì bỏ, vì tin "trước macro 2 phút" tới muộn không còn giá trị.
- **Khung ≥ 1H lấy từ nến 1H của Yahoo** (60 ngày) để Daily / 12H / 8H có đủ swing; 15m / 30m gom từ
  nến 1m. Thời gian chạy dưới giới hạn 10 giây của function Vercel.
- **Chống trùng:** bảng `alert_notices`, khoá `key = "<ngày NY>/<mã tin>"` (ví dụ
  `2026-11-03/ny-open`). Giữ chỗ TRƯỚC khi gửi để hai lần chạy trùng nhau không gửi hai tin.
- **Bảo mật:** token bot nằm trong URL của Telegram; lỗi của `net/http` có chép URL nên client phải
  xoá URL khỏi lỗi trước khi log. Route chỉ gắn khi đủ `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID` và có DB.

## Ngoài phạm vi

- Báo điểm vào lệnh (IFVG 30s / 1m, stop raid): cần data realtime.
- Nhiều người dùng, liên kết Telegram qua `/start`, giao diện cài đặt: phase sau.
- Tạo nhật ký setup từ tin nhắn.
