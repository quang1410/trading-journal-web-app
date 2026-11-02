# Backtest bias ICT cho bot Telegram — 02/11/2026

Chạy thử luật bias (DOL 4 bước của ReeseTradesNQ, range HR/LR, SMT với ES trên 8 khung) trước khi
làm bot Telegram, để biết tin "bias hôm nay" có đáng tin không.

Chạy lại:

```bash
cd backend
go run ./cmd/ict-backtest                 # range ưu tiên từ 15m (mặc định đã chốt)
go run ./cmd/ict-backtest -min-tf 1H      # range bắt đầu từ 1H
```

Code: `backend/internal/ict` (package thuần, có test), `backend/cmd/ict-backtest` (đọc `.bin`, in báo
cáo Markdown).

## Data và cách chấm

- **Data:** US100 (đóng vai NQ) và US500 (đóng vai ES), CFD Dukascopy nến 1m trong
  `frontend/public/replay-data`, 21/01 → 22/10/2026 (bỏ 20 ngày đầu cho khung lớn đủ nến).
  NQ/ES CME thật trong repo chỉ có khoảng 4 ngày, không đủ để chấm.
- **383 phiên** (Asia 18:55 và NY AM 09:25 giờ New York). Bot chỉ thấy nến đóng trước giờ gửi tin
  10 phút, mô phỏng data CME miễn phí bị trễ. Có test khẳng định phân tích không đọc nến tương lai.
- **Dự đoán:** phía nào bị giao dịch vượt qua trước, đỉnh (BSL) hay đáy (SSL). Chấm tới 16:00 với
  phiên NY, tới 05:00 hôm sau với phiên Asia. Tỉ lệ đúng = thắng / (thắng + thua), kèm khoảng tin cậy
  95% (Wilson).

## Kết quả chính

### 1. Chấm với mục tiêu là đỉnh / đáy range — con số trông đẹp nhưng gây hiểu lầm

Range ưu tiên từ 15m:

| Cách dự đoán | Tỉ lệ đúng | 95% CI | Số lần có kết quả |
|---|---:|---|---:|
| **Đoán phía gần giá hơn (không cần ICT)** | **69.8%** | 65–74% | 361 |
| Luôn long | 51.2% | 46–56% | 361 |
| Bước 1: DOL tiềm năng | 54.8% | 50–60% | 361 |
| Bias cuối (range HR/LR) | 53.8% | 46–61% | 160 |
| Bias cuối + Bước 1 cùng hướng | 56.9% | 45–68% | 72 |

Khi cho range bắt đầu từ khung lớn hơn, tỉ lệ đúng tăng lên: "Bias cuối + Bước 1 cùng hướng" đạt
79% (từ 1H) và 84% (từ 4H). Nhưng mốc so sánh "đoán phía gần giá hơn" cũng tăng lên 78% và 90%.
Range càng rộng thì phía gần giá gần như luôn bị chạm trước, nên **tỉ lệ đúng kiểu này chủ yếu đo
khoảng cách, không đo khả năng đoán hướng**.

### 2. Chấm công bằng: hai mục tiêu cách đều giá — mọi tín hiệu quanh 50%

Mục tiêu là giá ± K điểm, nên đoán bừa đúng đúng 50%. Range ưu tiên từ 15m:

| Cách dự đoán | ± 40 điểm | ± 80 điểm | ± 150 điểm |
|---|---:|---:|---:|
| Luôn long | 51.3% | 49.6% | 49.7% |
| Hướng nến Daily trước | 54.5% | 53.2% | 55.1% |
| 1a. Đi ra từ BSL/SSL | 53.4% | 53.2% | 57.1% |
| 1b. Hành vi FVG 15m–4H | 50.8% | 49.3% | 52.4% |
| Bước 1: DOL tiềm năng | 50.8% | 49.6% | 52.4% |
| Cấu trúc 8 khung (đa số) | 48.5% | 47.7% | **41.0%** |
| Bias cuối (range HR/LR) | 45.3% | 48.5% | 56.8% |
| Bias cuối + Bước 1 cùng hướng | 44.9% | 44.6% | 60.3% (n=63) |
| Bước 1 + SMT cùng hướng | 53.9% | 50.4% | 55.3% |

Khoảng tin cậy của hầu hết các dòng (± 5–12%) đều chứa 50%, nên **chưa có tín hiệu nào chứng minh
được lợi thế về hướng**. Hai điểm lệch đáng chú ý, nhưng cần nhiều data hơn mới kết luận được (thử
nhiều cách cùng lúc thì vài cách lệch khỏi 50% là chuyện bình thường):

- "1a. Đi ra từ BSL/SSL" ở ± 150 điểm: 57% (CI 51–63%).
- "Cấu trúc 8 khung" ở ± 150 điểm: 41% (CI 35–47%), tức đi **ngược** cấu trúc lại đúng 59%.

### 3. Những con số khác

- Bias cuối: tăng 106, giảm 65, trung lập 212 lần (55% số phiên là LR vs LR → không vào lệnh).
- Range gần như luôn chọn được ở 15m (362/383 lần), rộng trung bình 189 điểm.
- Chấm theo đúng hai kịch bản trong tin (tôn trọng / phá FVG điều kiện): 52.9% (CI 45–61%).
- Asia 52.0%, NY AM 55.3% — không khác nhau rõ.

## Giới hạn của lần chạy này

- **CFD, không phải NQ/ES:** lệch giá future một khoảng basis; với câu hỏi "lên hay xuống trước"
  thì ảnh hưởng nhỏ.
- **Luật là bản mã hoá của mình:** HR/LR, "tôn trọng FVG", chọn FVG điều kiện vốn là phán đoán của
  trader. Bản code có thể khác cách chủ sản phẩm đọc chart. Kết quả này chấm **luật đã mã hoá**,
  không chấm phương pháp của người trade.
- **Không chấm phần vào lệnh:** phương pháp gốc chờ xác nhận ở khung nhỏ (IFVG, stop raid) rồi mới
  vào. Backtest này chỉ chấm bias trước phiên.
- **383 phiên, khoảng 10 tháng:** đủ để thấy không có lợi thế lớn, chưa đủ để thấy lợi thế nhỏ
  (dưới khoảng 5%).

## Hướng đi đề xuất

1. Tin Telegram trước phiên **không nên ghi "Bias: TĂNG / GIẢM" như một dự đoán**. Nên đưa dữ kiện
   (mức thanh khoản, mức nào đã bị quét, FVG nào giữ / bị phá, SMT, range) và hai kịch bản "nếu…
   thì…", để người trade tự quyết.
2. Chủ sản phẩm soát lại luật mã hoá trên vài ngày ở trang `/replay`: chỗ nào bot đọc HR/LR hay FVG
   điều kiện khác mình thì sửa luật, rồi chạy lại backtest.
3. Đo lợi thế trên lệnh thật trong nhật ký (setup ICT đã ghi) thay vì chỉ trên bias.
