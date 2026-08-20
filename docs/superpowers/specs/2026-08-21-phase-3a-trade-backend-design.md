# Thiết kế — Phase 3a: backend trade

Ngày: 2026-08-21
Trạng thái: đã duyệt, chuyển sang implementation plan
Spec mẹ: [`2026-08-16-trading-journal-design.md`](2026-08-16-trading-journal-design.md) — §5.3, §5.5, §7, §7.1
Nghiệp vụ: [`trading-journal-plan.md`](../../../trading-journal-plan.md)

## 1. Điểm xuất phát

Phase 3 được tách làm hai như Phase 2: **3a backend** (tài liệu này) và **3b frontend**
(spec riêng, viết sau khi API chạy được, để dựng giao diện đối chiếu thứ thật thay vì
đối chiếu hợp đồng trên giấy).

Những thứ đã có, 3a **không** làm lại:

| Đã có | Từ đâu | Bằng chứng |
|---|---|---|
| Bảng `trades` đủ 20 cột, 3 index | migration `0001_init.up.sql` | đang chạy trong Docker |
| Ánh xạ GORM cho `domain.Trade`, kể cả NULL decimal | Phase 1 | `repository/trade_mapping_test.go`, 3 test trên Postgres thật |
| `scoring.Total/Classify` | Phase 1 | `scoring_test.go`, phủ 20 case §2.7 |
| `metrics.Enrich` — mọi trường suy diễn và lũy kế | Phase 1 | golden fixture §7, 13 test |
| `metrics.ComputeKPI` | Phase 1 | golden fixture, 10 test |
| `aggregate.All` — 12 nhóm biểu đồ | Phase 1 | 9 test, kể cả "streak trên all, pivot trên filtered" |
| `RequireAuth`, `RequireAccount`, envelope, `apperr` | Phase 2a | đang chạy |

3a là lần đầu ba package thuần của Phase 1 được nối vào một request thật.

## 2. Quyết định chốt trong buổi thiết kế này

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Tách 3a backend / 3b frontend | Lặp lại cách đã hiệu quả ở Phase 2; 3b dựng giao diện đối chiếu API chạy thật |
| 2 | 3a làm trọn **ba** endpoint đọc: `/trades`, `/stats`, `/charts` | Cả ba dùng chung một bộ máy nạp-và-lọc. §7.1 là phần dễ sai nhất — viết một lần, test một lần. Phase 4 thành thuần frontend |
| 3 | `/charts` marshal thẳng `aggregate.Charts`, ghim bằng golden JSON test | 44 json tag đã có sẵn từ Phase 1; viết DTO 1-1 cho 12 nhóm lồng nhau là ~200 dòng không thêm giá trị mà tự nó cũng trôi lệch được. Golden test bắt đúng thứ DTO sinh ra để bắt |
| 4 | `Enriched` và `KPI` **vẫn** có DTO riêng | Hai struct này chưa có json tag, và `Enriched` bọc `domain.Trade` kèm tag GORM — lôi thẳng ra API là rò rỉ tầng lưu trữ |

## 3. Phạm vi

**Làm:** `repository/trade.go`, `service/trade.go`, middleware `RequireTrade`, DTO cho trade và
KPI, 9 endpoint (§6).

**Không làm trong 3a:**

### 3.1 Thuộc phase sau — đã có lịch
- Toàn bộ giao diện `/trades`, form nhập, bộ lọc, trang thùng rác → **3b**
- Dashboard 12 biểu đồ ở frontend → **Phase 4** (backend đã xong ở 3a)
- Import CSV/Excel → **Phase 5**

### 3.2 Chưa phase nào nhận
- Chèn lệnh vào giữa dãy, đổi thứ tự `stt`, sắp lại `stt` theo `entered_at` — spec mẹ §5.5 và
  mục "Không làm" đã loại khỏi phase đầu.
- Xoá cứng lệnh (kể cả từ thùng rác). Không có `DELETE` thật ở đâu cả.
- Cache kết quả `Enrich` (xem §4.4).
- `DELETE /api/accounts/:id` — món nợ từ 2b, vẫn chưa phase nào nhận.

## 4. Đường đọc

### 4.1 Một hàm nạp-và-lọc dùng chung

§7.1 của spec mẹ quy định **hai tập khác nhau** cho cùng một request, và trộn lẫn chúng là lỗi
im lặng: kết quả vẫn ra số, chỉ là số sai. Vì vậy cả ba endpoint đọc đi qua đúng một hàm:

