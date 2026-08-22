# Phase 3b — Frontend nhật ký lệnh: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng giao diện `/trades` và `/trades/trash` trên chín endpoint mà Phase 3a đã có, không sửa một dòng backend nào.

**Architecture:** Một feature folder `src/features/trades/` theo đúng khuôn `features/accounts/` đang chạy. Hai module thuần tách hẳn ra để test không cần DOM: `lib/datetime.ts` (bọc dayjs, chỗ duy nhất được import nó) và `features/trades/filters.ts` (bộ lọc ⇄ URL). Trạng thái server do TanStack Query giữ; trạng thái lọc và số trang do URL giữ.

**Tech Stack:** Vite 8 · React 19 · TypeScript 7 · TanStack Query v5 · React Router v7 · react-hook-form + zod 3.25 · shadcn/ui trên `radix-ui` 1.6.7 · Tailwind v4 · dayjs 1.11 · Vitest 4 + Testing Library + MSW · Playwright.

**Spec:** `docs/superpowers/specs/2026-08-21-phase-3b-trade-frontend-design.md`

## Global Constraints

Mọi task đều ngầm mang theo mục này.

- **Tiền là chuỗi, không bao giờ `number`.** `stt`, `win_loss`, `win_sign`, `score_*`, `page`, `size`, `total` không phải tiền — chúng là `number`.
- **Cấm `Number(`, `parseFloat(`, `parseInt(`** trong mã dự án. Cổng `src/test/styleguard.test.ts` canh, và nó quét cả **comment** — đừng viết ba tên đó trong lời giải thích. Dùng `+v` sau khi regex đã bảo đảm, như `readActiveAccountId` đang làm.
- **Cấm hardcode màu hex.** Chỉ dùng biến ngữ nghĩa của theme.
- **Cấm `shadow-*`** trong `src/components/ui/`. Cổng này cũng quét nguyên văn cả file: viết `shadow-md` trong một comment giải thích "đã bỏ shadow-md" là đủ để đỏ. Nói "lớp đổ bóng" thay vì gọi tên nó ra.
- **Cấm chép cứng chuỗi enum tiếng Việt** vào FE — lấy từ `useMetaEnums()`. Chúng là key chấm điểm (CLAUDE.md quy tắc 5).
- **Lưu UTC, hiển thị theo `account.timezone`.** Không hardcode `+7`, không dùng giờ máy.
- **`stt` do backend cấp**, frontend không gửi.
- **Không sửa `docs/design/theme.css`** và không sửa `src/styles/theme.css`.
- **Không sửa `backend/`.** Cuối phase `git diff main -- backend/` phải rỗng.
- Mỗi task chạy test thật rồi mới đánh dấu xong. Mỗi bất biến ghi trong plan phải **falsify**: phá thật, xem test đỏ, khôi phục.
- Node ≥ 20 (`nvm use`). Lệnh test: `cd frontend && npx vitest run <đường dẫn>`; cổng đầy đủ là `make test-fe`.

## Bản đồ file

**Tạo mới**

| file | trách nhiệm |
|---|---|
| `frontend/src/lib/datetime.ts` | 4 hàm thời gian; chỗ **duy nhất** import dayjs |
| `frontend/src/features/trades/types.ts` | kiểu thuần, không mã chạy |
| `frontend/src/features/trades/filters.ts` | `TradeFilter` ⇄ `URLSearchParams` |
| `frontend/src/features/trades/hooks.ts` | 7 hook query/mutation |
| `frontend/src/features/trades/TradeTable.tsx` | bảng 11 cột + dòng chi tiết |
| `frontend/src/features/trades/StatsStrip.tsx` | 6 chỉ số KPI |
| `frontend/src/features/trades/FilterBar.tsx` | 7 ô lọc |
| `frontend/src/features/trades/TradeFormDialog.tsx` | form 16 trường |
| `frontend/src/features/trades/TradesPage.tsx` | ghép 4 mảnh trên + phân trang |
| `frontend/src/features/trades/TrashPage.tsx` | thùng rác + khôi phục |
| `frontend/src/components/ui/select.tsx` | shadcn Select |
| `frontend/src/components/ui/textarea.tsx` | shadcn Textarea |
| `frontend/src/components/ui/badge.tsx` | shadcn Badge |

**Sửa file có sẵn**

| file | sửa gì |
|---|---|
| `frontend/package.json` | thêm `dayjs` |
| `frontend/src/lib/queryKeys.ts` | thêm 5 key trades/stats/trash |
| `frontend/src/test/setup.ts` | 4 polyfill cho Radix Select |
| `frontend/src/test/styleguard.test.ts` | cổng cấm chép cứng enum |
| `frontend/src/components/AccountSwitcher.tsx` | `<select>` → `Select` |
| `frontend/src/features/accounts/CashFlowPanel.tsx` | ô loại → `Select` |
| `frontend/src/features/accounts/cashflowHooks.ts` | invalidate thêm `statsAll` |
| `frontend/src/features/accounts/AccountFormDialog.tsx` | comment giải thích ô múi giờ giữ native |
| `frontend/src/app/router.tsx` | thêm `/trades`, `/trades/trash` |
| `frontend/src/app/AppShell.tsx` | thêm NavLink "Nhật ký lệnh" |
| `frontend/e2e/auth.spec.ts` | nối 7 bước hành trình lệnh |

---

### Task 1: `lib/datetime.ts` — bọc dayjs

Spec §3. Đây là task đầu vì mọi thứ hiển thị thời gian đều đứng trên nó.

**Files:**
- Modify: `frontend/package.json` (thêm dependency `dayjs`)
- Create: `frontend/src/lib/datetime.ts`
- Test: `frontend/src/lib/datetime.test.ts`

**Interfaces:**
- Consumes: không có (task đầu tiên).
- Produces:
  ```ts
  export function nowInZone(tz: string): string;        // "YYYY-MM-DDTHH:mm"
  export function wallToInstant(wall: string, tz: string): string;  // ISO có Z
  export function formatInstant(iso: string, tz: string): string;   // "DD/MM/YYYY HH:mm"
  export function instantToWall(iso: string, tz: string): string;   // "YYYY-MM-DDTHH:mm"
  ```

- [ ] **Step 1: Cài dayjs**

```bash
cd frontend && npm install dayjs
```

Phải ra `dayjs` trong `dependencies` (không phải `devDependencies`) — nó chạy trong bundle production.

- [ ] **Step 2: Viết test đỏ**

Tạo `frontend/src/lib/datetime.test.ts`:

```ts
import { formatInstant, instantToWall, nowInZone, wallToInstant } from "./datetime";

// Sáu ca dưới đây chép thẳng từ spec §3.3. Chúng ĐÃ ĐƯỢC ĐO trên dayjs
// 1.11.23 chứ không phải suy ra, và ba trong sáu ca sẽ sai nếu code lỡ dùng
// giờ máy thay vì timezone truyền vào.
describe("wallToInstant", () => {
  test.each([
    ["2026-06-09T21:30", "Asia/Ho_Chi_Minh", "2026-06-09T14:30:00.000Z"],
    ["2026-01-15T08:00", "America/New_York", "2026-01-15T13:00:00.000Z"],
    ["2026-07-15T08:00", "America/New_York", "2026-07-15T12:00:00.000Z"],
    ["2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-06-09T21:30", "Australia/Adelaide", "2026-06-09T12:00:00.000Z"],
  ])("%s ở %s ra %s", (wall, tz, mongDoi) => {
    expect(wallToInstant(wall, tz)).toBe(mongDoi);
  });

  // GHIM MỘT QUYẾT ĐỊNH, không phải ghim một sự thật hiển nhiên.
  //
  // 02:30 ngày 2026-03-08 ở New York KHÔNG TỒN TẠI: đồng hồ nhảy thẳng 02:00
  // sang 03:00. Mọi thư viện phải tự chọn dịch tới hay dịch lùi. dayjs dịch
  // TỚI (07:30Z = 03:30 EDT), theo đúng quy ước "compatible" của Temporal và
  // java.time. Một bản tự viết bằng Intl sẽ ra 06:30Z (01:30 EST) — cũng hợp
  // lệ, chỉ là quy ước khác. Test này để ngày nào đổi thư viện thì biết ngay
  // mình vừa đổi luôn cả quy ước.
  test("giờ không tồn tại thì dịch TỚI, không dịch lùi", () => {
    expect(wallToInstant("2026-03-08T02:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
});

describe("formatInstant", () => {
  // Cùng MỘT instant, ba timezone, ba kết quả khác nhau — kể cả khác NGÀY.
  // Đây là bằng chứng hiển thị bám theo account chứ không bám máy chạy test.
  test.each([
    ["Asia/Ho_Chi_Minh", "09/06/2026 21:30"],
    ["America/New_York", "09/06/2026 10:30"],
    ["Australia/Adelaide", "10/06/2026 00:00"],
  ])("%s hiện %s", (tz, mongDoi) => {
    expect(formatInstant("2026-06-09T14:30:00Z", tz)).toBe(mongDoi);
  });
});

test("instantToWall nạp lại được vào input datetime-local", () => {
  expect(instantToWall("2026-06-09T14:30:00Z", "Asia/Ho_Chi_Minh")).toBe("2026-06-09T21:30");
});

// Vòng đi-về là phép kiểm rẻ nhất bắt được lỗi lệch dấu offset: dịch nhầm
// chiều thì đi rồi về sẽ lệch đúng hai lần offset.
test("đi rồi về không lệch", () => {
  const tz = "America/New_York";
  expect(instantToWall(wallToInstant("2026-07-15T08:00", tz), tz)).toBe("2026-07-15T08:00");
});

test("nowInZone lấy 'bây giờ' theo tz account", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-09T14:30:00Z"));
  try {
    expect(nowInZone("Asia/Ho_Chi_Minh")).toBe("2026-06-09T21:30");
    expect(nowInZone("America/New_York")).toBe("2026-06-09T10:30");
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/lib/datetime.test.ts
```

Kỳ vọng: đỏ với `Failed to resolve import "./datetime"`.

- [ ] **Step 4: Viết `src/lib/datetime.ts`**

```ts
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Chỗ DUY NHẤT trong dự án được import dayjs.
 *
 * Bọc một tầng vì hai lẽ độc lập:
 *
 *  1. Mọi hàm ở đây BẮT BUỘC nhận `tz`. Quên là lỗi biên dịch, chứ không phải
 *     âm thầm rơi về giờ của máy đang chạy — mà giờ máy thì khác nhau giữa
 *     laptop, CI và container, nên lỗi kiểu đó không tái hiện được.
 *  2. `Temporal` chưa có trong Node 22 (đã kiểm: `typeof globalThis.Temporal`
 *     ra `undefined`). Ngày nào nó phổ cập thì chỉ phải thay ruột file này.
 */

// `T` không phải token của dayjs, nhưng để trần thì nó là ký tự tự do và
// hành vi phụ thuộc phiên bản. `[T]` là cú pháp thoát, nói rõ "in ra chữ T".
const WALL = "YYYY-MM-DD[T]HH:mm";
const HIEN_THI = "DD/MM/YYYY HH:mm";

/** "YYYY-MM-DDTHH:mm" theo `tz` — giá trị mặc định cho input[type=datetime-local]. */
export function nowInZone(tz: string): string {
  return dayjs().tz(tz).format(WALL);
}

/**
 * Giờ treo tường trong `tz` thành instant ISO để gửi lên backend.
 *
 * Trả về hậu tố `Z`, vẫn là ISO-8601 có offset hợp lệ. Không cần dựng chuỗi
 * "+07:00" bằng tay: backend lưu UTC, nên instant mới là thứ mang nghĩa.
 */
export function wallToInstant(wall: string, tz: string): string {
  return dayjs.tz(wall, tz).toISOString();
}

/** Instant từ API thành "DD/MM/YYYY HH:mm" theo `tz`. */
export function formatInstant(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format(HIEN_THI);
}

/** Instant từ API thành "YYYY-MM-DDTHH:mm" theo `tz`, để nạp lại vào form sửa. */
export function instantToWall(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format(WALL);
}
```

- [ ] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/lib/datetime.test.ts && npx tsc --noEmit
```

Kỳ vọng: 12 test xanh, `tsc` exit 0.

`tsc` quan trọng ở đây: dayjs là CJS dùng `export =`, mà `tsconfig.json` bật `verbatimModuleSyntax` và **không** bật `esModuleInterop`. `moduleResolution: "bundler"` xử lý được (đã kiểm trước khi viết plan), nhưng nếu ai đó đổi `moduleResolution` thì bước này là chỗ phát hiện.

- [ ] **Step 6: Falsify bất biến 2 — đổi giờ theo tz account**

Trong `wallToInstant`, đổi:

```ts
return dayjs.tz(wall, tz).toISOString();
```

thành:

```ts
return dayjs(wall).toISOString();
```

Chạy lại. Kỳ vọng: **đỏ** ở bốn ca New York / Adelaide — chúng ra instant tính theo giờ máy. Khôi phục.

- [ ] **Step 7: Falsify bất biến 3 — hiển thị theo tz account**

Trong `formatInstant`, đổi `dayjs(iso).tz(tz)` thành `dayjs(iso)`. Chạy lại.

Kỳ vọng: **đỏ** ở ít nhất hai trong ba ca `formatInstant`. Khôi phục.

Nếu máy chạy test đang ở `Asia/Ho_Chi_Minh` thì ca đầu vẫn xanh — đó chính là lý do test này có ba timezone chứ không phải một.

- [ ] **Step 8: Falsify bất biến 4 — quy ước giờ không tồn tại**

Trong test, đổi kỳ vọng `"2026-03-08T07:30:00.000Z"` thành `"2026-03-08T06:30:00.000Z"` (bản dịch lùi kiểu Intl). Chạy lại.

Kỳ vọng: **đỏ**. Khôi phục.

- [ ] **Step 9: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/src/lib/datetime.ts frontend/src/lib/datetime.test.ts
git commit -m "feat(fe): wrap dayjs behind a timezone-explicit datetime module

Bốn hàm đều bắt buộc nhận tz, nên không có đường nào rơi về giờ máy.
Ghim luôn quy ước ở giờ không tồn tại: dayjs dịch tới, khác bản Intl."
```

---

### Task 2: `types.ts` và `filters.ts` — hai module thuần

Spec §5 và §6.

**Files:**
- Create: `frontend/src/features/trades/types.ts`
- Create: `frontend/src/features/trades/filters.ts`
- Test: `frontend/src/features/trades/filters.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  ```ts
  // types.ts — chỉ kiểu, không mã chạy
  export type Trade = { /* 40 trường, xem Step 1 */ };
  export type DeletedTrade = { /* 10 trường */ };
  export type TradePage = { items: Trade[]; page: number; size: number; total: number };
  export type TradeCreate = { /* 16 trường */ };
  export type TradePatch = Partial<TradeCreate>;
  export type Stats = { /* 24 trường */ };

  // filters.ts
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

- [ ] **Step 1: Viết `src/features/trades/types.ts`**

Không có test riêng cho file này — nó không có mã chạy. `npx tsc --noEmit` ở Step 6 là phép kiểm của nó.

