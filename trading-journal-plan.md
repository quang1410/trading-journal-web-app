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
| AG | Win | `streak` | **derived** — xem §5.1 |
| AH | Profit lý thuyết cộng dồn | `cum_theory` | **derived** |
| AI | Running Peak | `running_peak` | **derived** |
| AJ | Profit dương cộng dồn theo ngày | `cum_profit_pos_day` | **derived** |
| AK | Profit âm cộng dồn theo ngày | `cum_profit_neg_day` | **derived** |
| AM | Profit dương | `profit_positive` | **derived** |
| AN | Profit âm | `profit_negative` | **derived** |
| AO | Drawdown | `drawdown` | **derived** |

---

## 1. Enumerations (chuỗi phải khớp CHÍNH XÁC — dùng làm key chấm điểm)

Các chuỗi này là literal so sánh `=` trong công thức. Nếu bạn đổi text hiển thị, phải giữ một `code` ổn định bên dưới để map điểm.

**Direction:** `Long` | `Short` — **giá trị lưu của web**.

> ⚠️ **File Excel gốc dùng `BUY` | `SELL`, không phải `Long`/`Short`.** Chỉ
> *header* cột G là "Long/ Short"; còn giá trị thực trong file:
> - data validation cột G: list literal `"BUY,SELL"`;
> - `Master!BF2:BF3` = `BUY` / `SELL`, là key `VLOOKUP` cho biểu đồ hướng lệnh;
> - `Dashboard!C77:C78` hiển thị `BUY` / `SELL`;
> - pivot cache lưu hai giá trị `BUY`, `SELL`.
>
> **Quyết định (Q2): web giữ `Long`/`Short`.** Đổi sang `BUY`/`SELL` sẽ kéo theo
> migration dữ liệu, `enums.go`, endpoint meta, select của FE và một loạt test
> đang xanh — không đáng, vì đây thuần tuý là nhãn.
>
> **Ràng buộc bắt buộc cho Phase 5 (import CSV):** parser phải nhận **cả bốn**
> chuỗi và chuẩn hoá, so sánh không phân biệt hoa thường:
>
> | Chuỗi trong file | Lưu vào DB |
> |---|---|
> | `BUY`, `Long` | `Long` |
> | `SELL`, `Short` | `Short` |
>
> Thiếu mapping này thì **không đọc được file Excel cũ** — mọi dòng sẽ fail
> validate ở cột direction.

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

> **Web cố ý lệch Excel ở đây.** Công thức gốc:
>
> ```
> Z7 = IF(AND(V7="", W7="", X7="", Y7=""), "",
>        SUM(IF(V7="",0,V7), IF(W7="",0,W7), IF(X7="",0,X7), IF(Y7="",0,Y7)))
> ```
>
> Nhánh `""` là **dead code**: V/W/X/Y không bao giờ trả `""` vì mỗi hàm con đã
> trả `0` cho input rỗng. Nên trong Excel, lệnh **chưa chấm** vẫn ra
> `score_total = 0`, và tile "ĐIỂM GIAO DỊCH" chia cho **toàn bộ** số lệnh
> (`Master!CJ2`) — bốn lệnh chưa chấm cho ra `0`, không phải "—".
>
> Web trả `score_total = null` cho lệnh chưa chấm và **loại nó khỏi** trung bình
> điểm lẫn radar. Đây là sửa lỗi có chủ ý, không phải copy Excel: điểm trung bình
> bị kéo về 0 bởi những lệnh chưa ai chấm là con số vô nghĩa.

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

> **Web cố ý lệch Excel ở đây.** Công thức gốc:
>
> ```
> U7 = IF([@[Vào lệnh]] = 0, "", IF(Z7 = "", "", IF(Z7 >= 80, ...)))
> ```
>
> Excel chặn theo **riêng `entry_quality`**, sinh ra hai bug:
> 1. Lệnh chấm đủ 4 mục nhưng toàn 0 điểm (`Bốc đồng` + `Dời dừng lỗ ra xa` +
>    `Thoát lệnh cảm tính, sợ hãi` + `SỢ BỎ LỠ (FOMO)`) vẫn ra blank → bị gom vào
>    "CHƯA ĐÁNH GIÁ" thay vì "Giao dịch trả thù" — đúng cái loại đáng báo động nhất.
> 2. Lệnh chỉ bỏ trống mỗi `Vào lệnh` cũng ra blank, dù 3 mục kia đã chấm.
>
> Web dùng rule: `trade_class = null` ⟺ **cả 4 field đều rỗng**; còn lại luôn phân
> loại theo tổng điểm. Tổng = 0 mà đã chấm đủ → `"Giao dịch trả thù"`.

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
> Chú ý: `net = 0` được tính là **1 (không thua)**.
>
> Cột `AG` của Excel **không phải** dấu ±1 của từng lệnh — nó là streak lũy tiến,
> xem §5.1. Web tách riêng hai khái niệm: `streak_sign` (dấu ±1 của một lệnh,
> `1 if net >= 0 else -1`) là bước trung gian để dựng streak, không phải một cột
> của Excel.

