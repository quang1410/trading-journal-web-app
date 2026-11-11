import { isBehind, legendAt } from "./lwModel";

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

test("isBehind is true only when the last candle is right of the visible range", () => {
  expect(isBehind(null, 100)).toBe(false);
  expect(isBehind({ from: 0, to: 50 }, 0)).toBe(false);
  expect(isBehind({ from: 0, to: 98.5 }, 100)).toBe(true);
  expect(isBehind({ from: 0, to: 99 }, 100)).toBe(false);
  expect(isBehind({ from: 0, to: 120 }, 100)).toBe(false);
});
