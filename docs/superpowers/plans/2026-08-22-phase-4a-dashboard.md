# Phase 4a — Dashboard: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng trang `/dashboard` với 23 KPI và bảy biểu đồ pivot trên endpoint `GET /api/accounts/{id}/charts` mà Phase 3a đã có, không sửa một dòng backend nào.

**Architecture:** Một feature folder `src/features/dashboard/` theo khuôn `features/trades/`. Phần dễ sai tách hẳn vào module thuần `prepare.ts` — nó là chỗ **duy nhất** đổi chuỗi tiền sang số cho Recharts, và test được không cần DOM. Component chart chỉ là vỏ mỏng, chỉ smoke test. Bộ lọc dùng chung với `/trades` qua URL.

**Tech Stack:** Vite 8 · React 19 · TypeScript 7 · TanStack Query v5 · React Router v7 · Recharts 3.10 · Tailwind v4 · Vitest 4 + Testing Library + MSW · Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-phase-4a-dashboard-design.md`

## Global Constraints

Mọi task đều ngầm mang theo mục này.

- **Tiền là chuỗi, không bao giờ `number`.** Ngoại lệ duy nhất là `toPlot()` ở Task 1, và nó chỉ được gọi từ `src/features/dashboard/prepare.ts`.
- **Cấm `Number(`, `parseFloat(`, `parseInt(`** trong mã dự án. Cổng `src/test/styleguard.test.ts` canh, và nó quét cả **comment** — đừng viết ba tên đó trong lời giải thích. Dùng `+v` sau khi regex đã bảo đảm.
- **Cấm hardcode màu hex trong `.ts`/`.tsx`.** Hai màu chart khai bằng biến CSS trong `src/styles/`, component chỉ tham chiếu tên biến.
- **Cấm `shadow-*`** trong `src/components/ui/`. Cổng quét nguyên văn cả file, kể cả trong comment.
- **Cấm chép cứng chuỗi enum tiếng Việt** vào FE — lấy từ `useMetaEnums()`.
- **Không sửa `docs/design/theme.css`** và không sửa `src/styles/theme.css`.
- **Không sửa `backend/`.** Cuối phase `git diff main -- backend/` phải rỗng.
- **Không cắt/sort lại thứ tự backend đã quyết** — xem spec §3.1, bảy dòng.
- Mỗi task chạy test thật rồi mới đánh dấu xong. Mỗi bất biến ghi trong plan phải **falsify**: phá thật, xem test đỏ, khôi phục.
- Node ≥ 20 (`nvm use 22`). Lệnh test: `cd frontend && npx vitest run <đường dẫn>`.

## Bản đồ file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `frontend/src/features/dashboard/types.ts` | kiểu thuần, ánh xạ 1-1 `aggregate.Charts` |
| `frontend/src/features/dashboard/prepare.ts` | JSON → mảng Recharts; chỗ **duy nhất** gọi `toPlot` |
| `frontend/src/features/dashboard/hooks.ts` | `useCharts(accountId, filter)` |
| `frontend/src/features/dashboard/palette.ts` | tên biến CSS của hai màu chart |
| `frontend/src/features/dashboard/PivotBarChart.tsx` | cột dùng chung cho bốn nhóm `Pivot[]` |
| `frontend/src/features/dashboard/WeekdayChart.tsx` | cột tách phần lãi / phần lỗ |
| `frontend/src/features/dashboard/DailyPnlChart.tsx` | cột `sum_net` + đường `cum_by_day` |
| `frontend/src/features/dashboard/KpiGrid.tsx` | 23 KPI, ngưỡng màu §8.2 |
| `frontend/src/features/dashboard/StreakBlock.tsx` | cặp streak + lời nhắc "không theo bộ lọc" |
| `frontend/src/features/dashboard/DashboardPage.tsx` | ghép các mục |
| `frontend/src/lib/thresholds.ts` | ngưỡng màu dùng chung `StatsStrip` ↔ `KpiGrid` |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `frontend/package.json` | thêm `recharts` |
| `frontend/src/lib/decimal.ts` | thêm `toPlot` |
| `frontend/src/lib/queryKeys.ts` | thêm `charts`, `chartsAll` |
| `frontend/src/styles/index.css` | hai biến `--chart-profit`, `--chart-loss` |
| `frontend/src/features/trades/hooks.ts` | `useLamMoi` thêm nhánh thứ tư |
| `frontend/src/features/trades/StatsStrip.tsx` | dùng ngưỡng từ `lib/thresholds.ts` |
| `frontend/src/test/styleguard.test.ts` | cổng `toPlot` chỉ ở `prepare.ts` |
| `frontend/src/test/tradeFactory.ts` | thêm `taoCharts()` |
| `frontend/src/app/router.tsx` | thêm `/dashboard`, đổi đích `*` |
| `frontend/src/app/AppShell.tsx` | thêm NavLink |
| `frontend/src/i18n/vi.ts`, `en.ts` | chuỗi dashboard |

**Chuyển chỗ**

| từ | sang |
|---|---|
| `frontend/src/features/trades/FilterBar.tsx` | `frontend/src/components/FilterBar.tsx` |
| `frontend/src/features/trades/filterBar.test.tsx` | `frontend/src/components/filterBar.test.tsx` |

---

### Task 1: `toPlot` — ranh giới chuỗi sang số

Spec §2.3. Task đầu vì mọi biểu đồ đứng trên nó.

**Files:**
- Modify: `frontend/src/lib/decimal.ts`
- Test: `frontend/src/lib/decimal.test.ts` (đã có, nối thêm)

**Interfaces:**
- Consumes: không có.
- Produces:
  ```ts
  export function toPlot(value: string): number;
  ```

- [ ] **Step 1: Viết test đỏ**

Nối vào cuối `frontend/src/lib/decimal.test.ts`:

```ts
describe("toPlot", () => {
  // toPlot là NGOẠI LỆ DUY NHẤT của quy tắc "tiền không bao giờ là number",
  // và nó tồn tại vì Recharts đặt pixel từ number chứ không từ chuỗi. Giá trị
  // nó trả về chỉ dùng để đặt toạ độ; mọi chữ số người đọc thấy vẫn đi qua
  // formatMoney trên chuỗi gốc.
  test.each([
    ["0", 0],
    ["120.50", 120.5],
    ["-51", -51],
    ["350", 350],
    ["0.4375", 0.4375],
    ["-0", -0],
  ])("%s ra %d", (vao, mongDoi) => {
    expect(toPlot(vao)).toBe(mongDoi);
  });

  // Ném chứ không trả NaN. NaN đi tiếp vào Recharts sẽ thành một cột KHÔNG
  // VẼ RA — không có lỗi nào bật lên, chỉ có một cột biến mất khỏi biểu đồ.
  test.each(["", "abc", "1.2.3", "12px", "1e3"])("chuỗi hỏng %o thì ném", (v) => {
    expect(() => toPlot(v)).toThrow();
  });

  // Ranh giới đúng nghĩa: độ chính xác MẤT ở đây là chấp nhận được vì đầu ra
  // chỉ để đặt pixel, nhưng chuỗi gốc vẫn còn nguyên cho nhãn. Test này ghim
  // rằng ta BIẾT mình đang mất gì, chứ không phải vô tình.
  test("mất độ chính xác là có chủ ý và chỉ ở đầu ra số", () => {
    const goc = "0.1234567890123456789";
    expect(toPlot(goc)).toBeCloseTo(0.12345678901234568, 15);
    expect(goc).toBe("0.1234567890123456789"); // chuỗi gốc không bị đụng
  });
});
```

Thêm `toPlot` vào dòng `import` sẵn có ở đầu file test.

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/lib/decimal.test.ts
```

Kỳ vọng: đỏ với `toPlot is not a function` hoặc lỗi import.

- [ ] **Step 3: Viết `toPlot` vào `src/lib/decimal.ts`**

Nối vào cuối file, **trên** dòng `import type { Locale }`:

```ts
/**
 * NGOẠI LỆ DUY NHẤT của quy tắc "tiền là chuỗi" (CLAUDE.md quy tắc 1).
 *
 * Recharts đặt pixel từ `number`, nên ở ranh giới vẽ buộc phải đổi. Tách bạch
 * hai vai của một con số thì mâu thuẫn biến mất:
 *
 *   toạ độ  -> number, trình duyệt đọc, sai số 1e-16 không ai thấy
 *   chữ số  -> string, con người đọc, sai một chữ số là sai
 *
 * Giá trị hàm này trả về CHỈ được dùng để đặt toạ độ. Cấm đưa nó ra nhãn,
 * tooltip, hay gửi ngược lên backend — cổng trong src/test/styleguard.test.ts
 * chặn `toPlot` xuất hiện ngoài features/dashboard/prepare.ts.
 *
 * Ném thay vì trả NaN: NaN lọt vào Recharts cho ra một cột KHÔNG VẼ RA, không
 * kèm lỗi nào. Một cột biến mất trông y hệt một nhóm không có dữ liệu.
 *
 * Dùng `+v` chứ không phải hàm ép kiểu có tên — ba cái tên đó bị cổng styleguard
 * cấm, và `+v` sau khi DANG_SO đã bảo đảm dạng thì an toàn ngang nhau.
 */
export function toPlot(value: string): number {
  const v = value.trim();
  if (!DANG_SO.test(v) || v === "" || v === "-" || v === "+" || v === ".") {
    throw new Error(`toPlot: không phải số thập phân: ${JSON.stringify(value)}`);
  }
  return +v;
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/lib/decimal.test.ts && npx tsc --noEmit
```

Kỳ vọng: toàn bộ test của `decimal.test.ts` xanh, `tsc` exit 0.

- [ ] **Step 5: Falsify — không được trả `NaN` im lặng**

Đổi thân hàm thành `return +value;` (bỏ hết phần kiểm).

Chạy lại. Kỳ vọng: **đỏ** ở cả năm ca chuỗi hỏng — `"abc"` ra `NaN` mà không ném, `"1e3"` ra `1000`, `""` ra `0`. Khôi phục.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/decimal.ts frontend/src/lib/decimal.test.ts
git commit -m "feat(fe): add toPlot, the single string-to-number boundary for charts

Recharts đặt pixel từ number nên ở ranh giới vẽ buộc phải đổi. Ném thay vì
trả NaN: NaN lọt vào Recharts cho ra một cột không vẽ ra, không kèm lỗi nào."
```

---

### Task 2: cổng styleguard cho `toPlot`

Spec §2.3. Làm ngay sau Task 1 để mọi task sau bị canh từ đầu, chứ không phải dọn ở cuối.

**Files:**
- Modify: `frontend/src/test/styleguard.test.ts`

**Interfaces:**
- Consumes: `toPlot` (Task 1).
- Produces: không có API mới.

- [ ] **Step 1: Viết cổng**

Nối vào cuối `frontend/src/test/styleguard.test.ts`:

```ts
// Ranh giới chuỗi->số phải là MỘT chỗ, và phải là chỗ đã biết tên.
//
// toPlot ném đi độ chính xác mà cả backend lẫn src/lib/decimal.ts bỏ công giữ.
// Đổi lấy điều đó là hợp lý ĐÚNG MỘT CHỖ: nơi dựng mảng cho Recharts. Rải nó
// vào component thì mỗi lần rải là một chỗ có thể lỡ đưa số đã mất chính xác
// ra nhãn, và không có test nào bắt được vì con số vẫn trông rất bình thường.
const CHO_DUOC_DUNG_TOPLOT = join("features", "dashboard", "prepare.ts");

test("toPlot chỉ được gọi trong features/dashboard/prepare.ts", () => {
  const pham = fileCuaMinh.filter(
    (f) => !f.endsWith(CHO_DUOC_DUNG_TOPLOT) && !f.endsWith(join("lib", "decimal.ts")),
  );
  expect(pham.length).toBeGreaterThan(0);

  for (const f of pham) {
    expect(
      readFileSync(f, "utf8"),
      `${f} gọi toPlot; chỉ features/dashboard/prepare.ts được gọi, xem spec 4a §2.3`,
    ).not.toMatch(/\btoPlot\s*\(/);
  }
});
```

- [ ] **Step 2: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/test/styleguard.test.ts
```

Kỳ vọng: xanh. Chưa có file nào gọi `toPlot` nên cổng đứng canh sẵn cho các task sau.

- [ ] **Step 3: Falsify — cổng phải bắt được vi phạm thật**

Tạm thêm dòng này vào cuối `frontend/src/features/trades/StatsStrip.tsx`:

```ts
const thu = toPlot("1");
```

Chạy lại. Kỳ vọng: **đỏ** với thông báo nêu đúng tên file `StatsStrip.tsx`. Xoá dòng vừa thêm.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/test/styleguard.test.ts
git commit -m "test(fe): gate toPlot to the one module allowed to call it

Ranh giới chuỗi->số phải là một chỗ có tên. Rải nó vào component thì mỗi lần
rải là một chỗ có thể lỡ đưa số đã mất chính xác ra nhãn."
```

---

### Task 3: `types.ts` — hợp đồng `/charts`

Spec §3. Không có mã chạy, nên `npx tsc --noEmit` ở Task 4 là phép kiểm của nó.

**Files:**
- Create: `frontend/src/features/dashboard/types.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  ```ts
  export type Pivot = { key: string; count: number; win_count: number;
                        sum_net: string; ave_net: string; win_rate: string };
  export type WeekdayStat = Pivot & { profit_positive: string; profit_negative: string };
  export type DayStat = { day: string; count: number; sum_net: string; cum_by_day: string };
  export type HeatmapCell = { day: string; sum_net: string; count: number };
  export type HeatmapMonth = { month: string; cells: HeatmapCell[] };
  export type RBucket = { label: string; count: number; wins: number; losses: number };
  export type ScoreSummary = { scored_count: number; avg_score_total: string | null };
  export type Radar = { avg_entry: string | null; avg_in_trade: string | null;
                        avg_exit: string | null; avg_psych: string | null };
  export type TheoryPoint = { stt: number; cum_theory: string; cum_by_trade: string };
  export type Charts = { /* 14 trường, xem Step 1 */ };
  ```

- [ ] **Step 1: Viết `src/features/dashboard/types.ts`**

```ts
// Ánh xạ 1-1 từ aggregate.Charts. Hình dạng dưới đây chép từ
// backend/internal/httpapi/testdata/charts.golden.json — file mà backend dùng
// để ghim hợp đồng JSON — chứ không suy ra từ struct Go.
//
// Mọi trường TIỀN là chuỗi. Các trường KHÔNG phải tiền — count, win_count,
// wins, losses, stt, scored_count, hai *_streak — là number.
//
// Khai đủ cả 14 trường dù 4a chỉ vẽ bảy: chúng cùng về trong MỘT response, và
// khai thiếu thì 4b phải sửa lại kiểu thay vì chỉ thêm component.

export type Pivot = {
  key: string;
  count: number;
  win_count: number;
  sum_net: string;
  ave_net: string;
  // PHÂN SỐ 0..1, không phải phần trăm: "1" nghĩa là 100%.
  // Dán "%" thẳng vào đây cho ra "1%" — sai một trăm lần.
  win_rate: string;
};

export type WeekdayStat = Pivot & {
  profit_positive: string;
  profit_negative: string; // ÂM hoặc "0"
};

export type DayStat = {
  day: string; // "2026-06-09"
  count: number;
  sum_net: string;
  cum_by_day: string;
};

// Bốn kiểu dưới đây chưa dùng ở 4a — chúng thuộc 4b. Khai sẵn vì backend đã
// gửi chúng về trong cùng response.
export type HeatmapCell = { day: string; sum_net: string; count: number };
export type HeatmapMonth = { month: string; cells: HeatmapCell[] }; // month: "06/2026"
export type RBucket = { label: string; count: number; wins: number; losses: number };
export type ScoreSummary = { scored_count: number; avg_score_total: string | null };
export type Radar = {
  avg_entry: string | null;
  avg_in_trade: string | null;
  avg_exit: string | null;
  avg_psych: string | null;
};
export type TheoryPoint = { stt: number; cum_theory: string; cum_by_trade: string };

export type Charts = {
  by_setup: Pivot[];
  by_symbol: Pivot[];
  by_timeframe: Pivot[];
  by_direction: Pivot[];
  by_weekday: WeekdayStat[];
  by_week: Pivot[];
  by_day: DayStat[];

  heatmap: HeatmapMonth[];
  r_distribution: RBucket[];
  score: ScoreSummary;
  radar: Radar;
  theory_vs_actual: TheoryPoint[];

  // Hai con số này tính trên TOÀN BỘ lệnh của account, không phải trên tập đã
  // lọc: aggregate.All gọi Streaks(all) trong khi mười hai nhóm trên nhận
  // filtered (backend/internal/aggregate/charts.go:175). Đó là quy tắc 8 của
  // CLAUDE.md. Hệ quả trên màn hình: đổi bộ lọc thì mọi thứ khác đổi số, còn
  // hai con số này đứng yên — StreakBlock phải nói rõ điều đó.
  longest_win_streak: number;
  longest_loss_streak: number;
};
```

- [ ] **Step 2: Kiểm kiểu**

```bash
cd frontend && npx tsc --noEmit
```

Kỳ vọng: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/dashboard/types.ts
git commit -m "feat(fe): add the charts contract, copied from the golden fixture

Khai đủ 14 trường dù 4a chỉ vẽ bảy: chúng cùng về trong một response, và khai
thiếu thì 4b phải sửa lại kiểu thay vì chỉ thêm component."
```

---

### Task 4: `prepare.ts` — module thuần, chỗ dễ sai nhất

Spec §2.3, §2.5, §3.1. Đây là nơi mọi quyết định về dữ liệu nằm lại, và là task có nhiều test nhất.

**Files:**
- Create: `frontend/src/features/dashboard/palette.ts`
- Create: `frontend/src/features/dashboard/prepare.ts`
- Test: `frontend/src/features/dashboard/prepare.test.ts`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `toPlot`, `formatMoney`, `formatPercent`, `compareDecimal` (`@/lib/decimal`); `Pivot`, `WeekdayStat`, `DayStat` (Task 3).
- Produces:
  ```ts
  // palette.ts
  export const MAU_LAI = "var(--chart-profit)";
  export const MAU_LO = "var(--chart-loss)";
  export const MAU_TRUNG_TINH = "var(--text-muted)";
  export function mauTheoDau(v: string): string;

  // prepare.ts
  export type CotPivot = {
    key: string; net: number; netGoc: string; mau: string;
    count: number; winRateGoc: string;
  };
  export type CotWeekday = {
    key: string; lai: number; laiGoc: string; lo: number; loGoc: string; count: number;
  };
  export type DiemNgay = {
    day: string; net: number; netGoc: string; mau: string;
    cum: number; cumGoc: string; count: number;
  };
  export function chuanBiPivot(rows: Pivot[]): CotPivot[];
  export function chuanBiWeekday(rows: WeekdayStat[]): CotWeekday[];
  export function chuanBiNgay(rows: DayStat[]): DiemNgay[];
  ```

- [ ] **Step 1: Thêm hai biến CSS**

Trong `frontend/src/styles/index.css`, thêm vào cuối file:

```css
/* Hai màu dành riêng cho MẢNG TÔ của biểu đồ.
 *
 * Khác --primary và --status-error một bậc, và đó là chủ ý chứ không phải
 * tuỳ tiện: --primary (#12b886) đo được 2.55:1 trên nền trắng — dưới ngưỡng
 * 3:1 — và OKLCH L 0.695 nằm ngoài dải 0.48-0.67 của nền tối. Nó vẫn đúng cho
 * CHỮ và vệt nhỏ; nó chỉ trượt ở vai mảng tô lớn.
 *
 * Cặp dưới đây đạt cả sáu phép kiểm ở CẢ HAI theme, nên không đảo theo theme.
 * Chạy lại khi đổi:
 *   node scripts/validate_palette.js "#0ca678,#e03131" --mode light --surface "#ffffff"
 *   node scripts/validate_palette.js "#0ca678,#e03131" --mode dark  --surface "#171f2e"
 *
 * Khai ở đây chứ không ở theme.css vì CLAUDE.md cấm sửa file đó.
 */
:root {
  --chart-profit: #0ca678;
  --chart-loss: #e03131;
}
```

- [ ] **Step 2: Viết `src/features/dashboard/palette.ts`**

```ts
import { compareDecimal } from "@/lib/decimal";

// Chỉ TÊN BIẾN, không bao giờ hex: cổng styleguard cấm hex trong .ts/.tsx, và
// giá trị thật nằm ở src/styles/index.css cùng với lệnh chạy lại validator.
export const MAU_LAI = "var(--chart-profit)";
export const MAU_LO = "var(--chart-loss)";
export const MAU_TRUNG_TINH = "var(--text-muted)";

/**
 * Màu theo DẤU của giá trị, so bằng chuỗi.
 *
 * Ba nhánh chứ không phải hai: net = 0 là hoà, không phải lỗ. Tô nó đỏ sẽ đếm
 * một lệnh hoà vào phía thua bằng thị giác, trong khi backend không đếm nó vào
 * loss_count.
 */
export function mauTheoDau(v: string): string {
  const d = compareDecimal(v, "0");
  return d > 0 ? MAU_LAI : d < 0 ? MAU_LO : MAU_TRUNG_TINH;
}
```

- [ ] **Step 3: Viết test đỏ**

Tạo `frontend/src/features/dashboard/prepare.test.ts`:

```ts
import { MAU_LAI, MAU_LO, MAU_TRUNG_TINH } from "./palette";
import { chuanBiNgay, chuanBiPivot, chuanBiWeekday } from "./prepare";
import type { DayStat, Pivot, WeekdayStat } from "./types";

function pivot(over: Partial<Pivot> = {}): Pivot {
  return {
    key: "Break-retest",
    count: 3,
    win_count: 2,
    sum_net: "118.50",
    ave_net: "39.50",
    win_rate: "0.6667",
    ...over,
  };
}

test("giữ nguyên thứ tự backend đã trả", () => {
  // Backend đã cắt top 6 và đã sắp xong (topN trong pivot.go:83; ByTimeframe
  // giữ thứ tự M1->W). Sắp lại ở FE là dựng một nguồn sự thật thứ hai sẽ trôi
  // lệch. Ca này cố ý KHÔNG theo thứ tự bảng chữ cái lẫn thứ tự số lệnh.
  const vao = [
    pivot({ key: "M15", count: 1, sum_net: "-51" }),
    pivot({ key: "H1", count: 9, sum_net: "98" }),
  ];
  expect(chuanBiPivot(vao).map((r) => r.key)).toEqual(["M15", "H1"]);
});

test("không cắt bớt nhóm nào, kể cả nhóm rỗng", () => {
  // by_direction luôn trả đủ hai nhóm và by_weekday luôn đủ bảy ngày, kể cả
  // count = 0. Lọc bỏ chúng làm biểu đồ mất cột, và một cột vắng mặt trông
  // khác hẳn một cột bằng 0.
  const vao = [pivot({ key: "Long", count: 1 }), pivot({ key: "Short", count: 0, sum_net: "0" })];
  expect(chuanBiPivot(vao)).toHaveLength(2);
});

test("mỗi cột mang CẢ HAI dạng: số để vẽ, chuỗi để đọc", () => {
  const [c] = chuanBiPivot([pivot({ sum_net: "118.50" })]);
  expect(c.net).toBe(118.5);      // toạ độ
  expect(c.netGoc).toBe("118.50"); // chữ số, giữ nguyên cả số 0 cuối
});

test.each([
  ["120", MAU_LAI],
  ["-51", MAU_LO],
  ["0", MAU_TRUNG_TINH],
])("net %s tô màu theo dấu", (net, mongDoi) => {
  expect(chuanBiPivot([pivot({ sum_net: net })])[0].mau).toBe(mongDoi);
});

test("win_rate giữ nguyên dạng phân số, không tự nhân 100", () => {
  // Nhân ở đây rồi lại nhân lần nữa ở formatPercent là ra 6667%. Việc đổi sang
  // phần trăm thuộc tầng hiển thị, và formatPercent đã làm.
  expect(chuanBiPivot([pivot({ win_rate: "0.6667" })])[0].winRateGoc).toBe("0.6667");
});

test("weekday tách phần lãi và phần lỗ thành hai cột", () => {
  const wd: WeekdayStat = {
    ...pivot({ key: "Tue", count: 2 }),
    profit_positive: "98",
    profit_negative: "-51",
  };
  const [c] = chuanBiWeekday([wd]);
  expect(c.lai).toBe(98);
  expect(c.lo).toBe(-51);
  expect(c.laiGoc).toBe("98");
  expect(c.loGoc).toBe("-51");
});

test("ngày mang cả cột net lẫn điểm của đường lũy kế", () => {
  const ngay: DayStat[] = [
    { day: "2026-06-09", count: 1, sum_net: "98", cum_by_day: "98" },
    { day: "2026-06-10", count: 1, sum_net: "-51", cum_by_day: "47" },
  ];
  const ra = chuanBiNgay(ngay);
  expect(ra.map((r) => r.net)).toEqual([98, -51]);
  expect(ra.map((r) => r.cum)).toEqual([98, 47]);
  expect(ra[1].mau).toBe(MAU_LO);
  // Đường lũy kế KHÔNG đổi màu theo ngày: nó là một đường liên tục, và tô
  // từng đoạn theo dấu của ngày sẽ đọc thành một đường đứt quãng.
  expect(ra[1].cumGoc).toBe("47");
});

test("mảng rỗng ra mảng rỗng, không ném", () => {
  expect(chuanBiPivot([])).toEqual([]);
  expect(chuanBiWeekday([])).toEqual([]);
  expect(chuanBiNgay([])).toEqual([]);
});
```

- [ ] **Step 4: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/prepare.test.ts
```

Kỳ vọng: đỏ với `Failed to resolve import "./prepare"`.

- [ ] **Step 5: Viết `src/features/dashboard/prepare.ts`**

```ts
import { toPlot } from "@/lib/decimal";
import { mauTheoDau } from "./palette";
import type { DayStat, Pivot, WeekdayStat } from "./types";

/**
 * Chỗ DUY NHẤT trong dự án đổi tiền từ chuỗi sang số.
 *
 * Mọi hàng trả về mang CẢ HAI dạng của cùng một con số:
 *
 *   net    (number) -> Recharts đặt pixel
 *   netGoc (string) -> tooltip và nhãn, đi qua formatMoney
 *
 * Giữ cả hai chứ không đổi ngược lại từ số: `String(118.5)` cho ra "118.5",
 * mất số 0 cuối mà backend cố ý gửi. Chuỗi gốc là thứ duy nhất còn đúng.
 *
 * KHÔNG sắp xếp lại và KHÔNG cắt bớt: backend đã quyết cả hai (spec 4a §3.1).
 * Thứ tự của by_timeframe là M1->W chứ không theo số lệnh, nên một lần .sort()
 * ở đây là một lần làm sai mà biểu đồ vẫn trông hợp lý.
 */

export type CotPivot = {
  key: string;
  net: number;
  netGoc: string;
  mau: string;
  count: number;
  winRateGoc: string;
};

export type CotWeekday = {
  key: string;
  lai: number;
  laiGoc: string;
  lo: number;
  loGoc: string;
  count: number;
};

export type DiemNgay = {
  day: string;
  net: number;
  netGoc: string;
  mau: string;
  cum: number;
  cumGoc: string;
  count: number;
};

export function chuanBiPivot(rows: Pivot[]): CotPivot[] {
  return rows.map((r) => ({
    key: r.key,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    mau: mauTheoDau(r.sum_net),
    count: r.count,
    // Giữ nguyên dạng phân số. formatPercent sẽ nhân 100 lúc hiển thị; nhân ở
    // đây nữa là nhân hai lần.
    winRateGoc: r.win_rate,
  }));
}

export function chuanBiWeekday(rows: WeekdayStat[]): CotWeekday[] {
  return rows.map((r) => ({
    key: r.key,
    lai: toPlot(r.profit_positive),
    laiGoc: r.profit_positive,
    lo: toPlot(r.profit_negative),
    loGoc: r.profit_negative,
    count: r.count,
  }));
}

export function chuanBiNgay(rows: DayStat[]): DiemNgay[] {
  return rows.map((r) => ({
    day: r.day,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    mau: mauTheoDau(r.sum_net),
    cum: toPlot(r.cum_by_day),
    cumGoc: r.cum_by_day,
    count: r.count,
  }));
}
```

- [ ] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/prepare.test.ts && npx tsc --noEmit
```

Kỳ vọng: 11 test xanh, `tsc` exit 0.

- [ ] **Step 7: Falsify bất biến — không được sắp lại thứ tự backend**

Trong `chuanBiPivot`, đổi `rows.map(...)` thành:

```ts
return [...rows].sort((a, b) => b.count - a.count).map((r) => ({
```

Chạy lại. Kỳ vọng: **đỏ** ở `giữ nguyên thứ tự backend đã trả` — nhận `["H1", "M15"]` thay vì `["M15", "H1"]`. Khôi phục.

- [ ] **Step 8: Falsify bất biến — phải giữ chuỗi gốc, không dựng lại từ số**

Trong `chuanBiPivot`, đổi `netGoc: r.sum_net` thành `netGoc: String(toPlot(r.sum_net))`.

Chạy lại. Kỳ vọng: **đỏ** ở `mỗi cột mang CẢ HAI dạng` — nhận `"118.5"` thay vì `"118.50"`. Khôi phục.

- [ ] **Step 9: Falsify bất biến — hoà không phải lỗ**

Trong `palette.ts`, đổi `mauTheoDau` thành `return compareDecimal(v, "0") > 0 ? MAU_LAI : MAU_LO;`

Chạy lại. Kỳ vọng: **đỏ** ở ca `net 0 tô màu theo dấu`. Khôi phục.

- [ ] **Step 10: Chạy cổng styleguard**

```bash
cd frontend && npx vitest run src/test/styleguard.test.ts
```

Kỳ vọng: xanh — `toPlot` chỉ nằm trong `prepare.ts`, và `palette.ts` không có hex nào.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/styles/index.css \
        frontend/src/features/dashboard/palette.ts \
        frontend/src/features/dashboard/prepare.ts \
        frontend/src/features/dashboard/prepare.test.ts
git commit -m "feat(fe): add the pure chart-data layer and the validated colour pair

Mỗi hàng mang cả hai dạng của một con số: number để đặt pixel, chuỗi gốc để
đọc. Không sắp lại và không cắt bớt — backend đã quyết cả hai."
```

---

### Task 5: query key, `useCharts`, và bất biến invalidate

Spec §5. Đây là **bất biến số 1** của phase và là chỗ sai im lặng nguy hiểm nhất.

**Files:**
- Modify: `frontend/src/lib/queryKeys.ts`
- Modify: `frontend/src/features/trades/hooks.ts`
- Modify: `frontend/src/test/tradeFactory.ts`
- Create: `frontend/src/features/dashboard/hooks.ts`
- Test: `frontend/src/features/dashboard/hooks.test.tsx`

**Interfaces:**
- Consumes: `Charts` (Task 3); `TradeFilter`, `EMPTY_FILTER`, `toQuery` (`@/features/trades/filters`).
- Produces:
  ```ts
  // queryKeys.ts — thêm vào object qk đã có
  qk.charts(accountId: number, f: TradeFilter)
  qk.chartsAll(accountId: number)

  // test/tradeFactory.ts
  export function taoCharts(over?: Partial<Charts>): Charts;

  // features/dashboard/hooks.ts
  export function useCharts(accountId: number, f: TradeFilter);
  ```

- [ ] **Step 1: Thêm hai key vào `src/lib/queryKeys.ts`**

Chèn ngay sau dòng `trash:`, bên trong object `qk`:

```ts
  charts: (accountId: number, f: TradeFilter) => ["accounts", accountId, "charts", f] as const,
  chartsAll: (accountId: number) => ["accounts", accountId, "charts"] as const,
```

- [ ] **Step 2: Thêm `taoCharts` vào `src/test/tradeFactory.ts`**

Thêm `Charts` vào khối import **ở đầu file** (import phải nằm trên cùng, không nối xuống cuối):

```ts
import type { Charts } from "@/features/dashboard/types";
```

Rồi nối hàm dưới đây vào cuối file:

```ts
/**
 * Charts mẫu, lấy số thẳng từ backend/internal/httpapi/testdata/charts.golden.json.
 *
 * Dùng đúng file mà backend đã ghim nghĩa là hai bên không thể trôi lệch trong
 * im lặng: đổi hình dạng JSON bên Go làm đỏ test bên này.
 *
 * Chú ý hai chỗ cố ý "trông sai":
 *  - by_timeframe có M15 TRƯỚC H1, dù H1 đứng trước theo bảng chữ cái. Backend
 *    sắp theo thứ tự M1->W của domain.Timeframes.
 *  - by_weekday đủ bảy ngày kể cả ngày count = 0.
 */
export function taoCharts(over: Partial<Charts> = {}): Charts {
  const p = (key: string, sum: string, count = 1, win = 0, rate = "0") => ({
    key,
    count,
    win_count: win,
    sum_net: sum,
    ave_net: sum,
    win_rate: rate,
  });
  const wd = (key: string, pos: string, neg: string, count: number) => ({
    ...p(key, "0", count),
    profit_positive: pos,
    profit_negative: neg,
  });

  return {
    by_setup: [p("Breakout", "98", 1, 1, "1"), p("Pullback", "-51")],
    by_symbol: [p("EURUSD", "-51"), p("XAUUSD", "98", 1, 1, "1")],
    by_timeframe: [p("M15", "-51"), p("H1", "98", 1, 1, "1")],
    by_direction: [p("Long", "98", 1, 1, "1"), p("Short", "-51")],
    by_weekday: [
      wd("Mon", "0", "0", 0),
      wd("Tue", "98", "0", 1),
      wd("Wed", "0", "-51", 1),
      wd("Thu", "0", "0", 0),
      wd("Fri", "0", "0", 0),
      wd("Sat", "0", "0", 0),
      wd("Sun", "0", "0", 0),
    ],
    by_week: [p("W24", "47", 2, 1, "0.5")],
    by_day: [
      { day: "2026-06-09", count: 1, sum_net: "98", cum_by_day: "98" },
      { day: "2026-06-10", count: 1, sum_net: "-51", cum_by_day: "47" },
    ],

    heatmap: [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-09", sum_net: "98", count: 1 },
          { day: "2026-06-10", sum_net: "-51", count: 1 },
        ],
      },
    ],
    r_distribution: [{ label: "0R to 1R", count: 1, wins: 1, losses: 0 }],
    score: { scored_count: 2, avg_score_total: "62.5" },
    radar: {
      avg_entry: "12.5",
      avg_in_trade: "12.5",
      avg_exit: "25",
      avg_psych: "12.5",
    },
    theory_vs_actual: [
      { stt: 1, cum_theory: "120", cum_by_trade: "98" },
      { stt: 2, cum_theory: "80", cum_by_trade: "47" },
    ],

    longest_win_streak: 1,
    longest_loss_streak: 1,
    ...over,
  };
}
```

- [ ] **Step 3: Viết test đỏ**

Tạo `frontend/src/features/dashboard/hooks.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoCharts, taoLenh } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { useUpdateTrade } from "@/features/trades/hooks";
import { useCharts } from "./hooks";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function boc(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function khachHang() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

test("bộ lọc đi vào query string, và KHÔNG gửi page", async () => {
  // /charts gom trên toàn bộ tập đã lọc, không phân trang. Gửi page lên là
  // nói dối về ý định, và backend sẽ bỏ qua nó — nên sai này không bao giờ
  // tự bật ra lỗi.
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi(taoCharts());
    }),
  );

  const { result } = renderHook(
    () => useCharts(1, { ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" }),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(duongDan).toBe("?symbol=XAUUSD&direction=Long");
});

// ĐÂY LÀ BẤT BIẾN SỐ 1 CỦA PHASE NÀY.
//
// useLamMoi bên features/trades hiện làm mới ba nhánh. Thiếu nhánh thứ tư thì:
// sửa một lệnh ở /trades -> sang /dashboard -> biểu đồ vẫn vẽ số CŨ. Không có
// lỗi nào bật ra, chỉ có những con số sai trông rất bình thường.
test("sửa một lệnh làm mới cả nhánh charts", async () => {
  const dem = { charts: 0 };
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => {
      dem.charts++;
      return phongBi(taoCharts());
    }),
    http.get(`${BASE}/accounts/1/trades`, () =>
      phongBi({ items: [taoLenh()], page: 1, size: 50, total: 1 }),
    ),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi({})),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
    http.patch(`${BASE}/trades/1`, () => phongBi(taoLenh())),
  );

  const { result } = renderHook(
    () => ({ bd: useCharts(1, EMPTY_FILTER), sua: useUpdateTrade(1) }),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => expect(dem.charts).toBe(1));

  await act(async () => {
    await result.current.sua.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => expect(dem.charts).toBe(2));
});

// Hai bộ lọc khác nhau là hai mục cache khác nhau, nhưng cùng nằm dưới tiền tố
// chartsAll — nên một lần invalidate quét sạch cả hai.
test("mỗi bộ lọc là một mục cache riêng", async () => {
  const daGoi: string[] = [];
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      daGoi.push(new URL(request.url).search);
      return phongBi(taoCharts());
    }),
  );

  const qc = khachHang();
  const { result } = renderHook(
    () => ({
      a: useCharts(1, EMPTY_FILTER),
      b: useCharts(1, { ...EMPTY_FILTER, symbol: "XAUUSD" }),
    }),
    { wrapper: boc(qc) },
  );

  await waitFor(() => {
    expect(result.current.a.data).toBeTruthy();
    expect(result.current.b.data).toBeTruthy();
  });
  expect(daGoi).toEqual(["", "?symbol=XAUUSD"]);
});
```

- [ ] **Step 4: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/hooks.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./hooks"`.

- [ ] **Step 5: Viết `src/features/dashboard/hooks.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { toQuery, type TradeFilter } from "@/features/trades/filters";
import type { Charts } from "./types";

/**
 * Mười hai nhóm biểu đồ trong MỘT request.
 *
 * Backend cố ý gộp (aggregate.All): cả mười hai đều xuất phát từ cùng một lần
 * nạp danh sách lệnh, nên tách thành mười hai endpoint là nạp lại mười hai lần.
 *
 * `toQuery(f, 1)` — trang 1 để hàm bỏ hẳn tham số page. /charts gom trên TOÀN
 * BỘ tập đã lọc chứ không phân trang, giống /stats.
 */
export function useCharts(accountId: number, f: TradeFilter) {
  return useQuery({
    queryKey: qk.charts(accountId, f),
    queryFn: () => api.get<Charts>(`/accounts/${accountId}/charts${toQuery(f, 1)}`),
  });
}
```

- [ ] **Step 6: Thêm nhánh thứ tư vào `useLamMoi`**

Trong `frontend/src/features/trades/hooks.ts`, sửa hàm `useLamMoi`: thêm một dòng vào mảng `Promise.all`, ngay sau dòng `statsAll`:

```ts
      qc.invalidateQueries({ queryKey: qk.chartsAll(accountId) }),
```

và sửa đoạn chú thích của hàm, đổi câu cuối thành:

```
 * `tradesAll` là tiền tố nên nó quét sạch mọi tổ hợp bộ lọc và mọi trang đang
 * nằm trong cache, không chỉ trang đang xem. `chartsAll` cũng vậy — thiếu nó
 * thì sửa lệnh ở /trades rồi sang /dashboard sẽ thấy biểu đồ vẽ số cũ.
```

- [ ] **Step 7: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/hooks.test.tsx src/features/trades/hooks.test.tsx && npx tsc --noEmit
```

Kỳ vọng: 3 test mới xanh, 4 test cũ của `features/trades` vẫn xanh, `tsc` exit 0.

- [ ] **Step 8: Falsify bất biến số 1 — bỏ nhánh charts**

Xoá dòng `chartsAll` vừa thêm trong `useLamMoi`. Chạy lại.

Kỳ vọng: **đỏ** ở `sửa một lệnh làm mới cả nhánh charts` với `dem.charts` đứng ở `1` thay vì `2`. Khôi phục.

- [ ] **Step 9: Falsify — `/charts` không được gửi `page`**

Trong `useCharts`, đổi `toQuery(f, 1)` thành `toQuery(f, 2)`. Chạy lại.

Kỳ vọng: **đỏ** ở ca đầu — nhận `"?symbol=XAUUSD&direction=Long&page=2"`. Khôi phục.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/queryKeys.ts frontend/src/test/tradeFactory.ts \
        frontend/src/features/trades/hooks.ts \
        frontend/src/features/dashboard/hooks.ts \
        frontend/src/features/dashboard/hooks.test.tsx
git commit -m "feat(fe): add the charts query and a fourth invalidation branch

Thiếu nhánh thứ tư thì sửa lệnh ở /trades rồi sang /dashboard sẽ thấy biểu đồ
vẽ số cũ, không kèm lỗi nào."
```

---

### Task 6: chuyển `FilterBar` thành component dùng chung

Spec §2.2. Task thuần cơ học, làm riêng để lần commit sau chỉ còn nội dung mới.

**Files:**
- Move: `frontend/src/features/trades/FilterBar.tsx` → `frontend/src/components/FilterBar.tsx`
- Move: `frontend/src/features/trades/filterBar.test.tsx` → `frontend/src/components/filterBar.test.tsx`
- Modify: `frontend/src/features/trades/TradesPage.tsx`

**Interfaces:**
- Consumes: `TradeFilter`, `EMPTY_FILTER` (`@/features/trades/filters` — **không** chuyển chỗ).
- Produces: `FilterBar` từ `@/components/FilterBar`, giữ nguyên props `{ value, onChange }`.

- [ ] **Step 1: Chuyển hai file bằng `git mv`**

```bash
cd frontend
git mv src/features/trades/FilterBar.tsx src/components/FilterBar.tsx
git mv src/features/trades/filterBar.test.tsx src/components/filterBar.test.tsx
```

Dùng `git mv` chứ không xoá rồi tạo lại: lịch sử của file đi theo, và `git log --follow` còn lần được về lý do từng dòng ra đời.

- [ ] **Step 2: Sửa import trong ba file**

Trong `src/components/FilterBar.tsx`, đổi dòng cuối khối import:

```ts
import { EMPTY_FILTER, type TradeFilter } from "./filters";
```

thành:

```ts
// filters.ts Ở NGUYÊN features/trades: nó là hợp đồng query của LỆNH, và
// dashboard cũng đang lọc lệnh chứ không lọc thứ gì khác. Chuyển nó ra đây
// sẽ là trao cho component quyền sở hữu thứ nó chỉ mượn.
import { EMPTY_FILTER, type TradeFilter } from "@/features/trades/filters";
```

Trong `src/components/filterBar.test.tsx`, đổi mọi `from "./FilterBar"` thành `from "./FilterBar"` (không đổi) và `from "./filters"` thành `from "@/features/trades/filters"`.

Trong `src/features/trades/TradesPage.tsx`, đổi:

```ts
import { FilterBar } from "./FilterBar";
```

thành:

```ts
import { FilterBar } from "@/components/FilterBar";
```

- [ ] **Step 3: Chạy để chắc không gãy gì**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Kỳ vọng: `tsc` exit 0, toàn bộ test xanh (bao gồm `tradesPage.test.tsx` vốn render `FilterBar`).

Nếu `tsc` báo còn import cũ ở đâu đó, sửa rồi chạy lại — đây chính là việc bước này tồn tại để làm.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(fe): move FilterBar to components, two pages own it now

filters.ts ở nguyên features/trades: nó là hợp đồng query của lệnh, và
dashboard cũng đang lọc lệnh chứ không lọc thứ gì khác."
```

---

### Task 7: `lib/thresholds.ts` và `KpiGrid` — 23 chỉ số

Spec §6. Ngưỡng màu tách ra trước để `StatsStrip` và `KpiGrid` không có hai bản trôi lệch.

**Files:**
- Create: `frontend/src/lib/thresholds.ts`
- Modify: `frontend/src/features/trades/StatsStrip.tsx`
- Create: `frontend/src/features/dashboard/KpiGrid.tsx`
- Test: `frontend/src/features/dashboard/kpiGrid.test.tsx`

**Interfaces:**
- Consumes: `Stats` (`@/features/trades/types`); `compareDecimal`, `formatMoney`, `formatPercent`, `formatRatio` (`@/lib/decimal`).
- Produces:
  ```ts
  // lib/thresholds.ts
  export function mauProfitFactor(pf: string): string;
  export function mauRecoveryFactor(rf: string): string;
  export function dauVaMau(v: string): { dau: string; lop: string };

  // features/dashboard/KpiGrid.tsx
  export function KpiGrid({ stats, currency }: { stats: Stats; currency: string }): JSX.Element;
  ```

- [ ] **Step 1: Viết `src/lib/thresholds.ts`**

```ts
import { compareDecimal } from "@/lib/decimal";

/**
 * Ngưỡng màu §8.2 của thiết kế mẹ, so bằng compareDecimal trên CHUỖI.
 *
 * Ở một chỗ vì hai màn hình dùng chung: dải KPI của /trades và lưới KPI của
 * /dashboard. Hai bản chép sẽ trôi lệch trong im lặng — cùng một tài khoản
 * hiện hai màu ở hai trang, và không test nào bắt được vì mỗi bản tự nó đúng.
 */

/** Bậc đóng dưới: > 2 xanh dương, >= 1.5 xanh lá, >= 1 vàng, còn lại đỏ. */
export function mauProfitFactor(pf: string): string {
  if (compareDecimal(pf, "2") > 0) return "text-info";
  if (compareDecimal(pf, "1.5") >= 0) return "text-success";
  if (compareDecimal(pf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

/** § 8.2: < 1 đỏ, 1–2 vàng, > 2 xanh lá. Chỉ ba bậc, không có bậc xanh dương. */
export function mauRecoveryFactor(rf: string): string {
  if (compareDecimal(rf, "2") > 0) return "text-success";
  if (compareDecimal(rf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

/**
 * Dấu và màu theo dấu của một số tiền.
 *
 * Ba nhánh: 0 là hoà, mang màu trung tính. Backend không đếm lệnh net = 0 vào
 * win_count lẫn loss_count, nên tô nó xanh hay đỏ đều là bịa thêm một phía.
 */
export function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" };
  return { dau: "", lop: "text-muted-foreground" };
}
```

- [ ] **Step 2: Bỏ hai bản chép trong `StatsStrip.tsx`**

Trong `frontend/src/features/trades/StatsStrip.tsx`, xoá trọn hai hàm `mauProfitFactor` và `dauVaMau` cùng khối chú thích của chúng, rồi thêm vào khối import:

```ts
import { dauVaMau, mauProfitFactor } from "@/lib/thresholds";
```

Bỏ `compareDecimal` khỏi dòng import từ `@/lib/decimal` nếu phần còn lại của file không dùng tới nữa — `tsc` với `noUnusedLocals` sẽ chỉ ra.

- [ ] **Step 3: Chạy để chắc `StatsStrip` chưa gãy**

```bash
cd frontend && npx vitest run src/features/trades/statsStrip.test.tsx && npx tsc --noEmit
```

Kỳ vọng: xanh, `tsc` exit 0. Test cũ của `StatsStrip` là lưới an toàn cho lần chuyển này.

- [ ] **Step 4: Viết test đỏ cho `KpiGrid`**

Tạo `frontend/src/features/dashboard/kpiGrid.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { taoStats } from "@/test/tradeFactory";
import { KpiGrid } from "./KpiGrid";

// Không bọc provider ngôn ngữ: useI18n dựa trên instance i18next toàn cục, và
// các test sẵn có trong repo (statsStrip.test.tsx) cũng render trần như vậy.
function ve(over = {}) {
  return render(<KpiGrid stats={taoStats(over)} currency="USD" />);
}

// Khoanh vùng theo ô thay vì tìm chữ trên cả trang — nhiều ô mang cùng một
// con số. taoStats mặc định có profit_factor "3" VÀ total_trades 3, nên
// screen.getByText("3") sẽ vớ hai phần tử rồi ném.
function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện đủ 23 chỉ số", () => {
  ve();
  expect(screen.getAllByRole("group")).toHaveLength(23);
});

// null nghĩa là KHÔNG TÍNH ĐƯỢC, không phải bằng 0.
//
// Chưa có lệnh thua thì profit_factor là null. Hiện "0" ở đó đọc ra là "thua
// sạch" — ngược hẳn sự thật, vì chưa thua lệnh nào mới là lý do nó null.
test.each([
  ["Hệ số lợi nhuận", "profit_factor"],
  ["Hệ số hồi phục", "recovery_factor"],
  ["Kỳ vọng mỗi lệnh", "expectancy"],
  ["Tỷ lệ thắng", "win_pct"],
  ["Lãi trung bình", "ave_win"],
  ["Sụt giảm lớn nhất (%)", "max_dd_pct"],
])("%s bằng null thì hiện dấu gạch, không hiện 0", (nhan, khoa) => {
  ve({ [khoa]: null });
  expect(o(nhan).getByText("—")).toBeInTheDocument();
  expect(o(nhan).queryByText("0")).not.toBeInTheDocument();
});

test("profit_factor đổi màu theo bốn bậc ngưỡng", () => {
  const { unmount } = ve({ profit_factor: "3" });
  expect(o("Hệ số lợi nhuận").getByText("3")).toHaveClass("text-info");
  unmount();

  ve({ profit_factor: "0.5" });
  // Locale mặc định là vi nên dấu thập phân là dấu phẩy.
  expect(o("Hệ số lợi nhuận").getByText("0,5")).toHaveClass("text-destructive");
});

// win_pct là PHÂN SỐ. Dán "%" vào chuỗi thô cho ra "0,6667%" — sai một trăm
// lần, và đọc lướt thì thành "tỷ lệ thắng gần bằng không".
test("win_pct nhân 100 trước khi dán phần trăm", () => {
  ve({ win_pct: "0.6667" });
  expect(o("Tỷ lệ thắng").getByText("66,67%")).toBeInTheDocument();
});

test("tiền âm mang màu lỗ", () => {
  ve({ net_profit: "-51" });
  // formatMoney nối đơn vị tiền vào sau nên ô hiện "-51 USD", không phải
  // "-51" — tìm bằng chuỗi khít sẽ trượt.
  expect(o("Lãi ròng").getByText(/-51/)).toHaveClass("text-destructive");
});
```

- [ ] **Step 5: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/kpiGrid.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./KpiGrid"`.

- [ ] **Step 6: Viết `src/features/dashboard/KpiGrid.tsx`**

```tsx
import type { ReactNode } from "react";
import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { dauVaMau, mauProfitFactor, mauRecoveryFactor } from "@/lib/thresholds";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";

/**
 * Đủ 23 chỉ số của /stats.
 *
 * Khác StatsStrip ở /trades — nơi chỉ bày sáu con số dẫn cạnh bảng lệnh. Ở đây
 * người dùng đến để ĐỌC SỐ, nên bày hết; StatsStrip giữ nguyên sáu, nó không
 * phải bản rút gọn của lưới này.
 *
 * Lưới dựng bằng `gap-px` trên nền `bg-border`: mỗi ô tự vẽ nền của mình nên
 * đường kẻ hiện ra đúng ở mọi số cột mà breakpoint chọn, không phải đếm xem ô
 * nào cần border bên nào. Theme tắt hết lớp đổ bóng nên phân tầng bằng đúng
 * border và bậc surface.
 */

/** Một ô. `role="group"` + `aria-label` để trình đọc màn hình gọi được tên. */
function O({ nhan, children }: { nhan: string; children: ReactNode }) {
return (
  <div role="group" aria-label={nhan} className="flex flex-col gap-1 bg-card p-3">
    <span className="eyebrow">{nhan}</span>
    {children}
  </div>
);
}

/**
 * Giá trị có thể KHÔNG TÍNH ĐƯỢC.
 *
 * `null` bên Go là con trỏ nil: chưa có lệnh thua thì profit_factor không có
 * giá trị, chứ không bằng 0. `?? 0` ở đây sẽ biến "chưa thua lệnh nào" thành
 * "thua sạch" — một câu trả lời sai mà trông hoàn toàn bình thường.
 */
function Co({ v, lop, ve }: { v: string | null; lop?: string; ve: (s: string) => string }) {
if (v === null) return <span className="num text-lg text-muted-foreground">—</span>;
return <span className={`num text-lg font-medium ${lop ?? ""}`}>{ve(v)}</span>;
}

export function KpiGrid({ stats: s, currency }: { stats: Stats; currency: string }) {
const { locale, t } = useI18n();
const tien = (v: string) => formatMoney(v, currency, locale);
const tienCoDau = (v: string) => `${dauVaMau(v).dau}${formatMoney(v, currency, locale)}`;
const ty = (v: string) => formatRatio(v, 2, locale);
const phanTram = (v: string) => formatPercent(v, 2, locale);
const so = (n: number) => String(n);

return (
  <div className="overflow-hidden rounded-md border border-border bg-border">
    <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-4">
      <O nhan={t("kpi.netProfit")}>
        <Co v={s.net_profit} lop={dauVaMau(s.net_profit).lop} ve={tienCoDau} />
      </O>
      <O nhan={t("kpi.currentBalance")}>
        <Co v={s.current_balance} ve={tien} />
      </O>
      <O nhan={t("kpi.netReturnPct")}>
        <Co v={s.net_return_pct} ve={phanTram} />
      </O>
      <O nhan={t("kpi.profitFactor")}>
        <Co
          v={s.profit_factor}
          lop={s.profit_factor === null ? undefined : mauProfitFactor(s.profit_factor)}
          ve={ty}
        />
      </O>

      <O nhan={t("kpi.totalWin")}>
        <Co v={s.total_win} lop="text-primary" ve={tien} />
      </O>
      <O nhan={t("kpi.totalLoss")}>
        <Co v={s.total_loss} lop="text-destructive" ve={tien} />
      </O>
      <O nhan={t("kpi.totalFees")}>
        <Co v={s.total_fees} ve={tien} />
      </O>
      <O nhan={t("kpi.totalTrades")}>
        <span className="num text-lg font-medium">{so(s.total_trades)}</span>
      </O>

      <O nhan={t("kpi.winCount")}>
        <span className="num text-lg font-medium text-primary">{so(s.win_count)}</span>
      </O>
      <O nhan={t("kpi.lossCount")}>
        <span className="num text-lg font-medium text-destructive">{so(s.loss_count)}</span>
      </O>
      <O nhan={t("kpi.winPct")}>
        <Co v={s.win_pct} ve={phanTram} />
      </O>
      <O nhan={t("kpi.expectancy")}>
        <Co
          v={s.expectancy}
          lop={s.expectancy === null ? undefined : dauVaMau(s.expectancy).lop}
          ve={tienCoDau}
        />
      </O>

      <O nhan={t("kpi.aveWin")}>
        <Co v={s.ave_win} ve={tien} />
      </O>
      <O nhan={t("kpi.aveLoss")}>
        <Co v={s.ave_loss} ve={tien} />
      </O>
      <O nhan={t("kpi.biggestWinner")}>
        <Co v={s.biggest_winner} ve={tien} />
      </O>
      <O nhan={t("kpi.biggestLoser")}>
        <Co v={s.biggest_loser} ve={tien} />
      </O>

      <O nhan={t("kpi.oneR")}>
        <Co v={s.one_r} ve={tien} />
      </O>
      <O nhan={t("kpi.biggestRWin")}>
        <Co v={s.biggest_r_win} ve={ty} />
      </O>
      <O nhan={t("kpi.biggestRLoss")}>
        <Co v={s.biggest_r_loss} ve={ty} />
      </O>
      <O nhan={t("kpi.rrActual")}>
        <Co v={s.rr_actual} ve={ty} />
      </O>

      <O nhan={t("kpi.maxDrawdown")}>
        <Co v={s.max_drawdown} lop="text-destructive" ve={tien} />
      </O>
      <O nhan={t("kpi.maxDdPct")}>
        <Co v={s.max_dd_pct} ve={phanTram} />
      </O>
      <O nhan={t("kpi.recoveryFactor")}>
        <Co
          v={s.recovery_factor}
          lop={s.recovery_factor === null ? undefined : mauRecoveryFactor(s.recovery_factor)}
          ve={ty}
        />
      </O>
    </div>
  </div>
);
}
```

- [ ] **Step 7: Thêm 23 chuỗi i18n**

Vào `frontend/src/i18n/vi.ts`:

```ts
"kpi.netProfit": "Lãi ròng",
"kpi.currentBalance": "Số dư hiện tại",
"kpi.netReturnPct": "Tỷ suất trên vốn",
"kpi.profitFactor": "Hệ số lợi nhuận",
"kpi.totalWin": "Tổng lãi",
"kpi.totalLoss": "Tổng lỗ",
"kpi.totalFees": "Tổng phí",
"kpi.totalTrades": "Số lệnh",
"kpi.winCount": "Lệnh thắng",
"kpi.lossCount": "Lệnh thua",
"kpi.winPct": "Tỷ lệ thắng",
"kpi.expectancy": "Kỳ vọng mỗi lệnh",
"kpi.aveWin": "Lãi trung bình",
"kpi.aveLoss": "Lỗ trung bình",
"kpi.biggestWinner": "Lệnh lãi lớn nhất",
"kpi.biggestLoser": "Lệnh lỗ lớn nhất",
"kpi.oneR": "1R",
"kpi.biggestRWin": "R thắng lớn nhất",
"kpi.biggestRLoss": "R thua lớn nhất",
"kpi.rrActual": "R:R thực tế",
"kpi.maxDrawdown": "Sụt giảm lớn nhất",
"kpi.maxDdPct": "Sụt giảm lớn nhất (%)",
"kpi.recoveryFactor": "Hệ số hồi phục",
```

Vào `frontend/src/i18n/en.ts`:

```ts
"kpi.netProfit": "Net profit",
"kpi.currentBalance": "Current balance",
"kpi.netReturnPct": "Return on capital",
"kpi.profitFactor": "Profit factor",
"kpi.totalWin": "Gross profit",
"kpi.totalLoss": "Gross loss",
"kpi.totalFees": "Total fees",
"kpi.totalTrades": "Trades",
"kpi.winCount": "Winners",
"kpi.lossCount": "Losers",
"kpi.winPct": "Win rate",
"kpi.expectancy": "Expectancy per trade",
"kpi.aveWin": "Average win",
"kpi.aveLoss": "Average loss",
"kpi.biggestWinner": "Largest win",
"kpi.biggestLoser": "Largest loss",
"kpi.oneR": "1R",
"kpi.biggestRWin": "Largest R win",
"kpi.biggestRLoss": "Largest R loss",
"kpi.rrActual": "Actual R:R",
"kpi.maxDrawdown": "Max drawdown",
"kpi.maxDdPct": "Max drawdown (%)",
"kpi.recoveryFactor": "Recovery factor",
```

- [ ] **Step 8: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/kpiGrid.test.tsx src/i18n && npx tsc --noEmit
```

Kỳ vọng: xanh cả test `KpiGrid` lẫn `i18n.test.tsx` (nó canh hai bản ngôn ngữ có cùng bộ khoá).

- [ ] **Step 9: Falsify — `null` không được thành `0`**

Trong `Co`, đổi dòng đầu thành:

```ts
if (v === null) return <span className="num text-lg">{ve("0")}</span>;
```

Chạy lại. Kỳ vọng: **đỏ** ở cả sáu ca `hiện dấu gạch`. Khôi phục.

- [ ] **Step 10: Falsify — tỷ lệ là phân số**

Trong `KpiGrid`, đổi ô `kpi.winPct` sang `ve={ty}` (bỏ nhân 100).

Chạy lại. Kỳ vọng: **đỏ** ở `win_pct nhân 100 trước khi dán phần trăm` — nhận `"0,67"` thay vì `"66,67%"`. Khôi phục.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/thresholds.ts frontend/src/features/trades/StatsStrip.tsx \
      frontend/src/features/dashboard/KpiGrid.tsx \
      frontend/src/features/dashboard/kpiGrid.test.tsx \
      frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): render all 23 KPI and share the threshold colours

Ngưỡng ra một chỗ để hai màn hình không có hai bản trôi lệch. null là chưa
tính được, không phải bằng 0 — hiện gạch ngang."
```

---

### Task 8: cài Recharts và dựng `PivotBarChart`

Spec §2.5, §7.3. Một component phục vụ **bốn** nhóm: `by_setup`, `by_symbol`, `by_timeframe`, `by_week`.

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/features/dashboard/PivotBarChart.tsx`
- Test: `frontend/src/features/dashboard/pivotBarChart.test.tsx`

**Interfaces:**
- Consumes: `CotPivot`, `chuanBiPivot` (Task 4); `formatMoney`, `formatPercent` (`@/lib/decimal`).
- Produces:
```ts
export function PivotBarChart(props: {
  tieuDe: string;
  rows: Pivot[];
  currency: string;
}): JSX.Element;
```

- [ ] **Step 1: Cài recharts**

```bash
cd frontend && npm install recharts
```

Phải ra `recharts` trong `dependencies` (không phải `devDependencies`) — nó chạy trong bundle production. Bản 3.10.1 khai `react: ^19.0.0` trong peerDependencies nên không cần `--legacy-peer-deps`.

- [ ] **Step 2: Viết test đỏ**

Tạo `frontend/src/features/dashboard/pivotBarChart.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { PivotBarChart } from "./PivotBarChart";
import type { Pivot } from "./types";

const rows: Pivot[] = [
  { key: "M15", count: 1, win_count: 0, sum_net: "-51.00", ave_net: "-51.00", win_rate: "0" },
  { key: "H1", count: 9, win_count: 9, sum_net: "98", ave_net: "10.89", win_rate: "1" },
];

// SMOKE TEST, cố ý nông.
//
// ResponsiveContainer đo bằng ResizeObserver, mà jsdom không có — nên trong
// jsdom biểu đồ rộng 0px và KHÔNG vẽ ra path hay rect nào. Assert lên hình vẽ
// ở đây là assert lên khoảng trắng.
//
// Phần đáng kiểm — thứ tự, màu, hai dạng của con số — nằm ở prepare.test.ts và
// đã được kiểm ở đó, không cần DOM. Chỗ này chỉ bắt lỗi thiếu prop và lỗi dựng
// cây component.
test("render được và nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<PivotBarChart tieuDe="Theo khung thời gian" rows={rows} currency="USD" />);

  expect(screen.getByRole("heading", { name: "Theo khung thời gian" })).toBeInTheDocument();
  // figure + aria-label là thứ CÒN LẠI khi biểu đồ không vẽ được: người dùng
  // trình đọc màn hình không bao giờ "nhìn" thấy cột, nên bảng số bên dưới và
  // nhãn này là toàn bộ nội dung họ nhận được.
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Theo khung thời gian/);
});

test("mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<PivotBarChart tieuDe="Theo setup" rows={[]} currency="USD" />);

  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// Không dùng màu làm tín hiệu duy nhất (§8.2 thiết kế mẹ). Bảng số là bản đọc
// được của biểu đồ, và nó cũng là thứ duy nhất hoạt động ở jsdom.
test("kèm bảng số đọc được, không chỉ có hình", () => {
  render(<PivotBarChart tieuDe="Theo khung thời gian" rows={rows} currency="USD" />);

  expect(screen.getByRole("table")).toBeInTheDocument();
  // Thứ tự backend trả: M15 trước H1, dù H1 đứng trước theo bảng chữ cái.
  const nhom = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(nhom).toEqual(["M15", "H1"]);

  // Chuỗi gốc "-51.00" phải sống sót tới nhãn: dựng lại từ số cho ra "-51",
  // mất hai chữ số 0 mà backend cố ý gửi.
  expect(screen.getByText(/-51,00/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/pivotBarChart.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./PivotBarChart"`.

- [ ] **Step 4: Viết `src/features/dashboard/PivotBarChart.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiPivot } from "./prepare";
import type { Pivot } from "./types";

/**
 * Cột cho bốn nhóm dùng chung kiểu Pivot: setup, symbol, timeframe, week.
 *
 * MỘT chuỗi duy nhất (sum_net), nên không có legend — tiêu đề đã gọi tên nó.
 * Màu ở đây mang nghĩa CỰC TÍNH (lãi/lỗ) chứ không phải danh tính: tô mỗi
 * setup một màu sẽ mã hoá thứ vốn đã nằm ở nhãn trục, và cướp mất kênh màu
 * của thứ duy nhất cần tới nó.
 *
 * Kèm <table> ẩn khỏi mắt nhưng còn cho trình đọc màn hình: biểu đồ SVG với
 * họ là hư không, và ở jsdom nó cũng là hư không — nên bảng vừa là lối vào
 * cho người dùng trình đọc, vừa là thứ test bám vào được.
 */
export function PivotBarChart({
tieuDe,
rows,
currency,
}: {
tieuDe: string;
rows: Pivot[];
currency: string;
}) {
const { locale, t } = useI18n();
const data = chuanBiPivot(rows);

if (data.length === 0) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{tieuDe}</h3>
      <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
    </section>
  );
}

return (
  <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
    <h3 className="text-sm font-medium">{tieuDe}</h3>

    <figure aria-label={`${tieuDe} — ${t("dashboard.chartOf")}`} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          {/* Lưới mờ và chỉ kẻ ngang: đường dọc chồng lên cột không thêm
              thông tin nào mà làm nền ồn hẳn lên. */}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
          <XAxis dataKey="key" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            contentStyle={{
              background: "var(--surface-modal)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-default)",
              color: "var(--text-primary)",
            }}
            // Nhãn đi từ CHUỖI GỐC, không từ con số Recharts đang giữ:
            // String(118.5) mất số 0 cuối mà backend cố ý gửi.
            formatter={(_v, _n, item) => {
              const d = item.payload as (typeof data)[number];
              return [formatMoney(d.netGoc, currency, locale), t("dashboard.net")];
            }}
          />
          {/* radius bo 4px ở đầu cột, neo vào đường 0. */}
          <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.mau} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>

    {/* Bản đọc được của cùng dữ liệu. sr-only chứ không display:none —
        display:none là ẩn với cả trình đọc màn hình. */}
    <table className="sr-only">
      <caption>{tieuDe}</caption>
      <thead>
        <tr>
          <th scope="col">{t("dashboard.group")}</th>
          <th scope="col">{t("dashboard.net")}</th>
          <th scope="col">{t("dashboard.tradeCount")}</th>
          <th scope="col">{t("dashboard.winRate")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}>
            <th scope="row">{d.key}</th>
            <td>{formatMoney(d.netGoc, currency, locale)}</td>
            <td>{d.count}</td>
            <td>{formatPercent(d.winRateGoc, 2, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
}
```

- [ ] **Step 5: Thêm sáu chuỗi i18n**

Vào `frontend/src/i18n/vi.ts`:

```ts
"dashboard.emptyGroup": "Chưa có lệnh nào trong nhóm này",
"dashboard.chartOf": "biểu đồ cột, số liệu ở bảng bên dưới",
"dashboard.net": "Lãi ròng",
"dashboard.group": "Nhóm",
"dashboard.tradeCount": "Số lệnh",
"dashboard.winRate": "Tỷ lệ thắng",
```

Vào `frontend/src/i18n/en.ts`:

```ts
"dashboard.emptyGroup": "No trades in this group yet",
"dashboard.chartOf": "bar chart, figures in the table below",
"dashboard.net": "Net",
"dashboard.group": "Group",
"dashboard.tradeCount": "Trades",
"dashboard.winRate": "Win rate",
```

- [ ] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/pivotBarChart.test.tsx && npx tsc --noEmit
```

Kỳ vọng: 3 test xanh, `tsc` exit 0.

- [ ] **Step 7: Falsify — nhãn phải đi từ chuỗi gốc**

Fixture của test đã cố ý dùng `sum_net: "-51.00"` chứ không phải `"-51"`, và ca `kèm bảng số đọc được` đã ghim `/-51,00/`. Giờ phá nó:

Trong bảng, đổi `<td>{formatMoney(d.netGoc, currency, locale)}</td>` thành:

```tsx
<td>{String(d.net)}</td>
```

Chạy lại. Kỳ vọng: **đỏ** — `String(-51)` cho `"-51"`, mất hai chữ số 0 mà backend cố ý gửi. Đây đúng là lý do `prepare.ts` giữ cả hai dạng thay vì dựng chuỗi lại từ số. Khôi phục.

- [ ] **Step 8: Falsify — mảng rỗng không được dựng khung**

Xoá khối `if (data.length === 0)`. Chạy lại.

Kỳ vọng: **đỏ** ở `mảng rỗng ra lời nhắn` — tìm không ra chữ "chưa có lệnh nào", và `figure` vẫn hiện diện. Khôi phục.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
      frontend/src/features/dashboard/PivotBarChart.tsx \
      frontend/src/features/dashboard/pivotBarChart.test.tsx \
      frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add the shared pivot bar chart on Recharts

Một chuỗi nên không có legend; màu mang nghĩa cực tính chứ không phải danh
tính. Bảng sr-only là bản đọc được, và cũng là thứ test bám vào ở jsdom."
```

---

### Task 9: `WeekdayChart` và `DailyPnlChart`

Spec §2.5. Hai biểu đồ còn lại của 4a, mỗi cái một hình riêng.

**Files:**
- Create: `frontend/src/features/dashboard/WeekdayChart.tsx`
- Create: `frontend/src/features/dashboard/DailyPnlChart.tsx`
- Test: `frontend/src/features/dashboard/charts.test.tsx`

**Interfaces:**
- Consumes: `chuanBiWeekday`, `chuanBiNgay` (Task 4); `WeekdayStat`, `DayStat` (Task 3).
- Produces:
```ts
export function WeekdayChart(props: {
  rows: WeekdayStat[]; currency: string;
}): JSX.Element;
export function DailyPnlChart(props: {
  rows: DayStat[]; currency: string;
}): JSX.Element;
```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/dashboard/charts.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { taoCharts } from "@/test/tradeFactory";
import { DailyPnlChart } from "./DailyPnlChart";
import { WeekdayChart } from "./WeekdayChart";

const c = taoCharts();

test("WeekdayChart giữ đủ bảy ngày, kể cả ngày không có lệnh", () => {
  render(<WeekdayChart rows={c.by_weekday} currency="USD" />);

  // Backend luôn trả đủ Mon..Sun. Lọc bỏ ngày count = 0 làm biểu đồ mất cột,
  // và một cột VẮNG MẶT trông khác hẳn một cột BẰNG 0 — cái sau là thông tin.
  const ngay = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(ngay).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});

test("WeekdayChart tách phần lãi và phần lỗ thành hai cột đọc được", () => {
  render(<WeekdayChart rows={c.by_weekday} currency="USD" />);

  // Hai chuỗi thì danh tính KHÔNG được để màu gánh một mình. Hai cột tiêu đề
  // của bảng là bản đọc được của legend.
  expect(screen.getByRole("columnheader", { name: "Phần lãi" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Phần lỗ" })).toBeInTheDocument();
});

test("DailyPnlChart bày cả net từng ngày lẫn giá trị lũy kế", () => {
  render(<DailyPnlChart rows={c.by_day} currency="USD" />);

  // Fixture có hai ngày: 09/06 net 98 cum 98, 10/06 net -51 cum 47.
  const hang = screen.getAllByRole("row");
  expect(hang).toHaveLength(3); // 1 hàng tiêu đề + 2 ngày

  // Khoanh theo hàng chứ không tìm "47" trên cả bảng: formatMoney nối đơn vị
  // tiền vào sau nên ô thật sự chứa "47 USD".
  const ngayHai = within(screen.getByRole("row", { name: /2026-06-10/ }));
  expect(ngayHai.getByText(/^47 USD$/)).toBeInTheDocument();
  expect(ngayHai.getByText(/^-51 USD$/)).toBeInTheDocument();
});

test("cả hai xử lý mảng rỗng mà không ném", () => {
  render(
    <>
      <WeekdayChart rows={[]} currency="USD" />
      <DailyPnlChart rows={[]} currency="USD" />
    </>,
  );
  expect(screen.getAllByText(/chưa có lệnh nào/i)).toHaveLength(2);
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./DailyPnlChart"`.

- [ ] **Step 3: Viết `src/features/dashboard/WeekdayChart.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { MAU_LAI, MAU_LO } from "./palette";
import { chuanBiWeekday } from "./prepare";
import type { WeekdayStat } from "./types";

/**
 * Thứ trong tuần, tách phần lãi và phần lỗ thành HAI cột cạnh nhau.
 *
 * Khác các biểu đồ pivot khác: ở đây có hai chuỗi thật, nên legend là bắt
 * buộc — danh tính không được để một mình màu gánh.
 *
 * Không cộng hai phần thành một cột net: một ngày thứ Ba có +500 và −480 cho
 * ra net +20, trông y hệt một ngày thứ Ba chỉ có +20. Hai ngày đó rất khác
 * nhau, và đây đúng là thứ biểu đồ này sinh ra để cho thấy.
 */
export function WeekdayChart({ rows, currency }: { rows: WeekdayStat[]; currency: string }) {
const { locale, t } = useI18n();
const data = chuanBiWeekday(rows);

if (data.length === 0) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.byWeekday")}</h3>
      <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
    </section>
  );
}

return (
  <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
    <h3 className="text-sm font-medium">{t("dashboard.byWeekday")}</h3>

    <figure aria-label={`${t("dashboard.byWeekday")} — ${t("dashboard.chartOf")}`} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
          <XAxis dataKey="key" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            contentStyle={{
              background: "var(--surface-modal)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-default)",
              color: "var(--text-primary)",
            }}
            formatter={(_v, name, item) => {
              const d = item.payload as (typeof data)[number];
              const goc = name === "lai" ? d.laiGoc : d.loGoc;
              return [
                formatMoney(goc, currency, locale),
                name === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"),
              ];
            }}
          />
          <Legend
            formatter={(v) => (v === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"))}
          />
          {/* Khe 2px giữa hai cột kề nhau: barGap tính bằng pixel. */}
          <Bar dataKey="lai" fill={MAU_LAI} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="lo" fill={MAU_LO} radius={[0, 0, 4, 4]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>

    <table className="sr-only">
      <caption>{t("dashboard.byWeekday")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("dashboard.weekday")}</th>
          <th scope="col">{t("dashboard.profitPart")}</th>
          <th scope="col">{t("dashboard.lossPart")}</th>
          <th scope="col">{t("dashboard.tradeCount")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}>
            <th scope="row">{d.key}</th>
            <td>{formatMoney(d.laiGoc, currency, locale)}</td>
            <td>{formatMoney(d.loGoc, currency, locale)}</td>
            <td>{d.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
}
```

- [ ] **Step 4: Viết `src/features/dashboard/DailyPnlChart.tsx`**

```tsx
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiNgay } from "./prepare";
import type { DayStat } from "./types";

/**
 * Lãi lỗ từng ngày (cột) cùng đường lũy kế cuối ngày (đường).
 *
 * MỘT trục y cho cả hai, và đó là chủ ý: cả hai đều là tiền, cùng đơn vị. Hai
 * trục y với hai thang khác nhau là lỗi biểu đồ phổ biến nhất — nó cho phép
 * đặt hai đường cắt nhau ở bất cứ đâu người vẽ muốn, nên chúng không so sánh
 * được với nhau nữa.
 *
 * Cột đổi màu theo dấu của NGÀY; đường lũy kế giữ MỘT màu suốt tuyến — tô
 * từng đoạn theo dấu sẽ đọc thành một đường đứt quãng.
 */
export function DailyPnlChart({ rows, currency }: { rows: DayStat[]; currency: string }) {
const { locale, t } = useI18n();
const data = chuanBiNgay(rows);

if (data.length === 0) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.byDay")}</h3>
      <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
    </section>
  );
}

return (
  <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
    <h3 className="text-sm font-medium">{t("dashboard.byDay")}</h3>

    <figure aria-label={`${t("dashboard.byDay")} — ${t("dashboard.chartOf")}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            contentStyle={{
              background: "var(--surface-modal)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-default)",
              color: "var(--text-primary)",
            }}
            formatter={(_v, name, item) => {
              const d = item.payload as (typeof data)[number];
              const goc = name === "cum" ? d.cumGoc : d.netGoc;
              return [
                formatMoney(goc, currency, locale),
                name === "cum" ? t("dashboard.cumulative") : t("dashboard.net"),
              ];
            }}
          />
          <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.day} fill={d.mau} />
            ))}
          </Bar>
          {/* strokeWidth 2 và chấm >= 8px theo đặc tả mark. */}
          <Line
            type="monotone"
            dataKey="cum"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>

    <table className="sr-only">
      <caption>{t("dashboard.byDay")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("dashboard.day")}</th>
          <th scope="col">{t("dashboard.net")}</th>
          <th scope="col">{t("dashboard.cumulative")}</th>
          <th scope="col">{t("dashboard.tradeCount")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.day}>
            <th scope="row">{d.day}</th>
            <td>{formatMoney(d.netGoc, currency, locale)}</td>
            <td>{formatMoney(d.cumGoc, currency, locale)}</td>
            <td>{d.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
}
```

- [ ] **Step 5: Thêm bảy chuỗi i18n**

Vào `frontend/src/i18n/vi.ts`:

```ts
"dashboard.byWeekday": "Theo thứ trong tuần",
"dashboard.byDay": "Lãi lỗ theo ngày",
"dashboard.weekday": "Thứ",
"dashboard.day": "Ngày",
"dashboard.profitPart": "Phần lãi",
"dashboard.lossPart": "Phần lỗ",
"dashboard.cumulative": "Lũy kế",
```

Vào `frontend/src/i18n/en.ts`:

```ts
"dashboard.byWeekday": "By weekday",
"dashboard.byDay": "Daily P&L",
"dashboard.weekday": "Weekday",
"dashboard.day": "Day",
"dashboard.profitPart": "Profit",
"dashboard.lossPart": "Loss",
"dashboard.cumulative": "Cumulative",
```

- [ ] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx src/i18n && npx tsc --noEmit
```

Kỳ vọng: 4 test xanh, `i18n.test.tsx` xanh, `tsc` exit 0.

- [ ] **Step 7: Falsify — không được lọc bỏ ngày rỗng**

Trong `WeekdayChart`, đổi `const data = chuanBiWeekday(rows);` thành:

```ts
const data = chuanBiWeekday(rows).filter((d) => d.count > 0);
```

Chạy lại. Kỳ vọng: **đỏ** ở `giữ đủ bảy ngày` — chỉ còn `["Tue", "Wed"]`. Khôi phục.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/dashboard/WeekdayChart.tsx \
      frontend/src/features/dashboard/DailyPnlChart.tsx \
      frontend/src/features/dashboard/charts.test.tsx \
      frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add the weekday split and the daily P&L combo chart

Không cộng phần lãi với phần lỗ: một ngày +500/-480 ra net +20, trông y hệt
một ngày chỉ có +20. Một trục y cho cả cột lẫn đường vì cả hai đều là tiền."
```

---

### Task 10: `StreakBlock` — hai con số không nghe theo bộ lọc

Spec §3.2. Nhỏ nhưng là **bất biến số 2**: đây là chỗ duy nhất trên trang mà bộ lọc không có tác dụng.

**Files:**
- Create: `frontend/src/features/dashboard/StreakBlock.tsx`
- Test: `frontend/src/features/dashboard/streakBlock.test.tsx`

**Interfaces:**
- Consumes: `Charts` (Task 3).
- Produces:
```ts
export function StreakBlock(props: {
  win: number; loss: number; dangLoc: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/dashboard/streakBlock.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { StreakBlock } from "./StreakBlock";

test("bày hai con số chuỗi liên tiếp", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={false} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

// BẤT BIẾN SỐ 2.
//
// aggregate.All gọi Streaks(all) trong khi mười hai nhóm còn lại nhận filtered
// (charts.go:175) — quy tắc 8 của CLAUDE.md. Nên khi bộ lọc đang bật, hai con
// số này là thứ DUY NHẤT trên trang không đổi.
//
// Đặt chúng lẫn trong lưới KPI là nói dối bằng cách xếp cạnh nhau: người đọc
// suy ra rằng mọi con số trong cùng một khối đều nói về cùng một tập lệnh.
test("khi đang lọc thì nói rõ hai số này tính trên toàn bộ lịch sử", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={true} />);
  expect(screen.getByRole("note")).toBeInTheDocument();
});

test("không lọc thì không cần lời nhắc", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={false} />);
  // Không lọc thì "toàn bộ lịch sử" chính là thứ đang xem, nên lời nhắc chỉ là
  // chữ thừa. Hiện nó mọi lúc sẽ dạy người dùng bỏ qua nó.
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/streakBlock.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./StreakBlock"`.

- [ ] **Step 3: Viết `src/features/dashboard/StreakBlock.tsx`**

```tsx
import { useI18n } from "@/i18n";

/**
 * Chuỗi thắng và chuỗi thua dài nhất.
 *
 * Khối RIÊNG, không nằm trong lưới KPI, và đó không phải chuyện thẩm mỹ:
 * backend tính hai con số này trên TOÀN BỘ dãy lệnh của account
 * (aggregate.All gọi Streaks(all), charts.go:175) trong khi mọi thứ khác trên
 * trang tính trên tập đã lọc. Đó là quy tắc 8 của CLAUDE.md — chuỗi và lũy kế
 * đi theo thứ tự stt của cả dãy, bộ lọc chỉ lọc phần hiển thị.
 *
 * Hệ quả: lọc còn một setup thì 23 KPI và bảy biểu đồ đổi số, hai con số này
 * đứng yên. Xếp chúng cạnh các KPI đã lọc là để người đọc tự suy ra một điều
 * sai, mà không có dòng chữ nào nói ngược lại.
 */
export function StreakBlock({
win,
loss,
dangLoc,
}: {
win: number;
loss: number;
dangLoc: boolean;
}) {
const { t } = useI18n();

return (
  <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
    <h3 className="text-sm font-medium">{t("dashboard.streaks")}</h3>

    <div className="flex flex-wrap gap-6">
      <div role="group" aria-label={t("dashboard.longestWin")} className="flex flex-col gap-1">
        <span className="eyebrow">{t("dashboard.longestWin")}</span>
        <span className="num text-2xl font-semibold text-primary">{win}</span>
      </div>
      <div role="group" aria-label={t("dashboard.longestLoss")} className="flex flex-col gap-1">
        <span className="eyebrow">{t("dashboard.longestLoss")}</span>
        <span className="num text-2xl font-semibold text-destructive">{loss}</span>
      </div>
    </div>

    {/* Chỉ hiện khi đang lọc. Hiện mọi lúc sẽ dạy người dùng bỏ qua nó, và
        lúc nó thật sự quan trọng thì nó đã thành nhiễu nền. */}
    {dangLoc && (
      <p role="note" className="text-xs text-muted-foreground">
        {t("dashboard.streakIgnoresFilter")}
      </p>
    )}
  </section>
);
}
```

- [ ] **Step 4: Thêm bốn chuỗi i18n**

Vào `frontend/src/i18n/vi.ts`:

```ts
"dashboard.streaks": "Chuỗi liên tiếp",
"dashboard.longestWin": "Chuỗi thắng dài nhất",
"dashboard.longestLoss": "Chuỗi thua dài nhất",
"dashboard.streakIgnoresFilter":
  "Hai con số này tính trên toàn bộ lịch sử của tài khoản, không theo bộ lọc đang bật.",
```

Vào `frontend/src/i18n/en.ts`:

```ts
"dashboard.streaks": "Streaks",
"dashboard.longestWin": "Longest winning streak",
"dashboard.longestLoss": "Longest losing streak",
"dashboard.streakIgnoresFilter":
  "These two are computed over the account's whole history, not the active filter.",
```

- [ ] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/streakBlock.test.tsx src/i18n && npx tsc --noEmit
```

Kỳ vọng: 3 test xanh, `tsc` exit 0.

- [ ] **Step 6: Falsify — lời nhắc phải xuất hiện khi đang lọc**

Đổi `{dangLoc && (` thành `{false && (`. Chạy lại.

Kỳ vọng: **đỏ** ở `khi đang lọc thì nói rõ`. Khôi phục.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/dashboard/StreakBlock.tsx \
      frontend/src/features/dashboard/streakBlock.test.tsx \
      frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): give the streak pair its own block and a filter notice

Backend tính hai số này trên toàn dãy trong khi mọi thứ khác trên trang tính
trên tập đã lọc. Xếp chúng cạnh KPI đã lọc là để người đọc suy ra điều sai."
```

---

### Task 11: `DashboardPage`, route, điều hướng

Spec §2.4, §8, §9. Ghép mọi mảnh lại.

**Files:**
- Create: `frontend/src/features/dashboard/DashboardPage.tsx`
- Test: `frontend/src/features/dashboard/dashboardPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/AppShell.tsx`

**Interfaces:**
- Consumes: mọi thứ từ Task 4–10; `useActiveAccount` (`@/features/accounts/activeAccount`); `useStats` (`@/features/trades/hooks`); `FilterBar` (`@/components/FilterBar`); `readFilter`, `writeParams`, `EMPTY_FILTER` (`@/features/trades/filters`).
- Produces: `export function DashboardPage(): JSX.Element;`

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/dashboard/dashboardPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoCharts, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import {
  __resetActiveAccountForTest,
  storeActiveAccountId,
} from "@/features/accounts/activeAccount";
import { clearSession, setSession } from "@/lib/session";
import { DashboardPage } from "./DashboardPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "ACC1",
  name: "Tài khoản chính",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "5000",
  risk_per_trade: "0.01",
  one_r: "50",
};

const enumsRong = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1"],
  entry_qualities: [],
  in_trade_qualities: [],
  exit_qualities: [],
  psychologies: [],
  trade_classes: [],
  cash_flow_types: [],
  weekdays: [],
  default_setup: "",
};

const KHONG_CO_LENH = {
  by_setup: [],
  by_symbol: [],
  by_timeframe: [],
  by_direction: [],
  by_weekday: [],
  by_week: [],
  by_day: [],
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  __resetActiveAccountForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  storeActiveAccountId(1);

  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([account])),
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts())),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats())),
    http.get(`${BASE}/meta/enums`, () => phongBi(enumsRong)),
  );
});

function ve(duongDan = "/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[duongDan]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("dựng đủ bốn mục có heading thật", async () => {
  ve();
  // Heading THẬT chứ không phải div to chữ: trình đọc màn hình duyệt trang
  // theo cây heading, và bốn mục này là mục lục của trang.
  await waitFor(() => {
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });
});

test("bộ lọc trên URL đi thẳng vào request", async () => {
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi(taoCharts());
    }),
  );

  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(duongDan).toBe("?symbol=XAUUSD"));
});

test("có lọc thì StreakBlock hiện lời nhắc", async () => {
  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(screen.getByRole("note")).toBeInTheDocument());
});

test("account chưa có lệnh nào thì mời thêm lệnh, không dựng bảy khung rỗng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats({ total_trades: 0 }))),
  );

  ve();
  await waitFor(() => {
    expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  });
  // Không có lệnh nào thì bảy khung rỗng chỉ là bảy lời nhắc giống hệt nhau.
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("lọc không ra gì thì mời bỏ lọc, không mời thêm lệnh", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats({ total_trades: 0 }))),
  );

  ve("/dashboard?symbol=KHONGCO");
  // Khác hẳn ca trên: ở đây lời mời phải là BỎ LỌC. Gộp hai trạng thái làm một
  // sẽ mời người dùng thêm lệnh trong khi họ chỉ cần xoá một bộ lọc.
  await waitFor(() => {
    expect(screen.getByText(/không có lệnh nào khớp/i)).toBeInTheDocument();
  });
  expect(screen.queryByText(/tài khoản này chưa có lệnh nào/i)).not.toBeInTheDocument();
});