```go
// service/trade.go
type Filter struct {
    From, To   string // "YYYY-MM-DD" theo timezone account; rỗng = không lọc
    Setup      string
    Symbol     string
    Timeframe  string
    Direction  string
    TradeClass string
}

type ReadResult struct {
    All      []metrics.Enriched // TOÀN BỘ lệnh chưa xoá, đã Enrich theo stt
    Filtered []metrics.Enriched // tập đã lọc
    Account  domain.Account
}

func (s *TradeService) Read(ctx context.Context, accountID int64, f Filter) (ReadResult, error)
```

Ba nơi tiêu thụ:

| Endpoint | Dùng gì |
|---|---|
| `GET /trades` | phân trang `Filtered` |
| `GET /stats` | `metrics.ComputeKPI(Filtered, Account, flows)` — `flows` là cash flow của account, nạp thêm một truy vấn, cần cho `current_balance` |
| `GET /charts` | `aggregate.All(All, Filtered, Account)` — **cả hai**, vì streak tính trên toàn bộ còn pivot tính trên tập lọc |

Chữ ký `aggregate.All(all, filtered, account)` không phải suy đoán: `TestAllStreakTinhTrenAllPivotTinhTrenFiltered`
của Phase 1 đã ghim đúng ngữ nghĩa đó.

Lũy kế được tính **trước** khi lọc. Hệ quả nhìn thấy được: `cum_by_trade` của một lệnh tháng 3
vẫn là lũy kế từ đầu lịch sử, không phải từ đầu tháng 3. Đó là hành vi đúng — đường equity
không được đổi hình chỉ vì người dùng bấm một bộ lọc.

### 4.2 Lọc trong Go, không trong SQL

Vì đằng nào cũng phải nạp hết lệnh để tính lũy kế, lọc dưới SQL không tiết kiệm được lần đọc
nào. Thêm nữa `trade_class` là trường suy diễn, chỉ tồn tại **sau** `Enrich` — lọc nó trong SQL
là bất khả. Một đường lọc thay vì hai.

Bốn filter chuỗi (`setup`, `symbol`, `timeframe`, `direction`) so khớp **chính xác**, không
`LIKE`, vì chúng là giá trị enum hoặc khoá gom nhóm. So khớp mờ là việc của ô tìm kiếm ở 3b.

### 4.3 `from`/`to` so trên `Day`, có chủ ý khác spec mẹ

Spec mẹ §7.1 bảo đổi `from`/`to` thành khoảng UTC (`from 00:00` → `to 23:59:59.999` tại tz
account) rồi so với `entered_at`, kèm cảnh báo "không so sánh chuỗi ngày với timestamp".

3a làm khác: so `from <= Day <= to` bằng **so sánh chuỗi**.

Lý do là lời cảnh báo kia nhắm vào việc lọc trong SQL, nơi một bên là `DATE` và bên kia là
`TIMESTAMPTZ`. Ở đây cả hai vế đều là chuỗi `YYYY-MM-DD`, và `Day` do `metrics.DateParts` sinh ra
đã quy đổi đúng timezone của account rồi. Định dạng `YYYY-MM-DD` có thứ tự từ điển trùng khít
thứ tự thời gian, nên phép so sánh là đúng, và nó **loại bỏ hoàn toàn** số học biên múi giờ —
tức loại bỏ đúng cái bẫy mà spec mẹ đang cảnh báo, thay vì tìm cách đi qua nó cho khéo.

Test ghim ca biên: `entered_at = 2026-06-09T23:00:00Z`, account tz `Asia/Ho_Chi_Minh` → `Day =
2026-06-10`. Vậy `from=2026-06-10` **phải** bắt được lệnh này, còn `to=2026-06-09` thì **không**.

### 4.4 Trần mở rộng, nói thẳng

Mỗi request đọc nạp **toàn bộ** lịch sử lệnh của account rồi chạy `Enrich` trên đó. Với nhật ký
cá nhân cỡ vài nghìn lệnh, chi phí không đáng kể. Nhưng đây là trần thật, không phải chi tiết
ẩn: độ phức tạp là O(N) mỗi request đọc, N là số lệnh của account.

Nếu về sau chạm trần, lối thoát là cache kết quả `Enrich` theo khoá `account_id + max(updated_at)
+ số lệnh`. **Không làm trong 3a** — chưa có số đo nào nói rằng cần.

### 4.5 Phân trang

`page` từ 1, `size` mặc định 50, trần 200. Vượt trần thì kẹp về 200 chứ không báo lỗi. `page`
vượt quá số trang trả mảng rỗng kèm `total` đúng, không phải 404.

Response: `{"items": [...], "page": 1, "size": 50, "total": 137}`.

