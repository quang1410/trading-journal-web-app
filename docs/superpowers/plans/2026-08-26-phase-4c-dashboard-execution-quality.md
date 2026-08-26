# Phase 4c — Sửa bug `current_balance` + khối chất lượng thực thi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa bug `current_balance` chịu bộ lọc (trái quyết định đã chốt), rồi bổ sung bốn khối dashboard còn thiếu so với file Excel gốc: chất lượng thực thi, phân bố `trade_class`, tỉ lệ thắng/thua, và ba tile lý thuyết-vs-thực tế.

**Architecture:** Toàn bộ phần tính toán mới nằm trong `internal/aggregate` (package thuần, không DB/HTTP) và được nối vào `aggregate.Charts` — response `/charts` đã có sẵn, chỉ mọc thêm trường. Riêng bug `current_balance` sửa ở `metrics.ComputeKPI` bằng cách nhận thêm tập lệnh đầy đủ; `service.ReadResult` đã mang sẵn cả `All` lẫn `Filtered` nên không cần đụng repository. Frontend thêm bốn component vào các section đã có trong `DashboardPage`, không đổi layout.

**Tech Stack:** Go 1.23 · `shopspring/decimal` · testify · Vite + React 19 + TypeScript · TanStack Query v5 · Recharts · vitest + Testing Library

**Spec:**
- `trading-journal-plan.md` (nguồn sự thật nghiệp vụ, đã patch ở plan `2026-08-26-phase-4c-pre-patch-spec.md`)
- `docs/superpowers/specs/2026-08-23-xlsb-audit-gap-report.md` — các mục **T4, T5, T6, T7**
- `trading-journal-plan.md` §10.1 — ba mục "còn phải chốt", plan này chốt cả ba

## Global Constraints

- **Tiền là `decimal.Decimal`, không bao giờ `float64`.** Kể cả biến trung gian trong hàm tính.
- **Không lưu trường suy diễn.** Mọi thứ plan này thêm đều tính lúc đọc, không có migration, không có cột DB mới.
- **`internal/scoring`, `internal/metrics`, `internal/aggregate` là package thuần** — cấm import GORM, `net/http`, `database/sql`, `context`. `aggregate/purity_test.go` đang canh việc này; đừng làm nó đỏ.
- **Chuỗi enum tiếng Việt là key chấm điểm** — copy nguyên văn từ `domain/enums.go`, không tự gõ lại.
- **Component chỉ dùng biến ngữ nghĩa** (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`), không hardcode hex. Lãi = `--primary` (teal), lỗ = `--status-error` (đỏ). Theme tắt hết `shadow-*`.
- **Quy tắc 8:** lũy kế tính trên **toàn bộ** lệnh; KPI tính trên tập đã lọc. **Ngoại lệ đã chốt:** `current_balance` và tổng nạp/rút không chịu bộ lọc — đó chính là Task 1.
- **Mỗi feature ship kèm test trong cùng lần thay đổi.** Sửa bug thì thêm regression test fail trên code cũ, pass trên code mới.
- Cổng: `make test` (chạy từ **thư mục gốc repo**, không phải `backend/`) · `cd frontend && npx tsc --noEmit && npm run build && npm test -- --run`

---

## Ba quyết định đã chốt trước khi viết plan

Ba mục treo ở `trading-journal-plan.md` §10.1 đã được chủ sản phẩm chốt. Plan này thực thi cả ba, và Task 6 ghi chúng vào spec.

| Mục | Quyết định | Ảnh hưởng |
|---|---|---|
| Top 6 sắp theo `count` hay `sum_net`? | **`count` giảm dần** | Không cần đổi code — `aggregate/pivot.go:82` `topN` đã sắp đúng vậy rồi. Chỉ ghi vào spec. |
| Tile "LỆNH KHÔNG CÓ SETUP" | **Tách hai chỉ số** `no_setup_count` và `impulsive_count` | Task 2 |
| `current_balance` chịu bộ lọc | **Bug, phải sửa** | Task 1 |

Lý do chọn `count`: "top 6 setup dùng nhiều nhất" ổn định, không đổi khi lãi lỗ đổi dấu. Sắp theo `sum_net` sẽ đẩy nhóm lỗ nặng ra khỏi biểu đồ — đúng thứ người dùng cần nhìn nhất.

Lý do tách tile: nhãn Excel ("Bốc đồng + Trả thù + FOMO") không khớp công thức `Dashboard!V85` (`SUMIFS` đếm lệnh no-setup). Giữ một chỉ số thì phải bỏ một nửa thông tin; tách hai thì cả hai đều đúng nhãn.

---

## File Structure

**Backend — sửa:**
- `backend/internal/metrics/kpi.go` — `ComputeKPI` nhận thêm tập đầy đủ để tính `CurrentBalance`
- `backend/internal/service/trade.go:246-259` — `Stats` truyền cả hai tập
- `backend/internal/metrics/kpi_test.go`, `backend/internal/service/trade_test.go` — cập nhật call site + regression test

**Backend — tạo mới:**
- `backend/internal/aggregate/execution.go` — `ExecutionQuality` (T4) + `ByTradeClass` (T5) + `WinLossSplit` (T6) + `TheorySummary` (T7)
- `backend/internal/aggregate/execution_test.go` — table-driven test cho cả bốn

**Backend — nối dây:**
- `backend/internal/aggregate/charts.go` — thêm 4 trường vào `Charts`, gọi trong `All`
- `backend/internal/aggregate/charts_test.go` — test `All` nối đúng tập (filtered vs all)

**Frontend — tạo mới:**
- `frontend/src/features/dashboard/ExecutionQualityBlock.tsx` — T4, ba tile số
- `frontend/src/features/dashboard/TradeClassChart.tsx` — T5 doughnut + bảng
- `frontend/src/features/dashboard/WinLossDonut.tsx` — T6 doughnut nhỏ
- `frontend/src/features/dashboard/TheorySummaryBlock.tsx` — T7 ba tile
- Test đi kèm: `executionQualityBlock.test.tsx`, `tradeClassChart.test.tsx`, `winLossDonut.test.tsx`, `theorySummaryBlock.test.tsx`

**Frontend — sửa:**
- `frontend/src/features/dashboard/types.ts` — 4 type mới
- `frontend/src/features/dashboard/DashboardPage.tsx` — cắm 4 component vào section sẵn có
- `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts` — key mới
- `frontend/src/test/tradeFactory.ts` — factory cấp trường mới

**Spec — sửa:**
- `trading-journal-plan.md` — §5 top-6, §5.13–§5.16 mới, §10.1 rút gọn

Vì sao gộp bốn khối backend vào **một** file `execution.go`: cả bốn đều là "tổng kết một con số từ tập đã lọc", cùng đọc `metrics.Enriched`, cùng đổi khi luật chấm điểm đổi. Tách bốn file sẽ là chia theo màn hình chứ không phải theo trách nhiệm.

---

## Task 1: `current_balance` thoát khỏi bộ lọc

Đây là bug đã ghi ở `trading-journal-plan.md` §10.1 và có cảnh báo ⚠️ trong `CLAUDE.md` quy tắc 8. Làm trước vì nó đụng chữ ký hàm mà các task sau đọc tới.

**Bug:** `TradeService.Stats` truyền `res.Filtered` vào `metrics.ComputeKPI`; `ComputeKPI` tính `CurrentBalance = InitialBalance + NetProfit + netCashFlow(flows)` với `NetProfit` là lãi của **tập đã lọc**. Lọc theo tháng 6 → số dư tài khoản tụt xuống chỉ còn vốn + lãi tháng 6. Quyết định đã chốt (§10 mục 6): số dư không phụ thuộc người dùng đang xem tháng nào.

**Files:**
- Modify: `backend/internal/metrics/kpi.go:46-48` (chữ ký + doc), `kpi.go:146` (dòng tính `CurrentBalance`)
- Modify: `backend/internal/service/trade.go:258`
- Modify: `backend/internal/metrics/kpi_test.go` (mọi call site `ComputeKPI`)
- Modify: `backend/internal/service/trade_test.go` (call site nếu có)

**Interfaces:**
- Produces: `metrics.ComputeKPI(filtered, all []Enriched, acc domain.Account, flows []domain.CashFlow) KPI` — tham số `all` là tập **chưa lọc**, chỉ dùng cho `CurrentBalance`. Task 2–5 không gọi hàm này.

- [ ] **Step 1: Viết regression test fail trên code cũ**

Thêm vào cuối `backend/internal/metrics/kpi_test.go`. Test này ghim đúng ngoại lệ của quy tắc 8: cùng account, một lần truyền tập đầy đủ, một lần truyền tập đã lọc — `CurrentBalance` phải **bằng nhau**, còn `NetProfit` thì **khác nhau**.

Helper có sẵn trong package `metrics` (đừng khai báo lại): `dec()` ở `derived_test.go:13`, `goldenAccount()` ở `enrich_test.go:15` (vốn 5000, risk 1%), `goldenTrades(t)` ở `enrich_test.go:39`.

```go
// TestComputeKPICurrentBalanceKhongChiuBoLoc ghim ngoại lệ của quy tắc 8:
// số dư tài khoản là số dư THẬT, không phụ thuộc người dùng đang lọc tháng
// nào. Trước khi sửa, ComputeKPI chỉ nhận một tập nên số dư tụt theo bộ lọc.
//
// NetProfit thì NGƯỢC LẠI — nó phải chịu bộ lọc. Hai assert đi cùng nhau mới
// đủ nghĩa: chỉ assert số dư thì một bản cài đặt bỏ luôn bộ lọc vẫn pass.
func TestComputeKPICurrentBalanceKhongChiuBoLoc(t *testing.T) {
	acc := goldenAccount()
	all, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)
	filtered := all[:1] // như lọc còn đúng lệnh đầu

	kpi := ComputeKPI(filtered, all, acc, nil)

	// goldenTrades có net toàn bộ = 350 (xem TestComputeKPIGoldenFixture),
	// vốn ban đầu 5000.
	require.True(t, kpi.CurrentBalance.Equal(dec("5350")),
		"5000 vốn + 350 lãi TOÀN BỘ, không phải lãi của tập lọc, nhận %s", kpi.CurrentBalance)
	require.True(t, kpi.NetProfit.Equal(all[0].Net),
		"net_profit VẪN theo tập đã lọc, nhận %s", kpi.NetProfit)
	require.False(t, kpi.NetProfit.Equal(dec("350")),
		"nếu net_profit = 350 thì bộ lọc chưa cắt gì, fixture sai")
}

