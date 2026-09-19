# Thiết kế: thời điểm đóng lệnh và thời gian giữ lệnh

Ngày: 2026-09-11

## Mục tiêu

Nhật ký hiện chỉ ghi MỘT mốc thời gian cho mỗi lệnh (`entered_at`), nên không
trả lời được câu hỏi "tôi giữ lệnh bao lâu". Thiết kế này thêm mốc đóng lệnh và
dựng các chỉ số suy ra từ nó — trong đó chỉ số dẫn là **thời gian giữ lệnh
trung bình** trên dashboard.

## Phạm vi

Trong phạm vi:

1. Cột `closed_at` (nullable) trên bảng `trades`, nhập được từ form web.
2. Trường suy diễn `hold_seconds` cho mỗi lệnh.
3. Ba chỉ số KPI: thời gian giữ trung bình, trung bình trên lệnh THẮNG, trung
   bình trên lệnh THUA.
4. Cột "Thời gian giữ" trong bảng danh sách lệnh.
5. Biểu đồ phân phối P&L theo khoảng thời gian giữ lệnh.
6. Cột CSV thứ 19 để xuất-rồi-nhập-lại không mất dữ liệu.

Ngoài phạm vi: sửa hàng loạt `closed_at` cho lệnh cũ (người dùng tự sửa từng
lệnh), và mọi thống kê theo GIỜ trong ngày (giờ vào lệnh, giờ đóng lệnh).

## Quyết định

### QĐ-1: thêm `closed_at`, giữ nguyên nghĩa của `entered_at`

`entered_at` vẫn là thời điểm VÀO lệnh. Thêm cột mới `closed_at TIMESTAMPTZ
NULL`. Thời gian giữ lệnh = `closed_at − entered_at`.

Hai lựa chọn còn lại bị loại:

- *Đổi `entered_at` thành ngày đóng lệnh rồi thêm `opened_at`*: phải sửa nghĩa
  của một cột đã có dữ liệu, và mọi chỗ gom nhóm theo ngày (`day`, `week`,
  `month`, lịch nhiệt) sẽ đổi nghĩa im lặng.
- *Nhập thẳng số phút giữ lệnh*: mất khả năng suy ra mọi thứ khác từ hai mốc,
  và một con số gõ tay thì không kiểm tra chéo được với cái gì cả.

`ClosedAt` khai là `*time.Time`, KHÔNG phải `time.Time`. Cùng lý do đã ghi ở
comment của `Entry`/`Exit`/`Volume` trong `domain/models.go`: với cột NULLable,
kiểu giá trị sẽ lặng lẽ ghi zero-time thay vì NULL, và "chưa nhập" biến thành
"đóng lệnh lúc năm 0001" mà không lỗi nào báo.

### QĐ-2: `hold_seconds` là trường SUY DIỄN

Theo quy tắc 2 của CLAUDE.md, không có cột trong DB. Tính trong `metrics.Enrich`
cạnh `Day`/`Week`/`Month`, kiểu `*int64`, đơn vị GIÂY.

- `nil` khi `closed_at` là NULL — nghĩa là "chưa đóng / chưa biết", khác hẳn 0.
- Không dùng `decimal.Decimal`: quy tắc 1 nói về TIỀN. Thời lượng là số nguyên
  giây, không có phép chia tiền nào đi qua đây.
- Không dùng `time.Duration`: nó marshal ra nanosecond dạng số nguyên lớn,
  frontend đọc thành một con số vô nghĩa. `int64` giây là hợp đồng JSON rõ ràng.

### QĐ-3: lệnh chưa đóng bị LOẠI khỏi mọi số trung bình

Lệnh không có `closed_at` không đóng góp vào `avg_hold_seconds`, không vào
bucket nào của biểu đồ phân phối.

Lựa chọn bị loại: tính `now − entered_at` cho lệnh đang mở. Số đó đổi mỗi lần
tải lại trang, nên hai lần chụp màn hình cùng một bộ lọc sẽ ra hai kết quả —
một dashboard không tái lập được thì không dùng để ra quyết định được.

