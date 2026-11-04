# Thiết kế: tab Ngày/Tuần và ghi chú theo kỳ

Ngày: 2026-09-21

## Mục tiêu

Nhật ký hiện chỉ ghi chú được cho TỪNG LỆNH (`trades.notes`). Nhưng phần lớn
bài học của một người giao dịch không thuộc về một lệnh: "hôm nay vào lệnh trả
thù sau cú thua sáng", "tuần này bỏ hết setup A vì thị trường đi ngang". Không
có chỗ ghi, những nhận xét đó không được ghi.

Thiết kế này thêm hai tab **Ngày** và **Tuần** vào trang `/trades`, mỗi kỳ là
một thẻ tổng kết kèm ô ghi chú riêng.

## Phạm vi

Trong phạm vi:

1. Bảng `journal_notes` — ghi chú theo ngày và theo tuần, thuộc ACCOUNT.
2. Hàm thuần `aggregate.Periods` — gom lệnh theo ngày/tuần kèm KPI đầy đủ.
3. Endpoint `GET /api/accounts/{id}/periods`, chịu bộ lọc hiện có.
4. Endpoint `PUT`/`DELETE /api/accounts/{id}/notes/{period}/{key}`.
5. Tab `Lệnh · Ngày · Tuần` trên `/trades`, trạng thái nằm trên URL.
6. Thẻ kỳ gập lại được, kèm sparkline và dải màu ở mép trái.
7. Hộp soạn ghi chú dùng lại `RichTextEditor` và `TemplateMenu`.

Ngoài phạm vi:

- **Ghi chú cho ngày KHÔNG có lệnh nào.** Danh sách thẻ sinh từ lệnh thực tế,
  đúng như UI tham chiếu. Ngày nghỉ không có thẻ nên không có chỗ ghi.
- **Ghi chú theo THÁNG.** Hai kỳ đã phủ nhu cầu đã nêu; thêm kỳ thứ ba là thêm
  một giá trị enum và một tab mà chưa ai hỏi tới.
- **Xuất/nhập ghi chú kỳ qua CSV.** File CSV giữ đúng cấu trúc Excel gốc, mỗi
  dòng là một lệnh; ghi chú theo kỳ không có dòng để ngồi vào.
- **Lịch sử sửa đổi ghi chú.**

## Quyết định

### QĐ-1: MỘT bảng `journal_notes` cho cả hai kỳ

```sql
CREATE TABLE journal_notes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    period     TEXT        NOT NULL,   -- 'day' | 'week'
    period_key TEXT        NOT NULL,   -- 'YYYY-MM-DD' | 'YYYY-Www'
    body_html  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX journal_notes_key
    ON journal_notes (account_id, period, period_key);
```

Không tách `day_notes` và `week_notes`. Hai bảng ấy có cùng cột, cùng ràng
buộc, cùng vòng đời — tách ra là nhân đôi repository, service, handler và test
để đổi lấy đúng một thứ: dạng chuỗi của `period_key`. Ràng buộc unique là thứ
giữ cho mỗi kỳ chỉ có một ghi chú, và nó viết được một lần cho cả hai.

`period` là TEXT có giá trị đóng chứ không phải enum của Postgres: dự án đã
dùng TEXT cho `cash_flows.type` với cùng lý do — thêm giá trị mới không cần
migration đổi kiểu, và tầng domain mới là nơi kiểm tra giá trị hợp lệ.

### QĐ-2: `period_key` là TEXT, sinh từ `metrics.DateParts`

Khoá ngày dùng `Day` ("2026-09-21"), khoá tuần dùng `WeekSort` ("2026-W39").
Cả hai lấy nguyên từ `metrics.DateParts` — hàm đã là "chỗ DUY NHẤT trong hệ
thống quyết định một lệnh thuộc về ngày nào".

Đây là điểm đúng/sai, không phải sở thích. Nếu ghi chú tự quy đổi ngày bằng
đường khác, một lệnh lúc 06:00 giờ Việt Nam sẽ nằm ở thẻ ngày này còn ghi chú
nằm ở thẻ ngày kia, và không lỗi nào bật ra — chỉ có một ghi chú biến mất khỏi
thẻ mà người dùng vừa gõ nó vào. Dùng chung một hàm thì hai thứ không lệch
được.

Hai lựa chọn bị loại:

- *Cột `DATE`*: khoá tuần không phải một ngày. Lưu ngày đầu tuần thì phải quy
  ước lại đâu là đầu tuần ở mọi chỗ đọc, trong khi ISO week đã có sẵn.