### 3.3. `week` / `month` (Excel AA/AB)
```
week  = "W" + ISO_week_number(day)      // vd "W24"
month = format(day, "MM/yyyy")          // vd "06/2026"
```
> **Đã chốt: ISO-8601** (xem §10 mục 1). Excel dùng `WEEKNUM(...,1)` — tuần bắt đầu
> Chủ nhật, tuần chứa 1/1 là tuần 1 — web **không** theo. Hệ quả: nhãn tuần có thể
> lệch Excel 1 đơn vị ở đầu/cuối năm; chấp nhận.
>
> Ngoài nhãn hiển thị `week` (`"W24"`), còn một khoá sắp xếp riêng
> `week_sort` = `"2026-W24"`: nhãn hiển thị tự nó sort sai (`"W10" < "W2"` theo thứ
> tự chữ) và không phân biệt được hai năm cùng số tuần. Tính theo timezone của
> account (`accounts.timezone`), không hardcode `Asia/Ho_Chi_Minh`.

### 3.4. `cum_by_trade` (Excel AE) — equity theo lệnh
```
cum_by_trade[i] = Σ net[j] với j = mọi lệnh cùng account, STT ≤ STT[i]
```

### 3.5. `cum_by_day` (Excel AF) — equity theo ngày
```
cum_by_day[i] = tổng net lũy kế tính đến HẾT ngày của lệnh i (cùng account)
```
> Trong Excel là giá trị lũy kế cuối ngày; mọi lệnh trong cùng 1 ngày mang cùng giá trị `cum_by_day` = tổng net tới cuối ngày đó.

> **Excel có bug ở đây, web cố ý làm khác.** Công thức gốc:
>
> ```
> AF7 = LOOKUP(2, 1/(Day_column = [@Day]), CumByTrade_column)
> ```
>
> Chỉ match theo `Day`, **không** có điều kiện account → hai account giao dịch
> cùng một ngày sẽ lấy nhầm giá trị lũy kế của nhau. (Các cột `AI`/`AJ`/`AK`
> thì **có** lọc account — chỉ riêng `AF` sót.)
>
> Web luôn tính `cum_by_day` trong phạm vi **một account**. Bảo đảm này nằm ngay
> ở chữ ký hàm: `Enrich` nhận đúng một `domain.Account`, không phải một tập lệnh
> nhiều account.

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

### 3.9. Tách profit dương / âm (Excel AJ, AK, AM, AN)

Bốn cột này nuôi hai biểu đồ: AJ/AK → biểu đồ theo ngày (`Master!DE`/`DF`),
AM/AN → biểu đồ theo thứ trong tuần (`Master!DR`/`DS`).

```
profit_positive = net > 0 ? net : 0            // AM
profit_negative = net < 0 ? net : 0            // AN — GIỮ DẤU ÂM
cum_profit_pos_day = Σ profit_positive của mọi lệnh cùng account, cùng ngày   // AJ
cum_profit_neg_day = Σ profit_negative của mọi lệnh cùng account, cùng ngày   // AK
```

> **Quy ước dấu — chỗ dễ sai nhất.** `profit_negative` lưu **số âm**, nhưng
> biểu đồ vẽ cột đỏ bằng **giá trị dương**: `Master!DW = −(Sum of Profit âm)`.
> Nghĩa là phép đổi dấu nằm ở **tầng vẽ**, không nằm ở tầng dữ liệu. API trả số
> âm; frontend tự `Math.abs` khi dựng cột. Giữ đúng như vậy để tổng
> `pos + neg = net` luôn đúng mà không cần nhớ ngoại lệ.
>
> Chú ý `net = 0` không vào cả hai cột (cả hai điều kiện đều là so sánh chặt).

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

