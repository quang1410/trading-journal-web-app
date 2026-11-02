# Backtest bias ICT cho bot Telegram — 02/11/2026

Chạy thử luật bias (DOL 4 bước của ReeseTradesNQ, range HR/LR, SMT với ES; khung tham chiếu ưu tiên 15m rồi đi dần lên) trước khi
làm bot Telegram, để biết tin "bias hôm nay" có đáng tin không. Thiết kế bot rút ra từ kết quả này:
`docs/superpowers/specs/2026-11-02-nq-telegram-alerts-design.md`, plan triển khai:
`docs/superpowers/plans/2026-11-02-nq-telegram-alerts.md`.

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
| Cấu trúc khung tham chiếu (khung range) | 55.7% | 54.5% | 44.9% |
| SMT với ES, khung nhỏ nhất có SMT | 55.6% | 46.6% | 49.5% |
| Bias cuối (range HR/LR) | 45.3% | 48.5% | 56.8% |
| Bias cuối + Bước 1 cùng hướng | 44.9% | 44.6% | 60.3% (n=63) |
| Bước 1 + SMT cùng hướng | 57.2% | 48.6% | 53.6% |

Khoảng tin cậy của hầu hết các dòng (± 5–12%) đều chứa 50%, nên **chưa có tín hiệu nào chứng minh
được lợi thế về hướng**. Hai điểm lệch đáng chú ý, nhưng cần nhiều data hơn mới kết luận được (thử
nhiều cách cùng lúc thì vài cách lệch khỏi 50% là chuyện bình thường):

- "1a. Đi ra từ BSL/SSL" ở ± 150 điểm: 57% (CI 51–63%).
- "Cấu trúc khung tham chiếu" ở ± 40 điểm: 55.7% (CI 49–62%), nhưng ở ± 150 điểm lại còn 44.9%.

### 3. Những con số khác

- Bias cuối: tăng 106, giảm 65, trung lập 212 lần (55% số phiên là LR vs LR → không vào lệnh).
- Range gần như luôn chọn được ở 15m (362/383 lần), rộng trung bình 189 điểm.
- SMT với ES tìm theo thứ tự 15m → Daily, chỉ lấy SMT có swing sau trong 20 nến gần nhất của khung
  đó: 15m 89 lần, 30m 51, 1H 37, 2H 33, 4H 33, 8H 21, 12H 2, Daily 10, không khung nào có 107 lần.
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

---

# Phần 2: vào lệnh trên M1, TP 2R

Chạy lại: `cd backend && go run ./cmd/ict-backtest -trades`. Code: `backend/internal/ict/trades.go`
(có test), bảng in ra ở `backend/cmd/ict-backtest/trades.go`.

## Luật vào lệnh (mã hoá từ 5 ghi chú video ReeseTradesNQ)

1. **Thanh khoản:** lúc mở phiên, lấy các mức chưa bị quét — PDH/PDL, High/Low Asia, London, NY AM,
   NY PM — và hai đầu range của khung tham chiếu (ưu tiên 15m).
2. **Thao túng:** trong khung giờ trade (Asia 19:00–21:00, NY AM 09:30–11:00), nến 1m quét một mức.
3. **FVG khung lớn (IFVG model):** cực trị thao túng chạm một FVG 15m–4H chưa bị phá, và chưa nến 1m
   nào đóng dưới (với long) mép xa của FVG đó.
4. **IFVG trên M1:** một FVG 1m ngược chiều của chân thao túng bị nến thân đầy (thân ≥ 60% biên độ)
   đóng xuyên qua → vào lệnh ở giá đóng nến đó.
5. **SL** = cực trị thao túng ± 0,25 điểm · **TP** = 2R · SL và TP chạm trong cùng nến 1m tính là SL
   · chưa chạm gì thì đóng lúc 16:00 (NY) / 05:00 (Asia) · tối đa 1 lệnh mỗi phiên.
6. **Bộ lọc bật / tắt để so sánh:**
   - Stop raid: sau cú quét, một swing 1m hình thành rồi bị quét trước nến IFVG.
   - SMT: ES không quét mức cùng tên.
   - DOL: lệnh cùng hướng DOL tiềm năng (bước 1 của phần 1).
   - OXXC/PO3: giá vào còn ở discount (long) / premium (short) so với giá mở nến 1H đang chạy.

