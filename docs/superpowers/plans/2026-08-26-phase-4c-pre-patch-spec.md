# Phase 4c-pre — Đồng bộ spec với file Excel gốc: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa `trading-journal-plan.md` cho khớp file Excel gốc theo biên bản audit, và thêm regression test cho đúng những chỗ code thật sự lệch — để mọi plan sau (4c, 5) đứng trên nguồn sự thật đúng.

**Architecture:** Đây là plan **spec-first**: phần lớn công việc là sửa tài liệu, không đụng code. Trước khi sửa mỗi mục, đã đối chiếu ngược với `backend/internal/` — kết quả là **đa số mục audit lo thừa, code đã đúng**. Những mục đó chỉ cần sửa tài liệu + thêm test khoá hành vi lại (characterization test) để không ai "sửa ngược" theo bản spec cũ. Chỉ có **một** thay đổi chạm API contract (S1, `win_sign`), và nó là đổi tên thuần tuý, không đổi giá trị.

**Tech Stack:** Go 1.23 (`decimal.Decimal`, table-driven test), Markdown. Không đụng frontend trừ Task 6.

**Spec:** `docs/superpowers/specs/2026-08-23-xlsb-audit-gap-report.md` (biên bản audit `.xlsb`) và `trading-journal-plan.md` (đối tượng bị sửa).

## Global Constraints

