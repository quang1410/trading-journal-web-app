# Thiết kế — Phase 3b: Frontend nhật ký lệnh

**Ngày:** 2026-08-21
**Nhánh:** `phase-3b-trade-frontend`
**Tiếp nối:** Phase 3a (backend trade, đã gộp về `main` tại `0cd68b9`)
**Spec mẹ:** `docs/superpowers/specs/2026-08-16-trading-journal-design.md` §7, §8

---

## 1. Phạm vi

Dựng giao diện cho chín endpoint mà Phase 3a đã có. Không đụng backend: hết
phase này, `git diff main -- backend/` phải rỗng.

**Làm:**

- `/trades` — dải KPI, thanh lọc, bảng lệnh, phân trang, form thêm/sửa.
- `/trades/trash` — thùng rác, khôi phục.
- Ba component shadcn còn thiếu: `select`, `textarea`, `badge`.
- Thay hai `<select>` thô hiện có bằng `Select`.

**Không làm** (có chủ ý, không phải bỏ sót):

- Biểu đồ và trang dashboard — Phase 4, dù `/charts` đã sẵn sàng.
- Nhập CSV — Phase 5.
- Sửa hàng loạt, sắp xếp theo cột, xoá cứng.
- `DELETE /api/accounts/:id` — endpoint không tồn tại; món nợ này vẫn chưa
  có ai nhận và Phase 3b không nhận.

---

## 2. Bốn quyết định đã chốt

### 2.1 Bảng bày cột chọn lọc, chi tiết bung theo dòng

`tradeDTO` có 40 trường. Bảng hiện **11 cột**; bấm vào một dòng thì bung ra
panel đủ 40 trường ngay dưới nó.

Phương án thay thế đã cân nhắc và loại: bày rộng như Excel với cuộn ngang.
Loại vì `week`, `month`, `weekday`, `week_sort` chỉ có nghĩa khi gom nhóm —
Phase 4 sẽ dùng chúng trong pivot, còn ở bảng từng dòng chúng chỉ chiếm chỗ.

Bung dòng **không phát sinh request nào**: `GET /trades` đã trả đủ 40 trường,
nên chi tiết là chuyện thuần client.

### 2.2 Form 16 trường nằm trong dialog

Dùng lại đúng khuôn `AccountFormDialog`: cùng `Dialog`, cùng `zodResolver`,
cùng lối gửi PATCH theo `dirtyFields`. Không thêm route, và đóng form không
làm mất bộ lọc đang đặt.

### 2.3 Bộ lọc và số trang nằm trên URL

`/trades?from=2026-06-01&symbol=XAUUSD&page=2`. F5 không mất bộ lọc, gửi link
được, nút Back trả về bộ lọc trước.

Tên tham số trùng **đúng** tên backend đã nhận (`from`, `to`, `setup`,
`symbol`, `timeframe`, `direction`, `trade_class`, `page`), nên không cần tầng
ánh xạ nào giữa URL và query string của API.

`size` **không** lên URL và cũng không gửi lên API: nó cố định 50, đúng bằng
`DefaultPageSize` của backend. Gửi lại một giá trị trùng mặc định chỉ tạo ra
hai nguồn sự thật cho cùng một con số.

### 2.4 Trang `/trades` có dải KPI

Sáu chỉ số từ `GET /stats`, tính trên **đúng tập đang lọc**. Endpoint đã có
nên gần như miễn phí, và đây chính là cách nhìn bằng mắt thấy được rằng lọc
không làm sai KPI.

---

## 3. Thời gian — chỗ dễ sai nhất

Spec mẹ §8.3 buộc: gửi lên ISO-8601 kèm offset, hiển thị bằng timezone của
**account**, không bao giờ dùng giờ máy. Nhưng `<input type="datetime-local">`
chỉ cho chuỗi giờ treo tường không mang múi giờ nào.

### 3.1 Dùng dayjs

