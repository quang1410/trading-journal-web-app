import { bodyHit, draftAnchor, FIB_DEFAULT_LEVELS, fibLabel, fibLayout, fibLevelsOn, fibPrice, handleAnchor, handlesOf, hitDrawing, magnetPoint, moveHandle, pickPoint, shiftPoints, textPlacement, withDefaults, type Drawing } from "./drawings";
import { logicalToTime, makeProjector, timeToLogical, type Projector } from "./projector";
import type { Candle } from "./types";

// 20 nến 5m, giờ UTC (múi giờ UTC để giờ local = giờ UTC); trục: nến k ở x = 100 + 10k; giá p ở y = 1000 - p
const T0 = Date.UTC(2026, 0, 6, 14, 0) / 1000;
const candles: Candle[] = Array.from({ length: 20 }, (_, k) => ({ time: T0 + k * 300, open: 100 + k, high: 110 + k, low: 95 + k, close: 105 + k }));
const proj: Projector = makeProjector({
  candles, tf: 5, zone: "UTC", axis: { a: 100, sp: 10 }, plotW: 500, plotH: 400,
  priceToY: (p) => 1000 - p, yToPrice: (y) => 1000 - y,
});
const at = (k: number, p: number) => ({ t: T0 + k * 300, p });
const NO = { shift: false, magnet: false };

test("logical index <-> time, interpolated between and outside candles", () => {
  expect(timeToLogical(candles, 5, T0 + 450)).toBe(1.5);
  expect(timeToLogical(candles, 5, T0 - 300)).toBe(-1);
  expect(timeToLogical(candles, 5, T0 + 25 * 300)).toBe(25);
  expect(logicalToTime(candles, 5, 2.5)).toBe(T0 + 750);
  expect(logicalToTime(candles, 5, 30)).toBe(T0 + 30 * 300);
});

test("projector maps (time, price) to pixels and back", () => {
  expect(proj.toXY(at(3, 900))).toEqual({ x: 130, y: 100 });
  expect(proj.fromXY(130, 100)).toEqual(at(3, 900));
  expect(proj.candleAt(134)).toMatchObject({ t: T0 + 900, high: 113 });
});

test("Shift: horizontal keeps the anchor price exactly, vertical keeps its time, otherwise 45°", () => {
  const anchor = at(2, 500);
  const h = pickPoint(proj, 200, 512, { shift: true, magnet: false }, anchor)!;
  expect(h.p).toBe(500);
  expect(h.t).toBe(T0 + 10 * 300);
  const v = pickPoint(proj, 123, 300, { shift: true, magnet: false }, anchor)!;
  expect(v.t).toBe(anchor.t);
  const diag = pickPoint(proj, 160, 450, { shift: true, magnet: false }, anchor)!;
  const xy = proj.toXY(diag)!;
  expect(Math.abs(xy.x - 120)).toBeCloseTo(Math.abs(xy.y - 500), 6);
});

test("magnet snaps to the nearest O/H/L/C of the candle under the mouse", () => {
  // nến 4: open 104 (y 896), high 114 (y 886), low 99 (y 901), close 109 (y 891)
  expect(magnetPoint(proj, 141, 884)).toEqual(at(4, 114));
  expect(pickPoint(proj, 141, 902, { shift: false, magnet: true }, null)).toEqual(at(4, 99));
  expect(pickPoint(proj, 141, 902, NO, null)).toEqual({ t: T0 + 4.1 * 300, p: 98 });
  expect(magnetPoint(proj, 1000, 500)).toBeNull(); // no candle there
});

test("Shift anchors: previous point while drawing, the other end when dragging a handle", () => {
  const trend: Drawing = { id: 1, sym: "A", type: "trend", pts: [at(1, 1), at(2, 2)] };
  expect(draftAnchor(trend)).toEqual(at(1, 1));
  expect(handleAnchor(trend, 0)).toEqual(at(2, 2));
  const path: Drawing = { id: 2, sym: "A", type: "path", pts: [at(1, 1), at(2, 2), at(3, 3)] };
  expect(handleAnchor(path, 0)).toEqual(at(2, 2));
  expect(handleAnchor(path, 2)).toEqual(at(2, 2));
  expect(draftAnchor({ ...trend, type: "rect" })).toBeNull();
});