Hoà vốn ở TP 2R cần winrate **33,3%**.

## Kết quả: US100 / US500, 391 phiên (21/01 → 22/10/2026)

| Luật | Lệnh | Winrate | 95% CI | R TB / lệnh | Tổng R | Sụt tối đa |
|---|---:|---:|---|---:|---:|---:|
| Chỉ quét + IFVG (không cần FVG khung lớn) | 293 | 31,1% | 26–37% | +0,00 | +0,4 | 24,4R |
| **IFVG model** (quét + FVG ≥15m + IFVG) | 232 | 31,9% | 26–38% | +0,03 | +6,4 | 22,2R |
| + stop raid | 208 | 31,2% | 25–38% | +0,08 | +16,8 | 14,5R |
| + SMT với ES | 53 | 24,5% | 15–38% | −0,18 | −9,6 | 14,2R |
| + cùng hướng DOL | 150 | 32,7% | 26–41% | +0,08 | +11,4 | 12,0R |
| + OXXC/PO3 | 202 | 32,7% | 27–39% | +0,04 | +9,0 | 12,3R |
| + stop raid + PO3 | 166 | 32,5% | 26–40% | +0,09 | +14,8 | 16,5R |
| Đủ checklist (raid + SMT + DOL + PO3) | 15 | 6,7% | 1–30% | −0,68 | −10,2 | 12,2R |

"Hết giờ" (lệnh không chạm TP/SL) tính vào mẫu số winrate nhưng R lấy theo giá đóng, nên R TB có
thể dương dù winrate dưới 33,3%. SL trung bình 50–65 điểm (Asia ~30, NY AM ~70).

**Theo phiên — IFVG model + stop raid + PO3:** Asia 64 lệnh, 45,3%, +0,36R/lệnh, +23,0R · NY AM
102 lệnh, 24,5%, −0,08R/lệnh, −8,2R.

## Kiểm tra độ bền: chia đôi thời gian

| Luật | Asia T1–5 | Asia T6–10 | NY AM T1–5 | NY AM T6–10 |
|---|---:|---:|---:|---:|
| IFVG model | 29,3% (−4,4R) | 51,1% (+25,0R) | 35,7% (+11,4R) | 17,6% (−25,6R) |
| + stop raid + PO3 | 32,3% (−1,0R) | 57,6% (+24,0R) | 25,9% (−6,7R) | 22,9% (−1,5R) |
| + cùng hướng DOL | 28,0% (−3,4R) | 61,9% (+18,0R) | 30,9% (+1,3R) | 24,5% (−4,5R) |

Kết quả **đảo chiều giữa hai nửa**: Asia chỉ lời ở tháng 6–10, NY AM chỉ lời nhẹ ở tháng 1–5.
Một lợi thế thật sẽ phải dương ở cả hai nửa.

## Kết luận phần 2

- Trên toàn bộ 10 tháng, IFVG model đã mã hoá cho winrate ~32% ở TP 2R — **quanh điểm hoà vốn**
  (33,3%), R TB từ −0,0 tới +0,09 mỗi lệnh tuỳ bộ lọc, chưa trừ phí là gần như hết.
- Bộ lọc tốt nhất trên giấy (Asia + stop raid + PO3: 45%, +0,36R) **không bền**: tháng 1–5 lỗ.
  Thử 8 bộ lọc × 2 phiên thì việc một ô trông đẹp là chuyện bình thường.
- **SMT với ES làm kết quả xấu đi** (24,5%) — khớp với ghi chú "SMT chỉ là xác nhận cuối, không phải
  lý do vào lệnh"; khi bắt buộc có SMT, lệnh còn lại ít và tệ hơn.
- Data NQ/ES CME thật chỉ có 6 phiên (4 lệnh) — không kết luận được gì.

**Giới hạn:** giá CFD bid (không có spread thật), luật HR/LR, FVG điều kiện, displacement là bản mã
hoá của mình; người trade thật còn bỏ qua nhiều setup "xấu" mà luật cứng không thấy. Kết quả này
nói rằng **phần có thể viết thành luật cứng** của phương pháp chưa có lợi thế; phần phán đoán của
người trade thì cần đo trên lệnh thật trong nhật ký.

---

# Phần 3: bộ lọc A+ đủ tiêu chí bắt buộc của IFVG model