Thứ tự mặc định **`stt` giảm dần** — nhật ký đọc từ mới nhất, dù Excel gốc xếp tăng dần. Không
có tham số đổi thứ tự; 3b cần thì thêm sau.

Phân trang chỉ áp cho `/trades`. `/stats` và `/charts` luôn tính trên trọn tập đã lọc.

## 5. Đường ghi

### 5.1 Cấp `stt` — và cái bẫy soft delete

Spec mẹ §5.5: `stt = max(stt)+1` trong cùng account, trong một transaction có khoá hàng account.

**`max(stt)` phải quét cả lệnh đã xoá mềm.** Đây là chỗ dễ sai và hỏng nặng: nếu chỉ lấy max
trên lệnh chưa xoá, thì xoá lệnh `stt=5` (lệnh cuối) rồi tạo lệnh mới sẽ cấp lại `stt=5`, và
đến lúc khôi phục lệnh cũ thì đụng `UNIQUE (account_id, stt)` — người dùng mất khả năng khôi
phục, mà nguyên nhân nằm cách đó nhiều thao tác. Test phải ghim đúng chuỗi này: tạo → xoá →
tạo → khôi phục.

Transaction:

```
BEGIN
  SELECT id FROM accounts WHERE id = ? FOR UPDATE   -- khoá hàng account
  SELECT COALESCE(MAX(stt), 0) + 1 FROM trades WHERE account_id = ?   -- KHÔNG lọc deleted_at
  INSERT ...
COMMIT
```

**`stt` do frontend gửi lên bị bỏ qua, không báo lỗi.** Đây là quy tắc 7 của `CLAUDE.md`, và
nó xung đột với `DisallowUnknownFields` mà `DecodeJSON` đang bật: để nguyên thì gửi `stt` sẽ ăn
400 chứ không phải bị bỏ qua. Cách xử lý: DTO tạo lệnh **có** trường `stt` và cố ý không đọc
tới, kèm chú thích nói rõ vì sao nó tồn tại. Test ghim: gửi `{"stt": 999}` vẫn tạo được lệnh, và
lệnh nhận `stt` thật do backend cấp.

Soft delete để lại lỗ hổng trong dãy `stt`. Chấp nhận — lũy kế duyệt lệnh chưa xoá theo `stt`
tăng dần, lỗ hổng không ảnh hưởng.

### 5.2 Khôi phục làm đổi lũy kế

`POST /trades/:id/restore` đưa lệnh trở lại giữa dãy `stt`, nên mọi giá trị lũy kế của các lệnh
**sau** nó đều đổi. Đó là hành vi đúng, không phải tác dụng phụ — nhưng cần một test ghim rõ,
vì nó dễ bị hiểu nhầm thành lỗi khi nhìn số nhảy.

### 5.3 Kiểm tra đầu vào

Nguyên tắc: kiểm **đúng** những gì DB đã ràng buộc, cộng những gì nghiệp vụ đòi. Không tự đặt
thêm giới hạn không có trong schema — làm vậy là tạo nguồn sự thật thứ hai.

| Trường | Luật | Nguồn |
|---|---|---|
| `entered_at` | RFC3339 **có offset**; thiếu offset → 400 | spec mẹ §9 |
| `symbol` | trim, không rỗng | nghiệp vụ |
| `direction` | ∈ `domain.Directions` | CHECK 0001 |
| `timeframe` | ∈ `domain.Timeframes` ∪ `{""}` | CHECK 0001 |
| `entry_quality`, `in_trade_quality`, `exit_quality`, `psychology` | ∈ enum §1 ∪ `{""}` | CHECK 0001 |
| `setup` | trim; rỗng → `domain.DefaultSetup` | mặc định 0001 |
| `profit` | bắt buộc có mặt | NOT NULL |
| `fee` | vắng mặt → 0 | mặc định 0001 |
| `entry`, `exit`, `volume`, `profit_theory` | vắng mặt hoặc `null` → NULL | NULLable 0001 |

Không kiểm dấu của `profit` (lỗ là số âm, hợp lệ), không kiểm `entry < exit`, không suy ra
`profit` từ giá — Excel gốc cho nhập tay và đó là nguồn sự thật.

`entered_at` **không** bị chặn ở tương lai: người dùng có thể ghi trước một lệnh đang mở.

### 5.4 PATCH là partial update

