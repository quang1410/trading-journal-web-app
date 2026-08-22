# Thiết kế — Phase 4a: Dashboard, KPI đầy đủ và bảy biểu đồ pivot

> **Đính chính một con số trong tài liệu cũ.** Thiết kế mẹ §10 và plan 3b đều viết "24 KPI".
> `statsDTO` (`backend/internal/httpapi/trade_dto.go:179`) có **23** trường, và
> `src/features/trades/types.ts` đã ánh xạ đúng 23. Con số 24 là lỗi đếm ở tầng tài liệu,
> không phải thiếu một trường. Tài liệu này dùng 23.

> Nguồn nghiệp vụ: `trading-journal-plan.md` §4, §5, §8.2 · Thiết kế mẹ:
> `docs/superpowers/specs/2026-08-16-trading-journal-design.md` §8 · Backend đã xong ở
> Phase 3a, phase này **không sửa một dòng `backend/`**.

## 1. Phạm vi

Dựng trang `/dashboard` trên endpoint `GET /api/accounts/{id}/charts` mà Phase 3a đã có.

**Trong phạm vi 4a:**

- 23 KPI của `/stats` — hiện đủ, thay vì 6 chỉ số như dải KPI ở `/trades`.
- Bảy nhóm biểu đồ dùng cấu trúc pivot chuẩn: `by_setup`, `by_symbol`, `by_timeframe`,
  `by_direction`, `by_weekday`, `by_week`, `by_day`.
- Cặp chuỗi thắng/thua liên tiếp (`longest_win_streak`, `longest_loss_streak`).
- Hạ tầng dùng lại được cho 4b: Recharts, cặp màu lãi/lỗ đã kiểm, ranh giới chuỗi→số,
  bố cục trang, hook `useCharts`.

**Để lại cho 4b:** `heatmap` (lịch nhiệt), `r_distribution` (histogram R), `score`,
`radar`, `theory_vs_actual`. Năm nhóm này đều phải tự dựng hình chứ không dùng lại được
`PivotBarChart`, nên chúng đi cùng nhau.

**Ngoài phạm vi cả 4a lẫn 4b:** import CSV (Phase 5), sửa `backend/`, sửa
`docs/design/theme.css` và `src/styles/theme.css`.

---

## 2. Năm quyết định đã chốt

### 2.1 Cắt đôi Phase 4 thành 4a và 4b

12 nhóm biểu đồ cộng 23 KPI là quá một plan. Đường cắt đặt ở **hình dạng dữ liệu**, không
ở chủ đề: bảy nhóm của 4a chia nhau đúng một kiểu backend (`Pivot`, và hai biến thể của
nó), nên chúng dùng chung được component. Năm nhóm của 4b thì mỗi cái một hình — lưới
lịch, histogram, radar, gauge, hai đường theo STT — không có gì để chia.

Hệ quả: 4a ship được một trang dùng thật, không phải một nửa trang.

### 2.2 Dashboard dùng chung đủ bảy ô lọc với `/trades`

`GET /charts` gọi đúng `filterFromQuery` như `/trades` và `/stats`
(`backend/internal/httpapi/trade_handler.go:127`), nên bảy ô lọc của 3b chạy được ngay,
không cần tầng ánh xạ nào.

Bộ lọc vẫn sống trên URL như 3b: `/dashboard?symbol=XAUUSD&from=2026-06-01`. F5 không mất,
gửi link được, và người dùng chuyển qua lại `/trades` ↔ `/dashboard` thì **giữ nguyên**
điều kiện lọc vì cả hai đọc cùng một `URLSearchParams`.

`FilterBar.tsx` và `filterBar.test.tsx` chuyển từ `src/features/trades/` sang
`src/components/` — hai trang cùng sở hữu thì nó là UI dùng chung, đứng cạnh
`AccountSwitcher` và `MoneyText`. `filters.ts` **ở nguyên** `features/trades/`: nó là hợp
đồng query của lệnh, và dashboard cũng đang lọc lệnh chứ không lọc thứ gì khác.

