# Replay: cảm giác chart và phím vẽ theo TradingView (K-56 + K-57) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chart trang `/replay` phản hồi chuột và bàn phím giống TradingView ở 9 điểm còn lệch: chú thích OHLC, kéo dọc tự do, crosshair đồng bộ hai chart, nút về nến mới nhất, ⌘Y, Shift ra hình vuông, mũi tên dịch hình, ẩn mọi hình, chuột giữa xoá hình.

**Architecture:** Phần tính toán nằm ở hàm thuần (`lwModel.ts`, `drawings.ts`) và ở `ReplayStore`; `ChartPane.tsx` chỉ nối `lightweight-charts` với các hàm đó. Chuột đi qua `PaneInput` (`interaction.ts`), phím đi qua `useHotkeys.ts` — không thêm lối nghe sự kiện thứ ba. Việc giữa hai chart (crosshair, về nến mới nhất) đi qua kênh pub/sub của store giống `onCandles`, không đi qua React state để khỏi render lại cả trang mỗi lần rê chuột.

**Tech Stack:** React 19, TypeScript, `lightweight-charts` 4.2.3 (ghim, không nâng), Vitest + Testing Library, shadcn/ui (`components/ui`).

**Spec:** Chưa có file spec riêng. Mục "Phạm vi" dưới đây là spec; ở bước BA của quy trình dự án, chép nó thành `docs/roadmap/tickets/K-56.md` (Task 1–4) và `docs/roadmap/tickets/K-57.md` (Task 5–8). Hai thẻ này chưa có trên `docs/roadmap/kanban.md`.

## Phạm vi

Nguồn đối chiếu: chart tradingview.com (NQ1!, 5m) và danh sách phím tắt chính thức `tradingview.com/support/shortcuts` (bản Mac), đọc ngày 2026-11-11.

| # | Thẻ | TradingView | Hiện tại |
|---|---|---|---|
| 1 | K-56 | Chú thích góc trái: O H L C + thay đổi của nến dưới chuột | Chỉ `Giá 30237.17` |
| 2 | K-56 | Crosshair đồng bộ giữa các chart khi chia đôi | Mỗi chart một crosshair |
| 3 | K-56 | Kéo chart lên/xuống tự do, Auto tự tắt | Kéo dọc không tác dụng khi "A" đang bật |
| 4 | K-56 | Nút "về nến mới nhất" khi đã cuộn lùi; ⌥⇧→ | Chỉ có Alt+R (đặt lại cả zoom) |
| 5 | K-57 | Redo: ⌘Y | Chỉ ⌘⇧Z và Ctrl+Y |
| 6 | K-57 | Rectangle + Shift = hình vuông | Shift không tác dụng với hình chữ nhật |
| 7 | K-57 | ← → ↑ ↓ dịch hình đang chọn | → tua replay |
| 8 | K-57 | Ẩn mọi hình vẽ (⌘⌥H) | Chỉ ẩn từng hình |
| 9 | K-57 | Bấm chuột giữa xoá hình | Không có |

**Ngoài phạm vi** (để Backlog): menu chuột phải, volume, chọn nhiều hình, công cụ đo (Shift+click), đường dọc / chữ thập, zoom neo mép phải, Shift ép vuông khi kéo chấm góc của hình đã vẽ.

## Global Constraints

- Code tiếng Anh, comment và tài liệu tiếng Việt (CLAUDE.md quy tắc 9). Tên test viết tiếng Anh.
- Mọi chuỗi hiển thị nằm ở `frontend/src/i18n/strings.ts`, dạng `{ vi, en }`; nội suy MỘT ngoặc `{n}`.
- Không dùng control mặc định của trình duyệt: nút và nút bật/tắt lấy từ `@/components/ui` (`Button`, `Toggle`).
- Màu chỉ qua biến ngữ nghĩa; chữ lãi/lỗ dùng `text-profit` / `text-loss`. Không hardcode hex.
- Giá trong replay là `number` (xem ghi chú đầu `engine/types.ts`); không đụng `features/dashboard/prepare.ts`.
- Widget nằm trên chart phải có thuộc tính `data-pane-widget` để `PaneInput` bỏ qua.
- Không nâng `lightweight-charts`; không gọi API riêng (`_internal_*`) của nó.
- **Không commit, không stage.** Mỗi task dừng ở "test xanh"; chủ dự án tự duyệt và commit.
- Lệnh chạy test một file: `cd frontend && npx vitest run <đường dẫn>`. Toàn bộ: `make test-fe`.

## Review Focus

Năm tình huống dễ hỏng nhất; mỗi dòng đã có test gắn vào task ghi trong ngoặc.

1. Chart chưa có nến nào (mã bắt đầu sau giờ replay, `d.cur < 0`): chú thích không vỡ, không hiện nút "về nến mới nhất" (Task 1, Task 4).
2. Giờ dưới chuột ở chart A không có nến tương ứng ở chart B: không vẽ đường đồng bộ, không ném lỗi (Task 2).
3. Thao tác kéo bị ngắt giữa chừng (`pointercancel`, thả chuột ngoài cửa sổ): trạng thái Auto của trục giá được trả lại đúng, không kẹt ở "tắt" (Task 3).
4. Giữ phím mũi tên (auto-repeat) khi dịch hình: chỉ sinh MỘT bước hoàn tác (Task 6).
5. Đang ẩn mọi hình mà vẽ hình mới hoặc dán hình: hình mới phải thấy được — tự bật hiện lại (Task 7).

## File Structure

