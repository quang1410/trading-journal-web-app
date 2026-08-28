# Đối chiếu file Excel gốc ↔ `trading-journal-plan.md` — 23/08/2026

> Kết quả recheck `NHAT KY GIAO DICH Macbook - 7 day free.xlsb` với
> `trading-journal-plan.md`. Đây **không phải** plan thi công, chỉ là biên bản
> phát hiện: mỗi mục có mã (`S*` sai, `T*` thiếu, `C*` cần chốt) để plan sau
> tham chiếu thẳng vào.
>
> Trạng thái: chưa mục nào được sửa vào `trading-journal-plan.md` và chưa đối
> chiếu với code trong `backend/internal/`.

---

## 0. Cách kiểm tra (để tái lập được)

Không mở Excel, không cần license key: giải nén `.xlsb` (là gói OPC) rồi tự
parse record BIFF12 trong `xl/worksheets/sheet*.bin`, decode luôn token stream
RPN của công thức (`BrtFmlaNum` / `BrtFmlaString` / `BrtShrFmla`), cộng thêm
`xl/tables/table1.bin`, `xl/pivotCache/pivotCacheDefinition1.bin`,
`xl/charts/chart*.xml`, `xl/vbaProject.bin`.

Bảy sheet: `Settings`, `Trades`, `Dashboard`, `OVER DATE`, `Explain`, `Help`,
`Master`. `Master` là sheet tính toán trung gian (17 pivot + cột phụ) mà bản
plan hiện tại chỉ trích lẻ tẻ. Bảng lệnh là một Excel Table tên **`TradesData`**
(`C6:AO2999`), pivot cache tên `tradesdata`.

Giới hạn của template: ≤ 2993 lệnh, ≤ 11 account (`Settings!D5:D15`),
≤ 1316 dòng nạp/rút (`Settings!D21:H1336`).

---

## 1. Chỗ plan **sai** so với Excel

### S1 — Cột AG không phải `win_sign`, mà là chuỗi thắng/thua lũy tiến

`trading-journal-plan.md` §0 map `AG → win_sign`, §3.2 định nghĩa
`win_sign = 1 if net >= 0 else -1`. Công thức thật:

```
AG7 = IF([@[Profit (đã trừ phí)]] >= 0, 1, -1)
AG8 = IF([@Profit]="", 0,
        IF([@[Profit (đã trừ phí)]] > 0,
           IF(AND(AG7 > 0, D8 = D7), AG7 + 1, 1),
           IF(AND(AG7 < 0, D8 = D7), AG7 - 1, -1)))
```

Golden fixture cho AG = `1, −1, 1, 2` (không phải `1, −1, 1, 1`). Trong file
không có cột nào là "dấu ±1 của từng lệnh".

**Đề xuất:** bỏ hẳn khái niệm `win_sign` khỏi §0 và §3.2; map `AG → streak`,
mô tả tại §5.1 (chỗ đang mô tả streak) và ghi rõ streak **reset khi đổi
account**.

### S2 — Excel có hai bản streak lệch nhau; dashboard dùng bản `Master!BT`

```
BT6 = IF(BU6=0, "", IF(BV6=1, 1, -1))
BT7 = IF(BU7=0, "", IF(BV7=1, IF(BT6>0, BT6+1, 1),
                              IF(BT6<0, BT6-1, -1)))
        // BV = Sum of Win/Loss = IF(net >= 0, 1, 0)
```

- `Master!BT` coi **net ≥ 0 là thắng**.
- `Trades!AG` coi **net > 0 là thắng** (trừ dòng đầu dùng `>=`).

Hai cột lệch nhau đúng tại `net = 0`. Dashboard đọc BT:
`C34 = MAX(Master!BT:BT) & " trades"`, `E34 = −MIN(Master!BT:BT) & " trades"`.

**Đề xuất:** chốt **win = `net >= 0`** (bản BT), ghi rõ trong §5.1 rằng Excel
tự mâu thuẫn ở `Trades!AG` để sau này không ai "sửa ngược" theo AG.

