# Phase 4b — Dashboard: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vẽ nốt năm nhóm biểu đồ còn lại của `/dashboard` — `heatmap`,
`r_distribution`, `score`, `radar`, `theory_vs_actual` — đóng trọn Phase 4 của
thiết kế mẹ, không sửa một dòng backend nào.

**Architecture:** Tiếp tục khuôn của 4a. Một module thuần mới —
`heatmap.ts` — vì hình học lịch (gấp một dãy ngày thành lưới tuần, tự điền
ngày backend không gửi, chia tam phân vị) tự nó lớn và khác hẳn ba hàm phẳng
đã có trong `prepare.ts`, nên nó tách riêng thay vì nhét chung. Ba nhóm còn
lại (`r_distribution`, `radar`+`score`, `theory_vs_actual`) đủ nhỏ để ở
chung `prepare.ts`. Lịch nhiệt vẽ bằng CSS grid thường, không phải Recharts —
Recharts không có heatmap, và `ResponsiveContainer` đo bằng `ResizeObserver`
mà jsdom không có, nên một lưới div thường lại là biểu đồ DUY NHẤT của trang
vẽ ra thật trong test.

**Tech Stack:** Vite 8 · React 19 · TypeScript 7 · TanStack Query v5 ·
React Router v7 · Recharts 3.10 · Tailwind v4 · Vitest 4 + Testing Library +
MSW · Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-phase-4b-dashboard-design.md`
(đọc cùng `docs/superpowers/specs/2026-08-22-phase-4a-dashboard-design.md` —
4b thừa kế nguyên vẹn mọi quyết định về `toPlot`, bố cục, và cặp màu lãi/lỗ
của 4a).

## Sửa một chỗ so với spec đã duyệt

Spec §5.2 dự đoán `heatmap.ts` cần `toPlot` để so `|sum_net|` lúc chia bậc,
và định nới cổng styleguard lên hai file. Khi dựng thuật toán thật thì không
đúng: so độ lớn hai chuỗi tiền chỉ cần `compareDecimal` (đã có sẵn, dùng
khắp `palette.ts`/`thresholds.ts`), không cần đổi sang `number`. `heatmap.ts`
không nạp Recharts, không cần toạ độ pixel, nên không có lý do gì đụng tới
ranh giới chuỗi→số của `toPlot`. Cổng styleguard **giữ nguyên đúng một file**
trong allowlist — bất biến số 9 của plan này (dưới) đổi cách falsify cho phù
hợp: gọi `toPlot` từ `heatmap.ts` để chứng minh nó **không cần thiết**, không
phải để chứng minh cổng đã nới đúng chỗ.

## Global Constraints

Mọi task đều ngầm mang theo mục này. Copy nguyên văn từ spec 4a §Global
Constraints — 4b không đổi bất cứ điều nào trong đó:

- **Tiền là chuỗi, không bao giờ `number`.** Ngoại lệ duy nhất là `toPlot()`,
  và nó chỉ được gọi từ `src/features/dashboard/prepare.ts`. `heatmap.ts`
  **không** thuộc allowlist (xem mục sửa spec ở trên) — nó dùng
  `compareDecimal` cho mọi phép so sánh độ lớn.
- **Cấm `Number(`, `parseFloat(`, `parseInt(`** trong mã dự án. Cổng
  `src/test/styleguard.test.ts` quét cả comment. Dùng `+v` sau khi regex đã
  bảo đảm dạng, hoặc dùng các phương thức `Date`/`Math` (không match ba tên
  bị cấm).
- **Cấm hardcode màu hex trong `.ts`/`.tsx`.** Mọi màu chart khai bằng biến
  CSS trong `src/styles/index.css`, component chỉ tham chiếu tên biến qua
  `palette.ts`.
- **Cấm chép cứng chuỗi enum tiếng Việt** vào FE. Không nhóm nào của 4b đụng
  tới enum có dấu của backend (`by_weekday` dùng key ASCII `Mon`..`Sun`, đã
  xác nhận ở `backend/internal/aggregate/pivot.go:132`) nên không task nào
  cần gọi `useMetaEnums()`.
- **Không sửa `docs/design/theme.css`** và không sửa `src/styles/theme.css`.
- **Không sửa `backend/`.** Cuối phase `git diff main -- backend/` phải
  rỗng.
- **Không cắt/sắp lại thứ tự backend đã quyết**, kể cả khi hình dạng đổi
  (lịch nhiệt gấp một dãy thẳng thành lưới hai chiều — thứ tự đọc trái sang
  phải, trên xuống dưới vẫn giữ nguyên đúng thứ tự ngày backend gửi).
- Mỗi task chạy test thật rồi mới đánh dấu xong. Mỗi bất biến ghi trong plan
  phải **falsify**: phá thật, xem test đỏ, khôi phục.
- Node ≥ 20 (`nvm use 22`). Lệnh test: `cd frontend && npx vitest run <đường dẫn>`.

## Bản đồ file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `frontend/src/features/dashboard/heatmap.ts` | module thuần: gấp lịch, tự điền ngày thiếu, chia tam phân vị |
| `frontend/src/features/dashboard/heatmap.test.ts` | test bảng cho `heatmap.ts` |
| `frontend/src/features/dashboard/HeatmapChart.tsx` | lưới ô CSS grid — không dùng Recharts |
| `frontend/src/features/dashboard/heatmapChart.test.tsx` | test DOM thật (không phải smoke) cho `HeatmapChart` |
| `frontend/src/features/dashboard/RDistributionChart.tsx` | histogram 22 bucket, một cột mỗi bucket |
| `frontend/src/features/dashboard/ScoreRadarBlock.tsx` | điểm trung bình (số to) + radar bốn trục |
| `frontend/src/features/dashboard/TheoryVsActualChart.tsx` | hai đường theo STT, một đứt một liền |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `frontend/src/styles/index.css` | 9 biến CSS mới (6 bậc nhiệt + `--chart-zero` + `--chart-empty` + `--chart-actual`), kèm khối `[data-theme="dark"]` cho 6 bậc |
| `frontend/src/features/dashboard/palette.ts` | `MAU_THUC_TE`, `MAU_HOA`, `MAU_KHONG_GIAO_DICH`, `bacNhiet()`, `mauDuongTheory()` |
| `frontend/src/features/dashboard/prepare.ts` | `chuanBiRDist`, `chuanBiRadar`, `chuanBiTheory` |
| `frontend/src/features/dashboard/prepare.test.ts` | test ba hàm trên + `mauDuongTheory` |
| `frontend/src/features/dashboard/charts.test.tsx` | nối test nội dung cho `RDistributionChart`, `ScoreRadarBlock`, `TheoryVsActualChart` |
| `frontend/src/test/tradeFactory.ts` | `taoCharts()` — `r_distribution` sửa từ một bucket thành đủ 22, khớp golden fixture |
| `frontend/src/features/dashboard/DashboardPage.tsx` | bốn chỗ theo spec §2.1 |
| `frontend/src/features/dashboard/dashboardPage.test.tsx` | 4 heading → 6, `KHONG_CO_LENH` thêm năm trường 4b |
| `frontend/src/i18n/vi.ts`, `en.ts` | 18 chuỗi mới cho 4b |
| `frontend/e2e/auth.spec.ts` | nối hai bước vào khối `bước 18` đã có |

**Không đụng:** `types.ts` (4a đã khai đủ), `hooks.ts`, `queryKeys.ts`,
`lib/decimal.ts`, `lib/thresholds.ts`, `KpiGrid.tsx`, `StreakBlock.tsx`,
`PivotBarChart.tsx`, `WeekdayChart.tsx`, `DailyPnlChart.tsx`,
`components/FilterBar.tsx`, `src/test/styleguard.test.ts` (xem mục sửa spec).

---

### Task 1: Nền màu 4b — CSS, `palette.ts`, ba hàm `prepare.ts`

Spec §4, §2.6, §3. Task đầu vì mọi component còn lại đứng trên nó.

**Files:**
- Modify: `frontend/src/styles/index.css`
- Modify: `frontend/src/features/dashboard/palette.ts`
- Modify: `frontend/src/features/dashboard/prepare.ts`
- Modify: `frontend/src/features/dashboard/prepare.test.ts`

**Interfaces:**
- Consumes: `compareDecimal` từ `@/lib/decimal`; `RBucket`, `Radar`,
  `TheoryPoint` từ `./types` (đã khai ở 4a).
- Produces:
  ```ts
  // palette.ts
  export const MAU_THUC_TE: string;
  export const MAU_HOA: string;
  export const MAU_KHONG_GIAO_DICH: string;
  export function bacNhiet(bac: 1 | 2 | 3, lai: boolean): string;
  export function mauDuongTheory(loai: "lyThuyet" | "thucTe"): string;

  // prepare.ts
  export type CotBucket = {
    label: string;
    count: number;
    wins: number;
    losses: number;
    mau: string;
  };
  export function chuanBiRDist(rows: RBucket[]): CotBucket[];

  export type DiemRadar = {
    truc: "entry" | "inTrade" | "exit" | "psych";
    diem: number;
    diemGoc: string | null;
  };
  export function chuanBiRadar(r: Radar): DiemRadar[];

  export type DiemTheory = {
    stt: number;
    thucTe: number;
    thucTeGoc: string;
    lyThuyet: number;
    lyThuyetGoc: string;
  };
  export function chuanBiTheory(rows: TheoryPoint[]): DiemTheory[];
  ```

- [x] **Step 1: Viết test đỏ**

Nối vào cuối `frontend/src/features/dashboard/prepare.test.ts`:

```ts
import {
  MAU_LAI,
  MAU_LO,
  MAU_TRUNG_TINH,
  MAU_THUC_TE,
  mauDuongTheory,
} from "./palette";
import {
  chuanBiNgay,
  chuanBiPivot,
  chuanBiRadar,
  chuanBiRDist,
  chuanBiTheory,
  chuanBiWeekday,
} from "./prepare";
import type {
  DayStat,
  Pivot,
  RBucket,
  Radar,
  TheoryPoint,
  WeekdayStat,
} from "./types";
```

(thay dòng import đầu file hiện có bằng khối trên — nó chỉ nối thêm tên, không
đổi tên cũ nào).

```ts
describe("chuanBiRDist", () => {
  test("bucket phía lỗ tô đỏ, phía lãi tô lãi — theo VỊ TRÍ, không theo wins/losses", () => {
    // "0R to -1R" là index 10 (phía lỗ), "0R to 1R" là index 11 (phía lãi) —
    // ranh giới thật của R = net / one_R. Dựng đúng ca khó: index 11 có
    // count = 1 nhưng wins = losses = 0. Ca này CÓ THẬT: aggregate.RDistribution
    // (backend/internal/aggregate/rdist.go) cho ratio = 0 vào bucket "0R to 1R"
    // (nửa mở [0,1)) nhưng chỉ tăng wins nếu Net dương — một lệnh net = 0 rơi
    // đúng vào đây mà không được tính thắng lẫn thua. Suy màu từ wins/losses sẽ
    // sai đúng ở ranh giới này; suy từ vị trí thì không bao giờ sai.
    const rows: RBucket[] = Array.from({ length: 22 }, (_, i) => ({
      label: `bucket-${i}`,
      count: i === 10 || i === 11 ? 1 : 0,
      wins: 0,
      losses: 0,
    }));
    const ra = chuanBiRDist(rows);
    expect(ra[10].mau).toBe(MAU_LO);
    expect(ra[11].mau).toBe(MAU_LAI);
  });

  test("đủ 22 cột, không cắt bớt bucket rỗng nào", () => {
    const rows: RBucket[] = Array.from({ length: 22 }, (_, i) => ({
      label: `b${i}`,
      count: 0,
      wins: 0,
      losses: 0,
    }));
    expect(chuanBiRDist(rows)).toHaveLength(22);
  });

  test("giữ nguyên nhãn, count, wins, losses của backend", () => {
    const rows: RBucket[] = [{ label: "0R to 1R", count: 3, wins: 3, losses: 0 }];
    const [c] = chuanBiRDist(rows);
    expect(c).toMatchObject({ label: "0R to 1R", count: 3, wins: 3, losses: 0 });
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(chuanBiRDist([])).toEqual([]);
  });
});

describe("chuanBiRadar", () => {
  test("trục null vẽ tại gốc nhưng GIỮ chuỗi gốc null để phân biệt với 0 điểm", () => {
    // Bất biến: null (chưa chấm) khác 0 (chấm được 0 điểm). diem = 0 chỉ là
    // toạ độ hình học cho trục không vẽ được với dữ liệu thiếu; diemGoc null
    // là thứ ScoreRadarBlock đọc để quyết định có hiện lời nhắc hay không.
    const r: Radar = {
      avg_entry: "12.5",
      avg_in_trade: null,
      avg_exit: "25",
      avg_psych: "12.5",
    };
    const ra = chuanBiRadar(r);
    const inTrade = ra.find((d) => d.truc === "inTrade")!;
    expect(inTrade.diem).toBe(0);
    expect(inTrade.diemGoc).toBeNull();
    const entry = ra.find((d) => d.truc === "entry")!;
    expect(entry.diem).toBe(12.5);
    expect(entry.diemGoc).toBe("12.5");
  });

  test("đủ bốn trục theo đúng thứ tự entry, inTrade, exit, psych", () => {
    const r: Radar = { avg_entry: "1", avg_in_trade: "2", avg_exit: "3", avg_psych: "4" };
    expect(chuanBiRadar(r).map((d) => d.truc)).toEqual(["entry", "inTrade", "exit", "psych"]);
  });

  test("cả bốn trục null thì cả bốn đều diem = 0, diemGoc = null", () => {
    const r: Radar = { avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null };
    const ra = chuanBiRadar(r);
    expect(ra.every((d) => d.diem === 0)).toBe(true);
    expect(ra.every((d) => d.diemGoc === null)).toBe(true);
  });
});

describe("chuanBiTheory", () => {
  test("hai đường giữ cả dạng số lẫn chuỗi gốc, đúng thứ tự stt", () => {
    const rows: TheoryPoint[] = [
      { stt: 1, cum_theory: "120", cum_by_trade: "98" },
      { stt: 2, cum_theory: "80", cum_by_trade: "47" },
    ];
    const ra = chuanBiTheory(rows);
    expect(ra.map((r) => r.lyThuyet)).toEqual([120, 80]);
    expect(ra.map((r) => r.thucTe)).toEqual([98, 47]);
    expect(ra[0].lyThuyetGoc).toBe("120");
    expect(ra[0].thucTeGoc).toBe("98");
    expect(ra.map((r) => r.stt)).toEqual([1, 2]);
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(chuanBiTheory([])).toEqual([]);
  });
});

test("đường lý thuyết dùng màu trung tính, KHÔNG mang màu lãi/lỗ", () => {
  // Bất biến số 7 của plan này. cum_theory là MỐC so sánh, không phải chuỗi
  // ngang hàng — tô nó lãi/lỗ là nói nó cũng thắng/thua, trong khi nó chỉ là
  // con số lẽ ra có nếu mọi lệnh chạy đúng kế hoạch.
  expect(mauDuongTheory("lyThuyet")).toBe(MAU_TRUNG_TINH);
  expect(mauDuongTheory("lyThuyet")).not.toBe(MAU_LAI);
  expect(mauDuongTheory("lyThuyet")).not.toBe(MAU_LO);
  expect(mauDuongTheory("thucTe")).toBe(MAU_THUC_TE);
});
```

- [x] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/prepare.test.ts
```

Expected: FAIL — `chuanBiRDist`, `chuanBiRadar`, `chuanBiTheory`,
`MAU_THUC_TE`, `mauDuongTheory` chưa tồn tại.

- [x] **Step 3: Thêm chín biến CSS**

Nối vào cuối `frontend/src/styles/index.css`:

```css

/* Ba bậc cường độ cho lịch nhiệt (heatmap), hai nhánh lãi/lỗ, cộng màu đường
 * "thực tế" của theory_vs_actual. Chi tiết:
 * docs/superpowers/specs/2026-08-23-phase-4b-dashboard-design.md §4.
 *
 * Sáu bậc chạy validateOrdinal (ramp MỘT sắc, khác validate() dùng cho bảng
 * phân loại) — chạy lại khi đổi:
 *   import { validateOrdinal } from "<dataviz>/scripts/validate_palette.js";
 *   validateOrdinal(["#20c997","#0ca678","#087f5b"], { mode: "light", surface: "#ffffff" });
 *   validateOrdinal(["#ff6b6b","#f03e3e","#c92a2a"], { mode: "light", surface: "#ffffff" });
 *   validateOrdinal(["#087f5b","#0ca678","#20c997"], { mode: "dark",  surface: "#171f2e" });
 *   validateOrdinal(["#c92a2a","#f03e3e","#ff6b6b"], { mode: "dark",  surface: "#171f2e" });
 * Cả bốn PASS ở cả hai theme (đầu nhạt/tối vẫn đạt tương phản, ΔL >= 0.06 mỗi
 * bậc, đơn sắc <= 4°). Bậc "vừa" của nhánh lãi trùng --chart-profit đã có,
 * nên hai biểu đồ cạnh nhau không cãi màu.
 *
 * --chart-zero / --chart-empty KHÔNG phải màu mới: chúng THAM CHIẾU token
 * ngữ nghĩa có sẵn (border/surface), nên tự đổi theo theme khi CSS custom
 * property resolve lúc dùng — không cần khối [data-theme="dark"] riêng cho
 * hai biến này.
 *
 * --chart-actual đạt đủ sáu phép kiểm categorical ở CẢ HAI theme cùng một mã
 * #1c7ed6 — một giá trị cho cả hai theme, giống --chart-profit/--chart-loss,
 * là chủ ý chứ không phải thiếu sót.
 */
:root {
  --chart-heat-profit-1: #20c997;
  --chart-heat-profit-2: #0ca678;
  --chart-heat-profit-3: #087f5b;
  --chart-heat-loss-1: #ff6b6b;
  --chart-heat-loss-2: #f03e3e;
  --chart-heat-loss-3: #c92a2a;
  --chart-zero: var(--border-strong);
  --chart-empty: var(--surface-sunken);
  --chart-actual: #1c7ed6;
}

[data-theme="dark"] {
  /* Cùng sáu mã hex ở trên, đọc NGƯỢC chiều: yếu nằm gần nền tối, mạnh sáng
   * nhất. Không cần sáu mã mới — sequential ramp đổi neo trong dark, không
   * đổi hue. */
  --chart-heat-profit-1: #087f5b;
  --chart-heat-profit-2: #0ca678;
  --chart-heat-profit-3: #20c997;
  --chart-heat-loss-1: #c92a2a;
  --chart-heat-loss-2: #f03e3e;
  --chart-heat-loss-3: #ff6b6b;
}
```

- [x] **Step 4: Nối vào `palette.ts`**

Thêm vào cuối `frontend/src/features/dashboard/palette.ts` (giữ nguyên toàn bộ
nội dung hiện có ở trên):

```ts

/**
 * Đường "thực tế" của theory_vs_actual.
 *
 * KHÔNG dùng --primary: đường lũy kế của DailyPnlChart dùng --primary vì đó
 * là biểu đồ MỘT chuỗi. Ở đây có HAI chuỗi cạnh nhau, cần một màu tách bạch
 * khỏi cả --primary lẫn cặp lãi/lỗ để không mang nhầm nghĩa cực tính — đường
 * "thực tế" không phải là "lãi", nó chỉ là MỘT trong hai đường.
 */
export const MAU_THUC_TE = "var(--chart-actual)";

/** Ô lịch nhiệt của một ngày HOÀ (có giao dịch, sum_net = 0).
 *
 * KHÁC MAU_TRUNG_TINH: đó là màu cho CHỮ/ĐƯỜNG (đủ tương phản để đọc), cái
 * này là màu cho Ô nền — chỉ cần là một điểm neo trung tính giữa hai đầu
 * ramp, không cần đạt ngưỡng tương phản văn bản.
 */
export const MAU_HOA = "var(--chart-zero)";

/** Ô lịch nhiệt của một ngày KHÔNG giao dịch — trong dải ngày nhưng backend
 * không gửi ô nào cho ngày đó. */
export const MAU_KHONG_GIAO_DICH = "var(--chart-empty)";

const BAC_NHIET_LAI = [
  "var(--chart-heat-profit-1)",
  "var(--chart-heat-profit-2)",
  "var(--chart-heat-profit-3)",
] as const;
const BAC_NHIET_LO = [
  "var(--chart-heat-loss-1)",
  "var(--chart-heat-loss-2)",
  "var(--chart-heat-loss-3)",
] as const;

/**
 * Màu ô lịch nhiệt theo bậc cường độ VÀ cực tính.
 *
 * `bac`: 1 (yếu, gần nền) .. 3 (mạnh nhất) — heatmap.ts tính bậc bằng tam
 * phân vị của |sum_net|. `lai`: true dùng ramp teal, false dùng ramp đỏ. Cả
 * hai ramp đã qua validateOrdinal ở cả hai theme; dark mode đọc NGƯỢC chiều
 * qua khối [data-theme="dark"] ở index.css, nên hàm này không cần biết theme
 * hiện tại — nó chỉ chọn ĐÚNG BIẾN, giá trị thật CSS tự lo.
 */
export function bacNhiet(bac: 1 | 2 | 3, lai: boolean): string {
  return (lai ? BAC_NHIET_LAI : BAC_NHIET_LO)[bac - 1];
}

/**
 * Màu của hai đường trong TheoryVsActualChart.
 *
 * Tách thành hàm THUẦN thay vì hằng số gọi trực tiếp trong component: đây là
 * chỗ DUY NHẤT falsify được bằng test mà không cần DOM thật. Recharts không
 * vẽ path/line nào trong jsdom (4a §2.5, ResponsiveContainer đo bằng
 * ResizeObserver), nên không thể assert lên stroke của <path> thật — nhưng
 * assert được lên giá trị mà component SẼ truyền vào stroke.
 */
export function mauDuongTheory(loai: "lyThuyet" | "thucTe"): string {
  return loai === "thucTe" ? MAU_THUC_TE : MAU_TRUNG_TINH;
}
```

- [x] **Step 5: Nối ba hàm vào `prepare.ts`**

Sửa dòng import đầu `frontend/src/features/dashboard/prepare.ts`:

```ts
import { toPlot } from "@/lib/decimal";
import { mauTheoDau } from "./palette";
import type { DayStat, Pivot, RBucket, Radar, TheoryPoint, WeekdayStat } from "./types";
```

Thêm vào cuối file (sau `chuanBiNgay`):

```ts

// Index 11 trở lên là phía LÃI ("0R to 1R" .. "Trên 20R"), dưới đó là phía LỖ
// ("Dưới -20R" .. "0R to -1R") — đúng 11 bucket mỗi bên, cố định theo thứ tự
// backend trả (plan §5.9, rdist.go:34-56). KHÔNG suy cực tính từ wins/losses:
// một lệnh net = 0 rơi vào bucket "0R to 1R" (bucketIndex của Go coi ratio = 0
// thuộc nửa mở [0,1)) nhưng KHÔNG được tính vào wins lẫn losses — bucket đó có
// thể có count > 0 mà wins = losses = 0, và suy màu từ hai con số đó sẽ sai
// đúng ở ranh giới. Vị trí trong mảng thì không bao giờ sai vì backend không
// bao giờ sắp lại thứ tự (bất biến số 6 của 4a).
const NGUONG_LAI = 11;

export type CotBucket = {
  label: string;
  count: number;
  wins: number;
  losses: number;
  mau: string;
};

export function chuanBiRDist(rows: RBucket[]): CotBucket[] {
  return rows.map((r, i) => ({
    label: r.label,
    count: r.count,
    wins: r.wins,
    losses: r.losses,
    mau: i >= NGUONG_LAI ? MAU_LAI : MAU_LO,
  }));
}

export type DiemRadar = {
  truc: "entry" | "inTrade" | "exit" | "psych";
  diem: number;
  diemGoc: string | null;
};

export function chuanBiRadar(r: Radar): DiemRadar[] {
  const cap: [DiemRadar["truc"], string | null][] = [
    ["entry", r.avg_entry],
    ["inTrade", r.avg_in_trade],
    ["exit", r.avg_exit],
    ["psych", r.avg_psych],
  ];
  return cap.map(([truc, v]) => ({
    truc,
    // Trục null (chưa chấm) vẽ TẠI GỐC — radar bốn trục không vẽ được với ba
    // đỉnh, hình học ép buộc phải có con số. diemGoc null đi kèm để phân biệt
    // với "được 0 điểm" (spec 4b §6).
    diem: v === null ? 0 : toPlot(v),
    diemGoc: v,
  }));
}

export type DiemTheory = {
  stt: number;
  thucTe: number;
  thucTeGoc: string;
  lyThuyet: number;
  lyThuyetGoc: string;
};

export function chuanBiTheory(rows: TheoryPoint[]): DiemTheory[] {
  return rows.map((r) => ({
    stt: r.stt,
    thucTe: toPlot(r.cum_by_trade),
    thucTeGoc: r.cum_by_trade,
    lyThuyet: toPlot(r.cum_theory),
    lyThuyetGoc: r.cum_theory,
  }));
}
```

Sửa dòng import đầu `prepare.ts` một lần nữa để `chuanBiRDist` lấy được
`MAU_LAI`/`MAU_LO` (đã có sẵn trong cùng import từ `./palette`, không cần
thêm — kiểm lại dòng `import { mauTheoDau } from "./palette";` đổi thành
`import { MAU_LAI, MAU_LO, mauTheoDau } from "./palette";`).

- [x] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/prepare.test.ts
```

Expected: PASS toàn bộ.

- [x] **Step 7: Falsify bất biến — vị trí quyết cực tính, không phải wins/losses**

Trong `chuanBiRDist`, đổi tạm `i >= NGUONG_LAI ? MAU_LAI : MAU_LO` thành
`r.wins > 0 ? MAU_LAI : MAU_LO`. Chạy lại test — ca "index 11 có count=1 wins=0
losses=0" phải đỏ (dòng đó giờ nhận `MAU_LO` sai). Khôi phục lại bản đúng.

- [x] **Step 8: Falsify bất biến — null khác 0**

Trong `chuanBiRadar`, đổi tạm `diemGoc: v` thành `diemGoc: v ?? "0"`. Chạy lại
test — ca "trục null vẽ tại gốc nhưng GIỮ chuỗi gốc null" phải đỏ. Khôi phục.

- [x] **Step 9: Falsify bất biến — đường lý thuyết không mang màu lãi/lỗ**

Trong `mauDuongTheory`, đổi tạm nhánh `"lyThuyet"` để trả `MAU_LAI`. Chạy lại
test — ca "đường lý thuyết dùng màu trung tính" phải đỏ. Khôi phục.

- [x] **Step 10: Commit**

```bash
git add frontend/src/styles/index.css frontend/src/features/dashboard/palette.ts \
        frontend/src/features/dashboard/prepare.ts frontend/src/features/dashboard/prepare.test.ts
git commit -m "feat(fe): add the 4b palette and the three flat prepare functions

Nine new CSS variables: a six-step diverging ramp for the heatmap (validated
with validateOrdinal, both themes) plus a zero/empty pair that aliases
existing surface tokens instead of inventing new hex, plus one blue for the
theory-vs-actual reference line.

chuanBiRDist colors by BUCKET POSITION, not by wins/losses — a net=0 trade
lands in the '0R to 1R' bucket without incrementing either counter, so
reading polarity off those two fields is wrong exactly at that boundary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `heatmap.ts` — module thuần, gấp lịch

Spec §2.2–§2.5. Task khó nhất của phase: gấp một dãy `HeatmapMonth[]` thành
lưới tuần liên tục, tự điền ngày backend không gửi, chia ba bậc cường độ.

**Files:**
- Create: `frontend/src/features/dashboard/heatmap.ts`
- Create: `frontend/src/features/dashboard/heatmap.test.ts`

**Interfaces:**
- Consumes: `compareDecimal` từ `@/lib/decimal`; `bacNhiet`, `MAU_HOA`,
  `MAU_KHONG_GIAO_DICH` từ `./palette` (Task 1); `HeatmapCell`, `HeatmapMonth`
  từ `./types`.
- Produces:
  ```ts
  export type TrangThaiO = "ngoaiDai" | "khongGiaoDich" | "hoa" | "coLenh";

  export type OLich = {
    day: string | null; // null CHỈ khi ngoaiDai
    trangThai: TrangThaiO;
    mau: string;
    sumNetGoc: string | null;
    count: number;
  };

  export type ThangNhan = { thang: string; cot: number }; // "MM/YYYY", chỉ số cột

  export type LuoiNhiet = { cot: OLich[][]; nhanThang: ThangNhan[] };

  export function chuanBiHeatmap(months: HeatmapMonth[]): LuoiNhiet;
  ```

- [x] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/dashboard/heatmap.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { tuFrontend } from "@/test/paths";
import { MAU_HOA, MAU_KHONG_GIAO_DICH, bacNhiet } from "./palette";
import { chuanBiHeatmap } from "./heatmap";
import type { HeatmapMonth } from "./types";

// Hai ngày liền kề, không có lỗ thủng — khung tối thiểu để kiểm hình học cột
// không cần lo gì tới việc điền ngày.
const HAI_NGAY_LIEN_KE: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "98", count: 1 }, // Thứ Ba
      { day: "2026-06-10", sum_net: "-51", count: 1 }, // Thứ Tư
    ],
  },
];

