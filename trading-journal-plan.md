# SPEC — Nhật Ký Giao Dịch (bản chi tiết cho TDD)

> Bản này thay thế bản tóm tắt trước. Toàn bộ công thức dưới đây **trích trực tiếp từ công thức Excel gốc** (đã convert `.xlsb → .xlsx` và đọc formula), rồi diễn giải thành đặc tả thuần nghiệp vụ. Mỗi mục đều kèm định nghĩa chính xác + ví dụ số để bạn viết test trước (red → green → refactor).
>
> Quy ước: `net = profit − fee`. Mọi thống kê tính **trên tập lệnh đã lọc theo account** (và theo kỳ nếu có filter). Không tự chế cơ chế license/trial của bản Excel.

---

## 0. Bảng tra cứu nhanh (mapping cột Excel → field)

Trong Excel, dữ liệu lệnh bắt đầu ở **dòng 7**, header ở dòng 6.

| Cột | Header Excel | Field | Loại |
|---|---|---|---|
| C | STT | `stt` | input (auto-number) |
| D | Account | `account_code` | input |
| E | Day | `day` | input (date) |
| F | Symbol | `symbol` | input |
| G | Long/ Short | `direction` | input |
| H | Entry | `entry` | input |
| I | Exit | `exit` | input |
| J | Volume | `volume` | input |
| K | Profit | `profit` | input |
| L | Profit lý thuyết | `profit_theory` | input |
| M | Phí | `fee` | input |
| N | Setup | `setup` | input (cat) |
| O | Timeframe | `timeframe` | input (cat) |
| P | Vào lệnh | `entry_quality` | input (cat) |
| Q | Trong lệnh | `in_trade_quality` | input (cat) |
| R | Thoát lệnh | `exit_quality` | input (cat) |
| S | Tâm lý giao dịch | `psychology` | input (cat) |
| T | Notes | `notes` | input |
| U | Loại lệnh | `trade_class` | **derived** |
| V | Điểm Vào lệnh | `score_entry` | **derived** |
| W | Điểm Thoát lệnh | `score_exit` | **derived** |
| X | Điểm Trong lệnh | `score_in_trade` | **derived** |
| Y | Điểm Tâm lý | `score_psych` | **derived** |
| Z | Tổng điểm | `score_total` | **derived** |
| AA | Week | `week` | **derived** |
| AB | Month | `month` | **derived** |
| AC | Profit (đã trừ phí) | `net` | **derived** |
| AD | Win/Loss | `win_loss` | **derived** |
| AE | Profit cộng dồn theo lệnh | `cum_by_trade` | **derived** |
| AF | Profit cộng dồn theo ngày | `cum_by_day` | **derived** |
| AG | Win | `win_sign` | **derived** |
| AH | Profit lý thuyết cộng dồn | `cum_theory` | **derived** |
| AI | Running Peak | `running_peak` | **derived** |
| AO | Drawdown | `drawdown` | **derived** |

---

## 1. Enumerations (chuỗi phải khớp CHÍNH XÁC — dùng làm key chấm điểm)

Các chuỗi này là literal so sánh `=` trong công thức. Nếu bạn đổi text hiển thị, phải giữ một `code` ổn định bên dưới để map điểm.

**Direction:** `Long` | `Short` (Excel: cột "Long/ Short").

**Timeframe:** `M1` `M5` `M15` `M30` `H1` `H4` `D1` `W`

**Setup:** do user tự định nghĩa; mặc định `KHÔNG CÓ SETUP`.

**entry_quality (Vào lệnh):** `Đúng kế hoạch` | `Quá sớm` | `Quá muộn` | `Bốc đồng`

**in_trade_quality (Trong lệnh):** `Tuân thủ kế hoạch` | `Dời Chốt lời` | `Dời dừng lỗ ra xa` | `Muốn thoát lệnh`

**exit_quality (Thoát lệnh):** `Chạm Chốt lời` | `Chạm Dừng lỗ` | `Thoát chủ động (lý do kỹ thuật)` | `Thoát lệnh cảm tính, sợ hãi`