> **Hai quy ước áp cho mọi nhóm pivot:**
>
> 1. **Nhóm rỗng hiển thị thành `(blank)`.** Setup/Symbol/Timeframe bỏ trống vào
>    pivot thành một nhóm tên `(blank)` và **vẫn được vẽ** (fixture gốc:
>    setup `(blank)` = 350, win rate 0.75). Không ẩn, không gộp vào nhóm khác.
> 2. **Top 6 áp cho cả ba nhóm** — setup (`Master!AI2:AI7`), symbol (`AU2:AU7`)
>    **và timeframe** (`CV2:CV7`). Timeframe không phải ngoại lệ như bản spec
>    trước ghi.
>
> 3. **Top 6 sắp theo `count` giảm dần**, hoà thì theo tên tăng dần
>    (`aggregate.topN`). Tiêu chí này nằm trong cấu hình pivot của file gốc nên
>    **không xác minh được** bằng dữ liệu mẫu (file chỉ còn 1–2 nhóm) — đây là
>    quyết định của web, không phải phát hiện từ Excel.
>
>    Không sắp theo `sum_net`: nhóm lỗ nặng sẽ bị đẩy khỏi biểu đồ, mà đó lại
>    đúng là nhóm người dùng cần nhìn nhất. Sắp theo `count` cũng ổn định —
>    không đảo thứ tự khi lãi lỗ đổi dấu.

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

   > **Luật bin — trích từ `Master!DN`.** Với `DL[i] = DK[i] × one_R`:
   >
   > ```
   > DN2  = COUNTIFS(net, "<=" & DL2)                                  // "Dưới -20R"
   > DN3..DN12  = COUNTIFS(net, ">" & DL[i-1], net, "<=" & DL[i])      // (a, b]
   > DN13..DN22 = COUNTIFS(net, ">=" & DL[i], net, "<" & DL[i+1])      // [a, b)
   > DN23 = COUNTIFS(net, ">=" & DL23)                                 // "Trên 20R"
   > ```
   >
   > Đọc thành lời: bucket `"aR to bR"` chứa R **tính từ `a`, tiến ra xa 0, chưa
   > tới `b`**. Kiểm chứng: `−50 → "-1R to -2R"`, `2 × 100 → "2R to 3R"`,
   > `200 → "4R to 5R"` (với `one_R = 50`).
   >
   > **Bug của Excel, web cố ý sửa:** `net = 0` khớp **cả hai** bucket
   > `"0R to -1R"` (vì `<= 0`) và `"0R to 1R"` (vì `>= 0`) → bị đếm hai lần. Web
   > dùng khoảng nửa mở đồng nhất `lo <= r < hi` trên toàn trục, nên `net = 0` chỉ
   > vào `"0R to 1R"`. Không lệnh nào bị đếm hai lần hoặc lọt khe.
   >
   > **Chart là MỘT series, không phải hai.** `chart6.xml` có đúng 1 series
   > (`DM2:DM23` → `DN2:DN23`); màu thắng/thua tô theo **từng điểm**. API vẫn trả
   > `wins`/`losses` cho mỗi bucket để frontend tô màu — nhưng đừng dựng thành hai
   > series chồng nhau, tổng sẽ bị đếm đôi.
   >
   > Luôn trả **đủ 22 bucket** kể cả bucket rỗng, để trục không nhảy khi đổi bộ lọc.
10. **Chấm điểm** — `avg(score_total)` (chỉ trên lệnh đã chấm), mục tiêu > 80.
11. **Radar tâm lý** — 4 giá trị trung bình: `avg(score_entry)`, `avg(score_in_trade)`, `avg(score_exit)`, `avg(score_psych)`. Trục nào thấp = điểm yếu.
12. **Lý thuyết vs thực tế** — 2 chuỗi theo STT: `cum_theory[i]` và `cum_by_trade[i]`.

### 5.1. Chuỗi thắng/thua liên tiếp (Excel BT)
Duyệt lệnh theo STT, giữ biến `streak`:
```
với lệnh đầu: streak = (+1 nếu streak_sign=1, ngược lại −1)
với lệnh sau:
  nếu win:  streak = (streak > 0) ? streak+1 : 1
  nếu loss: streak = (streak < 0) ? streak−1 : −1
longest_win_streak  = max(streak_i)         // golden fixture: 2
longest_loss_streak = −min(streak_i)        // golden fixture: 1
```