### 2.3 `toPlot()` là chỗ duy nhất tiền được đổi sang số

Recharts đặt pixel từ `number`, còn quy tắc 1 của CLAUDE.md cấm tiền thành `number`. Cả hai
đều đúng, và chúng không mâu thuẫn nếu tách bạch **hai vai** của một con số:

| vai | dạng | ai đọc |
|---|---|---|
| toạ độ | `number` | trình duyệt, để đặt pixel |
| chữ số | `string` | con người, trên nhãn/tooltip/trục |

`toPlot(v: string): number` vào `src/lib/decimal.ts`. Mọi chữ số người đọc thấy vẫn đi qua
`formatMoney`/`formatPercent`/`formatRatio` trên **chuỗi gốc**, không qua giá trị `toPlot`
trả về.

Không cần miễn trừ styleguard. Cổng hiện tại cấm `Number(`, `parseFloat(`, `parseInt(` —
`toPlot` dùng `+v` sau khi `DANG_SO` đã bảo đảm dạng số, đúng lối `readActiveAccountId` và
`readPage` đang dùng. Ném lỗi khi chuỗi không phải số thập phân, không trả `NaN` im lặng.

Hai cổng mới:

1. `toPlot` không được xuất hiện ngoài `src/features/dashboard/prepare.ts`.
2. Mọi giá trị trong `prepare.ts` phải giữ **cả hai** dạng: trường số cho Recharts và
   trường chuỗi gốc cho nhãn. Test ghim điều này bằng cách so nhãn với chuỗi gốc chứ không
   với kết quả làm tròn của `number`.

### 2.4 Bố cục cuộn dọc, chia mục có heading thật

Một trang cuộn, chia mục bằng `<h2>` thật (không phải `<div>` to chữ): trình đọc màn hình
duyệt được theo mục, và deep-link vào mục hoạt động.

Thứ tự: **Tổng quan** (23 KPI) → **Đường tăng trưởng** (`by_day`) → **Theo nhóm**
(`by_setup`, `by_symbol`, `by_timeframe`, `by_direction`) → **Theo thời gian**
(`by_weekday`, `by_week`). 4b nối thêm hai mục vào cuối, không đụng gì phần 4a đã ship.

Thanh lọc dính trên đỉnh (`sticky`) vì nó áp cho mọi mục bên dưới; đặt nó cuộn mất đi sẽ
làm người ta quên mình đang xem tập lệnh nào.

Bố cục tab bị loại: 4a sẽ phải dựng sẵn một tab rỗng chờ 4b, và so sánh chéo giữa hai tab
thì phải nhớ bằng đầu. Lưới thẻ đều nhau cũng bị loại: theme tắt hết shadow nên 12 khung
viền cạnh nhau rất ồn, và nó bóp đường tăng trưởng bằng ô radar.

### 2.5 Tách hàm dọn dữ liệu thuần, chỉ smoke test phần vỏ

`ResponsiveContainer` của Recharts đo bằng `ResizeObserver`, mà jsdom không có — plan 3b
Task 4 đã ghi nhận điều đó khi làm polyfill cho Radix Select. Trong jsdom container rộng
0px nên chart không vẽ gì; assert lên `<path>`/`<rect>` sẽ là assert lên khoảng trắng.

Nên mỗi biểu đồ tách đôi:

- `prepare.ts` — hàm **thuần**: JSON backend → mảng Recharts ăn được. Đây là chỗ duy nhất
  gọi `toPlot`, gán màu lãi/lỗ, và ghép nhãn. Test table-driven, không cần DOM. Đúng khuôn
  `internal/aggregate` bên Go.
- component chart — vỏ mỏng: nhận mảng đã dọn, khai báo trục và tooltip. Một smoke test
  render ở bề rộng cố định, chỉ để bắt lỗi thiếu prop.

Phần dễ sai nằm trọn trong hàm thuần. Polyfill `ResizeObserver` rồi assert lên SVG bị loại:
test sẽ bám vào chi tiết nội bộ của Recharts và đỏ hàng loạt mỗi lần nâng phiên bản dù
không có gì hỏng.