`Temporal` chưa có trong Node 22 (đã kiểm: `typeof globalThis.Temporal` ra
`undefined`), nên phép đổi này phải làm tay hoặc mượn thư viện. Chọn **dayjs**
+ plugin `utc` và `timezone`: 11,6 KB minified cho cả ba, ≈4 KB gzip.

### 3.2 `src/lib/datetime.ts` — hợp đồng

Chỉ file này được import dayjs. Không component nào import trực tiếp.

```ts
/** "YYYY-MM-DDTHH:mm" — giá trị mặc định cho input[type=datetime-local]. */
export function nowInZone(tz: string): string;

/** Giờ treo tường trong tz -> chuỗi ISO instant để gửi lên backend. */
export function wallToInstant(wall: string, tz: string): string;

/** Instant từ API -> "DD/MM/YYYY HH:mm" theo tz. */
export function formatInstant(iso: string, tz: string): string;

/** Instant từ API -> "YYYY-MM-DDTHH:mm" theo tz, để nạp lại vào form sửa. */
export function instantToWall(iso: string, tz: string): string;
```

Bọc một tầng vì hai lẽ độc lập: mọi lời gọi **buộc** phải truyền `tz` (quên là
lỗi biên dịch, chứ không phải âm thầm rơi về giờ máy), và ngày nào `Temporal`
phổ cập thì chỉ thay ruột một file.

`wallToInstant` trả `dayjs.tz(wall, tz).toISOString()` — hậu tố `Z`, vẫn là
ISO-8601 có offset hợp lệ. Backend lưu UTC nên instant mới là thứ mang nghĩa;
không cần dựng chuỗi `+07:00` bằng tay.

### 3.3 Giờ không tồn tại — hành vi đã đo, không phải giả định

Đã chạy dayjs 1.11.23 qua sáu ca và so với bản tự viết bằng `Intl`:

| giờ treo tường | zone | dayjs | ghi chú |
|---|---|---|---|
| `2026-06-09T21:30` | Asia/Ho_Chi_Minh | `14:30Z` | khớp |
| `2026-01-15T08:00` | America/New_York | `13:00Z` | EST, khớp |
| `2026-07-15T08:00` | America/New_York | `12:00Z` | EDT, khớp |
| `2026-03-08T02:30` | America/New_York | `07:30Z` | **lệch** — xem dưới |
| `2026-11-01T01:30` | America/New_York | `05:30Z` | giờ lặp lại, khớp |
| `2026-06-09T21:30` | Australia/Adelaide | `12:00Z` | offset +09:30, khớp |

Ca lệch duy nhất là giờ **không tồn tại**: 2026-03-08 lúc 02:30 ở New York
không có thật, đồng hồ nhảy thẳng 02:00 → 03:00. dayjs dịch **tới** (03:30
EDT), bản `Intl` dịch **lùi** (01:30 EST). Không bên nào sai. dayjs theo đúng
quy ước `compatible` của Temporal và `java.time`, nên là lựa chọn tốt hơn.

Đây là **hành vi đã chốt**, có test ghim. Với `Asia/Ho_Chi_Minh` chuyện này
không bao giờ xảy ra — Việt Nam bỏ DST từ 1975.

### 3.4 Bộ lọc ngày không đổi gì cả

`from`/`to` dùng `input[type=date]`, cho ra `YYYY-MM-DD` — đúng thứ backend so
với trường `day` vốn đã tính theo timezone account. Không có phép đổi múi giờ
nào ở đây, và **không được thêm vào**: đổi `from` thành instant rồi cắt lại
ngày là con đường ngắn nhất để lệch một ngày ở rìa.

---

## 4. Kiến trúc file