### S3 — `Direction` là `BUY` | `SELL`, không phải `Long` | `Short`

§1 ghi `Long | Short`. Chỉ **header** cột G là "Long/ Short"; còn giá trị thực:

- data validation của cột G: list literal `"BUY,SELL"`;
- `Master!BF2:BF3` = `BUY` / `SELL`, là key `VLOOKUP` cho biểu đồ hướng lệnh;
- `Dashboard!C77:C78` hiển thị `BUY` / `SELL`;
- pivot cache lưu hai giá trị `BUY`, `SELL`.

**Đề xuất:** đổi enum §1 thành `BUY | SELL` (giữ code ổn định, nhãn hiển thị
tuỳ ý). Nếu web đã dùng `Long/Short` thì phải có mapping import CSV ở Phase 5.

### S4 — §2.5 diễn giải sai lý do "trả rỗng"

```
Z7 = IF(AND(V7="", W7="", X7="", Y7=""), "",
       SUM(IF(V7="",0,V7), IF(W7="",0,W7), IF(X7="",0,X7), IF(Y7="",0,Y7)))
```

V/W/X/Y **không bao giờ** trả `""` (mỗi hàm con trả 0 cho input rỗng), nên
nhánh `""` là dead code. Thực tế Excel cho `score_total = 0` với lệnh chưa
chấm, và tile "ĐIỂM GIAO DỊCH" chia cho **toàn bộ** số lệnh
(`Master!CO2 = SUM(CK2:CN2)`, `CK2 = SUM(CK6:CK30)/CJ2`, `CJ2` = tổng lệnh) →
golden fixture 4 lệnh chưa chấm ra **0**, không phải "—".

**Đề xuất:** giữ nguyên quy ước web (`score_total = null`, loại khỏi trung bình
& radar) nhưng viết lại câu dẫn: đây là **sửa lỗi có chủ ý**, không phải copy
Excel. Liên quan câu hỏi mở §10.4 — coi như đã chốt.

### S5 — `trade_class` trong Excel chặn theo `entry_quality`, không theo cả 4 field

```
U7 = IF([@[Vào lệnh]] = 0, "",
       IF(Z7 = "", "",
         IF(Z7 >= 80, "Đúng kế hoạch",
           IF(Z7 >= 55, "Cần cải thiện",
             IF(Z7 >= 30, "Bốc đồng / FOMO", "Giao dịch trả thù")))))
```

Hệ quả (bug của Excel): lệnh chấm đủ 4 mục nhưng toàn 0 điểm
(`Bốc đồng` + `Dời dừng lỗ ra xa` + `Thoát lệnh cảm tính, sợ hãi` +
`SỢ BỎ LỠ (FOMO)` = 0) vẫn ra blank → bị gom vào "CHƯA ĐÁNH GIÁ" thay vì
"Giao dịch trả thù". Ngược lại, lệnh bỏ trống mỗi `Vào lệnh` cũng ra blank.

**Đề xuất:** giữ rule của plan (null ⟺ cả 4 field rỗng) và **thêm test bắt
buộc**: 4 field đều có giá trị, tổng = 0 → `trade_class = "Giao dịch trả thù"`.

### S6 — `cum_by_day` của Excel không cô lập theo account

```
AF7 = LOOKUP(2, 1/(Day_column = [@Day]), CumByTrade_column)
```

Chỉ match theo `Day`, không có điều kiện account → hai account giao dịch cùng
ngày sẽ lấy nhầm giá trị của nhau. (AI/AJ/AK thì **có** lọc account.)

**Đề xuất:** §3.5 của plan ("cùng account") đúng, giữ nguyên; thêm ghi chú đây
là bug Excel + test 2 account xen kẽ cùng ngày.

---

## 2. Excel có, plan **thiếu**

### T1 — Bảng nạp/rút tiền (entity chưa được đặc tả)