test("hit testing: line body, handles of the selected shape, rectangles from inside", () => {
  const trend: Drawing = { id: 1, sym: "A", type: "trend", pts: [at(0, 800), at(10, 700)] };
  const rect: Drawing = { id: 2, sym: "A", type: "rect", pts: [at(12, 600), at(16, 500)] };
  expect(hitDrawing([trend, rect], null, proj, 150, 250)).toEqual({ d: trend, k: -1 });
  expect(hitDrawing([trend, rect], 1, proj, 200, 300)).toEqual({ d: trend, k: 1 });
  expect(hitDrawing([trend, rect], null, proj, 250, 450)).toEqual({ d: rect, k: -1 });
  expect(hitDrawing([trend, rect], null, proj, 150, 600)).toBeNull();
});

test("text on a trend line: Top/Center by default, rotated with the line; clicking it hits the line", () => {
  const d: Drawing = { id: 1, sym: "A", type: "trend", pts: [at(0, 800), at(10, 700)], note: "mss", noteSize: 14 };
  const P = d.pts.map((p) => proj.toXY(p)!);
  const tb = textPlacement(d, P, proj.plotW);
  expect(tb).toMatchObject({ x: 150, y: 250, anchor: "middle", base: "auto", off: -4 });
  expect(tb.ang).toBeCloseTo((Math.atan2(100, 100) * 180) / Math.PI);
  // một điểm trên chữ (phía trên đường), xoay theo đường
  const r = (tb.ang * Math.PI) / 180;
  const [u, v] = [3, -10];
  expect(bodyHit(d, P, tb.x + u * Math.cos(r) - v * Math.sin(r), tb.y + u * Math.sin(r) + v * Math.cos(r), proj)).toBe(true);
  expect(textPlacement({ ...d, noteH: "right", noteV: "bottom" }, P, proj.plotW)).toMatchObject({ x: 200, anchor: "end", base: "hanging", off: 4 });
});

test("text on a horizontal ray and a rectangle follows TradingView's defaults", () => {
  const ray: Drawing = { id: 1, sym: "A", type: "hray", pts: [at(0, 800)] };
  // tia ngang: Bottom / Center, giữa đoạn từ gốc tới mép phải
  expect(textPlacement(ray, [{ x: 100, y: 200 }], 500)).toMatchObject({ x: 300, y: 200, base: "hanging" });
  const box: Drawing = { id: 2, sym: "A", type: "rect", pts: [at(0, 800), at(10, 700)] };
  // hình chữ nhật: Inside / Center = tâm hộp
  expect(textPlacement(box, [{ x: 100, y: 200 }, { x: 200, y: 300 }], 500)).toMatchObject({ x: 150, y: 250, base: "middle", anchor: "middle" });
  expect(textPlacement({ ...box, noteV: "top", noteH: "left" }, [{ x: 100, y: 200 }, { x: 200, y: 300 }], 500)).toMatchObject({ x: 104, y: 200, anchor: "start", base: "auto" });
});

test("an extended trend line can be clicked beyond its two points", () => {
  const d: Drawing = { id: 1, sym: "A", type: "trend", pts: [at(5, 800), at(10, 800)] };
  const P = d.pts.map((p) => proj.toXY(p)!);
  expect(bodyHit(d, P, 400, 200, proj)).toBe(false);
  expect(bodyHit({ ...d, extR: true }, P, 400, 200, proj)).toBe(true);
  expect(bodyHit({ ...d, extL: true }, P, 20, 200, proj)).toBe(true);
});

test("a rectangle has 8 handles; each corner / edge moves the matching time and price", () => {
  const d: Drawing = { id: 1, sym: "A", type: "rect", pts: [at(0, 800), at(10, 700)] };
  const P = d.pts.map((p) => proj.toXY(p)!);
  expect(handlesOf(d, P)).toEqual([
    { x: 100, y: 200 }, { x: 200, y: 300 }, { x: 100, y: 300 }, { x: 200, y: 200 },
    { x: 150, y: 200 }, { x: 150, y: 300 }, { x: 100, y: 250 }, { x: 200, y: 250 },
  ]);
  const pt = at(4, 750);
  expect(moveHandle(d, 2, pt)).toEqual([{ t: pt.t, p: 800 }, { t: d.pts[1].t, p: 750 }]); // góc trái dưới
  expect(moveHandle(d, 4, pt)).toEqual([{ t: d.pts[0].t, p: 750 }, d.pts[1]]); // cạnh trên: chỉ đổi giá
  expect(moveHandle(d, 7, pt)).toEqual([d.pts[0], { t: pt.t, p: 700 }]); // cạnh phải: chỉ đổi giờ
  expect(moveHandle({ ...d, type: "trend" }, 1, pt)).toEqual([d.pts[0], pt]);
});

test("moving a whole shape keeps each point's real time", () => {
  const moved = shiftPoints([at(1, 10), at(3, 20)], 2, 5, proj);
  expect(moved).toEqual([at(3, 15), at(5, 25)]);
});