// TestComputeKPICurrentBalanceCongCashFlowToanBo: nạp/rút cũng nằm ngoài bộ
// lọc, cùng lý do.
func TestComputeKPICurrentBalanceCongCashFlowToanBo(t *testing.T) {
	acc := goldenAccount()
	all, err := Enrich(goldenTrades(t), acc)
	require.NoError(t, err)
	flows := []domain.CashFlow{
		{Type: domain.CashFlowDeposit, Amount: dec("1000")},
		{Type: domain.CashFlowWithdraw, Amount: dec("300")},
	}

	kpi := ComputeKPI(all[:1], all, acc, flows)

	require.True(t, kpi.CurrentBalance.Equal(dec("6050")),
		"5000 + 350 lãi toàn bộ + 1000 − 300, nhận %s", kpi.CurrentBalance)
}
```

⚠️ Kiểm tra trước hai điều: (1) `grep -n "CashFlowDeposit\|CashFlowWithdraw" backend/internal/domain/enums.go` để lấy tên hằng thật — test cũ ở `kpi_test.go:158` dùng gì thì dùng theo đúng vậy; (2) `TestComputeKPIGoldenFixture` đang assert `NetProfit = 350` và `CurrentBalance = 5350`, xác nhận hai con số này còn đúng trước khi dựa vào chúng.

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd backend && go test ./internal/metrics/ -run TestComputeKPICurrentBalance -v
```

Expected: FAIL biên dịch — `too many arguments in call to ComputeKPI` (hàm cũ nhận 3 tham số). Đây là kiểu đỏ hợp lệ: test mô tả chữ ký mới.

- [ ] **Step 3: Đổi chữ ký `ComputeKPI`**

Trong `backend/internal/metrics/kpi.go`, thay khối doc + chữ ký (dòng 46-48):

```go
// ComputeKPI tính chỉ số trên tập ĐÃ LỌC (`filtered`), trừ CurrentBalance.
//
// `all` là tập CHƯA lọc và chỉ phục vụ CurrentBalance. Số dư tài khoản là số
// dư thật, không đổi theo việc người dùng đang xem tháng nào — ngoại lệ của
// quy tắc 8 trong CLAUDE.md, đúng như Excel (`Dashboard!V3` VLOOKUP thẳng vào
// `Settings`, không đi qua pivot).
//
// Hai tham số cùng kiểu nên đảo chỗ vẫn biên dịch và vẫn ra số — đó là lý do
// TestComputeKPICurrentBalanceKhongChiuBoLoc assert cả CurrentBalance lẫn
// NetProfit: đảo chỗ sẽ làm đúng một trong hai sai.
//
// Các trường lũy kế bên trong rows (CumByTrade, Drawdown) phải được tính từ
// dãy đầy đủ trước đó — xem quy tắc filter ở §7.1 của spec.
func ComputeKPI(filtered, all []Enriched, acc domain.Account, flows []domain.CashFlow) KPI {
```

Đổi dòng đầu vòng lặp từ `for _, r := range rows {` thành `for _, r := range filtered {`.

- [ ] **Step 4: Tính `CurrentBalance` từ `all`**

Thay dòng `kpi.go:146`:

```go
	// CỐ Ý không dùng k.NetProfit: nó là lãi của tập đã lọc.
	netAll := decimal.Zero
	for _, r := range all {
		netAll = netAll.Add(r.Net)
	}
	k.CurrentBalance = acc.InitialBalance.Add(netAll).Add(netCashFlow(flows))
```

- [ ] **Step 5: Sửa mọi call site cũ trong test**

Các test cũ gọi `ComputeKPI(rows, acc, nil)`. Ngữ nghĩa cũ là "không lọc", nên tập lọc và tập đầy đủ là một:

```bash
cd backend && sed -i '' -E 's/ComputeKPI\(([A-Za-z]+), acc,/ComputeKPI(\1, \1, acc,/' internal/metrics/kpi_test.go
```

Lệnh này đã được chạy thử trên bản sao của file hiện tại; kết quả đúng cho cả 10 call site cũ (`nil` cũng khớp `[A-Za-z]+` nên dòng 54 thành `ComputeKPI(nil, nil, acc, nil)`, đúng ý). Xác nhận lại:

```bash
cd backend && grep -n "ComputeKPI(" internal/metrics/kpi_test.go
```

Expected — mọi dòng đều 4 tham số:
```
25:	kpi := ComputeKPI(rows, rows, acc, nil)
54:	kpi := ComputeKPI(nil, nil, acc, nil)
80,101,125,138,152:	kpi := ComputeKPI(rows, rows, acc, nil)
168:	kpi := ComputeKPI(rows, rows, acc, flows)
196,197:	kpiA/kpiB := ComputeKPI(rowsA, rowsA, acc, nil) / (rowsB, rowsB, ...)
```

⚠️ Hai test mới ở Step 1 viết `ComputeKPI(filtered, all, acc, nil)` và `ComputeKPI(all[:1], all, acc, flows)` — mẫu `([A-Za-z]+), acc,` không khớp chúng nên `sed` bỏ qua, đúng như mong muốn. Nếu bạn đã thêm chúng trước khi chạy `sed`, vẫn an toàn.

- [ ] **Step 6: Sửa call site ở service**

`backend/internal/service/trade.go` — sửa comment và dòng gọi trong `Stats`:

```go
// Stats trả KPI của tập ĐÃ LỌC, trừ current_balance.
//
// Nạp thêm cash flow vì current_balance = vốn ban đầu + nạp − rút + lãi lỗ;
// thiếu nó thì con số vẫn ra nhưng thiếu phần nạp/rút, và nó trông đủ hợp lý
// để không ai nghi ngờ.
//
// Truyền CẢ res.Filtered lẫn res.All: số dư tài khoản không chịu bộ lọc
// (ngoại lệ của quy tắc 8), phần còn lại thì có.
func (s *TradeService) Stats(ctx context.Context, acc domain.Account, f Filter) (metrics.KPI, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return metrics.KPI{}, err
	}
	flows, err := s.flows.ListByAccount(ctx, acc.ID)
	if err != nil {
		return metrics.KPI{}, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return metrics.ComputeKPI(res.Filtered, res.All, acc, flows), nil
}
```

- [ ] **Step 7: Thêm test tầng service — bug thật xảy ra ở đây**

Test ở Step 1 chỉ chứng minh `ComputeKPI` đúng. Bug gốc là ở chỗ **`Stats` truyền tham số gì**, nên phải có test riêng ghim tầng đó. Thêm vào `backend/internal/service/trade_test.go`, ngay sau `TestStatsCongCashFlowVaoCurrentBalance` (dòng 260).

Lưu ý: file này là `package service_test` (external) và dùng `testdb.New(t)` → **cần Docker**. Helper sẵn có: `boDoTrade(t)` (dòng 20, dựng db + account vốn 10000) và `themLenh(t, svc, acc, ngayVN, symbol, profit)` (dòng 48).

`service.Filter` **không có** trường `Month` — chỉ có `From`/`To` (dạng `"YYYY-MM-DD"`), `Setup`, `Symbol`, `Timeframe`, `Direction`, `TradeClass`. Test dưới đây lọc bằng `From`/`To`.