**psychology (Tâm lý):** `Không lỗi` | `SỢ BỎ LỠ (FOMO)` | `SỢ HÃI` | `HI VỌNG` | `THAM LAM` | `GIAO DỊCH TRẢ THÙ` | `LUÔN MUỐN MÌNH ĐÚNG`

---

## 2. Chấm điểm giao dịch — BẢNG MAP ĐIỂM CHÍNH XÁC

Đây là phần quan trọng nhất và trước đây bị ẩn. Trích nguyên từ công thức Excel (cột V, W, X, Y).

### 2.1. `score_entry` ← `entry_quality` (Excel V7)

| entry_quality | điểm |
|---|---|
| (rỗng) | 0 |
| `Đúng kế hoạch` | 25 |
| `Quá sớm` | 10 |
| `Quá muộn` | 10 |
| `Bốc đồng` | 0 |

### 2.2. `score_exit` ← `exit_quality` (Excel W7)

| exit_quality | điểm |
|---|---|
| (rỗng) | 0 |
| `Chạm Chốt lời` | 25 |
| `Chạm Dừng lỗ` | 25 |
| `Thoát chủ động (lý do kỹ thuật)` | 15 |
| `Thoát lệnh cảm tính, sợ hãi` | 0 |

> Lưu ý: `Chạm Dừng lỗ` vẫn được **25 điểm** — vì đây chấm *kỷ luật thực thi* (chạm SL đúng kế hoạch là tốt), không phải chấm lãi/lỗ.

### 2.3. `score_in_trade` ← `in_trade_quality` (Excel X7)

| in_trade_quality | điểm |
|---|---|
| (rỗng) | 0 |
| `Tuân thủ kế hoạch` | 25 |
| `Dời Chốt lời` | 10 |
| `Dời dừng lỗ ra xa` | 0 |
| `Muốn thoát lệnh` | 5 |

### 2.4. `score_psych` ← `psychology` (Excel Y7)

| psychology | điểm |
|---|---|
| (rỗng) | 0 |
| `Không lỗi` | 25 |
| `SỢ BỎ LỠ (FOMO)` | 0 |
| `SỢ HÃI` | 5 |
| `HI VỌNG` | 5 |
| `THAM LAM` | 5 |
| `GIAO DỊCH TRẢ THÙ` | 0 |
| `LUÔN MUỐN MÌNH ĐÚNG` | 0 |

### 2.5. `score_total` (Excel Z7)

```
score_total = score_entry + score_exit + score_in_trade + score_psych   // 0..100
```

Excel trả `""` khi cả 4 điểm đều rỗng. Trong thực tế mỗi hàm con trả 0 cho input rỗng, nên **quy ước web:** nếu **cả 4 field category đều rỗng** → `score_total = null` (chưa chấm). Ngược lại → tổng như trên.

### 2.6. `trade_class` — Loại lệnh (Excel U7)

Dựa trên `score_total`:

| Điều kiện | trade_class |
|---|---|
| chưa chấm (score_total = null) | `CHƯA ĐÁNH GIÁ` |
| score_total ≥ 80 | `Đúng kế hoạch` |
| 55 ≤ score_total < 80 | `Cần cải thiện` |
| 30 ≤ score_total < 55 | `Bốc đồng / FOMO` |
| score_total < 30 | `Giao dịch trả thù` |

> Ranh giới là `>=` (đóng dưới). Ví dụ đúng 80 → "Đúng kế hoạch"; đúng 55 → "Cần cải thiện"; đúng 30 → "Bốc đồng / FOMO".

### 2.7. Test cases gợi ý cho §2 (đủ phủ mọi nhánh)

