# Bot Telegram: bản đồ ICT cho NQ trước phiên và trước macro

Ngày: 2026-11-02. Thay cho các bản plan nháp trong hội thoại; viết lại sau khi có kết quả backtest
(`docs/ict-backtest-2026-11-02.md`).

## Mục đích

Trước mỗi phiên chủ sản phẩm trade (Asia và NY AM) và trước mỗi macro, gửi một tin Telegram tóm tắt
"bản đồ" của NQ theo phương pháp ICT mà chủ sản phẩm đang học (ghi chú video ReeseTradesNQ: tìm DOL
4 bước, IFVG model, OXXC + PO3, SMT đúng cách, stop raid). Mục tiêu là đỡ phải tự dò lại mức thanh
khoản, FVG, range và SMT trên 8 khung trước mỗi phiên.

## Bài học từ backtest — vì sao tin KHÔNG ghi "Bias: TĂNG / GIẢM"

Luật bias đã mã hoá (DOL bước 1, range HR/LR, SMT 8 khung) được chạy trên 383 phiên US100/US500
(21/01 → 22/10/2026). Khi chấm công bằng (hai mục tiêu cách đều giá), mọi tín hiệu quanh 50%, không
cái nào chứng minh được lợi thế. Các con số 70–84% chỉ có được khi mục tiêu là đỉnh/đáy range, và
khi đó đoán "phía gần giá hơn" còn đúng nhiều hơn (70–90%).

Hệ quả cho thiết kế:

1. Tin đưa **dữ kiện** (mức nào, đã bị quét lúc nào, FVG nào giữ / bị phá, range loại gì, SMT ở khung
   nào) và **hai kịch bản "nếu… thì…"**, không đưa một hướng như lời dự đoán.
2. Dòng "DOL tiềm năng theo luật" vẫn có nhưng ghi rõ "chưa kiểm chứng" và không đứng đầu tin.
3. `cmd/ict-backtest` ở lại trong repo: mỗi lần sửa luật thì chạy lại. Khi nào một luật vượt 50% rõ
   ràng ở phần chấm cách đều (khoảng tin cậy 95% không chứa 50%) mới được đưa lên làm "bias".

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
| SMT | NQ so với ES ở hai swing gần nhất, trên cả 8 khung. |

Định nghĩa từng khái niệm (FVG, bị phá, được tôn trọng, swing, HR/LR, đi ra từ BSL/SSL) nằm ở
comment của `backend/internal/ict` và đã có test; spec không chép lại để khỏi lệch.

## Nội dung tin

### Tin trước phiên (18:55, 09:25)

```
NQ · Trước phiên NY AM · Thứ Ba 03/11
Giá 21 345.25 (nến 09:15 NY · data trễ ~10 phút)

KHUNG   CẤU TRÚC  SMT với ES
15m     ↑         tăng 08:45
30m     ↑         —
1H      ↑         tăng 03:00
2H      ↔         —
4H      ↓         —
8H      ↓         —
12H     ↓         —
D       ↑         —

THANH KHOẢN
BSL  PDH 21 420.00 · London High 21 380.00
SSL  London Low 21 280.00 · Asia Low 21 250.00 (đã quét 03:12)
Midnight Open 21 300.00 → giá đang ở Premium

FVG (15m–4H, 24 giờ qua)
Giữ: 1H tăng 21 290–21 310 · Phá: 1H giảm 21 400–21 415

RANGE 30m (15m chưa có range hợp lệ): LR vs HR
Đỉnh 21 420 (LR) · Đáy 21 300 (HR: quét · chạm FVG khung lớn · displacement)

KỊCH BẢN (điều kiện FVG 1H 21 290–21 310)
A. Tôn trọng → về BSL 21 420
B. Nến 1H đóng dưới 21 290 → về SSL 21 250

DOL tiềm năng theo luật: BSL (chưa kiểm chứng, backtest ~50%)
Checklist: quét thanh khoản quan trọng? · trong FVG ≥15m? · stop raid? · thanh khoản mở sát stop? · IFVG có displacement?
```

Phiên Asia dùng bộ mức khác: PDH/PDL của ngày vừa đóng, High/Low NY AM và NY PM, giá mở 18:00.

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
Nến 10:00 (PO3): chờ quét phía ngược kịch bản, stop raid, rồi IFVG mới vào.
```

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