---

## 3. Hợp đồng dữ liệu — đã đo từ golden fixture

Hình dạng dưới đây chép từ `backend/internal/httpapi/testdata/charts.golden.json`, không
phải suy ra từ struct Go. Mọi trường tiền là **chuỗi**.

```ts
type Pivot = {
  key: string;
  count: number;
  win_count: number;
  sum_net: string;
  ave_net: string;
  win_rate: string; // phân số 0..1, KHÔNG phải phần trăm
};

type WeekdayStat = Pivot & {
  profit_positive: string;
  profit_negative: string; // ÂM hoặc "0"
};

type DayStat = {
  day: string;      // "2026-06-09"
  count: number;
  sum_net: string;
  cum_by_day: string;
};
```

### 3.1 Bảy điều backend đã quyết, frontend không được làm lại

| # | sự thật | hệ quả cho FE |
|---|---|---|
| 1 | `by_setup`/`by_symbol` đã cắt top 6 (`topN`, `pivot.go:83`) | **không** cắt lại, không sort lại |
| 2 | `by_timeframe` giữ thứ tự `domain.Timeframes` (M1→W), không theo số lệnh | không sort theo `count`; golden fixture có M15 trước H1 |
| 3 | `by_direction` **luôn** trả đủ hai nhóm, kể cả bên chưa có lệnh | không lọc bỏ nhóm `count: 0` |
| 4 | `by_weekday` **luôn** trả đủ bảy ngày Mon..Sun | giữ đủ bảy cột; ngày trống là thông tin, không phải rác |
| 5 | `by_week` `key` là nhãn `"W24"`, đã sort theo `week_sort` ẩn | không sort lại theo `key` — lexical `"W10" < "W2"` |
| 6 | `win_rate` là **phân số** (`"1"` = 100%) | hiển thị bằng `formatPercent`, không dán `%` vào số thô |
| 7 | hai `*_streak` tính trên `all` chứ không phải `filtered` (`charts.go:175`) | xem §3.2 |

### 3.2 Chuỗi liên tiếp không nghe theo bộ lọc

`aggregate.All` gọi `Streaks(all)` trong khi mười hai nhóm còn lại nhận `filtered`. Đây là
quy tắc 8 của CLAUDE.md: lũy kế và chuỗi tính trên **toàn bộ** dãy lệnh theo thứ tự `stt`;
bộ lọc chỉ lọc phần hiển thị.

Hệ quả trên màn hình: lọc còn một setup thì 23 KPI và bảy biểu đồ đổi số, còn cặp streak
**đứng yên**. Đặt nó lẫn trong hàng KPI là nói dối bằng cách xếp cạnh nhau.

Nên cặp streak nằm trong khối riêng, có nhãn nói thẳng rằng nó tính trên toàn bộ lịch sử
của account. Khi bộ lọc đang bật, khối này hiện thêm một dòng nhắc. Đây là **bất biến có
test**, không phải lời khuyên: test ghim rằng đổi bộ lọc không đổi hai con số đó.

---

## 4. Kiến trúc file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `src/features/dashboard/types.ts` | kiểu thuần, ánh xạ 1-1 `aggregate.Charts` |
| `src/features/dashboard/prepare.ts` | JSON → mảng Recharts; chỗ **duy nhất** gọi `toPlot` |
| `src/features/dashboard/hooks.ts` | `useCharts(accountId, filter)` |
| `src/features/dashboard/palette.ts` | hai màu lãi/lỗ cho chart, tham chiếu biến CSS (§7) |
| `src/features/dashboard/PivotBarChart.tsx` | cột dùng chung cho bốn nhóm `Pivot[]` |
| `src/features/dashboard/WeekdayChart.tsx` | cột tách phần lãi / phần lỗ |
| `src/features/dashboard/DailyPnlChart.tsx` | cột `sum_net` + đường `cum_by_day` |
| `src/features/dashboard/KpiGrid.tsx` | 23 KPI, ngưỡng màu §8.2 |
| `src/features/dashboard/StreakBlock.tsx` | cặp streak + lời nhắc "không theo bộ lọc" |
| `src/features/dashboard/DashboardPage.tsx` | ghép các mục |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `frontend/package.json` | thêm `recharts` |
| `src/lib/decimal.ts` | thêm `toPlot` |
| `src/lib/queryKeys.ts` | thêm `charts`, `chartsAll` |
| `src/features/trades/hooks.ts` | `useLamMoi` thêm nhánh thứ tư: `chartsAll` |
| `src/test/styleguard.test.ts` | cổng: `toPlot` chỉ được ở `prepare.ts` |
| `src/test/tradeFactory.ts` | thêm `taoCharts()` |
| `src/app/router.tsx` | thêm `/dashboard`, đổi đích `*` |
| `src/app/AppShell.tsx` | thêm NavLink |
| `src/i18n/vi.ts`, `src/i18n/en.ts` | chuỗi của dashboard |