| File | Trách nhiệm trong plan này |
|---|---|
| `frontend/src/features/replay/chart/lwModel.ts` | Thêm hàm thuần `legendAt`, `isBehind` |
| `frontend/src/features/replay/chart/lwModel.test.ts` | **Tạo mới** — test hai hàm trên |
| `frontend/src/features/replay/chart/ChartPane.tsx` | Nối crosshair, chú thích OHLC, đường đồng bộ, nút về nến mới nhất, `autoScale` cho `PaneInput` |
| `frontend/src/features/replay/chart/interaction.ts` | Cử chỉ kéo dọc, Shift ra hình vuông, chuột giữa xoá, lọc `hideAll` |
| `frontend/src/features/replay/chart/Overlay.tsx` | Lọc `hideAll` |
| `frontend/src/features/replay/engine/drawings.ts` | Thêm hàm thuần `squarePoint` |
| `frontend/src/features/replay/store/ReplayStore.ts` | Kênh `onCross`/`emitCross`, `scrollLatest`, `nudgeSelected`, `hideAll` |
| `frontend/src/features/replay/components/useHotkeys.ts` | ⌘Y, mũi tên, Ctrl+Alt+H, Alt+Shift+→ |
| `frontend/src/features/replay/components/DrawToolbar.tsx` | Nút bật/tắt "ẩn mọi hình" |
| `frontend/src/i18n/strings.ts` | Chuỗi mới, sửa dòng trợ giúp |
| `frontend/src/features/replay/ReplayPage.test.tsx` | Mở rộng chart giả; test tích hợp |

Chart giả trong `ReplayPage.test.tsx` hiện dùng CHUNG một đối tượng `chart` cho cả hai pane. Các task dưới đây thêm vào đối tượng hoisted sẵn có (cùng chỗ với `priceScale`) những trường sau, và nối chúng vào factory của `vi.mock("lightweight-charts")`:

```ts
crossHandlers: [] as ((p: { time?: number }) => void)[],   // chart.subscribeCrosshairMove đẩy vào; unsubscribeCrosshairMove gỡ ra
logicalRange: null as { from: number; to: number } | null, // timeScale.getVisibleLogicalRange trả về
timeToCoordinate: vi.fn((): number | null => null),        // thay hàm cố định hiện có
scrollToRealTime: vi.fn(),
```

`beforeEach` phải đặt lại: `crossHandlers.length = 0`, `logicalRange = null`, `timeToCoordinate.mockReturnValue(null)`, `scrollToRealTime.mockClear()`.

---

## Phần A — K-56: cảm giác chart

### Task 1: Chú thích OHLC theo nến dưới chuột

**Files:**
- Modify: `frontend/src/features/replay/chart/lwModel.ts`
- Create: `frontend/src/features/replay/chart/lwModel.test.ts`
- Modify: `frontend/src/features/replay/chart/ChartPane.tsx` (effect tạo chart; khối `replay-info-${k}`)
- Modify: `frontend/src/i18n/strings.ts` (xoá `replay.info.price` nếu không còn nơi nào dùng)
- Test: `frontend/src/features/replay/ReplayPage.test.tsx` (dòng 397 đang assert `Giá …`)

**Interfaces:**
- Produces: `legendAt(candles: Candle[], time: number | null): Legend | null` và
  `interface Legend { open: number; high: number; low: number; close: number; change: number; changePct: number; up: boolean }`.
- Produces: state `hoverTime: number | null` trong `ChartPane` (giờ local mở nến dưới chuột) — Task 2 dùng lại cùng một lần `subscribeCrosshairMove`.

- [ ] **Step 1: Viết test fail cho `legendAt`** trong `lwModel.test.ts`

