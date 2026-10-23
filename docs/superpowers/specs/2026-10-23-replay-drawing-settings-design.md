# Tuỳ chỉnh hình vẽ trên trang Replay giống TradingView

Ngày: 2026-10-23. Tiếp nối `2026-10-21-replay-design.md`.

## Mục đích

Chủ sản phẩm vẽ được rồi nhưng phần **tuỳ chỉnh** hình vẽ còn sơ sài so với TradingView: thanh của
hình đang chọn chỉ có 12 màu, độ dày 1–4, kiểu nét, ghi chú, xoá; không có cửa sổ cài đặt. Mục tiêu là
**giao diện và hành vi giống TradingView 1:1** cho 9 công cụ chủ sản phẩm hay dùng:

Trend line · Rectangle · Horizontal ray · Brush · Path · Fib retracement · Long position ·
Short position · Text.

Nguồn: quan sát giao diện TradingView thật (đã đăng nhập) ngày 23/10/2026 — thanh nổi, menu, cửa sổ
cài đặt và giá trị mặc định của từng công cụ. **Không** dịch ngược hay chép mã của TradingView; viết
lại bằng mã của mình, icon dùng lucide / icon tự vẽ.

## Không làm (non-goals)

- Công cụ khác ngoài 9 công cụ trên.
- **Templates** (lưu/áp mẫu) và **Add alert**: replay không có cảnh báo; mẫu để sau. *(quyết định của Claude)*
- Nút "chart +" trên thanh của Long/Short (đặt lệnh thật từ hình). *(quyết định của Claude)*
- Ô **Leverage** của Long/Short: với hợp đồng tương lai nó không đổi số nào trên hình. *(quyết định của Claude)*

## Phần dùng chung

### Thanh nổi của hình đang chọn

Thứ tự nút theo TradingView, từng công cụ (bỏ Templates, Alert):

| Công cụ | Nút |
|---|---|
| Trend line, Horizontal ray | tay nắm kéo · Màu nét · Màu chữ · Độ dày · Kiểu nét · Cài đặt · Khoá · Xoá · Thêm (…) |
| Rectangle | tay nắm · Màu viền · Màu nền · Màu chữ · Độ dày · Kiểu nét · Cài đặt · Khoá · Xoá · Thêm |
| Brush | tay nắm · Màu · Độ dày · Cài đặt · Khoá · Xoá · Thêm |
| Path | tay nắm · Màu · Độ dày · Kiểu nét · Cài đặt · Khoá · Xoá · Thêm |
| Fib retracement | tay nắm · Màu các mức (đổi tất cả) · Độ dày · Cài đặt · Khoá · Xoá · Thêm |
| Long / Short | tay nắm · Màu chữ · Màu vùng stop · Màu vùng target · Cài đặt · Khoá · Xoá · Thêm |
| Text | tay nắm · Màu chữ · Cỡ chữ · Cài đặt · Khoá · Ghim · Xoá · Thêm |

- Kéo tay nắm để dời thanh; vị trí nhớ trong trình duyệt (như thanh replay).
- **Độ dày**: menu 1px / 2px / 3px / 4px có hình nét. **Kiểu nét**: Line / Dashed line / Dotted line.
- **Thêm (…)**: Visual order › (Bring to front, Bring forward, Send backward, Send to back) ·
  Visibility on intervals › · Clone (⌘ + kéo) · Copy (⌘C, dán ⌘V) · Hide.
- **Khoá**: hình khoá không kéo/sửa điểm được, vẫn chọn được để mở khoá.
- **Ghim** (Text): ghim chữ theo vị trí trên màn hình thay vì theo giá/thời gian.
- Nhấp đúp vào hình = mở cửa sổ Cài đặt.

### Bảng chọn màu

Lưới 10 cột × 8 hàng (xám, 10 màu gốc, 6 hàng nhạt → đậm), dưới là nút **+** (chọn màu tự do, các màu tự
chọn gần đây hiện thành một hàng) và **Opacity** (thanh trượt + ô %). Giá trị lưới:

```
#ffffff #dbdbdb #b8b8b8 #9c9c9c #808080 #636363 #464646 #1a1a1a #000000 #000000
#f23645 #ff9800 #ffeb3b #4caf50 #089981 #00bcd4 #2962ff #673ab7 #9c27b0 #e91e63
#fccbcd #ffe0b2 #fff9c4 #c8e6c9 #ace5dc #b2ebf2 #bbd9fb #d1c4e9 #e1bee7 #f8bbd0
#faa1a4 #ffcc80 #fff59d #a5d6a7 #70ccbd #80deea #90bff9 #b39ddb #ce93d8 #f48fb1
#f77c80 #ffb74d #fff176 #81c784 #42bda8 #4dd0e1 #5b9cf6 #9575cd #ba68c8 #f06292
#f7525f #ffa726 #ffee58 #66bb6a #22ab94 #26c6da #3179f5 #7e57c2 #ab47bc #ec407a
#b22833 #f57c00 #fbc02d #388e3c #056656 #0097a7 #1848cc #512da8 #7b1fa2 #c2185b
#801922 #e65100 #f57f17 #1b5e20 #00332a #006064 #0c3299 #311b92 #4a148c #880e4f
```