```ts
// Mọi trường TIỀN là chuỗi. Backend marshal decimal.Decimal ra chuỗi JSON
// chính vì float làm mất chữ số (0.29 * 100 ra 28.999999999999996); khai
// `number` ở đây là ném đi điều đó ngay tại ranh giới.
//
// Các trường KHÔNG phải tiền — stt, win_loss, win_sign, score_*, page, size,
// total — là number bình thường.

export type Trade = {
  id: number;
  account_id: number;
  stt: number;
  entered_at: string; // ISO UTC

  symbol: string;
  direction: string;
  entry: string | null;
  exit: string | null;
  volume: string | null;
  profit: string;
  profit_theory: string | null;
  fee: string;

  setup: string;
  timeframe: string;
  entry_quality: string;
  in_trade_quality: string;
  exit_quality: string;
  psychology: string;
  notes: string;

  net: string;
  win_loss: number;
  win_sign: number;

  score_entry: number;
  score_in_trade: number;
  score_exit: number;
  score_psych: number;
  score_total: number | null; // null = chưa đánh giá, KHÔNG phải 0 điểm
  trade_class: string;

  day: string;
  week: string;
  week_sort: string;
  month: string;
  weekday: string;

  cum_by_trade: string;
  cum_by_day: string;
  cum_theory: string;
  running_peak: string;
  drawdown: string;
};

// Lệnh trong thùng rác — CHỈ trường input.
//
// Không có trường suy diễn, và đó là chủ ý của backend: lệnh đã xoá không nằm
// trong dãy lũy kế, nên cum_by_trade hay drawdown của nó không có nghĩa gì.
// Số 0 ở đó sẽ trông như một con số thật.
export type DeletedTrade = {
  id: number;
  account_id: number;
  stt: number;
  entered_at: string;
  symbol: string;
  direction: string;
  profit: string;
  fee: string;
  setup: string;
  notes: string;
};

export type TradePage = {
  items: Trade[];
  page: number;
  size: number;
  total: number;
};

// 16 trường của form. Không có `account_code` (suy ra từ account đang chọn)
// và không có `stt` (backend cấp — CLAUDE.md quy tắc 7).
export type TradeCreate = {
  entered_at: string;
  symbol: string;
  direction: string;
  entry: string | null;
  exit: string | null;
  volume: string | null;
  profit: string;
  profit_theory: string | null;
  fee: string;
  setup: string;
  timeframe: string;
  entry_quality: string;
  in_trade_quality: string;
  exit_quality: string;
  psychology: string;
  notes: string;
};

// Ánh xạ 1-1 vào service.Tri[T] của backend, và không phải tình cờ:
//
//   khoá vắng (hoặc undefined, bị JSON.stringify bỏ) -> Set=false, không đổi
//   entry: null                                      -> Set=true Value=nil, xoá
//   entry: "2048.5"                                  -> Set=true Value=&v, đặt
//
// Năm trường BẮT BUỘC được kiểu canh giúp: TradeCreate khai `symbol: string`
// chứ không `string | null`, nên gán `symbol: null` là lỗi biên dịch. Backend
// trả 400 cho trường hợp đó, và ở đây nó không đi tới được lúc chạy.
export type TradePatch = Partial<TradeCreate>;

// Ánh xạ 1-1 từ statsDTO. Các trường `| null` là con trỏ bên Go: KHÔNG tính
// được, chứ không phải bằng 0. Chưa có lệnh thua thì profit_factor là null;
// hiển thị 0 sẽ đọc ra là "thua sạch", ngược hẳn sự thật.
export type Stats = {
  total_win: string;
  total_loss: string;
  net_profit: string;
  total_fees: string;

  net_return_pct: string | null;
  profit_factor: string | null;

  win_count: number;
  loss_count: number;
  total_trades: number;
  win_pct: string | null;

  ave_win: string | null;
  ave_loss: string | null;

  biggest_winner: string | null;
  biggest_loser: string | null;

  one_r: string;
  biggest_r_win: string | null;
  biggest_r_loss: string | null;
  rr_actual: string | null;

  expectancy: string | null;

  max_drawdown: string;
  max_dd_pct: string | null;
  recovery_factor: string | null;

  current_balance: string;
};
```

- [ ] **Step 2: Viết test đỏ cho `filters.ts`**

Tạo `frontend/src/features/trades/filters.test.ts`:

```ts
import { EMPTY_FILTER, readFilter, readPage, toQuery, writeParams } from "./filters";

test("đọc đủ bảy ô lọc từ URL", () => {
  const sp = new URLSearchParams(
    "from=2026-06-01&to=2026-06-30&setup=Break&symbol=XAUUSD" +
      "&timeframe=H1&direction=Long&trade_class=" + encodeURIComponent("Đúng kế hoạch"),
  );
  expect(readFilter(sp)).toEqual({
    from: "2026-06-01",
    to: "2026-06-30",
    setup: "Break",
    symbol: "XAUUSD",
    timeframe: "H1",
    direction: "Long",
    trade_class: "Đúng kế hoạch",
  });
});

test("URL trống ra bộ lọc rỗng, không ra undefined", () => {
  expect(readFilter(new URLSearchParams(""))).toEqual(EMPTY_FILTER);
});

// URL là thứ người dùng NHÌN THẤY và gửi đi. Nhồi bảy tham số rỗng vào đó
// biến một trang chưa lọc gì thành một chuỗi rác dài ngoằng.
test("writeParams bỏ hẳn ô rỗng và bỏ page khi bằng 1", () => {
  expect(writeParams({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 1).toString()).toBe("symbol=XAUUSD");
});

test("writeParams giữ page khi khác 1", () => {
  const s = writeParams({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 3).toString();
  expect(s).toContain("symbol=XAUUSD");
  expect(s).toContain("page=3");
});

test("đi rồi về không lệch", () => {
  const f = { ...EMPTY_FILTER, from: "2026-06-01", direction: "Short", setup: "Break-retest" };
  expect(readFilter(writeParams(f, 2))).toEqual(f);
  expect(readPage(writeParams(f, 2))).toBe(2);
});

// Một query string gõ nhầm không được làm gãy cả trang. Backend cũng chọn
// đúng lối này: `soNguyen` trong trade_handler.go cho 0 khi Atoi hỏng.
test.each(["", "abc", "-1", "0", "1.5", "2e3"])("page rác %o về 1", (v) => {
  expect(readPage(new URLSearchParams(`page=${v}`))).toBe(1);
});

test("page hợp lệ được giữ", () => {
  expect(readPage(new URLSearchParams("page=7"))).toBe(7);
});

// toQuery là thứ ĐI TỚI API, khác writeParams là thứ đi lên URL. Nó không
// gửi `size`: 50 đã là DefaultPageSize của backend, gửi lại chỉ tạo hai
// nguồn sự thật cho cùng một con số.
test("toQuery không gửi size", () => {
  expect(toQuery({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 2)).toBe("?symbol=XAUUSD&page=2");
});

test("toQuery rỗng ra chuỗi rỗng, không ra dấu hỏi trơ trọi", () => {
  expect(toQuery(EMPTY_FILTER, 1)).toBe("");
});
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/filters.test.ts
```

Kỳ vọng: đỏ với `Failed to resolve import "./filters"`.

- [ ] **Step 4: Viết `src/features/trades/filters.ts`**

```ts
// Bộ lọc sống trên URL chứ không trong state của component: F5 không mất,
// gửi link được, nút Back trả về bộ lọc trước.
//
// Tên bảy trường trùng ĐÚNG tên backend nhận (filterFromQuery trong
// trade_handler.go), nên không có tầng ánh xạ nào ở giữa để lệch.

export type TradeFilter = {
  from: string;
  to: string;
  setup: string;
  symbol: string;
  timeframe: string;
  direction: string;
  trade_class: string;
};

export const EMPTY_FILTER: TradeFilter = {
  from: "",
  to: "",
  setup: "",
  symbol: "",
  timeframe: "",
  direction: "",
  trade_class: "",
};

// Một chỗ duy nhất liệt kê bảy khoá, để thêm ô lọc thứ tám không phải sửa
// bốn hàm.
const KHOA = Object.keys(EMPTY_FILTER) as (keyof TradeFilter)[];

export function readFilter(sp: URLSearchParams): TradeFilter {
  const f = { ...EMPTY_FILTER };
  for (const k of KHOA) f[k] = sp.get(k) ?? "";
  return f;
}

/**
 * Số trang từ URL. Chỉ nhận chuỗi toàn chữ số dương; mọi thứ khác về 1.
 *
 * Các hàm ép kiểu sẵn của JS hỏng ở đây theo kiểu im lặng: "1.5" thành 1,
 * "abc" thành NaN, "2e3" thành 2000 — đều là số trang sai mà không báo gì.
 * Cổng canh trong src/test/styleguard.test.ts cấm chúng, nên chỗ này dùng
 * +v sau khi regex đã bảo đảm, giống readActiveAccountId.
 */
export function readPage(sp: URLSearchParams): number {
  const v = sp.get("page");
  return v !== null && /^[1-9]\d*$/.test(v) ? +v : 1;
}

/** Bộ lọc thành tham số cho URL. Bỏ ô rỗng, bỏ page = 1. */
export function writeParams(f: TradeFilter, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of KHOA) {
    const v = f[k].trim();
    if (v !== "") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  return sp;
}

/**
 * Bộ lọc thành query string cho API — có dấu `?` sẵn, hoặc rỗng.
 *
 * KHÔNG gửi `size`: nó cố định 50, đúng bằng DefaultPageSize của backend.
 */
export function toQuery(f: TradeFilter, page: number): string {
  const s = writeParams(f, page).toString();
  return s === "" ? "" : `?${s}`;
}
```

- [ ] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/filters.test.ts
```

Kỳ vọng: 14 test xanh.

- [ ] **Step 6: Kiểm kiểu**

```bash
cd frontend && npx tsc --noEmit
```

Kỳ vọng: exit 0. Đây là phép kiểm duy nhất của `types.ts`.

- [ ] **Step 7: Falsify — `readPage` không được nhận rác**

Đổi `/^[1-9]\d*$/.test(v) ? +v : 1` thành `v !== null ? +v : 1`.

Chạy lại. Kỳ vọng: **đỏ** ở ca `"abc"` (ra `NaN`), `"1.5"` (ra 1.5), `"-1"`, `"0"`, `"2e3"`. Khôi phục.

- [ ] **Step 8: Falsify — `writeParams` phải bỏ ô rỗng**

Đổi `if (v !== "") sp.set(k, v);` thành `sp.set(k, v);`.

Chạy lại. Kỳ vọng: **đỏ** ở test `writeParams bỏ hẳn ô rỗng` — nhận được chuỗi bảy tham số, sáu trong đó rỗng. Khôi phục.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/trades/types.ts \
        frontend/src/features/trades/filters.ts \
        frontend/src/features/trades/filters.test.ts
git commit -m "feat(fe): add trade types and URL-backed filter module

Bảy tên trường trùng đúng tên backend nhận, nên không có tầng ánh xạ nào
ở giữa để lệch. Số trang chỉ nhận chuỗi toàn chữ số."
```

---

### Task 3: query key, hook, và bất biến invalidate

Spec §10. Đây là **bất biến số 1** và là chỗ sai im lặng nguy hiểm nhất của cả phase.

**Files:**
- Modify: `frontend/src/lib/queryKeys.ts`
- Create: `frontend/src/test/tradeFactory.ts`
- Create: `frontend/src/features/trades/hooks.ts`
- Test: `frontend/src/features/trades/hooks.test.tsx`

**Interfaces:**
- Consumes: `TradeFilter`, `EMPTY_FILTER`, `toQuery` (Task 2); `Trade`, `TradePage`, `TradeCreate`, `TradePatch`, `DeletedTrade`, `Stats` (Task 2).
- Produces:
  ```ts
  // queryKeys.ts — thêm vào object qk đã có
  qk.trades(accountId: number, f: TradeFilter, page: number)
  qk.tradesAll(accountId: number)
  qk.stats(accountId: number, f: TradeFilter)
  qk.statsAll(accountId: number)
  qk.trash(accountId: number)

  // test/tradeFactory.ts
  export function taoLenh(over?: Partial<Trade>): Trade;
  export function taoStats(over?: Partial<Stats>): Stats;

  // features/trades/hooks.ts
  export function useTrades(accountId: number, f: TradeFilter, page: number);
  export function useStats(accountId: number, f: TradeFilter);
  export function useTrash(accountId: number);
  export function useCreateTrade(accountId: number);   // mutate(v: TradeCreate)
  export function useUpdateTrade(accountId: number);   // mutate({ id, patch })
  export function useDeleteTrade(accountId: number);   // mutate(id: number)
  export function useRestoreTrade(accountId: number);  // mutate(id: number)
  ```

- [ ] **Step 1: Mở rộng `src/lib/queryKeys.ts`**

Thay trọn nội dung file:

```ts
import type { TradeFilter } from "@/features/trades/filters";

// Query key tập trung một chỗ, để không ai tự chế key lệch nhau rồi
// invalidate hụt.
//
// Key của một trang lệnh nằm DƯỚI `tradesAll` về mặt tiền tố:
//
//   tradesAll(1) = ["accounts", 1, "trades"]
//   trades(1, f, 2) = ["accounts", 1, "trades", { ...f, page: 2 }]
//
// TanStack Query khớp theo tiền tố, nên invalidate `tradesAll` là quét sạch
// MỌI tổ hợp bộ lọc và MỌI trang đang nằm trong cache. Đó chính là thứ quy
// tắc 8 của CLAUDE.md đòi hỏi — xem hooks.ts.
export const qk = {
  accounts: ["accounts"] as const,
  cashFlows: (accountId: number) => ["accounts", accountId, "cash-flows"] as const,
  metaEnums: ["meta", "enums"] as const,

  trades: (accountId: number, f: TradeFilter, page: number) =>
    ["accounts", accountId, "trades", { ...f, page }] as const,
  tradesAll: (accountId: number) => ["accounts", accountId, "trades"] as const,

  stats: (accountId: number, f: TradeFilter) => ["accounts", accountId, "stats", f] as const,
  statsAll: (accountId: number) => ["accounts", accountId, "stats"] as const,

  trash: (accountId: number) => ["accounts", accountId, "trash"] as const,
};
```

- [ ] **Step 2: Viết `src/test/tradeFactory.ts`**

Xưởng dựng dữ liệu mẫu cho mọi test từ Task 3 tới Task 12. Đặt dưới `src/test/` là **có chủ ý**: nó chứa chuỗi enum tiếng Việt, mà cổng styleguard ở Task 6 cấm chuỗi đó trong `src/features`, `src/components`, `src/app`, `src/lib` — `src/test/` được miễn vì test buộc phải nói được ngôn ngữ của dữ liệu thật.

```ts
import type { Stats, Trade } from "@/features/trades/types";

/**
 * Một lệnh mẫu đủ 40 trường. Truyền `over` để đè trường nào cần.
 *
 * Các trường suy diễn ở đây là số ĐÃ TÍNH SẴN, không phải số đúng theo công
 * thức — test của frontend kiểm việc hiển thị, còn tính toán đã có Phase 1
 * và 3a lo. Test nào cần lũy kế đúng thì tự đặt cho khớp kịch bản của nó.
 */
export function taoLenh(over: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    account_id: 1,
    stt: 1,
    entered_at: "2026-06-09T14:30:00Z",

    symbol: "XAUUSD",
    direction: "Long",
    entry: "2048.50",
    exit: "2060.55",
    volume: "1.00",
    profit: "120.50",
    profit_theory: "150.00",
    fee: "2.00",

    setup: "Break-retest",
    timeframe: "H1",
    entry_quality: "Đúng kế hoạch",
    in_trade_quality: "Tuân thủ kế hoạch",
    exit_quality: "Chạm Chốt lời",
    psychology: "Không lỗi",
    notes: "chờ retest H1",

    net: "118.50",
    win_loss: 1,
    win_sign: 1,

    score_entry: 30,
    score_in_trade: 25,
    score_exit: 20,
    score_psych: 10,
    score_total: 85,
    trade_class: "Đúng kế hoạch",

    day: "2026-06-09",
    week: "Tuần 24",
    week_sort: "2026-W24",
    month: "2026-06",
    weekday: "Tue",

    cum_by_trade: "118.50",
    cum_by_day: "118.50",
    cum_theory: "150.00",
    running_peak: "118.50",
    drawdown: "0",
    ...over,
  };
}

/** KPI mẫu đủ 24 trường. Mặc định là một tập có lệnh, không phải tập rỗng. */
export function taoStats(over: Partial<Stats> = {}): Stats {
  return {
    total_win: "300",
    total_loss: "-100",
    net_profit: "200",
    total_fees: "5",

    net_return_pct: "2",
    profit_factor: "3",

    win_count: 2,
    loss_count: 1,
    total_trades: 3,
    win_pct: "66.67",

    ave_win: "150",
    ave_loss: "-100",

    biggest_winner: "200",
    biggest_loser: "-100",

    one_r: "100",
    biggest_r_win: "2",
    biggest_r_loss: "-1",
    rr_actual: "1.5",

    expectancy: "66.67",

    max_drawdown: "100",
    max_dd_pct: "1",
    recovery_factor: "2",

    current_balance: "10200",
    ...over,
  };
}
```

- [ ] **Step 3: Viết test đỏ**

Tạo `frontend/src/features/trades/hooks.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoLenh, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER } from "./filters";
import { useStats, useTrades, useTrash, useUpdateTrade } from "./hooks";

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

test("bộ lọc đi vào query string của request", async () => {
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi({ items: [], page: 2, size: 50, total: 0 });
    }),
  );

  const { result } = renderHook(
    () => useTrades(1, { ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" }, 2),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(duongDan).toBe("?symbol=XAUUSD&direction=Long&page=2");
});

test("stats không gửi page — nó tính trên cả tập đã lọc", async () => {
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/stats`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi(taoStats());
    }),
  );

  const { result } = renderHook(() => useStats(1, { ...EMPTY_FILTER, symbol: "XAUUSD" }), {
    wrapper: boc(khachHang()),
  });

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(duongDan).toBe("?symbol=XAUUSD");
});