**Chuyển chỗ**

| từ | sang |
|---|---|
| `src/features/trades/FilterBar.tsx` | `src/components/FilterBar.tsx` |
| `src/features/trades/filterBar.test.tsx` | `src/components/filterBar.test.tsx` |

---

## 5. Query key và invalidate — chỗ dễ sai nhất của phase này

`useCharts` dùng `qk.charts(accountId, filter)`, nằm dưới tiền tố `qk.chartsAll(accountId)`
đúng theo lối `trades`/`tradesAll` của 3b.

`useLamMoi` trong `features/trades/hooks.ts` hiện làm mới **ba** nhánh: `tradesAll`,
`statsAll`, `trash`. Nó phải thành **bốn**.

Thiếu nhánh thứ tư thì: sửa một lệnh ở `/trades` → chuyển sang `/dashboard` → biểu đồ vẫn
vẽ số cũ, không có lỗi nào bật ra. Đây đúng là dạng sai im lặng mà Task 3 của 3b được dựng
lên để chặn, chỉ khác chỗ xuất hiện.

**Bất biến sẽ falsify:** xoá nhánh `chartsAll` khỏi `useLamMoi`, test phải đỏ với số lần
gọi `/charts` đứng ở 1 thay vì 2.

---

## 6. 23 KPI

`KpiGrid` nhận nguyên `Stats` của `/stats` — kiểu đã có sẵn từ 3b
(`src/features/trades/types.ts`), không khai lại.

Ngưỡng màu lấy đúng §8.2 của thiết kế mẹ, so bằng `compareDecimal` trên chuỗi:

| chỉ số | ngưỡng |
|---|---|
| `profit_factor` | `<1` đỏ · `1–1.5` vàng · `1.5–2` xanh lá · `>2` xanh dương |
| `recovery_factor` | `<1` đỏ · `1–2` vàng · `>2` xanh lá |
| `expectancy` | `>0` xanh lá |
| tiền có dấu (`net_profit`, `total_win`, …) | `>0` `--primary` · `<0` `--status-error` · `=0` `--text-muted` |

`mauProfitFactor` đã tồn tại trong `StatsStrip.tsx`. Nó chuyển sang một module dùng chung
để `KpiGrid` và `StatsStrip` không có hai bản ngưỡng trôi lệch nhau.

**`null` không phải `0`.** Mười ba trường của `Stats` là con trỏ bên Go: `net_return_pct`,
`profit_factor`, `win_pct`, `ave_win`, `ave_loss`, `biggest_winner`, `biggest_loser`,
`biggest_r_win`, `biggest_r_loss`, `rr_actual`, `expectancy`, `max_dd_pct`,
`recovery_factor`. `null` nghĩa là **không tính được**, không phải bằng không. Hiện `—`.
Chưa có lệnh thua mà hiện `profit_factor = 0` thì đọc ra là "thua sạch", ngược hẳn sự thật.

`StatsStrip` ở `/trades` **giữ nguyên** sáu chỉ số. Nó là dải tóm tắt cạnh bảng lệnh, không
phải bản rút gọn của dashboard.

---