test("request hỏng thì báo lỗi cấp trang", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () =>
      HttpResponse.json({ code: 1500, msg: "hỏng", data: null }, { status: 500 }),
    ),
  );

  ve();
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/dashboardPage.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./DashboardPage"`.

- [ ] **Step 3: Viết `src/features/dashboard/DashboardPage.tsx`**

```tsx
import { useDeferredValue, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { DangTai } from "@/components/DangTai";
import { FilterBar } from "@/components/FilterBar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { EMPTY_FILTER, readFilter, writeParams, type TradeFilter } from "@/features/trades/filters";
import { useStats } from "@/features/trades/hooks";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { DailyPnlChart } from "./DailyPnlChart";
import { KpiGrid } from "./KpiGrid";
import { PivotBarChart } from "./PivotBarChart";
import { StreakBlock } from "./StreakBlock";
import { WeekdayChart } from "./WeekdayChart";
import { useCharts } from "./hooks";

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi BangDieuKhien vì mọi hook đều cần `account.id`: gọi chúng rồi
 * mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì số
 * lượng hook đổi giữa các lần render. Cùng khuôn với TradesPage.
 */
export function DashboardPage() {
  const { account, isPending } = useActiveAccount();
  const { t } = useI18n();

  if (isPending) return <DangTai dong={4} />;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        {t("trades.noAccount")}{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          {t("trades.createAccount")}
        </Link>{" "}
        {t("trades.startJournal")}
      </p>
    );
  }

  return <BangDieuKhien account={account} />;
}

function BangDieuKhien({ account }: { account: Account }) {
  const { locale, t } = useI18n();
  const [sp, setSp] = useSearchParams();

  // useMemo vì readFilter dựng object MỚI mỗi lần render, mà object đó là đầu
  // vào của useDeferredValue ngay bên dưới — so bằng Object.is thì "mới mỗi
  // lần" nghĩa là "luôn khác", và cơ chế hoãn không bao giờ bắt kịp.
  const filter = useMemo(() => readFilter(sp), [sp]);
  const filterHoan = useDeferredValue(filter);

  const bd = useCharts(account.id, filterHoan);
  const kpi = useStats(account.id, filterHoan);

  const coLoc = Object.values(filter).some((v) => v !== "");

  // KHÔNG có số trang ở đây: /charts và /stats gom trên toàn bộ tập đã lọc.
  // replace chứ không push — gõ mười ký tự vào ô mã sản phẩm mà đẩy mười mục
  // vào history thì nút Back phải bấm mười lần mới rời khỏi trang.
  function datFilter(f: TradeFilter) {
    setSp(writeParams(f, 1), { replace: true });
  }

  if (bd.isError || kpi.isError) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar value={filter} onChange={datFilter} />
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(bd.error ?? kpi.error, locale, t)}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (bd.isPending || kpi.isPending) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar value={filter} onChange={datFilter} />
        <DangTai dong={6} />
      </section>
    );
  }

  const c = bd.data;
  const trong = kpi.data.total_trades === 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </header>

      {/* Dính trên đỉnh vì nó áp cho MỌI mục bên dưới; để nó cuộn mất đi sẽ
          làm người ta quên mình đang xem tập lệnh nào. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-1">
        <FilterBar value={filter} onChange={datFilter} />
      </div>

      {trong ? (
        // Hai trạng thái rỗng, hai lời mời khác nhau. Gộp làm một sẽ mời người
        // dùng thêm lệnh trong khi họ chỉ cần bỏ một bộ lọc.
        <p className="text-muted-foreground">
          {coLoc ? t("dashboard.noMatch") : t("dashboard.noTrades")}{" "}
          <Link to="/trades" className="text-primary underline underline-offset-4">
            {t("dashboard.goToJournal")}
          </Link>
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.overview")}</h2>
            <KpiGrid stats={kpi.data} currency={account.currency} />
            <StreakBlock
              win={c.longest_win_streak}
              loss={c.longest_loss_streak}
              dangLoc={coLoc}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.growth")}</h2>
            <DailyPnlChart rows={c.by_day} currency={account.currency} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.byGroup")}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <PivotBarChart
                tieuDe={t("dashboard.bySetup")}
                rows={c.by_setup}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.bySymbol")}
                rows={c.by_symbol}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.byTimeframe")}
                rows={c.by_timeframe}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.byDirection")}
                rows={c.by_direction}
                currency={account.currency}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.byTime")}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <WeekdayChart rows={c.by_weekday} currency={account.currency} />
              <PivotBarChart
                tieuDe={t("dashboard.byWeek")}
                rows={c.by_week}
                currency={account.currency}
              />
            </div>
          </section>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Thêm mười một chuỗi i18n**

Vào `frontend/src/i18n/vi.ts`:

```ts
  "dashboard.title": "Bảng điều khiển",
  "dashboard.subtitle": "Kết quả giao dịch của tài khoản đang chọn",
  "dashboard.overview": "Tổng quan",
  "dashboard.growth": "Đường tăng trưởng",
  "dashboard.byGroup": "Theo nhóm",
  "dashboard.byTime": "Theo thời gian",
  "dashboard.bySetup": "Theo setup",
  "dashboard.bySymbol": "Theo mã sản phẩm",
  "dashboard.byTimeframe": "Theo khung thời gian",
  "dashboard.byDirection": "Theo chiều lệnh",
  "dashboard.byWeek": "Theo tuần",
  "dashboard.noTrades": "Tài khoản này chưa có lệnh nào.",
  "dashboard.noMatch": "Không có lệnh nào khớp bộ lọc đang bật.",
  "dashboard.goToJournal": "Mở nhật ký lệnh",
