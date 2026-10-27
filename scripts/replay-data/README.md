# Data cho trang /replay

Tải nến 1 phút miễn phí từ Dukascopy cho US100 (≈ NQ) và US500 (≈ ES), và nến CME thật của NQ, ES
qua TradingView (xem mục dưới), rồi đóng gói vào `frontend/public/replay-data/` để trang `/replay`
tự mở khi khởi động.

```bash
cd scripts/replay-data
npm install
node download.mjs                     # từ 01/01 năm nay tới hiện tại, cả US100 và US500
node download.mjs --from 2026-03-01   # đổi ngày bắt đầu
node download.mjs --symbols US100     # chỉ một mã
node build.mjs --from 2026-01-01      # chỉ đóng gói lại từ csv/ (không tải)
```

- Mỗi tháng lưu ở `raw/<MÃ>/<YYYY-MM>.csv`. Bị ngắt giữa chừng thì chạy lại là tải tiếp tháng còn
  thiếu; tháng hiện tại luôn tải lại. Gộp xong ra `csv/<MÃ>.csv`. Hai thư mục này không vào git.
- `build.mjs` ghi `frontend/public/replay-data/<MÃ>.bin` và `manifest.json`. Đây là phần vào git và
  được deploy cùng frontend. Hiện chỉ giữ data năm 2026 (khoảng 5,5 MB cho cả hai mã).
- Dukascopy chặn request tự động bằng WAF (HTTP 202). Bản beta `dukascopy-node@1.50.0-beta.2` vượt
  qua bằng Chrome đã cài trên máy; token lưu ở `~/.dukascopy-node/waf-token.json`.

## NQ và ES (CME thật, qua TradingView)

```bash
node tradingview.mjs                  # NQ1! và ES1! (CME_MINI), nến 1m, phiên Globex đầy đủ
node tradingview.mjs --symbols NQ     # chỉ một mã
```

- Không đăng nhập thì TradingView chỉ trả khoảng **một tuần** nến 1m gần nhất. Mỗi lần chạy, nến mới
  được gộp vào `csv/<MÃ>.csv` (giữ nến cũ), nên **chạy đều mỗi tuần** thì lịch sử 1m dài dần ra. Bỏ lỡ
  quá một tuần là hở một khoảng không lấy lại được.
- Máy không có `csv/` (mới clone) thì script đọc lại lịch sử cũ từ `NQ.bin` / `ES.bin` rồi gộp tiếp.
- Trên web còn có nút **Cập nhật** (cạnh ô mã, khi chart là NQ / ES): backend kéo hộ tuần mới nhất
  (`GET /api/replay/live/{NQ|ES}`, `backend/internal/tvfeed`), trang gộp và lưu trong IndexedDB của
  trình duyệt đó. Trình duyệt không tự kéo được vì TradingView chỉ nhận Origin `tradingview.com` hoặc
  `localhost`. Phần lưu trong trình duyệt không vào git.
- Trên production còn có cron sáng thứ Bảy (và dự phòng Chủ nhật) kéo cả tuần vừa đóng và lưu vào
  bảng `replay_bars` của Supabase; nút **Cập nhật** đọc lại từ đó, nên mọi máy đã đăng nhập đều có
  đủ các tuần mà không cần chạy script. Xem mục 6 của `docs/deployment-vercel-supabase.md`. Script
  này vẫn là cách đóng gói lịch sử vào `.bin` để trang mở lên là có ngay, không phải bấm.
- Chỉ đóng gói lại NQ / ES; `US100.bin` / `US500.bin` giữ nguyên. Trong `manifest.json`, US100 / US500
  đứng trước để phiên mới mở hai mã có lịch sử dài; NQ / ES chọn ở ô mã.
- Không lấy nến 5m / 1h (dài hơn) để nối vào: nến thô mà xem ở 1m thì replay lộ trước giá cả 5 phút /
  1 giờ, và lệnh SL / TP khớp sai.
- Đây là endpoint không chính thức của TradingView: họ đổi giao thức là script hỏng, và cách lấy data
  này không nằm trong điều khoản sử dụng của họ. Data CME có bản quyền: `.bin` vào git và được deploy
  cùng frontend, nên chỉ nên deploy cho bản thân dùng.

## Định dạng `.bin`

gzip của 6 cột Int32 nối liền nhau, mỗi cột dài `n`: phút Unix, open/high/low/close × 1000,
volume × 1e6. Mỗi cột lưu hiệu số so với giá trị trước nên nén rất tốt. Giá Dukascopy có tối đa 3
chữ số thập phân và volume tối đa 6, nên không mất chữ số nào; `build.mjs` báo ra nếu gặp giá trị
không giữ nguyên được. Phía frontend giải nén ở `frontend/src/features/replay/engine/bundle.ts`.

## Lưu ý

Giá là CFD bid của Dukascopy: bám theo chỉ số nhưng lệch với giá NQ/ES một khoảng basis, không có
gap khi roll hợp đồng, và volume không phải volume CME.