Trong cửa sổ Cài đặt, ô "nét" (màu + mẫu nét) mở cùng bảng này, thêm **Thickness** (4 nút) và
**Line style** (3 nút); Brush không có Line style.

### Cửa sổ Cài đặt

- Tiêu đề = tên hình, bút chì để đổi tên; nút X. Chân: **Cancel · Ok** (không có Template).
- Sửa tới đâu chart đổi tới đó; Cancel trả lại như cũ, Ok lưu (một bước hoàn tác).
- Mở lại thì vào tab dùng lần trước.
- **Coordinates**: mỗi điểm một hàng "#1 (price, bar)": ô giá (▲▼ theo bước giá) + ô số bar (theo khung
  của chart đang mở).
- **Visibility**: chỉ các hàng có ý nghĩa với replay — ☑ Minutes 1–59 · ☑ Hours 1–24 · ☑ Days 1–366, mỗi
  hàng ô từ, thanh trượt hai đầu, ô tới. Khung đang xem nằm ngoài khoảng thì hình ẩn. *(quyết định của
  Claude: bỏ Ticks/Seconds/Weeks/Months/Ranges vì replay không có các khung đó)*
- **Text** (hình có chữ): màu · cỡ (8 10 11 12 14 16 18 20 22 24 28 32 40) · B · I · ô chữ ·
  Text alignment [dọc] [ngang]. Thay cho "ghi chú trên đường" hiện có; ghi chú cũ chuyển sang đây.

### Mặc định cho hình mới

Theo TradingView (bảng dưới). Ngoài ra hình mới **nhớ kiểu dùng lần trước của cùng công cụ** (màu, độ
dày, kiểu nét…), lưu trong trình duyệt. *(quyết định của Claude: TradingView làm việc này qua Template
"Save as default", mà Template không làm)*

## Từng công cụ

### Trend line — mặc định #2962ff, 2px, liền
- Style: Line [nét] [đầu trái Normal/Arrow] [đầu phải Normal/Arrow] · Extend (Extend left line /
  Extend right line) · ☐ Middle point · ☐ Price labels · INFO: Stats (chọn nhiều: Price range, Percent
  change, Change in pips, Bars range, Date/time range, Distance, Angle; mặc định Hidden) · Stats position
  (Left / Center / Right / Auto, mặc định Right) · ☐ Always show stats.
- Text: căn mặc định Top / Center, cỡ 14. Coordinates: #1, #2. Visibility.
- Khi chọn: tô dải giá trên trục giá và dải thời gian trên trục thời gian, nhãn ở hai đầu.

### Rectangle — viền #9c27b0 2px, nền #9c27b0 20%
- 8 tay nắm (4 góc + 4 giữa cạnh); chọn hình thì giữa hiện "+ Add text" (bấm để gõ chữ).
- Style: Extend (Extend left / Extend right) · Border [nét] · ☐ Middle line [nét đứt] · ☑ Background [màu].
- Text: căn dọc Top / **Inside** / Bottom (mặc định Inside, Center). Coordinates #1, #2. Visibility.

### Horizontal ray — #2962ff 2px
- Style: Line [nét] · ☑ Price label (nhãn giá trên trục, nền màu của tia).
- Text: cỡ mặc định 12, căn Bottom / Center. Coordinates #1. Visibility.

### Brush — #00bcd4 2px, nét làm mượt
- Tab: Style · Visibility. Style: Line [màu + độ dày, không có kiểu nét] [đầu ▾] [cuối ▾] ·
  ☐ Background (tô vùng khép kín).

### Path — #2962ff 2px, đầu cuối là mũi tên
- Mỗi đỉnh một tay nắm; nhấp đúp để kết thúc.
- Tab: Style · Visibility. Style: Line [nét] [đầu ▾ Normal] [cuối ▾ Arrow].