```
src/features/trades/
  types.ts             Trade · DeletedTrade · TradePage · TradeCreate
                       · TradePatch · Stats
  filters.ts           TradeFilter ⇄ URLSearchParams — thuần, test không render
  hooks.ts             useTrades · useStats · useTrash · useCreateTrade
                       · useUpdateTrade · useDeleteTrade · useRestoreTrade
  TradesPage.tsx       ghép StatsStrip + FilterBar + TradeTable + phân trang
  FilterBar.tsx        7 ô lọc
  TradeTable.tsx       11 cột + dòng chi tiết
  TradeFormDialog.tsx  form 16 trường, 3 nhóm
  StatsStrip.tsx       6 chỉ số
  TrashPage.tsx        thùng rác + khôi phục

src/lib/datetime.ts    4 hàm ở §3.2 — chỗ duy nhất import dayjs
src/components/ui/     thêm select.tsx · textarea.tsx · badge.tsx
```

**Sửa file có sẵn:**

| file | sửa gì |
|---|---|
| `src/lib/queryKeys.ts` | thêm key trades/stats/trash |
| `src/app/router.tsx` | thêm `/trades`, `/trades/trash` |
| `src/app/AppShell.tsx` | thêm NavLink "Nhật ký lệnh" |
| `src/test/setup.ts` | 4 polyfill cho Radix Select |
| `src/test/styleguard.test.ts` | cổng cấm chép cứng chuỗi enum |
| `src/components/AccountSwitcher.tsx` | `<select>` → `Select` |
| `src/features/accounts/CashFlowPanel.tsx` | ô loại → `Select` |
| `src/features/accounts/cashflowHooks.ts` | invalidate thêm `stats` |

---

## 5. Kiểu dữ liệu

Mọi trường tiền là **chuỗi**. Backend marshal `decimal.Decimal` ra chuỗi JSON
chính vì float làm mất chữ số; khai `number` ở đây là ném đi điều đó ngay tại
ranh giới. Các trường **không phải tiền** (`stt`, `win_loss`, `win_sign`,
`score_*`, `page`, `size`, `total`) là `number` bình thường.

```ts
export type Trade = {
  id: number; account_id: number; stt: number;
  entered_at: string;                        // ISO UTC

  symbol: string; direction: string;
  entry: string | null; exit: string | null; volume: string | null;
  profit: string; profit_theory: string | null; fee: string;

  setup: string; timeframe: string;
  entry_quality: string; in_trade_quality: string;
  exit_quality: string; psychology: string; notes: string;

  net: string; win_loss: number; win_sign: number;

  score_entry: number; score_in_trade: number;
  score_exit: number; score_psych: number;
  score_total: number | null;                // null = chưa đánh giá
  trade_class: string;

  day: string; week: string; week_sort: string;
  month: string; weekday: string;

  cum_by_trade: string; cum_by_day: string; cum_theory: string;
  running_peak: string; drawdown: string;
};

/** Lệnh trong thùng rác — CHỈ trường input, không có trường suy diễn. */
export type DeletedTrade = {
  id: number; account_id: number; stt: number; entered_at: string;
  symbol: string; direction: string;
  profit: string; fee: string; setup: string; notes: string;
};

export type TradePage = {
  items: Trade[]; page: number; size: number; total: number;
};

export type TradeCreate = {
  entered_at: string;
  symbol: string; direction: string;
  entry: string | null; exit: string | null; volume: string | null;
  profit: string; profit_theory: string | null; fee: string;
  setup: string; timeframe: string;
  entry_quality: string; in_trade_quality: string;
  exit_quality: string; psychology: string; notes: string;
};

export type TradePatch = Partial<TradeCreate>;
```

`Partial<TradeCreate>` ánh xạ **1-1** vào `service.Tri[T]` của backend, và đó
không phải tình cờ:

| phía TS | JSON đi ra | backend đọc |
|---|---|---|
| khoá vắng (hoặc `undefined`, bị `JSON.stringify` bỏ) | không có khoá | `Set=false` — không đổi |
| `entry: null` | `"entry": null` | `Set=true, Value=nil` — xoá giá trị |
| `entry: "2048.5"` | `"entry": "2048.5"` | `Set=true, Value=&v` — đặt giá trị |