```ts
const C = [
  { time: 100, open: 10, high: 12, low: 9, close: 11 },
  { time: 160, open: 11, high: 15, low: 10, close: 14 },
  { time: 220, open: 14, high: 14.5, low: 12, close: 12.5 },
];

test("legendAt returns the hovered candle with change against the previous close", () => {
  expect(legendAt(C, 160)).toEqual({ open: 11, high: 15, low: 10, close: 14, change: 3, changePct: (3 / 11) * 100, up: true });
});
test("legendAt falls back to the last candle when nothing is hovered or the time is unknown", () => {
  const last = { open: 14, high: 14.5, low: 12, close: 12.5, change: -1.5, changePct: (-1.5 / 14) * 100, up: false };
  expect(legendAt(C, null)).toEqual(last);
  expect(legendAt(C, 999)).toEqual(last);
});
test("legendAt measures the first candle against its own open", () => {
  expect(legendAt(C, 100)).toMatchObject({ change: 1, changePct: 10, up: true });
});
test("legendAt is null for an empty chart", () => {
  expect(legendAt([], null)).toBeNull();
});
```

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd frontend && npx vitest run src/features/replay/chart/lwModel.test.ts`
Expected: FAIL — `legendAt` chưa được export.

- [ ] **Step 3: Cài `legendAt` trong `lwModel.ts`**

Quy tắc: `up = close >= open`; `change = close − close của nến liền trước` (nến đầu: `close − open`); `changePct = change / mốc × 100` với mốc là số bị trừ. Tìm nến theo `time` bằng tìm nhị phân (mảng đã xếp tăng dần).

- [ ] **Step 4: Chạy, xác nhận pass** (cùng lệnh Step 2). Expected: 4 passed.

- [ ] **Step 5: Viết test fail ở `ReplayPage.test.tsx`**

Mở rộng chart giả với `crossHandlers` (xem File Structure). Thêm test, và sửa dòng 397 từ `Giá ${late.C[0].toFixed(2)}` thành `C ${late.C[0].toFixed(2)}`:

```ts
test("the legend shows O H L C of the hovered candle and returns to the last candle on leave", async () => {
  const { store } = setup(); // nếu setup() chưa trả store thì cho nó trả về
  const cs = store.candles[0];
  const hovered = cs[cs.length - 5];
  const last = cs[cs.length - 1];
  act(() => hoisted.crossHandlers[0]({ time: hovered.time }));
  const info = screen.getByTestId("replay-info-0");
  expect(info).toHaveTextContent(`O ${hovered.open.toFixed(2)}`);
  expect(info).toHaveTextContent(`C ${hovered.close.toFixed(2)}`);
  act(() => hoisted.crossHandlers[0]({}));
  expect(info).toHaveTextContent(`C ${last.close.toFixed(2)}`);
});
```

- [ ] **Step 6: Chạy, xác nhận fail.** Run: `cd frontend && npx vitest run src/features/replay/ReplayPage.test.tsx`

- [ ] **Step 7: Nối vào `ChartPane.tsx`**

Trong effect tạo chart: `chart.subscribeCrosshairMove((p) => setHoverTime(typeof p.time === "number" ? p.time : null))`, gỡ ở cleanup. Thay cụm `Giá <b>…</b>` bằng kết quả `legendAt(store.candles[k], hoverTime)`, định dạng:

`O 11.00 H 15.00 L 10.00 C 14.00 +3.00 (+27.27%)`

- Số chữ số thập phân của O/H/L/C và `change` lấy từ `style.precision`; phần trăm luôn 2 chữ số; số dương có dấu `+`.
- Chữ cái O/H/L/C: `opacity-70`. Giá trị và phần thay đổi: `text-profit` khi `up`, ngược lại `text-loss`; giữ class `num`.
- `legendAt` trả `null` thì hiện `—` như cũ.
- Giữ nguyên `data-testid`, mã + khung, P&L mở, `maxWidth` chặn ở vùng vẽ.

- [ ] **Step 8: Chạy, xác nhận pass** (lệnh Step 6) rồi `cd frontend && npx tsc --noEmit`.

---

### Task 2: Crosshair đồng bộ giữa hai chart

**Files:**
- Modify: `frontend/src/features/replay/store/ReplayStore.ts` (cạnh `onCandles`, dòng ~203)
- Modify: `frontend/src/features/replay/chart/ChartPane.tsx`
- Test: `frontend/src/features/replay/store/ReplayStore.test.ts`, `frontend/src/features/replay/ReplayPage.test.tsx`

**Interfaces:**
- Consumes: lần `subscribeCrosshairMove` của Task 1.
- Produces (store):
  `export type CrossEvent = { pane: PaneIndex; t: number } | null;` — `t` là giờ local mở nến dưới chuột (giây); `null` = chuột rời chart.
  `onCross(fn: (e: CrossEvent) => void): () => void` và `emitCross(e: CrossEvent): void`.

- [ ] **Step 1: Test fail ở `ReplayStore.test.ts`**

```ts
test("onCross delivers crosshair events until unsubscribed", () => {
  const store = newStore(); // helper tạo store sẵn có của file test
  const seen: CrossEvent[] = [];
  const off = store.onCross((e) => seen.push(e));
  store.emitCross({ pane: 0, t: 1234 });
  store.emitCross(null);
  off();
  store.emitCross({ pane: 1, t: 1 });
  expect(seen).toEqual([{ pane: 0, t: 1234 }, null]);
});
```

- [ ] **Step 2: Chạy, xác nhận fail.** Run: `cd frontend && npx vitest run src/features/replay/store/ReplayStore.test.ts`

- [ ] **Step 3: Cài `onCross` / `emitCross`** — một `Set` listener riêng, không gọi `this.set()` (không được làm các selector của React chạy lại).

- [ ] **Step 4: Chạy, xác nhận pass.**

- [ ] **Step 5: Test fail ở `ReplayPage.test.tsx`**

```ts
test("hovering one chart draws a synced vertical line on the other chart only", () => {
  const { store } = setup(); // phiên mặc định của test mở hai chart
  const t = store.candles[0][store.candles[0].length - 5].time;
  hoisted.timeToCoordinate.mockReturnValue(321);
  act(() => hoisted.crossHandlers[0]({ time: t }));
  expect(screen.getByTestId("replay-xsync-1")).toHaveStyle({ left: "321px" });
  expect(screen.queryByTestId("replay-xsync-0")).toBeNull();
  act(() => hoisted.crossHandlers[0]({}));
  expect(screen.queryByTestId("replay-xsync-1")).toBeNull();
});

test("no synced line when the other chart has no candle at that time", () => {
  const { store } = setup();
  hoisted.timeToCoordinate.mockReturnValue(null);
  act(() => hoisted.crossHandlers[0]({ time: store.candles[0][0].time }));
  expect(screen.queryByTestId("replay-xsync-1")).toBeNull();
});
```

`crossHandlers[0]` là handler của pane 0 vì pane 0 mount trước; nếu thứ tự khác, sửa chart giả để ghi kèm chỉ số pane.

- [ ] **Step 6: Chạy, xác nhận fail.**

- [ ] **Step 7: Nối vào `ChartPane.tsx`**

- Handler crosshair của Task 1 gọi thêm `store.emitCross(time == null ? null : { pane: k, t: time })`.
- Pane đăng ký `store.onCross`: sự kiện từ pane KHÁC thì `setSyncT(e.t)`, sự kiện `null` hoặc từ chính nó thì `setSyncT(null)`.
- Lúc render (không lưu x vào state, để cuộn chart thì đường vẫn đúng chỗ): `x = timeScale.timeToCoordinate(bucketOf(syncT, pane.tf, zone))`. Vẽ khi `layout === 2`, `proj` có, `x != null` và `0 <= x <= proj.plotW`:

```tsx
<div data-testid={`replay-xsync-${k}`} className="pointer-events-none absolute top-0 z-[4] border-l border-dashed"
     style={{ left: x, height: proj.plotH, borderColor: resolveColor(style.crosshair) }} />