// ĐÂY LÀ BẤT BIẾN SỐ 1.
//
// Quy tắc 8 của CLAUDE.md: lũy kế tính trên TOÀN BỘ dãy lệnh theo thứ tự stt.
// Sửa lệnh 1 làm cum_by_trade của lệnh 2 đổi theo. Nếu FE chỉ vá dòng vừa sửa
// vào cache thì dòng 2 giữ số cũ — không có lỗi nào bật ra, chỉ có một con số
// sai trông rất bình thường.
//
// Mock ở đây CÓ TRẠNG THÁI và tự tính lại lũy kế, đúng như backend thật. Mock
// tĩnh sẽ làm test này xanh kể cả khi FE vá một dòng.
test("sửa một lệnh làm lũy kế của lệnh sau nó cập nhật theo", async () => {
  const kho = [
    taoLenh({ id: 1, stt: 1, profit: "100", net: "100", cum_by_trade: "100" }),
    taoLenh({ id: 2, stt: 2, profit: "50", net: "50", cum_by_trade: "150" }),
  ];

  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      phongBi({ items: [...kho], page: 1, size: 50, total: kho.length }),
    ),
    http.patch(`${BASE}/trades/1`, async ({ request }) => {
      const p = (await request.json()) as { profit?: string };
      const moi = p.profit ?? kho[0].profit;
      kho[0] = { ...kho[0], profit: moi, net: moi, cum_by_trade: moi };
      kho[1] = { ...kho[1], cum_by_trade: "250" };
      return phongBi(kho[0]);
    }),
  );

  const qc = khachHang();
  const { result } = renderHook(
    () => ({ ds: useTrades(1, EMPTY_FILTER, 1), sua: useUpdateTrade(1) }),
    { wrapper: boc(qc) },
  );

  await waitFor(() => expect(result.current.ds.data).toBeTruthy());
  expect(result.current.ds.data!.items[1].cum_by_trade).toBe("150");

  await act(async () => {
    await result.current.sua.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => {
    expect(result.current.ds.data!.items[1].cum_by_trade).toBe("250");
  });
});

// Ba nhánh, không phải một. Thùng rác cũng đổi: xoá và khôi phục đi qua cùng
// một mutation, và stats đổi vì net_profit tính trên tập đã lọc.
test("một lần sửa làm mới cả ba nhánh trades, stats, trash", async () => {
  const dem = { trades: 0, stats: 0, trash: 0 };
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () => {
      dem.trades++;
      return phongBi({ items: [taoLenh()], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => {
      dem.stats++;
      return phongBi(taoStats());
    }),
    http.get(`${BASE}/accounts/1/trades/trash`, () => {
      dem.trash++;
      return phongBi([]);
    }),
    http.patch(`${BASE}/trades/1`, () => phongBi(taoLenh())),
  );

  const { result } = renderHook(
    () => ({
      ds: useTrades(1, EMPTY_FILTER, 1),
      kpi: useStats(1, EMPTY_FILTER),
      rac: useTrash(1),
      sua: useUpdateTrade(1),
    }),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => {
    expect(dem).toEqual({ trades: 1, stats: 1, trash: 1 });
  });

  await act(async () => {
    await result.current.sua.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => {
    expect(dem).toEqual({ trades: 2, stats: 2, trash: 2 });
  });
});
```

- [ ] **Step 4: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/hooks.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./hooks"`.

- [ ] **Step 5: Viết `src/features/trades/hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { toQuery, type TradeFilter } from "./filters";
import type { DeletedTrade, Stats, Trade, TradeCreate, TradePage, TradePatch } from "./types";

export function useTrades(accountId: number, f: TradeFilter, page: number) {
  return useQuery({
    queryKey: qk.trades(accountId, f, page),
    queryFn: () => api.get<TradePage>(`/accounts/${accountId}/trades${toQuery(f, page)}`),
  });
}

export function useStats(accountId: number, f: TradeFilter) {
  return useQuery({
    queryKey: qk.stats(accountId, f),
    // page 1 để toQuery bỏ hẳn tham số page: /stats tính trên TOÀN BỘ tập đã
    // lọc, không phân trang. Gửi page lên sẽ là nói dối về ý định.
    queryFn: () => api.get<Stats>(`/accounts/${accountId}/stats${toQuery(f, 1)}`),
  });
}

export function useTrash(accountId: number) {
  return useQuery({
    queryKey: qk.trash(accountId),
    queryFn: () => api.get<DeletedTrade[]>(`/accounts/${accountId}/trades/trash`),
  });
}

/**
 * Làm mới sau MỌI thay đổi lệnh — cả ba nhánh, không chừa nhánh nào.
 *
 * Quy tắc 8 của CLAUDE.md: cum_by_trade, cum_by_day, cum_theory, running_peak
 * và drawdown tính trên TOÀN BỘ dãy lệnh của account theo thứ tự stt. Sửa một
 * lệnh cũ làm mọi lệnh SAU nó đổi số. Vá riêng dòng vừa sửa vào cache bằng
 * setQueryData sẽ để những dòng khác mang số cũ, và không có lỗi nào bật ra —
 * chỉ có những con số sai trông rất bình thường.
 *
 * `tradesAll` là tiền tố nên nó quét sạch mọi tổ hợp bộ lọc và mọi trang đang
 * nằm trong cache, không chỉ trang đang xem.
 */
function useLamMoi(accountId: number) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.tradesAll(accountId) }),
      qc.invalidateQueries({ queryKey: qk.statsAll(accountId) }),
      qc.invalidateQueries({ queryKey: qk.trash(accountId) }),
    ]);
}

export function useCreateTrade(accountId: number) {
  const lamMoi = useLamMoi(accountId);
  return useMutation({
    mutationFn: (v: TradeCreate) => api.post<Trade>(`/accounts/${accountId}/trades`, v),
    onSuccess: lamMoi,
  });
}

// Ba đường dưới đây KHÔNG lồng dưới account: backend là /api/trades/{id} và
// tự kiểm quyền sở hữu. Vẫn cần accountId để biết phải làm mới nhánh nào.
export function useUpdateTrade(accountId: number) {
  const lamMoi = useLamMoi(accountId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TradePatch }) =>
      api.patch<Trade>(`/trades/${id}`, patch),
    onSuccess: lamMoi,
  });
}

export function useDeleteTrade(accountId: number) {
  const lamMoi = useLamMoi(accountId);
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`/trades/${id}`),
    onSuccess: lamMoi,
  });
}

export function useRestoreTrade(accountId: number) {
  const lamMoi = useLamMoi(accountId);
  return useMutation({
    mutationFn: (id: number) => api.post<Trade>(`/trades/${id}/restore`),
    onSuccess: lamMoi,
  });
}
```

- [ ] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/hooks.test.tsx && npx tsc --noEmit
```

Kỳ vọng: 4 test xanh, `tsc` exit 0.

- [ ] **Step 7: Falsify bất biến 1 — invalidate cả nhánh, không vá một dòng**

Trong `useUpdateTrade`, thay `onSuccess: lamMoi` bằng lối vá một dòng:

```ts
export function useUpdateTrade(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TradePatch }) =>
      api.patch<Trade>(`/trades/${id}`, patch),
    onSuccess: (moi) => {
      qc.setQueriesData<TradePage>({ queryKey: qk.tradesAll(accountId) }, (cu) =>
        cu === undefined
          ? cu
          : { ...cu, items: cu.items.map((t) => (t.id === moi.id ? moi : t)) },
      );
    },
  });
}
```

Chạy lại. Kỳ vọng: **đỏ hai chỗ** —
- `sửa một lệnh làm lũy kế của lệnh sau nó cập nhật theo`: dòng 2 vẫn là `"150"`, không lên `"250"`.
- `một lần sửa làm mới cả ba nhánh`: `dem` đứng ở `{ trades: 1, stats: 1, trash: 1 }`.

Đây là bằng chứng bằng số rằng vá-một-dòng cho ra dữ liệu sai mà không ném lỗi. Khôi phục.

- [ ] **Step 8: Falsify — bỏ sót một nhánh cũng phải đỏ**

Trong `useLamMoi`, xoá dòng invalidate `statsAll`. Chạy lại.

Kỳ vọng: **đỏ** ở `một lần sửa làm mới cả ba nhánh` với `stats: 1` thay vì `2`. Khôi phục.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/queryKeys.ts frontend/src/test/tradeFactory.ts \
        frontend/src/features/trades/hooks.ts \
        frontend/src/features/trades/hooks.test.tsx
git commit -m "feat(fe): add trade queries that invalidate the whole branch

Lũy kế tính trên toàn dãy, nên sửa một lệnh làm mọi lệnh sau nó đổi số.
Vá một dòng vào cache là sai im lặng — test chứng minh bằng con số."
```

---

### Task 4: ba component shadcn còn thiếu + 4 polyfill

Spec §11. Không có Select thì Task 9 và 10 không dựng được.

**Files:**
- Create: `frontend/src/components/ui/select.tsx`
- Create: `frontend/src/components/ui/textarea.tsx`
- Create: `frontend/src/components/ui/badge.tsx`
- Modify: `frontend/src/test/setup.ts`
- Test: `frontend/src/components/ui/select.test.tsx`

**Interfaces:**
- Consumes: `cn` từ `@/lib/utils` (đã có).
- Produces:
  ```ts
  export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
  export { Textarea };
  export { Badge, badgeVariants };
  ```

- [ ] **Step 1: Thêm 4 polyfill vào `src/test/setup.ts`**

Chèn **trước** khối `beforeAll` đang có:

```ts
// Radix Select dùng Pointer Events API và scrollIntoView, jsdom không có cả
// hai. Thiếu bốn dòng này thì trigger VẪN mở được nhưng danh sách option
// không bao giờ xuất hiện, và test đỏ với "Unable to find role=option" — một
// thông báo chẳng liên quan gì tới nguyên nhân thật.
//
// Đúng bốn dòng, đã kiểm: ResizeObserver cũng thiếu trong jsdom nhưng Radix
// Select không cần tới nó.
const PROTO = window.HTMLElement.prototype as unknown as Record<string, unknown>;
PROTO.hasPointerCapture = () => false;
PROTO.setPointerCapture = () => {};
PROTO.releasePointerCapture = () => {};
PROTO.scrollIntoView = () => {};
```

- [ ] **Step 2: Viết test đỏ**

Tạo `frontend/src/components/ui/select.test.tsx`:

```tsx
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function Thu() {
  const [v, setV] = useState("");
  return (
    <>
      {/* label[for] trỏ tới SelectTrigger — trigger là <button>, mà button là
          thẻ gắn nhãn được, nên getByLabelText tìm ra. Đã kiểm. */}
      <label htmlFor="o-chieu">Chiều lệnh</label>
      <Select value={v} onValueChange={setV}>
        <SelectTrigger id="o-chieu">
          <SelectValue placeholder="Chọn" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Long">Long</SelectItem>
          <SelectItem value="Short">Short</SelectItem>
        </SelectContent>
      </Select>
      <output data-testid="da-chon">{v}</output>
    </>
  );
}

test("Select mở ra, chọn được, và trả giá trị", async () => {
  const u = userEvent.setup();
  render(<Thu />);

  await u.click(screen.getByLabelText("Chiều lệnh"));
  await u.click(await screen.findByRole("option", { name: "Short" }));

  expect(screen.getByTestId("da-chon")).toHaveTextContent("Short");
});
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/components/ui/select.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./select"`.

- [ ] **Step 4: Viết `src/components/ui/select.tsx`**

```tsx
import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Bản rút gọn của shadcn new-york: chỉ giữ năm mảnh dự án dùng tới, bỏ
// SelectGroup / SelectLabel / SelectSeparator.
//
// Bỏ luôn `shadow-md` mà bản gốc đặt trên SelectContent — theme của dự án
// tắt hết shadow và phân tầng bằng border, cổng styleguard sẽ bắt nếu để lại.

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none",
        "data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "dark:bg-input/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
```

- [ ] **Step 5: Viết `src/components/ui/textarea.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base transition-[color,box-shadow] outline-none md:text-sm",
        "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 6: Viết `src/components/ui/badge.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 7: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/components/ui/select.test.tsx src/test/styleguard.test.ts && npx tsc --noEmit
```

Kỳ vọng: tất cả xanh. Styleguard chạy kèm ở đây để chắc ba file mới không lọt `shadow-*` hay màu hex.

- [ ] **Step 8: Falsify bất biến 11 — bốn polyfill**

Trong `src/test/setup.ts`, xoá dòng `PROTO.hasPointerCapture = () => false;`.

```bash
cd frontend && npx vitest run src/components/ui/select.test.tsx
```

Kỳ vọng: **đỏ** với `Unable to find role="option"`. Khôi phục rồi chạy lại cho xanh.

- [ ] **Step 9: Falsify — cổng shadow thật sự canh file mới**

Thêm `shadow-md` vào chuỗi class của `SelectContent`.

```bash
cd frontend && npx vitest run src/test/styleguard.test.ts
```

Kỳ vọng: **đỏ** với `select.tsx còn dùng shadow-*`. Khôi phục.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ui/select.tsx frontend/src/components/ui/textarea.tsx \
        frontend/src/components/ui/badge.tsx frontend/src/components/ui/select.test.tsx \
        frontend/src/test/setup.ts
git commit -m "feat(fe): add select, textarea and badge primitives

Kèm bốn polyfill jsdom cho Radix Select — thiếu chúng thì option không
bao giờ xuất hiện và test đỏ vì một lý do chẳng liên quan."
```

---

### Task 5: đổi hai `<select>` thô sang `Select`

Spec §11. Chạm vào mã Phase 2b đang chạy tốt, nên bước falsify ở đây là bằng chứng không làm hỏng gì.

**Files:**
- Modify: `frontend/src/components/AccountSwitcher.tsx`
- Modify: `frontend/src/features/accounts/CashFlowPanel.tsx:130-145`
- Modify: `frontend/src/features/accounts/cashflowHooks.ts`
- Modify: `frontend/src/features/accounts/AccountFormDialog.tsx:159-172` (chỉ thêm comment)
- Modify: `frontend/src/features/accounts/cashflow.test.tsx:116`

**Interfaces:**
- Consumes: `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` (Task 4); `qk.statsAll` (Task 3).
- Produces: không có API mới.

- [ ] **Step 1: Đổi `AccountSwitcher.tsx`**

Thay trọn nội dung file:

```tsx
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveAccount } from "@/features/accounts/activeAccount";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <Label htmlFor="account-switcher" className="text-xs">
        Tài khoản đang xem
      </Label>
      {/* Giá trị của Radix Select là CHUỖI, còn id account là số. Đổi qua lại
          ở đúng ranh giới này, và dùng +v vì chuỗi đó là id chính mình vừa
          phát ra ở dòng value bên dưới, không phải dữ liệu lạ. */}
      <Select value={account ? String(account.id) : ""} onValueChange={(v) => choose(+v)}>
        <SelectTrigger id="account-switcher" className="w-full">
          <SelectValue placeholder="Chọn tài khoản" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Đổi ô loại trong `CashFlowPanel.tsx`**

Thêm import ở đầu file:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Thay khối `<div>` chứa `<select id="cf-loai">` bằng:

```tsx
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-loai">Loại</Label>
          <Select value={loai} onValueChange={setLoai}>
            <SelectTrigger id="cf-loai" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {loaiHopLe.map((t) => (
                <SelectItem key={t} value={t}>
                  {nhan(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

- [ ] **Step 3: Sửa test của cash flow**

Trước khi sửa, đọc hàm `nhan()` trong `CashFlowPanel.tsx` để biết nhãn hiển thị của `"withdraw"` là chuỗi nào; dùng đúng chuỗi đó ở dòng dưới thay cho `"Rút"` nếu khác.

Trong `frontend/src/features/accounts/cashflow.test.tsx`, đổi dòng:

```ts
  await userEvent.selectOptions(screen.getByLabelText("Loại"), "withdraw");
```

thành:

```ts
  // Radix Select không phải <select> thật, nên selectOptions không dùng được:
  // mở trigger rồi bấm vào option, đúng như người dùng làm.
  await userEvent.click(screen.getByLabelText("Loại"));
  await userEvent.click(await screen.findByRole("option", { name: "Rút" }));
```

- [ ] **Step 4: Thêm comment ngoại lệ vào `AccountFormDialog.tsx`**

Ngay trên thẻ `<select id="timezone">`, thêm:

```tsx
            {/* NGOẠI LỆ CÓ CHỦ Ý: ô này giữ <select> native trong khi hai ô
                chọn khác của dự án đã đổi sang Select của shadcn.
                Intl.supportedValuesOf("timeZone") trả về 417 mục; Radix Select
                dựng cả 417 node vào DOM mỗi lần mở, còn <select> native thì
                trình duyệt lo. Đừng "dọn nốt" chỗ này. */}
```

- [ ] **Step 5: `cashflowHooks.ts` làm mới luôn stats**

Spec §10. Sửa `onSuccess` của **cả hai** mutation `useCreateCashFlow` và `useDeleteCashFlow` thành:

```ts
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.cashFlows(accountId) }),
        // current_balance của KPI cộng cả nạp/rút, nên một lần nạp tiền sẽ
        // làm dải KPI ở trang /trades sai cho tới lần tải lại trang.
        qc.invalidateQueries({ queryKey: qk.statsAll(accountId) }),
      ]),
```

- [ ] **Step 6: Chạy toàn bộ test frontend**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Kỳ vọng: tất cả xanh. Nếu `shell.test.tsx` hoặc `accounts.test.tsx` đỏ vì `AccountSwitcher` đổi hình dạng thì sửa test cho khớp lối `click trigger → click option`, **không** quay lại `<select>` native.

- [ ] **Step 7: Falsify — test cash flow thật sự đi qua Select mới**

Trong `CashFlowPanel.tsx`, đổi `<SelectItem key={t} value={t}>` thành `<SelectItem key={t} value="deposit">`.

```bash
cd frontend && npx vitest run src/features/accounts/cashflow.test.tsx
```

Kỳ vọng: **đỏ** — `daGui` mang `type: "deposit"` thay vì `"withdraw"`. Khôi phục.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/AccountSwitcher.tsx \
        frontend/src/features/accounts/CashFlowPanel.tsx \
        frontend/src/features/accounts/cashflowHooks.ts \
        frontend/src/features/accounts/AccountFormDialog.tsx \
        frontend/src/features/accounts/cashflow.test.tsx
git commit -m "refactor(fe): move the two small dropdowns to shadcn Select

Ô múi giờ giữ native và có comment nói rõ vì sao: Intl trả 417 mục.
Cash flow giờ làm mới luôn stats — current_balance cộng cả nạp/rút."
```

---

### Task 6: cổng styleguard cấm chép cứng chuỗi enum

Spec §11, bất biến 9. Làm trước Task 10 để form không kịp mọc chuỗi chép cứng.

**Files:**
- Modify: `frontend/src/test/styleguard.test.ts`

**Interfaces:**
- Consumes: `tuRepo` từ `./paths` (đã có, và nó được viết ra chính cho việc đọc file ngoài `frontend/`).
- Produces: không có API mới.

- [ ] **Step 1: Thêm cổng vào cuối `src/test/styleguard.test.ts`**

Đổi dòng import đầu file để lấy thêm `tuRepo`:

```ts
import { tuFrontend, tuRepo } from "./paths";
```

Rồi thêm vào cuối file:

```ts
// Quy tắc 5 của CLAUDE.md ở phía frontend. Các chuỗi enum tiếng Việt là KEY
// CHẤM ĐIỂM, không phải nhãn hiển thị. Chép cứng chúng vào FE tạo ra một bản
// sao thứ hai sẽ trôi lệch trong im lặng: đổi một ký tự bên Go là đổi kết quả
// chấm điểm của toàn bộ lịch sử, còn bản chép bên này vẫn hiện text cũ như
// không có gì xảy ra.
//
// Đọc thẳng từ nguồn thay vì chép danh sách vào đây — chép vào đây thì chính
// cổng canh cũng là một bản sao sẽ trôi lệch.
const enumsGo = readFileSync(tuRepo("backend/internal/domain/enums.go"), "utf8");

// Chỉ lấy chuỗi CÓ ký tự ngoài ASCII.
//
// Giới hạn này là cố ý, và nói thẳng ra: "Long", "Short", "M15", "deposit"
// thuần ASCII nên KHÔNG vào danh sách cấm — cấm chúng sẽ đụng false positive
// với comment và mã thường ở khắp nơi. Chúng vẫn phải lấy từ /meta/enums,
// nhưng chỗ đó do người review canh, không có máy canh.
const enumCoDau = [...enumsGo.matchAll(/"([^"]*)"/g)]
  .map((m) => m[1])
  .filter((s) => /[^\x00-\x7F]/.test(s));

// src/test/ được miễn: test buộc phải nói được ngôn ngữ của dữ liệu thật, và
// src/test/tradeFactory.ts tồn tại chính để giữ những chuỗi đó ở MỘT chỗ.
const fileNgoaiTest = fileCuaMinh.filter((f) => !f.includes(`${sep}test${sep}`));

test("không chép cứng chuỗi enum của backend vào frontend", () => {
  // Regex hỏng hoặc file đổi chỗ sẽ cho danh sách rỗng, và vòng lặp rỗng thì
  // pass vĩnh viễn mà không ai biết.
  expect(enumCoDau.length).toBeGreaterThan(10);
  expect(fileNgoaiTest.length).toBeGreaterThan(0);

  for (const f of fileNgoaiTest) {
    const noiDung = readFileSync(f, "utf8");
    for (const s of enumCoDau) {
      expect(
        noiDung,
        `${f} chép cứng chuỗi enum ${JSON.stringify(s)}; lấy từ useMetaEnums()`,
      ).not.toContain(s);
    }
  }
});
```

- [ ] **Step 2: Chạy — phải xanh trên code hiện tại**

```bash
cd frontend && npx vitest run src/test/styleguard.test.ts
```

Kỳ vọng: xanh. Nếu đỏ, đọc kỹ tên file bị tố: hoặc là có chỗ đang chép cứng thật (sửa nó), hoặc một chuỗi enum trùng với một nhãn giao diện hợp lệ — lúc đó mới bàn tới việc thu hẹp danh sách, và phải ghi lý do vào comment.

- [ ] **Step 3: Falsify — cổng phải bắt được**

Thêm tạm vào `src/features/trades/filters.ts` một dòng:

```ts
const THU = "Đúng kế hoạch";
```

Chạy lại. Kỳ vọng: **đỏ** với `filters.ts chép cứng chuỗi enum "Đúng kế hoạch"`. Xoá dòng đó.

- [ ] **Step 4: Falsify — phần miễn trừ đúng vì lý do đúng, không vì may**

`src/test/tradeFactory.ts` (Task 3) đã chứa `"Đúng kế hoạch"`, mà Step 2 vẫn xanh — nghĩa là phần miễn trừ đang hoạt động.

Để chắc: xoá tạm `.filter((f) => !f.includes(...))` để `fileNgoaiTest = fileCuaMinh`. Chạy lại — kỳ vọng **đỏ**, tố đúng `tradeFactory.ts`. Khôi phục.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/test/styleguard.test.ts
git commit -m "test(fe): forbid hardcoding backend enum strings in the UI

Đọc thẳng enums.go làm nguồn, không chép danh sách. Giới hạn đã ghi rõ:
chuỗi thuần ASCII như Long/Short không canh được bằng máy."
```

---

### Task 7: `TradeTable` — 11 cột và dòng chi tiết

Spec §7. Bất biến 7 (`score_total` null) và 8 (màu theo `compareDecimal`).

**Files:**
- Create: `frontend/src/features/trades/TradeTable.tsx`
- Test: `frontend/src/features/trades/tradeTable.test.tsx`

**Interfaces:**
- Consumes: `Trade` (Task 2); `formatInstant` (Task 1); `taoLenh` (Task 3); `Badge` (Task 4); `formatMoney`, `compareDecimal` từ `@/lib/decimal` (đã có).
- Produces:
  ```ts
  export function TradeTable(props: {
    rows: Trade[];
    timezone: string;
    currency: string;
    onSua: (t: Trade) => void;
    onXoa: (t: Trade) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/trades/tradeTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { taoLenh } from "@/test/tradeFactory";
import type { Trade } from "./types";
import { TradeTable } from "./TradeTable";

const TZ = "Asia/Ho_Chi_Minh";

function dung(rows: Trade[] = [taoLenh()], tz = TZ) {
  return render(
    <TradeTable rows={rows} timezone={tz} currency="USD" onSua={() => {}} onXoa={() => {}} />,
  );
}

test("bày trường suy diễn do backend tính", () => {
  dung([taoLenh({ stt: 3, net: "118.50", cum_by_trade: "298.50", score_total: 85 })]);
  const d = screen.getByRole("row", { name: /XAUUSD/ });
  expect(within(d).getByText("3")).toBeInTheDocument();
  expect(within(d).getByText("+118,5")).toBeInTheDocument();
  expect(within(d).getByText("298,5")).toBeInTheDocument();
  expect(within(d).getByText("85")).toBeInTheDocument();
});

// null nghĩa là CHƯA ĐÁNH GIÁ, không phải ĐƯỢC 0 ĐIỂM. Hai chuyện khác hẳn
// nhau, và số 0 ở đây đọc ra là "vào lệnh sai hết mọi mặt".
test("chưa đánh giá thì hiện gạch ngang, không hiện 0", () => {
  dung([taoLenh({ score_total: null, trade_class: "CHƯA ĐÁNH GIÁ" })]);
  const d = screen.getByRole("row", { name: /XAUUSD/ });
  expect(within(d).getByText("—")).toBeInTheDocument();
  expect(within(d).queryByText("0")).not.toBeInTheDocument();
});

test("lãi, lỗ và hoà khác nhau cả dấu lẫn màu", () => {
  dung([
    taoLenh({ id: 1, stt: 1, symbol: "LAILON", net: "118.50" }),
    taoLenh({ id: 2, stt: 2, symbol: "LOVON", net: "-45.00" }),
    taoLenh({ id: 3, stt: 3, symbol: "HOAVON", net: "0.00" }),
  ]);

  const lai = within(screen.getByRole("row", { name: /LAILON/ }));
  expect(lai.getByText("+118,5")).toHaveClass("text-primary");

  const lo = within(screen.getByRole("row", { name: /LOVON/ }));
  expect(lo.getByText("-45")).toHaveClass("text-destructive");

  // "0.00" phải đọc ra là HOÀ. Một phép so sánh chuỗi ngây thơ kiểu
  // `net !== "0"` xếp nó vào nhóm lãi và gắn thêm dấu cộng.
  const hoa = within(screen.getByRole("row", { name: /HOAVON/ }));
  expect(hoa.getByText("0")).toHaveClass("text-muted-foreground");
  expect(hoa.queryByText("+0")).not.toBeInTheDocument();
});

test("thời điểm bám timezone của account, không bám giờ máy", () => {
  const { unmount } = dung([taoLenh({ entered_at: "2026-06-09T14:30:00Z" })], "Asia/Ho_Chi_Minh");
  expect(screen.getByText("09/06/2026 21:30")).toBeInTheDocument();
  unmount();

  dung([taoLenh({ entered_at: "2026-06-09T14:30:00Z" })], "America/New_York");
  expect(screen.getByText("09/06/2026 10:30")).toBeInTheDocument();
});

// Bung dòng KHÔNG gọi request nào: GET /trades đã trả đủ 40 trường. Test này
// chạy không có MSW handler nào, mà setup.ts đang bật onUnhandledRequest
// "error" — một request lọt ra là đỏ ngay.
test("bung dòng mới thấy chi tiết, và không gọi thêm request nào", async () => {
  const u = userEvent.setup();
  dung([taoLenh({ stt: 3, notes: "chờ retest H1", entry: "2048.50" })]);

  expect(screen.queryByText(/chờ retest H1/)).not.toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 3" }));
  expect(screen.getByText(/chờ retest H1/)).toBeInTheDocument();
  expect(screen.getByText("2.048,5")).toBeInTheDocument();
});

test("nút Sửa và Xoá gọi đúng lệnh", async () => {
  const u = userEvent.setup();
  const daSua: number[] = [];
  const daXoa: number[] = [];
  render(
    <TradeTable
      rows={[taoLenh({ id: 7, stt: 3 })]}
      timezone={TZ}
      currency="USD"
      onSua={(t) => daSua.push(t.id)}
      onXoa={(t) => daXoa.push(t.id)}
    />,
  );

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 3" }));
  await u.click(screen.getByRole("button", { name: "Sửa lệnh 3" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 3" }));

  expect(daSua).toEqual([7]);
  expect(daXoa).toEqual([7]);
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/tradeTable.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./TradeTable"`.

- [ ] **Step 3: Viết `src/features/trades/TradeTable.tsx`**

```tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInstant } from "@/lib/datetime";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import type { Trade } from "./types";

const KHONG_CO = "—";
const SO_COT = 11;

/**
 * Dấu và màu theo dấu của một số tiền.
 *
 * So bằng compareDecimal chứ không ép sang số: tiền tới đây dưới dạng chuỗi
 * chính vì float làm mất chữ số, và một phép so sánh chuỗi ngây thơ kiểu
 * `v !== "0"` xếp nhầm "0.00" vào nhóm lãi.
 *
 * Dấu +/− đi kèm màu chứ không để màu làm tín hiệu duy nhất — spec mẹ §8.2.
 */
function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" }; // dấu trừ đã nằm trong số
  return { dau: "", lop: "text-muted-foreground" };
}

/**
 * Một con số tiền có dấu và màu, gộp thành MỘT text node.
 *
 * Tách dấu ra khỏi số thành hai node sẽ làm getByText("+118,5") không khớp
 * được — cùng lý do đã ghi trong AccountsPage.
 */
function Tien({ value, currency }: { value: string; currency?: string }) {
  const { dau, lop } = dauVaMau(value);
  return <span className={`num ${lop}`}>{`${dau}${formatMoney(value, currency)}`}</span>;
}

/** Số tiền trung tính, không mang nghĩa lãi/lỗ (phí, giá vào, lũy kế…). */
function So({ value }: { value: string | null }) {
  return <span className="num">{value === null ? KHONG_CO : formatMoney(value)}</span>;
}

export function TradeTable({
  rows,
  timezone,
  currency,
  onSua,
  onXoa,
}: {
  rows: Trade[];
  timezone: string;
  currency: string;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
}) {
  // Nhiều dòng cùng bung được: so sánh hai lệnh là việc thường xuyên.
  const [dangMo, setDangMo] = useState<ReadonlySet<number>>(new Set());

  function doiTrangThai(id: number) {
    setDangMo((cu) => {
      const moi = new Set(cu);
      if (!moi.delete(id)) moi.add(id);
      return moi;
    });
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>STT</TableHead>
            <TableHead>Thời điểm</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead>Lãi/lỗ</TableHead>
            <TableHead>Phí</TableHead>
            <TableHead>Net</TableHead>
            <TableHead>Lũy kế</TableHead>
            <TableHead>Điểm</TableHead>
            <TableHead>Phân loại</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const mo = dangMo.has(t.id);
            return [
              <TableRow key={t.id}>
                <TableCell className="num">{t.stt}</TableCell>
                <TableCell>{formatInstant(t.entered_at, timezone)}</TableCell>
                <TableCell className="font-medium">{t.symbol}</TableCell>
                <TableCell>{t.direction}</TableCell>
                <TableCell>
                  <Tien value={t.profit} />
                </TableCell>
                <TableCell>
                  <So value={t.fee} />
                </TableCell>
                <TableCell>
                  <Tien value={t.net} currency={currency} />
                </TableCell>
                <TableCell>
                  <So value={t.cum_by_trade} />
                </TableCell>
                <TableCell className="num">
                  {t.score_total === null ? KHONG_CO : t.score_total}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.trade_class}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={mo}
                    aria-label={`Xem chi tiết lệnh ${t.stt}`}
                    onClick={() => doiTrangThai(t.id)}
                  >
                    {mo ? "Thu" : "Chi tiết"}
                  </Button>
                </TableCell>
              </TableRow>,

              mo ? (
                <TableRow key={`${t.id}-ct`}>
                  <TableCell colSpan={SO_COT}>
                    <ChiTiet t={t} onSua={onSua} onXoa={onXoa} />
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Phần còn lại của 40 trường.
 *
 * Không gọi request nào: GET /trades đã trả đủ, nên chi tiết là chuyện thuần
 * client. Các trường tuần/tháng/thứ có mặt ở đây chứ không lên cột chính —
 * chúng chỉ mang nghĩa khi gom nhóm, việc của Phase 4.
 */
function ChiTiet({
  t,
  onSua,
  onXoa,
}: {
  t: Trade;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Giá vào" gt={<So value={t.entry} />} />
        <Muc nhan="Giá ra" gt={<So value={t.exit} />} />
        <Muc nhan="Khối lượng" gt={<So value={t.volume} />} />
        <Muc nhan="Lãi lý thuyết" gt={<So value={t.profit_theory} />} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Setup" gt={t.setup} />
        <Muc nhan="Khung thời gian" gt={t.timeframe || KHONG_CO} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Vào lệnh" gt={`${t.entry_quality || KHONG_CO} (${t.score_entry})`} />
        <Muc nhan="Trong lệnh" gt={`${t.in_trade_quality || KHONG_CO} (${t.score_in_trade})`} />
        <Muc nhan="Thoát lệnh" gt={`${t.exit_quality || KHONG_CO} (${t.score_exit})`} />
        <Muc nhan="Tâm lý" gt={`${t.psychology || KHONG_CO} (${t.score_psych})`} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Ngày" gt={t.day} />
        <Muc nhan="Tuần" gt={t.week} />
        <Muc nhan="Tháng" gt={t.month} />
        <Muc nhan="Thứ" gt={t.weekday} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Lũy kế theo ngày" gt={<So value={t.cum_by_day} />} />
        <Muc nhan="Lũy kế lý thuyết" gt={<So value={t.cum_theory} />} />
        <Muc nhan="Đỉnh" gt={<So value={t.running_peak} />} />
        <Muc nhan="Sụt giảm" gt={<So value={t.drawdown} />} />
      </div>

      {t.notes !== "" && <p className="text-muted-foreground">Ghi chú: {t.notes}</p>}

      <div className="flex gap-2">
        {/* Nhãn có kèm STT: một trang 50 dòng thì 50 nút "Sửa" trùng tên nhau
            khi test truy theo role. */}
        <Button variant="outline" size="sm" aria-label={`Sửa lệnh ${t.stt}`} onClick={() => onSua(t)}>
          Sửa
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Xoá lệnh ${t.stt}`}
          onClick={() => onXoa(t)}
        >
          Xoá
        </Button>
      </div>
    </div>
  );
}

function Muc({ nhan, gt }: { nhan: string; gt: React.ReactNode }) {
  return (
    <span className="flex gap-1">
      <span className="text-muted-foreground">{nhan}:</span>
      {gt}
    </span>
  );
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/tradeTable.test.tsx && npx tsc --noEmit
```

Kỳ vọng: 6 test xanh, `tsc` exit 0.

Nếu `tsc` phàn nàn thiếu `React` cho `React.ReactNode` thì thêm `import type { ReactNode } from "react";` và đổi kiểu thành `ReactNode` — `verbatimModuleSyntax` đang bật nên phải là `import type`.

- [ ] **Step 5: Falsify bất biến 7 — `score_total` null**

Đổi `{t.score_total === null ? KHONG_CO : t.score_total}` thành `{t.score_total ?? 0}`.

Chạy lại. Kỳ vọng: **đỏ** ở `chưa đánh giá thì hiện gạch ngang` — không tìm thấy `—`, và tìm thấy `0`. Khôi phục.

- [ ] **Step 6: Falsify bất biến 8 — so sánh tiền**

Thay thân `dauVaMau` bằng phép so sánh chuỗi ngây thơ:

```ts
function dauVaMau(v: string): { dau: string; lop: string } {
  if (v.startsWith("-")) return { dau: "", lop: "text-destructive" };
  if (v === "0") return { dau: "", lop: "text-muted-foreground" };
  return { dau: "+", lop: "text-primary" };
}
```

Chạy lại. Kỳ vọng: **đỏ** ở `lãi, lỗ và hoà khác nhau cả dấu lẫn màu` — `"0.00"` bị xếp vào nhóm lãi, hiện `+0` và mang class `text-primary`. Khôi phục.

- [ ] **Step 7: Falsify bất biến 3 — hiển thị theo tz account**

Trong `TradeTable`, đổi `formatInstant(t.entered_at, timezone)` thành `formatInstant(t.entered_at, "Asia/Ho_Chi_Minh")`.

Chạy lại. Kỳ vọng: **đỏ** ở `thời điểm bám timezone của account` — nửa sau của test tìm `09/06/2026 10:30` mà nhận `21:30`. Khôi phục.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/trades/TradeTable.tsx \
        frontend/src/features/trades/tradeTable.test.tsx
git commit -m "feat(fe): render the trade table with expandable detail rows

Bung dòng không gọi request nào — GET /trades đã trả đủ 40 trường.
score_total null ra gạch ngang, và 0.00 đọc ra là hoà chứ không phải lãi."
```

---

### Task 8: `StatsStrip` — sáu chỉ số

Spec §2.4 và §5. Chỗ dễ sai: `null` không được thành `0`.

**Files:**
- Modify: `frontend/src/styles/bridge.css`
- Create: `frontend/src/features/trades/StatsStrip.tsx`
- Test: `frontend/src/features/trades/statsStrip.test.tsx`

**Interfaces:**
- Consumes: `Stats` (Task 2); `taoStats` (Task 3); `Card`, `CardContent` (đã có); `compareDecimal`, `formatMoney` (đã có).
- Produces:
  ```ts
  export function StatsStrip(props: { stats: Stats; currency: string }): JSX.Element;
  ```

- [ ] **Step 1: Thêm ba token màu vào `src/styles/bridge.css`**

`theme.css` là bất khả xâm phạm, nhưng `bridge.css` là của dự án. Thêm vào trong khối `@theme inline`, ngay dưới dòng `--color-destructive-foreground`:

```css
  /* Ngưỡng §8.2 của spec mẹ cần ba màu trạng thái mà bridge chưa nối:
     profit_factor < 1 đỏ, 1–1.5 vàng, 1.5–2 xanh lá, > 2 xanh dương. */
  --color-success: var(--status-success);
  --color-warning: var(--status-warning);
  --color-info: var(--status-info);
```

- [ ] **Step 2: Viết test đỏ**

Tạo `frontend/src/features/trades/statsStrip.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { taoStats } from "@/test/tradeFactory";
import { StatsStrip } from "./StatsStrip";

function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("bày sáu chỉ số của tập đang lọc", () => {
  render(
    <StatsStrip
      stats={taoStats({
        total_trades: 3,
        net_profit: "200",
        win_pct: "66.67",
        profit_factor: "3",
        max_drawdown: "100",
        current_balance: "10200",
      })}
      currency="USD"
    />,
  );

  expect(o("Số lệnh").getByText("3")).toBeInTheDocument();
  expect(o("Net").getByText("+200 USD")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("66,67%")).toBeInTheDocument();
  expect(o("Hệ số lợi nhuận").getByText("3")).toBeInTheDocument();
  expect(o("Sụt giảm lớn nhất").getByText("100")).toBeInTheDocument();
  expect(o("Số dư").getByText("10.200 USD")).toBeInTheDocument();
});

// null nghĩa là KHÔNG TÍNH ĐƯỢC. Chưa có lệnh thua thì profit_factor là null;
// hiện 0 sẽ đọc ra là "thua sạch", ngược hẳn sự thật.
test("chỉ số không tính được hiện gạch ngang, không hiện 0", () => {
  render(
    <StatsStrip stats={taoStats({ profit_factor: null, win_pct: null })} currency="USD" />,
  );
  expect(o("Hệ số lợi nhuận").getByText("—")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("—")).toBeInTheDocument();
  expect(o("Hệ số lợi nhuận").queryByText("0")).not.toBeInTheDocument();
});

test("ngưỡng hệ số lợi nhuận đổi màu theo §8.2", () => {
  const mau = (pf: string) => {
    const { unmount } = render(<StatsStrip stats={taoStats({ profit_factor: pf })} currency="USD" />);
    const lop = o("Hệ số lợi nhuận").getByText(pf.replace(".", ",")).className;
    unmount();
    return lop;
  };

  expect(mau("0.8")).toContain("text-destructive");
  expect(mau("1.2")).toContain("text-warning");
  expect(mau("1.8")).toContain("text-success");
  expect(mau("2.5")).toContain("text-info");
});

// Tập rỗng là trạng thái hợp lệ, không phải lỗi: account mới chưa có lệnh nào.
test("tập rỗng vẫn dựng được, không nổ", () => {
  render(
    <StatsStrip
      stats={taoStats({
        total_trades: 0,
        net_profit: "0",
        win_pct: null,
        profit_factor: null,
        max_drawdown: "0",
      })}
      currency="USD"
    />,
  );
  expect(o("Số lệnh").getByText("0")).toBeInTheDocument();
});
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/statsStrip.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./StatsStrip"`.

- [ ] **Step 4: Viết `src/features/trades/StatsStrip.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import type { Stats } from "./types";

const KHONG_TINH_DUOC = "—";

/**
 * Ngưỡng §8.2 của spec mẹ, so bằng compareDecimal chứ không ép sang số.
 *
 * Bậc đóng dưới: >= 2 xanh dương, >= 1.5 xanh lá, >= 1 vàng, còn lại đỏ.
 */
function mauProfitFactor(pf: string): string {
  if (compareDecimal(pf, "2") > 0) return "text-info";
  if (compareDecimal(pf, "1.5") >= 0) return "text-success";
  if (compareDecimal(pf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" };
  return { dau: "", lop: "text-muted-foreground" };
}

export function StatsStrip({ stats, currency }: { stats: Stats; currency: string }) {
  const net = dauVaMau(stats.net_profit);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <O nhan="Số lệnh">
        <span className="num">{stats.total_trades}</span>
      </O>

      <O nhan="Net">
        <span className={`num ${net.lop}`}>
          {`${net.dau}${formatMoney(stats.net_profit, currency)}`}
        </span>
      </O>

      <O nhan="Tỷ lệ thắng">
        <span className="num">
          {stats.win_pct === null ? KHONG_TINH_DUOC : `${formatMoney(stats.win_pct)}%`}
        </span>
      </O>

      <O nhan="Hệ số lợi nhuận">
        <span
          className={`num ${stats.profit_factor === null ? "" : mauProfitFactor(stats.profit_factor)}`}
        >
          {stats.profit_factor === null ? KHONG_TINH_DUOC : formatMoney(stats.profit_factor)}
        </span>
      </O>

      <O nhan="Sụt giảm lớn nhất">
        <span className="num">{formatMoney(stats.max_drawdown)}</span>
      </O>

      <O nhan="Số dư">
        <span className="num">{formatMoney(stats.current_balance, currency)}</span>
      </O>
    </div>
  );
}

/**
 * Một ô KPI. `role="group"` kèm `aria-label` để mỗi ô tự giới thiệu tên mình
 * cho trình đọc màn hình — và để test truy được từng ô mà không cần testid.
 */
function O({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <Card role="group" aria-label={nhan}>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-xs text-muted-foreground">{nhan}</span>
        {children}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/statsStrip.test.tsx && npx tsc --noEmit
```

Kỳ vọng: 4 test xanh.

Nếu `Card` không nhận `role`/`aria-label` vì kiểu props hẹp, bọc nó bằng một `<div role="group" aria-label={nhan}>` bên ngoài thay vì sửa `card.tsx`.

Nếu con số hiển thị lệch định dạng (ví dụ `10.200` ra `10200`), đọc lại `formatMoney` trong `src/lib/decimal.ts` — nó dùng locale `vi-VN` — và sửa **kỳ vọng trong test** cho khớp thứ người dùng thật sự thấy, không sửa `formatMoney`.

- [ ] **Step 6: Falsify — `null` không được thành 0**

Đổi `stats.profit_factor === null ? KHONG_TINH_DUOC : …` thành `formatMoney(stats.profit_factor ?? "0")`.

Chạy lại. Kỳ vọng: **đỏ** ở `chỉ số không tính được hiện gạch ngang`. Khôi phục.

- [ ] **Step 7: Falsify — ngưỡng màu**

Trong `mauProfitFactor`, đổi `compareDecimal(pf, "1.5") >= 0` thành `compareDecimal(pf, "1.5") > 0`.

Chạy lại. Kỳ vọng: **xanh** — không ca nào rơi đúng vào `1.5`. Thêm một dòng vào test:

```ts
  expect(mau("1.5")).toContain("text-success");
```

Chạy lại: giờ **đỏ**. Khôi phục code, giữ dòng test mới.

Bước này có ích chính vì nó cho thấy bộ test cũ **chưa** canh được mép ngưỡng.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/bridge.css \
        frontend/src/features/trades/StatsStrip.tsx \
        frontend/src/features/trades/statsStrip.test.tsx
git commit -m "feat(fe): add the six-metric KPI strip

null là KHÔNG TÍNH ĐƯỢC chứ không phải 0 — chưa có lệnh thua thì hiện 0
sẽ đọc ra là thua sạch. Ba token màu trạng thái nối trong bridge.css."
```

---

### Task 9: `FilterBar` — bảy ô lọc

Spec §6.

**Files:**
- Create: `frontend/src/features/trades/FilterBar.tsx`
- Test: `frontend/src/features/trades/filterBar.test.tsx`

**Interfaces:**
- Consumes: `TradeFilter`, `EMPTY_FILTER` (Task 2); `useMetaEnums` từ `@/features/meta/hooks` (đã có); `Select…` (Task 4).
- Produces:
  ```ts
  export function FilterBar(props: {
    value: TradeFilter;
    onChange: (f: TradeFilter) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/trades/filterBar.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER, type TradeFilter } from "./filters";
import { FilterBar } from "./FilterBar";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

// Danh sách enum ĐI TỪ BACKEND, không phải hằng số trong FE.
const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1", "H4"],
  entry_qualities: ["Đúng kế hoạch", "Quá sớm"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(http.get(`${BASE}/meta/enums`, () => phongBi(enums)));
});

function dung(value: TradeFilter = EMPTY_FILTER) {
  const daDoi: TradeFilter[] = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FilterBar value={value} onChange={(f) => daDoi.push(f)} />
    </QueryClientProvider>,
  );
  return daDoi;
}

test("gõ mã sản phẩm thì báo lên bộ lọc mới", async () => {
  const u = userEvent.setup();
  const daDoi = dung();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "X");

  expect(daDoi.at(-1)).toEqual({ ...EMPTY_FILTER, symbol: "X" });
});

// Chuỗi trong dropdown phải ĐẾN TỪ /meta/enums. Chép cứng chúng vào FE là
// tạo bản sao thứ hai của key chấm điểm — cổng styleguard ở Task 6 canh việc
// đó, còn test này canh rằng dropdown thật sự đọc dữ liệu tải về.
test("dropdown phân loại lấy danh sách từ backend", async () => {
  const u = userEvent.setup();
  const daDoi = dung();

  await u.click(await screen.findByLabelText("Phân loại"));
  await u.click(await screen.findByRole("option", { name: "Cần cải thiện" }));

  expect(daDoi.at(-1)).toEqual({ ...EMPTY_FILTER, trade_class: "Cần cải thiện" });
});

test("dropdown chiều lệnh cũng lấy từ backend", async () => {
  const u = userEvent.setup();
  const daDoi = dung();

  await u.click(await screen.findByLabelText("Chiều"));
  await u.click(await screen.findByRole("option", { name: "Short" }));

  expect(daDoi.at(-1)).toEqual({ ...EMPTY_FILTER, direction: "Short" });
});

// Không có mục "tất cả" thì người dùng lọc rồi không bỏ lọc được nữa.
test("chọn 'Tất cả' xoá điều kiện đó", async () => {
  const u = userEvent.setup();
  const daDoi = dung({ ...EMPTY_FILTER, direction: "Short" });

  await u.click(await screen.findByLabelText("Chiều"));
  await u.click(await screen.findByRole("option", { name: "Tất cả" }));

  expect(daDoi.at(-1)).toEqual(EMPTY_FILTER);
});

test("nút Xoá lọc trả về bộ lọc rỗng", async () => {
  const u = userEvent.setup();
  const daDoi = dung({ ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" });

  await u.click(screen.getByRole("button", { name: "Xoá lọc" }));

  expect(daDoi.at(-1)).toEqual(EMPTY_FILTER);
});

// Ngày đi thẳng dạng YYYY-MM-DD, KHÔNG qua phép đổi múi giờ nào. Backend so
// nó với trường `day` vốn đã tính theo timezone account; đổi sang instant rồi
// cắt lại ngày là con đường ngắn nhất để lệch một ngày ở rìa.
test("ô ngày gửi thẳng YYYY-MM-DD", async () => {
  const u = userEvent.setup();
  const daDoi = dung();

  await u.type(screen.getByLabelText("Từ ngày"), "2026-06-01");

  expect(daDoi.at(-1)?.from).toBe("2026-06-01");
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/filterBar.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./FilterBar"`.

- [ ] **Step 3: Viết `src/features/trades/FilterBar.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaEnums } from "@/features/meta/hooks";
import { EMPTY_FILTER, type TradeFilter } from "./filters";

// Radix Select không nhận value="" cho một Item (chuỗi rỗng là "chưa chọn"),
// nên mục "bỏ lọc" phải mang một giá trị canh gác rồi dịch ngược lại ở
// onValueChange. Giá trị này KHÔNG bao giờ rời khỏi component.
const TAT_CA = "__tat_ca__";

export function FilterBar({
  value,
  onChange,
}: {
  value: TradeFilter;
  onChange: (f: TradeFilter) => void;
}) {
  const { data: enums } = useMetaEnums();

  function dat<K extends keyof TradeFilter>(k: K, v: string) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <OChu nhan="Từ ngày" id="f-from" loai="date" gt={value.from} dat={(v) => dat("from", v)} />
      <OChu nhan="Đến ngày" id="f-to" loai="date" gt={value.to} dat={(v) => dat("to", v)} />
      <OChu nhan="Mã sản phẩm" id="f-symbol" gt={value.symbol} dat={(v) => dat("symbol", v)} />
      {/* Setup do người dùng tự đặt tên, backend không có danh sách hợp lệ,
          nên đây là ô chữ tự do chứ không phải dropdown. */}
      <OChu nhan="Setup" id="f-setup" gt={value.setup} dat={(v) => dat("setup", v)} />

      <OChon
        nhan="Chiều"
        id="f-direction"
        gt={value.direction}
        muc={enums?.directions ?? []}
        dat={(v) => dat("direction", v)}
      />
      <OChon
        nhan="Khung thời gian"
        id="f-timeframe"
        gt={value.timeframe}
        muc={enums?.timeframes ?? []}
        dat={(v) => dat("timeframe", v)}
      />
      <OChon
        nhan="Phân loại"
        id="f-class"
        gt={value.trade_class}
        muc={enums?.trade_classes ?? []}
        dat={(v) => dat("trade_class", v)}
      />

      <Button variant="outline" onClick={() => onChange(EMPTY_FILTER)}>
        Xoá lọc
      </Button>
    </div>
  );
}

function OChu({
  nhan,
  id,
  gt,
  dat,
  loai = "text",
}: {
  nhan: string;
  id: string;
  gt: string;
  dat: (v: string) => void;
  loai?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{nhan}</Label>
      <Input id={id} type={loai} value={gt} onChange={(e) => dat(e.target.value)} />
    </div>
  );
}

function OChon({
  nhan,
  id,
  gt,
  muc,
  dat,
}: {
  nhan: string;
  id: string;
  gt: string;
  muc: string[];
  dat: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{nhan}</Label>
      <Select
        value={gt === "" ? TAT_CA : gt}
        onValueChange={(v) => dat(v === TAT_CA ? "" : v)}
      >
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TAT_CA}>Tất cả</SelectItem>
          {muc.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/filterBar.test.tsx src/test/styleguard.test.ts && npx tsc --noEmit
```

Kỳ vọng: 6 test xanh, và styleguard xanh — `FilterBar.tsx` không được chứa chuỗi enum nào.

- [ ] **Step 5: Falsify bất biến 9 — enum phải đến từ backend**

Trong `FilterBar.tsx`, thay `muc={enums?.trade_classes ?? []}` bằng danh sách chép cứng:

```tsx
        muc={["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện"]}
```

```bash
cd frontend && npx vitest run src/test/styleguard.test.ts
```

Kỳ vọng: **đỏ** với `FilterBar.tsx chép cứng chuỗi enum "CHƯA ĐÁNH GIÁ"`. Khôi phục.

Chú ý: `filterBar.test.tsx` vẫn **xanh** với bản chép cứng — nó chỉ thấy cùng ba chuỗi. Đó chính là lý do cổng styleguard tồn tại: test hành vi không phân biệt được dữ liệu tải về với dữ liệu chép cứng khi hai bên trùng nhau.

- [ ] **Step 6: Falsify — mục "Tất cả" phải dịch ngược về chuỗi rỗng**

Đổi `onValueChange={(v) => dat(v === TAT_CA ? "" : v)}` thành `onValueChange={dat}`.

Chạy lại. Kỳ vọng: **đỏ** ở `chọn 'Tất cả' xoá điều kiện đó` — bộ lọc nhận `direction: "__tat_ca__"`, một chuỗi rác sẽ bay thẳng lên query string. Khôi phục.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/trades/FilterBar.tsx \
        frontend/src/features/trades/filterBar.test.tsx
git commit -m "feat(fe): add the seven-field trade filter bar

Ba dropdown lấy danh sách từ /meta/enums, hai ô chữ tự do cho setup và
symbol vì backend không có danh sách hợp lệ cho chúng."
```

---

### Task 10: `TradeFormDialog` — form 16 trường

Spec §8. Bất biến 2 (ở mức tích hợp), 6 và 9.

**Files:**
- Create: `frontend/src/features/trades/TradeFormDialog.tsx`
- Test: `frontend/src/features/trades/tradeForm.test.tsx`

**Interfaces:**
- Consumes: `Trade`, `TradeCreate`, `TradePatch` (Task 2); `useCreateTrade`, `useUpdateTrade` (Task 3); `nowInZone`, `wallToInstant`, `instantToWall` (Task 1); `Select…` (Task 4), `Textarea` (Task 4); `useMetaEnums` (đã có); `Account` từ `@/features/accounts/types` (đã có).
- Produces:
  ```ts
  export function TradeFormDialog(props: {
    account: Account;
    trade?: Trade;              // có = sửa, không = thêm mới
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/trades/tradeForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoLenh } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import type { Account } from "@/features/accounts/types";
import type { Trade } from "./types";
import { TradeFormDialog } from "./TradeFormDialog";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1", "H4"],
  entry_qualities: ["Đúng kế hoạch", "Quá sớm"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

function taoAccount(over: Partial<Account> = {}): Account {
  return {
    id: 1,
    code: "FTMO",
    name: "Quỹ thử thách",
    initial_balance: "10000",
    risk_per_trade: "0.01",
    currency: "USD",
    timezone: "Asia/Ho_Chi_Minh",
    one_r: "100",
    ...over,
  };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/trades`, () => phongBi({ items: [], page: 1, size: 50, total: 0 })),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(null)),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
  );
});

function dung(props: { account?: Account; trade?: Trade } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TradeFormDialog
        account={props.account ?? taoAccount()}
        trade={props.trade}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

async function doiEnumTai() {
  // Chờ dropdown có dữ liệu thật trước khi thao tác, để không bấm vào một
  // Select đang rỗng.
  await screen.findByLabelText("Chiều lệnh");
}

test("thêm lệnh gửi entered_at đổi theo timezone của ACCOUNT", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  // Account ở New York, còn máy chạy test ở đâu thì không ai biết. 08:00 giờ
  // New York ngày 15/07 là 12:00Z — con số này chỉ ra đúng nếu code dùng
  // timezone của account.
  dung({ account: taoAccount({ timezone: "America/New_York" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Thời điểm vào lệnh"));
  await u.type(screen.getByLabelText("Thời điểm vào lệnh"), "2026-07-15T08:00");
  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.entered_at).toBe("2026-07-15T12:00:00.000Z");
});

// Ba nhóm hành vi khác nhau của ô rỗng, theo đúng patchToFields của backend:
// bốn cột NULLable nhận null, còn setup/notes/enum nhận chuỗi rỗng.
test("ô rỗng gửi null cho cột NULLable và chuỗi rỗng cho phần còn lại", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.entry).toBeNull();
  expect(daGui!.exit).toBeNull();
  expect(daGui!.volume).toBeNull();
  expect(daGui!.profit_theory).toBeNull();
  expect(daGui!.setup).toBe("");
  expect(daGui!.notes).toBe("");
  expect(daGui!.entry_quality).toBe("");
  expect(daGui!.psychology).toBe("");
  // fee mặc định "0", không phải rỗng — backend từ chối null cho cột này.
  expect(daGui!.fee).toBe("0");
  // stt KHÔNG được gửi: backend cấp (CLAUDE.md quy tắc 7).
  expect(daGui).not.toHaveProperty("stt");
});

// PATCH của backend dùng ba trạng thái: khoá vắng = không đổi. Gửi cả bảng
// biến một lần sửa ghi chú thành một lần ghi đè toàn bộ 16 trường.
test("sửa chỉ gửi trường đã đổi", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh({ id: 7 }));
    }),
  );

  dung({ trade: taoLenh({ id: 7, notes: "ghi chú cũ" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Ghi chú"));
  await u.type(screen.getByLabelText("Ghi chú"), "ghi chú mới");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).toEqual({ notes: "ghi chú mới" });
});

test("xoá trắng ô giá vào khi sửa thì gửi null, không gửi chuỗi rỗng", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh({ id: 7 }));
    }),
  );

  dung({ trade: taoLenh({ id: 7, entry: "2048.50" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Giá vào"));
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).toEqual({ entry: null });
});

test("mã sản phẩm rỗng bị chặn ở client, không gọi API", async () => {
  const u = userEvent.setup();
  let daGoi = false;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, () => {
      daGoi = true;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã sản phẩm không được để trống")).toBeInTheDocument();
  expect(daGoi).toBe(false);
});

test("dropdown tâm lý lấy danh sách từ backend", async () => {
  const u = userEvent.setup();
  dung();
  await doiEnumTai();

  await u.click(screen.getByLabelText("Tâm lý"));

  expect(await screen.findByRole("option", { name: "SỢ BỎ LỠ (FOMO)" })).toBeInTheDocument();
});

// Lệnh chưa đánh giá là trạng thái HỢP LỆ (quyết định #8 của spec mẹ). Form
// không được ép người dùng chấm điểm mới cho lưu.
test("năm trường đánh giá để trống vẫn lưu được", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "-45");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.profit).toBe("-45");
  expect(daGui!.timeframe).toBe("");
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/tradeForm.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./TradeFormDialog"`.

- [ ] **Step 3: Viết `src/features/trades/TradeFormDialog.tsx`**

```tsx
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { instantToWall, nowInZone, wallToInstant } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMetaEnums } from "@/features/meta/hooks";
import type { Account } from "@/features/accounts/types";
import { useCreateTrade, useUpdateTrade } from "./hooks";
import type { Trade, TradeCreate, TradePatch } from "./types";

// Kiểm số mà KHÔNG ép kiểu: một chuỗi chữ số hợp lệ, cho phép dấu trừ.
// Lãi lỗ âm là bình thường, phí âm cũng không bị backend cấm — FE không
// được bịa thêm ràng buộc backend không có.
const laSo = (v: string) => /^-?\d*\.?\d+$/.test(v.trim());
const laSoHoacRong = (v: string) => v.trim() === "" || laSo(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (validateTradeInput trong service/trade.go). Chặn ở client là để phản hồi
// nhanh, không phải để thay.
const schema = z.object({
  entered_at: z.string().min(1, "thời điểm vào lệnh không được để trống"),
  symbol: z.string().trim().min(1, "mã sản phẩm không được để trống"),
  direction: z.string().min(1, `chiều lệnh phải là "Long" hoặc "Short"`),
  timeframe: z.string(),
  setup: z.string(),
  entry: z.string().refine(laSoHoacRong, "giá vào phải là số"),
  exit: z.string().refine(laSoHoacRong, "giá ra phải là số"),
  volume: z.string().refine(laSoHoacRong, "khối lượng phải là số"),
  profit: z.string().refine(laSo, "lãi/lỗ phải là số"),
  profit_theory: z.string().refine(laSoHoacRong, "lãi lý thuyết phải là số"),
  fee: z.string().refine(laSo, "phí phải là số"),
  entry_quality: z.string(),
  in_trade_quality: z.string(),
  exit_quality: z.string(),
  psychology: z.string(),
  notes: z.string(),
});

type Fields = z.infer<typeof schema>;

/** Ô rỗng của bốn cột NULLable gửi null; mọi ô khác gửi chuỗi đã cắt trắng. */
const rongThanhNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

export function TradeFormDialog({
  account,
  trade,
  open,
  onOpenChange,
}: {
  account: Account;
  trade?: Trade;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{trade ? `Sửa lệnh ${trade.stt}` : "Thêm lệnh"}</DialogTitle>
        </DialogHeader>
        {/*
          Form nằm trong component con, và Radix gỡ hẳn DialogContent khỏi cây
          khi đóng. Nhờ vậy useForm dựng lại defaultValues MỖI LẦN MỞ: "bây
          giờ" luôn là bây giờ thật, và danh sách enum đã tải xong trước khi
          form tính giá trị mặc định cho ô chiều lệnh.
        */}
        {open && <FormLenh account={account} trade={trade} onXong={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FormLenh({
  account,
  trade,
  onXong,
}: {
  account: Account;
  trade?: Trade;
  onXong: () => void;
}) {
  const [loi, setLoi] = useState<string | null>(null);
  const { data: enums } = useMetaEnums();
  const taoMoi = useCreateTrade(account.id);
  const capNhat = useUpdateTrade(account.id);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    // enums đã tải xong trước lúc này: TradeFormDialog chỉ dựng component
    // này khi mở, còn /meta/enums được trang cha nạp với staleTime Infinity.
    defaultValues: trade
      ? tuTrade(trade, account.timezone)
      : macDinh(account.timezone, enums?.directions[0] ?? ""),
  });

  async function gui(v: Fields) {
    setLoi(null);
    try {
      if (trade) {
        // Chỉ gửi trường đã đổi: khoá vắng mặt nghĩa là "không đổi".
        const patch: TradePatch = {};
        if (dirtyFields.entered_at) patch.entered_at = wallToInstant(v.entered_at, account.timezone);
        if (dirtyFields.symbol) patch.symbol = v.symbol.trim();
        if (dirtyFields.direction) patch.direction = v.direction;
        if (dirtyFields.entry) patch.entry = rongThanhNull(v.entry);
        if (dirtyFields.exit) patch.exit = rongThanhNull(v.exit);
        if (dirtyFields.volume) patch.volume = rongThanhNull(v.volume);
        if (dirtyFields.profit) patch.profit = v.profit.trim();
        if (dirtyFields.profit_theory) patch.profit_theory = rongThanhNull(v.profit_theory);
        if (dirtyFields.fee) patch.fee = v.fee.trim();
        if (dirtyFields.setup) patch.setup = v.setup.trim();
        if (dirtyFields.timeframe) patch.timeframe = v.timeframe;
        if (dirtyFields.entry_quality) patch.entry_quality = v.entry_quality;
        if (dirtyFields.in_trade_quality) patch.in_trade_quality = v.in_trade_quality;
        if (dirtyFields.exit_quality) patch.exit_quality = v.exit_quality;
        if (dirtyFields.psychology) patch.psychology = v.psychology;
        if (dirtyFields.notes) patch.notes = v.notes.trim();
        await capNhat.mutateAsync({ id: trade.id, patch });
      } else {
        const body: TradeCreate = {
          entered_at: wallToInstant(v.entered_at, account.timezone),
          symbol: v.symbol.trim(),
          direction: v.direction,
          entry: rongThanhNull(v.entry),
          exit: rongThanhNull(v.exit),
          volume: rongThanhNull(v.volume),
          profit: v.profit.trim(),
          profit_theory: rongThanhNull(v.profit_theory),
          fee: v.fee.trim(),
          setup: v.setup.trim(),
          timeframe: v.timeframe,
          entry_quality: v.entry_quality,
          in_trade_quality: v.in_trade_quality,
          exit_quality: v.exit_quality,
          psychology: v.psychology,
          notes: v.notes.trim(),
        };
        await taoMoi.mutateAsync(body);
      }
      onXong();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    }
  }

  return (
    <form onSubmit={handleSubmit(gui)} className="flex flex-col gap-4" noValidate>
      <Nhom ten="Lệnh">
        <O ten="entered_at" nhan="Thời điểm vào lệnh" loai="datetime-local"
           loi={errors.entered_at?.message} dangKy={register("entered_at")} />
        <O ten="symbol" nhan="Mã sản phẩm" loi={errors.symbol?.message} dangKy={register("symbol")} />
        <Chon ten="direction" nhan="Chiều lệnh" control={control}
              muc={enums?.directions ?? []} loi={errors.direction?.message} />
        <Chon ten="timeframe" nhan="Khung thời gian" control={control}
              muc={enums?.timeframes ?? []} choPhepRong />
        <O ten="setup" nhan="Setup" dangKy={register("setup")} />
      </Nhom>

      <Nhom ten="Tiền">
        <O ten="entry" nhan="Giá vào" loi={errors.entry?.message} dangKy={register("entry")} />
        <O ten="exit" nhan="Giá ra" loi={errors.exit?.message} dangKy={register("exit")} />
        <O ten="volume" nhan="Khối lượng" loi={errors.volume?.message} dangKy={register("volume")} />
        <O ten="profit" nhan="Lãi/lỗ" loi={errors.profit?.message} dangKy={register("profit")} />
        <O ten="profit_theory" nhan="Lãi lý thuyết" loi={errors.profit_theory?.message}
           dangKy={register("profit_theory")} />
        <O ten="fee" nhan="Phí" loi={errors.fee?.message} dangKy={register("fee")} />
      </Nhom>

      <Nhom ten="Đánh giá">
        <Chon ten="entry_quality" nhan="Vào lệnh" control={control}
              muc={enums?.entry_qualities ?? []} choPhepRong />
        <Chon ten="in_trade_quality" nhan="Trong lệnh" control={control}
              muc={enums?.in_trade_qualities ?? []} choPhepRong />
        <Chon ten="exit_quality" nhan="Thoát lệnh" control={control}
              muc={enums?.exit_qualities ?? []} choPhepRong />
        <Chon ten="psychology" nhan="Tâm lý" control={control}
              muc={enums?.psychologies ?? []} choPhepRong />
      </Nhom>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea id="notes" {...register("notes")} />
      </div>

      <p className="text-xs text-muted-foreground">
        Để trống bốn ô đánh giá nếu chưa chấm điểm lệnh này.
      </p>

      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}

      <DialogFooter>
        <Button type="submit">Lưu</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Giá trị mặc định khi thêm lệnh mới.
 *
 * `chieuMacDinh` là phần tử đầu của `/meta/enums` chứ không phải chuỗi
 * "Long" chép cứng — spec §8 đòi mặc định là `directions[0]`, và chép cứng
 * sẽ vướng cổng styleguard lẫn quy tắc 5 của CLAUDE.md.
 */
function macDinh(tz: string, chieuMacDinh: string): Fields {
  return {
    entered_at: nowInZone(tz),
    symbol: "",
    direction: chieuMacDinh,
    timeframe: "",
    setup: "",
    entry: "",
    exit: "",
    volume: "",
    profit: "",
    profit_theory: "",
    fee: "0",
    entry_quality: "",
    in_trade_quality: "",
    exit_quality: "",
    psychology: "",
    notes: "",
  };
}

function tuTrade(t: Trade, tz: string): Fields {
  return {
    entered_at: instantToWall(t.entered_at, tz),
    symbol: t.symbol,
    direction: t.direction,
    timeframe: t.timeframe,
    setup: t.setup,
    entry: t.entry ?? "",
    exit: t.exit ?? "",
    volume: t.volume ?? "",
    profit: t.profit,
    profit_theory: t.profit_theory ?? "",
    fee: t.fee,
    entry_quality: t.entry_quality,
    in_trade_quality: t.in_trade_quality,
    exit_quality: t.exit_quality,
    psychology: t.psychology,
    notes: t.notes,
  };
}

function Nhom({ ten, children }: { ten: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {ten}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function O({
  ten,
  nhan,
  loi,
  dangKy,
  loai = "text",
}: {
  ten: string;
  nhan: string;
  loi?: string;
  dangKy: UseFormRegisterReturn;
  loai?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Input id={ten} type={loai} {...dangKy} />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}

// Radix Select không phải input thật nên register() không gắn vào được —
// phải đi qua Controller. Và nó không nhận Item mang value rỗng, nên "chưa
// chọn" dùng một giá trị canh gác rồi dịch ngược ngay tại chỗ.
const CHUA_CHON = "__chua_chon__";

function Chon({
  ten,
  nhan,
  control,
  muc,
  loi,
  choPhepRong = false,
}: {
  ten: keyof Fields;
  nhan: string;
  control: Control<Fields>;
  muc: string[];
  loi?: string;
  choPhepRong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Controller
        control={control}
        name={ten}
        render={({ field }) => (
          <Select
            value={field.value === "" ? CHUA_CHON : field.value}
            onValueChange={(v) => field.onChange(v === CHUA_CHON ? "" : v)}
          >
            <SelectTrigger id={ten}>
              <SelectValue placeholder="Chọn" />
            </SelectTrigger>
            <SelectContent>
              {choPhepRong && <SelectItem value={CHUA_CHON}>Chưa đánh giá</SelectItem>}
              {muc.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run src/features/trades/tradeForm.test.tsx src/test/styleguard.test.ts && npx tsc --noEmit
```

Kỳ vọng: 7 test xanh, styleguard xanh, `tsc` exit 0.

Ba test lưu lệnh mới đều **không** chọn chiều lệnh bằng tay. Chúng dựa vào `macDinh(tz, enums?.directions[0] ?? "")` điền sẵn `"Long"`, đúng như spec §8 yêu cầu. Nếu bước này đỏ với `chiều lệnh phải là "Long" hoặc "Short"` thì lỗi nằm ở chỗ `defaultValues` tính trước khi `/meta/enums` về — kiểm lại rằng `FormLenh` chỉ được dựng khi `open` là true, **đừng** sửa test để nó tự chọn tay.

`React.ReactNode` cần `import type { ReactNode } from "react"` dưới `verbatimModuleSyntax`.

- [ ] **Step 5: Falsify bất biến 2 ở mức tích hợp**

Đổi `wallToInstant(v.entered_at, account.timezone)` (ở nhánh tạo mới) thành `new Date(v.entered_at).toISOString()`.

Chạy lại. Kỳ vọng: **đỏ** ở `thêm lệnh gửi entered_at đổi theo timezone của ACCOUNT` — nhận instant tính theo giờ máy chứ không phải giờ New York. Khôi phục.

Khác với bước falsify của Task 1 ở chỗ: đây chứng minh component **truyền đúng** `account.timezone` xuống, chứ không chỉ chứng minh hàm đổi đúng.

- [ ] **Step 6: Falsify bất biến 6 — PATCH chỉ gửi trường đã đổi**

Trong nhánh sửa, thay toàn bộ khối `if (dirtyFields...)` bằng một lần gán cả bảng:

```ts
        await capNhat.mutateAsync({
          id: trade.id,
          patch: { notes: v.notes.trim(), symbol: v.symbol.trim(), profit: v.profit.trim() },
        });
```

Chạy lại. Kỳ vọng: **đỏ** ở `sửa chỉ gửi trường đã đổi` — `daGui` mang ba khoá thay vì một. Khôi phục.

- [ ] **Step 7: Falsify — ô rỗng của cột NULLable**

Đổi `rongThanhNull` thành `(v: string) => v.trim()`.

Chạy lại. Kỳ vọng: **đỏ hai chỗ** — `ô rỗng gửi null…` (nhận `""` thay vì `null`) và `xoá trắng ô giá vào…`. Khôi phục.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/trades/TradeFormDialog.tsx \
        frontend/src/features/trades/tradeForm.test.tsx
git commit -m "feat(fe): add the 16-field trade form

Ba nhóm hành vi của ô rỗng theo đúng patchToFields: bốn cột NULLable gửi
null, setup/notes/enum gửi chuỗi rỗng, năm trường bắt buộc không rỗng được.
entered_at đổi theo timezone account, không phải giờ máy."
```

---

### Task 11: `TradesPage` + route + điều hướng

Spec §2.3, §7, §12. Bất biến 5 (bộ lọc nằm trên URL).

**Files:**
- Create: `frontend/src/features/trades/TradesPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/AppShell.tsx`
- Test: `frontend/src/features/trades/tradesPage.test.tsx`

**Interfaces:**
- Consumes: mọi thứ của Task 2, 3, 7, 8, 9, 10; `useActiveAccount` từ `@/features/accounts/activeAccount` (đã có).
- Produces:
  ```ts
  export function TradesPage(): JSX.Element;
  ```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/trades/tradesPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { server } from "@/test/server";
import { taoLenh, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { ACTIVE_ACCOUNT_KEY } from "@/features/accounts/activeAccount";
import { TradesPage } from "./TradesPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1"],
  entry_qualities: ["Đúng kế hoạch"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

let duongDanTrades = "";

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  duongDanTrades = "";
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([account])),
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh({ stt: 1 })], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats())),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
  );
});

/** Hiện URL hiện tại ra DOM để test đọc được mà không cần chạm router nội bộ. */
function HienURL() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

function dung(url = "/trades") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <HienURL />
        <Routes>
          <Route path="/trades" element={<TradesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bảng và dải KPI cùng dựng từ một bộ lọc", async () => {
  dung();
  expect(await screen.findByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Số lệnh" })).getByText("3")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 5. Vào thẳng URL có sẵn bộ lọc thì bộ lọc phải có hiệu
// lực ngay từ request ĐẦU TIÊN — đó là điều một useState trong component
// không làm được.
test("bộ lọc trên URL có hiệu lực ngay lần tải đầu", async () => {
  dung("/trades?symbol=XAUUSD&direction=Long&page=2");

  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(duongDanTrades).toBe("?symbol=XAUUSD&direction=Long&page=2");
  expect(screen.getByLabelText("Mã sản phẩm")).toHaveValue("XAUUSD");
});

test("đổi bộ lọc thì ghi lên URL", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "EU");

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?symbol=EU");
});

// Lọc lại mà vẫn ở trang 7 thì người dùng thấy một trang trống và tưởng
// không có kết quả nào.
test("đổi bộ lọc thì về trang 1", async () => {
  const u = userEvent.setup();
  dung("/trades?page=3");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "E");

  const url = await screen.findByTestId("url");
  expect(url).toHaveTextContent("symbol=E");
  expect(url).not.toHaveTextContent("page=");
});

test("chưa có tài khoản nào thì chỉ đường sang trang tài khoản", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  expect(await screen.findByRole("link", { name: /tài khoản/i })).toBeInTheDocument();
  expect(duongDanTrades).toBe("");
});

test("phân trang ghi số trang lên URL", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh()], page: 1, size: 50, total: 120 });
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Trang sau" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("page=2");
});

test("mở form thêm lệnh từ nút trên đầu trang", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Thêm lệnh" }));

  expect(await screen.findByRole("dialog")).toHaveTextContent("Thêm lệnh");
});

test("xoá lệnh phải xác nhận trước", async () => {
  const u = userEvent.setup();
  let daXoa = false;
  server.use(
    http.delete(`${BASE}/trades/1`, () => {
      daXoa = true;
      return phongBi(null);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));
  expect(daXoa).toBe(false);

  await u.click(await screen.findByRole("button", { name: "Xoá" }));
  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(daXoa).toBe(true);
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/tradesPage.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./TradesPage"`.

- [ ] **Step 3: Viết `src/features/trades/TradesPage.tsx`**

```tsx
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { FilterBar } from "./FilterBar";
import { StatsStrip } from "./StatsStrip";
import { TradeFormDialog } from "./TradeFormDialog";
import { TradeTable } from "./TradeTable";
import { readFilter, readPage, writeParams, type TradeFilter } from "./filters";
import { useDeleteTrade, useStats, useTrades } from "./hooks";
import type { Trade } from "./types";

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi NhatKyLenh vì mọi hook lệnh đều cần `account.id`: gọi chúng
 * rồi mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì
 * số lượng hook đổi giữa các lần render.
 */
export function TradesPage() {
  const { account, isPending } = useActiveAccount();

  if (isPending) return <p role="status">Đang tải…</p>;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        Chưa có tài khoản giao dịch nào.{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          Tạo tài khoản giao dịch
        </Link>{" "}
        để bắt đầu ghi nhật ký.
      </p>
    );
  }

  return <NhatKyLenh account={account} />;
}

function NhatKyLenh({ account }: { account: Account }) {
  const [sp, setSp] = useSearchParams();
  const filter = readFilter(sp);
  const page = readPage(sp);

  const ds = useTrades(account.id, filter, page);
  const kpi = useStats(account.id, filter);
  const xoa = useDeleteTrade(account.id);

  const [dangSua, setDangSua] = useState<Trade | undefined>(undefined);
  const [moForm, setMoForm] = useState(false);
  const [sapXoa, setSapXoa] = useState<Trade | null>(null);

  // Đổi bộ lọc thì về trang 1: lọc lại mà vẫn đứng ở trang 7 sẽ cho một
  // trang trống, và người dùng đọc nó thành "không có kết quả nào".
  function datFilter(f: TradeFilter) {
    setSp(writeParams(f, 1));
  }

  function datPage(p: number) {
    setSp(writeParams(filter, p));
  }

  const size = ds.data?.size ?? 50;
  const tong = ds.data?.total ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / size));

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Nhật ký lệnh</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/trades/trash"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Thùng rác
          </Link>
          <Button
            onClick={() => {
              setDangSua(undefined);
              setMoForm(true);
            }}
          >
            Thêm lệnh
          </Button>
        </div>
      </header>

      {kpi.data && <StatsStrip stats={kpi.data} currency={account.currency} />}

      <FilterBar value={filter} onChange={datFilter} />

      {ds.isPending && <p role="status">Đang tải…</p>}
      {ds.error && (
        <p role="alert" className="text-destructive">
          {ds.error.message}
        </p>
      )}

      {ds.data && ds.data.items.length === 0 && (
        <p className="text-muted-foreground">
          Không có lệnh nào khớp bộ lọc. Thêm lệnh đầu tiên hoặc nới bộ lọc ra.
        </p>
      )}

      {ds.data && ds.data.items.length > 0 && (
        <>
          <TradeTable
            rows={ds.data.items}
            timezone={account.timezone}
            currency={account.currency}
            onSua={(t) => {
              setDangSua(t);
              setMoForm(true);
            }}
            onXoa={(t) => setSapXoa(t)}
          />

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => datPage(page - 1)}>
              Trang trước
            </Button>
            <span className="text-sm text-muted-foreground">
              Trang {page} / {soTrang} · {tong} lệnh
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= soTrang}
              onClick={() => datPage(page + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}

      <TradeFormDialog
        account={account}
        trade={dangSua}
        open={moForm}
        onOpenChange={(v) => {
          setMoForm(v);
          if (!v) setDangSua(undefined);
        }}
      />

      <Dialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá lệnh?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {sapXoa
              ? `Lệnh ${sapXoa.stt} · ${sapXoa.symbol}. Lệnh chuyển vào thùng rác và khôi phục lại được.`
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapXoa(null)}>
              Huỷ
            </Button>
            <Button
              onClick={async () => {
                if (sapXoa) await xoa.mutateAsync(sapXoa.id);
                setSapXoa(null);
              }}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 4: Thêm route vào `src/app/router.tsx`**

Thêm **một** import và **một** `<Route>` con vào khối layout đã có:

```tsx
import { TradesPage } from "@/features/trades/TradesPage";
```

```tsx
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/trades" element={<TradesPage />} />
```

Chưa thêm `/trades/trash` ở đây: `TrashPage` tới Task 12 mới tồn tại, và import một file chưa có sẽ làm `tsc` đỏ ngay ở Step 6. Task 12 thêm route đó cùng lúc với file.

Liên kết "Thùng rác" trên đầu `TradesPage` vì thế trỏ vào một route chưa đăng ký cho tới hết Task 12. Bấm vào nó lúc này sẽ rơi về `/accounts` qua route `*`. Đó là trạng thái tạm trong đúng một task, không phải lỗi cần vá.

- [ ] **Step 5: Thêm NavLink vào `src/app/AppShell.tsx`**

Trong khối `<nav>`, ngay dưới NavLink "Tài khoản", thêm một NavLink y hệt về cấu trúc, đổi `to` và nhãn:

```tsx
          <NavLink
            to="/trades"
            className={({ isActive }) =>
              cn("rounded-md px-2 py-1.5 text-sm", isActive && "font-medium")
            }
            style={({ isActive }) =>
              isActive
                ? {
                    backgroundColor: "var(--sidebar-active-bg)",
                    color: "var(--sidebar-text-active)",
                  }
                : { color: "var(--sidebar-text)" }
            }
          >
            Nhật ký lệnh
          </NavLink>
```

- [ ] **Step 6: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Kỳ vọng: tất cả xanh. `shell.test.tsx` có thể cần thêm khẳng định cho NavLink mới — nếu nó đỏ vì tìm thấy nhiều link hơn dự tính, sửa test cho khớp giao diện mới.

- [ ] **Step 7: Falsify bất biến 5 — bộ lọc nằm trên URL**

Trong `NhatKyLenh`, thay ba dòng đọc URL bằng state cục bộ:

```tsx
  const [filter, datFilterState] = useState<TradeFilter>(EMPTY_FILTER);
  const [page, setPageState] = useState(1);
  function datFilter(f: TradeFilter) { datFilterState(f); setPageState(1); }
  function datPage(p: number) { setPageState(p); }
```

(và thêm `EMPTY_FILTER` vào import).

Chạy lại. Kỳ vọng: **đỏ ba chỗ** —
- `bộ lọc trên URL có hiệu lực ngay lần tải đầu`: `duongDanTrades` là `""` chứ không mang bộ lọc, và ô Mã sản phẩm rỗng.
- `đổi bộ lọc thì ghi lên URL`: URL đứng nguyên `/trades`.
- `phân trang ghi số trang lên URL`.

Khôi phục.

- [ ] **Step 8: Falsify — đổi lọc phải về trang 1**

Đổi `setSp(writeParams(f, 1))` thành `setSp(writeParams(f, page))`.

Chạy lại. Kỳ vọng: **đỏ** ở `đổi bộ lọc thì về trang 1` — URL còn `page=3`. Khôi phục.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/trades/TradesPage.tsx \
        frontend/src/features/trades/tradesPage.test.tsx \
        frontend/src/app/router.tsx frontend/src/app/AppShell.tsx
git commit -m "feat(fe): wire the trades page with URL-backed filters

Vào thẳng /trades?symbol=X là bộ lọc có hiệu lực ngay request đầu tiên —
thứ một useState trong component không làm được."
```

---

### Task 12: `TrashPage` — thùng rác và khôi phục

Spec §9. Bất biến 10.

**Files:**
- Create: `frontend/src/features/trades/TrashPage.tsx`
- Modify: `frontend/src/app/router.tsx` (thêm route `/trades/trash`)
- Test: `frontend/src/features/trades/trashPage.test.tsx`

**Interfaces:**
- Consumes: `DeletedTrade` (Task 2); `useTrash`, `useRestoreTrade` (Task 3); `formatInstant` (Task 1); `useActiveAccount` (đã có).
- Produces:
  ```ts
  export function TrashPage(): JSX.Element;
  ```

- [ ] **Step 1: Viết test đỏ**

Tạo `frontend/src/features/trades/trashPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import type { DeletedTrade } from "./types";
import { TrashPage } from "./TrashPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

const daXoa: DeletedTrade = {
  id: 5,
  account_id: 1,
  stt: 2,
  entered_at: "2026-06-09T14:30:00Z",
  symbol: "EURUSD",
  direction: "Short",
  profit: "-45.00",
  fee: "1.50",
  setup: "Break-retest",
  notes: "vào khi chưa xác nhận",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(http.get(`${BASE}/accounts`, () => phongBi([account])));
});

function dung() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bày lệnh đã xoá với các trường input", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([daXoa])));
  dung();

  const d = await screen.findByRole("row", { name: /EURUSD/ });
  expect(within(d).getByText("2")).toBeInTheDocument();
  expect(within(d).getByText("09/06/2026 21:30")).toBeInTheDocument();
  expect(within(d).getByText("Break-retest")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 10.
//
// Lệnh đã xoá KHÔNG nằm trong dãy lũy kế, nên cum_by_trade, drawdown hay
// score_total của nó không tồn tại — backend cố ý không trả về chúng. Dựng
// một cột cho chúng sẽ hiện "undefined", hoặc tệ hơn là số 0 trông như thật.
test("không có cột nào cho trường suy diễn", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([daXoa])));
  dung();
  await screen.findByRole("row", { name: /EURUSD/ });

  for (const cot of ["Lũy kế", "Net", "Điểm", "Phân loại", "Sụt giảm"]) {
    expect(screen.queryByRole("columnheader", { name: cot })).not.toBeInTheDocument();
  }
  expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  expect(screen.queryByText("NaN")).not.toBeInTheDocument();
});

test("khôi phục gọi đúng endpoint và làm mới danh sách", async () => {
  const u = userEvent.setup();
  let daGoi = 0;
  const kho = [daXoa];
  server.use(
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([...kho])),
    http.post(`${BASE}/trades/5/restore`, () => {
      daGoi++;
      kho.length = 0;
      return phongBi(daXoa);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /EURUSD/ });

  await u.click(screen.getByRole("button", { name: "Khôi phục lệnh 2" }));

  expect(await screen.findByText(/thùng rác trống/i)).toBeInTheDocument();
  expect(daGoi).toBe(1);
});

test("thùng rác trống thì nói rõ", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])));
  dung();
  expect(await screen.findByText(/thùng rác trống/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

```bash
cd frontend && npx vitest run src/features/trades/trashPage.test.tsx
```

Kỳ vọng: đỏ với `Failed to resolve import "./TrashPage"`.

- [ ] **Step 3: Viết `src/features/trades/TrashPage.tsx`**

```tsx
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInstant } from "@/lib/datetime";
import { formatMoney } from "@/lib/decimal";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { useRestoreTrade, useTrash } from "./hooks";

export function TrashPage() {
  const { account, isPending } = useActiveAccount();

  if (isPending) return <p role="status">Đang tải…</p>;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        Chưa có tài khoản giao dịch nào.{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          Tạo tài khoản giao dịch
        </Link>{" "}
        để bắt đầu ghi nhật ký.
      </p>
    );
  }

  return <ThungRac account={account} />;
}

/**
 * Bảng ở đây CHỈ có trường input — mười cột của deletedTradeDTO.
 *
 * Không có cột lũy kế, điểm hay phân loại, và đó không phải chuyện bỏ sót:
 * lệnh đã xoá nằm ngoài dãy lũy kế nên những con số ấy không tồn tại. Backend
 * cố ý không trả về chúng, và kiểu DeletedTrade cũng không khai chúng — thêm
 * một cột như vậy là lỗi biên dịch trước khi kịp thành số 0 giả trên màn hình.
 */
function ThungRac({ account }: { account: Account }) {
  const rac = useTrash(account.id);
  const khoiPhuc = useRestoreTrade(account.id);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Thùng rác</h1>
        <Link to="/trades" className="text-sm text-muted-foreground underline underline-offset-4">
          Về nhật ký lệnh
        </Link>
      </header>

      {rac.isPending && <p role="status">Đang tải…</p>}
      {rac.error && (
        <p role="alert" className="text-destructive">
          {rac.error.message}
        </p>
      )}

      {rac.data && rac.data.length === 0 && (
        <p className="text-muted-foreground">Thùng rác trống.</p>
      )}

      {rac.data && rac.data.length > 0 && (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>Thời điểm</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Chiều</TableHead>
                <TableHead>Lãi/lỗ</TableHead>
                <TableHead>Phí</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rac.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="num">{t.stt}</TableCell>
                  <TableCell>{formatInstant(t.entered_at, account.timezone)}</TableCell>
                  <TableCell className="font-medium">{t.symbol}</TableCell>
                  <TableCell>{t.direction}</TableCell>
                  <TableCell className="num">{formatMoney(t.profit)}</TableCell>
                  <TableCell className="num">{formatMoney(t.fee)}</TableCell>
                  <TableCell>{t.setup}</TableCell>
                  <TableCell className="max-w-64 truncate">{t.notes}</TableCell>
                  <TableCell>
                    {/* Khôi phục KHÔNG hỏi lại: nó chính là thao tác hoàn tác. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Khôi phục lệnh ${t.stt}`}
                      onClick={() => void khoiPhuc.mutateAsync(t.id)}
                    >
                      Khôi phục
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Thêm route `/trades/trash` vào `src/app/router.tsx`**

```tsx
        <Route path="/trades/trash" element={<TrashPage />} />
```

Đặt **sau** `/trades`; React Router v7 khớp theo độ cụ thể nên thứ tự không đổi kết quả, nhưng đọc theo thứ tự đường dẫn thì dễ theo dõi hơn.

- [ ] **Step 5: Chạy để chắc nó xanh**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Kỳ vọng: tất cả xanh.

- [ ] **Step 6: Falsify bất biến 10 — không bịa trường suy diễn**

Thêm một cột lũy kế vào bảng thùng rác:

```tsx
                <TableHead>Lũy kế</TableHead>
```

và trong thân bảng:

```tsx
                  <TableCell>{(t as unknown as { cum_by_trade: string }).cum_by_trade}</TableCell>
```

Chạy lại. Kỳ vọng: **đỏ** ở `không có cột nào cho trường suy diễn` — tìm thấy `columnheader` tên `Lũy kế`.

Lưu ý phải dùng `as unknown as` mới ép qua được: bản thân kiểu `DeletedTrade` đã chặn ở tầng biên dịch, và đó là lớp bảo vệ thứ nhất. Khôi phục.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/trades/TrashPage.tsx \
        frontend/src/features/trades/trashPage.test.tsx \
        frontend/src/app/router.tsx
git commit -m "feat(fe): add the trash page with restore

Chỉ mười trường input. Lệnh đã xoá nằm ngoài dãy lũy kế nên cum_by_trade
của nó không tồn tại — kiểu DeletedTrade chặn việc bịa ra nó."
```

---

### Task 13: hành trình e2e trên stack thật, và toàn bộ cổng

Spec §13. Đây là lớp mà MSW mù: lũy kế do **backend thật** tính lại.

**Files:**
- Modify: `frontend/e2e/auth.spec.ts` (nối bước 10–16 vào cuối khối `describe.serial`)

**Interfaces:**
- Consumes: hàm `dangNhap(page)` đã có sẵn ở cuối `auth.spec.ts`.
- Produces: không có API mới.

- [ ] **Step 1: Nối bảy bước vào `auth.spec.ts`**

Chèn **bên trong** khối `test.describe.serial`, ngay sau bước 9, trước dấu `});` đóng khối:

```ts
  // ---- Hành trình lệnh (bước 10-16) --------------------------------------
  //
  // Nối vào đây chứ không mở trades.spec.ts riêng: ứng dụng chỉ cho đăng ký
  // user ĐẦU TIÊN và playwright chạy workers:1, nên một file thứ hai sẽ chỉ
  // đăng nhập được nhờ user do file này tạo ra — một phụ thuộc ngầm chỉ đúng
  // nhờ thứ tự chữ cái.
  //
  // PHẦN MSW KHÔNG THAY THẾ ĐƯỢC là bước 13 và 14: lũy kế do backend THẬT
  // tính lại trên toàn dãy, và bộ lọc không được đụng vào nó.

  async function moNhatKy(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: "Nhật ký lệnh" }).click();
    await expect(page.getByRole("heading", { name: "Nhật ký lệnh" })).toBeVisible();
  }

  async function themLenh(
    page: import("@playwright/test").Page,
    v: { moc: string; ma: string; lai: string },
  ) {
    await page.getByRole("button", { name: "Thêm lệnh" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Thời điểm vào lệnh").fill(v.moc);
    await hop.getByLabel("Mã sản phẩm").fill(v.ma);
    await hop.getByLabel("Chiều lệnh").click();
    await page.getByRole("option", { name: "Long" }).click();
    await hop.getByLabel("Lãi/lỗ").fill(v.lai);
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();
  }

  test("10. đăng nhập lại rồi mở Nhật ký lệnh, chưa có lệnh nào", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);
    await expect(page.getByText(/không có lệnh nào khớp bộ lọc/i)).toBeVisible();
  });

  test("11. thêm lệnh đầu tiên thì lũy kế bằng chính nó", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await themLenh(page, { moc: "2026-06-09T09:00", ma: "XAUUSD", lai: "100" });

    const d = page.getByRole("row", { name: /XAUUSD/ });
    await expect(d).toContainText("+100");
    // Giờ hiện lại phải đúng giờ đã nhập: account ở Asia/Ho_Chi_Minh, lưu UTC.
    await expect(d).toContainText("09/06/2026 09:00");
  });

  test("12. thêm lệnh thứ hai thì lũy kế cộng dồn", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await themLenh(page, { moc: "2026-06-10T09:00", ma: "EURUSD", lai: "50" });

    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("150");
    await expect(page.getByRole("group", { name: "Số lệnh" })).toContainText("2");
  });

  // Bước quan trọng nhất của cả file. Sửa lệnh 1 làm lũy kế của lệnh 2 đổi
  // theo, và con số mới do BACKEND tính lại trên toàn dãy — không phải do FE
  // suy ra. Nếu FE vá một dòng vào cache thì dòng EURUSD sẽ đứng ở 150.
  test("13. sửa lệnh cũ thì lũy kế của lệnh sau nó tính lại", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByRole("button", { name: "Xem chi tiết lệnh 1" }).click();
    await page.getByRole("button", { name: "Sửa lệnh 1" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Lãi/lỗ").fill("200");
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();

    await expect(page.getByRole("row", { name: /XAUUSD/ })).toContainText("+200");
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });

  // Quy tắc 8 của CLAUDE.md nhìn bằng mắt: lọc chỉ lọc phần HIỂN THỊ, lũy kế
  // vẫn tính trên toàn bộ dãy. Lệnh EURUSD đứng một mình sau khi lọc nhưng
  // lũy kế của nó vẫn là 250, không tụt về 50.
  test("14. lọc không đụng vào lũy kế, và F5 giữ bộ lọc", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByLabel("Mã sản phẩm").fill("EURUSD");
    await expect(page.getByRole("row", { name: /XAUUSD/ })).toBeHidden();

    const d = page.getByRole("row", { name: /EURUSD/ });
    await expect(d).toContainText("250");

    await expect(page).toHaveURL(/symbol=EURUSD/);
    await page.reload();
    await expect(page.getByLabel("Mã sản phẩm")).toHaveValue("EURUSD");
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });

  test("15. xoá lệnh thì nó vào thùng rác", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByRole("button", { name: "Xem chi tiết lệnh 2" }).click();
    await page.getByRole("button", { name: "Xoá lệnh 2" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();

    await expect(page.getByRole("row", { name: /EURUSD/ })).toBeHidden();

    await page.getByRole("link", { name: "Thùng rác" }).click();
    await expect(page.getByRole("row", { name: /EURUSD/ })).toBeVisible();
  });

  test("16. khôi phục thì lệnh về đúng chỗ cũ", async ({ page }) => {
    await dangNhap(page);
    await page.goto("/trades/trash");

    await page.getByRole("button", { name: "Khôi phục lệnh 2" }).click();
    await expect(page.getByText(/thùng rác trống/i)).toBeVisible();

    await page.goto("/trades");
    // Về đúng stt 2 và đúng lũy kế cũ: khôi phục không cấp stt mới.
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });
```

- [ ] **Step 2: Cập nhật docblock đầu file**

Khối chú thích ở đầu `auth.spec.ts` hiện chỉ nói về vòng đời phiên. Đổi tên khối describe và bổ sung một đoạn:

```ts
test.describe.serial("vòng đời phiên và hành trình lệnh trên stack thật", () => {
```

và thêm vào cuối docblock:

```
 * Từ bước 10 trở đi là hành trình lệnh. Bước 13 và 14 là phần MSW không
 * thay thế được: lũy kế do backend THẬT tính lại trên toàn dãy lệnh, nên
 * chúng bắt được cả lỗi FE vá cache lẫn lỗi backend lọc trước khi Enrich.
```

- [ ] **Step 3: Chạy e2e trên Docker thật**

Trước hết dừng stack dev nếu đang chạy — `make e2e` dùng cùng cổng 5432/8000/8080:

```bash
make down
make e2e
```

Kỳ vọng: 16 test xanh.

Nếu đỏ ở bước 11 vì không tìm thấy nhãn, mở `playwright-report/` xem ảnh chụp: nguyên nhân thường gặp là nhãn ô trong form khác chuỗi plan viết. Sửa **e2e cho khớp giao diện thật**, đừng đổi giao diện cho khớp e2e.

- [ ] **Step 4: Falsify — e2e thật sự canh quy tắc lũy kế**

Trong `src/features/trades/hooks.ts`, xoá dòng invalidate `tradesAll` trong `useLamMoi`.

```bash
make e2e
```

Kỳ vọng: **đỏ ở bước 13** — dòng EURUSD còn `150` thay vì `250`. Khôi phục và chạy lại cho xanh.

Đây là bằng chứng cuối cùng và mạnh nhất cho bất biến 1: nó đi qua trình duyệt thật, nginx thật, Go thật và Postgres thật.

- [ ] **Step 5: Chạy trọn năm cổng**

```bash
make lint
make test-pure
make test
make test-fe
make e2e
```

Kỳ vọng: cả năm exit 0. Ghi lại **con số thật** (bao nhiêu package Go, bao nhiêu test Vitest, bao nhiêu test Playwright), không viết "đều xanh" chung chung.

- [ ] **Step 6: Chứng minh không đụng backend**

```bash
git diff $(git merge-base main HEAD) --stat -- backend/
```

Kỳ vọng: **rỗng**.

Dùng `merge-base` chứ không dùng `main` trơn: nhánh này tách từ `main` nhưng `main` có thể đã đi tiếp, và khi đó `git diff main` sẽ đếm cả những thay đổi của người khác.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/auth.spec.ts
git commit -m "test(fe): extend the e2e journey through the trade lifecycle

Bước 13 và 14 là phần MSW mù: lũy kế do backend thật tính lại trên toàn
dãy, và lọc không được đụng vào nó."
```

- [ ] **Step 8: Kết thúc nhánh**

**REQUIRED SUB-SKILL:** dùng `superpowers:finishing-a-development-branch`.

Nhánh gốc là `main`. Chạy lại cổng trên cây sắp gộp, trình ba lựa chọn, rồi **chờ** quyết định của người dùng.

---

## Bảng tra: 11 bất biến và chỗ falsify chúng

| # | bất biến | task | bước |
|---|---|---|---|
| 1 | mutation invalidate cả ba nhánh | 3, 13 | 3.7, 3.8, 13.4 |
| 2 | `entered_at` đổi theo tz account | 1, 10 | 1.6, 10.5 |
| 3 | hiển thị theo tz account | 1, 7 | 1.7, 7.7 |
| 4 | giờ không tồn tại dịch tới | 1 | 1.8 |
| 5 | bộ lọc nằm trên URL | 11 | 11.7 |
| 6 | PATCH chỉ gửi trường đã đổi | 10 | 10.6 |
| 7 | `score_total: null` ra `—` | 7 | 7.5 |
| 8 | tiền so bằng `compareDecimal` | 7 | 7.6 |
| 9 | enum lấy từ `/meta/enums` | 6, 9 | 6.3, 9.5 |
| 10 | thùng rác không bịa trường suy diễn | 12 | 12.6 |
| 11 | 4 polyfill Radix trong `setup.ts` | 4 | 4.8 |

## Những chỗ đã đo trước, đừng đo lại

Bốn điều dưới đây đã kiểm bằng thực nghiệm khi viết plan. Nếu gặp kết quả khác, nghĩa là môi trường đã đổi — dừng lại và báo, đừng lặng lẽ đi vòng.

- `typeof globalThis.Temporal` ra `undefined` trong Node 22. Đó là lý do dùng dayjs.
- `import dayjs from "dayjs"` biên dịch được dưới `verbatimModuleSyntax` + `moduleResolution: "bundler"`, dù dayjs là CJS dùng `export =` và `esModuleInterop` đang tắt.
- Radix Select cần **đúng bốn** polyfill; `ResizeObserver` cũng thiếu trong jsdom nhưng Select không dùng tới.
- `<label htmlFor>` gắn được vào `SelectTrigger` vì trigger là `<button>`, một thẻ gắn nhãn được — nên `getByLabelText` tìm ra nó.