```

Vào `frontend/src/i18n/en.ts`:

```ts
  "dashboard.title": "Dashboard",
  "dashboard.subtitle": "Trading results for the selected account",
  "dashboard.overview": "Overview",
  "dashboard.growth": "Growth curve",
  "dashboard.byGroup": "By group",
  "dashboard.byTime": "By time",
  "dashboard.bySetup": "By setup",
  "dashboard.bySymbol": "By symbol",
  "dashboard.byTimeframe": "By timeframe",
  "dashboard.byDirection": "By direction",
  "dashboard.byWeek": "By week",
  "dashboard.noTrades": "This account has no trades yet.",
  "dashboard.noMatch": "No trades match the active filter.",
  "dashboard.goToJournal": "Open the trade journal",
```

- [ ] **Step 5: Thêm route**

Trong `frontend/src/app/router.tsx`, thêm vào khối `lazy`:

```ts
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
```

Thêm route con, đặt **trước** `/trades`:

```tsx
          <Route path="/dashboard" element={<DashboardPage />} />
```

Và đổi đích của route bắt-tất:

```tsx
        {/* Đăng nhập xong nên thấy KẾT QUẢ giao dịch, không phải trang cấu
            hình. /accounts là nơi người ta ghé để sửa vốn và múi giờ, việc
            làm một lần rồi thôi. */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
```

- [ ] **Step 6: Thêm NavLink**

Trong `frontend/src/app/AppShell.tsx`, thêm `LayoutDashboardIcon` vào khối import từ `lucide-react`, rồi thêm một dòng **trước** dòng `/trades`:

```tsx
              <Muc to="/dashboard" nhan={t("nav.dashboard")} icon={LayoutDashboardIcon} />
```

Thêm chuỗi vào `frontend/src/i18n/vi.ts`: `"nav.dashboard": "Bảng điều khiển",`
và `frontend/src/i18n/en.ts`: `"nav.dashboard": "Dashboard",`

- [ ] **Step 7: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Kỳ vọng: toàn bộ test xanh, kể cả `i18n.test.tsx` và các test cũ của `/trades`. `tsc` exit 0.

Nếu test cũ nào đó đỏ vì đích của `*` đổi, sửa test đó — đổi đích là chủ ý, ghi ở spec §9.

- [ ] **Step 8: Falsify — hai trạng thái rỗng phải khác nhau**

Trong `DashboardPage`, đổi `{coLoc ? t("dashboard.noMatch") : t("dashboard.noTrades")}` thành `{t("dashboard.noTrades")}`.

Chạy lại. Kỳ vọng: **đỏ** ở `lọc không ra gì thì giữ thanh lọc và mời bỏ lọc`. Khôi phục.

- [ ] **Step 9: Falsify — bộ lọc phải sống trên URL**

Đổi `const filter = useMemo(() => readFilter(sp), [sp]);` thành `const [filter] = useState(EMPTY_FILTER);` (thêm import `useState`).

Chạy lại. Kỳ vọng: **đỏ** ở `bộ lọc trên URL đi thẳng vào request` (nhận `""`) và ở `có lọc thì StreakBlock hiện lời nhắc`. Khôi phục.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
        frontend/src/features/dashboard/dashboardPage.test.tsx \
        frontend/src/app/router.tsx frontend/src/app/AppShell.tsx \
        frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): assemble the dashboard page and make it the landing route

Bốn mục có heading thật để trình đọc màn hình duyệt được. Hai trạng thái rỗng
tách riêng: chưa có lệnh và lọc không ra gì cần hai hành động khác nhau."
```

---

### Task 12: hành trình e2e và toàn bộ cổng

Spec §10. Lớp mà MSW mù: số do **backend thật** tính.

**Files:**
- Modify: `frontend/e2e/auth.spec.ts` (nối bước 17–20 vào cuối khối `describe.serial`)

**Interfaces:**
- Consumes: hàm `dangNhap(page)` và `moNhatKy(page)` đã có sẵn trong `auth.spec.ts`.
- Produces: không có API mới.

- [ ] **Step 1: Nối bốn bước vào `auth.spec.ts`**

Chèn **bên trong** khối `test.describe.serial`, ngay sau bước 16, trước dấu `});` đóng khối:

```ts
  // ---- Bảng điều khiển (bước 17-20) --------------------------------------
  //
  // PHẦN MSW KHÔNG THAY THẾ ĐƯỢC là bước 19: cùng một tập lệnh, hai màn hình,
  // và con số phải khớp. MSW trả cái ta bảo nó trả, nên nó không thể chứng
  // minh /stats và /charts đang nói về cùng một tập dữ liệu.

  async function moBangDieuKhien(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: "Bảng điều khiển" }).click();
    await expect(page.getByRole("heading", { name: "Bảng điều khiển" })).toBeVisible();
  }

  test("bước 17: bảng điều khiển là trang mặc định sau khi đăng nhập", async ({ page }) => {
    await dangNhap(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Bảng điều khiển" })).toBeVisible();
  });

  test("bước 18: bày đủ bốn mục và 23 chỉ số", async ({ page }) => {
    await dangNhap(page);
    await moBangDieuKhien(page);

    await expect(page.getByRole("heading", { level: 2, name: "Tổng quan" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Đường tăng trưởng" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Theo nhóm" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Theo thời gian" })).toBeVisible();

    // Trên trình duyệt thật thì ResizeObserver có sẵn, nên biểu đồ VẼ RA —
    // đây là điều jsdom không làm được, và là lý do bước này đáng chạy.
    await expect(page.locator("figure svg").first()).toBeVisible();
  });

  test("bước 19: lãi ròng trên bảng điều khiển khớp với dải KPI ở nhật ký", async ({ page }) => {
    await dangNhap(page);

    await page.getByRole("link", { name: "Nhật ký lệnh" }).click();
    const oNhatKy = page.getByRole("group", { name: "Net" });
    const soNhatKy = (await oNhatKy.innerText()).trim();

    await moBangDieuKhien(page);
    const oBang = page.getByRole("group", { name: "Lãi ròng" });
    await expect(oBang).toContainText(soNhatKy.replace(/^\+/, "").trim().split(" ")[0]);
  });

  test("bước 20: sửa một lệnh thì bảng điều khiển đổi số theo", async ({ page }) => {
    await dangNhap(page);

    await moBangDieuKhien(page);
    const truoc = (await page.getByRole("group", { name: "Lãi ròng" }).innerText()).trim();

    // Sửa lệnh 1 — cùng lối vào mà bước 13 đã dùng: bung dòng chi tiết rồi bấm
    // nút sửa của đúng lệnh đó. Ô nhập tên là "Lãi/lỗ", không phải "Lợi nhuận".
    await moNhatKy(page);
    await page.getByRole("button", { name: "Xem chi tiết lệnh 1" }).click();
    await page.getByRole("button", { name: "Sửa lệnh 1" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Lãi/lỗ").fill("777");
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();

    // Đây là bất biến số 1 chạy trên stack thật: nếu useLamMoi thiếu nhánh
    // chartsAll thì con số dưới đây vẫn là con số cũ.
    await moBangDieuKhien(page);
    await expect(page.getByRole("group", { name: "Lãi ròng" })).not.toHaveText(truoc);
  });
```

- [ ] **Step 2: Chạy e2e**

```bash
make e2e
```

Nếu Docker không kéo được ảnh nền, dùng đường vòng đã ghi ở cuối plan 3b:

```bash
cat > /tmp/e2e-noweb.yml <<'YAML'
services:
  api:
    image: trading-journal-web-app-api:latest
YAML
docker compose down
docker compose -p jrnl-e2e -f docker-compose.yml -f /tmp/e2e-noweb.yml up -d db migrate api
cd frontend && npm run dev &
E2E_BASE_URL=http://localhost:5173 npx playwright test
```

Giữa hai lần chạy: `TRUNCATE trades, cash_flows, accounts, refresh_tokens, users RESTART IDENTITY CASCADE`.

Kỳ vọng: 20/20 xanh.

- [ ] **Step 3: Chạy toàn bộ cổng**

```bash
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
cd .. && make test
git diff main -- backend/ | head
```

Kỳ vọng:
- `tsc` exit 0
- toàn bộ test Vitest xanh
- `npm run build` xanh; ghi lại kích thước chunk `DashboardPage` và chunk chung để đối chiếu với rủi ro "Recharts kéo bundle lên"
- `make test` (Go) xanh — nó phải xanh vì phase này không đụng backend
- `git diff main -- backend/` **rỗng**

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/auth.spec.ts
git commit -m "test(e2e): walk the dashboard on the real stack

Bước 19 là phần MSW mù: cùng một tập lệnh, hai màn hình, con số phải khớp.
MSW trả cái ta bảo nó trả nên nó không chứng minh được điều đó."
```

- [ ] **Step 5: Kết thúc nhánh**

**REQUIRED SUB-SKILL:** dùng `superpowers:finishing-a-development-branch`.

---

## Bất biến sẽ falsify — bảng tổng

Mỗi dòng phải được phá thật, xem test đỏ, rồi khôi phục. Task nào làm dòng nào ghi ở cột cuối.

| # | bất biến | cách phá | task |
|---|---|---|---|
| 1 | mutation lệnh làm mới **cả bốn** nhánh | xoá `chartsAll` khỏi `useLamMoi` | 5 |
| 2 | streak **không** đổi theo bộ lọc | đổi `{dangLoc && (` thành `{false && (` | 10 |
| 3 | nhãn tiền đi từ chuỗi gốc | `netGoc: String(toPlot(...))` | 4, 8 |
| 4 | `toPlot` ném khi chuỗi hỏng | bỏ phần kiểm, trả `+value` | 1 |
| 5 | KPI `null` ra `—` | `?? 0` | 7 |
| 6 | không sắp/cắt lại thứ tự backend | thêm `.sort()` theo `count` | 4 |
| 7 | `win_rate` là phân số | dùng `formatRatio` thay `formatPercent` | 7 |
| 8 | `/charts` không gửi `page` | `toQuery(f, 2)` | 5 |
| 9 | hoà (`0`) không phải lỗ | bỏ nhánh trung tính của `mauTheoDau` | 4 |
| 10 | không lọc bỏ nhóm rỗng | `.filter((d) => d.count > 0)` | 9 |
| 11 | hai trạng thái rỗng khác nhau | luôn dùng `noTrades` | 11 |
| 12 | bộ lọc sống trên URL | đổi sang `useState` | 11 |
| 13 | `toPlot` chỉ ở `prepare.ts` | gọi nó trong `StatsStrip.tsx` | 2 |