```

Chỉ đồng bộ đường dọc (thời gian). Giá hai mã khác nhau nên không đồng bộ đường ngang — TradingView cũng vậy.

- [ ] **Step 8: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

### Task 3: Kéo dọc tự do khi Auto đang bật

**Files:**
- Modify: `frontend/src/features/replay/chart/interaction.ts` (`PaneEnv`, `down`, `move`, `up`, `attach`)
- Modify: `frontend/src/features/replay/chart/ChartPane.tsx` (chỗ `new PaneInput({...})`)
- Test: `frontend/src/features/replay/chart/interaction.test.ts`

**Bối cảnh bắt buộc phải biết** (đã kiểm trong mã nguồn `lightweight-charts` 4.2.3):
`PriceScale.startScroll`, `scrollTo` và `endScroll` đều `return` ngay khi `autoScale` đang bật. Hệ quả:
(a) muốn kéo dọc được thì `autoScale` phải tắt TRƯỚC lần di chuột đầu tiên của thư viện;
(b) nếu `autoScale` đang bật lúc thư viện nhận `mouseup`, điểm bắt đầu cuộn KHÔNG được xoá, và lần kéo sau sẽ nhảy giá. Vì vậy mọi cử chỉ phải kết thúc với `autoScale` tắt, rồi mới bật lại sau `mouseup`. `pointerup` luôn tới trước `mouseup`, nên bật lại bằng `setTimeout(…, 0)`.

**Interfaces:**
- Produces (thêm vào `PaneEnv`): `autoScale(): boolean` và `setAutoScale(on: boolean): void`.
- Produces: hằng `PAN_SLOP = 6` (px) trong `interaction.ts`.

- [ ] **Step 1: Test fail ở `interaction.test.ts`**

Cho `setup()` nhận thêm trạng thái trục giá và trả ra: `let auto = true; const calls: boolean[] = [];` truyền vào `PaneInput` `autoScale: () => auto, setAutoScale: (on) => { auto = on; calls.push(on); }`; trả thêm `calls`, `isAuto: () => auto`, `setAuto: (v: boolean) => { auto = v; }`. Điểm (400, 400) là chỗ trống (tia ngang của setup nằm ở y = 200).

```ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("a vertical drag on empty chart turns auto-scale off and leaves it off", () => {
  const { input, ev, calls, isAuto } = setup();
  input.down(ev(400, 400));
  input.move(ev(402, 420));
  input.up(ev(402, 420));
  vi.runAllTimers();
  expect(calls).toEqual([false]);
  expect(isAuto()).toBe(false);
});

test("a horizontal drag gives auto-scale back during the drag and ends with it on", () => {
  const { input, ev, calls, isAuto } = setup();
  input.down(ev(400, 400));
  input.move(ev(430, 402));
  expect(calls).toEqual([false, true]);
  input.up(ev(430, 402));
  expect(calls).toEqual([false, true, false]); // tắt để thư viện dọn điểm cuộn ở mouseup
  vi.runAllTimers();
  expect(calls).toEqual([false, true, false, true]);
  expect(isAuto()).toBe(true);
});

test("a click without dragging restores auto-scale", () => {
  const { input, ev, isAuto } = setup();
  input.down(ev(400, 400));
  input.up(ev(400, 400));
  vi.runAllTimers();
  expect(isAuto()).toBe(true);
});

test("a cancelled drag restores auto-scale", () => {
  const { input, ev, isAuto } = setup();
  input.down(ev(400, 400));
  input.cancel(ev(401, 401));
  vi.runAllTimers();
  expect(isAuto()).toBe(true);
});

test("auto-scale is not touched when it is already off, or when the press lands on a drawing", () => {
  const a = setup();
  a.setAuto(false);
  a.input.down(a.ev(400, 400)); a.input.move(a.ev(400, 440)); a.input.up(a.ev(400, 440));
  const b = setup();
  b.input.down(b.ev(600, 200)); b.input.up(b.ev(600, 200)); // (600, 200) nằm trên tia ngang
  vi.runAllTimers();
  expect(a.calls).toEqual([]);
  expect(b.calls).toEqual([]);
});
```

- [ ] **Step 2: Chạy, xác nhận fail.** Run: `cd frontend && npx vitest run src/features/replay/chart/interaction.test.ts`

- [ ] **Step 3: Cài cử chỉ kéo trong `PaneInput`**

Thuật toán (đây là phần chữ ký và test không tự suy ra được):

```ts
private pan: { x0: number; y0: number; intent: "none" | "horizontal" | "vertical" } | null = null;

// down(): ở CUỐI hàm — sau khi mọi nhánh công cụ / đường lệnh / hình vẽ đã không nhận cú nhấn:
if (x <= proj.plotW && y <= proj.plotH && e.pointerType !== "touch" && this.env.autoScale()) {
  this.env.setAutoScale(false);
  this.pan = { x0: x, y0: y, intent: "none" };
}

// move(): trước các nhánh khác
if (this.pan?.intent === "none") {
  const dx = Math.abs(x - this.pan.x0), dy = Math.abs(y - this.pan.y0);
  if (Math.hypot(dx, dy) >= PAN_SLOP) {
    this.pan.intent = dy > dx ? "vertical" : "horizontal";
    if (this.pan.intent === "horizontal") this.env.setAutoScale(true); // như cũ: trục giá tự khớp khi cuộn ngang
  }
}

