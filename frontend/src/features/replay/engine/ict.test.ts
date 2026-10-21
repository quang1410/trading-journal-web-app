import { defaultIct, hmOf, ictModel, inRange, mergeDeep, type IctSettings } from "./ict";
import { makeDataset, upperIdx } from "./series";
import { testPair } from "./testBars";
import type { Dataset } from "./types";

// Data giả lập là tháng 1/2026: New York = UTC-5
const U = (d: number, h: number, m: number) => Date.UTC(2026, 0, d, h, m) / 1000;
const [nq] = testPair();
const label = (s: string) => `Macro ${s}`;

/** Đỉnh/đáy/giá mở của các nến 1m có T trong [a, b) và đã hiện (T <= now). */
function raw(d: Dataset, a: number, b: number) {
  let h = -Infinity;
  let l = Infinity;
  let o: number | null = null;
  for (let i = 0; i <= d.cur; i++) {
    if (d.T[i] < a || d.T[i] >= b) continue;
    o ??= d.O[i];
    h = Math.max(h, d.H[i]);
    l = Math.min(l, d.L[i]);
  }
  return { h, l, o };
}

// Thứ Tư 07/01/2026 10:30 New York: Asia + London xong, NY AM đang chạy
const d = makeDataset("DEMO US100", nq, "NY", U(7, 15, 30));
const m5 = ictModel(d, 5, "NY", defaultIct(), label);
const box = (name: string, m = m5) => m.boxes.find((b) => b.text === name)!;

test("time helpers: HH:MM to minutes, sessions crossing midnight", () => {
  expect(hmOf("09:30")).toBe(570);
  expect(inRange(hmOf("20:30"), hmOf("20:00"), hmOf("00:00"))).toBe(true);
  expect(inRange(hmOf("00:00"), hmOf("20:00"), hmOf("00:00"))).toBe(false);
  expect(inRange(hmOf("10:00"), hmOf("09:30"), hmOf("11:00"))).toBe(true);
});

test("one box per session (Session Drawing Limit = 1)", () => {
  expect(m5.boxes.map((b) => b.text).sort()).toEqual(["Asia", "London", "NY AM", "NY Lunch", "NY PM"]);
});

test("London 02:00–05:00 New York: box spans its 5m candles, high/low from its 1m bars", () => {
  const r = raw(d, U(7, 7, 0), U(7, 10, 0));
  expect(box("London")).toMatchObject({ t0: U(7, 7, 0), t1: U(7, 9, 55), hi: r.h, lo: r.l });
});

test("Asia 20:00–24:00 is the previous evening", () => {
  const r = raw(d, U(7, 1, 0), U(7, 5, 0));
  expect(box("Asia")).toMatchObject({ t0: U(7, 1, 0), t1: U(7, 4, 55), hi: r.h, lo: r.l });
});

test("NY AM is still running: it grows up to the current bar only", () => {
  const r = raw(d, U(7, 14, 30), U(7, 15, 31));
  expect(box("NY AM")).toMatchObject({ t0: U(7, 14, 30), t1: U(7, 15, 30), hi: r.h, lo: r.l });
});

test("NY Lunch has not happened today yet, so yesterday's is shown", () => {
  expect(box("NY Lunch").t0).toBe(U(6, 17, 0));
});

test("London pivots extend until the first later bar that breaks them", () => {
  const lon = box("London");
  let hBreak: number | null = null;
  let lBreak: number | null = null;
  for (let i = upperIdx(d, U(7, 10, 0) - 1) + 1; i <= d.cur; i++) {
    if (hBreak == null && d.H[i] > lon.hi) hBreak = d.T[i];
    if (lBreak == null && d.L[i] < lon.lo) lBreak = d.T[i];
  }
  const bucket = (t: number | null) => (t == null ? d.T[d.cur] - (d.T[d.cur] % 300) : t - (t % 300));
  const h = m5.lines.find((l) => l.label === "London.H")!;
  const l = m5.lines.find((x) => x.label === "London.L")!;
  expect(h).toMatchObject({ p: lon.hi, t0: lon.t0, t1: bucket(hBreak) });
  expect(l).toMatchObject({ p: lon.lo, t1: bucket(lBreak) });
});

test("True Day Open = open of the 00:00 New York bar, extends to now", () => {
  const tdo = m5.lines.find((l) => l.label === "True Day Open")!;
  expect(tdo).toMatchObject({ p: raw(d, U(7, 5, 0), U(7, 5, 1)).o, t0: U(7, 5, 0), t1: U(7, 15, 30) });
});

test("macros only on timeframes <= 3m: none on 5m, 08:20–08:40 on 1m with ±0.5 points", () => {
  expect(m5.macros).toEqual([]);
  const m1 = ictModel(d, 1, "NY", defaultIct(), label);
  const r = raw(d, U(7, 13, 20), U(7, 13, 40));
  const mc = m1.macros.find((x) => x.label === "Macro 08:20")!;
  expect(mc).toMatchObject({ t0: U(7, 13, 20), t1: U(7, 13, 39) });
  expect(mc.top).toBeCloseTo(r.h + 0.5, 9);
  expect(mc.bot).toBeCloseTo(r.l - 0.5, 9);
  // 10:50 has not started yet today: yesterday's is shown
  expect(m1.macros.find((x) => x.label === "Macro 10:50")!.t0).toBe(U(6, 15, 50));
});

test("killzones are hidden above 1H, and everything when the indicator is off", () => {
  const h4 = ictModel(d, 240, "NY", defaultIct(), label);
  expect(h4.boxes.length + h4.lines.length).toBe(0);
  const off = ictModel(d, 5, "NY", { ...defaultIct(), on: false }, label);
  expect(off.boxes.length + off.lines.length + off.macros.length).toBe(0);
});

test("Session Drawing Limit 2 keeps two London boxes; GMT-5 equals New York in winter", () => {
  const two = ictModel(d, 5, "NY", { ...defaultIct(), maxDays: 2 }, label);
  expect(two.boxes.filter((b) => b.text === "London")).toHaveLength(2);
  const gmt = ictModel(d, 5, "NY", { ...defaultIct(), tz: "GMT-5" }, label);
  expect(gmt.boxes).toEqual(m5.boxes);
});

test("an edited session time moves the box", () => {
  const s: IctSettings = defaultIct();
  s.sessions[1].start = "03:00";
  expect(box("London", ictModel(d, 5, "NY", s, label)).t0).toBe(U(7, 8, 0));
});

test("saved settings merge onto the defaults (new fields appear, wrong types are ignored)", () => {
  const merged = mergeDeep(defaultIct(), { maxDays: 3, smt: { len: 5 }, boxAlpha: "oops", sessions: [{ name: "Tokyo" }] });
  expect(merged.maxDays).toBe(3);
  expect(merged.smt.len).toBe(5);
  expect(merged.smt.highs).toBe(true);
  expect(merged.boxAlpha).toBe(90);
  expect(merged.sessions[0]).toMatchObject({ name: "Tokyo", start: "20:00" });
  expect(merged.sessions).toHaveLength(5);
});