> **Excel tự mâu thuẫn tại `net = 0` — chốt theo bản `Master!BT`.**
>
> File gốc có hai bản streak lệch nhau đúng tại `net = 0`:
> - `Master!BT` coi **`net >= 0` là thắng** (`BV = IF(net >= 0, 1, 0)`).
> - `Trades!AG` coi **`net > 0` là thắng** (trừ dòng đầu dùng `>=`).
>
> Dashboard đọc `BT` (`C34 = MAX(Master!BT:BT)`), nên web chốt **`net >= 0` là
> thắng**. Ghi lại ở đây để sau này không ai "sửa ngược" theo `AG`.
>
> Streak **reset khi đổi account** (`AG8` có điều kiện `D8 = D7`). Web không cần
> điều kiện này vì mọi phép lũy kế đã chạy trong phạm vi một account.

### 5.2. Chất lượng thực thi lệnh (Excel mục 13 sheet `Explain`)

Ba con số, tính trên **tập đã lọc** (`aggregate.ExecutionQualityOf`):

```
planned_pct    = count(trade_class = "Đúng kế hoạch") / count(tất cả lệnh)   // Dashboard!S85
no_setup_count = count(setup = "KHÔNG CÓ SETUP")                             // Dashboard!V85
impulsive_count = count(trade_class ∈ {"Bốc đồng / FOMO", "Giao dịch trả thù"})
```

**Mẫu số của `planned_pct` gồm CẢ lệnh chưa chấm điểm.** Excel cộng đủ năm hàng
`SUM(U103:U107)`, và về nghĩa cũng đúng: một lệnh chưa được đánh giá thì chưa
phải lệnh đúng kế hoạch. Đây **khác** luật ở §2.5 (loại lệnh chưa chấm khỏi
*trung bình điểm*) — hai luật cho hai phép tính khác nhau.

`planned_pct = null` khi không có lệnh nào; frontend hiện `—`, không phải `0%`.
Mục tiêu hiển thị: `>= 85%`.

> **Nhãn của Excel sai so với chính công thức của nó.** Tile `V85` có phụ đề
> "Bốc đồng + Trả thù + FOMO" nhưng `SUMIFS` bên dưới lại đếm lệnh **no-setup**.
> Web **tách hai chỉ số** thay vì chọn một nửa: `no_setup_count` giữ đúng công
> thức, `impulsive_count` giữ đúng ý định của nhãn. Xem §10 mục 9.

### 5.3. Phân bố `trade_class` (Excel `chart2.xml`)

Nguồn: `Master!CF6:CH10`, hiển thị ở `Dashboard!S102:W107`.

```
count  mỗi loại = COUNTIF(trade_class)          // Master!CG6
sum_net mỗi loại = SUMIFS(net, trade_class)     // Master!CH6
pct    = count / count(tất cả lệnh)             // Dashboard!V103
```

**Luôn trả đủ 5 hàng theo đúng thứ tự `domain.TradeClasses`**, kể cả loại có 0
lệnh. Doughnut lấy màu theo **chỉ số hàng** (`palette.mauLoaiLenh`) — bỏ hàng
rỗng đi thì thêm một lệnh "Bốc đồng / FOMO" sẽ đổi màu của "Giao dịch trả thù"
ngay trước mắt người dùng.

Bảng đi kèm thì ngược lại, **chỉ liệt kê loại có lệnh**: một hàng `0 · 0% · 0`
là ba ô trống chiếm một dòng — trong bảng là nhiễu, trong biểu đồ là khoảng
lặng có nghĩa.

### 5.4. Thắng / Thua / Hoà (Excel `chart4.xml`)

Nguồn: `Dashboard!C22:F22`.

```
win_count  = count(net > 0)
loss_count = count(net < 0)
even_count = count(net = 0)      // KHÔNG có trong Excel
```

Excel chỉ vẽ **hai** lát. Web thêm `even_count` vì §10 mục 2 đã chốt lệnh
`net = 0` không vào `win_count` lẫn `loss_count` — không trả nó ra thì tổng hai
lát nhỏ hơn số lệnh thật và người dùng sẽ tưởng hệ thống nuốt mất lệnh.

Frontend chỉ hiện lát hoà khi `even_count > 0`; hai lát còn lại luôn hiện kể cả
bằng 0 (một hàng vắng mặt trông khác hẳn một hàng bằng 0).

### 5.5. Ba tile Lý thuyết / Thực tế / Chênh lệch

Nguồn: `Dashboard!I85`, `L85`, `O85`.

```
theory = cum_theory   của điểm CUỐI chuỗi lý thuyết-vs-thực tế
actual = cum_by_trade của điểm CUỐI
diff   = actual − theory        // âm = thực tế kém hơn lý thuyết
```

