# Phase 4b — Năm biểu đồ còn lại của bảng điều khiển

> Tiếp nối `2026-08-22-phase-4a-dashboard-design.md`. Đọc 4a trước: mọi quyết
> định về `toPlot`, bố cục cuộn dọc, tách hàm thuần, và cặp màu lãi/lỗ vẫn còn
> hiệu lực nguyên vẹn ở đây.

**Mục tiêu:** vẽ nốt `heatmap`, `r_distribution`, `score`, `radar`,
`theory_vs_actual` — năm nhóm mà backend đã trả về từ Phase 3a nhưng 4a chưa
dùng tới. Xong 4b là đóng trọn Phase 4 của thiết kế mẹ §10.

---

## 1. Phạm vi

**Trong phạm vi:**

- Năm nhóm biểu đồ còn lại của `GET /api/accounts/{id}/charts`.
- Hai biến CSS mới cho thang nhiệt và một biến cho đường thực tế.
- Nới cổng `toPlot` từ một file lên hai.

**Ngoài phạm vi:** sửa `backend/` (cuối phase `git diff main -- backend/` phải
rỗng), sửa `docs/design/theme.css` và `src/styles/theme.css`, import CSV
(Phase 5).

**Không cần làm lại:** `types.ts` đã khai đủ cả năm kiểu từ 4a
(`HeatmapMonth`, `RBucket`, `ScoreSummary`, `Radar`, `TheoryPoint`) — đó chính
là lý do 4a khai thừa. `hooks.ts`, `queryKeys.ts`, `useLamMoi`, `FilterBar`
đều dùng lại nguyên trạng: cả mười hai nhóm về trong **một** response, nên
thêm biểu đồ không thêm request nào.

---

## 2. Sáu quyết định đã chốt

### 2.1 Xén vào mục sẵn có, không nối hai mục vào cuối

Spec 4a §2.4 viết "4b nối thêm hai mục vào cuối, không đụng gì phần 4a đã
ship". **Quyết định này đảo lại điều đó**, và đảo có chủ ý chứ không phải quên.

Lý do: hai trong năm biểu đồ có nhà sẵn. `theory_vs_actual` là một đường
equity theo STT — nó thuộc về mục **Đường tăng trưởng**, ngay dưới `by_day`,
vì hai thứ trả lời cùng một câu hỏi ("tiền đi lên hay đi xuống") ở hai đơn vị
thời gian. `heatmap` là một cuốn lịch — nó thuộc về **Theo thời gian**, cạnh
`by_weekday` và `by_week`. Đẩy chúng xuống cuối trang để giữ lời hứa "không
đụng 4a" là đặt sự tiện lợi của diff lên trên thứ tự người đọc cần.

Bố cục sau 4b:

| mục | nội dung | 4b làm gì |
|---|---|---|
| Tổng quan | 23 KPI + cặp streak | không đụng |
| Đường tăng trưởng | `by_day` → `theory_vs_actual` | nối vào cuối mục |
| Theo nhóm | setup, symbol, timeframe, direction | không đụng |
| Theo thời gian | weekday, week → `heatmap` | nối vào cuối mục |
| **Chất lượng lệnh** | `score` + `radar` | `<h2>` mới |
| **Phân phối R** | `r_distribution` | `<h2>` mới |

Giá phải trả: `DashboardPage.tsx` sửa ở bốn chỗ thay vì một. Đó là giá đúng.

### 2.2 Lịch nhiệt là MỘT lưới liên tục, không phải mỗi tháng một lưới

Backend trả `[]HeatmapMonth`, mỗi tháng một mảng ô. Vẽ đúng theo cấu trúc đó
thì một năm giao dịch thành mười hai lưới lịch xếp dọc, nuốt chửng phần còn
lại của trang.

Chọn kiểu lưới năm của GitHub: gộp hết ô ngày thành **một** lưới 7 hàng
(CN→T7) × n cột tuần, nhãn tháng chạy ngang phía trên, cuộn ngang khi dài.
Một màn hình là thấy hết nhịp giao dịch — vốn là điều duy nhất lịch nhiệt làm
tốt hơn biểu đồ cột.