`Settings!D20:H20` header: `Account | Date | Type | Amount | Note`, dữ liệu từ
dòng 21 đến 1336. `Type` là enum 2 giá trị lấy từ `Settings!J4` / `K4`:
**`Nạp tiền`** / **`Rút tiền`**.

```
I5 = SUMIFS(Trades!AC:AC, Trades!D:D, [account])          // Lợi nhuận
J5 = SUMIFS(G21:G1336, D21:D1336, D5, F21:F1336, $J$4)    // Σ nạp
K5 = SUMIFS(G21:G1336, D21:D1336, D5, F21:F1336, $K$4)    // Σ rút
L5 = IF(K5 >= 0, F5+I5+J5-K5, F5+I5+J5+K5)                // Balance
M5 = J5 - K5                                              // Nạp/Rút ròng
```

Chú ý `L5`: chịu được cả hai quy ước dấu của cột Amount (rút nhập số dương hay
số âm đều ra đúng). Plan mới chỉ có công thức `current_balance` ở §4, chưa có
bảng, chưa có enum, chưa có rule dấu.

### T2 — Tile "TIỀN NẠP/ RÚT" trên dashboard

`Dashboard!S3 = Master!J3` → `VLOOKUP` vào `Settings` cột M = `Σnạp − Σrút`.
Không có trong §4.

> **Đã đóng (28/08/2026).** `metrics.KPI.NetCashFlow` → `/stats` khoá
> `net_cash_flow` → tile cạnh số dư trong `KpiGrid`. Xem plan §4 và §10 mục 11.

### T3 — Balance và nạp/rút **không** chịu bộ lọc

`Dashboard!V3 = Master!I3` và `S3 = Master!J3`, cả hai `VLOOKUP` thẳng vào
`Settings` (tính trên **toàn bộ** lệnh của account), trong khi mọi số còn lại
đi qua pivot đã lọc theo slicer Account/Month/Week.

Đụng thẳng quy tắc 8 trong `CLAUDE.md` (KPI tính trên tập đã lọc) → **cần chốt**
xem web có giữ ngoại lệ này cho 2 tile số dư không.

### T4 — Khối "CHẤT LƯỢNG THỰC THI LỆNH" (mục 13 của sheet `Explain`)

```
Dashboard!S85 = U103 / SUM(U103:U107)
   // = count("Đúng kế hoạch") / tổng lệnh, mục tiêu ≥ 85%
Dashboard!V85 = SUMIFS(Master!AE:AE, Master!AD:AD, "KHÔNG CÓ SETUP")
   // = số lệnh vào không có setup
```

Lưu ý: phụ đề tile V85 ghi "Bốc đồng + Trả thù + FOMO" nhưng công thức đếm
lệnh no-setup → **nhãn Excel sai**. Cần chốt web lấy nghĩa nào (khuyến nghị:
tách 2 chỉ số, `no_setup_count` và `impulsive_count`).

### T5 — Bảng phân bố `trade_class` + doughnut

`Dashboard!S102:W107`: `Loại lệnh | Số lệnh | % | Net Profit` cho 5 hàng
(4 loại + `CHƯA ĐÁNH GIÁ`).

```
Master!CG6 = SUMIFS(CC:CC, CB:CB, CF6)      // số lệnh theo loại
Master!CH6 = SUMIFS(CD:CD, CB:CB, CF6)      // net profit theo loại
Master!CG10 = COUNT(N:N) - SUM(CG6:CG9)     // CHƯA ĐÁNH GIÁ = phần còn lại
Dashboard!V103 = U103 / SUM(U103:U107)      // cột %
```

`chart2.xml` là doughnut vẽ `CF6:CG10`. §5 của plan không có nhóm này.

### T6 — Doughnut Win/Loss

`chart4.xml` vẽ `Dashboard!C22:F22` (số lệnh thắng / thua). Nhỏ nhưng là một
khối hiển thị riêng.

