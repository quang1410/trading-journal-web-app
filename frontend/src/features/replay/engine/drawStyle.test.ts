import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";
import { defaultVisibility, extendSegment, matchVisPreset, parseColor, TV_PALETTE, trendStats, visibleOnTf, visPreset, withAlpha } from "./drawStyle";

test("the palette is the 10 × 8 TradingView grid, valued in replay.css", () => {
  expect(TV_PALETTE).toHaveLength(80);
  expect(TV_PALETTE[0]).toBe("var(--replay-tv-0)");
  const css = readFileSync(fromFrontend("src/features/replay/replay.css"), "utf8");
  const val = (i: number) => new RegExp(`--replay-tv-${i}:\\s*(#[0-9a-f]{6});`).exec(css)?.[1];
  expect(Array.from({ length: 10 }, (_, i) => val(10 + i))).toEqual(["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"]);
  expect(val(79)).toBe("#880e4f");
});

test("colors split into hex + opacity and back", () => {
  expect(parseColor("#2962FF")).toEqual({ hex: "#2962ff", a: 1 });
  expect(parseColor("rgba(156, 39, 176, 0.2)")).toEqual({ hex: "#9c27b0", a: 0.2 });
  expect(parseColor("#9c27b033")).toEqual({ hex: "#9c27b0", a: 0.2 });
  expect(parseColor("#abc")).toEqual({ hex: "#aabbcc", a: 1 });
  expect(withAlpha("#9c27b0", 0.2)).toBe("rgba(156, 39, 176, 0.2)");
  expect(withAlpha("#9c27b0", 1)).toBe("#9c27b0");
  // độ trong suốt làm tròn tới 1%, như ô % của TradingView
  expect(withAlpha("#000000", 0.123)).toBe("rgba(0, 0, 0, 0.12)");
});

test("visibility: each timeframe family has its own on/off and range", () => {
  const v = defaultVisibility();
  for (const tf of [1, 5, 60, 240, 1440]) expect(visibleOnTf(v, tf)).toBe(true);
  expect(visibleOnTf(undefined, 15)).toBe(true);
  const onlyIntraday = { ...v, min: { on: true, from: 1, to: 15 }, day: { on: false, from: 1, to: 366 } };
  expect(visibleOnTf(onlyIntraday, 5)).toBe(true);
  expect(visibleOnTf(onlyIntraday, 30)).toBe(false);
  expect(visibleOnTf(onlyIntraday, 240)).toBe(true); // 4 giờ nằm trong 1–24 giờ
  expect(visibleOnTf(onlyIntraday, 1440)).toBe(false);
});

test("trend stats: price range, percent, ticks, bars, duration, distance and angle", () => {
  const s = trendStats({ t: 0, p: 7000 }, { t: 3 * 3600, p: 7070 }, { tick: 0.25, tf: 60, dx: 30, dy: -40 });
  expect(s.change).toBe(70);
  expect(s.percent).toBeCloseTo(1);
  expect(s.ticks).toBe(280);
  expect(s.bars).toBe(3);
  expect(s.seconds).toBe(3 * 3600);
  expect(s.distance).toBe(50);
  expect(s.angle).toBeCloseTo(53.13, 1); // lên trên là góc dương
});

test("extending a segment runs it to the plot edges along the same slope", () => {
  const a = { x: 100, y: 100 };
  const b = { x: 200, y: 50 };
  expect(extendSegment(a, b, false, false, 1000)).toEqual([a, b]);
  const [l, r] = extendSegment(a, b, true, true, 1000);
  expect(l).toEqual({ x: 0, y: 150 });
  expect(r).toEqual({ x: 1000, y: -350 });
  // đường dọc: không có hướng ngang để kéo dài
  expect(extendSegment({ x: 5, y: 0 }, { x: 5, y: 9 }, true, true, 1000)).toEqual([{ x: 5, y: 0 }, { x: 5, y: 9 }]);
});

describe("visibility presets of the More menu", () => {
  const row = (on: boolean, from: number, to: number) => ({ on, from, to });

  test("current interval only: just the timeframe being viewed", () => {
    expect(visPreset("current", 15)).toEqual({ min: row(true, 15, 15), hour: row(false, 1, 24), day: row(false, 1, 366) });
    expect(visPreset("current", 1440)).toEqual({ min: row(false, 1, 59), hour: row(false, 1, 24), day: row(true, 1, 1) });
  });

  test("this interval and up / and down", () => {
    expect(visPreset("up", 15)).toEqual({ min: row(true, 15, 59), hour: row(true, 1, 24), day: row(true, 1, 366) });
    expect(visPreset("up", 60)).toEqual({ min: row(false, 1, 59), hour: row(true, 1, 24), day: row(true, 1, 366) });
    expect(visPreset("down", 60)).toEqual({ min: row(true, 1, 59), hour: row(true, 1, 1), day: row(false, 1, 366) });
    expect(visPreset("down", 240)).toEqual({ min: row(true, 1, 59), hour: row(true, 1, 4), day: row(false, 1, 366) });
  });

  test("each preset shows the drawing where it should", () => {
    expect([1, 5, 15, 30, 60, 1440].filter((tf) => visibleOnTf(visPreset("up", 15), tf))).toEqual([15, 30, 60, 1440]);
    expect([1, 5, 15, 30, 60, 1440].filter((tf) => visibleOnTf(visPreset("down", 15), tf))).toEqual([1, 5, 15]);
    expect([1, 5, 15, 30, 60, 1440].filter((tf) => visibleOnTf(visPreset("current", 15), tf))).toEqual([15]);
  });

  test("the menu marks the preset the drawing matches on this timeframe", () => {
    expect(matchVisPreset(undefined, 15)).toBe("all");
    expect(matchVisPreset(defaultVisibility(), 15)).toBe("all");
    expect(matchVisPreset(visPreset("up", 15), 15)).toBe("up");
    expect(matchVisPreset(visPreset("up", 15), 5)).toBeNull();
    expect(matchVisPreset(visPreset("current", 60), 60)).toBe("current");
  });
});