// 09/06 rồi 15/06 — năm ngày thủng ở giữa (10,11,12,13,14) mà backend không
// gửi ô nào. Đây là fixture cho bất biến số 1: những ngày này phải được CHẾ
// RA, không bị bỏ qua.
const CO_LO_THUNG: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "100", count: 1 }, // Thứ Ba
      { day: "2026-06-15", sum_net: "-40", count: 1 }, // Thứ Hai
    ],
  },
];

describe("hình dạng lưới", () => {
  test("mỗi cột đúng 7 ô, hàng 0 là Chủ nhật", () => {
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    expect(cot).toHaveLength(1);
    expect(cot[0]).toHaveLength(7);
    // 07/06 là Chủ nhật của tuần chứa 09/06, nhưng nó ở NGOÀI DẢI (trước ngày
    // đầu dữ liệu) nên day = null theo hợp đồng kiểu (chỉ ngoaiDai có null).
    expect(cot[0][0].trangThai).toBe("ngoaiDai");
    expect(cot[0][0].day).toBeNull();
    // 09/06/2026 là Thứ Ba -> nằm ở hàng index 2 nếu hàng 0 là Chủ nhật.
    expect(cot[0][2].day).toBe("2026-06-09");
    expect(cot[0][2].trangThai).toBe("coLenh");
  });

  test("ngoài dải KHÔNG vẽ ô — day là null", () => {
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    // 07/06, 08/06 (trước 09/06) và 11..13/06 (sau 10/06) đều ngoài dải.
    const ngoaiDai = cot[0].filter((o) => o.trangThai === "ngoaiDai");
    expect(ngoaiDai).toHaveLength(5);
    expect(ngoaiDai.every((o) => o.day === null)).toBe(true);
  });

  test("hai ngày có lệnh giữ đúng chuỗi gốc và count", () => {
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    const ngay09 = cot[0].find((o) => o.day === "2026-06-09")!;
    const ngay10 = cot[0].find((o) => o.day === "2026-06-10")!;
    expect(ngay09).toMatchObject({ trangThai: "coLenh", sumNetGoc: "98", count: 1 });
    expect(ngay10).toMatchObject({ trangThai: "coLenh", sumNetGoc: "-51", count: 1 });
  });
});