- *Hai cột `year` + `week_number`*: cần ba cột cho hai kỳ và một ràng buộc
  unique có điều kiện. Một chuỗi sắp xếp đúng theo thứ tự thời gian làm được
  cả hai việc.

Tuần theo ISO-8601 (thứ Hai đến Chủ nhật), khớp quyết định #5 của spec mẹ. UI
tham chiếu của E8 dùng Chủ nhật–thứ Bảy, nhưng đổi theo nó sẽ khiến thẻ tuần
và biểu đồ `by_week` trên dashboard gom nhóm khác nhau trên cùng một dữ liệu.

### QĐ-3: ghi chú thuộc ACCOUNT, không thuộc user

`journal_notes` có `account_id`, giống `trades` và `cash_flows`, khác
`note_templates` (thuộc user).

Lý do: nội dung ghi chú nói về các lệnh của MỘT tài khoản trong kỳ đó. Người
dùng chạy hai tài khoản với hai chiến lược sẽ có hai bản tổng kết khác nhau cho
cùng ngày thứ Hai. Gắn vào user thì hai bản ấy đè lên nhau.

`ON DELETE CASCADE` chứ không soft delete: quy tắc 6 áp cho `trades` vì xoá
cứng lệnh làm sai đường equity. Ghi chú không nằm trong dãy lũy kế theo `stt`,
và xoá account thì ghi chú của nó không còn nghĩa gì.

### QĐ-4: `aggregate.Periods` tái dùng `metrics.ComputeKPI`

```go
// Period là kỳ gom nhóm của thẻ tổng kết.
type Period string

const (
    PeriodDay  Period = "day"
    PeriodWeek Period = "week"
)

// PeriodStat là một ngày hoặc một tuần: khoá kỳ, KPI của riêng kỳ đó, và
// chuỗi điểm để vẽ sparkline.
type PeriodStat struct {
    Key    string        `json:"key"`     // "2026-09-21" | "2026-W39"
    Start  string        `json:"start"`   // ngày đầu kỳ, để hiển thị
    End    string        `json:"end"`     // ngày cuối kỳ
    KPI    metrics.KPI   `json:"kpi"`
    Volume decimal.Decimal `json:"volume"`
    Points []PeriodPoint `json:"points"`  // đường lũy kế TRONG kỳ
}

func Periods(filtered []metrics.Enriched, acc domain.Account, p domain.Period) []PeriodStat
```

> **Cập nhật khi cài đặt:** chữ ký ban đầu nhận cả `all` lẫn `filtered`, nhưng
> `all` không được đọc ở đâu — lũy kế trong mỗi `Enriched` đã tính từ trọn dãy
> trước khi lọc. Tham số thừa đã bỏ. `Period` nằm ở `domain` (cùng `PeriodRef`
> = cặp `(Period, Key)` và `ParsePeriod`/`ParsePeriodRef`), vì cả ghi chú kỳ lẫn
> thẻ kỳ đều dùng nó.

Gọi lại `metrics.ComputeKPI` cho từng nhóm thay vì viết công thức lần thứ hai.
Profit factor, win/loss, biggest winner/loser, expectancy — tất cả đã có định
nghĩa đúng và đã có test. Viết lại chúng ở tầng kỳ là tạo ra một bản sao sẽ
trôi khỏi bản gốc ở lần sửa công thức tiếp theo.

`ComputeKPI(filtered, all, acc, flows)` nhận cả hai tập, và với từng kỳ ta
truyền `(rows của kỳ, rows của kỳ)`: `CurrentBalance` và `NetCashFlow` không có
nghĩa ở cấp ngày — số dư là một mốc tại một thời điểm, không phải một đại lượng
của khoảng. Vì thế `PeriodStat` KHÔNG phơi hai trường đó ra JSON, và `flows`
truyền vào là slice rỗng.

`Volume` là trường duy nhất phải thêm mới: `metrics.KPI` chưa có tổng volume.
Thêm vào `PeriodStat` chứ không vào `KPI`, để không đổi hợp đồng JSON của
`/stats` đang chạy.