// up() và cancel(): 
const pan = this.pan; this.pan = null;
if (pan && pan.intent !== "vertical") {
  if (pan.intent === "horizontal") this.env.setAutoScale(false);
  setTimeout(() => this.env.setAutoScale(true), 0);
}
```

Thêm `cancel(e: PointerEvent)` công khai, đăng ký `pointercancel` trên `window` trong `attach()`; nó chạy đúng đoạn `pan` ở trên và dọn `drag` / `ddrag` như `up()`.

- [ ] **Step 4: Nối `ChartPane.tsx`**: `autoScale: () => lwRef.current?.chart.priceScale("right").options().autoScale ?? true`, `setAutoScale: (on) => lwRef.current?.chart.priceScale("right").applyOptions({ autoScale: on })`. Nút "A" đã tự đọc lại trạng thái mỗi khung hình nên không cần sửa.

- [ ] **Step 5: Chạy, xác nhận pass** (lệnh Step 2); `npx tsc --noEmit`.

---

### Task 4: Nút "về nến mới nhất" và Alt+Shift+→

**Files:**
- Modify: `frontend/src/features/replay/chart/lwModel.ts`, `lwModel.test.ts`
- Modify: `frontend/src/features/replay/store/ReplayStore.ts` (`CandleEvent` dòng 119; cạnh `fitCharts` dòng ~743)
- Modify: `frontend/src/features/replay/chart/ChartPane.tsx` (handler `onCandles`; vòng rAF; JSX)
- Modify: `frontend/src/features/replay/components/useHotkeys.ts` (khối `e.altKey && !mod`)
- Modify: `frontend/src/i18n/strings.ts`
- Test: `lwModel.test.ts`, `ReplayPage.test.tsx`

**Interfaces:**
- Produces: `isBehind(range: { from: number; to: number } | null, n: number): boolean`.
- Produces: `CandleEvent` thêm nhánh `{ kind: "latest" }`; `store.scrollLatest(): void` phát nó tới mọi pane đang hiện (`this.visible()`).
- Produces: chuỗi `"replay.scale.latest": { vi: "Về nến mới nhất (Alt+Shift+→)", en: "Scroll to the latest bar (Alt+Shift+→)" }`.

- [ ] **Step 1: Test fail cho `isBehind`**

```ts
test("isBehind is true only when the last candle is right of the visible range", () => {
  expect(isBehind(null, 100)).toBe(false);
  expect(isBehind({ from: 0, to: 50 }, 0)).toBe(false);
  expect(isBehind({ from: 0, to: 98.5 }, 100)).toBe(true);
  expect(isBehind({ from: 0, to: 99 }, 100)).toBe(false);
  expect(isBehind({ from: 0, to: 120 }, 100)).toBe(false);
});
```

- [ ] **Step 2: Chạy fail → cài (`range != null && n > 0 && range.to < n - 1`) → chạy pass.**

- [ ] **Step 3: Test fail ở `ReplayPage.test.tsx`**

```ts
test("the latest-bar button appears once the last candle is scrolled out of view and scrolls back", async () => {
  setup();
  expect(screen.queryByTestId("replay-latest-0")).toBeNull();
  hoisted.logicalRange = { from: 0, to: 10 };
  await userEvent.click(await screen.findByTestId("replay-latest-0"));
  expect(hoisted.scrollToRealTime).toHaveBeenCalled();
});