### T7 — Ba tile "PROFIT Lý Thuyết / Thực tế / CHÊNH LỆCH"

```
I85 = INDEX(Master!BM:BO, 5 + COUNT(Master!BM:BM), 2)   // cum_theory cuối
L85 = INDEX(Master!BM:BO, 5 + COUNT(Master!BM:BM), 3)   // cum_by_trade cuối
O85 = L85 - I85                                          // Thực tế − Lý thuyết
```

§5.12 chỉ có 2 chuỗi cho biểu đồ, chưa có 3 con số tổng kết này.

### T8 — Chuỗi lý thuyết-vs-thực tế bị **rebase** khi lọc

```
Master!BK3 = BM6 - 1                       // STT lệnh ngay trước khoảng lọc
BN6 = IF(BM6="", "", IF($BK$3=0, BR6, BR6 - $BL$4))   // lý thuyết
BO6 = IF(BM6="", "", IF($BK$3=0, BS6, BS6 - $BL$5))   // thực tế
```

Khi lọc theo tháng/tuần, hai đường được kéo về gốc tại đầu khoảng. Trái với
quy tắc 8 của `CLAUDE.md` (lũy kế luôn tính trên toàn bộ lệnh) → **cần chốt**.

### T9 — Bốn cột derived bị bỏ khỏi bảng map §0

| Cột | Header | Công thức |
|---|---|---|
| AJ | Profit dương cộng dồn theo ngày | `SUMPRODUCT((acct=acct)*(day=day)*(net>0)*net)` |
| AK | Profit âm cộng dồn theo ngày | `SUMPRODUCT((acct=acct)*(day=day)*(net<0)*net)` |
| AM | Profit dương | `IF(net>0, net, 0)` |
| AN | Profit âm | `IF(net<0, net, 0)` |

AJ/AK nuôi biểu đồ ngày (`Master!DE/DF` = Max/Min của hai cột này), AM/AN nuôi
biểu đồ ngày-trong-tuần (`Master!DR/DS`). §0 chỉ nhắc AL (weekday) ở §3.8.

Ghi chú dấu: `Master!DW = −(Sum of Profit âm)` → cột đỏ được vẽ bằng **giá trị
dương**. Plan §5.5 nói "tách profit_positive / profit_negative" nhưng không nói
quy ước dấu.

### T10 — Thuộc tính account còn thiếu

`Settings` hàng 4: `Account | Thông tin | Số dư ban đầu | Đơn vị tiền tệ |
Rủi ro/giao dịch % | ...`. Plan mới dùng `initial_balance` + `risk_per_trade`,
chưa có **`currency`** (USD) và **`Thông tin`** (loại thị trường, vd `FX`).

### T11 — Nhãn tuần không đồng nhất

`Trades!AA` = `"W" & WEEKNUM(day)` → `W24`; heatmap `Dashboard!J34` =
`"W " & WEEKNUM(...)` → `W 24` (có dấu cách). Chốt một format duy nhất cho web.

### T12 — Bốn KPI có nhãn nhưng chưa có công thức

`Master!D17:D20` = `# Long Trades`, `# Short Trades`, `Long Win %`,
`Short Win %` — ô `E17:E20` **trống** (tác giả chưa implement). Trong khi đó
biểu đồ hướng lệnh vẫn tự tính:

```
Master!BG2 = VLOOKUP(BF2, BB:BE, 4, 0)                    // net profit
Master!BH2 = VLOOKUP(BF2, BB:BE, 3, 0) / VLOOKUP(BF2, BB:BE, 2, 0)  // win rate
```

Nếu web muốn 4 KPI này thì phải tự định nghĩa, không có nguồn tham chiếu.

> **Đã đóng (28/08/2026) — không thêm tile.** Bốn số này đã có sẵn trong
> `aggregate.ByDirection` (`count` + `win_rate` mỗi chiều) và đã hiển thị ở
> biểu đồ "Theo chiều lệnh". Xem plan §10 mục 12.