- Tiền là `decimal.Decimal`, không bao giờ `float64`. DB dùng `NUMERIC`.
- `internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần — cấm import GORM, `net/http`, `database/sql`, `context`.
- Chuỗi enum tiếng Việt là key chấm điểm — copy nguyên văn, không sửa.
- Mỗi thay đổi hành vi phải có test fail trên code cũ, pass trên code mới.
- Cổng phải xanh trước khi báo xong: `make test` (Go) · `cd frontend && npx tsc --noEmit && npm run build && npm test -- --run` (FE).
- **KHÔNG commit.** Plan này cố ý không có step commit — chủ repo tự review và commit.

## Quyết định đã chốt (từ §5 của audit)

Bốn câu hỏi mở đã được chủ sản phẩm chốt, plan này ghi lại để mọi task tham chiếu:

| # | Quyết định | Hệ quả trong plan |
|---|---|---|
| **Q2** | Giữ enum `Long/Short`; import CSV nhận cả `BUY/SELL` rồi chuẩn hoá | Task 5 — chỉ ghi vào spec, code mapping thuộc Phase 5 |
| **Q3** | Hai tile số dư & nạp/rút **thoát khỏi bộ lọc** (như Excel) | Task 7 — ghi ngoại lệ vào quy tắc 8 của `CLAUDE.md` |
| **Q4** | Chuỗi lý thuyết-vs-thực tế **không rebase**, giữ quy tắc 8 | Task 7 — ghi rõ đây là cố ý lệch Excel |
| **Q10** | `week` theo **ISO-8601** | Đã quyết từ trước và **đã code** ([derived.go:44](../../../backend/internal/metrics/derived.go#L44)); Task 5 chỉ đóng lại câu hỏi mở §10.1 |

## Kết quả đối chiếu ngược code (đọc trước khi làm)

Audit §0 tự ghi "chưa đối chiếu với code trong `backend/internal/`". Plan này đã đối chiếu. Bảng dưới là lý do vì sao nhiều mục audit **không** sinh ra thay đổi code:

| Mã | Audit nói | Code thật | Việc phải làm |
|---|---|---|---|
| S1 | `AG` là streak lũy tiến, không phải `win_sign` | `WinSign` là helper ±1 **đúng như spec cũ**, và streak lũy tiến nằm riêng ở `aggregate.Streaks`. Hai khái niệm bị Excel gộp vào một cột, code đã tách đúng. | Sửa spec + đổi tên field API (Task 1, 6) |
| S2 | Excel mâu thuẫn ở `net = 0`; chốt `net >= 0` là win | `WinSign` trả `1` khi `net = 0` ([derived.go:29](../../../backend/internal/metrics/derived.go#L29)) → **đã đúng bản BT**. Có test tại [streak_test.go:69](../../../backend/internal/aggregate/streak_test.go#L69). | Chỉ ghi chú vào spec (Task 1) |
| S3 | Direction thật là `BUY/SELL` | Code dùng `Long/Short`. Q2 đã chốt giữ nguyên. | Ghi mapping vào spec (Task 5) |
| S4 | Nhánh `""` của `Z7` là dead code; Excel cho `score_total = 0` | Code trả `null` khi cả 4 field rỗng — **cố ý lệch Excel**, đúng khuyến nghị audit. | Viết lại câu dẫn spec (Task 2) |
| S5 | Excel chặn theo `entry_quality`, bỏ sót lệnh 0 điểm | `Classify` chỉ nhìn `total` ([scoring.go:70](../../../backend/internal/scoring/scoring.go#L70)) → **không có bug của Excel**. Test đã có tại [scoring_test.go:122](../../../backend/internal/scoring/scoring_test.go#L122). | Chỉ ghi chú vào spec (Task 2) |
| S6 | `cum_by_day` của Excel không cô lập account | `Enrich(trades, acc)` nhận **một** account → rò rỉ chéo là bất khả thi về mặt cấu trúc. | Ghi chú + test khoá cấu trúc (Task 3) |
| T9 | Bốn cột derived AJ/AK/AM/AN thiếu khỏi §0 | Không có trong code (chưa cần đến Phase 4c). | Bổ sung §0 + quy ước dấu (Task 4) |
| C1 | `net = 0` bị đếm 2 lần ở bucket R | `rdist.go` dùng khoảng nửa mở `lo <= r < hi` → **đã đúng**, có comment giải thích. | Ghi luật bin vào spec (Task 4) |
| C2 | Nhóm rỗng `(blank)` | Chưa xác minh — Task 4 ghi vào spec, code thuộc Phase 4c |
| C3 | Top 6 áp cho cả timeframe | Chưa xác minh — Task 4 ghi vào spec, code thuộc Phase 4c |
| C4 | Chart R là 1 series, không phải 2 | `RBucket` có cả `Wins` và `Losses` → FE tự tô màu từng cột được. Không phải sửa. | Ghi chú vào spec (Task 4) |

**Tóm lại:** chỉ **S1** sinh ra thay đổi code thật (đổi tên `win_sign` → `streak_sign` cho hết mập mờ). Mọi mục còn lại là sửa tài liệu + test khoá hành vi.

## Bản đồ file

| File | Trách nhiệm | Task |
|---|---|---|
| `trading-journal-plan.md` §0, §3.2, §5.1, §6 | Bỏ khái niệm `win_sign` sai, ghi rõ Excel tự mâu thuẫn | 1 |
| `trading-journal-plan.md` §2.5, §2.6 | Viết lại lý do trả `null`, ghi bug `U7` của Excel | 2 |
| `trading-journal-plan.md` §3.5, §6 | Ghi bug `AF7` của Excel | 3 |
| `trading-journal-plan.md` §0, §5.9 | Bổ sung AJ/AK/AM/AN, luật bin R, `(blank)`, top-6 | 4 |
| `trading-journal-plan.md` §1, §10 | Direction mapping, đóng 4 câu hỏi mở | 5 |
| `backend/internal/metrics/{derived,enrich}.go` + `httpapi/trade_dto.go` | Đổi tên `WinSign` → `StreakSign` | 6 |
| `frontend/src/**` | Cập nhật field `win_sign` nếu FE có đọc | 6 |
| `CLAUDE.md` quy tắc 8 | Ghi hai ngoại lệ Q3/Q4 | 7 |

---

### Task 1: S1 + S2 — bỏ `win_sign` sai khỏi spec, ghi rõ Excel tự mâu thuẫn

**Files:**
- Modify: `trading-journal-plan.md` §0 (dòng ~45), §3.2 (dòng ~181), §5.1 (dòng ~277-286), §6 (dòng ~295)

**Interfaces:**
- Consumes: không có.
- Produces: thuật ngữ `streak_sign` (dấu ±1 của một lệnh, dùng để dựng streak) thay cho `win_sign`. Task 6 đổi tên code theo đúng thuật ngữ này.

Bối cảnh: Excel gộp hai khái niệm vào cột `AG` — công thức `AG8` là streak **lũy tiến** (`1, −1, 1, 2`), trong khi spec hiện tại mô tả nó là dấu ±1 của từng lệnh. Code đã tách đúng thành hai thứ (`metrics.WinSign` = dấu, `aggregate.Streaks` = lũy tiến), nên **không phải sửa logic** — chỉ sửa cái tên và cái bảng map cho hết mập mờ.

- [ ] **Step 1: Sửa bảng map §0 — dòng cột AG**

Trong `trading-journal-plan.md`, tìm dòng:

```
| AG | Win | `win_sign` | **derived** |
```

Thay bằng:

```
| AG | Win | `streak` | **derived** — xem §5.1 |
```

- [ ] **Step 2: Sửa §3.2 — chú thích `net = 0`**

Tìm dòng (khoảng dòng 181):

```
> Chú ý: `net = 0` được tính là **1 (không thua)**. `win_sign` (AG) thì: `1 if net >= 0 else -1`.
```

Thay bằng:

```
> Chú ý: `net = 0` được tính là **1 (không thua)**.
>
> Cột `AG` của Excel **không phải** dấu ±1 của từng lệnh — nó là streak lũy tiến,
> xem §5.1. Web tách riêng hai khái niệm: `streak_sign` (dấu ±1 của một lệnh,
> `1 if net >= 0 else -1`) là bước trung gian để dựng streak, không phải một cột
> của Excel.
```

- [ ] **Step 3: Sửa §5.1 — ghi rõ Excel tự mâu thuẫn tại `net = 0`**

Tìm khối §5.1 "Chuỗi thắng/thua liên tiếp (Excel BT)". Thay `win_sign=1` trong dòng đầu bằng `streak_sign=1`, rồi **thêm** khối chú thích này ngay sau code block đóng:

```markdown
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
```

- [ ] **Step 4: Sửa §6 — edge case `net = 0`**

Tìm dòng:

```
- **`net = 0`:** không tính vào `win_count` lẫn `loss_count`; `total_trades` bỏ qua; `win_loss = 1`, `win_sign = 1`.
```

Thay bằng:

```
- **`net = 0`:** không tính vào `win_count` lẫn `loss_count`; `total_trades` bỏ qua; `win_loss = 1`, `streak_sign = 1` (tức **không làm đứt chuỗi thắng** — chốt theo `Master!BT`, xem §5.1).
```

- [ ] **Step 5: Xác nhận không còn `win_sign` sót trong spec**

```bash
grep -n "win_sign" trading-journal-plan.md
```

Expected: không có dòng nào in ra. Nếu còn, sửa nốt theo đúng nghĩa của ngữ cảnh (`streak_sign` cho dấu một lệnh, `streak` cho lũy tiến).

---

### Task 2: S4 + S5 — viết lại lý do trả `null`, ghi bug `U7` của Excel

**Files:**
- Modify: `trading-journal-plan.md` §2.5, §2.6

**Interfaces:**
- Consumes: không có.
- Produces: không có API mới. Task này chỉ sửa câu dẫn của spec.

Bối cảnh: code **đã đúng** cả hai mục. `scoring.Total` trả `nil` khi cả 4 field rỗng, `scoring.Classify` chỉ nhìn tổng điểm. Vấn đề là spec đang trình bày hai chỗ này như thể "copy từ Excel", trong khi thực tế chúng là **sửa lỗi có chủ ý**. Ai đọc spec rồi đi so với Excel sẽ tưởng code sai.

- [ ] **Step 1: Thêm khối chú thích vào §2.5 (`score_total`)**

Tìm mục §2.5 trong `trading-journal-plan.md`. Thêm khối này vào cuối mục:

```markdown
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
```

- [ ] **Step 2: Thêm khối chú thích vào §2.6 (`trade_class`)**

Tìm mục §2.6. Thêm khối này vào cuối mục:

```markdown
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
```

- [ ] **Step 3: Xác nhận test đã khoá hành vi §2.6**

Regression test cho bug (1) đã tồn tại. Xác nhận:

```bash
grep -n "domain.ClassRevenge" backend/internal/scoring/scoring_test.go
```

Expected: thấy ít nhất hai dòng, trong đó có case tổng điểm `0` → `ClassRevenge` (dòng ~122) và một case chấm đủ 4 field cho tổng thấp (dòng ~93). Nếu **không** thấy case tổng `0`, thêm vào bảng test của `TestClassify`:

```go
		{0, domain.ClassRevenge},
```

- [ ] **Step 4: Chạy test package thuần**

```bash
cd backend && go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/...
```

Expected: PASS, chạy dưới 1 giây, không cần Docker.

---

### Task 3: S6 — ghi bug `AF7` của Excel + test khoá cô lập account

**Files:**
- Modify: `trading-journal-plan.md` §3.5
- Test: `backend/internal/metrics/enrich_test.go`

**Interfaces:**
- Consumes: `metrics.Enrich(trades []domain.Trade, acc domain.Account) ([]Enriched, error)` — chữ ký đã có.
- Produces: không có API mới.

Bối cảnh: `Enrich` nhận **một** account nên rò rỉ chéo là bất khả thi về mặt cấu trúc. Nhưng đó là một bảo đảm ngầm của chữ ký hàm, không phải của một test — nếu sau này ai đó đổi `Enrich` thành nhận nhiều account, bug của Excel sẽ tái sinh mà không có gì bắt lại. Task này ghi bug vào spec và đóng đinh bảo đảm đó bằng test.

- [ ] **Step 1: Thêm chú thích vào §3.5 (`cum_by_day`)**

Tìm mục §3.5 trong `trading-journal-plan.md`. Thêm khối này vào cuối mục:

```markdown
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
```

- [ ] **Step 2: Viết test khoá cô lập account**

Thêm vào `backend/internal/metrics/enrich_test.go`. Test này khoá lại **chữ ký** như một bảo đảm, chứ không chỉ khoá giá trị — nó dựng đúng kịch bản làm Excel sai (hai account, cùng một ngày, giá trị khác hẳn nhau) và xác nhận số của account này không dính gì tới account kia:

```go
// TestEnrichCumByDayKhongRoRiChoAccount dựng lại đúng kịch bản làm công thức
// AF7 của Excel sai: hai account giao dịch CÙNG một ngày. Excel match theo mỗi
// Day nên account sau đè lên account trước; web cô lập nhờ Enrich chỉ nhận một
// account. Test giữ cho bảo đảm đó không bị đánh mất khi ai đó sửa chữ ký.
func TestEnrichCumByDayKhongRoRiChoAccount(t *testing.T) {
	ngay := time.Date(2026, 6, 8, 5, 0, 0, 0, time.UTC) // 12:00 giờ VN

	accA := domain.Account{Timezone: "Asia/Ho_Chi_Minh"}
	accB := domain.Account{Timezone: "Asia/Ho_Chi_Minh"}

	lenhA := []domain.Trade{
		{STT: 1, EnteredAt: ngay, Profit: decimal.NewFromInt(100), Fee: decimal.Zero},
	}
	lenhB := []domain.Trade{
		{STT: 1, EnteredAt: ngay, Profit: decimal.NewFromInt(999), Fee: decimal.Zero},
	}

	gotA, err := metrics.Enrich(lenhA, accA)
	require.NoError(t, err)
	gotB, err := metrics.Enrich(lenhB, accB)
	require.NoError(t, err)

	require.True(t, gotA[0].CumByDay.Equal(decimal.NewFromInt(100)),
		"cum_by_day của account A phải là 100, không dính 999 của account B; được %s",
		gotA[0].CumByDay)
	require.True(t, gotB[0].CumByDay.Equal(decimal.NewFromInt(999)),
		"cum_by_day của account B phải là 999; được %s", gotB[0].CumByDay)
}
```

- [ ] **Step 3: Chạy test**

```bash
cd backend && go test ./internal/metrics/... -run TestEnrichCumByDayKhongRoRiChoAccount -v
```

Expected: PASS.

Nếu FAIL vì tên field không khớp (ví dụ `EnteredAt` hay `STT` trong `domain.Trade` mang tên khác), mở `backend/internal/domain/models.go` đọc tên thật rồi sửa test cho khớp — **không** sửa `models.go`.

---

### Task 4: T9 + C1 + C2 + C3 + C4 — bổ sung cột derived và luật bin R

**Files:**
- Modify: `trading-journal-plan.md` §0 (bảng map), §5.9 (phân phối R), §5 (nhóm rỗng & top-6)

**Interfaces:**
- Consumes: không có.
- Produces: đặc tả cho `profit_positive` / `profit_negative` và quy ước dấu — Phase 4c sẽ code theo.

Bối cảnh: bốn cột derived (AJ/AK/AM/AN) nuôi hai biểu đồ mà spec §5 có nhắc, nhưng §0 không liệt kê và **quy ước dấu** thì không nói ở đâu cả. Excel vẽ cột đỏ bằng **giá trị dương** (`Master!DW = −(Sum of Profit âm)`) — nếu Phase 4c đoán sai chỗ này thì biểu đồ lộn ngược mà test vẫn xanh.

- [ ] **Step 1: Bổ sung 4 dòng vào bảng map §0**

Trong `trading-journal-plan.md` §0, tìm dòng `| AI | Running Peak | ...`. Thêm 4 dòng này ngay **trước** dòng `| AO | Drawdown | ...`:

```
| AJ | Profit dương cộng dồn theo ngày | `cum_profit_pos_day` | **derived** |
| AK | Profit âm cộng dồn theo ngày | `cum_profit_neg_day` | **derived** |
| AM | Profit dương | `profit_positive` | **derived** |
| AN | Profit âm | `profit_negative` | **derived** |
```

- [ ] **Step 2: Thêm mục định nghĩa 4 cột + quy ước dấu**

Thêm mục này vào §3 của `trading-journal-plan.md`, **ở cuối §3** (sau mục §3.x cuối cùng hiện có — `§3.6. cum_theory` đã bị chiếm, nên đánh số tiếp theo số lớn nhất đang có; kiểm tra bằng `grep -n "^### 3\." trading-journal-plan.md` rồi dùng số kế tiếp, ví dụ §3.9):

```markdown
### 3.N. Tách profit dương / âm (Excel AJ, AK, AM, AN)

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
```

- [ ] **Step 3: Ghi luật bin R vào §5.9**

Tìm mục 9 (Phân phối R) trong §5. Thêm khối này ngay sau danh sách bucket:

```markdown
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
```

- [ ] **Step 4: Ghi nhóm rỗng và giới hạn top-6 vào §5**

Thêm khối này vào **đầu** §5 (ngay sau câu mở đầu của mục, trước danh sách 12 nhóm):

```markdown
> **Hai quy ước áp cho mọi nhóm pivot:**
>
> 1. **Nhóm rỗng hiển thị thành `(blank)`.** Setup/Symbol/Timeframe bỏ trống vào
>    pivot thành một nhóm tên `(blank)` và **vẫn được vẽ** (fixture gốc:
>    setup `(blank)` = 350, win rate 0.75). Không ẩn, không gộp vào nhóm khác.
> 2. **Top 6 áp cho cả ba nhóm** — setup (`Master!AI2:AI7`), symbol (`AU2:AU7`)
>    **và timeframe** (`CV2:CV7`). Timeframe không phải ngoại lệ như bản spec
>    trước ghi.
>
> ⚠️ **Chưa chốt:** tiêu chí sắp xếp để chọn 6 dòng nằm trong cấu hình pivot,
> không xác minh được bằng dữ liệu mẫu (file chỉ còn 1–2 nhóm). Phase 4c phải
> chốt **`count` hay `sum_net`** trước khi code, và ghi lựa chọn ngay tại đây.
```

- [ ] **Step 5: Xác nhận code phân phối R khớp spec vừa viết**

```bash
cd backend && go test ./internal/aggregate/... -run TestRDistribution -v
```

Expected: PASS. Đọc lướt `backend/internal/aggregate/rdist.go` xác nhận ba điều spec vừa ghi: đủ 22 bucket, khoảng nửa mở `lo <= r < hi`, `oneR = 0` không xếp lệnh nào. Cả ba đã đúng — step này là đối chiếu, không phải sửa.

---

### Task 5: S3 + đóng các câu hỏi mở §10

**Files:**
- Modify: `trading-journal-plan.md` §1 (enum Direction), §10 (câu hỏi mở)

**Interfaces:**
- Consumes: quyết định Q2, Q10 ở đầu plan.
- Produces: đặc tả mapping direction cho Phase 5 import.

- [ ] **Step 1: Sửa enum Direction ở §1**

Tìm dòng trong §1:

```
**Direction:** `Long` | `Short` (Excel: cột "Long/ Short").
```

Thay bằng:

```
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
```

- [ ] **Step 2: Viết lại §10 — đóng 4 câu hỏi đã chốt**

Thay **toàn bộ** mục §10 bằng:

```markdown
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

### 10.1. Còn phải chốt trước Phase 4c

- **Top 6 chọn theo `count` hay `sum_net`?** (§5) — không xác minh được từ file.
- **Tile "LỆNH KHÔNG CÓ SETUP"**: nhãn Excel ghi "Bốc đồng + Trả thù + FOMO" nhưng
  công thức `Dashboard!V85` lại đếm lệnh no-setup → **nhãn của Excel sai**.
  Khuyến nghị: tách hai chỉ số riêng, `no_setup_count` và `impulsive_count`.
```

- [ ] **Step 3: Xác nhận spec không còn mâu thuẫn nội bộ**

```bash
grep -n "WEEKNUM\|BUY\|SELL\|win_sign" trading-journal-plan.md
```

Expected: mọi lần xuất hiện đều nằm **trong khối chú thích mô tả Excel**, không có chỗ nào còn ra lệnh cho web làm theo. Không còn `win_sign` (Task 1 đã dọn).

---

### Task 6: S1 — đổi tên `WinSign` → `StreakSign` trong code

**Files:**
- Modify: `backend/internal/metrics/derived.go:28-34`
- Modify: `backend/internal/metrics/enrich.go:24`, `:104`
- Modify: `backend/internal/httpapi/trade_dto.go:46`, `:97`
- Modify: `backend/internal/aggregate/streak.go:12`
- Test: `backend/internal/metrics/derived_test.go` (3 lần dùng `WinSign`)

> `backend/internal/aggregate/streak_test.go` **không** cần sửa: nó dựng
> `Enriched` qua `metrics.Enrich` chứ không gán field trực tiếp, nên không hề
> nhắc tên field. Nó vẫn phải xanh sau khi đổi tên — đó là phép thử tốt rằng
> đây đúng là đổi tên thuần tuý, không đổi giá trị.

**Interfaces:**
- Consumes: thuật ngữ `streak_sign` từ Task 1.
- Produces: field JSON `streak_sign` thay cho `win_sign` trong response của trade. **Đây là breaking change của API contract** — Step 4 xử lý phía FE.

Bối cảnh: đây là thay đổi code **duy nhất** của plan. Giá trị không đổi, chỉ đổi tên. Lý do đáng làm: cái tên `win_sign` đến từ bản spec sai, và nó dễ bị hiểu thành "cột AG của Excel" — đúng cái nhầm lẫn mà Task 1 vừa dọn khỏi tài liệu. Để tên cũ trong code thì tài liệu và code nói hai ngôn ngữ khác nhau.

- [ ] **Step 1: Sửa test trước để nó fail**

Trong `backend/internal/metrics/derived_test.go`, đổi cả 3 lần dùng `WinSign` thành `StreakSign`:

```bash
cd backend && sed -i '' 's/WinSign/StreakSign/g' internal/metrics/derived_test.go
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

```bash
cd backend && go test ./internal/metrics/... ./internal/aggregate/... 2>&1 | head -20
```

Expected: FAIL, compile error kiểu `undefined: metrics.StreakSign` hoặc `unknown field StreakSign in struct literal`.

- [ ] **Step 3: Đổi tên trong code thật**

```bash
cd backend && sed -i '' 's/WinSign/StreakSign/g' \
  internal/metrics/derived.go \
  internal/metrics/enrich.go \
  internal/aggregate/streak.go \
  internal/httpapi/trade_dto.go
```

Rồi sửa **tag JSON** và **comment** bằng tay — `sed` ở trên không đụng tới chúng.

Trong `backend/internal/httpapi/trade_dto.go`, đổi tag:

```go
	StreakSign int             `json:"streak_sign"`
```

Trong `backend/internal/metrics/derived.go`, viết lại comment cho khớp §5.1:

```go
// StreakSign trả 1 hoặc −1 cho một lệnh, là bước trung gian để dựng chuỗi
// thắng/thua ở aggregate.Streaks (§5.1). net = 0 trả 1 — không làm đứt chuỗi
// thắng, chốt theo bản Master!BT của Excel.
//
// Đây KHÔNG phải cột AG của Excel: AG là streak lũy tiến, không phải dấu ±1.
func StreakSign(net decimal.Decimal) int {
```

- [ ] **Step 4: Cập nhật frontend nếu có đọc field này**

```bash
cd frontend && grep -rn "win_sign\|winSign" src/ e2e/
```

Nếu **có** kết quả: đổi từng chỗ sang `streak_sign`/`streakSign`, kể cả trong type contract và fixture MSW.

Nếu **không** có kết quả: không phải làm gì — FE chưa dùng field này, và việc đổi tên không ảnh hưởng gì tới nó.

- [ ] **Step 5: Chạy toàn bộ cổng backend**

```bash
cd backend && go build ./... && make -C .. test
```

Expected: build sạch, toàn bộ package PASS.

Nếu còn chỗ nào sót `WinSign`:

```bash
cd backend && grep -rn "WinSign\|win_sign" internal/ cmd/
```

Expected: không có dòng nào.

- [ ] **Step 6: Chạy toàn bộ cổng frontend**

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test -- --run
```

Expected: `tsc` exit 0, build thành công, toàn bộ vitest PASS.

---

### Task 7: Q3 + Q4 — ghi hai ngoại lệ của quy tắc 8 vào `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (quy tắc 8)

**Interfaces:**
- Consumes: quyết định Q3, Q4 ở đầu plan.
- Produces: ràng buộc cho Phase 4c (tile số dư) và mọi plan sau chạm tới lũy kế.

Bối cảnh: quy tắc 8 hiện tại nói lũy kế luôn tính trên **toàn bộ** lệnh, KPI tính trên tập **đã lọc**. Q3 tạo ra một ngoại lệ thật (số dư thoát khỏi filter), Q4 thì **khẳng định lại** quy tắc (không rebase) — nhưng vì Excel làm ngược, phải ghi rõ để sau này không ai "sửa cho giống Excel".

- [ ] **Step 1: Thay quy tắc 8 trong `CLAUDE.md`**

Tìm dòng quy tắc 8 trong `CLAUDE.md`:

```
8. Lũy kế (`cum_*`, `running_peak`, `drawdown`, streak) luôn tính trên **toàn bộ** lệnh của
   account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI thì tính trên tập đã lọc.
```

Thay bằng:

```
8. Lũy kế (`cum_*`, `running_peak`, `drawdown`, streak) luôn tính trên **toàn bộ** lệnh của
   account theo thứ tự `stt`; filter chỉ lọc phần hiển thị. KPI thì tính trên tập đã lọc.

   Hai điểm đã chốt khi đối chiếu file Excel gốc:

   - **Ngoại lệ:** `current_balance` và tổng nạp/rút **không chịu bộ lọc** — luôn tính
     trên toàn bộ lệnh + toàn bộ cash flow của account. Số dư tài khoản không phụ thuộc
     vào việc người dùng đang xem tháng nào. (Excel làm giống vậy: `Dashboard!V3`/`S3`
     `VLOOKUP` thẳng vào `Settings`, không đi qua pivot.)
   - **Không phải ngoại lệ:** chuỗi lý thuyết-vs-thực tế **giữ nguyên quy tắc 8** — không
     rebase về 0 tại đầu khoảng lọc. Excel *có* rebase (`Master!BN6`/`BO6` trừ đi
     `$BL$4`/`$BL$5`); web cố ý làm khác cho nhất quán với `cum_by_trade` và đường equity.
```

- [ ] **Step 2: Ghi lại bug đã phát hiện — `current_balance` đang chịu bộ lọc**

Code hiện tại **vi phạm** quyết định Q3 vừa chốt. Đã xác minh:

- `metrics.ComputeKPI(rows, acc, flows)` tính `k.CurrentBalance = acc.InitialBalance + k.NetProfit + netCashFlow(flows)` ([kpi.go:146](../../../backend/internal/metrics/kpi.go#L146)), trong đó `k.NetProfit` được tính từ chính `rows` truyền vào.
- `TradeService.Stats` truyền `res.Filtered` ([trade.go:258](../../../backend/internal/service/trade.go#L258)) — tức **tập đã lọc**.

Hệ quả: lọc theo tháng 6 thì `current_balance` chỉ cộng lãi của tháng 6, ra một con số không phải số dư thật của tài khoản.

**Không sửa trong plan này.** Sửa đúng cách là tách `CurrentBalance` ra khỏi `ComputeKPI` (hoặc truyền thêm tập chưa lọc), đụng chữ ký hàm thuần + handler + DTO — đủ lớn để là task riêng của Phase 4c, và nó cần đi kèm test KPI-theo-filter mà plan này không dựng.

Ghi mục này vào §10.1 của `trading-journal-plan.md` (mục Task 5 vừa tạo):

```markdown
- **BUG đã biết — `current_balance` đang chịu bộ lọc.** `TradeService.Stats` truyền
  `res.Filtered` vào `metrics.ComputeKPI`, nên `CurrentBalance` chỉ cộng lãi của tập
  đã lọc. Trái quyết định Q3 (số dư phải tính trên toàn bộ lệnh). Phase 4c phải tách
  `CurrentBalance` khỏi đường tính KPI theo filter, kèm regression test: cùng một
  account, lọc theo một tháng → `current_balance` **không đổi** so với khi không lọc.
```

- [ ] **Step 3: Chạy lại toàn bộ cổng lần cuối**

```bash
make test
cd frontend && npx tsc --noEmit && npm run build && npm test -- --run
```

Expected: tất cả xanh. Báo cáo số test thật, không phỏng đoán.

---

## Định nghĩa "xong"

- [ ] `grep -n "win_sign" trading-journal-plan.md` → không có kết quả
- [ ] `grep -rn "WinSign\|win_sign" backend/internal/ backend/cmd/` → không có kết quả
- [ ] §0 của spec có đủ AJ/AK/AM/AN
- [ ] §1 có bảng mapping `BUY`/`SELL` → `Long`/`Short`
- [ ] §5.9 có luật bin R và ghi rõ bug `net = 0` bị đếm đôi của Excel
- [ ] §10 không còn câu hỏi nào đã chốt; §10.1 liệt kê đúng những gì còn treo
- [ ] `CLAUDE.md` quy tắc 8 có cả ngoại lệ Q3 lẫn khẳng định Q4
- [ ] `make test` xanh
- [ ] `cd frontend && npx tsc --noEmit && npm run build && npm test -- --run` xanh
- [ ] **Không có commit nào được tạo** — để nguyên working tree cho chủ repo review