### QĐ-4: ba chỉ số KPI, tách thắng/thua

`AvgHoldSeconds`, `AvgHoldSecondsWin`, `AvgHoldSecondsLoss`, đều `*int64`, đều
`nil` khi không có lệnh nào đủ điều kiện — theo đúng quy ước "con trỏ nil =
không xác định" mà `KPI` đang dùng cho `ProfitFactor`, `WinPct`…

Phân loại thắng/thua theo dấu của `Net`, nhất quán với `WinCount`/`LossCount`
đang có: `Net > 0` là thắng, `Net < 0` là thua, `Net == 0` không vào nhóm nào.

Tách thắng/thua vì đó là chỗ chỉ số này có ích nhất: giữ lệnh thua lâu hơn lệnh
thắng là biểu hiện kinh điển của việc cắt lãi sớm và ôm lỗ.

Cả ba tính trên tập ĐÃ LỌC, theo quy tắc 8. Chúng không thuộc ngoại lệ
`CurrentBalance`.

### QĐ-5: biểu đồ phân phối theo khoảng thời gian giữ

Package thuần `aggregate`, file mới `holddist.go`, dựng theo đúng khuôn
`rdist.go`: khoảng nửa mở `lo <= x < hi`, biên khai bằng `int64` giây.

Sáu bucket:

| Nhãn | Khoảng (giây) |
|---|---|
| `< 5m` | `0 <= x < 300` |
| `5m – 15m` | `300 <= x < 900` |
| `15m – 1h` | `900 <= x < 3600` |
| `1h – 4h` | `3600 <= x < 14400` |
| `4h – 1 ngày` | `14400 <= x < 86400` |
| `> 1 ngày` | `86400 <= x` |

Bucket đầu có CẬN DƯỚI `0` dù nhãn chỉ ghi `< 5m`: không có nó thì
`hold_seconds` âm (dữ liệu hỏng, hoặc `closed_at` lọt qua được validation) sẽ
khớp `x < 300` và bị đếm như một lệnh scalp. Ghim bằng
`TestHoldDistributionSkipsNegativeHoldSeconds`.

Mỗi bucket trả `Count`, `Wins`, `Losses`, `SumNet`. Có `SumNet` vì câu hỏi thật
không phải "tôi hay giữ bao lâu" mà "khoảng giữ lệnh nào SINH LỜI" — một bucket
đông lệnh nhưng âm tiền là thứ cần nhìn thấy.

`Count` KHÁC `Wins + Losses` khi có lệnh hoà vốn (`net = 0`): backend cố tình
không xếp nó vào bên nào. Biểu đồ vì vậy vẽ BA tầng — thắng, thua, và phần hoà
còn lại (`count − wins − losses`, tính ở `prepareHoldDist`) — để tổng chiều cao
cột luôn bằng `count`. Nếu chỉ vẽ hai tầng thì một tập toàn lệnh hoà sẽ có
`count > 0` mà cột cao 0, và biểu đồ hiện "chưa có lệnh nào" trong khi ba ô KPI
thời gian giữ ngay phía trên hiện số thật — hai chỗ trên cùng một dashboard nói
ngược nhau. Vì cùng lý do đó, trạng thái rỗng của biểu đồ xét `count`, không
xét `wins`/`losses`.

Khác `RDistribution` ở một điểm: ở đó dấu của R luôn bằng dấu của net nên mỗi
bucket chỉ có một cực tính, còn ở đây một bucket thời gian chứa CẢ lệnh thắng
lẫn lệnh thua. Nên biểu đồ này vẽ cột CHỒNG hai màu (thắng/thua) — hình dạng dữ
liệu cho phép, khác với ghi chú trong `RDistributionChart.tsx`.

### QĐ-6: CSV thêm một cột INPUT

`csvformat.Columns` thêm `"Ngày đóng"` ngay sau `"Day"`; `InputColumnCount`
18 → 19.