// BẤT BIẾN SỐ 1: ngày thiếu được CHẾ RA, không bị bỏ.
describe("điền ngày thiếu (lỗ thủng thật)", () => {
  test("năm ngày giữa 09/06 và 15/06 thành khongGiaoDich, không biến mất", () => {
    const { cot } = chuanBiHeatmap(CO_LO_THUNG);
    const phang = cot.flat();
    const thung = phang.filter((o) => o.trangThai === "khongGiaoDich");
    expect(thung.map((o) => o.day)).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(thung.every((o) => o.mau === MAU_KHONG_GIAO_DICH)).toBe(true);
    expect(thung.every((o) => o.sumNetGoc === null && o.count === 0)).toBe(true);
  });

  test("lưới đủ hai cột tuần (09/06 Thứ Ba .. 15/06 Thứ Hai trải hai tuần)", () => {
    const { cot } = chuanBiHeatmap(CO_LO_THUNG);
    expect(cot).toHaveLength(2);
    // Cột 0: 07/06 (CN, ngoài dải) .. 13/06 (T7). Cột 1: 14/06 (CN) .. 20/06
    // (T7, ngoài dải). Chỉ kiểm những ô có day thật (không null).
    expect(cot[0][0].trangThai).toBe("ngoaiDai");
    expect(cot[0][2].day).toBe("2026-06-09"); // Thứ Ba, ngày đầu dữ liệu
    expect(cot[1][0].day).toBe("2026-06-14"); // Chủ nhật của tuần sau
    expect(cot[1][1].day).toBe("2026-06-15"); // Thứ Hai, ngày cuối dữ liệu
    expect(cot[1][6].trangThai).toBe("ngoaiDai"); // sau ngày cuối
  });
});

// BẤT BIẾN SỐ 2: không giao dịch KHÁC hoà.
describe("ba trạng thái ô vẽ ra", () => {
  test("sum_net đúng bằng 0 là hoà, không phải khongGiaoDich", () => {
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "0", count: 2 }] },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const o = cot[0].find((x) => x.day === "2026-06-09")!;
    expect(o.trangThai).toBe("hoa");
    expect(o.mau).toBe(MAU_HOA);
    expect(o.count).toBe(2);
  });

  test("hoà và không giao dịch tô KHÁC màu nhau", () => {
    const thang: HeatmapMonth[] = [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-08", sum_net: "0", count: 1 },
          { day: "2026-06-09", sum_net: "50", count: 1 },
        ],
      },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const hoa = cot[0].find((o) => o.day === "2026-06-08")!;
    expect(hoa.mau).not.toBe(MAU_KHONG_GIAO_DICH);
  });
});

// BẤT BIẾN SỐ 8: ranh giới tam phân vị đóng dưới, và các ca biên đã tả ở spec §2.5.
describe("chia bậc cường độ", () => {
  test("đúng một ngày có lệnh -> bậc 3 (không có 'một ngày thì tô nhạt')", () => {
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "50", count: 1 }] },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const o = cot[0].find((x) => x.day === "2026-06-09")!;
    expect(o.mau).toBe(bacNhiet(3, true));
  });

  test("mọi ngày cùng độ lớn -> tất cả bậc 3, bậc 1 và 2 rỗng", () => {
    const thang: HeatmapMonth[] = [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-07", sum_net: "50", count: 1 }, // CN
          { day: "2026-06-08", sum_net: "-50", count: 1 }, // T2
          { day: "2026-06-09", sum_net: "50", count: 1 }, // T3
          { day: "2026-06-10", sum_net: "-50", count: 1 }, // T4
          { day: "2026-06-11", sum_net: "50", count: 1 }, // T5
        ],
      },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const coLenh = cot[0].filter((o) => o.trangThai === "coLenh");
    expect(coLenh).toHaveLength(5);
    for (const o of coLenh) {
      const lai = o.sumNetGoc !== null && compareDecimalHelper(o.sumNetGoc) > 0;
      expect(o.mau).toBe(bacNhiet(3, lai));
    }
  });

  // Trợ giúp cục bộ cho test trên — không xuất khỏi file test.
  function compareDecimalHelper(v: string): number {
    return v.startsWith("-") ? -1 : v === "0" ? 0 : 1;
  }

  test("ranh giới ĐÓNG DƯỚI: độ lớn bằng đúng ranh giới thì lên bậc trên", () => {
    // Hai ngày có lệnh, độ lớn khác nhau: 51 và 98. sorted = [51, 98], n = 2.
    // b1 = sorted[floor(2/3)] = sorted[0] = 51. b2 = sorted[floor(4/3)] = sorted[1] = 98.
    // 51 == b1 (không < b1) và 51 < b2 -> bậc 2. 98 == b2 (không < b2) -> bậc 3.
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "98", count: 1 }] },
    ];
    thang[0].cells.push({ day: "2026-06-10", sum_net: "-51", count: 1 });
    const { cot } = chuanBiHeatmap(thang);
    const o09 = cot[0].find((o) => o.day === "2026-06-09")!;
    const o10 = cot[0].find((o) => o.day === "2026-06-10")!;
    expect(o09.mau).toBe(bacNhiet(3, true)); // 98 là độ lớn lớn nhất -> bậc 3
    expect(o10.mau).toBe(bacNhiet(2, false)); // 51 là độ lớn nhỏ nhất trong hai -> bậc 2
  });
});