test("Alt+Shift+ArrowRight scrolls to the latest bar and does not step the replay", async () => {
  const { store } = setup();
  const before = store.getState().now;
  await userEvent.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");
  expect(hoisted.scrollToRealTime).toHaveBeenCalled();
  expect(store.getState().now).toBe(before);
});
```

- [ ] **Step 4: Chạy, xác nhận fail.**

- [ ] **Step 5: Cài**

- Handler `onCandles` trong `ChartPane` hiện coi mọi thứ không phải `reset` là `update`: đổi thành rẽ nhánh tường minh theo `e.kind`; `latest` gọi `chart.timeScale().scrollToRealTime()`.
- Vòng rAF sẵn có: `setBehind(isBehind(ts.getVisibleLogicalRange(), cs.length))`.
- Nút: `Button` của `components/ui` (`variant="outline"`, `size="icon-sm"`), icon `ChevronsRightIcon` của lucide, `data-pane-widget`, `data-testid={`replay-latest-${k}`}`, `aria-label` và `title` = `t("replay.scale.latest")`; đặt `left: proj.plotW - 40`, `top: proj.plotH - 40`, `z-[5]`. Hiện khi `behind && proj`.
- `useHotkeys`: trong khối `e.altKey && !mod && store.hasData`, thêm `e.code === "ArrowRight" && e.shiftKey` → `preventDefault()` rồi `return store.scrollLatest()`. Phải `return`, nếu không phím rơi xuống nhánh `ArrowRight` và tua replay.

- [ ] **Step 6: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

## Phần B — K-57: phím khi vẽ

### Task 5: ⌘Y làm lại; Shift khi vẽ hình chữ nhật ra hình vuông

**Files:**
- Modify: `frontend/src/features/replay/components/useHotkeys.ts` (nhánh `KeyY`)
- Modify: `frontend/src/features/replay/engine/drawings.ts`
- Modify: `frontend/src/features/replay/chart/interaction.ts` (`draftMove`, `draftPress`)
- Test: `ReplayPage.test.tsx`, `interaction.test.ts`

**Interfaces:**
- Produces: `squarePoint(proj: Projector, anchor: Pt, x: number, y: number): Pt | null` — điểm đối diện `anchor` sao cho hình là vuông theo PIXEL, cạnh bằng cạnh dài hơn trong hai cạnh `|dx|`, `|dy|`, giữ đúng hướng của chuột. `null` khi `anchor` hoặc điểm kết quả không đổi được toạ độ.

- [ ] **Step 1: Test fail**

`ReplayPage.test.tsx`:

```ts
test("⌘Y redoes what ⌘Z undid", async () => {
  const { store } = setup();
  store.addHLine("DEMO US100", 20000);
  await userEvent.keyboard("{Meta>}z{/Meta}");
  expect(store.getState().hlines).toHaveLength(0);
  await userEvent.keyboard("{Meta>}y{/Meta}");
  expect(store.getState().hlines).toHaveLength(1);
});
```

`interaction.test.ts` (projector của setup: mỗi nến 10px, `yToPrice(y) = (1000 − y) × 25`):

```ts
test("holding Shift while drawing a rectangle makes it a square in pixels", () => {
  const { store, input, ev } = setup();
  store.setMagnet(false);
  store.setTool("rect");
  const shift = (x: number, y: number) => ({ ...ev(x, y), shiftKey: true }) as PointerEvent;
  input.down(shift(300, 300));
  input.move(shift(360, 330)); // dx = 60, dy = 30 → cạnh 60 → góc đối diện (360, 360)
  input.up(shift(360, 330));
  const c = store.candles[0];
  const rect = store.getState().drawings.find((d) => d.type === "rect")!;
  expect(rect.pts[0]).toEqual({ t: c[c.length - 20].time, p: 17500 });
  expect(rect.pts[1]).toEqual({ t: c[c.length - 14].time, p: 16000 });
});
```

- [ ] **Step 2: Chạy, xác nhận cả hai fail.**

- [ ] **Step 3: Cài**

- `useHotkeys`: điều kiện redo thành `mod && !e.altKey && !e.shiftKey && e.code === "KeyY"` (trước đây loại ⌘).
- `squarePoint` trong `drawings.ts`.
- `interaction.ts`: gom việc chọn điểm của hình đang vẽ vào một hàm riêng `draftPoint(d, x, y, e, proj)` dùng ở cả `draftMove` và nhánh `dr.wait` của `draftPress`: `rect` + Shift → `squarePoint(proj, d.pts[0], x, y)`; còn lại giữ `pickPoint(...)` như cũ. Shift thắng nam châm, giống `pickPoint`. Handler `remod` sẵn có đã áp lại khi nhấn/nhả Shift.

- [ ] **Step 4: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

### Task 6: Phím mũi tên dịch hình đang chọn

**Files:**
- Modify: `frontend/src/features/replay/store/ReplayStore.ts` (cạnh `updateDrawing`, dòng ~989)
- Modify: `frontend/src/features/replay/components/useHotkeys.ts` (trước nhánh `ArrowRight`)
- Test: `ReplayStore.test.ts`, `ReplayPage.test.tsx`

**Interfaces:**
- Produces: `nudgeSelected(dBars: number, dTicks: number, opts?: { undo?: boolean }): boolean`
  - Trả `false` khi không có hình nào đang chọn (phím đi tiếp cho replay); `true` khi có — kể cả lúc không dịch được.
  - Dịch mọi điểm: thời gian đi `dBars` nến của khung đang xem, qua `timeToLogical` / `logicalToTime` (`engine/projector.ts`) để vượt đúng khoảng nghỉ cuối tuần; điểm không quy đổi được thì giữ nguyên `t`. Giá cộng `dTicks × TICK` (`TICK = 0.25`, `engine/trading.ts`).
  - Nến lấy từ pane đang chọn nếu nó đang xem mã của hình; không thì pane còn lại đang hiện có cùng mã; không pane nào thì không dịch.
  - Không dịch: hình `locked`, chữ đã ghim (`anchor`).
  - `opts.undo !== false` thì `pushUndo()` trước khi sửa. Luôn `scheduleSave()`.

- [ ] **Step 1: Test fail ở `ReplayStore.test.ts`**

```ts
test("nudgeSelected moves the selected drawing by one bar and one tick, with one undo step per call", () => {
  const store = openedStore(); // phiên DEMO US100 / DEMO US500 như interaction.test.ts
  const c = store.candles[0];
  const ray = store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] });
  expect(store.nudgeSelected(1, 0)).toBe(true);
  expect(store.nudgeSelected(0, 1)).toBe(true);
  expect(store.getState().drawings[0].pts[0]).toEqual({ t: c[c.length - 29].time, p: 20000.25 });
  store.undo(); store.undo();
  expect(store.getState().drawings[0].pts).toEqual(ray.pts);
});

test("nudgeSelected with undo:false adds no undo step (key auto-repeat)", () => {
  const store = openedStore();
  const c = store.candles[0];
  const ray = store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] });
  store.nudgeSelected(0, 1);
  store.nudgeSelected(0, 1, { undo: false });
  store.nudgeSelected(0, 1, { undo: false });
  store.undo();
  expect(store.getState().drawings[0].pts).toEqual(ray.pts);
});

