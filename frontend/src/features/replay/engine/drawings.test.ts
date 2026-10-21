import { bodyHit, draftAnchor, handleAnchor, hitDrawing, magnetPoint, noteAnchor, pickPoint, shiftPoints, type Drawing } from "./drawings";
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

test("a note sits at the right end along the slant, and clicking it hits the line", () => {
  const d: Drawing = { id: 1, sym: "A", type: "trend", pts: [at(0, 800), at(10, 700)], note: "mss", noteSize: 14 };
  const P = d.pts.map((p) => proj.toXY(p)!);
  const a = noteAnchor(d, P, proj.plotW);
  expect(a.x).toBe(200);
  expect(a.ang).toBeCloseTo((Math.atan2(100, 100) * 180) / Math.PI);
  // a point on the text, rotated with the line
  const r = (a.ang * Math.PI) / 180;
  const [u, v] = [-12, -10];
  expect(bodyHit(d, P, a.x + u * Math.cos(r) - v * Math.sin(r), a.y + u * Math.sin(r) + v * Math.cos(r), proj)).toBe(true);
  expect(noteAnchor({ ...d, type: "hray", pts: [at(0, 800)] }, [P[0]], proj.plotW).x).toBe(494);
});

test("moving a whole shape keeps each point's real time", () => {
  const moved = shiftPoints([at(1, 10), at(3, 20)], 2, 5, proj);
  expect(moved).toEqual([at(3, 15), at(5, 25)]);
});