```
// score_entry
"" → 0 ; "Đúng kế hoạch" → 25 ; "Quá sớm" → 10 ; "Quá muộn" → 10 ; "Bốc đồng" → 0
// score_exit
"Chạm Chốt lời" → 25 ; "Chạm Dừng lỗ" → 25 ; "Thoát chủ động (lý do kỹ thuật)" → 15 ; "Thoát lệnh cảm tính, sợ hãi" → 0
// score_in_trade
"Tuân thủ kế hoạch" → 25 ; "Dời Chốt lời" → 10 ; "Dời dừng lỗ ra xa" → 0 ; "Muốn thoát lệnh" → 5
// score_psych
"Không lỗi" → 25 ; "SỢ HÃI" → 5 ; "HI VỌNG" → 5 ; "THAM LAM" → 5 ; "SỢ BỎ LỠ (FOMO)" → 0 ; "GIAO DỊCH TRẢ THÙ" → 0 ; "LUÔN MUỐN MÌNH ĐÚNG" → 0

// score_total + trade_class (biên)
all best (25+25+25+25=100) → "Đúng kế hoạch"
(25+25+25+5 = 80)          → "Đúng kế hoạch"      // biên 80
(25+25+25+0 = 75)          → "Cần cải thiện"
(25+15+10+5 = 55)          → "Cần cải thiện"       // biên 55
(25+10+10+5 = 50)          → "Bốc đồng / FOMO"
(10+15+5+0  = 30)          → "Bốc đồng / FOMO"      // biên 30
(10+0+10+5  = 25)          → "Giao dịch trả thù"
all empty                  → score_total=null, trade_class="CHƯA ĐÁNH GIÁ"
```

---

## 3. Derived fields theo từng lệnh — công thức chính xác

Sắp xếp lệnh trong 1 account theo thứ tự nhập (STT tăng dần). Các trường lũy kế phụ thuộc thứ tự này.

### 3.1. `net` (Excel AC = K − M)
```
net = profit − fee
```

### 3.2. `win_loss` (Excel AD)
```
win_loss = 1 if net >= 0 else 0
```
> Chú ý: `net = 0` được tính là **1 (không thua)**. `win_sign` (AG) thì: `1 if net >= 0 else -1`.

### 3.3. `week` / `month` (Excel AA/AB)
```
week  = "W" + ISO_week_number(day)      // vd "W24"
month = format(day, "MM/yyyy")          // vd "06/2026"
```
> Excel dùng `WEEKNUM(...,1)` (tuần bắt đầu Chủ nhật, tuần chứa 1/1 là tuần 1). Nếu muốn chuẩn ISO thì thống nhất một convention và test theo đó. Tính theo `Asia/Ho_Chi_Minh`.

### 3.4. `cum_by_trade` (Excel AE) — equity theo lệnh
```
cum_by_trade[i] = Σ net[j] với j = mọi lệnh cùng account, STT ≤ STT[i]
```

### 3.5. `cum_by_day` (Excel AF) — equity theo ngày
```
cum_by_day[i] = tổng net lũy kế tính đến HẾT ngày của lệnh i (cùng account)
```
> Trong Excel là giá trị lũy kế cuối ngày; mọi lệnh trong cùng 1 ngày mang cùng giá trị `cum_by_day` = tổng net tới cuối ngày đó.

### 3.6. `cum_theory` (Excel AH)
```
cum_theory[i] = Σ profit_theory[j], j cùng account, STT ≤ STT[i]
```

### 3.7. `running_peak` (Excel AI) & `drawdown` (Excel AO)
```
running_peak[i] = max(0, max(cum_by_trade[j]) với j ≤ i)   // đỉnh chạy, FLOOR tại 0
drawdown[i]     = running_peak[i] − cum_by_trade[i]         // luôn ≥ 0
```
> Excel là `MAX(0, ...)`: nếu equity lũy kế chưa từng vượt 0 (account đang âm ngay từ đầu) thì đỉnh vẫn tính là 0, nên `drawdown` phản ánh mức âm so với mốc 0. Cần test case account thua ngay lệnh đầu.

### 3.8. `weekday` (Excel AL)
```
weekday = format(day, "ddd")   // Mon..Sun (Excel: "Tue","Wed"...)
```

---

## 4. KPI toàn tài khoản — công thức chính xác