### Fib retracement
- Vẽ: nhãn bên trái "0.236 (6,545.00)" cùng màu mức; nền tô giữa các mức; đường nối hai điểm.
- Tab: Style · Coordinates · Visibility. Style:
  - ☑ Trend line [#808080, nét đứt] · Levels line [độ dày] [kiểu nét] · Extend (lines left / lines right)
  - 24 mức hai cột, mỗi mức ☐ + giá trị sửa được + màu. Bật sẵn: 0 #808080 · 0.236 #f23645 ·
    0.382 #ff9800 · 0.5 #4caf50 · 0.618 #089981 · 0.786 #00bcd4 · 1 #808080 · 1.618 #2962ff ·
    2.618 #f23645 · 3.618 #9c27b0 · 4.236 #e91e63. Tắt sẵn: 1.272, 1.414, 2.272, 2.414, 2, 3, 3.272,
    3.414, 4, 4.272, 4.414, 4.618, 4.764 (màu lấy từ hàng nhạt của bảng màu, gần đúng theo ảnh).
  - Use one color · ☑ Background [opacity ~15%] · ☐ Reverse · ☑ Prices · ☑ Levels [Values / Percents] ·
    Labels [Left/Center/Right] [Top/Middle/Bottom] · ☑ Text [ngang] [dọc] · Font size 12 ·
    ☐ Fib levels based on log scale (chỉ bật được khi trục giá đang log).

### Long position / Short position
- Một click là đặt. Long: target (xanh) trên, stop (đỏ) dưới; Short ngược lại.
- Nhãn: "Target: 308.75 (4.061%) 1,235, Amount: 1250" · giữa "Open PnL: …, Qty: …" +
  "Risk/reward ratio: 1" (nền đỏ khi lỗ, xanh khi lãi) · "Stop: …". Tay nắm: entry (tròn), mép phải,
  target, stop (vuông).
- Tab: Inputs · Style · Visibility.
- Inputs: Account size · Lot size · Risk [% / USD] · Entry price · Profit level (Ticks, Price) ·
  Stop level (Ticks, Price) · QTY precision. Ticks và Price của mỗi mức đổi qua lại theo bước giá.
  *(quyết định của Claude)* Account size mặc định = số dư đầu của phiên replay; Lot size mặc định = giá
  trị một điểm của hợp đồng (NQ 20, ES 50…), Qty = rủi ro $ ÷ (khoảng stop × Lot size).
- Style: Lines [#808080] · Stop color rgba(242,54,69,.2) · Target color rgba(8,153,129,.2) ·
  Text [#ffffff] [12] · ☑ Price labels · Stats (chọn nhiều, mặc định bật hết: TP price offset, TP percent
  offset, TP tick offset, TP amount, Open/closed PL, Qty, Risk/reward ratio, SL price offset, SL percent
  offset, SL tick offset, SL amount) · ☐ Compact stats mode · ☐ Always show stats.

### Text — #2962ff, cỡ 14
- Click là gõ chữ ngay trên chart (placeholder "Add text").
- Tab: Text · Visibility. Text: màu · cỡ · B · I · ô chữ · ☐ Background [màu] · ☐ Border [màu] ·
  ☐ Text wrap.

## Dữ liệu

- `Drawing` thêm các trường kiểu dáng theo từng công cụ (nhóm `style`, `text`, `visibility`, `locked`,
  `hidden`, `name`, `z`). Mọi trường đều tuỳ chọn: thiếu thì lấy mặc định của công cụ, nên phiên cũ mở
  được không cần chuyển đổi; `note*` cũ đọc thành tab Text.
- Màu lưu dạng chuỗi hex/rgba (dữ liệu người dùng, như TradingView). Hình cũ đang lưu
  `var(--replay-palette-N)` vẫn vẽ đúng. *(quyết định của Claude: màu hình vẽ là dữ liệu, không phải
  màu giao diện, nên không đi qua biến theme; khung giao diện của thanh và cửa sổ vẫn dùng biến theme)*
- Chuỗi giao diện tiếng Anh / Việt nằm ở `i18n/strings.ts` như mọi chuỗi khác; tên mặc định của hình
  ("Trendline", "Fib retracement"…) cũng vậy.

## Chia giai đoạn (mỗi giai đoạn tự chạy được, có test)

1. **Khung chung**: bảng màu + opacity + màu tự chọn, thanh nổi mới (kéo được, khoá, ẩn, clone, copy/dán,
   thứ tự lớp), cửa sổ Cài đặt (tab, Cancel/Ok, đổi tên), tab Coordinates, Visibility, Text.
   Áp cho Trend line, Horizontal ray, Rectangle.
2. **Trend line đủ Style** (extend, đầu mũi tên, middle point, price labels, stats) và Rectangle
   (extend, middle line), dải giá/thời gian trên trục khi chọn.
3. **Brush, Path, Text**.
4. **Fib retracement**.
5. **Long / Short**.

## Test

- `engine/`: hình học mới (extend, mũi tên, stats, mức fib + reverse + log, tính Qty/Amount/PnL của
  Long/Short, visibility theo khung) — test đơn vị thuần.
- Component: thanh nổi đúng nút theo công cụ; cửa sổ Cài đặt sửa → chart đổi, Cancel trả lại, Ok tạo một
  bước hoàn tác; phiên cũ (có `note`, màu `var(...)`) mở ra vẫn đúng.
- Chuỗi có tham số: assert chuỗi đã nội suy (quy tắc `{n}` một ngoặc).