`Stats` ánh xạ 1-1 từ `statsDTO`: tiền là chuỗi, các trường con trỏ của Go
(`net_return_pct`, `profit_factor`, `win_pct`, `ave_win`, `ave_loss`,
`biggest_winner`, `biggest_loser`, `biggest_r_win`, `biggest_r_loss`,
`rr_actual`, `expectancy`, `max_dd_pct`, `recovery_factor`) là
`string | null`. **`null` không được hiển thị thành `0`**: chưa có lệnh thua
thì `profit_factor` là "không tính được", còn số 0 đọc ra là "thua sạch".

---

## 6. Bộ lọc

```ts
export type TradeFilter = {
  from: string; to: string; setup: string; symbol: string;
  timeframe: string; direction: string; trade_class: string;
};

export const EMPTY_FILTER: TradeFilter;
export function readFilter(sp: URLSearchParams): TradeFilter;
export function readPage(sp: URLSearchParams): number;
export function writeParams(f: TradeFilter, page: number): URLSearchParams;
export function toQuery(f: TradeFilter, page: number): string;
```

`writeParams` **bỏ hẳn** khoá rỗng và bỏ `page` khi bằng 1, để URL không phình
ra một chuỗi tham số rỗng khi người dùng chưa lọc gì.

`readPage` chỉ nhận chuỗi toàn chữ số, sai thì về 1 — không dùng `parseInt`,
theo đúng lối `readActiveAccountId` đã có.

Ba ô là dropdown lấy từ `/meta/enums`: `timeframe`, `direction`, `trade_class`.
Hai ô `setup` và `symbol` là text tự do — setup do người dùng tự đặt tên,
symbol là chuỗi tự do, backend không có danh sách hợp lệ cho cả hai.

---

## 7. Bảng

**11 cột:** STT · Thời điểm · Mã · Chiều · Lãi/lỗ · Phí · Net · Lũy kế ·
Điểm · Phân loại · nút bung.

Backend đã trả mới nhất trước (`paginate` đảo dãy). **Không sắp xếp phía
client** — sắp lại một trang đang phân trang chỉ sắp được 50 dòng đang thấy,
kết quả trông như đã sắp toàn bộ mà không phải.

**Dòng chi tiết** bày phần còn lại: giá vào/ra, khối lượng, lãi lý thuyết,
setup, khung thời gian, bốn trục đánh giá kèm điểm từng trục, tuần/tháng/thứ,
`cum_by_day`, `cum_theory`, `running_peak`, `drawdown`, ghi chú, và hai nút
Sửa / Xoá.

**Quy ước hiển thị:**

- Lãi/lỗ tô màu theo dấu của `net`, so bằng `compareDecimal(net, "0")` —
  `> 0` dùng `--primary`, `< 0` dùng `--status-error`, `= 0` dùng
  `--text-muted`. Kèm dấu `+`/`−` chứ không chỉ dựa vào màu.
- `score_total === null` hiện `—`, **không** hiện `0`.
- `trade_class` hiện bằng `Badge`.
- Mọi con số đi qua `MoneyText` (mono + `tabular-nums`).

**Phân trang:** Trước / Sau + "trang X / Y", `size` cố định 50 (đúng
`DefaultPageSize` của backend). Số trang tính từ `total` và `size` trả về.

---

## 8. Form 16 trường

Ba nhóm, hai cột:

| nhóm | trường |
|---|---|
| LỆNH | `entered_at`, `symbol`, `direction`, `timeframe`, `setup` |
| TIỀN | `entry`, `exit`, `volume`, `profit`, `profit_theory`, `fee` |
| ĐÁNH GIÁ | `entry_quality`, `in_trade_quality`, `exit_quality`, `psychology`, `notes` |

`account_code` không có mặt: nó suy ra từ account đang chọn. `stt` cũng không
— backend cấp (CLAUDE.md quy tắc 7).

**Mặc định khi thêm mới:** `entered_at` = `nowInZone(account.timezone)`,
`fee` = `"0"`, `direction` = `directions[0]`, năm trường đánh giá để **rỗng**
(lệnh chưa đánh giá là trạng thái hợp lệ).