Ký hiệu: `wins` = tập lệnh `net > 0`, `losses` = tập lệnh `net < 0`. `IB` = initial_balance của account.

| KPI | Công thức (Excel) | Ghi chú |
|---|---|---|
| `total_win` | Σ net where net > 0 | (G6) |
| `total_loss` | Σ net where net < 0 | (I6) — **âm** |
| `net_profit` | `total_win + total_loss` | (E4) |
| `net_return_pct` | `net_profit / IB` | (E5) — chia **vốn ban đầu** |
| `total_fees` | Σ fee | (E6) |
| `profit_factor` | `−total_win / total_loss` | (E7); nếu `total_loss = 0` → ∞/`null` |
| `loss_count` | count(net < 0) | (E8) |
| `win_count` | count(net > 0) | (E9) |
| `total_trades` | `win_count + loss_count` | (E10) — **lệnh net=0 không tính** |
| `win_pct` | `win_count / total_trades` | (E11) |
| `ave_win` | `total_win / win_count` | (H9) |
| `ave_loss` | `total_loss / loss_count` | (I9) — **âm** |
| `biggest_winner` | max(net) | (E14) |
| `biggest_loser` | min(net) | (E15) |
| `one_R` | `IB × risk_per_trade` | (G12) — 1R quy ra tiền |
| `biggest_R_win` | `biggest_winner / one_R` | (E12) |
| `biggest_R_loss` | `biggest_loser / one_R` | (E13) |
| `rr_actual` | `−(ave_win/one_R) / (ave_loss/one_R)` | (J13) = `−ave_win/ave_loss` |
| `expectancy` | `win_pct × ave_win + (1 − win_pct) × ave_loss` | (E16) — kỳ vọng $/lệnh |
| `max_drawdown` | `max(drawdown[i])` trên equity theo lệnh | (Dashboard J3) |
| `max_dd_pct` | `− max_drawdown / (max(running_peak) + IB)` | (Dashboard L3) — **giá trị âm**; mẫu số = đỉnh equity tuyệt đối (đỉnh lãi lũy kế + vốn ban đầu). Mẫu: `−50/(350+5000) = −0.00935` |
| `recovery_factor` | `net_profit / max_drawdown` | (Dashboard M3); nếu MDD=0 → `null` |
| `current_balance` | `IB + net_profit + Σnạp − Σrút` | |

**Ngưỡng tô màu (từ sheet Explain):**
- `profit_factor`: `<1` đỏ · `1–1.5` vàng · `1.5–2` xanh lá · `>2` xanh dương
- `recovery_factor`: `<1` đỏ · `1–2` vàng · `>2` xanh lá
- `score_total` trung bình: mục tiêu `≥ 80`
- `expectancy`: `>0` tốt (có lợi thế dài hạn)

---

## 5. Aggregations cho biểu đồ

Mỗi nhóm dưới đây là 1 pivot: group-by → tính `{count, win_count, sum_net, ave_net, win_rate}`.

1. **Theo Setup** — top 6 setup nhiều lệnh nhất. Metric: `sum_net`, `ave_net = sum_net/count`, `count`, `win_rate`.
2. **Theo Symbol** — top 6.
3. **Theo Timeframe** — tất cả TF xuất hiện.
4. **Theo Direction (Long/Short)** — 2 nhóm; kèm `long_win_pct`, `short_win_pct`.
5. **Theo Weekday** — Mon..Sun; tách `profit_positive` / `profit_negative` để vẽ cột xanh/đỏ.
6. **Theo Week** — `lợi_nhuận_tuần = Σ net` mỗi tuần.
7. **Theo Day** — `Σ net` mỗi ngày (cột xanh/đỏ) + đường `cum_by_day` (line tăng trưởng).
8. **Heatmap tháng** — grid lịch: mỗi ô ngày = `{sum_net_day, trade_count_day}`. Excel dựng lưới 7 cột (CN→T7) từ ngày đầu tháng.
9. **Phân phối R** — histogram. Với mỗi lệnh: `R = net / one_R`, rồi bin vào bucket. Danh sách bucket (đúng thứ tự):
   `Dưới -20R`, `-15R to -20R`, `-10R to -15R`, `-8R to -10R`, `-6R to -8R`, `-5R to -6R`, `-4R to -5R`, `-3R to -4R`, `-2R to -3R`, `-1R to -2R`, `0R to -1R`, `0R to 1R`, `1R to 2R`, `2R to 3R`, `3R to 4R`, `4R to 5R`, `5R to R6`, `6R to 8R`, `8R to 10R`, `10R to 15R`, `15R to 20R`, `Trên 20R`.
   Mỗi bucket đếm số lệnh; tách thắng (xanh) / thua (đỏ). Mục tiêu: lệnh thua co cụm gần 0R.