Chủ sản phẩm cho rằng phương pháp đạt winrate trên 80%, nên phần này đọc lại toàn văn 5 ghi chú và
đối chiếu thuật ngữ với skill "ICT Smart Money" (CISD, IFVG chỉ hợp lệ sau cú quét + ở vùng giá
khung lớn, IFVG = FVG bị phá ngay lần chạm đầu, vào lệnh ngay hoặc lệnh chờ ở mép IFVG). Luật lần
trước bỏ sót nhiều tiêu chí BẮT BUỘC trong ghi chú IFVG model; phần này thêm đủ:

| Tiêu chí (ghi chú IFVG model) | Mã hoá |
|---|---|
| AMD | 20 nến 1m đi ngang chặt (biên độ ≤ 4 × biên độ TB một nến), cú phá giả quét đáy/đỉnh vùng đó |
| FVG khung lớn | cực trị thao túng chạm FVG 15m–4H còn mới (chưa chạm lần nào trước phiên) |
| True manipulation | ES chạm FVG 15m–4H của ES trong chân thao túng, hoặc ES giữ vùng tích lũy của nó (SMT) |
| PO3 | cực trị thao túng trong 10 phút đầu một nến 15m, vượt giá mở nến đó |
| IFVG có displacement | thân ≥ 60%, râu phía đóng cửa ≤ 20% biên độ, phá trong ≤ 3 nến kể từ lần chạm đầu |
| Tuỳ chọn | stop raid, stop sạch (không đáy/FVG 15m chưa chạm trong 0,5R dưới stop), quét mức phiên, CISD, SMT |
| Mục tiêu | 2R · 1R · đỉnh/đáy vùng tích lũy (mục tiêu Reese dùng trong ví dụ) |
| Vào lệnh | giá đóng nến IFVG, hoặc lệnh chờ ở mép FVG vừa bị phá (huỷ sau 10 nến) |

Chạy lại: `cd backend && go run ./cmd/ict-backtest -trades`.

## Kết quả (391 phiên, US100 / US500)

| Luật | Lệnh | Winrate | 95% CI | Hoà vốn cần | R TB / lệnh |
|---|---:|---:|---|---:|---:|
| IFVG cơ bản · TP 2R | 232 | 31,9% | 26–38% | 33,3% | +0,03 |
| **A+** · TP 2R | 108 | 29,6% | 22–39% | 33,3% | −0,04 |
| A+ · TP 1R | 108 | 41,7% | 33–51% | 50% | −0,11 |
| A+ · TP đỉnh/đáy tích lũy | 93 | 46,2% | 36–56% | tuỳ lệnh | −0,02 |
| A+ · lệnh chờ ở mép IFVG · TP 2R | 101 | 23,8% | 17–33% | 33,3% | −0,19 |
| A+ + CISD · TP 2R | 76 | 28,9% | 20–40% | 33,3% | −0,03 |
| A+ + SMT · TP 2R | 10 | 10,0% | 2–40% | 33,3% | −0,57 |
| **A+ đủ** (+ stop raid + stop sạch + quét mức phiên) · TP 2R | 33 | 30,3% | 17–47% | 33,3% | −0,01 |
| A+ đủ · TP 1R | 33 | 39,4% | 25–56% | 50% | −0,13 |

Chia đôi thời gian, cùng một kiểu như phần 2: tháng 1–5 lỗ (A+ · TP 2R 22,0%, −13,9R), tháng 6–10
lời (36,2%, +9,5R). Ô cao nhất tìm thấy là "A+ đủ · TP 1R" tháng 6–10: 63,6% — nhưng chỉ 11 lệnh
(CI 35–85%) và tháng 1–5 cùng luật đó còn 27,3%.

## Vì sao không ra 80%

1. **Con số 80–90% là lời tác giả**, chính các ghi chú ghi rõ "không có số liệu kiểm chứng, ví dụ
   trên chart đều là lệnh thắng được chọn sẵn".
2. **Winrate phụ thuộc mục tiêu.** 80% ở TP 2R nghĩa là +1,4R mỗi lệnh — mức gần như không có ở
   đâu. Chính skill "ICT Smart Money" đặt mục tiêu backtest là winrate > 45% và dẫn một trader
   vô địch có winrate 30–33% với R:R 4–5. Mục tiêu càng gần (1R, đỉnh tích lũy) thì winrate càng
   cao nhưng mỗi lệnh thắng càng ít.