**Validation phải soi gương `validateTradeInput` của backend, không nghiêm
hơn:**

- `entered_at` bắt buộc.
- `symbol` trim rồi phải khác rỗng.
- `direction` phải thuộc `directions`.
- `timeframe` và bốn trục đánh giá: rỗng **hoặc** thuộc danh sách. Rỗng là
  hợp lệ — CHECK của migration có chuỗi rỗng trong danh sách.
- `setup` rỗng thì gửi rỗng; backend đổi thành `KHÔNG CÓ SETUP`.
- Trường tiền: khớp `/^-?\d*\.?\d+$/`. `profit` và `fee` bắt buộc;
  `entry`, `exit`, `volume`, `profit_theory` rỗng thì gửi `null`.
- **Không** cấm `fee` âm hay `profit` âm — backend không cấm, và FE bịa thêm
  ràng buộc là tạo ra một luật không ai biết mà cũng không ai kiểm được.

**Danh sách enum lấy từ `useMetaEnums()`.** Không chép cứng chuỗi tiếng Việt
vào FE — chúng là key chấm điểm (CLAUDE.md quy tắc 5), lệch một ký tự là lệch
kết quả của toàn bộ lịch sử. Có cổng styleguard canh, xem §11.

**Khi sửa:** chỉ gửi trường trong `dirtyFields`, đúng lối `AccountFormDialog`.

Ô bị xoá trắng gửi gì thì tuỳ nhóm — `patchToFields` của backend chia `null`
thành **ba** hành vi khác nhau, không phải một:

| nhóm | trường | ô rỗng thì FE gửi | backend làm gì |
|---|---|---|---|
| bắt buộc | `entered_at`, `symbol`, `direction`, `profit`, `fee` | **không bao giờ rỗng** — zod chặn trước khi submit | `null` ở đây là 400 |
| về mặc định | `setup`, `notes`, 5 trường enum | `""` | `setup` thành `KHÔNG CÓ SETUP`, còn lại thành `""` |
| xoá thật | `entry`, `exit`, `volume`, `profit_theory` | `null` | cột thành NULL trong DB |

Nhóm giữa gửi `""` chứ không gửi `null`, dù backend quy `null` về rỗng y hệt:
gửi đúng thứ mình muốn nói thì không phải dựa vào một phép quy đổi ở đầu kia,
và ngày nào phép quy đổi đó đổi ý thì FE không sai theo.

Kiểu TypeScript tự canh nhóm đầu: `TradeCreate` khai `symbol: string` chứ
không phải `string | null`, nên `Partial<TradeCreate>` không cho gán
`symbol: null` — sai này là lỗi biên dịch, không phải lỗi lúc chạy.

---

## 9. Thùng rác

`/trades/trash` bày `DeletedTrade` — mười trường input, **không có trường suy
diễn nào**. Lệnh đã xoá không nằm trong dãy lũy kế nên `cum_by_trade` hay
`drawdown` của nó không có nghĩa; hiện số 0 sẽ trông như một con số thật.

Mỗi dòng có nút Khôi phục. Xoá thì hỏi lại qua `Dialog` (giống xoá cash flow);
khôi phục thì không hỏi — nó là thao tác hoàn tác.

Vào từ liên kết "Thùng rác" trên đầu trang `/trades`, không phải từ sidebar.

---

## 10. Query key và invalidate — chỗ dễ sai thứ hai

```ts
trades:    (id, f, page) => ["accounts", id, "trades", { ...f, page }],
tradesAll: (id)          => ["accounts", id, "trades"],
stats:     (id, f)       => ["accounts", id, "stats", f],
statsAll:  (id)          => ["accounts", id, "stats"],
trash:     (id)          => ["accounts", id, "trash"],
```

Sau **mọi** mutation lệnh (tạo, sửa, xoá, khôi phục), invalidate cả ba nhánh
`tradesAll`, `statsAll`, `trash`.