Là **điểm cuối** của hai chuỗi ở mục lý thuyết-vs-thực tế, không phải tổng của
chúng — chuỗi đã lũy kế sẵn, cộng lại lần nữa là đếm hai lần. Excel dùng
`INDEX(...,  5 + COUNT(Master!BM:BM), ...)` để lấy đúng hàng cuối.

Tập rỗng trả `0` cho cả ba, **không** phải null: "chưa đi được đồng nào" là một
con số có nghĩa, khác với các chỉ số nil-được ở §4 vốn là "chia cho 0".

Hiển thị: chỉ tile `diff` tô màu theo dấu. Hai tile đầu là mốc tham chiếu — tô
cả ba sẽ làm loãng đúng con số cần đọc. Và màu lấy theo dấu của `diff` chứ
không phải của `actual`: thực tế `+190` vẫn là tin xấu nếu lý thuyết đáng lẽ
`+250`.

---

## 6. Edge cases (bắt buộc có test)

- **Không có lệnh nào:** mọi KPI → `0` hoặc `null`; không chia cho 0.
- **`total_loss = 0`** (chưa có lệnh thua): `profit_factor` = `null`/∞ → UI hiển thị "—" hoặc "∞".
- **`max_drawdown = 0`:** `recovery_factor` = `null` → "—".
- **`net = 0`:** không tính vào `win_count` lẫn `loss_count`; `total_trades` bỏ qua; `win_loss = 1`, `streak_sign = 1` (tức **không làm đứt chuỗi thắng** — chốt theo `Master!BT`, xem §5.1).
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

## 10. Các điểm đã chốt (trước đây là câu hỏi mở)

1. **`week` convention → ISO-8601.** Không dùng `WEEKNUM(...,1)` kiểu Excel (tuần
   bắt đầu Chủ nhật). Đã code tại `metrics.DateParts`: nhãn hiển thị `"W24"`, khoá
   sắp xếp riêng `"2026-W24"` (nhãn hiển thị tự nó sort sai — `"W10" < "W2"` theo
   thứ tự chữ — và không phân biệt được hai năm cùng số tuần).
   *Hệ quả:* nhãn tuần của web có thể lệch Excel 1 đơn vị ở đầu/cuối năm. Chấp nhận.
2. **`net = 0` → giữ nguyên:** `win_loss = 1`, không vào `win_count` lẫn
   `loss_count`, `total_trades` bỏ qua, và **không làm đứt chuỗi thắng** (§5.1).
3. **`1R` = `initial_balance × risk_per_trade`**, cố định theo vốn ban đầu, đúng như
   file gốc. Không dùng R động theo balance hiện tại.
4. **Lệnh chưa chấm điểm → loại khỏi trung bình & radar.** `score_total = null`,
   `trade_class = "CHƯA ĐÁNH GIÁ"`. Đây là **sửa lỗi có chủ ý** so với Excel — xem
   khối chú thích ở §2.5.
5. **Direction lưu `Long`/`Short`**, import nhận thêm `BUY`/`SELL` — xem §1.
6. **Số dư & nạp/rút KHÔNG chịu bộ lọc** (ngoại lệ của quy tắc 8) — xem `CLAUDE.md`.
7. **Chuỗi lý thuyết-vs-thực tế KHÔNG rebase theo khoảng lọc** — cố ý lệch Excel,
   xem `CLAUDE.md` quy tắc 8.
8. **Top 6 sắp theo `count` giảm dần**, hoà thì theo tên tăng dần — xem §5.
   Tiêu chí này không xác minh được từ file gốc; đây là quyết định của web.
9. **Tile no-setup tách làm hai chỉ số:** `no_setup_count` (đúng công thức Excel
   `V85`) và `impulsive_count` (đúng nhãn Excel). Nhãn của file gốc sai so với
   công thức của chính nó; web không kế thừa lỗi đó. Xem §5.2.
10. **`current_balance` KHÔNG chịu bộ lọc — đã sửa.** `metrics.ComputeKPI` nhận
    cả tập đã lọc lẫn tập đầy đủ (`ComputeKPI(filtered, all, acc, flows)`); số dư
    tính trên tập đầy đủ, phần KPI còn lại tính trên tập đã lọc. Regression test:
    `TestComputeKPICurrentBalanceKhongChiuBoLoc` (tầng thuần) và
    `TestStatsCurrentBalanceKhongDoiKhiLoc` (tầng service, nơi bug thật nằm).

Không còn mục nào treo.