## 7. Màu — đã đo bằng validator, không phải chọn bằng mắt

### 7.1 4a không cần bảng màu phân loại

Thiết kế mẹ §8.2 dự trù một bảng màu phân loại cho `setup`/`symbol`/`timeframe`. Xem lại
hình dạng dữ liệu thì **không cần**: cả bảy biểu đồ của 4a đều vẽ **một chuỗi duy nhất**
(`sum_net` theo nhóm). Việc của màu ở đây là **cực tính** — lãi hay lỗ — chứ không phải
**danh tính**. Tô mỗi setup một màu khác nhau sẽ mã hoá thứ vốn đã nằm ở nhãn trục, và
cướp mất kênh màu của thứ duy nhất cần nó.

Bảng phân loại thật sự cần ở 4b, cho `theory_vs_actual` (hai đường không mang nghĩa
lãi/lỗ). Nó thuộc 4b.

### 7.2 Cặp màu lãi/lỗ cho nền chart — đã chạy validator

`--primary` (`#12b886`) **trượt** khi dùng làm mảng tô lớn:

| nền | kết quả với `#12b886` |
|---|---|
| sáng `#ffffff` | tương phản 2.55:1 — dưới ngưỡng 3:1 |
| tối `#171f2e` | OKLCH L 0.695 — ngoài dải 0.48–0.67 |

Nó vẫn đúng cho **chữ** và cho vệt nhỏ; nó chỉ trượt ở vai mảng tô. Cặp đã đo và đạt
**toàn bộ sáu phép kiểm ở cả hai theme**:

| vai | hex | ghi chú |
|---|---|---|
| lãi | `#0ca678` | teal-7, đúng một bậc tối hơn `--primary` (teal-6) |
| lỗ | `#e03131` | red-8, cùng họ với `--status-error` |

```
sáng, nền #ffffff:  L 0.43–0.77 PASS · chroma PASS · CVD ΔE 9.0 PASS
                    normal ΔE 32.7 PASS · tương phản ≥3:1 PASS
tối,  nền #171f2e:  L 0.48–0.67 PASS · chroma PASS · CVD ΔE 9.0 PASS
                    normal ΔE 32.7 PASS · tương phản ≥3:1 PASS
```

Lệnh tái lập, chạy từ thư mục gốc của skill `dataviz`:

```bash
node scripts/validate_palette.js "#0ca678,#e03131" --mode light --surface "#ffffff"
node scripts/validate_palette.js "#0ca678,#e03131" --mode dark  --surface "#171f2e"
```

**Một cặp cho cả hai theme**, không đảo màu theo `prefers-color-scheme`. Điều này khác
thông lệ — thường mỗi theme một bậc — nhưng cặp này lọt cả hai dải nên thêm một bậc thứ
hai chỉ là thêm chỗ để trôi lệch.

### 7.3 Ràng buộc khi dựng

- Hai màu khai thành biến CSS `--chart-profit` / `--chart-loss` trong `src/styles/`,
  **không** trong `theme.css` (CLAUDE.md cấm sửa file đó). Component tham chiếu tên biến;
  hex không bao giờ xuất hiện trong `.ts`/`.tsx` — cổng styleguard quét đúng hai đuôi đó.
- KPI và chữ **giữ nguyên** `--primary` / `--status-error` như 3b. Hai cặp không mâu
  thuẫn: chúng phục vụ hai vai khác nhau, và chênh nhau đúng một bậc trong cùng họ màu.
- Màu không bao giờ là tín hiệu duy nhất: kèm dấu `+`/`−` và nhãn chữ (§8.2 thiết kế mẹ).
- Một chuỗi thì **không** có legend — tiêu đề biểu đồ đã gọi tên nó.
- Khe 2px giữa các cột kề nhau; đầu cột bo 4px, neo vào đường 0.

---

## 8. Lỗi và trạng thái rỗng