Lý do là quy tắc 8 của CLAUDE.md: lũy kế tính trên **toàn bộ** dãy lệnh của
account theo thứ tự `stt`. Sửa một lệnh cũ làm `cum_by_trade`, `cum_by_day`,
`cum_theory`, `running_peak` và `drawdown` của **mọi lệnh sau nó** đổi theo.
Vá riêng dòng vừa sửa vào cache bằng `setQueryData` sẽ để các dòng khác mang
số cũ — không có lỗi nào bật ra, chỉ có những con số sai trông rất bình thường.

Thêm cash flow cũng phải invalidate `statsAll`: `current_balance` của KPI cộng
cả nạp/rút. Đây là lý do `cashflowHooks.ts` nằm trong danh sách sửa ở §4.

---

## 11. Component UI

**Thêm ba component** vào `src/components/ui/`, viết theo style `new-york`
khai trong `components.json`, không dùng `shadow-*` (theme tắt hết shadow,
cổng styleguard bắt): `select.tsx`, `textarea.tsx`, `badge.tsx`.

**Đổi hai chỗ `<select>` thô sang `Select`:** `AccountSwitcher` và ô loại
nạp/rút trong `CashFlowPanel`. Test của chúng đổi từ `selectOptions()` sang
`click trigger → click option`.

**Một ngoại lệ có ghi lý do:** ô múi giờ trong `AccountFormDialog` **giữ
`<select>` native**. `Intl.supportedValuesOf("timeZone")` trả về **417** mục;
Radix Select dựng cả 417 node mỗi lần mở, còn `<select>` native thì trình
duyệt lo. Phải có comment nói rõ đây là ngoại lệ có chủ ý, để người sau không
tưởng là bỏ sót.

**Bốn polyfill trong `src/test/setup.ts`** — Radix Select không chạy dưới
jsdom nếu thiếu:

```ts
HTMLElement.prototype.hasPointerCapture
HTMLElement.prototype.setPointerCapture
HTMLElement.prototype.releasePointerCapture
HTMLElement.prototype.scrollIntoView
```

Đã kiểm cả hai chiều: không có polyfill thì `findByRole("option")` hỏng với
"Unable to find role=option"; có polyfill thì mở → chọn → giá trị cập nhật
chạy trọn.

**Cổng styleguard mới:** đọc `backend/internal/domain/enums.go` (qua `tuRepo`
đã có trong `src/test/paths.ts`), lấy mọi chuỗi hằng **có ký tự ngoài ASCII**,
và cấm chúng xuất hiện trong `src/features`, `src/components`, `src/app`,
`src/lib`. Chép `"SỢ BỎ LỠ (FOMO)"` vào form là đỏ ngay.

Giới hạn đã biết của cổng này, nói thẳng ra: nó **không** bắt được `"Long"`,
`"Short"`, `"M15"` vì chúng thuần ASCII và sẽ đụng false positive với comment
và mã thường. Chúng vẫn phải lấy từ `/meta/enums`, nhưng chỗ đó do người
review canh, không có máy canh.

Không thêm `alert`, `skeleton`, `toast`: chỗ báo lỗi hiện tại là
`<p role="alert">`, đã có test, đang chạy đúng.

---

## 12. Lỗi và trạng thái rỗng

- `ApiError` → thông điệp inline `role="alert"`, đúng lối `AccountFormDialog`.
- 401 thì `api.ts` đã tự xoay token hoặc đá ra login; trang trade không biết.
- **Không có route nào mở một lệnh theo id**, nên không có chỗ nào ăn 403/404
  của `/trades/:id`: chi tiết lệnh bung ngay trong bảng từ dữ liệu đã tải, và
  mọi request đều đi theo account đang chọn. Lỗi của các request đó hiện qua
  cùng một khối `role="alert"` ở đầu danh sách. Nếu Phase sau thêm deep-link
  tới một lệnh thì lúc đó mới cần màn hình 403/404 riêng.