test("nudgeSelected reports false with nothing selected, and leaves a locked drawing in place", () => {
  const store = openedStore();
  const c = store.candles[0];
  expect(store.nudgeSelected(1, 0)).toBe(false);
  const ray = store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }], locked: true });
  expect(store.nudgeSelected(1, 0)).toBe(true);
  expect(store.getState().drawings[0].pts).toEqual(ray.pts);
});
```

- [ ] **Step 2: Chạy fail → cài `nudgeSelected` → chạy pass.**

- [ ] **Step 3: Test fail ở `ReplayPage.test.tsx`**

```ts
test("arrow keys nudge the selected drawing instead of stepping the replay; without a selection → steps", async () => {
  const { store } = setup();
  const c = store.candles[0];
  store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] }); // addDrawing tự chọn hình mới
  const before = store.getState().now;
  await userEvent.keyboard("{ArrowUp}{ArrowRight}");
  expect(store.getState().now).toBe(before);
  expect(store.getState().drawings[0].pts[0].p).toBe(20000.25);
  act(() => store.select(null));
  await userEvent.keyboard("{ArrowRight}");
  expect(store.getState().now).not.toBe(before);
});
```

- [ ] **Step 4: Chạy fail → cài trong `useHotkeys`**

Trước nhánh `ArrowRight` hiện có: khi `plain && !e.shiftKey && st.selected != null` và phím là một trong bốn mũi tên → `preventDefault()`, gọi `store.nudgeSelected(dBars, dTicks, { undo: !e.repeat })` với ← = (−1, 0), → = (1, 0), ↑ = (0, 1), ↓ = (0, −1), rồi `return`. Shift+→ giữ nguyên nghĩa cũ (`nextCandle`).

- [ ] **Step 5: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

### Task 7: Ẩn / hiện mọi hình vẽ

**Files:**
- Modify: `frontend/src/features/replay/store/ReplayStore.ts` (`ReplayState`, state khởi tạo dòng ~185 và ~306, `setTool`, `setDrawMode`, `addDrawing`)
- Modify: `frontend/src/features/replay/chart/Overlay.tsx:60`, `chart/interaction.ts` (`mine()`), `chart/ChartPane.tsx` (lời gọi `priceLines`)
- Modify: `frontend/src/features/replay/components/DrawToolbar.tsx`, `components/useHotkeys.ts`
- Modify: `frontend/src/i18n/strings.ts`
- Test: `ReplayStore.test.ts`, `ReplayPage.test.tsx`

**Interfaces:**
- Produces: `ReplayState.hideAll: boolean` (mặc định `false`; KHÔNG lưu vào phiên, KHÔNG vào lịch sử hoàn tác) và `toggleHideAll(): void` (bật thì đặt luôn `selected: null`).
- Produces: chuỗi `"replay.tools.hideAll": { vi: "Ẩn mọi hình vẽ (Ctrl+Alt+H)", en: "Hide all drawings (Ctrl+Alt+H)" }`.

Vì sao nhãn ghi Ctrl+Alt+H chứ không phải ⌘⌥H như TradingView: trên macOS, ⌘⌥H là phím "Hide Others" của hệ điều hành, trình duyệt không bao giờ nhận được. Nhánh phím dùng `mod` (Ctrl hoặc ⌘) nên Ctrl+⌥+H chạy trên Mac, Ctrl+Alt+H chạy trên Windows/Linux.

- [ ] **Step 1: Test fail ở `ReplayStore.test.ts`**

```ts
test("toggleHideAll flips the flag, clears the selection, and keeps drawings and undo history untouched", () => {
  const store = openedStore();
  const c = store.candles[0];
  const ray = store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] });
  store.toggleHideAll();
  expect(store.getState()).toMatchObject({ hideAll: true, selected: null });
  expect(store.getState().drawings).toEqual([ray]);
  store.toggleHideAll();
  expect(store.getState().hideAll).toBe(false);
  store.undo(); // bước hoàn tác duy nhất vẫn là việc thêm tia
  expect(store.getState().drawings).toEqual([]);
});

test("starting a tool, the horizontal-line mode, or adding a drawing shows everything again", () => {
  const store = openedStore();
  const c = store.candles[0];
  store.toggleHideAll(); store.setTool("trend");
  expect(store.getState().hideAll).toBe(false);
  store.toggleHideAll(); store.setDrawMode(true);
  expect(store.getState().hideAll).toBe(false);
  store.toggleHideAll(); store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] });
  expect(store.getState().hideAll).toBe(false);
});
```

- [ ] **Step 2: Chạy fail → cài phần store → chạy pass.** (`setTool(null)` và `setDrawMode(false)` không đụng `hideAll`.)

- [ ] **Step 3: Test fail ở `ReplayPage.test.tsx`**

```ts
test("Ctrl+Alt+H and the toolbar toggle hide every drawing; Alt+H alone still starts a horizontal line", async () => {
  const { store } = setup();
  await userEvent.keyboard("{Control>}{Alt>}h{/Alt}{/Control}");
  expect(store.getState().hideAll).toBe(true);
  expect(store.getState().drawMode).toBe(false);
  const toggle = screen.getByTestId("replay-hide-all");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(toggle);
  expect(store.getState().hideAll).toBe(false);
  await userEvent.keyboard("{Alt>}h{/Alt}");
  expect(store.getState().drawMode).toBe(true);
});
```

Thêm vào `interaction.test.ts`:

```ts
test("a hidden-all chart ignores presses on where a drawing would be", () => {
  const { store, input, ev } = setup();
  store.toggleHideAll();
  input.down(ev(600, 200)); input.up(ev(600, 200));
  expect(store.getState().selected).toBeNull();
});
```

- [ ] **Step 4: Chạy fail → cài phần hiển thị**

- `Overlay.tsx:60`: `items` rỗng khi `hideAll`. `interaction.ts` `mine()`: trả `[]` khi `hideAll`. `ChartPane`: truyền `hideAll ? [] : hlines` vào `priceLines` (đường vào lệnh / SL / TP / lệnh chờ KHÔNG bị ẩn).
- `DrawToolbar`: thêm `Toggle` (cùng class `TOOL` như nút nam châm), icon `EyeOffIcon`, `pressed={hideAll}`, `data-testid="replay-hide-all"`, `aria-label` / `title` = `t("replay.tools.hideAll")`, đặt ngay sau nút nam châm.
- `useHotkeys`: nhánh mới `mod && e.altKey && !e.shiftKey && e.code === "KeyH"` → `preventDefault()`, `return store.toggleHideAll()`. Nhánh Alt+H cũ đòi `!mod` nên không đụng nhau.

- [ ] **Step 5: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

### Task 8: Bấm chuột giữa xoá hình

**Files:**
- Modify: `frontend/src/features/replay/chart/interaction.ts` (`down`, quanh dòng `e.button !== 0`)
- Test: `frontend/src/features/replay/chart/interaction.test.ts`

**Interfaces:**
- Consumes: `store.select`, `store.deleteSelected` (đã tự `pushUndo`).

- [ ] **Step 1: Test fail**

```ts
test("a middle click on a drawing deletes it in one undoable step; a locked drawing stays", () => {
  const { store, ray, input, ev } = setup();
  const mid = (x: number, y: number) => ({ ...ev(x, y), button: 1 }) as PointerEvent;
  input.down(mid(600, 200));
  expect(store.getState().drawings).toEqual([]);
  store.undo();
  expect(store.getState().drawings).toEqual([ray]);
  store.updateDrawing(ray.id, { locked: true });
  input.down(mid(600, 200));
  expect(store.getState().drawings).toHaveLength(1);
});