Đây **không** phải vi phạm bất biến số 6 của 4a ("không sắp lại thứ tự backend
đã quyết"). Backend quyết thứ tự; 4b không đổi thứ tự, chỉ đổi cách gấp một
dãy thẳng thành lưới hai chiều. Thứ tự ngày đọc từ trái sang phải, trên xuống
dưới vẫn đúng y như backend gửi.

### 2.3 Lịch nhiệt phải TỰ DỰNG những ngày backend không gửi

`aggregate.Heatmap` chỉ phát ô cho ngày **có lệnh**. Một lưới lịch thì không
được thủng: giữa 09/06 và 12/06 phải có 10/06 và 11/06, dù không giao dịch
ngày nào.

Nên `heatmap.ts` **chế thêm ô mà backend chưa từng gửi** — đúng chiều ngược
với bất biến số 10 của 4a ("không lọc bỏ nhóm rỗng"). Hai điều này không mâu
thuẫn, chúng là cùng một nguyên tắc: **hình dạng của lưới do lịch quyết định,
không do dữ liệu quyết định.** 4a cấm bỏ bớt cột vì trục phải đứng yên qua các
lần lọc; 4b buộc thêm ô vì tuần nào cũng có bảy ngày.

Ghi rõ ở đây vì người đọc sau sẽ thấy `heatmap.ts` sinh dữ liệu và tưởng là
lỗi.

### 2.4 Ba trạng thái ô VẼ RA, không phải hai

Dòng đầu bảng dưới đây không phải một trạng thái ô — nó là chỗ không có ô nào.
Ba dòng còn lại mới là thứ người đọc nhìn thấy.

| trạng thái | nghĩa | tô |
|---|---|---|
| ngoài dải | trước ngày đầu / sau ngày cuối | không vẽ ô |
| không giao dịch | trong dải, backend không gửi | `--chart-empty` |
| hoà | có lệnh, `sum_net` đúng bằng `0` | `--chart-zero` |
| lãi / lỗ | có lệnh, `sum_net` khác `0` | một trong sáu bậc §4 |

Gộp "không giao dịch" vào "hoà" là cùng loại lỗi với bất biến số 9 của 4a
(hoà không phải lỗ): nó bịa ra một ngày giao dịch chưa từng xảy ra. Một tháng
nghỉ và một tháng vào lệnh liên tục mà đều huề vốn phải trông khác nhau —
`mauTheoDau` trong `palette.ts` đã dựng sẵn tiền lệ ba nhánh cho đúng chuyện
này.

### 2.5 Cường độ chia theo tam phân vị, không theo mốc tiền cứng

Một ô cần biết mình thuộc bậc nào trong ba bậc. Mốc tiền cứng (ví dụ 100 /
500 / 1000) sai với mọi tài khoản trừ tài khoản dùng để nghĩ ra nó.

Chia theo **tam phân vị của `|sum_net|`** trên tập ngày có giao dịch, hai
nhánh tính riêng ranh giới không dùng chung. Thang tự co giãn theo quy mô tài
khoản, và vẫn đọc được sau khi lọc.

Quy tắc biên phải ghim bằng test, không để nó tự nhiên mà ra:

- Ranh giới **đóng dưới**: `|net|` bằng đúng ranh giới thì lên bậc trên.
- Dưới ba giá trị `|net|` khác nhau thì ranh giới trùng nhau. Trùng thì bậc
  thấp rỗng, mọi ô rơi vào bậc cao nhất còn lại — **không** chia đều giả tạo.
- Đúng một ngày có lệnh: ngày đó là bậc 3. Không có "một ngày thì tô nhạt".

### 2.6 Điểm số là con số lớn, radar là bốn trục của chính nó

`score.avg_score_total` là một con số duy nhất, mục tiêu ≥ 80. Một con số duy
nhất thì không phải biểu đồ (dataviz — chọn hình thức): nó là hero number, tô
theo ngưỡng, kèm `scored_count` để nói rõ nó tính trên bao nhiêu lệnh.

`radar` là bốn thành phần cộng lại thành chính con số đó. Đặt cạnh nhau trong
một khối thì đọc một lượt là biết trục nào kéo tổng xuống. Tách chúng ra hai
đầu trang (điểm vào `KpiGrid` ở Tổng quan, radar nằm dưới) sẽ đúng chữ "24
KPI" của thiết kế mẹ nhưng buộc người đọc phải nhớ bằng đầu.

**Trục radar cố định `[0, 25]`.** Mỗi `score_*` tối đa 25 điểm (plan §2.1–2.4).
Để Recharts tự co trục theo dữ liệu thì một tài khoản 5/5/5/5 điểm sẽ vẽ ra
một hình vuông cân đối đẹp đẽ y hệt tài khoản 25/25/25/25. Đây là bất biến,
không phải tuỳ chọn.

---

## 3. Phân phối R vẽ một chuỗi, không phải cột chồng

Plan gốc §5.9 viết "mỗi bucket đếm số lệnh; tách thắng (xanh) / thua (đỏ)".
Đọc kỹ hình dạng dữ liệu thì cột chồng **không dựng được**.

`R = net / one_R`, và `one_R > 0` (bằng 0 thì `aggregate.RDistribution` trả 22
bucket rỗng). Nên dấu của `R` luôn bằng dấu của `net`:

- bucket âm → mọi lệnh trong đó `net < 0` → `wins = 0`
- bucket dương → mọi lệnh trong đó `net > 0` → `losses = 0`

Golden fixture xác nhận: `{"label": "0R to -1R", "losses": 1, "wins": 0}` và
`{"label": "0R to 1R", "losses": 0, "wins": 1}`. Một cột chồng ở đây là cột
chồng chỉ có một tầng, ở mọi bucket, mãi mãi — kèm một legend hai mục mà một
mục luôn rỗng.

**Chốt:** một cột mỗi bucket, chiều cao `count`, tô theo cực tính của chính
bucket đó (nhãn bắt đầu bằng `-` hoặc `Dưới` là lỗ). Một chuỗi nên không có
legend, đúng 4a §7.3. `wins`/`losses` vẫn hiện trong tooltip — chúng là dữ
liệu thật, chỉ không đáng một kênh mã hoá.

Nếu về sau backend đổi để `one_R` nhận giá trị âm thì lập luận này sập. Test
phải ghim giả định, không ghim kết luận.

**Đủ 22 bucket, kể cả bucket rỗng** — bất biến số 10 của 4a, backend đã cố ý
làm vậy để trục đứng yên qua các lần lọc.

---

## 4. Màu — chạy validator, không chọn bằng mắt

Cùng phương pháp 4a §7.2: mọi giá trị dưới đây là đầu ra của
`scripts/validate_palette.js` trong skill `dataviz`, không phải chọn bằng mắt.

### 4.1 Thang nhiệt phân kỳ

Hai sắc cộng một điểm giữa trung tính, **ba bậc đều nhau mỗi nhánh**, lấy ở
cùng vị trí 5/7/9 trên cả hai ramp:

| nhánh | yếu | vừa | mạnh |
|---|---|---|---|
| lãi (teal) | `#20c997` | `#0ca678` | `#087f5b` |
| lỗ (red) | `#ff6b6b` | `#f03e3e` | `#c92a2a` |

Bậc **vừa** của nhánh lãi đúng bằng `--chart-profit` đã có từ 4a, nên hai biểu
đồ cạnh nhau không cãi nhau về màu.

**Dark mode dùng đúng sáu mã đó, chỉ đọc ngược chiều mỗi nhánh:** yếu nằm gần
nền, mạnh sáng nhất. Đây là mở rộng của phát hiện 4a ("một cặp cho cả hai
theme") chứ không phải phá nó — sequential ramp theo `dataviz` vốn phải đổi
neo trong dark, và ở đây đổi neo không cần thêm mã màu nào.

Kết quả `validateOrdinal` — bốn nhánh, hai theme, **tất cả PASS**:

```
sáng #ffffff  teal yếu→mạnh #20c997 #0ca678 #087f5b
              đơn sắc 2° · ΔL >= 0.06 · đầu nhạt 2.13:1
sáng #ffffff  red  yếu→mạnh #ff6b6b #f03e3e #c92a2a
              đơn sắc 4° · ΔL >= 0.06 · đầu nhạt 2.78:1
tối  #171f2e  teal yếu→mạnh #087f5b #0ca678 #20c997
              đơn sắc 2° · ΔL >= 0.06 · đầu tối 3.30:1
tối  #171f2e  red  yếu→mạnh #c92a2a #f03e3e #ff6b6b
              đơn sắc 4° · ΔL >= 0.06 · đầu tối 3.03:1
```

Ba phương án **trượt**, ghi lại để không ai đề xuất lại:

| nhánh thử | trượt vì |
|---|---|
| teal 2/4/7 `#96f2d7 #38d9a9 #0ca678` | đầu nhạt 1.31:1 trên nền trắng |
| teal 3/5/7 `#63e6be #20c997 #0ca678` | đầu nhạt 1.54:1 |
| red 3/5/8 `#ffa8a8 #ff6b6b #e03131` | đầu nhạt 1.84:1 |

Teal nhạt vốn tương phản kém trên nền trắng — mọi bậc dưới teal-5 đều trượt,
nên nhánh lãi buộc phải bắt đầu từ teal-5. Đó là lý do vị trí 5/7/9 chứ không
phải 4/6/8.

Điểm giữa và ô rỗng lấy từ token ngữ nghĩa của theme, không thêm mã màu:

| biến | vai | sáng | tối |
|---|---|---|---|
| `--chart-zero` | ngày hoà | `--border-strong` | `--border-strong` |
| `--chart-empty` | ngày không giao dịch | `--surface-sunken` | `--surface-sunken` |

### 4.2 Lý thuyết vs thực tế: một đường mốc, không phải hai chuỗi ngang hàng

`cum_theory = Σ profit_theory` — số tiền lẽ ra có nếu mọi lệnh chạy đúng kế
hoạch. Đó là **mốc so sánh**, không phải một chuỗi ngang hàng với thực tế.

- `cum_theory`: nét đứt 2px, `MAU_TRUNG_TINH` (`--text-muted`) — đã có sẵn
  trong `palette.ts`, không thêm biến nào.
- `cum_by_trade`: nét liền 2px, `--chart-actual` = `#1c7ed6`.

Hai chuỗi thì **có legend** (dataviz: ≥ 2 chuỗi luôn có legend), và kiểu nét
đã tự phân biệt chúng nên màu không phải tín hiệu duy nhất.

Vì sao không dùng cặp phân loại: cặp `#1c7ed6` + `#e8590c` **đạt đủ sáu phép
kiểm ở cả hai theme** (CVD ΔE 26.0, normal ΔE 34.4), nhưng cam nằm sát đỏ lỗ
`#e03131` về sắc độ, và quan trọng hơn là nó nói sai — sơn mốc và thực tế
thành hai màu ngang nhau là bảo người đọc rằng chúng ngang nhau. Giữ cặp đó
trong spec làm phương án dự phòng nếu sau này cần hai chuỗi thật sự bình đẳng.

Cặp **trượt**, ghi lại: `#1c7ed6` + `#7048e8` (tím) — CVD ΔE 5.7 deutan và
normal ΔE 14.4, dưới sàn cứng 15. `#1c7ed6` + `#f59f00` (hổ phách) — L 0.77
ngoài dải, tương phản 2.13:1 trên nền trắng.

### 4.3 Lệnh chạy lại

Chạy từ thư mục gốc của skill `dataviz`, Node ≥ 20:

```bash
node scripts/validate_palette.js "#1c7ed6,#e8590c" --mode light --surface "#ffffff"
node scripts/validate_palette.js "#1c7ed6,#e8590c" --mode dark  --surface "#171f2e"
```

Bốn nhánh thang nhiệt kiểm bằng `validateOrdinal` (không phải `validate` —
ramp một sắc trượt các phép kiểm phân loại theo đúng thiết kế):

```js
import { validateOrdinal } from "<dataviz>/scripts/validate_palette.js";
validateOrdinal(["#20c997","#0ca678","#087f5b"], { mode: "light", surface: "#ffffff" });
validateOrdinal(["#ff6b6b","#f03e3e","#c92a2a"], { mode: "light", surface: "#ffffff" });
validateOrdinal(["#087f5b","#0ca678","#20c997"], { mode: "dark",  surface: "#171f2e" });
validateOrdinal(["#c92a2a","#f03e3e","#ff6b6b"], { mode: "dark",  surface: "#171f2e" });
```

### 4.4 Ràng buộc khi dựng

Giữ nguyên toàn bộ 4a §7.3, thêm hai điều:

- Ô lịch nhiệt cạnh nhau cách 2px, bo 2px. Ô nhỏ nên khe là thứ duy nhất tách
  chúng ra — bỏ khe thì lưới thành một mảng loang.
- Màu không bao giờ là tín hiệu duy nhất: mỗi ô có `title`/tooltip ghi ngày,
  `sum_net` qua `formatMoney`, và số lệnh.

---

## 5. Kiến trúc file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `src/features/dashboard/heatmap.ts` | module **thuần**: gấp lịch, chế ô thiếu, chia bậc |
| `src/features/dashboard/HeatmapChart.tsx` | lưới ô — SVG/div thường, **không** Recharts |
| `src/features/dashboard/RDistributionChart.tsx` | histogram 22 bucket |
| `src/features/dashboard/ScoreRadarBlock.tsx` | hero number + radar bốn trục |
| `src/features/dashboard/TheoryVsActualChart.tsx` | hai đường theo STT |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `src/features/dashboard/prepare.ts` | thêm `chuanBiRDist`, `chuanBiRadar`, `chuanBiTheory` |
| `src/features/dashboard/palette.ts` | thêm `MAU_THUC_TE`, `bacNhiet()` |
| `src/features/dashboard/DashboardPage.tsx` | bốn chỗ theo §2.1 |
| `src/styles/index.css` | 9 biến mới (6 bậc + zero + empty + actual), kèm khối `[data-theme="dark"]` định nghĩa lại đúng 6 bậc |
| `src/test/styleguard.test.ts` | cổng `toPlot` nới lên hai file |
| `src/test/tradeFactory.ts` | `taoCharts()` nhận thêm phần 4b |
| `src/i18n/vi.ts`, `en.ts` | chuỗi 4b |

**Không đụng:** `types.ts`, `hooks.ts`, `queryKeys.ts`, `lib/decimal.ts`,
`lib/thresholds.ts`, `KpiGrid.tsx`, `StreakBlock.tsx`, `PivotBarChart.tsx`,
`WeekdayChart.tsx`, `DailyPnlChart.tsx`, `components/FilterBar.tsx`.

### 5.1 Vì sao lịch nhiệt tách thành module riêng

`prepare.ts` hiện 83 dòng, ba hàm, mỗi hàm là một `.map()` phẳng. Hình học
lịch — dựng dải ngày liên tục, gấp thành cột tuần bắt đầu CN, chia tam phân vị
— một mình nó dài hơn cả ba hàm kia cộng lại và không giống chúng chút nào.

Nhét chung sẽ biến `prepare.ts` thành file "mọi thứ về dữ liệu chart". Tách ra
thì mỗi file trả lời được một câu: `prepare.ts` là "đổi JSON thành hàng
Recharts", `heatmap.ts` là "gấp một dãy ngày thành lưới lịch". Cả hai vẫn
thuần, vẫn test không cần DOM.

### 5.2 Cổng `toPlot` nới lên hai file, vẫn là allowlist

`styleguard.test.ts` hiện ghim đúng một đường dẫn:

```ts
const CHO_DUOC_DUNG_TOPLOT = join("features", "dashboard", "prepare.ts");
```

`heatmap.ts` cần `toPlot` để so `|sum_net|` khi chia bậc, nên hằng này thành
mảng hai phần tử. **Vẫn là allowlist, không đổi thành thư mục** — cho phép cả
`features/dashboard/` thì mọi component chart tương lai đều lọt cửa, và cái
cổng mất đúng tác dụng nó sinh ra để có.

### 5.3 Lịch nhiệt không dùng Recharts

Recharts không có heatmap, và `ResponsiveContainer` đo bằng `ResizeObserver`
— thứ jsdom không có (4a §2.5). Một lưới ô là bài toán CSS grid, không phải
bài toán biểu đồ.

Lợi ích kèm theo: `HeatmapChart` **vẽ được thật trong jsdom**, nên nó là biểu
đồ duy nhất của bảng điều khiển test được ở mức DOM chứ không chỉ smoke test.
Test của nó phải khai thác điều đó — đếm ô, đọc màu, kiểm ngày thiếu.

---

## 6. Trạng thái rỗng

Mỗi biểu đồ tự lo phần rỗng của mình, cùng khuôn 4a §8.

| nhóm | khi nào rỗng | màn hình |
|---|---|---|
| `heatmap` | `[]` | `dashboard.emptyGroup` |
| `r_distribution` | 22 bucket đều `count = 0` | `dashboard.emptyGroup` |
| `score` | `avg_score_total = null` | `—` và câu "chưa lệnh nào được chấm" |
| `radar` | cả bốn trục `null` | `dashboard.emptyGroup` |
| `radar` | một vài trục `null` | vẽ, trục thiếu là `0` **và** ghi chú |
| `theory_vs_actual` | `[]` | `dashboard.emptyGroup` |

Hai dòng radar là chỗ dễ sai. `null` nghĩa là "chưa chấm", không phải "được 0
điểm" — nhưng radar bốn trục thì không vẽ được với ba đỉnh. Nên trục `null` vẽ
tại gốc **kèm chú thích nói rõ nó chưa chấm**, chứ không im lặng cho nó thành
điểm 0. Bất biến số 5 của 4a (`null` ra `—`, không ra `0`) vẫn giữ nguyên ở
mọi chỗ hiện **số**; chỗ này là ngoại lệ có ghi chú vì hình học ép buộc, và
ngoại lệ đó phải có test.

Thực tế `aggregate` cho cả bốn trục cùng `null` hoặc cùng có giá trị (chúng
tính trên cùng tập lệnh đã chấm), nên nhánh "một vài trục null" là phòng thủ.
Vẫn phải có, vì nó rẻ và vì hợp đồng JSON cho phép.

---

## 7. Testing

Giữ nguyên chiến lược 4a: table-driven trên module thuần, smoke test trên vỏ.
Ngoại lệ là `HeatmapChart` (§5.3) — nó test được ở mức DOM thật.

### Chín bất biến sẽ falsify

Mỗi dòng phải phá thật, xem test đỏ, rồi khôi phục.

| # | bất biến | cách phá |
|---|---|---|
| 1 | ngày thiếu được CHẾ RA, không bị bỏ | bỏ vòng lặp điền ngày, chỉ map ô backend gửi |
| 2 | không giao dịch ≠ hoà | cho hai trạng thái cùng trả `--chart-zero` |
| 3 | cột tuần bắt đầu CN | đổi sang bắt đầu T2 |
| 4 | trục radar cố định `[0, 25]` | bỏ `domain`, để Recharts tự co |
| 5 | đủ 22 bucket kể cả rỗng | `.filter((b) => b.count > 0)` |
| 6 | `score = null` ra `—` | `?? 0` |
| 7 | đường lý thuyết không mang màu lãi/lỗ | đổi nét đứt xám thành `MAU_LAI` |
| 8 | ranh giới tam phân vị đóng dưới | đổi `>=` thành `>` |
| 9 | `toPlot` chỉ ở hai file trong allowlist | gọi nó trong `HeatmapChart.tsx` |

### Kiểm bằng số thật

`taoCharts()` phải dựng được đúng hình dạng của
`backend/internal/httpapi/testdata/charts.golden.json`, và ít nhất một test
đọc số từ đó thay vì từ số bịa:

- `score.avg_score_total = "62.5"`, `scored_count = 2`
- `radar` bốn trục `"12.5" / "25" / "12.5" / "12.5"`
- `heatmap` một tháng `"06/2026"`, hai ô: `09/06 = "98"`, `10/06 = "-51"` —
  **giữa chúng không có ngày nào**, nên đây cũng là fixture cho bất biến số 1
  ở dạng nhỏ nhất (dải hai ngày liền kề, không có lỗ thủng nào để điền)
- `r_distribution` 22 bucket, đúng hai bucket có `count = 1`
- `theory_vs_actual` hai điểm, `cum_theory` `"120"` → `"80"` **giảm dần** trong
  khi `cum_by_trade` `"98"` → `"47"` cũng giảm — hai đường không cắt nhau ở
  fixture này

Cần thêm một fixture **có lỗ thủng thật** (ví dụ 09/06 rồi 15/06) để bất biến
số 1 có chỗ đỏ. Fixture đó dựng trong test, không đụng golden của backend.

### Cổng phải xanh trước khi báo xong

```bash
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
cd .. && make test
git diff main -- backend/          # phải rỗng
```

Ghi lại kích thước chunk `DashboardPage` trước và sau. Trước 4b nó là
**401.54 kB (113.07 kB gzip)**.

---

## 8. Rủi ro đã biết

**Bundle.** `DashboardPage` đã 401 kB trước khi 4b bắt đầu, và radar kéo thêm
mô-đun polar của Recharts. Nếu chunk vượt ~500 kB thì tách `ScoreRadarBlock`
thành `lazy()` riêng — nó nằm cuối trang, dưới màn hình đầu, nên tải chậm hơn
một nhịp không ai thấy. Không tách sẵn: thêm một ranh giới Suspense để phòng
một con số chưa đo được là tối ưu hoá mù.

**Lịch nhiệt dài.** Nhiều năm dữ liệu cho một lưới rất rộng. Cuộn ngang trong
`overflow-x: auto` của riêng nó — thân trang không bao giờ cuộn ngang.

**Tam phân vị trên tập nhỏ.** Dưới ba ngày có lệnh thì thang chỉ còn một hoặc
hai bậc dùng được. Đó là hành vi đúng (§2.5), không phải lỗi, nhưng nó làm
lịch nhiệt của tài khoản mới trông đơn sắc. Chấp nhận.

**`one_R` âm.** §3 dựa trên `one_R > 0`. Backend hiện không cho phép âm nhưng
cũng không chặn tường minh. Test ghim giả định chứ không ghim kết luận.