**Ngoại lệ đã chốt khi cài đặt — `MaxDrawdown` đo TRONG kỳ.** `ComputeKPI` đọc
`Enriched.Drawdown`, tức sụt giảm so với đỉnh lũy kế của TOÀN tài khoản. Dán
thẳng lên thẻ thì một ngày toàn lệnh thắng vẫn mang con số sụt giảm thừa kế từ
một ngày trước đó. `aggregate.periodKPI` gọi `ComputeKPI` rồi ghi đè riêng
`MaxDrawdown` bằng `drawdownWithin`: đỉnh khởi tạo bằng lũy kế lúc VÀO kỳ, đo
khoảng tụt sâu nhất bên trong. Mọi trường khác vẫn lấy nguyên từ `ComputeKPI`.
Đây không trái quy tắc 8: phạm vi ở đây là định nghĩa của chỉ số ("sụt giảm
trong ngày này"), không phải bộ lọc; sparkline vẫn giữ `CumByTrade` toàn cục.

Package `aggregate` vẫn thuần theo quy tắc 3 — không import GORM, `net/http`
hay `context`. Test chạy không cần Docker.

### QĐ-5: quy tắc 8 giữ nguyên — thẻ hiện theo tập ĐÃ LỌC

`Periods` nhận tập `filtered`; các trường lũy kế bên trong vẫn là số của trọn dãy.

- Danh sách thẻ sinh từ `filtered`: lọc theo setup A thì chỉ còn những ngày có
  lệnh setup A, và KPI trên thẻ là KPI của phần đã lọc.
- Các trường lũy kế bên trong mỗi `Enriched` (`CumByTrade`, `Drawdown`) vẫn là
  số tính từ TRỌN dãy, vì `metrics.Enrich` đã chạy trước khi lọc.

Sparkline trong thẻ vẽ `CumByTrade` của các lệnh trong kỳ. Đường đó là một
đoạn của đường equity thật, không rebase về 0 tại đầu kỳ — cùng lý lẽ đã chốt
cho chuỗi lý thuyết-vs-thực tế ở quy tắc 8: rebase làm thẻ đẹp hơn nhưng nói
một điều không đúng về vị trí tài khoản.

Ghi chú KHÔNG chịu bộ lọc: nó gắn với khoá kỳ, nên thẻ nào hiện ra thì ghi chú
của kỳ đó đi kèm, bất kể bộ lọc nào đã tạo ra danh sách thẻ.

### QĐ-6: `PUT` upsert, không phải `POST` + `PATCH`

```
GET    /api/accounts/{id}/periods?period=day|week        (+ tham số lọc hiện có)
GET    /api/accounts/{id}/period-notes?period=day|week
PUT    /api/accounts/{id}/period-notes/{period}/{key}
DELETE /api/accounts/{id}/period-notes/{period}/{key}
```

> **Cập nhật khi cài đặt:** tiền tố là `/period-notes` chứ không phải `/notes`,
> để không đụng nghĩa với ô Notes của lệnh. Thêm `GET /period-notes`: frontend
> cần nội dung ghi chú của mọi thẻ trong MỘT request, và nhét body HTML vào
> `/periods` sẽ bắt số liệu kỳ (chịu bộ lọc) và ghi chú (không chịu bộ lọc) đi
> chung một query key.

Khoá `(account, period, key)` do CLIENT biết trước — nó là ngày người dùng vừa
bấm, không phải id do server cấp. Khi khoá đã biết trước thì "tạo" và "sửa" là
cùng một thao tác, và `PUT` là động từ diễn tả đúng việc đó: gửi nội dung mong
muốn cho một địa chỉ đã biết.

Tách `POST` và `PATCH` sẽ bắt frontend phải biết ghi chú đã tồn tại hay chưa
TRƯỚC khi gửi, tức thêm một lần đọc và một tình huống đua: hai tab cùng mở, cả
hai thấy "chưa có", cả hai `POST`, một cái vỡ vì unique index.

Upsert cài bằng `ON CONFLICT (account_id, period, period_key) DO UPDATE`, nên
ràng buộc unique là thứ THỰC THI quy tắc một-ghi-chú-mỗi-kỳ chứ không phải một
lần kiểm tra trong code có thể bị đua qua mặt.

Body rỗng (chuỗi trắng hoặc HTML rỗng của Quill) được xử như XOÁ: người dùng
xoá sạch chữ rồi lưu thì kỳ vọng là ghi chú biến mất, không phải một bản ghi
rỗng làm thẻ hiện một mục trống. "HTML rỗng của Quill" là đúng tập
`EMPTY_HTML` của `src/lib/richText.ts`; backend chép tập đó ở
`domain.IsBlankNoteHTML` để hai phía cùng một định nghĩa.

`{key}` được kiểm tra dạng ở tầng domain trước khi chạm DB: `\d{4}-\d{2}-\d{2}`
cho ngày, `\d{4}-W\d{2}` cho tuần. Không kiểm thì `period_key` thành bãi rác
chuỗi tự do và hai ghi chú cho cùng một ngày viết hai kiểu sẽ cùng tồn tại.

## Frontend

### QĐ-7: tab nằm trên URL, dùng lại `Segmented`

`Segmented` đã là radiogroup thật — roving tabindex, mũi tên đổi lựa chọn, một
nấc Tab cho cả nhóm. Dựng một hàng nút mới là dựng lại phần trợ năng đó kém hơn.

Trạng thái tab đọc/ghi qua `useSearchParams` (`?view=day`), như bộ lọc và số
trang. `/trades?view=week&setup=A` gửi cho người khác thì họ mở ra thấy đúng
màn hình đó. Để trong `useState` thì link mất một nửa nội dung.

Ba tab: `Lệnh` (bảng hiện có, mặc định), `Ngày`, `Tuần`. `FilterBar` giữ nguyên
vị trí và áp cho cả ba.

### QĐ-8: thẻ GẬP LẠI, ba tầng

```
┌──────────────────────────────────────────────────────────┐
│▌ ▸ Thứ Hai, 21/09/2026   +308,85 US$   1 lệnh   [Ghi chú]│  tầng 1
│▌─────────────────────────────────────────────────────────│
│▌  ┌────────────┐   Lãi gộp        Thắng/thua             │
│▌  │  ▁▃▅▂▆     │   Phí            Tỷ lệ thắng            │  tầng 2
│▌  │            │   Volume         Profit factor          │
│▌  └────────────┘   ├── lỗ sâu nhất ●———— lãi cao nhất ──┤│
│▌─────────────────────────────────────────────────────────│
│▌  Ghi chú: …                                             │  tầng 3
└──────────────────────────────────────────────────────────┘
```

> **Cập nhật khi cài đặt:** tầng 2 chia hai bậc. Bậc trên: Thắng/thua, Tỷ lệ
> thắng, Profit factor. Bậc dưới (tra cứu): Lãi gộp, Lỗ gộp, Phí, Volume, cộng
> Lãi TB, Lỗ TB, Kỳ vọng, Max DD (đo trong kỳ, xem QĐ-4) và Thời gian giữ TB —
> dùng nhãn `kpi.*` của dashboard để cùng đại lượng mang cùng tên. Dấu `●` trên
> dải biên độ là lãi trung bình (`ave_win`); dải chỉ dựng khi có cả lệnh thấp
> nhất lẫn cao nhất.

Tầng 1 luôn hiện, mang đúng ba thứ người ta cuộn để tìm: kỳ nào, lãi lỗ bao
nhiêu, mấy lệnh. Tầng 2 và 3 nằm trong phần gập.

UI tham chiếu mở sẵn mọi thẻ, nên mười ngày là mười màn hình cuộn và không so
sánh được hai ngày cách nhau một tuần. Gập lại thì một tháng giao dịch nằm gọn
trong một màn hình, và mở ra là chủ động chọn đọc kỹ một kỳ.

Trạng thái gập KHÔNG lưu vào URL: nó là thói quen đọc trong một phiên, không
phải nội dung của trang. Nhồi mười khoá mở/đóng vào query string làm link dài
ra mà người nhận không quan tâm.

### QĐ-9: signature — dải màu ở mép trái thẻ

Mỗi thẻ có một dải dọc 3px sát cạnh trái: `--primary` khi kỳ lãi,
`--status-error` khi lỗ, độ đậm (opacity) tỉ lệ với |net| so với kỳ mạnh nhất
trong tập đang hiện.

Đây là chỗ DUY NHẤT tiêu sự táo bạo. Cuộn nhanh qua ba tháng là đọc được nhịp
lời/lỗ mà không đọc một chữ số nào — thông tin mà một danh sách thẻ xám không
cho, và là thứ trả lời câu hỏi "giai đoạn nào tôi đánh tốt" nhanh hơn mọi biểu
đồ.

Hai lựa chọn bị loại:

- *Tô nền cả thẻ theo lãi/lỗ*: chữ trên nền màu khó đọc, và mười thẻ màu cạnh
  nhau thành một cái chăn vá.
- *In số net thật to màu xanh/đỏ*: UI tham chiếu làm vậy, nhưng nó lặp lại
  thông tin con số đã nói, và không cho biết ngày này mạnh hay yếu so với ngày
  khác.

Dải màu ăn nhập với ngôn ngữ của theme: theme đã tắt hết `shadow-*`, phân tầng
bằng border và bậc surface. Chỉ dùng biến ngữ nghĩa, không hardcode hex.

Kèm điều kiện sàn: dải màu KHÔNG phải kênh thông tin duy nhất — con số net luôn
đứng cạnh nó ở tầng 1. Người không phân biệt được teal với đỏ vẫn đọc được thẻ.

### QĐ-10: soạn ghi chú dùng lại trình soạn của lệnh

Nút `Ghi chú` mở `Dialog` chứa `RichTextEditor` + `TemplateMenu` — cùng trình
soạn, cùng bộ mẫu với ô Notes của lệnh. `note_templates.body_html` lưu đúng
định dạng HTML của Quill, nên chèn mẫu vào ghi chú kỳ chỉ là nối chuỗi, không
cần tầng dịch nào.

Thẻ đã có ghi chú: nút đổi nhãn thành `Sửa ghi chú`, tầng 3 hiện nội dung.
Thẻ chưa có: tầng 3 vắng mặt hoàn toàn — không có ô rỗng nào giả vờ là dữ liệu.

Lưu lạc quan qua TanStack Query, invalidate khoá của kỳ đó. Hộp đóng ngay khi
bấm lưu; lỗi mạng thì hoàn lại nội dung cũ và hiện `Alert` trên thẻ, không nuốt
lỗi.

Vì vậy mutation nằm ở THẺ, không ở hộp soạn: hộp đã unmount khi lỗi về. Nút
`Xoá ghi chú` nằm cạnh nội dung ở tầng 3, hỏi lại qua `AlertDialog`, rồi gửi
`PUT` body rỗng — cùng mutation lạc quan với lưu.

Trong `Dialog` phải nhớ hai cái bẫy đã ghi trong memory của dự án: listener của
thanh công cụ Quill sống sót qua cleanup (gây nhắc hai lần), và `max-w` không
có tiền tố thua `sm:max-w-lg` của shadcn.

### QĐ-11: chuỗi hiển thị qua `i18n`

Mọi nhãn mới vào `i18n/strings.ts`, không viết thẳng vào component — theo quy
tắc 9: định danh tiếng Anh, dữ liệu hiển thị tiếng Việt.

Nhãn gọi tên việc người dùng làm, không gọi tên việc hệ thống làm: `Ghi chú`,
`Sửa ghi chú`, `Xoá ghi chú`. Màn hình rỗng của tab Ngày nói rõ vì sao rỗng —
chưa có lệnh nào, hay bộ lọc đang cắt hết — như `/trades` đang làm.

## Kiểm thử

Theo mục Testing của CLAUDE.md: test đi cùng feature, không dời sang phase sau.

**Backend, không cần Docker:**

- `aggregate`: table-driven cho `Periods` — gom đúng nhóm qua mốc nửa đêm theo
  timezone của account; tuần ISO vắt qua giao thừa (31/12 thuộc tuần 1 năm
  sau); kỳ chỉ có lệnh hoà (net = 0) không làm vỡ profit factor; sparkline
  KHÔNG rebase về 0 tại đầu kỳ.
- `domain`: khoá kỳ sai dạng bị từ chối, cả `day` lẫn `week`.

**Backend, cần DB:**

- `repository`: upsert hai lần cùng khoá cho ra MỘT dòng và nội dung lần sau;
  unique index chặn dòng thứ hai; xoá account cuốn theo ghi chú.
- `httpapi`: `PUT` vào account của người khác bị chặn; body rỗng xoá bản ghi.

  > **Cập nhật khi cài đặt:** mã trả về là **403**, không phải 404. Mọi route
  > dưới `/accounts/{id}` đi qua middleware `RequireAccount`, và middleware đó
  > trả 403 cho account không thuộc về người gọi. Ghi chú kỳ không tự chế một
  > mã riêng; đổi sang 404 là quyết định cho toàn bộ API, không phải của
  > feature này. Bên trong account, ghi chú không tồn tại vẫn là 404.

**Frontend:** `npx tsc --noEmit && npm run build`, chạy bằng node v22.15.0 —
node mặc định của shell là v16 và làm `tsc` chết.

Chạy: `make test` (Go).

## Rủi ro

**Số lượng thẻ.** Một account ba năm có ~750 ngày giao dịch. `GET /periods` trả
hết một lần sẽ nặng. Phiên bản này chấp nhận: bộ lọc khoảng ngày đã có sẵn và
là cách người dùng thu hẹp tự nhiên. Nếu chậm thật, thêm phân trang theo kỳ —
không đổi hợp đồng đã mô tả ở đây.

**`ComputeKPI` gọi N lần.** Mỗi kỳ một lần, trên tập con nhỏ. Toàn bộ là tính
toán trong bộ nhớ trên dữ liệu đã nạp sẵn, không có truy vấn nào thêm.