Cột này KHÔNG vào `csvformat.Required`: file Excel gốc và mọi file đã xuất
trước đây đều thiếu nó, và chúng phải tiếp tục nhập được. Thiếu cột → `closed_at
= NULL`.

**Ràng buộc quan trọng — cột này mang ĐỦ NGÀY GIỜ, không phải chỉ ngày.**
`importer.ParseDay` cố tình cắt bỏ phần giờ và chốt về 12:00 giờ account (xem
comment của nó: file Excel cũ không có giờ nên phải chọn một quy ước an toàn).
Dùng lại `ParseDay` cho cột này thì mọi thời gian giữ lệnh sẽ ra 0 hoặc bội số
của 24 giờ. Vì vậy cột "Ngày đóng" cần hàm đọc riêng, `ParseDateTime`, giữ
nguyên phần giờ, và export ghi ra RFC3339.

**Sửa ngày 2026-09-19 (lúc cài đặt):** quyết định ban đầu ở đoạn này là *"cột
`Day` của file xuất ra vẫn là ngày trần, còn cột `Ngày đóng` là dấu thời gian
đầy đủ"*. Cài đặt cho thấy nó không chạy được, vì một lý do đoạn văn trên bỏ
sót: `ParseDay` ghim giờ về 12:00 khi đọc lại. Một lệnh vào 09:00 và đóng 09:30
xuất ra rồi nhập lại sẽ có `entered_at` = 12:00 còn `closed_at` = 09:30 — sai
`hold_seconds`, và tệ hơn là cả dòng bị TỪ CHỐI với lỗi `closed_at` trước
`entered_at`. Tức là file do chính app xuất ra không nhập lại được.

Quyết định thay thế: **cả hai cột đều ghi RFC3339 đầy đủ giờ theo timezone của
account** (`2026-09-10T09:00:00+07:00`). Ba điểm của quyết định này:

- **Có phần giờ**, nên cặp `entered_at`/`closed_at` của một lệnh luôn khớp nhau
  khi nhập lại.
- **Theo giờ account kèm offset, KHÔNG phải UTC.** Ghi UTC thì một lệnh vào lúc
  06:00 giờ VN hiện thành `2026-09-09T23:00:00Z` — lùi một ngày so với cột
  `Week`/`Month` ở ngay cùng dòng (vốn luôn tính theo giờ account), và người mở
  bằng Excel phải tự cộng trừ múi giờ. Ghim bằng
  `TestWriteCSVHaiCotThoiGianTheoGioAccountKhongPhaiUTC`.
- **Không mất khả năng nhập file Excel gốc:** `ParseDayOrDateTime` thử đọc giờ
  trước, không có giờ thì rơi về `ParseDay` như cũ.

Đánh đổi phải chấp nhận: file xuất ra từ nay khác file xuất ra trước đây ở cột
`Day` (có thêm phần giờ). File cũ vẫn nhập lại được bình thường, nhưng ai đang
đọc cột đó bằng công cụ ngoài thì cần biết.

Chuỗi cho cả hai cột sinh ở `metrics.DayTime`/`metrics.ClosedTime` — nơi duy
nhất giữ `*time.Location` của account. `exporter` chỉ ghi chuỗi ra, không tự
quy đổi múi giờ, đúng nguyên tắc "exporter KHÔNG tính lại gì cả".

Hai trường tương ứng trên `metrics.Enriched` mang `json:"-"`: chúng chỉ phục vụ
file CSV. API đã gửi `entered_at`/`closed_at` dạng RFC3339 ở nửa input của DTO,
nên đẩy thêm hai chuỗi nữa vào mọi lệnh của mọi response là trả băng thông cho
thứ frontend không đọc — và là cột thứ hai nói cùng một điều. Ghim bằng
`TestTradeDTOEmbedsButStaysFlat`.

### QĐ-7: `closed_at >= entered_at`

Kiểm ở `domain.ValidateTrade` (đường API), ở `patchToFields` (đường PATCH), ở
importer, và ở schema zod của form. Thời gian giữ lệnh âm không có nghĩa nào cả.