- **Chưa có account nào** → `/trades` chỉ đường sang `/accounts`, **không**
  gọi API với id rỗng.
- Account có nhưng chưa có lệnh nào → mời thêm lệnh đầu tiên, dải KPI vẫn hiện
  với các số 0 và `null` đúng nghĩa của tập rỗng.

---

## 13. Testing

Vitest + MSW cho hành vi, unit thuần cho hai module không cần DOM, Playwright
cho lớp mà MSW mù.

| tầng | nội dung |
|---|---|
| thuần | `datetime.ts` — 6 ca timezone ở §3.3; `filters.ts` — vòng URL ⇄ filter |
| component | bảng dựng đúng trường suy diễn; `null` ra `—`; màu theo dấu net |
| tích hợp (MSW) | lọc ghi vào URL và refetch đúng query string; form validate; PATCH chỉ gửi trường đã đổi; vòng xoá → thùng rác → khôi phục; KPI đổi theo bộ lọc |
| styleguard | cổng enum §11; cổng tiền-không-qua-Number đã có tự bao luôn file mới |
| e2e | nối tiếp `frontend/e2e/auth.spec.ts` trên stack Docker thật |

E2E làm phần MSW không làm được: nhập một lệnh thật, kiểm `cum_by_trade` do
backend tính, lọc, xoá, khôi phục, và F5 giữa chừng để chắc bộ lọc trên URL
sống sót.

**Nối vào `auth.spec.ts` chứ không mở file `trades.spec.ts` riêng.** Ứng dụng
chỉ cho đăng ký user **đầu tiên**, và `playwright.config.ts` chạy `workers: 1`.
Một file thứ hai sẽ chỉ đăng nhập được nhờ user do `auth.spec.ts` tạo ra, tức
là một phụ thuộc ngầm giữa hai file chỉ đúng nhờ thứ tự chữ cái — đúng cái bẫy
mà docblock của `auth.spec.ts` đã cảnh báo khi giải thích vì sao nó gộp một
file. Chạy riêng `trades.spec.ts` trên DB sạch sẽ đỏ ở bước đăng nhập.

### Mười một bất biến sẽ falsify

Mỗi dòng phải phá thật rồi chứng minh test đỏ, không được chỉ khẳng định.

| # | bất biến | đột biến để phá |
|---|---|---|
| 1 | mutation invalidate cả ba nhánh | đổi sang `setQueryData` vá một dòng |
| 2 | `entered_at` đổi theo tz **account** | `dayjs(wall)` — giờ máy |
| 3 | hiển thị theo tz account | bỏ `.tz(tz)` |
| 4 | giờ không tồn tại dịch **tới** | ghim mong đợi sang bản dịch lùi |
| 5 | bộ lọc nằm trên URL | đổi sang `useState` |
| 6 | PATCH chỉ gửi trường đã đổi | gửi cả bảng |
| 7 | `score_total: null` ra `—` | `?? 0` |
| 8 | lãi/lỗ so bằng `compareDecimal` | so bằng ép số |
| 9 | enum lấy từ `/meta/enums` | chép cứng chuỗi vào form |
| 10 | thùng rác không bịa trường suy diễn | render `cum_by_trade` của lệnh đã xoá |
| 11 | 4 polyfill Radix trong `setup.ts` | gỡ một dòng |

### Cổng phải xanh trước khi báo xong

`make lint` · `make test-pure` · `make test` · `make test-fe` · `make e2e`,
cộng `git diff main -- backend/` rỗng.

---

## 14. Rủi ro đã biết

- `make e2e` mở cùng cổng 5432/8000/8080 với stack dev; chạy đè lên `make up`
  sẽ lỗi bind khó hiểu. Chưa sửa trong phase này.
- dayjs là CJS, không có trường `module`. Vite pre-bundle được, nhưng task đầu
  tiên của plan phải chạy một test thật để xác nhận thay vì tin.