```go
// TestStatsCurrentBalanceKhongDoiKhiLoc là regression test cho bug §10.1:
// Stats từng truyền res.Filtered làm cả hai tập, nên lọc theo khoảng ngày làm
// số dư tài khoản tụt xuống. Cùng một account, lọc và không lọc → số dư PHẢI
// bằng nhau, còn net_profit thì PHẢI khác.
//
// Hai assert đi cùng nhau mới đủ nghĩa: chỉ assert số dư thì một bản cài đặt
// bỏ luôn bộ lọc vẫn pass.
func TestStatsCurrentBalanceKhongDoiKhiLoc(t *testing.T) {
	svc, acc := boDoTrade(t)
	themLenh(t, svc, acc, "2026-06-08", "AAA", "100")
	themLenh(t, svc, acc, "2026-07-08", "BBB", "250")

	khongLoc, err := svc.Stats(context.Background(), acc, service.Filter{})
	require.NoError(t, err)

	coLoc, err := svc.Stats(context.Background(), acc, service.Filter{
		From: "2026-06-01", To: "2026-06-30",
	})
	require.NoError(t, err)

	require.True(t, coLoc.CurrentBalance.Equal(khongLoc.CurrentBalance),
		"số dư không chịu bộ lọc: không lọc %s, có lọc %s",
		khongLoc.CurrentBalance, coLoc.CurrentBalance)
	require.True(t, coLoc.CurrentBalance.Equal(decimal.RequireFromString("10350")),
		"10000 vốn + 350 lãi TOÀN BỘ, nhận %s", coLoc.CurrentBalance)
	require.True(t, coLoc.NetProfit.Equal(decimal.RequireFromString("100")),
		"net_profit PHẢI đổi theo bộ lọc, chỉ còn lệnh tháng 6, nhận %s", coLoc.NetProfit)
}
```

⚠️ Xác minh trước khi viết: `grep -n "From\|To" -A 12 backend/internal/service/trade_filter.go` — kiểm tra `To` là **bao gồm** hay **loại trừ** ngày cuối. Nếu loại trừ thì `To: "2026-06-30"` vẫn giữ được lệnh ngày 08 nên test vẫn đúng; nhưng nếu định dạng ngày khác `"YYYY-MM-DD"` thì bộ lọc không cắt gì và assert `NetProfit = 100` sẽ đỏ — đó chính là lý do assert đó tồn tại.

- [ ] **Step 8: Chạy test, phải xanh**

```bash
cd backend && go test ./internal/metrics/ ./internal/service/ -v 2>&1 | tail -40
```

Expected: PASS. Nếu `internal/service` cần Docker mà máy không có, ghi rõ điều đó vào báo cáo thay vì bỏ qua im lặng.

- [ ] **Step 9: Chạy toàn bộ cổng backend**

```bash
make test
```

Expected: 10 package xanh. `internal/httpapi/trade_handler_test.go:263` assert `"current_balance":"10000"` — nếu nó đỏ, đọc fixture của nó: có thể fixture đang lọc và con số kỳ vọng cần cập nhật theo hành vi **mới đúng**, chứ không phải rollback code.

---

## Task 2: `ExecutionQuality` — khối chất lượng thực thi (T4)

**Files:**
- Create: `backend/internal/aggregate/execution.go`
- Create: `backend/internal/aggregate/execution_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched` (có `Trade domain.Trade`, `Net decimal.Decimal`, `TradeClass string`, `ScoreTotal *int`)
- Produces:
  ```go
  type ExecutionQuality struct {
      PlannedPct     *decimal.Decimal `json:"planned_pct"`
      NoSetupCount   int              `json:"no_setup_count"`
      ImpulsiveCount int              `json:"impulsive_count"`
  }
  func ExecutionQualityOf(rows []metrics.Enriched) ExecutionQuality
  ```
  Task 4 gọi `ExecutionQualityOf` trong `All`; Task 5 render `ExecutionQuality`.

**Nghiệp vụ (từ audit T4):**
- `planned_pct = count(trade_class = "ĐÚNG KẾ HOẠCH") / tổng số lệnh` — Excel `Dashboard!S85`. Mẫu số là **tất cả** lệnh, gồm cả `CHƯA ĐÁNH GIÁ` (Excel: `SUM(U103:U107)` cộng đủ 5 hàng). Mục tiêu ≥ 85%.
- `no_setup_count = count(setup = "KHÔNG CÓ SETUP")` — Excel `Dashboard!V85`.
- `impulsive_count = count(trade_class ∈ {"BỐC ĐỒNG", "TRẢ THÙ"})` — chỉ số mới, xem "Ba quyết định đã chốt".

`PlannedPct` là con trỏ vì 0 lệnh và 0% là hai chuyện khác nhau — cùng quy ước với `KPI` (xem `kpi.go:10-11`).

- [ ] **Step 1: Xác nhận tên hằng enum, đừng gõ tay chuỗi tiếng Việt**

```bash
grep -n "ClassPlanned\|ClassImpulsive\|ClassRevenge\|ClassNotEvaluated\|ClassNeedsWork\|DefaultSetup" backend/internal/domain/enums.go
```

Ghi lại giá trị chuỗi thật của từng hằng. Code phải tham chiếu hằng (`domain.ClassPlanned`), **không** viết lại `"ĐÚNG KẾ HOẠCH"` — dấu tiếng Việt gõ tay rất dễ sai một dấu và test sẽ đỏ theo cách khó đọc.

- [ ] **Step 2: Viết test trước**

Tạo `backend/internal/aggregate/execution_test.go`:

```go
package aggregate

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// rowClass dựng nhanh một Enriched chỉ với hai thứ ExecutionQualityOf quan
// tâm: loại lệnh và setup. Không đi qua metrics.Enrich vì ở đây ta cần đặt
// TradeClass trực tiếp — Enrich sẽ tự suy ra nó từ điểm số, làm test dài ra
// mà không kiểm thêm được gì.
func rowClass(class, setup string) metrics.Enriched {
	return metrics.Enriched{
		Trade:      domain.Trade{Setup: setup},
		TradeClass: class,
	}
}

func TestExecutionQualityOfGoldenFixture(t *testing.T) {
	rows := []metrics.Enriched{
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassImpulsive, domain.DefaultSetup),
		rowClass(domain.ClassRevenge, domain.DefaultSetup),
		rowClass(domain.ClassNotEvaluated, "Pullback"),
	}

	got := ExecutionQualityOf(rows)

	require.NotNil(t, got.PlannedPct)
	require.True(t, got.PlannedPct.Equal(decimal.RequireFromString("0.4")),
		"2 đúng kế hoạch / 5 lệnh, mẫu số gồm cả CHƯA ĐÁNH GIÁ, nhận %s", got.PlannedPct)
	require.Equal(t, 2, got.NoSetupCount)
	require.Equal(t, 2, got.ImpulsiveCount, "BỐC ĐỒNG + TRẢ THÙ")
}

// Mẫu số PHẢI gồm lệnh chưa chấm điểm. Nếu ai đó "sửa" theo hướng loại chúng
// ra cho giống §2.5, test này đỏ — hai luật khác nhau: §2.5 nói về TRUNG BÌNH
// điểm, còn đây là TỈ LỆ lệnh, Excel cộng đủ 5 hàng U103:U107.
func TestExecutionQualityOfMauSoGomCaLenhChuaCham(t *testing.T) {
	rows := []metrics.Enriched{
		rowClass(domain.ClassPlanned, "Breakout"),
		rowClass(domain.ClassNotEvaluated, "Breakout"),
	}

	got := ExecutionQualityOf(rows)

	require.True(t, got.PlannedPct.Equal(decimal.RequireFromString("0.5")),
		"1/2 chứ không phải 1/1, nhận %s", got.PlannedPct)
}

func TestExecutionQualityOfDanhSachRong(t *testing.T) {
	got := ExecutionQualityOf(nil)

	require.Nil(t, got.PlannedPct, "0 lệnh khác 0%%, phải là nil để FE hiện —")
	require.Equal(t, 0, got.NoSetupCount)
	require.Equal(t, 0, got.ImpulsiveCount)
}

// Setup rỗng KHÔNG phải no-setup. Người dùng để trống ô setup là chuyện khác
// với việc họ chủ động chọn "KHÔNG CÓ SETUP"; gộp hai thứ sẽ thổi phồng con số.
func TestExecutionQualityOfSetupRongKhongTinhLaNoSetup(t *testing.T) {
	rows := []metrics.Enriched{rowClass(domain.ClassPlanned, "")}

	require.Equal(t, 0, ExecutionQualityOf(rows).NoSetupCount)
}
```

- [ ] **Step 3: Chạy để thấy đỏ**

```bash
cd backend && go test ./internal/aggregate/ -run TestExecutionQualityOf -v
```

Expected: FAIL biên dịch — `undefined: ExecutionQualityOf`.

- [ ] **Step 4: Cài đặt tối thiểu**

Tạo `backend/internal/aggregate/execution.go`:

```go
package aggregate

import (
	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// ExecutionQuality là khối "CHẤT LƯỢNG THỰC THI LỆNH" của dashboard (§5.13).
//
// PlannedPct là con trỏ vì "chưa có lệnh nào" và "0% đúng kế hoạch" là hai
// chuyện khác nhau — frontend hiện "—" cho cái đầu.
type ExecutionQuality struct {
	PlannedPct     *decimal.Decimal `json:"planned_pct"`
	NoSetupCount   int              `json:"no_setup_count"`
	ImpulsiveCount int              `json:"impulsive_count"`
}

// ExecutionQualityOf đếm ba chỉ số chất lượng thực thi trên tập đã lọc.
//
// Mẫu số của PlannedPct là TOÀN BỘ lệnh trong tập, gồm cả lệnh chưa chấm điểm
// — khác với luật "loại lệnh chưa chấm khỏi trung bình" ở §2.5. Excel cộng đủ
// năm hàng U103:U107, và về nghĩa cũng đúng: một lệnh chưa được đánh giá thì
// chưa phải lệnh đúng kế hoạch.
//
// NoSetupCount và ImpulsiveCount là hai chỉ số TÁCH RIÊNG, cố ý. File Excel
// gộp chúng dưới một nhãn sai: tile ghi "Bốc đồng + Trả thù + FOMO" nhưng
// công thức V85 lại đếm lệnh no-setup. Xem §10 của trading-journal-plan.md.
func ExecutionQualityOf(rows []metrics.Enriched) ExecutionQuality {
	out := ExecutionQuality{}
	planned := 0

	for _, r := range rows {
		switch r.TradeClass {
		case domain.ClassPlanned:
			planned++
		case domain.ClassImpulsive, domain.ClassRevenge:
			out.ImpulsiveCount++
		}
		if r.Trade.Setup == domain.DefaultSetup {
			out.NoSetupCount++
		}
	}

	if len(rows) > 0 {
		pct := decimal.NewFromInt(int64(planned)).
			Div(decimal.NewFromInt(int64(len(rows))))
		out.PlannedPct = &pct
	}
	return out
}
```

- [ ] **Step 5: Chạy test, phải xanh**

```bash
cd backend && go test ./internal/aggregate/ -run TestExecutionQualityOf -v
```

Expected: PASS cả 4 test.

- [ ] **Step 6: Kiểm tính thuần**

```bash
cd backend && go test ./internal/aggregate/ -run TestPurity -v
```

Expected: PASS — `execution.go` chỉ import `decimal`, `domain`, `metrics`.

---

## Task 3: `ByTradeClass`, `WinLossSplit`, `TheorySummary` (T5, T6, T7)

Ba khối nhỏ, cùng file, cùng vòng test — tách task riêng cho mỗi cái sẽ là ba lần chạy `make test` cho ba hàm mười dòng.

**Files:**
- Modify: `backend/internal/aggregate/execution.go`
- Modify: `backend/internal/aggregate/execution_test.go`

**Interfaces:**
- Consumes: `metrics.Enriched`; `TheoryPoint` (đã có, `charts.go:41-45`); `TheoryVsActual(rows) []TheoryPoint` (đã có)
- Produces:
  ```go
  type ClassStat struct {
      Class  string          `json:"class"`
      Count  int             `json:"count"`
      Pct    decimal.Decimal `json:"pct"`
      SumNet decimal.Decimal `json:"sum_net"`
  }
  func ByTradeClass(rows []metrics.Enriched) []ClassStat

  type WinLossSplit struct {
      WinCount  int `json:"win_count"`
      LossCount int `json:"loss_count"`
      EvenCount int `json:"even_count"`
  }
  func WinLoss(rows []metrics.Enriched) WinLossSplit

  type TheorySummary struct {
      Theory decimal.Decimal `json:"theory"`
      Actual decimal.Decimal `json:"actual"`
      Diff   decimal.Decimal `json:"diff"`
  }
  func TheorySummaryOf(points []TheoryPoint) TheorySummary
  ```

**Nghiệp vụ:**
- **T5:** năm hàng theo đúng thứ tự `domain.TradeClasses`, **luôn đủ năm hàng kể cả count = 0** — doughnut mất hạng mục giữa chừng sẽ đổi màu các hạng mục còn lại giữa hai lần render. `pct = count / len(rows)`.
- **T6:** Excel `chart4.xml` chỉ vẽ thắng/thua. Thêm `EvenCount` (`net = 0`) vì §10 mục 2 nói rõ lệnh hoà không vào `win_count` lẫn `loss_count` — không trả nó ra thì tổng ba con số không khớp `len(rows)` và người dùng sẽ tưởng mất lệnh.
- **T7:** ba tile = **điểm cuối** của hai chuỗi `TheoryVsActual`, và hiệu của chúng. Excel `I85`/`L85` `INDEX` vào hàng cuối; `O85 = L85 − I85` (thực tế − lý thuyết). Tập rỗng → cả ba là 0 (không nil): đây là "chưa đi được đồng nào", không phải "không tính được".

- [ ] **Step 1: Viết test cho cả ba, nối vào `execution_test.go`**

```go
// ── T5: phân bố theo loại lệnh ────────────────────────────────────────────

func TestByTradeClassGoldenFixture(t *testing.T) {
	rows := []metrics.Enriched{
		rowClassNet(domain.ClassPlanned, "100"),
		rowClassNet(domain.ClassPlanned, "50"),
		rowClassNet(domain.ClassRevenge, "-200"),
		rowClassNet(domain.ClassNotEvaluated, "10"),
	}

	got := ByTradeClass(rows)

	require.Len(t, got, 5, "luôn đủ 5 hàng kể cả loại có 0 lệnh")
	byClass := map[string]ClassStat{}
	for _, c := range got {
		byClass[c.Class] = c
	}

	require.Equal(t, 2, byClass[domain.ClassPlanned].Count)
	require.True(t, byClass[domain.ClassPlanned].SumNet.Equal(dec("150")))
	require.True(t, byClass[domain.ClassPlanned].Pct.Equal(dec("0.5")))

	require.Equal(t, 1, byClass[domain.ClassRevenge].Count)
	require.True(t, byClass[domain.ClassRevenge].SumNet.Equal(dec("-200")))

	require.Equal(t, 0, byClass[domain.ClassNeedsWork].Count, "loại vắng mặt vẫn có hàng")
	require.True(t, byClass[domain.ClassNeedsWork].SumNet.IsZero())
	require.True(t, byClass[domain.ClassNeedsWork].Pct.IsZero())
}

// Thứ tự hàng phải bám domain.TradeClasses. Doughnut lấy màu theo chỉ số hàng;
// thứ tự nhảy giữa hai lần render sẽ đổi màu hạng mục ngay trước mắt người dùng.
func TestByTradeClassGiuThuTuEnum(t *testing.T) {
	got := ByTradeClass(nil)

	require.Len(t, got, 5)
	for i, want := range domain.TradeClasses {
		require.Equal(t, want, got[i].Class, "hàng %d sai thứ tự", i)
	}
}

// ── T6: thắng / thua / hoà ────────────────────────────────────────────────

func TestWinLossTachLenhHoaRaRieng(t *testing.T) {
	rows := []metrics.Enriched{
		rowClassNet(domain.ClassPlanned, "100"),
		rowClassNet(domain.ClassPlanned, "-50"),
		rowClassNet(domain.ClassPlanned, "0"),
		rowClassNet(domain.ClassPlanned, "20"),
	}

	got := WinLoss(rows)

	require.Equal(t, 2, got.WinCount)
	require.Equal(t, 1, got.LossCount)
	require.Equal(t, 1, got.EvenCount, "net = 0 không vào thắng lẫn thua (§10 mục 2)")
	require.Equal(t, len(rows), got.WinCount+got.LossCount+got.EvenCount,
		"ba con số phải phủ hết tập, không lệnh nào biến mất")
}

func TestWinLossDanhSachRong(t *testing.T) {
	got := WinLoss(nil)
	require.Equal(t, WinLossSplit{}, got)
}

// ── T7: ba tile lý thuyết vs thực tế ──────────────────────────────────────

func TestTheorySummaryOfLayDiemCuoi(t *testing.T) {
	points := []TheoryPoint{
		{STT: 1, CumTheory: dec("100"), CumByTrade: dec("80")},
		{STT: 2, CumTheory: dec("250"), CumByTrade: dec("190")},
	}

	got := TheorySummaryOf(points)

	require.True(t, got.Theory.Equal(dec("250")), "điểm CUỐI, không phải tổng")
	require.True(t, got.Actual.Equal(dec("190")))
	require.True(t, got.Diff.Equal(dec("-60")), "thực tế − lý thuyết, âm là thực tế kém hơn")
}

func TestTheorySummaryOfDanhSachRong(t *testing.T) {
	got := TheorySummaryOf(nil)

	require.True(t, got.Theory.IsZero())
	require.True(t, got.Actual.IsZero())
	require.True(t, got.Diff.IsZero())
}
```

Thêm helper cạnh `rowClass` (Step 2 của Task 2):