3. **Phần phán đoán không mã hoá được.** "DOL A+ rõ ràng", "đúng kịch bản MMXM", "IFVG khung lớn
   nhất trên chân thao túng" (Reese xuống tới 30s/15s; data ở đây chỉ có 1m) là phần người trade tự
   chọn. Luật cứng ở đây chỉ chấm phần viết được thành điều kiện.
4. **Data:** CFD bid, không spread; nến 1m nên SL và TP chạm cùng nến bị tính là thua.

Kết luận không đổi: **phần mã hoá được** của phương pháp cho winrate quanh điểm hoà vốn ở mọi mục
tiêu, kết quả đổi dấu giữa hai nửa năm. Cách đo đúng lợi thế của người trade là chấm chính các lệnh
họ chọn (nhật ký), hoặc để họ đánh dấu setup A+ trên `/replay` rồi chấm kết quả các setup đó.

---

# Phần 4: tối ưu có kiểm chứng (walk-forward)

Câu hỏi của chủ sản phẩm: "tự backtest mà chưa tìm được bộ tối ưu?". Thử nhiều tổ hợp trên cùng
một data thì luôn "tìm thấy" một bộ đẹp; cách đo đúng là chọn bộ tốt nhất trên phần đầu data rồi
chấm nó trên phần sau mà nó chưa thấy.

Chạy lại: `cd backend && go run ./cmd/ict-backtest -optimize [-split 2026-07-01]`.

- **Không gian dò:** 10 bộ lọc bật/tắt (FVG ≥15m, stop raid, DOL, OXXC/PO3 1H, AMD, true
  manipulation, PO3 nến 15m, stop sạch, CISD, IFVG mạnh) × 5 mục tiêu (1R, 1,5R, 2R, 3R, đỉnh/đáy
  tích lũy) × 2 cách vào (đóng nến, lệnh chờ ở mép IFVG) = **10 240 bộ luật**, × 3 lựa chọn phiên
  (Asia, NY AM, cả hai). Chỉ xếp hạng tổ hợp có ≥ 30 lệnh ở train (≥ 20 nếu một phiên).
- **Train** 21/01 → 30/06/2026, **test** 01/07 → 22/10/2026 (và thử lại với mốc 01/06).

| | Mốc 01/07 | Mốc 01/06 |
|---|---:|---:|
| Tương quan R TB train ↔ test | −0,01 | 0,04 |
| Top 15 theo train: R TB ở test | +0,18 | +0,35 |
| Top 50 theo train: R TB ở test | +0,14 | +0,39 |
| Mọi tổ hợp phiên Asia: R TB ở test (mốc so sánh) | +0,15 | +0,22 |
| Mọi tổ hợp phiên NY AM: R TB ở test | +0,03 | −0,03 |

Bộ đứng đầu train (mốc 01/07): "DOL + PO3 1H + AMD + PO3 15m + stop sạch + CISD + IFVG mạnh, TP
đỉnh tích lũy, phiên Asia" — **winrate 74% ở train (23 lệnh), 64% ở test (11 lệnh)**, R TB +1,53 →
+0,25. Các bộ top train đều là phiên Asia với mục tiêu đỉnh/đáy tích lũy, winrate train 70–77%.

**Đọc kết quả:**

1. Tương quan train ↔ test gần 0: bộ nào tốt ở train không cho biết bộ đó tốt ở test.
2. Top theo train ở test chỉ hơn mức trung bình của *mọi* bộ luật phiên Asia 0,03–0,17R. Phần lời
   ở test chủ yếu đến từ giai đoạn: phiên Asia tháng 6–10 lời với gần như bộ luật nào (phần 2–3 đã
   thấy tháng 1–5 thì lỗ). Đó là chế độ thị trường, không phải bộ lọc.
3. Winrate 70–80% có xuất hiện — với mục tiêu gần (đỉnh tích lũy) và vài chục lệnh được chọn từ
   10 240 bộ — rồi tụt khi sang data mới. Đây đúng là cách một con số "80%" được tạo ra khi chọn sau.

**Kết luận phần 4:** chưa có bộ luật nào có lợi thế ổn định trên data hiện có. Muốn tối ưu đáng tin
cần data dài hơn nhiều (vài năm, để có vài trăm lệnh mỗi bộ ở cả train lẫn test) hoặc forward test
bằng bot trong vài tháng tới.