describe("nhãn tháng", () => {
  test("hai ngày cùng tháng chỉ ra MỘT nhãn, gắn ở cột đầu tiên chứa ngày thật", () => {
    const { nhanThang } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    expect(nhanThang).toEqual([{ thang: "06/2026", cot: 0 }]);
  });

  test("hai tháng cách xa, nhãn tháng chuyển ở cột chứa ngày thật đầu tiên của tháng mới", () => {
    // 04/05/2026 (Thứ Hai) và 15/06/2026 (Thứ Hai). Lưới trải đúng 7 cột (49
    // ngày): cột 0 bắt đầu Chủ nhật 03/05, cột 6 bắt đầu Chủ nhật 14/06.
    //
    // Nhãn KHÔNG đợi tới cột 6: mọi ngày giữa hai mốc dữ liệu đều là
    // "khongGiaoDich" (có `day` thật, chỉ không có lệnh) chứ không phải
    // "ngoaiDai" (day = null) — nên ngày 07/06 (đầu tháng 6, nằm ở CỘT 5)
    // đã là "ngày thật đầu tiên của tháng 06" trước khi tới cột 6. Đây là
    // hành vi ĐÚNG của "nhãn theo ngày thật đầu tiên của cột", không phải
    // đợi ngày CÓ LỆNH đầu tiên của tháng.
    const thang: HeatmapMonth[] = [
      { month: "05/2026", cells: [{ day: "2026-05-04", sum_net: "10", count: 1 }] },
      { month: "06/2026", cells: [{ day: "2026-06-15", sum_net: "-10", count: 1 }] },
    ];
    const { cot, nhanThang } = chuanBiHeatmap(thang);
    expect(cot).toHaveLength(7);
    expect(nhanThang).toEqual([
      { thang: "05/2026", cot: 0 },
      { thang: "06/2026", cot: 5 },
    ]);
  });
});

test("mảng rỗng ra lưới rỗng, không ném", () => {
  expect(chuanBiHeatmap([])).toEqual({ cot: [], nhanThang: [] });
});