10. **Chấm điểm** — `avg(score_total)` (chỉ trên lệnh đã chấm), mục tiêu > 80.
11. **Radar tâm lý** — 4 giá trị trung bình: `avg(score_entry)`, `avg(score_in_trade)`, `avg(score_exit)`, `avg(score_psych)`. Trục nào thấp = điểm yếu.
12. **Lý thuyết vs thực tế** — 2 chuỗi theo STT: `cum_theory[i]` và `cum_by_trade[i]`.

### 5.1. Chuỗi thắng/thua liên tiếp (Excel BT)
Duyệt lệnh theo STT, giữ biến `streak`:
```
với lệnh đầu: streak = (+1 nếu win_sign=1, ngược lại −1)
với lệnh sau:
  nếu win:  streak = (streak > 0) ? streak+1 : 1
  nếu loss: streak = (streak < 0) ? streak−1 : −1
longest_win_streak  = max(streak_i)         // golden fixture: 2
longest_loss_streak = −min(streak_i)        // golden fixture: 1
```

---

## 6. Edge cases (bắt buộc có test)

- **Không có lệnh nào:** mọi KPI → `0` hoặc `null`; không chia cho 0.
- **`total_loss = 0`** (chưa có lệnh thua): `profit_factor` = `null`/∞ → UI hiển thị "—" hoặc "∞".
- **`max_drawdown = 0`:** `recovery_factor` = `null` → "—".
- **`net = 0`:** không tính vào `win_count` lẫn `loss_count`; `total_trades` bỏ qua; `win_loss = 1`, `win_sign = 1`.
- **Lệnh chưa chấm điểm** (4 field category rỗng): `score_total = null`, `trade_class = "CHƯA ĐÁNH GIÁ"`, **loại khỏi** `avg(score)` và radar.
- **Cô lập theo account:** mọi lũy kế/KPI chỉ trong cùng `account_code`. Test: 2 account xen kẽ, đảm bảo `cum_by_trade` không rò rỉ chéo.
- **`one_R = 0`** (risk% = 0): các chỉ số R → `null`, tránh chia 0.
- **Thứ tự lệnh:** đổi thứ tự nhập không được đổi tổng KPI, nhưng ĐỔI `cum_*`, `running_peak`, `drawdown`, `streak`. Test cả hai.
- **Fee > profit:** `net` âm dù `profit` dương → phân loại loss.

---

## 7. GOLDEN FIXTURE (từ chính file mẫu — dùng làm integration test)

Account `ACC1`: `initial_balance = 5000`, `risk_per_trade = 0.01` → `one_R = 50`.

**Input (4 lệnh, fee = 0):**

| STT | day | symbol | profit | profit_theory | fee |
|---|---|---|---|---|---|
| 1 | 2026-06-09 | xau | 100 | 50 | 0 |
| 2 | 2026-06-09 | xau | −50 | 100 | 0 |
| 3 | 2026-06-10 | xau | 100 | −50 | 0 |
| 4 | 2026-06-11 | xau | 200 | (trống) | 0 |

**Expected — derived per trade:**