test("a middle click on empty chart, or while a tool is active, does nothing", () => {
  const { store, input, ev } = setup();
  const mid = (x: number, y: number) => ({ ...ev(x, y), button: 1 }) as PointerEvent;
  input.down(mid(400, 400));
  store.setTool("trend");
  input.down(mid(600, 200));
  expect(store.getState().drawings).toHaveLength(1);
  expect(store.getState().draft).toBeNull();
});
```

- [ ] **Step 2: Chạy, xác nhận fail.**

- [ ] **Step 3: Cài trong `down()`**

Trước dòng `if (!store.hasData || e.button !== 0) return;` thêm nhánh `e.button === 1`: chỉ xét khi không có `tool`, `draft`, `selectMode`, `drawMode`; `hitDrawing(this.mine(), st.selected, proj, x, y)` trúng thì `preventDefault()` + `stopPropagation()` (chặn cuộn tự động của trình duyệt), và nếu hình không `locked` thì `store.select(id)` rồi `store.deleteSelected()`. Mọi trường hợp chuột giữa đều `return` sau đó.

- [ ] **Step 4: Chạy, xác nhận pass**; `npx tsc --noEmit`.

---

### Task 9: Dòng trợ giúp, chạy toàn bộ test, kiểm tay trên trình duyệt thật

**Files:**
- Modify: `frontend/src/i18n/strings.ts` (`replay.help.keys` dòng ~1262, `replay.help.draw` dòng ~1264)

- [ ] **Step 1: Sửa hai dòng trợ giúp** (chèn trước dấu chấm cuối, cả `vi` và `en`)

- `replay.help.keys` — vi: ` · Alt+Shift+→ về nến mới nhất · ← → ↑ ↓ dịch hình đang chọn (1 nến / 1 tick)`; en: ` · Alt+Shift+→ latest bar · ← → ↑ ↓ nudge the selected drawing (1 bar / 1 tick)`.
- `replay.help.draw` — vi: ` · Shift khi vẽ hình chữ nhật ra hình vuông · Ctrl+Alt+H ẩn/hiện mọi hình · bấm chuột giữa để xoá hình · ⌘/Ctrl+Y làm lại`; en: ` · Shift while drawing a rectangle makes a square · Ctrl+Alt+H hide/show all drawings · middle-click deletes a drawing · ⌘/Ctrl+Y redo`.

- [ ] **Step 2: Chạy toàn bộ kiểm tra frontend**

Run: `make test-fe`
Expected: `tsc` không lỗi, Vitest toàn bộ xanh (kể cả `src/test/styleguard.test.ts`), `npm run build` xong.

- [ ] **Step 3: Kiểm tay trên trình duyệt thật** — jsdom không chạy được `lightweight-charts`, nên các điểm sau chỉ kiểm được bằng tay. Dựng app (`make up-dev`, hoặc stack e2e cách ly nếu cổng 5432 đang bận), mở `/replay` với data mặc định, hai chart:

| Kiểm | Kết quả mong đợi |
|---|---|
| Rê chuột qua nến | Chú thích đổi O H L C theo nến; rời chart thì về nến cuối |
| Rê chuột ở chart trái | Chart phải có đường dọc đứt ở cùng giờ; không có đường ngang |
| "A" đang bật, kéo chart chéo lên | Chart đi theo chuột cả hai chiều; "A" tắt |
| "A" đang bật, kéo ngang | Trục giá vẫn tự khớp trong lúc kéo; thả ra "A" vẫn bật |
| Kéo ngang, rồi lập tức kéo dọc | Giá KHÔNG nhảy ở đầu lần kéo thứ hai |
| Cuộn lùi quá khứ | Nút » hiện ở góc phải dưới; bấm thì về nến mới nhất, giữ nguyên zoom |
| Vẽ hình chữ nhật, giữ Shift | Hình vuông; nhả Shift thì tự do lại |
| Chọn hình, bấm ← → ↑ ↓ | Hình dịch; giữ phím rồi ⌘Z một lần là về chỗ cũ |
| Ctrl+Alt+H (Mac: Ctrl+⌥+H) | Mọi hình và đường kẻ ngang biến mất, SL/TP còn; bấm lại thì hiện |
| Bấm chuột giữa lên hình | Hình bị xoá; trang không vào chế độ cuộn tự động |

Điểm nào lệch thì quay lại task tương ứng, thêm test tái hiện trước khi sửa.

- [ ] **Step 4: Báo cáo** — liệt kê file đã đổi, kết quả `make test-fe`, kết quả bảng kiểm tay; để mọi thứ trong working tree, không stage, không commit.