```go
// rowClassNet như rowClass nhưng đặt luôn Net — dùng cho các hàm tính tiền.
func rowClassNet(class, net string) metrics.Enriched {
	return metrics.Enriched{
		Trade:      domain.Trade{Setup: "Breakout"},
		TradeClass: class,
		Net:        dec(net),
	}
}
```

Helper `dec` đã có sẵn ở `backend/internal/aggregate/streak_test.go:14` (cùng package `aggregate`) — **đừng khai báo lại**, sẽ lỗi trùng tên.

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd backend && go test ./internal/aggregate/ -run 'TestByTradeClass|TestWinLoss|TestTheorySummary' -v
```

Expected: FAIL biên dịch — `undefined: ByTradeClass`, `undefined: WinLoss`, `undefined: TheorySummaryOf`.

- [ ] **Step 3: Cài đặt cả ba**

Nối vào cuối `backend/internal/aggregate/execution.go`:

```go
// ClassStat là một hàng của bảng phân bố loại lệnh (§5.14), khớp doughnut
// chart2.xml của file gốc.
type ClassStat struct {
	Class  string          `json:"class"`
	Count  int             `json:"count"`
	Pct    decimal.Decimal `json:"pct"` // 0..1
	SumNet decimal.Decimal `json:"sum_net"`
}

// ByTradeClass gom tập đã lọc theo trade_class.
//
// LUÔN trả đủ năm hàng theo đúng thứ tự domain.TradeClasses, kể cả loại không
// có lệnh nào. Doughnut lấy màu theo chỉ số hàng — bỏ hàng rỗng đi thì thêm
// một lệnh "BỐC ĐỒNG" sẽ đổi màu của "TRẢ THÙ" ngay trước mắt người dùng.
func ByTradeClass(rows []metrics.Enriched) []ClassStat {
	counts := map[string]int{}
	sums := map[string]decimal.Decimal{}
	for _, r := range rows {
		counts[r.TradeClass]++
		sums[r.TradeClass] = sums[r.TradeClass].Add(r.Net)
	}

	total := decimal.NewFromInt(int64(len(rows)))
	out := make([]ClassStat, 0, len(domain.TradeClasses))
	for _, class := range domain.TradeClasses {
		s := ClassStat{
			Class:  class,
			Count:  counts[class],
			SumNet: sums[class],
			Pct:    decimal.Zero,
		}
		if len(rows) > 0 {
			s.Pct = decimal.NewFromInt(int64(s.Count)).Div(total)
		}
		out = append(out, s)
	}
	return out
}

// WinLossSplit là ba con số của doughnut thắng/thua (§5.15).
//
// EvenCount là phần Excel không có: chart4.xml chỉ vẽ hai lát. Nhưng §10 mục 2
// đã chốt lệnh net = 0 không vào win lẫn loss, nên nếu không trả nó ra thì
// tổng hai lát nhỏ hơn số lệnh và người dùng sẽ tưởng hệ thống nuốt mất lệnh.
type WinLossSplit struct {
	WinCount  int `json:"win_count"`
	LossCount int `json:"loss_count"`
	EvenCount int `json:"even_count"`
}

// WinLoss đếm thắng / thua / hoà trên tập đã lọc.
func WinLoss(rows []metrics.Enriched) WinLossSplit {
	out := WinLossSplit{}
	for _, r := range rows {
		switch {
		case r.Net.IsPositive():
			out.WinCount++
		case r.Net.IsNegative():
			out.LossCount++
		default:
			out.EvenCount++
		}
	}
	return out
}

// TheorySummary là ba tile tổng kết dưới biểu đồ lý thuyết-vs-thực tế (§5.16).
type TheorySummary struct {
	Theory decimal.Decimal `json:"theory"`
	Actual decimal.Decimal `json:"actual"`
	Diff   decimal.Decimal `json:"diff"` // Actual − Theory, âm là thực tế kém hơn
}