---

## 3. Chi tiết Excel có, plan mô tả chưa đủ để viết test

### C1 — Luật chia bin của biểu đồ phân phối R (§5.9)

`Master!DL3:DL23 = DK × $DL$1` (với `DL1 = one_R`), rồi:

```
DN2  = COUNTIFS(net, "<=" & DL2)                          // "Dưới -20R"
DN3..DN12  = COUNTIFS(net, ">" & DL[i-1], net, "<=" & DL[i])   // (a, b]
DN13..DN22 = COUNTIFS(net, ">=" & DL[i], net, "<" & DL[i+1])   // [a, b)
DN23 = COUNTIFS(net, ">=" & DL23)                         // "Trên 20R"
```

Tức bucket `"aR to bR"` chứa R tính **từ a, tiến ra xa 0, chưa tới b**. Kiểm
chứng bằng fixture: `−50 → "-1R to -2R"`, `2 × 100 → "2R to 3R"`,
`200 → "4R to 5R"`.

**Lỗi cần sửa khi port:** `net = 0` khớp **cả hai** bucket `"0R to -1R"` (vì
`<= 0`) và `"0R to 1R"` (vì `>= 0`) → bị đếm 2 lần. Khuyến nghị web chỉ tính
vào `"0R to 1R"`.

### C2 — Nhóm rỗng thành `(blank)`

Setup/Symbol/Timeframe rỗng vào pivot thành một nhóm tên `(blank)` và **vẫn
được vẽ** (fixture: setup `(blank)` = 350, win rate 0.75). Plan §5 không nói xử
lý nhóm rỗng.

### C3 — "Top 6" áp cho cả timeframe

`Master` chỉ đọc **6 dòng** pivot cho cả ba nhóm: setup (`AI2:AI7`), symbol
(`AU2:AU7`) và **timeframe** (`CV2:CV7`). §5.3 đang ghi "tất cả TF xuất hiện" →
sai so với file. Tiêu chí sắp xếp để chọn 6 dòng nằm trong cấu hình pivot,
chưa xác minh được bằng dữ liệu mẫu (chỉ có 1–2 nhóm) → cần chốt: theo
`count` hay theo `sum_net`.

### C4 — Biểu đồ R là **một** series

`chart6.xml` chỉ có 1 series (`DM2:DM23` → `DN2:DN23`), màu thắng/thua tô theo
từng điểm, không phải 2 series như §5.9 mô tả. Ảnh hưởng cách khai báo dữ liệu
trả về cho FE.

---

## 4. Những phần đã đối chiếu và **khớp** (không cần đụng)

- Toàn bộ bảng điểm §2.1–2.4, kể cả gộp nhánh: `OR("Quá sớm","Quá muộn") → 10`
  và `OR("SỢ HÃI","HI VỌNG","THAM LAM") → 5`. Ngưỡng 80/55/30 của `trade_class`
  đúng nguyên văn.
- Mọi ô KPI §4 khớp đúng địa chỉ đã trích: `E4 = G6+I6`, `E5 = E4/G3`,
  `E6 = SUM(fee)`, `E7 = −G6/I6`, `E8/E9 = SUMIFS(count, net, "<0"/">0")`,
  `E10 = E8+E9`, `E11 = E9/E10`, `H9 = G6/E9`, `I9 = I6/E8`, `G12 = H3*G3`,
  `E12 = E14/G12`, `E13 = E15/G12`, `J13 = −H13/I13`,
  `E16 = E11*H9 + (1−E11)*I9`.
- `Dashboard!J3 = MAX(Master!BZ:BZ)` (max drawdown),
  `L3 = −J3 / (MAX(Master!BY:BY) + IB)` (max_dd_pct, đúng mẫu số của §4),
  `M3 = C3/J3` (recovery factor).