Bằng nhau thì HỢP LỆ: một lệnh vào và ra trong cùng một giây là chuyện có thật.

KHÔNG bắt buộc điền `closed_at` khi lệnh đã có `profit`. Form chỉ gợi ý nhẹ.
Lý do: `profit` đang là tín hiệu "đã đóng" duy nhất của form hiện tại, và bắt
buộc thêm một trường nữa sẽ chặn đường nhập nhanh mà người dùng đang dùng.

### QĐ-8: dữ liệu cũ để trống

Migration chỉ `ADD COLUMN ... NULL`. Không backfill. Lệnh cũ hiện "—" và bị loại
khỏi mọi số trung bình cho tới khi người dùng sửa tay.

Lựa chọn bị loại: đặt `closed_at = entered_at` cho lệnh cũ. Nó tạo ra hàng trăm
lệnh có thời gian giữ bằng 0, kéo mọi số trung bình xuống — một con số sai trông
như một con số thật.

## Hình dạng dữ liệu

### Go

```go
// domain.Trade
ClosedAt *time.Time `gorm:"column:closed_at"` // nil = chưa đóng/chưa biết

// metrics.Enriched
HoldSeconds *int64 `json:"hold_seconds"`

// metrics.KPI
AvgHoldSeconds    *int64
AvgHoldSecondsWin *int64
AvgHoldSecondsLoss *int64

// aggregate.HoldBucket
type HoldBucket struct {
    Label  string          `json:"label"`
    Count  int             `json:"count"`
    Wins   int             `json:"wins"`
    Losses int             `json:"losses"`
    SumNet decimal.Decimal `json:"sum_net"`
}
```

### JSON

```jsonc
// GET /trades → items[]
"closed_at": "2026-09-10T14:47:52Z",  // hoặc null
"hold_seconds": 786                    // hoặc null

// GET /stats
"avg_hold_seconds": 786,       // hoặc null
"avg_hold_seconds_win": 512,   // hoặc null
"avg_hold_seconds_loss": 1893  // hoặc null

// GET /charts
"hold_distribution": [
  { "label": "< 5m", "count": 3, "wins": 2, "losses": 1, "sum_net": "120.5" }
]
```

## Frontend

- `formatDuration(seconds, locale)` trong `lib/format.ts` → `"13,1m"`,
  `"2,5h"`, `"1,2 ngày"`. Một chữ số thập phân, dấu thập phân theo locale.
  Dưới 60 giây thì hiện `"45s"` (không có phần thập phân — nửa giây không nói
  gì thêm).
- Form: ô `DateTimePicker` cho `closed_at` trong băng "Đóng lệnh", KHÔNG bắt buộc.
- Bảng lệnh: cột "Thời gian giữ".
- Dashboard: 3 ô KPI mới trong `KpiGrid`, và `HoldTimeChart.tsx`.

## Kiểm thử

- `metrics`: `hold_seconds` nil khi chưa đóng; trung bình bỏ qua lệnh mở; tách
  thắng/thua đúng; cả ba nil khi không có lệnh đóng nào.
- `aggregate/holddist`: biên bucket khít nhau (đúng 300s rơi vào bucket thứ
  hai, không phải bucket đầu); lệnh không có `hold_seconds` không vào bucket
  nào; tổng `Count` các bucket = số lệnh có `hold_seconds`.
- `importer`/`exporter`: round-trip giữ nguyên `closed_at` KỂ CẢ phần giờ; file
  thiếu cột vẫn nhập được; `closed_at` trước `entered_at` báo lỗi có số dòng.
- `domain`: `ValidateTrade` từ chối `closed_at < entered_at`, chấp nhận bằng
  nhau và chấp nhận nil.
- Frontend: `formatDuration` các mốc; form gửi `closed_at` đúng theo timezone
  account và gửi `null` khi để trống; cột bảng hiện "—" khi nil; ô KPI; chart.