Giống `accounts`: mọi trường là con trỏ, khoá **vắng mặt** nghĩa là "không đổi". Phân biệt được
"không gửi" với "gửi null" — riêng bốn trường NULLable, `null` tường minh nghĩa là **xoá giá
trị**, còn vắng mặt là giữ nguyên. Đây là chỗ `*decimal.Decimal` không đủ diễn đạt, nên bốn
trường đó dùng `json.RawMessage` rồi tự phân giải ba trạng thái.

Sửa `entered_at` **không** đổi `stt` (spec mẹ §5.5).

### 5.5 Quyền sở hữu

`/accounts/:id/trades*` đã được `RequireAccount` che. `/trades/:id` cần middleware mới:

```go
func RequireTrade(svc *service.TradeService) func(http.Handler) http.Handler
```

Nạp lệnh theo id → nạp account của nó → so `account.UserID` với `UserID(ctx)`. Đặt **cả** lệnh
và account vào context, vì handler nào cũng cần account (timezone cho `Enrich`, currency).

Ngữ nghĩa lỗi bám đúng tiền lệ `AccountService.ForUser`: không tìm thấy → **404**; tìm thấy
nhưng của người khác → **403**. Spec mẹ §7.2 chấp nhận việc 403 để lộ rằng id đó tồn tại.

Lệnh đã xoá mềm vẫn nạp được qua `RequireTrade` — nếu không thì `restore` không thể hoạt động.

## 6. Hợp đồng API

```
GET    /api/accounts/:id/trades       ?from&to&setup&symbol&timeframe&direction&trade_class&page&size
POST   /api/accounts/:id/trades
GET    /api/accounts/:id/trades/trash
GET    /api/accounts/:id/stats        ?from&to&setup&symbol&timeframe&direction&trade_class
GET    /api/accounts/:id/charts       ?from&to&setup&symbol&timeframe&direction&trade_class
GET    /api/trades/:id
PATCH  /api/trades/:id
DELETE /api/trades/:id                → xoá mềm
POST   /api/trades/:id/restore
```

Tất cả nằm sau `RequireAuth`. Nhánh `/accounts/:id/*` thêm `RequireAccount`; nhánh `/trades/:id`
thêm `RequireTrade`.

Spec mẹ §7 chỉ liệt kê `?from&to` cho `/stats` và `/charts`. 3a cho chúng nhận **đủ bộ filter**
giống `/trades` — vì §7.1 quy định KPI và aggregation tính trên "tập đã lọc", mà tập đã lọc thì
do toàn bộ filter quyết định chứ không riêng khoảng ngày. Cho `/stats` ít filter hơn `/trades`
sẽ khiến bảng và KPI hiển thị cạnh nhau mà nói hai chuyện khác nhau.

### 6.1 `tradeDTO`

Phẳng, không lồng: 17 trường input + `id`/`account_id`/`stt`, rồi toàn bộ trường suy diễn.

```json
{
  "id": 1, "account_id": 1, "stt": 1,
  "entered_at": "2026-06-09T05:00:00Z",
  "symbol": "XAUUSD", "direction": "Long",
  "entry": "2350.50000", "exit": "2360.00000", "volume": "0.5000",
  "profit": "100.00", "profit_theory": "120.00", "fee": "2.00",
  "setup": "Breakout", "timeframe": "H1",
  "entry_quality": "Đúng kế hoạch", "in_trade_quality": "Tuân thủ kế hoạch",
  "exit_quality": "Chạm Chốt lời", "psychology": "Không lỗi",
  "notes": "",
  "net": "98.00", "win_loss": 1, "win_sign": 1,
  "score_entry": 25, "score_in_trade": 25, "score_exit": 25, "score_psych": 25,
  "score_total": 100, "trade_class": "Đúng kế hoạch",
  "day": "2026-06-09", "week": "W24", "week_sort": "2026-W24",
  "month": "06/2026", "weekday": "Tue",
  "cum_by_trade": "98.00", "cum_by_day": "98.00", "cum_theory": "120.00",
  "running_peak": "98.00", "drawdown": "0.00"
}
```

`entry`, `exit`, `volume`, `profit_theory` là `null` khi chưa nhập. `score_total` là `null` khi
lệnh chưa chấm điểm đủ; lúc đó `trade_class` là `"CHƯA ĐÁNH GIÁ"`.

Mọi trường tiền là **chuỗi JSON**, không phải số — `decimal.Decimal` của shopspring marshal ra
chuỗi, và đó là lý do frontend không mất chữ số.

### 6.2 `statsDTO`

Ánh xạ 1-1 từ `metrics.KPI` sang snake_case. Mọi trường `*decimal.Decimal` ra `null` khi không
tính được (chưa có lệnh thua thì `profit_factor` là `null`, không phải `0`).

### 6.3 `/charts`