// Ghi nhận sửa spec §5.2: heatmap.ts KHÔNG cần toPlot. So độ lớn chỉ cần
// compareDecimal — test này tồn tại để một lần chạy lại xác nhận điều đó,
// không phải để chuẩn bị dùng toPlot sau này. Dùng tuFrontend() từ
// src/test/paths.ts để lấy đường dẫn — import.meta.url dưới jsdom của Vitest
// là URL http://, không phải file://, nên fileURLToPath ném lỗi ngay; đây là
// vấn đề đã biết và đã có lời giải trong chính comment của paths.ts.
test("không cần toPlot — mọi so sánh độ lớn đều qua compareDecimal", () => {
  const src = readFileSync(tuFrontend("src/features/dashboard/heatmap.ts"), "utf8");
  expect(src).not.toMatch(/\btoPlot\s*\(/);
});
```

- [x] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/heatmap.test.ts
```

Expected: FAIL — `./heatmap` chưa tồn tại.

- [x] **Step 3: Viết `src/features/dashboard/heatmap.ts`**

```ts
import { compareDecimal } from "@/lib/decimal";
import { MAU_HOA, MAU_KHONG_GIAO_DICH, bacNhiet } from "./palette";
import type { HeatmapCell, HeatmapMonth } from "./types";

/**
 * Gấp `HeatmapMonth[]` — mỗi tháng một mảng ô, chỉ chứa ngày CÓ giao dịch —
 * thành MỘT lưới lịch liên tục kiểu GitHub: 7 hàng (CN..T7) x n cột tuần.
 *
 * Vẽ đúng theo cấu trúc backend gửi (mười hai lưới lịch xếp dọc, mỗi tháng
 * một cái) sẽ nuốt chửng phần còn lại của trang với một năm giao dịch. Gộp
 * thành một lưới liên tục là MỘT màn hình thấy hết nhịp giao dịch — vốn là
 * điều duy nhất lịch nhiệt làm tốt hơn biểu đồ cột (spec 4b §2.2).
 *
 * KHÔNG dùng toPlot: mọi so sánh độ lớn đi qua compareDecimal trên chuỗi.
 * heatmap.ts không nạp Recharts, không cần toạ độ pixel, nên không có lý do
 * đụng tới ranh giới chuỗi->số (sửa spec §5.2 — bản spec dự đoán ngược).
 */

export type TrangThaiO = "ngoaiDai" | "khongGiaoDich" | "hoa" | "coLenh";

export type OLich = {
  /** null CHỈ khi trangThai === "ngoaiDai" — không có ngày thật để gắn nhãn. */
  day: string | null;
  trangThai: TrangThaiO;
  mau: string;
  sumNetGoc: string | null;
  count: number;
};

export type ThangNhan = { thang: string; cot: number };

export type LuoiNhiet = { cot: OLich[][]; nhanThang: ThangNhan[] };

function abs(v: string): string {
  return compareDecimal(v, "0") < 0 ? v.replace(/^-/, "") : v;
}

function ngayUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function themNgay(d: Date, soNgay: number): Date {
  const ket = new Date(d);
  ket.setUTCDate(ket.getUTCDate() + soNgay);
  return ket;
}

/**
 * Ranh giới tam phân vị theo RANK, đóng dưới: một giá trị BẰNG ranh giới thì
 * thuộc bậc TRÊN. Với dưới ba giá trị khác nhau — kể cả đúng một hoặc mọi giá
 * trị bằng nhau — công thức tự nhiên cho bậc thấp rỗng và dồn hết lên bậc cao
 * nhất, không cần nhánh riêng (spec 4b §2.5).
 */
function tinhRanhGioi(doLon: string[]): { b1: string; b2: string } {
  const sorted = [...doLon].sort(compareDecimal);
  const n = sorted.length;
  return { b1: sorted[Math.floor(n / 3)] ?? "0", b2: sorted[Math.floor((2 * n) / 3)] ?? "0" };
}

function xepBac(m: string, b1: string, b2: string): 1 | 2 | 3 {
  if (compareDecimal(m, b1) < 0) return 1;
  if (compareDecimal(m, b2) < 0) return 2;
  return 3;
}

export function chuanBiHeatmap(months: HeatmapMonth[]): LuoiNhiet {
  const cells: HeatmapCell[] = months.flatMap((m) => m.cells);
  if (cells.length === 0) return { cot: [], nhanThang: [] };

  const theoNgay = new Map(cells.map((c) => [c.day, c]));
  let ngayMin = cells[0].day;
  let ngayMax = cells[0].day;
  for (const c of cells) {
    if (c.day < ngayMin) ngayMin = c.day;
    if (c.day > ngayMax) ngayMax = c.day;
  }

  // Tam phân vị chỉ tính trên ngày CÓ LỆNH và KHÁC HOÀ — hoà đã có màu riêng
  // (MAU_HOA), không cạnh tranh bậc với những ngày thật sự lãi/lỗ.
  const doLonCoLenh = cells
    .filter((c) => compareDecimal(c.sum_net, "0") !== 0)
    .map((c) => abs(c.sum_net));
  const { b1, b2 } = tinhRanhGioi(doLonCoLenh);

  const dauDai = ngayUTC(ngayMin);
  const cuoiDai = ngayUTC(ngayMax);
  const dauLuoi = themNgay(dauDai, -dauDai.getUTCDay());
  const cuoiLuoi = themNgay(cuoiDai, 6 - cuoiDai.getUTCDay());

  const oPhang: OLich[] = [];
  for (let d = dauLuoi; d.getTime() <= cuoiLuoi.getTime(); d = themNgay(d, 1)) {
    const iso = isoUTC(d);

    if (iso < ngayMin || iso > ngayMax) {
      oPhang.push({ day: null, trangThai: "ngoaiDai", mau: "transparent", sumNetGoc: null, count: 0 });
      continue;
    }

    const o = theoNgay.get(iso);
    if (!o) {
      oPhang.push({
        day: iso,
        trangThai: "khongGiaoDich",
        mau: MAU_KHONG_GIAO_DICH,
        sumNetGoc: null,
        count: 0,
      });
      continue;
    }

    if (compareDecimal(o.sum_net, "0") === 0) {
      oPhang.push({ day: iso, trangThai: "hoa", mau: MAU_HOA, sumNetGoc: o.sum_net, count: o.count });
      continue;
    }

    const lai = compareDecimal(o.sum_net, "0") > 0;
    const bac = xepBac(abs(o.sum_net), b1, b2);
    oPhang.push({
      day: iso,
      trangThai: "coLenh",
      mau: bacNhiet(bac, lai),
      sumNetGoc: o.sum_net,
      count: o.count,
    });
  }

  const cot: OLich[][] = [];
  for (let i = 0; i < oPhang.length; i += 7) cot.push(oPhang.slice(i, i + 7));

  const nhanThang: ThangNhan[] = [];
  let thangTruoc: string | null = null;
  cot.forEach((c, idx) => {
    const ngayDau = c.find((o) => o.day)?.day;
    if (!ngayDau) return;
    const thang = ngayDau.slice(0, 7); // "YYYY-MM"
    if (thang !== thangTruoc) {
      const [y, m] = thang.split("-");
      nhanThang.push({ thang: `${m}/${y}`, cot: idx });
      thangTruoc = thang;
    }
  });

  return { cot, nhanThang };
}
```

- [x] **Step 4: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/heatmap.test.ts
```

Expected: PASS toàn bộ.

- [x] **Step 5: Falsify bất biến — ngày thiếu KHÔNG bị bỏ**

Trong `chuanBiHeatmap`, thay trọn nhánh điền ngày thiếu:

```ts
    const o = theoNgay.get(iso);
    if (!o) {
      continue; // PHÁ TẠM: bỏ hẳn ngày backend không gửi
    }
```

Chạy lại `heatmap.test.ts` — test "năm ngày giữa 09/06 và 15/06 thành
khongGiaoDich" phải đỏ (`thung` rỗng thay vì 5 phần tử). Khôi phục lại nhánh
`khongGiaoDich` đầy đủ.

- [x] **Step 6: Falsify bất biến — hoà khác không giao dịch**

Tạm đổi `if (compareDecimal(o.sum_net, "0") === 0)` thành `if (false)` (bỏ
hẳn nhánh hoà, để nó rơi xuống nhánh `coLenh` bình thường). Chạy lại test —
ca "sum_net đúng bằng 0 là hoà" phải đỏ (nó sẽ nhận màu bậc nhiệt thay vì
`MAU_HOA`). Khôi phục.

- [x] **Step 7: Falsify bất biến — ranh giới đóng dưới**

Trong `xepBac`, đổi `compareDecimal(m, b1) < 0` thành
`compareDecimal(m, b1) <= 0`.

Chạy lại `heatmap.test.ts`. Đúng **ba** ca phải đỏ, và đã kiểm bằng số trước
khi viết plan này:

| ca | đúng | sau khi phá |
|---|---|---|
| "đúng một ngày có lệnh -> bậc 3" | bậc 3 | bậc 1 (`b1 = b2 = 50`, `m <= b1`) |
| "mọi ngày cùng độ lớn -> tất cả bậc 3" | bậc 3 | bậc 1 (cả năm ngày) |
| "ranh giới ĐÓNG DƯỚI" | `o10` bậc 2 | `o10` bậc 1 (`51 <= b1 = 51`) |

Nếu KHÔNG đủ ba ca đỏ thì `tinhRanhGioi` sai chứ không phải `xepBac` — dừng
lại và kiểm nó trước. Khôi phục về `< 0`.

- [x] **Step 8: Falsify bất biến — cột tuần bắt đầu Chủ nhật**

Trong `chuanBiHeatmap`, đổi hai dòng dựng biên lưới sang kiểu tuần bắt đầu
Thứ Hai:

```ts
  const lechT2 = (d: Date) => (d.getUTCDay() + 6) % 7; // PHÁ TẠM
  const dauLuoi = themNgay(dauDai, -lechT2(dauDai));
  const cuoiLuoi = themNgay(cuoiDai, 6 - lechT2(cuoiDai));
```

Chạy lại `heatmap.test.ts` — bốn ca phải đỏ, mọi thứ dịch một ngày:
"mỗi cột đúng 7 ô, hàng 0 là Chủ nhật" (`cot[0][2].day` không còn là
`"2026-06-09"`), "lưới đủ hai cột tuần", "mọi ngày cùng độ lớn" (biên tuần
dịch kéo theo biên tam phân vị đổi), và ca nhãn tháng. Khôi phục hai dòng gốc
dùng `getUTCDay()` trực tiếp.

- [x] **Step 9: Commit**

```bash
git add frontend/src/features/dashboard/heatmap.ts frontend/src/features/dashboard/heatmap.test.ts
git commit -m "feat(fe): add heatmap.ts, the calendar-folding pure module

Flattens HeatmapMonth[] into one continuous GitHub-style week grid instead of
one calendar per month. The interesting part is what it invents: backend only
emits days that had trades, so this module manufactures every missing day in
range as 'no trade' — the inverse of 4a's 'never drop empty groups' rule, and
the same principle pointed the other way (the grid shape is decided by the
calendar, not by the data).

Tercile boundaries use rank-based cutoffs (closed-lower-bound) so fewer than
three distinct magnitudes degrades cleanly to 'lowest tier stays empty'
without a special case.

Corrects spec §5.2's prediction that this module would need toPlot — it
doesn't; every magnitude comparison stays on compareDecimal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `taoCharts()` — sửa `r_distribution` cho đủ 22 bucket

`src/test/tradeFactory.ts` hiện chỉ trả MỘT bucket cho `r_distribution` —
đúng với lúc 4a chưa dùng tới trường này, sai với hợp đồng thật của backend
(golden fixture trả đủ 22, kể cả bucket rỗng). Task nhỏ, đứng riêng vì mọi
test fixture của Task 5 (RDistributionChart) cần dữ liệu đúng hình dạng.

**Files:**
- Modify: `frontend/src/test/tradeFactory.ts`

**Interfaces:**
- Consumes: không có (dữ liệu tĩnh).
- Produces: `taoCharts().r_distribution` có đúng 22 phần tử, khớp
  `backend/internal/httpapi/testdata/charts.golden.json`.

- [x] **Step 1: Xác nhận không có test nào phụ thuộc hình dạng cũ**

```bash
cd frontend && grep -rn "r_distribution" src
```

Expected: chỉ hai chỗ — định nghĩa trong `tradeFactory.ts` và kiểu trong
`types.ts`. Không có test nào assert độ dài mảng này, nên sửa an toàn.

- [x] **Step 2: Sửa `taoCharts()`**

Trong `frontend/src/test/tradeFactory.ts`, tìm dòng:

```ts
    r_distribution: [{ label: "0R to 1R", count: 1, wins: 1, losses: 0 }],
```

Thay bằng (đúng 22 nhãn và giá trị của golden fixture,
`backend/internal/httpapi/testdata/charts.golden.json`):

```ts
    // Đủ 22 bucket, đúng thứ tự backend trả (rdist.go:34-56) — hai bucket
    // giữa có dữ liệu khớp golden fixture, hai mươi bucket còn lại rỗng.
    // aggregate.RDistribution LUÔN trả đủ 22 dù rỗng, nên fixture giả cũng
    // phải vậy: một mảng ngắn hơn sẽ làm mọi test dựa trên taoCharts() không
    // còn phản ánh đúng hợp đồng thật.
    r_distribution: [
      { label: "Dưới -20R", count: 0, wins: 0, losses: 0 },
      { label: "-15R to -20R", count: 0, wins: 0, losses: 0 },
      { label: "-10R to -15R", count: 0, wins: 0, losses: 0 },
      { label: "-8R to -10R", count: 0, wins: 0, losses: 0 },
      { label: "-6R to -8R", count: 0, wins: 0, losses: 0 },
      { label: "-5R to -6R", count: 0, wins: 0, losses: 0 },
      { label: "-4R to -5R", count: 0, wins: 0, losses: 0 },
      { label: "-3R to -4R", count: 0, wins: 0, losses: 0 },
      { label: "-2R to -3R", count: 0, wins: 0, losses: 0 },
      { label: "-1R to -2R", count: 0, wins: 0, losses: 0 },
      { label: "0R to -1R", count: 1, wins: 0, losses: 1 },
      { label: "0R to 1R", count: 1, wins: 1, losses: 0 },
      { label: "1R to 2R", count: 0, wins: 0, losses: 0 },
      { label: "2R to 3R", count: 0, wins: 0, losses: 0 },
      { label: "3R to 4R", count: 0, wins: 0, losses: 0 },
      { label: "4R to 5R", count: 0, wins: 0, losses: 0 },
      { label: "5R to R6", count: 0, wins: 0, losses: 0 },
      { label: "6R to 8R", count: 0, wins: 0, losses: 0 },
      { label: "8R to 10R", count: 0, wins: 0, losses: 0 },
      { label: "10R to 15R", count: 0, wins: 0, losses: 0 },
      { label: "15R to 20R", count: 0, wins: 0, losses: 0 },
      { label: "Trên 20R", count: 0, wins: 0, losses: 0 },
    ],
```

- [x] **Step 3: Chạy toàn bộ test frontend để chắc không gãy gì**

```bash
cd frontend && npx vitest run
```

Expected: PASS toàn bộ — không có test nào phụ thuộc hình dạng cũ (đã xác
nhận ở Step 1).

- [x] **Step 4: Commit**

```bash
git add frontend/src/test/tradeFactory.ts
git commit -m "test(fe): fix taoCharts r_distribution to the real 22-bucket shape

Left over from 4a, when nothing consumed this field: the stub had one bucket
where the backend contract always has 22, including empty ones. 4b's
RDistributionChart is the first real consumer, so the gap would have leaked
into every test built on this fixture.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `HeatmapChart.tsx` — lưới CSS, vẽ ra thật trong jsdom

Spec §5.3, §6, §4.4.

**Files:**
- Create: `frontend/src/features/dashboard/HeatmapChart.tsx`
- Create: `frontend/src/features/dashboard/heatmapChart.test.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `chuanBiHeatmap` từ `./heatmap` (Task 2); `formatMoney` từ
  `@/lib/decimal`; `useI18n` từ `@/i18n`; `HeatmapMonth` từ `./types`.
- Produces:
  ```ts
  export function HeatmapChart(props: { months: HeatmapMonth[]; currency: string }): JSX.Element;
  ```

- [x] **Step 1: Thêm hai chuỗi i18n**

Trong `frontend/src/i18n/vi.ts`, nối vào khối `dashboard.*` hiện có (ngay sau
`"dashboard.goToJournal"`):

```ts
  "dashboard.heatmap": "Lịch nhiệt",
  "dashboard.noTradeDay": "Không giao dịch",
```

Trong `frontend/src/i18n/en.ts`, cùng vị trí tương ứng:

```ts
  "dashboard.heatmap": "Heat calendar",
  "dashboard.noTradeDay": "No trades",
```

- [x] **Step 2: Viết test đỏ**

Tạo `frontend/src/features/dashboard/heatmapChart.test.tsx`:

```ts
import { render, screen } from "@testing-library/react";
import { HeatmapChart } from "./HeatmapChart";
import type { HeatmapMonth } from "./types";

// Fixture CÓ lỗ thủng thật — cùng ca dùng ở heatmap.test.ts, để bài kiểm ở
// đây bám vào DOM THẬT thay vì chỉ vào cấu trúc dữ liệu.
const CO_LO_THUNG: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "100", count: 1 },
      { day: "2026-06-15", sum_net: "-40", count: 1 },
    ],
  },
];

test("render được và nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  expect(screen.getByRole("heading", { name: "Lịch nhiệt" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Lịch nhiệt/);
});

test("mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<HeatmapChart months={[]} currency="USD" />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// BẤT BIẾN SỐ 1, kiểm ở mức DOM: đây là biểu đồ DUY NHẤT của dashboard vẽ ra
// thật trong jsdom (không dùng Recharts/ResizeObserver), nên test ở đây được
// phép bám thẳng vào phần tử thay vì chỉ smoke test.
test("năm ngày thủng render thành ô thật, không bị bỏ khỏi DOM", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  const thung = container.querySelectorAll('[data-trangthai="khongGiaoDich"]');
  expect(thung).toHaveLength(5);
});

test("ngoài dải không render ô nào (không có div thừa cho phần đệm)", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  // Lưới 09/06->15/06 trải 2 cột = 14 ô grid, nhưng chỉ 7 ô là NGÀY THẬT
  // (09,10,11,12,13,14,15) — 7 ô còn lại là ngoaiDai, không render.
  const oThat = container.querySelectorAll("[data-trangthai]");
  expect(oThat).toHaveLength(7);
});

test("bảng đọc được có đúng 7 hàng — không nhiều hơn (không lẫn ngoaiDai), không ít hơn (không mất khongGiaoDich)", () => {
  render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  const hang = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(hang).toEqual([
    "2026-06-09",
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
    "2026-06-13",
    "2026-06-14",
    "2026-06-15",
  ]);
});

test("ô có lệnh mang đúng bậc màu qua thuộc tính style", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  // Hai ngày có lệnh: +100 và -40. Tam phân vị tính trên ĐỘ LỚN của CẢ HAI
  // nhánh chung một tập (dấu chỉ quyết định dùng ramp nào, không tách tập):
  // sorted = [40, 100], n = 2 -> b1 = sorted[0] = 40, b2 = sorted[1] = 100.
  //   |100|: không < 40, không < 100  -> bậc 3 -> ramp lãi
  //   |40| : không < 40 (bằng đúng ranh giới, ĐÓNG DƯỚI nên KHÔNG ở bậc 1),
  //          nhưng 40 < 100            -> bậc 2 -> ramp lỗ
  // Bậc 2 chứ không phải 3 — đó chính là quy tắc "ranh giới đóng dưới" của
  // spec §2.5 nhìn từ phía DOM.
  const o09 = container.querySelector('[title^="2026-06-09"]');
  const o15 = container.querySelector('[title^="2026-06-15"]');
  expect(o09?.getAttribute("style")).toContain("--chart-heat-profit-3");
  expect(o15?.getAttribute("style")).toContain("--chart-heat-loss-2");
});
```

- [x] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/heatmapChart.test.tsx
```

Expected: FAIL — `./HeatmapChart` chưa tồn tại.

- [x] **Step 4: Viết `src/features/dashboard/HeatmapChart.tsx`**

```tsx
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiHeatmap, type OLich } from "./heatmap";
import type { HeatmapMonth } from "./types";

const NHAN_THU: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

/**
 * Lịch nhiệt MỘT lưới liên tục kiểu GitHub, không phải mỗi tháng một khung
 * (spec 4b §2.2). Vẽ bằng CSS grid thường — Recharts không có heatmap, và
 * ResponsiveContainer đo bằng ResizeObserver mà jsdom không có (4a §2.5).
 * Grid thường thì KHÔNG có giới hạn đó: đây là biểu đồ DUY NHẤT của trang vẽ
 * ra thật trong jsdom.
 *
 * Mỗi ô mang `data-trangthai` để test bám vào mà không cần đoán chuỗi style —
 * ngoaiDai không render gì cả (return null), nên không có "ô trong suốt"
 * thừa trong DOM.
 */