- Per-trade: `net = K − M`, `win_loss = IF(net>=0,1,0)`,
  `month = TEXT(day,"mm/yyyy")`, `weekday = TEXT(day,"ddd")`,
  `cum_by_trade`/`cum_theory` = `SUMIFS` dải mở rộng lọc theo account,
  `running_peak = MAX(0, MAX((acct=acct) * cum))`, `drawdown = AI − AE`.
- `week = IF(day>0, "W" & WEEKNUM(day), "")` — **gọi WEEKNUM một tham số** →
  type 1, tuần bắt đầu Chủ nhật. Lịch heatmap xác nhận: W24 bắt đầu 07/06/2026
  (Chủ nhật). Câu hỏi mở §10.1 vẫn phải chốt ISO hay không, nhưng bản Excel là
  Sunday-start.
- Heatmap: lưới 7 cột CN→T7 dựng từ `DATE(RIGHT(month,4), LEFT(month,2), 1)` +
  `WEEKDAY`, mỗi ô = `SUMIFS(net theo ngày)` và `COUNTIFS(...) & " Trade(s)"` —
  đúng §5.8.
- VBA đúng như §9: chỉ `LicenseCheck`, HWID, `HideAllSheets`,
  `ProtectSheet_*`, `RefreshAll` — không có logic nghiệp vụ nào.
- Enum §1 khớp 100% với list trong `Settings` (trừ Direction, xem S3). Pivot
  cache còn giữ dữ liệu thật của tác giả: setup `BREAK OUT`, `PHÁ VỠ GIẢ`,
  `ABC`; symbol `XAUUSD`, `EURUSD`, `USDJPY`, `SP500` → Setup/Symbol đúng là
  free-form như plan mô tả.

---

## 5. Danh sách quyết định cần chốt trước khi viết plan

| # | Quyết định | Liên quan |
|---|---|---|
| Q1 | `win` trong streak: `net >= 0` (bản BT, khuyến nghị) hay `net > 0` (bản AG)? | S1, S2 |
| Q2 | Enum direction lưu `BUY/SELL` hay `Long/Short` + mapping? | S3 |
| Q3 | Hai tile số dư/nạp-rút có thoát khỏi bộ lọc như Excel không? | T3 |
| Q4 | Chuỗi lý thuyết-vs-thực tế có rebase theo khoảng lọc không? | T8 |
| Q5 | Tile "LỆNH KHÔNG CÓ SETUP": đếm no-setup, hay đếm bốc đồng/FOMO/trả thù, hay tách đôi? | T4 |
| Q6 | `net = 0` vào bucket R nào (khuyến nghị `"0R to 1R"`)? | C1 |
| Q7 | Top 6 chọn theo `count` hay `sum_net`; timeframe có bị giới hạn 6 không? | C3 |
| Q8 | Nhóm `(blank)` cho setup/symbol/TF: hiển thị hay ẩn? | C2 |
| Q9 | Format nhãn tuần: `W24` hay `W 24`? | T11 |
| Q10 | `week` giữ WEEKNUM type 1 (Sunday-start) hay đổi ISO-8601? | §10.1 của plan |

---

## 6. Gợi ý phạm vi cho các plan kế tiếp

1. **Patch `trading-journal-plan.md`** (không đụng code): S1–S6, T9, C1–C4 là
   sửa/bổ sung đặc tả thuần — làm trước để mọi plan sau có nguồn sự thật đúng.
2. **Đối chiếu ngược `backend/internal/{scoring,metrics,aggregate}`** với các
   mục S1, S2, S5, S6, C1 — đây là những chỗ dễ đã code theo bản plan sai; mỗi
   chỗ lệch cần regression test fail-trước-pass-sau.
3. **Phase mới cho dòng tiền**: T1 + T2 + T3 + T10 (bảng nạp/rút, currency, tile
   số dư) — có schema mới nên tách riêng.
4. **Bổ sung dashboard**: T4 + T5 + T6 + T7 (+ T8 nếu chốt rebase) — nối tiếp
   Phase 4b.