// ---------- Fibonacci thoái lui ----------

const fibAt = (extra: Partial<Drawing> = {}): Drawing => ({ id: 1, sym: "X", type: "fib", pts: [at(2, 100), at(8, 200)], ...extra });

test("fib: level 0 sits on the second point and 1 on the first; Reverse flips them; log scale splits by ratio", () => {
  expect([0, 0.5, 1, 1.618].map((v) => fibPrice(fibAt(), v))).toEqual([200, 150, 100, 200 - 1.618 * 100]);
  expect([0, 1].map((v) => fibPrice(fibAt({ fibReverse: true }), v))).toEqual([100, 200]);
  expect(fibPrice(fibAt({ fibLog: true }), 0.5)).toBeCloseTo(200 * Math.SQRT1_2, 9);
  // giá âm / bằng 0 thì không lấy log được: quay về chia đều
  expect(fibPrice({ ...fibAt({ fibLog: true }), pts: [at(2, 0), at(8, 200)] }, 0.5)).toBe(100);
});

test("fib: TradingView's 24 default levels, 11 switched on, drawn in ratio order", () => {
  expect(FIB_DEFAULT_LEVELS).toHaveLength(24);
  expect(fibLevelsOn(withDefaults(fibAt())).map((l) => l.v)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]);
  const custom = fibAt({ fibLevels: [{ v: 1, color: "red", on: true }, { v: 0.5, color: "red", on: false }, { v: -0.27, color: "red", on: true }] });
  expect(fibLevelsOn(custom).map((l) => l.v)).toEqual([-0.27, 1]);
});

test("fib: the label shows level and price, percent, or only one of them", () => {
  expect(fibLabel(fibAt(), 0.618, 2)).toBe("0.618(138.20)");
  expect(fibLabel(fibAt({ fibValueMode: "percent" }), 0.618, 2)).toBe("61.8%(138.20)");
  expect(fibLabel(fibAt({ fibPrices: false }), 1, 2)).toBe("1");
  expect(fibLabel(fibAt({ fibValues: false }), 0, 1)).toBe("200.0");
  expect(fibLabel(fibAt({ fibValues: false, fibPrices: false }), 0, 2)).toBe("");
});

test("fib: the body covers every level switched on, and the whole width when extended", () => {
  const d = fibAt();
  const P = d.pts.map((q) => proj.toXY(q)!);
  // mức 4.236 nằm ở giá 200 - 4.236 * 100 ≈ -223.6 (y ≈ 1223.6)
  expect(bodyHit(d, P, 150, 1000 + 223.6, proj)).toBe(true);
  expect(bodyHit(fibAt({ fibLevels: [{ v: 0, color: "red", on: true }, { v: 1, color: "red", on: true }] }), P, 150, 1000 + 223.6, proj)).toBe(false);
  expect(bodyHit(d, P, 450, 850, proj)).toBe(false);
  expect(bodyHit(fibAt({ extR: true }), P, 450, 850, proj)).toBe(true);
});

test("fib: the default levels are frozen, so no drawing can change them for the others", () => {
  expect(Object.isFrozen(FIB_DEFAULT_LEVELS)).toBe(true);
  expect(FIB_DEFAULT_LEVELS.every((l) => Object.isFrozen(l))).toBe(true);
  // readonly chỉ là kiểu: thử ghi đè thật lúc chạy để chắc mảng đã đóng băng
  const levels = withDefaults(fibAt()).fibLevels as unknown as { on: boolean }[];
  expect(() => (levels[0].on = false)).toThrow();
});

test("fib: two slots with the same ratio stay two rows with their own slot", () => {
  const d = fibAt({ fibLevels: [{ v: 0.5, color: "red", on: true }, { v: 0.5, color: "blue", on: true }] });
  const g = fibLayout(d, d.pts.map((q) => proj.toXY(q)!), 500, proj.priceToY, 2);
  expect(g.rows.map((r) => [r.slot, r.color])).toEqual([[0, "red"], [1, "blue"]]);
});

test("fib: clicking a label outside the levels also hits the drawing", () => {
  const d = fibAt();
  const P = d.pts.map((q) => proj.toXY(q)!);
  // nhãn mặc định nằm bên trái điểm trái nhất (x = 120), giữa dòng mức 0 (giá 200 → y = 800)
  expect(bodyHit(d, P, 100, 800, proj)).toBe(true);
  // phía trên mức 0, ngoài cả dòng chữ
  expect(bodyHit(d, P, 100, 785, proj)).toBe(false);
  expect(bodyHit(fibAt({ fibValues: false, fibPrices: false }), P, 100, 800, proj)).toBe(false);
});