// TheorySummaryOf lấy ĐIỂM CUỐI của hai chuỗi lũy kế, không phải tổng của
// chúng — chuỗi đã lũy kế sẵn, cộng lại lần nữa là đếm hai lần.
//
// Tập rỗng trả 0 chứ không phải nil: "chưa đi được đồng nào" là một con số có
// nghĩa, khác với các chỉ số nil-được ở KPI vốn là "chia cho 0".
func TheorySummaryOf(points []TheoryPoint) TheorySummary {
	if len(points) == 0 {
		return TheorySummary{Theory: decimal.Zero, Actual: decimal.Zero, Diff: decimal.Zero}
	}
	last := points[len(points)-1]
	return TheorySummary{
		Theory: last.CumTheory,
		Actual: last.CumByTrade,
		Diff:   last.CumByTrade.Sub(last.CumTheory),
	}
}
```

- [ ] **Step 4: Chạy test, phải xanh**

```bash
cd backend && go test ./internal/aggregate/ -v 2>&1 | tail -30
```

Expected: PASS toàn bộ package, gồm cả test cũ.

---

## Task 4: Nối bốn khối vào `aggregate.Charts`

**Files:**
- Modify: `backend/internal/aggregate/charts.go:49-66` (struct), `charts.go:174-193` (`All`)
- Modify: `backend/internal/aggregate/charts_test.go`

**Interfaces:**
- Consumes: `ExecutionQualityOf`, `ByTradeClass`, `WinLoss`, `TheorySummaryOf` (Task 2–3)
- Produces: `Charts` mọc thêm 4 trường JSON — `execution`, `by_trade_class`, `win_loss`, `theory_summary`. Task 5 đọc đúng bốn key này.

Cả bốn tính trên **`filtered`**, không phải `all`: chúng là chỉ số mô tả tập đang xem, không phải lũy kế. `TheorySummaryOf` nhận lại chính slice `TheoryVsActual(filtered)` đã tính — gọi lại lần nữa là làm hai lần cùng một việc và mở đường cho hai con số lệch nhau.

- [ ] **Step 1: Viết test trước**

Thêm vào `backend/internal/aggregate/charts_test.go`:

```go
// TestAllNoiBonKhoiMoiTheoTapDaLoc ghim đúng thứ dễ sai nhất ở All: bốn khối
// mới phải đọc tập ĐÃ LỌC. Hai tham số all/filtered cùng kiểu nên nhầm chỗ vẫn
// biên dịch — chỉ test mới bắt được.
func TestAllNoiBonKhoiMoiTheoTapDaLoc(t *testing.T) {
	all := enrichProfits(t, "100", "-50", "200")
	filtered := all[:2] // như đã lọc bỏ lệnh cuối

	c := All(all, filtered, testAccount())

	require.Equal(t, 1, c.WinLoss.WinCount, "chỉ 1 lệnh thắng trong tập lọc, không phải 2")
	require.Equal(t, 1, c.WinLoss.LossCount)
	require.Len(t, c.ByTradeClass, 5)
	require.NotNil(t, c.Execution.PlannedPct)
	require.True(t, c.TheorySummary.Actual.Equal(c.TheoryVsActual[len(c.TheoryVsActual)-1].CumByTrade),
		"tile phải bằng điểm cuối của chính chuỗi được trả ra")
}
```

Trước khi viết: `grep -n "func enrichProfits\|func testAccount" backend/internal/aggregate/*_test.go` — hai helper này ở `streak_test.go`, cùng package nên dùng thẳng được.

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd backend && go test ./internal/aggregate/ -run TestAllNoiBonKhoiMoi -v
```

Expected: FAIL biên dịch — `c.WinLoss undefined`.

- [ ] **Step 3: Thêm bốn trường vào struct `Charts`**

Trong `backend/internal/aggregate/charts.go`, chèn vào `type Charts struct` ngay trước khối `LongestWinStreak`:

```go
	Execution     ExecutionQuality `json:"execution"`
	ByTradeClass  []ClassStat      `json:"by_trade_class"`
	WinLoss       WinLossSplit     `json:"win_loss"`
	TheorySummary TheorySummary    `json:"theory_summary"`
```

⚠️ Trường `WinLoss` trùng tên với hàm `WinLoss` ở package này — Go cho phép (một là field, một là hàm ở scope package) nhưng bên trong `All` phải gọi `WinLoss(filtered)` chứ không viết `c.WinLoss(...)`. Nếu thấy khó chịu, đổi tên **hàm** thành `WinLossOf` cho đồng bộ với `ExecutionQualityOf`/`TheorySummaryOf` và sửa test Task 3 theo. Chọn một, đừng nửa vời.

- [ ] **Step 4: Nối trong `All`**

Sửa `func All` — rút `TheoryVsActual` ra biến để dùng lại:

```go
func All(all, filtered []metrics.Enriched, account domain.Account) Charts {
	win, loss := Streaks(all)
	// Rút ra biến vì TheorySummary là điểm cuối của CHÍNH chuỗi này. Gọi
	// TheoryVsActual hai lần thì hai chỗ có thể lệch nhau khi ai đó sửa một chỗ.
	theory := TheoryVsActual(filtered)

	return Charts{
		BySetup:        BySetup(filtered),
		BySymbol:       BySymbol(filtered),
		ByTimeframe:    ByTimeframe(filtered),
		ByDirection:    ByDirection(filtered),
		ByWeekday:      ByWeekday(filtered),
		ByWeek:         ByWeek(filtered),
		ByDay:          ByDay(filtered),
		Heatmap:        Heatmap(filtered),
		RDistribution:  RDistribution(filtered, account.OneR()),
		Score:          ScoreAvg(filtered),
		Radar:          RadarAvg(filtered),
		TheoryVsActual: theory,

		Execution:     ExecutionQualityOf(filtered),
		ByTradeClass:  ByTradeClass(filtered),
		WinLoss:       WinLoss(filtered),
		TheorySummary: TheorySummaryOf(theory),

		LongestWinStreak:  win,
		LongestLossStreak: loss,
	}
}
```

- [ ] **Step 5: Chạy cổng backend đầy đủ**

```bash
make test
```

Expected: 10 package xanh. `internal/httpapi` marshal thẳng `aggregate.Charts` (`trade_handler.go:123`) nên không phải sửa DTO; nếu test handler đối chiếu JSON theo kiểu "khớp chính xác toàn bộ payload", nó sẽ đỏ — cập nhật fixture theo trường mới, đừng gỡ trường ra.

---

## Task 5: Frontend — bốn khối hiển thị

**Files:**
- Modify: `frontend/src/features/dashboard/types.ts`
- Create: `frontend/src/features/dashboard/ExecutionQualityBlock.tsx` + `executionQualityBlock.test.tsx`
- Create: `frontend/src/features/dashboard/TradeClassChart.tsx` + `tradeClassChart.test.tsx`
- Create: `frontend/src/features/dashboard/WinLossDonut.tsx` + `winLossDonut.test.tsx`
- Create: `frontend/src/features/dashboard/TheorySummaryBlock.tsx` + `theorySummaryBlock.test.tsx`
- Modify: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`
- Modify: `frontend/src/test/tradeFactory.ts`

**Interfaces:**
- Consumes: JSON của Task 4 — `execution`, `by_trade_class`, `win_loss`, `theory_summary`. Số tiền và % về dưới dạng **string** (`decimal.Decimal` marshal thành string), đúng như mọi trường tiền hiện có.

- [ ] **Step 1: Nắm quy ước sẵn có của repo**

Đã xác minh khi viết plan — dùng đúng những thứ này, **đừng** dùng `useTranslation` hay tự viết helper format:

| Thứ | API thật | Nguồn |
|---|---|---|
| i18n trong component | `const { locale, t } = useI18n()` | `@/i18n`, xem `KpiGrid.tsx:43` |
| Format tiền | `formatMoney(value, currency, locale)` | `@/lib/decimal:128` |
| Format % | `formatPercent(fraction, places?, locale?)` — nhận **phân số** (`"0.42"`), trả `"42,00%"` ở locale vi | `@/lib/decimal:152` |
| Màu theo dấu | `dauVaMau(v)` → `{ dau, lop }`, `lop` là `text-primary` / `text-destructive` / `text-muted-foreground` | `@/lib/thresholds:32` |
| Thẻ ô | `<div role="group" aria-label={nhan} className="flex flex-col gap-1 bg-card p-3">` | `KpiGrid.tsx:21-28` |
| Test | render **trần**, không bọc provider; `test(...)` chứ không `describe`; khoanh vùng bằng `within(screen.getByRole("group", { name }))` | `kpiGrid.test.tsx:1-16`, `streakBlock.test.tsx` |

Đọc thêm trước khi code:

```bash
cd frontend
grep -n "TheoryPoint\|Charts" -A 12 src/features/dashboard/types.ts | head -40
sed -n '1,60p' src/features/dashboard/RDistributionChart.tsx   # mẫu chart Recharts + palette
sed -n '1,40p' src/features/dashboard/palette.ts
```

- [ ] **Step 2: Thêm type**

Nối vào `frontend/src/features/dashboard/types.ts`:

```ts
export type ExecutionQuality = {
  planned_pct: string | null;
  no_setup_count: number;
  impulsive_count: number;
};

export type ClassStat = {
  class: string;
  count: number;
  pct: string;
  sum_net: string;
};

export type WinLossSplit = {
  win_count: number;
  loss_count: number;
  even_count: number;
};

export type TheorySummary = {
  theory: string;
  actual: string;
  diff: string;
};
```

Rồi thêm vào type `Charts` (tên đúng lấy từ Step 1):

```ts
  execution: ExecutionQuality;
  by_trade_class: ClassStat[];
  win_loss: WinLossSplit;
  theory_summary: TheorySummary;
```

- [ ] **Step 3: Thêm key i18n**

`frontend/src/i18n/vi.ts` (cấu trúc key phẳng, chèn cạnh các key `dashboard.*` quanh dòng 261-280):

```ts
  "dashboard.execution": "Chất lượng thực thi",
  "dashboard.plannedPct": "Đúng kế hoạch",
  "dashboard.plannedTarget": "mục tiêu ≥ 85%",
  "dashboard.noSetup": "Lệnh không có setup",
  "dashboard.impulsive": "Lệnh bốc đồng / trả thù",
  "dashboard.byTradeClass": "Phân bố loại lệnh",
  "dashboard.winLoss": "Thắng / Thua",
  "dashboard.even": "Hoà",
  "dashboard.theoryProfit": "Lợi nhuận lý thuyết",
  "dashboard.actualProfit": "Lợi nhuận thực tế",
  "dashboard.profitGap": "Chênh lệch",
```

`frontend/src/i18n/en.ts` — cùng bộ key:

```ts
  "dashboard.execution": "Execution quality",
  "dashboard.plannedPct": "As planned",
  "dashboard.plannedTarget": "target ≥ 85%",
  "dashboard.noSetup": "Trades with no setup",
  "dashboard.impulsive": "Impulsive / revenge trades",
  "dashboard.byTradeClass": "Trade class breakdown",
  "dashboard.winLoss": "Win / Loss",
  "dashboard.even": "Break-even",
  "dashboard.theoryProfit": "Theoretical profit",
  "dashboard.actualProfit": "Actual profit",
  "dashboard.profitGap": "Gap",
```

`frontend/src/i18n/i18n.test.tsx` nhiều khả năng có test "hai file cùng bộ key" — chạy nó ngay sau bước này để bắt lỗi thiếu key sớm:

```bash
cd frontend && npm test -- --run src/i18n
```

- [ ] **Step 4: Viết test cho `ExecutionQualityBlock` trước**

Tạo `frontend/src/features/dashboard/executionQualityBlock.test.tsx`. Render trần, khoanh vùng bằng `within` — ba ô có thể mang trùng con số.

```tsx
import { render, screen, within } from "@testing-library/react";
import { ExecutionQualityBlock } from "./ExecutionQualityBlock";
import type { ExecutionQuality } from "./types";

function ve(over: Partial<ExecutionQuality> = {}) {
  return render(
    <ExecutionQualityBlock
      data={{ planned_pct: "0.42", no_setup_count: 3, impulsive_count: 5, ...over }}
    />,
  );
}

// Nhãn ô lấy từ i18n; instance i18next toàn cục mặc định locale vi, nên tên ô
// là chuỗi tiếng Việt trong vi.ts. Nếu đổi mặc định, sửa cả ba dòng này.
function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện phần trăm đúng kế hoạch và hai bộ đếm", () => {
  ve();
  // formatPercent trả "42,00%" ở locale vi — hai chữ số thập phân, dấu phẩy.
  expect(o("Đúng kế hoạch").getByText("42,00%")).toBeInTheDocument();
  expect(o("Lệnh không có setup").getByText("3")).toBeInTheDocument();
  expect(o("Lệnh bốc đồng / trả thù").getByText("5")).toBeInTheDocument();
});

// null nghĩa là CHƯA CÓ LỆNH NÀO, không phải 0%. Hiện "0%" ở đó đọc ra là
// "bạn chưa vào đúng kế hoạch lệnh nào" — sai và làm nản người mới dùng.
test("planned_pct null thì hiện — chứ không phải 0%", () => {
  ve({ planned_pct: null });
  expect(o("Đúng kế hoạch").getByText("—")).toBeInTheDocument();
  expect(screen.queryByText("0,00%")).not.toBeInTheDocument();
});

// Ngưỡng 85% là chỉ số kỷ luật: dưới ngưỡng phải nhìn ra ngay.
test("dưới ngưỡng 85% thì tô màu cảnh báo", () => {
  const { container } = ve({ planned_pct: "0.42" });
  expect(container.querySelector(".text-destructive")).not.toBeNull();
});

test("đạt ngưỡng thì tô màu tốt", () => {
  const { container } = ve({ planned_pct: "0.9" });
  expect(container.querySelector(".text-primary")).not.toBeNull();
});
```

- [ ] **Step 5: Chạy để thấy đỏ**

```bash
cd frontend && npm test -- --run src/features/dashboard/executionQualityBlock.test.tsx
```

Expected: FAIL — không resolve được `./ExecutionQualityBlock`.

- [ ] **Step 6: Viết `ExecutionQualityBlock`**

Tạo `frontend/src/features/dashboard/ExecutionQualityBlock.tsx`. Ba ô, dùng lại đúng khuôn ô của `KpiGrid` (`role="group"` + `aria-label` + `bg-card`):

```tsx
import type { ReactNode } from "react";
import { compareDecimal, formatPercent } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import type { ExecutionQuality } from "./types";

// Ngưỡng 85% là mục tiêu ghi trong file Excel gốc (mục 13 sheet Explain).
// Dưới ngưỡng tô cảnh báo — đây là chỉ số KỶ LUẬT, không phải lãi lỗ, nên
// không dùng dauVaMau: "âm/dương" không có nghĩa gì ở đây.
const NGUONG_DUNG_KE_HOACH = "0.85";

function O({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={nhan} className="flex flex-col gap-1 bg-card p-3">
      <span className="eyebrow">{nhan}</span>
      {children}
    </div>
  );
}

export function ExecutionQualityBlock({ data }: { data: ExecutionQuality }) {
  const { locale, t } = useI18n();

  // So sánh trên chuỗi decimal, không Number() — quy tắc 1 của CLAUDE.md.
  const dat =
    data.planned_pct !== null &&
    compareDecimal(data.planned_pct, NGUONG_DUNG_KE_HOACH) >= 0;

  return (
    <div className="grid gap-px bg-border sm:grid-cols-3">
      <O nhan={t("dashboard.plannedPct")}>
        <span
          className={`num text-lg ${
            data.planned_pct === null ? "" : dat ? "text-primary" : "text-destructive"
          }`}
        >
          {data.planned_pct === null
            ? t("common.noValue")
            : formatPercent(data.planned_pct, 2, locale)}
        </span>
        <span className="text-xs text-muted-foreground">{t("dashboard.plannedTarget")}</span>
      </O>

      <O nhan={t("dashboard.noSetup")}>
        <span className="num text-lg">{data.no_setup_count}</span>
      </O>

      <O nhan={t("dashboard.impulsive")}>
        <span className="num text-lg">{data.impulsive_count}</span>
      </O>
    </div>
  );
}
```

`compareDecimal` đã được export sẵn (`@/lib/decimal:111`, trả `-1 | 0 | 1`).

⚠️ Một chỗ xác minh: `grep -n "className=\"grid" frontend/src/features/dashboard/KpiGrid.tsx` — copy đúng class lưới của `KpiGrid` nếu nó khác `gap-px bg-border` ở trên. Theme tắt hết `shadow-*`; phân tầng bằng border và bậc surface.

- [ ] **Step 7: Chạy test, phải xanh**

```bash
cd frontend && npm test -- --run src/features/dashboard/executionQualityBlock.test.tsx
```

- [ ] **Step 8: `TheorySummaryBlock` — cùng khuôn, làm liền tay**

Test `theorySummaryBlock.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { TheorySummaryBlock } from "./TheorySummaryBlock";
import type { TheorySummary } from "./types";

function ve(data: TheorySummary) {
  return render(<TheorySummaryBlock data={data} currency="USD" />);
}

function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện đủ ba con số", () => {
  ve({ theory: "250", actual: "190", diff: "-60" });
  expect(o("Lợi nhuận lý thuyết").getByText(/250/)).toBeInTheDocument();
  expect(o("Lợi nhuận thực tế").getByText(/190/)).toBeInTheDocument();
  expect(o("Chênh lệch").getByText(/60/)).toBeInTheDocument();
});

// Màu lấy theo dấu của DIFF, không theo dấu của actual: thực tế +190 vẫn là
// tin xấu nếu lý thuyết đáng lẽ +250.
test("chênh lệch âm tô màu lỗ dù thực tế vẫn dương", () => {
  const { container } = ve({ theory: "250", actual: "190", diff: "-60" });
  expect(container.querySelector(".text-destructive")).not.toBeNull();
});

test("chênh lệch dương tô màu lãi", () => {
  const { container } = ve({ theory: "100", actual: "180", diff: "80" });
  expect(container.querySelector(".text-primary")).not.toBeNull();
});
```

Component `TheorySummaryBlock.tsx`: ba ô cùng khuôn `O` như `ExecutionQualityBlock`, dùng `formatMoney(v, currency, locale)`. Ô chênh lệch lấy `const { dau, lop } = dauVaMau(data.diff)` rồi render `{dau}{formatMoney(...)}` với `className={lop}`. Hai ô đầu **không** tô màu theo dấu: chúng là mốc tham chiếu, tô cả ba sẽ làm loãng ô duy nhất cần đọc.

Chạy: `npm test -- --run src/features/dashboard/theorySummaryBlock.test.tsx` → PASS.

- [ ] **Step 9: `WinLossDonut`**

Recharts không vẽ SVG thật trong jsdom (không có kích thước container), nên **đừng assert vào biểu đồ** — assert vào phần chú giải dạng text mà component tự render. Đọc `charts.test.tsx` trước để xem repo đang xử lý chuyện này thế nào và làm theo.

Test `winLossDonut.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { WinLossDonut } from "./WinLossDonut";
import type { WinLossSplit } from "./types";

function ve(data: WinLossSplit) {
  return render(<WinLossDonut data={data} />);
}

test("hiện đủ ba con số, gồm cả lệnh hoà", () => {
  ve({ win_count: 7, loss_count: 3, even_count: 1 });
  const chuGiai = within(screen.getByRole("list", { name: "Thắng / Thua" }));
  expect(chuGiai.getByText("7")).toBeInTheDocument();
  expect(chuGiai.getByText("3")).toBeInTheDocument();
  expect(chuGiai.getByText("1")).toBeInTheDocument();
});

// Một lát 0% vẫn chiếm chỗ trong chú giải và làm người đọc tưởng có lệnh hoà.
test("không có lệnh hoà thì không hiện mục hoà", () => {
  ve({ win_count: 2, loss_count: 1, even_count: 0 });
  expect(screen.queryByText("Hoà")).not.toBeInTheDocument();
});
```

Component `WinLossDonut.tsx`: `PieChart` + `Pie` có `innerRadius` (doughnut), kèm một `<ul role="list" aria-label={t("dashboard.winLoss")}>` liệt kê ba mục — chú giải này vừa là thứ test đọc được, vừa là đường truy cập cho trình đọc màn hình, vốn không đọc được SVG. Màu: thắng `--primary`, thua `--status-error` (dùng đúng tên biến có trong `docs/design/theme.css`), hoà lấy màu trung tính từ `./palette`. **Lọc bỏ mục hoà khi `even_count === 0`** trước khi truyền vào cả `Pie` lẫn chú giải.

- [ ] **Step 10: `TradeClassChart`**

Test `tradeClassChart.test.tsx` — chuỗi loại lệnh phải khớp **nguyên văn** `domain/enums.go` (lấy từ output `grep` ở Task 2 Step 1, đừng gõ lại dấu tiếng Việt):

```tsx
import { render, screen } from "@testing-library/react";
import { TradeClassChart } from "./TradeClassChart";
import type { ClassStat } from "./types";

const rows: ClassStat[] = [
  { class: "CHƯA ĐÁNH GIÁ", count: 1, pct: "0.2", sum_net: "10" },
  { class: "ĐÚNG KẾ HOẠCH", count: 2, pct: "0.4", sum_net: "150" },
  { class: "CẦN CẢI THIỆN", count: 0, pct: "0", sum_net: "0" },
  { class: "BỐC ĐỒNG", count: 1, pct: "0.2", sum_net: "-30" },
  { class: "TRẢ THÙ", count: 1, pct: "0.2", sum_net: "-200" },
];

test("bảng liệt kê mọi loại có lệnh", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);
  expect(screen.getByText("ĐÚNG KẾ HOẠCH")).toBeInTheDocument();
  expect(screen.getByText("40,00%")).toBeInTheDocument(); // formatPercent, locale vi
});

// Backend cố ý trả đủ 5 hàng kể cả count = 0 để màu doughnut ổn định giữa hai
// lần render. Bảng thì ngược lại: hàng 0 lệnh chỉ làm loãng thông tin.
test("bảng bỏ loại không có lệnh nào", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);
  expect(screen.queryByText("CẦN CẢI THIỆN")).not.toBeInTheDocument();
});

test("net âm tô màu lỗ", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);
  const hang = screen.getByText("TRẢ THÙ").closest("tr");
  expect(hang?.querySelector(".text-destructive")).not.toBeNull();
});
```

Component: doughnut bên trái, bảng `Loại lệnh | Số lệnh | % | Net` bên phải (`grid lg:grid-cols-2`). Doughnut vẽ **cả 5 hàng** (màu theo chỉ số, ổn định); bảng `filter(r => r.count > 0)`. Cột Net tô theo dấu.

Màu cho 5 loại: thêm mảng vào `frontend/src/features/dashboard/palette.ts` — đọc file đó trước để theo đúng cách nó đang export màu, và chỉ dùng biến ngữ nghĩa.

- [ ] **Step 11: Cắm bốn component vào `DashboardPage`**

Sửa `frontend/src/features/dashboard/DashboardPage.tsx` — **không thêm section mới**, dùng section sẵn có:

Trong section `dashboard.growth` (sau `TheoryVsActualChart`, dòng ~133):
```tsx
            <TheorySummaryBlock data={c.theory_summary} currency={account.currency} />
```

Trong section `dashboard.quality` (sau `ScoreRadarBlock`, dòng ~177):
```tsx
            <ExecutionQualityBlock data={c.execution} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TradeClassChart rows={c.by_trade_class} currency={account.currency} />
              <WinLossDonut data={c.win_loss} />
            </div>
```

Thêm 4 dòng `import` cạnh các import component hiện có (dòng 17-18).

Lý do xếp vậy: ba tile lý thuyết-vs-thực tế là **tổng kết của biểu đồ ngay trên nó** — tách sang chỗ khác thì người đọc phải cuộn để nối hai thứ. Ba khối còn lại đều nói về chất lượng lệnh, thuộc đúng section `quality`.

- [ ] **Step 12: Cập nhật factory test**

`frontend/src/test/tradeFactory.ts` — bổ sung 4 trường vào object mặc định của `taoCharts` (dòng 119):

```ts
  execution: { planned_pct: "0.5", no_setup_count: 1, impulsive_count: 1 },
  by_trade_class: [
    { class: "CHƯA ĐÁNH GIÁ", count: 0, pct: "0", sum_net: "0" },
    { class: "ĐÚNG KẾ HOẠCH", count: 1, pct: "0.5", sum_net: "100" },
    { class: "CẦN CẢI THIỆN", count: 0, pct: "0", sum_net: "0" },
    { class: "BỐC ĐỒNG", count: 1, pct: "0.5", sum_net: "-50" },
    { class: "TRẢ THÙ", count: 0, pct: "0", sum_net: "0" },
  ],
  win_loss: { win_count: 1, loss_count: 1, even_count: 0 },
  theory_summary: { theory: "120", actual: "50", diff: "-70" },
```

Chuỗi loại lệnh phải khớp **nguyên văn** `backend/internal/domain/enums.go`. Chép từ output của `grep` ở Task 2 Step 1, đừng gõ lại dấu tiếng Việt bằng tay.

- [ ] **Step 13: Chạy cổng frontend đầy đủ**

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test -- --run
```

Expected: tsc exit 0, build ✓, toàn bộ test pass. `dashboardPage.test.tsx` có thể đỏ vì factory đổi — đọc lỗi rồi cập nhật kỳ vọng, đừng nới lỏng assert.

Nếu `node_modules` chưa có (`vite: command not found`), chạy `npm install` trước.

---

## Task 6: Ghi ba quyết định vào spec

Code đã đúng; giờ spec phải nói cùng một chuyện, nếu không lần đọc sau sẽ lại mở lại ba câu hỏi này.

**Files:**
- Modify: `trading-journal-plan.md` — §5 (mở đầu), §5.13–§5.16 (mới), §10 và §10.1
- Modify: `CLAUDE.md` — gỡ cảnh báo ⚠️ ở quy tắc 8

- [ ] **Step 1: Ghi luật top-6 vào §5**

```bash
grep -n "top 6\|Top 6\|top-6" trading-journal-plan.md
```

Tìm đoạn mở đầu §5 nói về quy ước pivot, bổ sung:

> **Top 6 sắp theo `count` giảm dần**, hoà thì theo tên tăng dần (`aggregate.topN`).
> Không sắp theo `sum_net`: nhóm lỗ nặng sẽ bị đẩy khỏi biểu đồ, mà đó lại đúng
> là nhóm người dùng cần nhìn. File Excel không cho biết tiêu chí — đây là
> quyết định của web.

- [ ] **Step 2: Thêm §5.13–§5.16**

Tìm số mục cuối cùng đang dùng trong §5 rồi đánh số tiếp — **đừng tin số 5.13 trong plan này**:

```bash
grep -n "^### 5\.\|^#### 5\." trading-journal-plan.md | tail -5
```

Bốn mục mới, viết theo đúng văn phong các mục §5 sẵn có (mỗi mục: nguồn Excel → công thức → khác biệt của web):

- **Chất lượng thực thi** — `planned_pct` (`Dashboard!S85`, mẫu số gồm cả lệnh chưa chấm), `no_setup_count` (`V85`), `impulsive_count` (mới). Kèm khối chú thích: nhãn Excel sai, web tách hai chỉ số.
- **Phân bố loại lệnh** — `Master!CF6:CH10`, `chart2.xml`. Luôn đủ 5 hàng; `pct = count / tổng lệnh`.
- **Thắng / Thua** — `chart4.xml`, `Dashboard!C22:F22`. Web thêm `even_count` vì §10 mục 2.
- **Ba tile lý thuyết-vs-thực tế** — `I85`/`L85`/`O85`, là **điểm cuối** hai chuỗi của mục lý thuyết-vs-thực tế, `diff = actual − theory`.

- [ ] **Step 3: Chuyển ba mục từ §10.1 lên §10**

Xoá cả ba gạch đầu dòng trong §10.1, thêm vào §10 (đánh số tiếp mục 7):

```markdown
8. **Top 6 sắp theo `count` giảm dần**, hoà thì theo tên — xem §5.
9. **Tile no-setup tách làm hai chỉ số:** `no_setup_count` (đúng công thức Excel
   `V85`) và `impulsive_count` (đúng nhãn Excel). Nhãn của file gốc sai so với
   công thức của chính nó; web không kế thừa lỗi đó.
10. **`current_balance` KHÔNG chịu bộ lọc — đã sửa.** `metrics.ComputeKPI` nhận
    cả tập đã lọc lẫn tập đầy đủ; số dư tính trên tập đầy đủ. Regression test:
    `TestComputeKPICurrentBalanceKhongChiuBoLoc` và
    `TestStatsCurrentBalanceKhongDoiKhiLoc`.
```

§10.1 giờ rỗng — xoá luôn tiêu đề mục, hoặc thay bằng một dòng "Không còn mục nào treo." Đừng để một tiêu đề rỗng: lần đọc sau sẽ tưởng nội dung bị mất.

- [ ] **Step 4: Gỡ cảnh báo ở `CLAUDE.md`**

Trong quy tắc 8, xoá dòng:

```
     ⚠️ Code hiện **chưa** theo ngoại lệ này — xem `trading-journal-plan.md` §10.1.
```

thay bằng:

```
     Đã cài đặt: `metrics.ComputeKPI(filtered, all, acc, flows)` — số dư tính
     trên `all`, phần KPI còn lại tính trên `filtered`.
```

- [ ] **Step 5: Xác minh spec không còn tự mâu thuẫn**

```bash
grep -n "chưa\|CHƯA\|còn phải chốt\|Còn phải chốt\|⚠️" trading-journal-plan.md | grep -i "current_balance\|top 6\|no.setup\|10\.1"
grep -n "10\.1" trading-journal-plan.md CLAUDE.md
```

Expected: không còn dòng nào nói ba mục này đang treo, và không còn tham chiếu tới §10.1 đã xoá. Nếu còn, sửa nốt — đây chính là loại sót đã xảy ra ở plan trước (§3.3 vẫn nói ISO "cần thống nhất" sau khi §10 đã chốt).

- [ ] **Step 6: Chạy toàn bộ cổng lần cuối**

```bash
make test
cd frontend && npx tsc --noEmit && npm run build && npm test -- --run
```

Expected: backend 10 package xanh; frontend tsc 0, build ✓, mọi test pass.

---

## Định nghĩa xong

- [ ] `make test` — 10 package xanh
- [ ] `cd frontend && npx tsc --noEmit && npm run build && npm test -- --run` — xanh
- [ ] `grep -rn "ComputeKPI(" backend/ --include='*.go'` — mọi call site có 4 tham số
- [ ] `TestStatsCurrentBalanceKhongDoiKhiLoc` tồn tại và xanh
- [ ] `curl` (hoặc test handler) thấy `/charts` trả đủ 4 key mới: `execution`, `by_trade_class`, `win_loss`, `theory_summary`
- [ ] Dashboard hiện đủ 4 khối mới, đúng section, không có hex hardcode
- [ ] `grep -n "10\.1" trading-journal-plan.md CLAUDE.md` — không còn kết quả
- [ ] `git status` — mọi thứ **unstaged**, không có commit nào

## Ngoài phạm vi (cố ý)

- **T1/T2/T3/T10 — dòng tiền:** bảng nạp/rút, chọn currency, tile số dư. Có migration schema nên tách phase riêng.
- **T8 — rebase chuỗi lý thuyết theo khoảng lọc:** đã chốt **không** làm (§10 mục 7), web cố ý lệch Excel.
- **Phase 5 — import CSV:** mapping `BUY`/`SELL` đã ghi ở §1, nhưng code import chưa thuộc plan này.
