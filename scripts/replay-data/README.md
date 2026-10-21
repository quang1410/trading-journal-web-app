# Data cho trang /replay

Tải nến 1 phút miễn phí từ Dukascopy cho US100 (≈ NQ) và US500 (≈ ES), rồi đóng gói vào
`frontend/public/replay-data/` để trang `/replay` tự mở khi khởi động.

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

## Định dạng `.bin`

gzip của 6 cột Int32 nối liền nhau, mỗi cột dài `n`: phút Unix, open/high/low/close × 1000,
volume × 1e6. Mỗi cột lưu hiệu số so với giá trị trước nên nén rất tốt. Giá Dukascopy có tối đa 3
chữ số thập phân và volume tối đa 6, nên không mất chữ số nào; `build.mjs` báo ra nếu gặp giá trị
không giữ nguyên được. Phía frontend giải nén ở `frontend/src/features/replay/engine/bundle.ts`.

## Lưu ý

Giá là CFD bid của Dukascopy: bám theo chỉ số nhưng lệch với giá NQ/ES một khoảng basis, không có
gap khi roll hợp đồng, và volume không phải volume CME.