export function HeatmapChart({ months, currency }: { months: HeatmapMonth[]; currency: string }) {
  const { locale, t } = useI18n();
  const { cot, nhanThang } = chuanBiHeatmap(months);

  if (cot.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.heatmap")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  const tieuDeO = (o: OLich): string => {
    if (o.trangThai === "khongGiaoDich") return `${o.day} — ${t("dashboard.noTradeDay")}`;
    return `${o.day} ${formatMoney(o.sumNetGoc ?? "0", currency, locale)}`;
  };

  const hangThat = cot.flat().filter((o): o is OLich & { day: string } => o.trangThai !== "ngoaiDai");

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.heatmap")}</h3>

      <figure aria-label={`${t("dashboard.heatmap")} — ${t("dashboard.chartOf")}`} className="overflow-x-auto">
        <div
          className="grid w-max gap-[2px]"
          style={{
            gridTemplateColumns: `20px repeat(${cot.length}, 11px)`,
            gridTemplateRows: `14px repeat(7, 11px)`,
          }}
        >
          {nhanThang.map((n) => (
            <span
              key={n.cot}
              className="text-[10px] leading-[14px] text-muted-foreground"
              style={{ gridColumn: n.cot + 2, gridRow: 1 }}
            >
              {n.thang}
            </span>
          ))}

          {([0, 1, 2, 3, 4, 5, 6] as const).map((r) => (
            <span
              key={r}
              className="text-[9px] leading-[11px] text-muted-foreground"
              style={{ gridColumn: 1, gridRow: r + 2 }}
            >
              {NHAN_THU[r]}
            </span>
          ))}

          {cot.flatMap((cotDoc, ci) =>
            cotDoc.map((o, ri) => {
              if (o.trangThai === "ngoaiDai") return null;
              return (
                <div
                  key={o.day}
                  title={tieuDeO(o)}
                  data-trangthai={o.trangThai}
                  className="rounded-[2px]"
                  style={{ gridColumn: ci + 2, gridRow: ri + 2, backgroundColor: o.mau }}
                />
              );
            }),
          )}
        </div>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.heatmap")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.day")}</th>
            <th scope="col">{t("dashboard.net")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
          </tr>
        </thead>
        <tbody>
          {hangThat.map((o) => (
            <tr key={o.day}>
              <th scope="row">{o.day}</th>
              <td>{o.trangThai === "khongGiaoDich" ? "—" : formatMoney(o.sumNetGoc ?? "0", currency, locale)}</td>
              <td>{o.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [x] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/heatmapChart.test.tsx
```

Expected: PASS toàn bộ.

- [x] **Step 6: Falsify — ngoài dải không render**

Tạm đổi `if (o.trangThai === "ngoaiDai") return null;` thành
`if (false) return null;`. Chạy lại test — "ngoài dải không render ô nào"
phải đỏ (14 ô thay vì 7). Khôi phục.

- [x] **Step 7: Falsify — bảng đọc được đủ hàng**

Tạm đổi `hangThat` để lọc thêm `.filter((o) => o.trangThai === "coLenh")`
(bỏ luôn `khongGiaoDich` và `hoa` khỏi bảng). Chạy lại test — "bảng đọc được
có đúng 7 hàng" phải đỏ (chỉ còn 2 hàng). Khôi phục.

- [x] **Step 8: Chạy toàn bộ cổng cục bộ**

```bash
cd frontend && npx tsc --noEmit
```

Expected: exit 0.

- [x] **Step 9: Commit**

```bash
git add frontend/src/features/dashboard/HeatmapChart.tsx \
        frontend/src/features/dashboard/heatmapChart.test.tsx \
        frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add HeatmapChart, drawn with plain CSS grid

Plain divs, not Recharts — there's no heatmap chart type in Recharts, and
ResponsiveContainer needs a ResizeObserver jsdom doesn't have. That makes
this the one dashboard chart that renders for real in jsdom, so its tests
assert on actual DOM instead of smoke-testing past a blank ResizeObserver.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `RDistributionChart.tsx` — histogram 22 bucket

Spec §3, §7.3.

**Files:**
- Create: `frontend/src/features/dashboard/RDistributionChart.tsx`
- Modify: `frontend/src/features/dashboard/charts.test.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `chuanBiRDist` từ `./prepare` (Task 1); `RBucket` từ `./types`.
- Produces:
  ```ts
  export function RDistributionChart(props: { rows: RBucket[] }): JSX.Element;
  ```

- [x] **Step 1: Thêm bốn chuỗi i18n**

`frontend/src/i18n/vi.ts`:

```ts
  "dashboard.rDist": "Phân phối R",
  "dashboard.rBucket": "Khoảng R",
  "dashboard.wins": "Thắng",
  "dashboard.losses": "Thua",
```

`frontend/src/i18n/en.ts`:

```ts
  "dashboard.rDist": "R distribution",
  "dashboard.rBucket": "R bucket",
  "dashboard.wins": "Wins",
  "dashboard.losses": "Losses",
```

- [x] **Step 2: Viết test đỏ**

`frontend/src/features/dashboard/charts.test.tsx` đã có sẵn
`import { render, screen, within } from "@testing-library/react";`,
`import { taoCharts } from "@/test/tradeFactory";`, và
`const c = taoCharts();` ở đầu file — Task này chỉ nối thêm một dòng import
và bốn test mới, không đụng gì các dòng đó.

Thêm một dòng import, ngay dưới `import { WeekdayChart } from "./WeekdayChart";`:

```ts
import { RDistributionChart } from "./RDistributionChart";
```

Nối vào cuối file:

```ts
test("RDistributionChart bày đủ 22 cột, không cắt bớt bucket rỗng", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  expect(screen.getAllByRole("rowheader")).toHaveLength(22);
});

test("RDistributionChart nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  expect(screen.getByRole("heading", { name: "Phân phối R" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Phân phối R/);
});

test("RDistributionChart: bucket rỗng ra lời nhắn, không ra khung trống", () => {
  const rong = c.r_distribution.map((b) => ({ ...b, count: 0, wins: 0, losses: 0 }));
  render(<RDistributionChart rows={rong} />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("RDistributionChart: bảng đọc được ghi đúng wins/losses của từng bucket", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  // Hàng "0R to 1R" theo fixture: count=1, wins=1, losses=0 — cả count và
  // wins đều hiện chữ "1" nên getByText("1") mập mờ; đọc theo thứ tự CỘT
  // (count, wins, losses) qua getAllByRole("cell") thay vì đoán text.
  const hangLai = within(screen.getByRole("row", { name: /0R to 1R/ }));
  const oCot = hangLai.getAllByRole("cell").map((o) => o.textContent);
  expect(oCot).toEqual(["1", "1", "0"]); // count, wins, losses
});
```

- [x] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: FAIL — `./RDistributionChart` chưa tồn tại.

- [x] **Step 4: Viết `src/features/dashboard/RDistributionChart.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n";
import { chuanBiRDist } from "./prepare";
import type { RBucket } from "./types";

/**
 * Histogram phân phối R — MỘT cột mỗi bucket, không phải cột chồng.
 *
 * Plan gốc §5.9 viết "tách thắng/thua" nghĩa là cột chồng hai màu, nhưng hình
 * dạng dữ liệu không cho phép: R = net / one_R nên dấu của R LUÔN bằng dấu
 * của net — mỗi bucket chỉ có MỘT cực tính thật (spec 4b §3). Một cột chồng
 * ở đây sẽ luôn chỉ có một tầng, mãi mãi. wins/losses vẫn hiện trong tooltip
 * và bảng — chúng là dữ liệu thật, chỉ không đáng một kênh mã hoá màu.
 */
export function RDistributionChart({ rows }: { rows: RBucket[] }) {
  const { t } = useI18n();
  const data = chuanBiRDist(rows);
  const coLenh = data.some((d) => d.count > 0);

  if (!coLenh) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.rDist")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.rDist")}</h3>

      <figure aria-label={`${t("dashboard.rDist")} — ${t("dashboard.chartOf")}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 40, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              stroke="var(--text-muted)"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={40} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--surface-raised)" }}
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number];
                return [`${d.wins} ${t("dashboard.wins")} / ${d.losses} ${t("dashboard.losses")}`, d.label];
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.mau} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.rDist")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.rBucket")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
            <th scope="col">{t("dashboard.wins")}</th>
            <th scope="col">{t("dashboard.losses")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.count}</td>
              <td>{d.wins}</td>
              <td>{d.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [x] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: PASS toàn bộ.

- [x] **Step 6: Falsify bất biến số 5 — đủ 22 bucket**

Trong `RDistributionChart`, tạm đổi `data.map(...)` trong `<tbody>` thành
`data.filter((d) => d.count > 0).map(...)`. Chạy lại test — "bày đủ 22 cột"
phải đỏ (chỉ còn 2 hàng). Khôi phục.

- [x] **Step 7: Commit**

```bash
git add frontend/src/features/dashboard/RDistributionChart.tsx \
        frontend/src/features/dashboard/charts.test.tsx \
        frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add RDistributionChart, one bar per bucket

Not a stacked bar: R = net / one_R makes the sign of R always match the sign
of net, so every bucket already has exactly one polarity. A stacked win/loss
bar here would be a stack with one tier, in every bucket, forever — this
deviates from the letter of plan §5.9 for that reason, keeping wins/losses in
the tooltip and table instead of a second color channel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `ScoreRadarBlock.tsx` — điểm trung bình + radar bốn trục

Spec §2.6, §6.

**Files:**
- Create: `frontend/src/features/dashboard/ScoreRadarBlock.tsx`
- Modify: `frontend/src/features/dashboard/charts.test.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `chuanBiRadar` từ `./prepare` (Task 1); `MAU_LAI` từ `./palette`;
  `compareDecimal`, `formatRatio` từ `@/lib/decimal`; `Radar`, `ScoreSummary`
  từ `./types`.
- Produces:
  ```ts
  export function ScoreRadarBlock(props: { score: ScoreSummary; radar: Radar }): JSX.Element;
  ```

- [x] **Step 1: Thêm chín chuỗi i18n**

`frontend/src/i18n/vi.ts`:

```ts
  "dashboard.quality": "Chất lượng lệnh",
  "dashboard.score": "Điểm trung bình",
  "dashboard.radar": "Radar tâm lý",
  "dashboard.scoredCountSuffix": "lệnh đã chấm điểm",
  "dashboard.axisEntry": "Vào lệnh",
  "dashboard.axisInTrade": "Trong lệnh",
  "dashboard.axisExit": "Thoát lệnh",
  "dashboard.axisPsych": "Tâm lý",
  "dashboard.radarPartial": "Một vài trục chưa có lệnh nào được chấm điểm ở khía cạnh đó.",
  "dashboard.noScored": "Chưa lệnh nào được chấm điểm.",
```

`frontend/src/i18n/en.ts`:

```ts
  "dashboard.quality": "Trade quality",
  "dashboard.score": "Average score",
  "dashboard.radar": "Psychology radar",
  "dashboard.scoredCountSuffix": "trades scored",
  "dashboard.axisEntry": "Entry",
  "dashboard.axisInTrade": "In-trade",
  "dashboard.axisExit": "Exit",
  "dashboard.axisPsych": "Psychology",
  "dashboard.radarPartial": "Some axes have no scored trades yet for that aspect.",
  "dashboard.noScored": "No trades have been scored yet.",
```

- [x] **Step 2: Viết test đỏ**

Nối vào cuối `frontend/src/features/dashboard/charts.test.tsx`:

```ts
import { ScoreRadarBlock } from "./ScoreRadarBlock";

const score = taoCharts().score;
const radar = taoCharts().radar;

test("ScoreRadarBlock bày điểm trung bình và số lệnh đã chấm", () => {
  render(<ScoreRadarBlock score={score} radar={radar} />);
  // formatRatio đi qua Intl.NumberFormat("vi-VN", ...) — locale mặc định "vi"
  // dùng dấu PHẨY thập phân, nên "62.5" hiện thành "62,5", không phải "62.5".
  expect(screen.getByRole("group", { name: "Chất lượng lệnh" })).toHaveTextContent("62,5");
  expect(screen.getByText(/2 lệnh đã chấm điểm/)).toBeInTheDocument();
});

test("ScoreRadarBlock nêu tên radar cho trình đọc màn hình", () => {
  render(<ScoreRadarBlock score={score} radar={radar} />);
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Radar tâm lý/);
});

// BẤT BIẾN SỐ 6: score null ra "—", KHÔNG ra 0.
test("ScoreRadarBlock: chưa lệnh nào được chấm ra dấu — chứ không phải 0 điểm", () => {
  render(<ScoreRadarBlock score={{ scored_count: 0, avg_score_total: null }} radar={{
    avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null,
  }} />);
  const o = screen.getByRole("group", { name: "Chất lượng lệnh" });
  expect(o).toHaveTextContent("—");
  // "chưa chấm" và "chấm được 0 điểm" là hai câu chuyện khác nhau; hiện 0 ở
  // đây là bịa ra một lời phán xét chưa ai đưa ra.
  expect(o).not.toHaveTextContent("0");
  expect(screen.getByText(/chưa lệnh nào được chấm điểm/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// BẤT BIẾN §6: chưa chấm ở MỘT trục khác được 0 điểm ở trục đó — phải có ghi
// chú riêng, không lặng lẽ vẽ như thể là 0.
test("ScoreRadarBlock: một vài trục null thì hiện lời nhắc, không lẫn vào 0 điểm", () => {
  const radarThieu = { avg_entry: "20", avg_in_trade: null, avg_exit: "15", avg_psych: "10" };
  render(<ScoreRadarBlock score={{ scored_count: 3, avg_score_total: "45" }} radar={radarThieu} />);
  expect(screen.getByRole("note")).toBeInTheDocument();
});

test("ScoreRadarBlock: đủ bốn trục thì không có lời nhắc thừa", () => {
  render(<ScoreRadarBlock score={score} radar={radar} />);
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});
```

- [x] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: FAIL — `./ScoreRadarBlock` chưa tồn tại.

- [x] **Step 4: Viết `src/features/dashboard/ScoreRadarBlock.tsx`**

```tsx
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { compareDecimal, formatRatio } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { MAU_LAI } from "./palette";
import { chuanBiRadar } from "./prepare";
import type { Radar as RadarData, ScoreSummary } from "./types";

/**
 * Điểm trung bình (số to) và radar bốn trục trong MỘT khối (spec 4b §2.6).
 *
 * Chúng là cùng một câu chuyện — tổng và thành phần — nên đứng cạnh nhau thì
 * đọc một lượt là biết trục nào kéo tổng xuống.
 *
 * Trục radar CỐ ĐỊNH [0, 25]: mỗi score_* tối đa 25 điểm (plan §2.1-2.4). Để
 * Recharts tự co trục theo dữ liệu sẽ vẽ 5/5/5/5 và 25/25/25/25 giống hệt
 * nhau — đây là bất biến, không phải tuỳ chọn.
 *
 * Dùng MAU_LAI (không phải --primary) cho mảng tô radar: mảng tô LỚN cần cặp
 * đã qua validator cho vai mảng tô lớn, giống lý do --chart-profit tồn tại ở
 * 4a — --primary trượt đúng ở vai đó.
 */
export function ScoreRadarBlock({ score, radar }: { score: ScoreSummary; radar: RadarData }) {
  const { t, locale } = useI18n();

  // Bất biến §6: score null ra "—", KHÔNG ra 0. Chưa chấm lệnh nào khác hẳn
  // chấm được 0 điểm — cái sau là một lời phán xét, cái trước là chưa có dữ
  // liệu. Bày "—" cùng câu giải thích chứ không mượn dashboard.emptyGroup:
  // ô điểm vẫn phải có mặt để người đọc thấy chỗ con số SẼ xuất hiện.
  if (score.avg_score_total === null) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.quality")}</h3>
        <div role="group" aria-label={t("dashboard.quality")} className="flex flex-col gap-1">
          <span className="eyebrow">{t("dashboard.score")}</span>
          <span className="num text-3xl font-semibold text-muted-foreground">—</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("dashboard.noScored")}</p>
      </section>
    );
  }

  const nhanTruc: Record<string, string> = {
    entry: t("dashboard.axisEntry"),
    inTrade: t("dashboard.axisInTrade"),
    exit: t("dashboard.axisExit"),
    psych: t("dashboard.axisPsych"),
  };
  const diem = chuanBiRadar(radar).map((d) => ({ ...d, nhan: nhanTruc[d.truc] }));
  // Bất biến §6: chưa chấm KHÁC được 0 điểm. diemGoc null (không phải diem =
  // 0, vốn chỉ là toạ độ) mới là tín hiệu đúng để hiện lời nhắc.
  const conThieu = diem.some((d) => d.diemGoc === null);
  const dat80 = compareDecimal(score.avg_score_total, "80") >= 0;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 lg:flex-row lg:items-center">
      <h3 className="sr-only">{t("dashboard.quality")}</h3>

      <div role="group" aria-label={t("dashboard.quality")} className="flex flex-col gap-1">
        <span className="eyebrow">{t("dashboard.score")}</span>
        <span className={`num text-3xl font-semibold ${dat80 ? "text-primary" : ""}`}>
          {formatRatio(score.avg_score_total, 1, locale)}
        </span>
        <span className="text-xs text-muted-foreground">
          {score.scored_count} {t("dashboard.scoredCountSuffix")}
        </span>
      </div>

      <figure aria-label={`${t("dashboard.radar")} — ${t("dashboard.chartOf")}`} className="h-56 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={diem} outerRadius="70%">
            <PolarGrid stroke="var(--border-default)" />
            <PolarAngleAxis dataKey="nhan" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
            <PolarRadiusAxis
              domain={[0, 25]}
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof diem)[number];
                return [d.diemGoc === null ? "—" : formatRatio(d.diemGoc, 1, locale), d.nhan];
              }}
            />
            <Radar dataKey="diem" stroke={MAU_LAI} fill={MAU_LAI} fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </figure>

      {conThieu && (
        <p role="note" className="text-xs text-muted-foreground lg:basis-full">
          {t("dashboard.radarPartial")}
        </p>
      )}
    </section>
  );
}
```

- [x] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: PASS toàn bộ.

- [x] **Step 6: Falsify — null khác 0 điểm (hai chỗ)**

Chỗ thứ nhất, bất biến số 6 — trong nhánh `score.avg_score_total === null`,
tạm đổi `<span ...>—</span>` thành `<span ...>0</span>`. Chạy lại test — ca
"chưa lệnh nào được chấm ra dấu —" phải đỏ. Khôi phục.

Chỗ thứ hai, lời nhắc trục thiếu — tạm đổi `const conThieu = diem.some((d) =>
d.diemGoc === null);` thành `const conThieu = false;`. Chạy lại test — ca
"một vài trục null thì hiện lời nhắc" phải đỏ. Khôi phục.

- [x] **Step 7: Canh bất biến trục cố định `[0, 25]` bằng cổng tĩnh**

Recharts không vẽ trong jsdom (4a §2.5) nên không test DOM nào bắt được việc
bỏ `domain`. Đừng để bất biến này chỉ dựa vào mắt người review — canh bằng
một test đọc chính mã nguồn, cùng cách `heatmap.test.ts` canh `toPlot`.

Nối vào cuối `frontend/src/features/dashboard/charts.test.tsx`:

```ts
// Trục radar CỐ ĐỊNH [0, 25] — mỗi score_* tối đa 25 điểm (plan §2.1-2.4).
// Bỏ domain thì Recharts tự co trục theo dữ liệu và vẽ 5/5/5/5 giống hệt
// 25/25/25/25: một tài khoản kém trông cân đối y như một tài khoản hoàn hảo.
// Recharts không vẽ trong jsdom nên không assert lên SVG được — cổng này đọc
// thẳng mã nguồn, chấp nhận là cổng thô còn hơn để bất biến không ai canh.
test("PolarRadiusAxis ghim domain [0, 25], không để Recharts tự co", () => {
  const src = readFileSync(tuFrontend("src/features/dashboard/ScoreRadarBlock.tsx"), "utf8");
  expect(src).toMatch(/domain=\{\[0,\s*25\]\}/);
});
```

Chạy `npx vitest run src/features/dashboard/charts.test.tsx` — PASS. Rồi tạm
bỏ `domain={[0, 25]}` khỏi `<PolarRadiusAxis>`, chạy lại: test này phải đỏ.
Khôi phục.

- [x] **Step 8: Commit**

```bash
git add frontend/src/features/dashboard/ScoreRadarBlock.tsx \
        frontend/src/features/dashboard/charts.test.tsx \
        frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add ScoreRadarBlock, hero number plus its four axes

One block, not two sections: avg_score_total and the four score_* averages
are the same story — a total and its components — so they read together in
one glance instead of needing to be remembered across the page.

Radar domain is pinned to [0, 25] (each score_* maxes at 25 points, plan
§2.1-2.4): letting Recharts auto-scale would draw 5/5/5/5 and 25/25/25/25 as
the same shape.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `TheoryVsActualChart.tsx` — đường mốc đứt, đường thực tế liền

Spec §4.2.

**Files:**
- Create: `frontend/src/features/dashboard/TheoryVsActualChart.tsx`
- Modify: `frontend/src/features/dashboard/charts.test.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `chuanBiTheory` từ `./prepare` (Task 1); `mauDuongTheory` từ
  `./palette`; `formatMoney` từ `@/lib/decimal`; `TheoryPoint` từ `./types`.
- Produces:
  ```ts
  export function TheoryVsActualChart(props: { rows: TheoryPoint[]; currency: string }): JSX.Element;
  ```

- [x] **Step 1: Thêm ba chuỗi i18n**

`frontend/src/i18n/vi.ts`:

```ts
  "dashboard.theoryVsActual": "Lý thuyết vs thực tế",
  "dashboard.theory": "Lý thuyết",
  "dashboard.actual": "Thực tế",
```

`frontend/src/i18n/en.ts`:

```ts
  "dashboard.theoryVsActual": "Theory vs actual",
  "dashboard.theory": "Theory",
  "dashboard.actual": "Actual",
```

- [x] **Step 2: Viết test đỏ**

Nối vào cuối `frontend/src/features/dashboard/charts.test.tsx`:

```ts
import { TheoryVsActualChart } from "./TheoryVsActualChart";

const theory = taoCharts().theory_vs_actual;

test("TheoryVsActualChart nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<TheoryVsActualChart rows={theory} currency="USD" />);
  expect(screen.getByRole("heading", { name: "Lý thuyết vs thực tế" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Lý thuyết vs thực tế/);
});

test("TheoryVsActualChart: mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<TheoryVsActualChart rows={[]} currency="USD" />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("TheoryVsActualChart: bảng đọc được ghi đúng hai cột theo stt", () => {
  render(<TheoryVsActualChart rows={theory} currency="USD" />);
  const hang1 = within(screen.getByRole("row", { name: /^1/ }));
  expect(hang1.getByText(/^120 USD$/)).toBeInTheDocument();
  expect(hang1.getByText(/^98 USD$/)).toBeInTheDocument();
});
```

- [x] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: FAIL — `./TheoryVsActualChart` chưa tồn tại.

- [x] **Step 4: Viết `src/features/dashboard/TheoryVsActualChart.tsx`**

```tsx
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { mauDuongTheory } from "./palette";
import { chuanBiTheory } from "./prepare";
import type { TheoryPoint } from "./types";

/**
 * cum_theory là MỐC so sánh (tiền lẽ ra có nếu mọi lệnh chạy đúng kế hoạch),
 * không phải một chuỗi ngang hàng với cum_by_trade — nên nó vẽ nét ĐỨT màu
 * trung tính, không mang màu lãi/lỗ. Xem spec 4b §4.2 cho lý do không dùng
 * cặp phân loại xanh dương/cam dù cặp đó đạt đủ sáu phép kiểm ở cả hai theme.
 */
export function TheoryVsActualChart({ rows, currency }: { rows: TheoryPoint[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = chuanBiTheory(rows);

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.theoryVsActual")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.theoryVsActual")}</h3>

      <figure aria-label={`${t("dashboard.theoryVsActual")} — ${t("dashboard.chartOf")}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
            <XAxis dataKey="stt" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
            <Tooltip
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, name, item) => {
                const d = item.payload as (typeof data)[number];
                const goc = name === "lyThuyet" ? d.lyThuyetGoc : d.thucTeGoc;
                return [
                  formatMoney(goc, currency, locale),
                  name === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"),
                ];
              }}
            />
            <Legend formatter={(v) => (v === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"))} />
            <Line
              type="monotone"
              dataKey="lyThuyet"
              stroke={mauDuongTheory("lyThuyet")}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="thucTe"
              stroke={mauDuongTheory("thucTe")}
              strokeWidth={2}
              dot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.theoryVsActual")}</caption>
        <thead>
          <tr>
            <th scope="col">STT</th>
            <th scope="col">{t("dashboard.theory")}</th>
            <th scope="col">{t("dashboard.actual")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.stt}>
              <th scope="row">{d.stt}</th>
              <td>{formatMoney(d.lyThuyetGoc, currency, locale)}</td>
              <td>{formatMoney(d.thucTeGoc, currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [x] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/charts.test.tsx
```

Expected: PASS toàn bộ.

- [x] **Step 6: Chạy tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: exit 0.

- [x] **Step 7: Commit**

```bash
git add frontend/src/features/dashboard/TheoryVsActualChart.tsx \
        frontend/src/features/dashboard/charts.test.tsx \
        frontend/src/i18n/vi.ts frontend/src/i18n/en.ts
git commit -m "feat(fe): add TheoryVsActualChart, one reference line and one real one

cum_theory renders dashed and neutral-colored, not as a co-equal series in
the profit/loss palette: it's a benchmark (what profit would be if every
trade hit its planned target), and painting it a chart color would say it's
on equal footing with what actually happened.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `DashboardPage.tsx` — xén bốn biểu đồ vào mục sẵn có

Spec §2.1. Đảo lại lời hứa "4b nối hai mục vào cuối" của 4a — có ghi lý do.

**Files:**
- Modify: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/features/dashboard/dashboardPage.test.tsx`
- Modify: `frontend/src/i18n/vi.ts`, `frontend/src/i18n/en.ts`

**Interfaces:**
- Consumes: `HeatmapChart` (Task 4), `RDistributionChart` (Task 5),
  `ScoreRadarBlock` (Task 6), `TheoryVsActualChart` (Task 7).
- Produces: không có API mới — chỉ thay bố cục.

- [x] **Step 1: Không cần chuỗi i18n mới**

Hai `<h2>` mới của Task này dùng lại khoá đã có: `"dashboard.quality"` (thêm
ở Task 6, dùng cho `role="group"` bên trong `ScoreRadarBlock`) và
`"dashboard.rDist"` (thêm ở Task 5, dùng cho `<h3>`/figure của
`RDistributionChart`). Không sửa `vi.ts`/`en.ts` ở bước này.

- [x] **Step 2: Viết test đỏ**

Trong `frontend/src/features/dashboard/dashboardPage.test.tsx`, sửa
`KHONG_CO_LENH` (thêm năm trường 4b ở dạng rỗng — không bắt buộc để test hiện
tại pass, vì `trong` gate ở trên chúng, nhưng giữ fixture khớp thực tế cho rõ
ràng):

```ts
const KHONG_CO_LENH = {
  by_setup: [],
  by_symbol: [],
  by_timeframe: [],
  by_direction: [],
  by_weekday: [],
  by_week: [],
  by_day: [],
  heatmap: [],
  r_distribution: [],
  score: { scored_count: 0, avg_score_total: null },
  radar: { avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null },
  theory_vs_actual: [],
};
```

Sửa test đã có "dựng đủ bốn mục có heading thật" thành sáu mục:

```ts
test("dựng đủ sáu mục có heading thật", async () => {
  ve();
  await waitFor(() => {
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(6);
  });
});
```

Thêm hai test mới ngay sau nó:

```ts
test("mục Chất lượng lệnh và Phân phối R có mặt", async () => {
  ve();
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 2, name: "Chất lượng lệnh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Phân phối R" })).toBeInTheDocument();
  });
});

test("Đường tăng trưởng có cả hai biểu đồ: theo ngày và lý thuyết-vs-thực tế", async () => {
  ve();
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Lãi lỗ theo ngày" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lý thuyết vs thực tế" })).toBeInTheDocument();
  });
});
```

- [x] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/dashboard/dashboardPage.test.tsx
```

Expected: FAIL — vẫn còn 4 heading, chưa có `TheoryVsActualChart` hay
`HeatmapChart`/`ScoreRadarBlock`/`RDistributionChart` trong cây component.

- [x] **Step 4: Sửa `src/features/dashboard/DashboardPage.tsx`**

Sửa khối import ở đầu file:

```ts
import { DailyPnlChart } from "./DailyPnlChart";
import { HeatmapChart } from "./HeatmapChart";
import { KpiGrid } from "./KpiGrid";
import { PivotBarChart } from "./PivotBarChart";
import { RDistributionChart } from "./RDistributionChart";
import { ScoreRadarBlock } from "./ScoreRadarBlock";
import { StreakBlock } from "./StreakBlock";
import { TheoryVsActualChart } from "./TheoryVsActualChart";
import { WeekdayChart } from "./WeekdayChart";
import { useCharts } from "./hooks";
```

Sửa mục "Đường tăng trưởng" — thêm `TheoryVsActualChart` sau
`DailyPnlChart`:

```tsx
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.growth")}</h2>
            <DailyPnlChart rows={c.by_day} currency={account.currency} />
            <TheoryVsActualChart rows={c.theory_vs_actual} currency={account.currency} />
          </section>
```

Sửa mục "Theo thời gian" — thêm `HeatmapChart` sau khối grid hai cột hiện có
(NGOÀI `grid lg:grid-cols-2`, vì lịch nhiệt là một khối rộng, không nên bị
ép vào một ô của lưới hai cột):

```tsx
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
            <HeatmapChart months={c.heatmap} currency={account.currency} />
          </section>
```

Thêm hai mục mới ngay sau mục "Theo thời gian" (trước dấu đóng `</>`):

```tsx
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.quality")}</h2>
            <ScoreRadarBlock score={c.score} radar={c.radar} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.rDist")}</h2>
            <RDistributionChart rows={c.r_distribution} />
          </section>
```

- [x] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/dashboard/dashboardPage.test.tsx
```

Expected: PASS toàn bộ.

- [x] **Step 6: Falsify — hai trạng thái rỗng vẫn khác nhau (bất biến 4a #11, kiểm lại sau khi thêm mục)**

Đây là bất biến ĐÃ có từ 4a, chỉ cần xác nhận 4b không phá nó (mọi mục mới
đều nằm trong CÙNG nhánh `{trong ? ... : (...)}` nên tự động thừa hưởng).
Chạy lại toàn bộ file test:

```bash
cd frontend && npx vitest run src/features/dashboard/dashboardPage.test.tsx
```

Kiểm bằng mắt: các test "account chưa có lệnh nào" và "lọc không ra gì" (đã
có từ 4a) vẫn PASS trong lần chạy trên — nếu có, bất biến còn nguyên, không
cần sửa gì thêm.

- [x] **Step 7: Chạy toàn bộ test frontend**

```bash
cd frontend && npx vitest run
```

Expected: PASS toàn bộ.

- [x] **Step 8: Chạy tsc và build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: cả hai exit 0. Ghi lại kích thước chunk `DashboardPage` để so với
mốc trước 4b (401.54 kB / 113.07 kB gzip, ghi trong spec §7).

- [x] **Step 9: Commit**

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
        frontend/src/features/dashboard/dashboardPage.test.tsx
git commit -m "feat(fe): splice the last four 4b charts into their themed sections

Reverses 4a spec §2.4's plan to append two sections at the end — deliberately,
per 4b design spec §2.1: theory_vs_actual reads with by_day (both answer
'is money going up'), heatmap reads with weekday/week (both are calendar
groupings). Only score+radar and the R histogram get genuinely new sections,
since nothing existing fits their shape.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: hành trình e2e và toàn bộ cổng

Spec §7. Lớp mà MSW mù: mọi con số ở đây do backend thật tính.

**Files:**
- Modify: `frontend/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `dangNhap(page)` và `moBangDieuKhien(page)` đã có sẵn trong
  `auth.spec.ts` (4a Task 12).
- Produces: không có API mới.

- [ ] **Step 1: Nối hai bước vào khối "Bảng điều khiển" đã có**

Trong `frontend/e2e/auth.spec.ts`, tìm khối comment `// ---- Bảng điều khiển
(bước 17-20) ----` do 4a thêm. Sửa "bước 18" để xác nhận đủ SÁU mục (không
phải bốn), và nối thêm hai bước mới ngay sau "bước 20" (trước dấu đóng
`});` của `test.describe.serial`):

Sửa nội dung `test("bước 18: ...")` — thêm hai khẳng định vào cuối thân test
hiện có (giữ nguyên các dòng cũ, chỉ thêm):

```ts
    await expect(page.getByRole("heading", { level: 2, name: "Chất lượng lệnh" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Phân phối R" })).toBeVisible();
```

Thêm hai test mới sau "bước 20":

```ts
  test("bước 21: lịch nhiệt vẽ ra ô thật trên trình duyệt thật", async ({ page }) => {
    await dangNhap(page);
    await moBangDieuKhien(page);

    // HeatmapChart không dùng Recharts/ResizeObserver — nó là biểu đồ DUY
    // NHẤT của trang render được cả trong jsdom LẪN trình duyệt thật theo
    // đúng một cách. Bước này xác nhận build thật không có gì chặn nó (ví dụ
    // CSS grid bị Tailwind purge nhầm).
    const oLich = page.locator('[data-trangthai="coLenh"], [data-trangthai="hoa"]').first();
    await expect(oLich).toBeVisible();
  });

  test("bước 22: điểm trung bình và radar vẽ ra trên trình duyệt thật", async ({ page }) => {
    await dangNhap(page);
    await moBangDieuKhien(page);

    await expect(page.getByRole("group", { name: "Chất lượng lệnh" })).toBeVisible();
    // Radar dùng ResponsiveContainer — chỉ vẽ ra path/polygon trên trình
    // duyệt thật, đúng lý do 4a §2.5 tách phần dễ sai vào prepare.ts và chỉ
    // smoke-test phần vỏ trong jsdom.
    const svg = page.locator('figure[aria-label*="Radar"] svg');
    await expect(svg).toBeVisible();
  });
```

- [ ] **Step 2: Chạy e2e**

```bash
make e2e
```

Nếu Docker không kéo được ảnh nền, dùng đường vòng đã ghi ở cuối plan 3b và
4a:

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

Giữa hai lần chạy: `TRUNCATE trades, cash_flows, accounts, refresh_tokens,
users RESTART IDENTITY CASCADE`.

Kỳ vọng: 22/22 xanh (20 cũ của 4a + 2 mới).

- [ ] **Step 3: Chạy toàn bộ cổng**

```bash
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
cd .. && make test
git diff main -- backend/ | head
```

Kỳ vọng:
- `tsc` exit 0
- toàn bộ test Vitest xanh
- `npm run build` xanh; so kích thước chunk `DashboardPage` với mốc trước 4b
  (401.54 kB / 113.07 kB gzip). Nếu vượt ~500 kB, cân nhắc tách
  `ScoreRadarBlock` thành `lazy()` riêng (spec §8) — KHÔNG làm trước khi đo,
  đó là tối ưu hoá mù.
- `make test` (Go) xanh
- `git diff main -- backend/` **rỗng**

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/auth.spec.ts
git commit -m "test(e2e): walk the last four dashboard charts on the real stack

The heatmap and the radar are the two places jsdom genuinely can't verify —
HeatmapChart draws real DOM (checked already in Task 4's component test) but
this step is the first confirmation the production Tailwind build doesn't
purge its CSS grid; the radar only ever draws a polygon behind a real
ResizeObserver.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Kết thúc nhánh**

**REQUIRED SUB-SKILL:** dùng `superpowers:finishing-a-development-branch`.