| tình huống | màn hình |
|---|---|
| chưa chọn account | như `/trades` hiện tại — mời chọn account |
| account chưa có lệnh nào | một câu mời thêm lệnh + link sang `/trades`, **không** vẽ 7 khung rỗng |
| bộ lọc không khớp lệnh nào | giữ nguyên thanh lọc, báo "không có lệnh khớp", mời xoá lọc |
| một nhóm rỗng nhưng nhóm khác có (vd chưa có lệnh Short) | vẫn vẽ, cột bằng 0 — backend cố ý trả đủ nhóm |
| request hỏng | `Alert` cấp trang như 3b |
| đang tải | `Skeleton` đúng kích thước khối thật, không phải spinner giữa trang |

Phân biệt hai ô rỗng đầu là có chủ ý: "chưa có lệnh nào" và "lọc không ra gì" cần hai hành
động khác nhau, và gộp chúng làm một sẽ mời người dùng thêm lệnh trong khi họ chỉ cần bỏ
một bộ lọc.

---

## 9. Điều hướng

`/dashboard` thành đích mặc định: route `*` hiện trỏ `/accounts`, đổi sang `/dashboard`.
Đăng nhập xong nên thấy kết quả giao dịch, không phải trang cấu hình.

`AppShell` thêm NavLink đứng **đầu**, trước "Nhật ký lệnh". Chuỗi hiển thị lấy từ i18n cả
`vi` lẫn `en`, không chép cứng.

---

## 10. Testing

`make test-fe` phải xanh, cộng `npx tsc --noEmit` và `npm run build`.

### Bảy bất biến sẽ falsify

Mỗi dòng phải được phá thật, xem test đỏ, rồi khôi phục.

| # | bất biến | cách phá |
|---|---|---|
| 1 | mutation lệnh làm mới **cả bốn** nhánh | xoá `chartsAll` khỏi `useLamMoi` |
| 2 | streak **không** đổi theo bộ lọc | ghim mong đợi sang giá trị của tập đã lọc |
| 3 | nhãn tiền đi từ chuỗi gốc, không từ `toPlot` | đổi nhãn sang `String(toPlot(v))` |
| 4 | `toPlot` ném lỗi khi chuỗi không phải số | đổi sang trả `+v` không kiểm |
| 5 | KPI `null` ra `—` | `?? 0` |
| 6 | không cắt/sort lại thứ tự backend đã quyết | thêm `.sort()` theo `count` vào `by_timeframe` |
| 7 | `win_rate` là phân số | dán `%` vào chuỗi thô thay vì `formatPercent` |

### Kiểm bằng số thật

`taoCharts()` trong `src/test/tradeFactory.ts` dựng từ chính
`backend/internal/httpapi/testdata/charts.golden.json`. Dùng đúng file backend đã ghim
nghĩa là hai bên không thể trôi lệch mà không ai biết: đổi hình dạng JSON bên Go làm đỏ
test bên FE.

### Cổng phải xanh trước khi báo xong

```bash
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
```

E2E (`make e2e`) cần Docker. Nếu Docker không có mạng, dùng đường vòng đã ghi ở cuối plan
3b — chạy `db`/`migrate`/`api` từ ảnh đã cache, phục vụ FE bằng `npm run dev`, và trỏ
`E2E_BASE_URL=http://localhost:5173`.

---

## 11. Rủi ro đã biết

| rủi ro | xử lý |
|---|---|
| Recharts 3.10 kéo bundle lên đáng kể | `/dashboard` đã là chunk riêng qua `lazy()`; đo lại `npm run build` sau khi thêm |
| `ResponsiveContainer` im lặng ở jsdom | không assert lên SVG; phần dễ sai nằm ở hàm thuần (§2.5) |
| cặp màu chart trượt tương phản khi ai đó đổi nền | chạy lại `validate_palette.js` (§7.2 có lệnh) trước khi commit |
| chuyển `FilterBar` làm đỏ import ở `/trades` | chuyển và sửa import trong cùng một commit, chạy `tsc` ngay |
| `by_week` nhiều năm cùng số tuần cho hai `key` trùng nhau | giữ nguyên thứ tự backend; không dùng `key` làm React key, dùng chỉ số |