Marshal thẳng `aggregate.Charts`. Một golden test ghim toàn bộ JSON của một fixture cố định;
đổi tên trường hay thứ tự nhóm trong `aggregate` là test đỏ.

### 6.4 Mã lỗi

Dùng lại bộ đã có: 1400 (dữ liệu sai), 1401, 1403 (không phải của bạn), 1404 (không tìm thấy),
1409 (đụng `stt`, gần như không xảy ra nhờ khoá hàng), 1500.

## 7. Kiểm thử

Theo đúng luật `CLAUDE.md`: mỗi feature ship kèm test trong cùng lần thay đổi.

| Tầng | Chạy trên | Nội dung |
|---|---|---|
| `repository` | Postgres thật (testcontainers) | CRUD; `UNIQUE (account_id, stt)`; lọc `deleted_at`; cấp `stt` **khi chạy song song**; `max(stt)` quét cả lệnh đã xoá |
| `service` | Postgres thật | `All` ≠ `Filtered`; từng filter; biên ngày theo timezone; khôi phục làm đổi lũy kế |
| `httpapi` | `httptest` | envelope; 401/403/404; phân trang; `stt` do FE gửi bị từ chối; `entered_at` thiếu offset → 400; golden JSON của `/charts` |

### 7.1 Bất biến phải falsify

Trước khi báo 3a xong, mỗi dòng dưới đây phải được xoá đi một lần và **thấy test đỏ**, kèm
output thật. Cách này ở Phase 2a tìm ra lỗ hổng thật ở cả 7 task từ 5 đến 11, và ở 2b tìm ra 4
lỗi nữa mà plan không lường trước.

| # | Bất biến | Test phải đỏ |
|---|---|---|
| 1 | `max(stt)` quét cả lệnh đã xoá mềm | tạo → xoá → tạo → khôi phục, không đụng UNIQUE |
| 2 | Khoá hàng account khi cấp `stt` | N goroutine tạo lệnh song song, `stt` không trùng và không hổng |
| 3 | Lũy kế tính trên `All`, không phải `Filtered` | lọc còn 1 lệnh giữa dãy, `cum_by_trade` vẫn là lũy kế từ đầu |
| 4 | `aggregate.All` nhận đúng thứ tự `(all, filtered)` | streak đổi khi thêm lệnh ngoài bộ lọc, pivot thì không |
| 5 | KPI tính trên `Filtered`, không phải `All` | lọc còn 1 lệnh, `total_trades` = 1 |
| 6 | `from`/`to` so trên `Day` theo tz account | lệnh `23:00Z` ngày 09 lọt vào `from=2026-06-10` |
| 7 | `trade_class` lọc **sau** `Enrich` | lọc `CHƯA ĐÁNH GIÁ` trả đúng lệnh chưa chấm điểm |
| 8 | Xoá là xoá **mềm** | sau `DELETE`, hàng vẫn còn trong bảng, `deleted_at` khác NULL |
| 9 | Lệnh đã xoá không vào danh sách và không vào lũy kế | `cum_by_trade` của lệnh cuối đổi sau khi xoá một lệnh giữa dãy |
| 10 | `RequireTrade` chặn lệnh của người khác | user B gọi `/trades/:id` của user A → 403 |
| 11 | `entered_at` phải có offset | `"2026-06-09T12:00:00"` → 400 |
| 12 | PATCH phân biệt "vắng mặt" với "null" | gửi `{"profit_theory": null}` xoá giá trị; không gửi thì giữ nguyên |
| 13 | Hình dạng JSON của `/charts` được ghim | đổi tên một json tag trong `aggregate` → golden test đỏ |

### 7.2 Hai điều cần cảnh giác

- **Check không bao giờ đỏ được.** `go test -run` không khớp gì sẽ in `ok ... [no tests to run]`
  rồi thoát 0. Test duyệt danh sách phải mở đầu bằng một assert rằng danh sách khác rỗng.
- **Falsify sai chỗ.** Xoá một dòng mà test vẫn xanh thì hỏi "test này sai, hay dòng kia thừa?"
  trước khi kết luận.

## 8. Xong khi

- `make lint`, `make test-pure` không đổi kết quả; ba package thuần vẫn không import GORM/HTTP.
- `make test` xanh, gồm test mới của `repository`, `service`, `httpapi`.
- 9 endpoint trả đúng envelope, kiểm được bằng `curl` trên stack Docker thật.
- 13 bất biến ở §7.1 đều đã falsify, có output thật.
- `git diff` trên `frontend/` rỗng — 3a không sửa một dòng frontend nào.