| STT | net | win_loss | cum_by_trade | cum_by_day | cum_theory | running_peak | drawdown | weekday |
|---|---|---|---|---|---|---|---|---|
| 1 | 100 | 1 | 100 | 50 | 50 | 100 | 0 | Tue |
| 2 | −50 | 0 | 50 | 50 | 150 | 100 | 50 | Tue |
| 3 | 100 | 1 | 150 | 150 | 100 | 150 | 0 | Wed |
| 4 | 200 | 1 | 350 | 350 | 100 | 350 | 0 | Thu |

> (4 lệnh này đều **chưa chấm điểm** → mọi `score_* = 0/null`, `trade_class = "CHƯA ĐÁNH GIÁ"`.)

**Expected — KPI toàn account:**

| KPI | Giá trị |
|---|---|
| total_win | 400 |
| total_loss | −50 |
| net_profit | 350 |
| net_return_pct | 0.07 |
| total_fees | 0 |
| profit_factor | 8 |
| win_count | 3 |
| loss_count | 1 |
| total_trades | 4 |
| win_pct | 0.75 |
| ave_win | 133.3333… |
| ave_loss | −50 |
| biggest_winner | 200 |
| biggest_loser | −50 |
| one_R | 50 |
| biggest_R_win | 4 |
| biggest_R_loss | −1 |
| rr_actual | 2.6667 (=133.33/50) |
| expectancy | 87.5 |
| max_drawdown | 50 |
| recovery_factor | 7 |
| longest_win_streak | 2 |
| longest_loss_streak | 1 |
| current_balance | 5350 |

Kiểm chứng vài chỗ: `expectancy = 0.75×133.33 + 0.25×(−50) = 100 − 12.5 = 87.5` ✓ · `recovery = 350/50 = 7` ✓ · `PF = −400/−50 = 8` ✓.

---

## 8. Thứ tự phát triển TDD đề xuất

1. **Scoring (§2)** — pure function, không phụ thuộc DB. Viết trước, dễ phủ 100% nhánh.
2. **Per-trade derived không lũy kế (§3.1–3.3, 3.8):** `net`, `win_loss`, `week`, `month`, `weekday`.
3. **Lũy kế (§3.4–3.7):** cần list lệnh đã sort + cô lập account. Dùng golden fixture.
4. **KPI account (§4):** build trên tập derived. Test từng KPI + edge case chia 0.
5. **Aggregations (§5):** group-by; test R-binning và streak riêng.
6. **Integration:** nạp nguyên golden fixture §7, assert toàn bộ bảng expected.
7. **API layer** cuối cùng (handler trả JSON cho dashboard).

Gợi ý tách package Go: `scoring/`, `metrics/` (per-trade + KPI), `aggregate/` (charts) — mỗi package một test file. Giữ chúng **pure** (nhận slice trades, trả struct), DB chỉ ở tầng ngoài để test không cần Postgres.

---

## 9. Những gì KHÔNG cần port

- Cơ chế **license/trial 7 ngày** (macro VBA `LicenseCore`: gọi Google Apps Script, HWID, khóa sheet) — chỉ là DRM của bản Excel.
- Các macro `UpdatePLChart`, `RefreshData` (refresh PivotCache) — trên web thay bằng query/recompute.
- Sheet `OVER DATE`, `Help`, `Explain` — chuyển thành trang Help tĩnh nếu muốn.

---

## 10. Điểm cần bạn tự quyết (không có trong file, nên chốt trước khi code)

1. **`week` convention:** giữ `WEEKNUM(...,1)` kiểu Excel hay chuyển ISO-8601? Ảnh hưởng nhãn tuần và nhóm "Lợi nhuận theo tuần".
2. **`net = 0`:** template coi là "không thua" (win_loss=1) nhưng không đưa vào win/loss count. Xác nhận giữ nguyên.
3. **1R:** file tính `IB × risk%` cố định theo vốn ban đầu. Nếu muốn R động theo balance hiện tại thì phải đổi và test lại toàn bộ chart R.
4. **Empty-scoring → "CHƯA ĐÁNH GIÁ":** xác nhận rule loại các lệnh chưa chấm khỏi trung bình điểm & radar (khuyến nghị: có).