import { defaultIct } from "./ict";
import { buildCandles, makeDataset } from "./series";
import { freshSmt, pickOther, smtModel } from "./smt";
import { testPair } from "./testBars";
import { bucketOf } from "./time";
import type { Candle, Dataset } from "./types";

const [nq, es] = testPair();
const now = nq.T[Math.floor(nq.n * 0.6)];
const a = makeDataset("DEMO US100", nq, "NY", now);
const b = makeDataset("DEMO US500", es, "NY", now);

/** Tính lại SMT độc lập, thẳng từ nến 1m của cả hai mã (cùng định nghĩa, viết lại từ đầu). */
function recompute(candles: Candle[], other: Dataset, tf: number, L: number): string[] {
  const n = candles.length;
  const at = new Map(candles.map((c, i) => [c.time, i]));
  const oh: (number | null)[] = new Array(n).fill(null);
  const ol: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i <= other.cur; i++) {
    const j = at.get(bucketOf(other.LT[i], tf, "NY"));
    if (j === undefined) continue;
    oh[j] = oh[j] == null ? other.H[i] : Math.max(oh[j]!, other.H[i]);
    ol[j] = ol[j] == null ? other.L[i] : Math.min(ol[j]!, other.L[i]);
  }
  const out: string[] = [];
  for (const hi of [true, false]) {
    const v = (i: number) => (hi ? candles[i].high : candles[i].low);
    const better = (x: number, y: number) => (hi ? x > y : x < y);
    const piv: number[] = [];
    for (let i = L; i + L <= n - 1; i++) {
      let ok = true;
      for (let j = i - L; j < i; j++) if (!better(v(i), v(j))) ok = false;
      for (let j = i + 1; j <= i + L; j++) if (better(v(j), v(i))) ok = false;
      if (ok) piv.push(i);
    }
    const ext = (i: number) => {
      let e: number | null = null;
      for (let j = Math.max(0, i - L); j <= Math.min(n - 1, i + L); j++) {
        const x = (hi ? oh : ol)[j];
        if (x != null) e = e == null ? x : hi ? Math.max(e, x) : Math.min(e, x);
      }
      return e;
    };
    for (let q = 1; q < piv.length; q++) {
      const [p0, p1] = [piv[q - 1], piv[q]];
      const [A, B, oA, oB] = [v(p0), v(p1), ext(p0), ext(p1)];
      if (oA == null || oB == null || !((B > A && oB < oA) || (B < A && oB > oA))) continue;
      let clean = true;
      for (let j = p0 + 1; j < p1; j++) {
        const y = A + ((B - A) * (j - p0)) / (p1 - p0);
        if (hi ? v(j) > y : v(j) < y) clean = false;
      }
      if (clean) out.push(`${hi ? "bear" : "bull"}:${p0}-${p1}`);
    }
  }
  return out.sort();
}
const keys = (lines: ReturnType<typeof smtModel>) => lines.map((l) => `${l.bull ? "bull" : "bear"}:${l.k0}-${l.k1}`).sort();

test.each([
  [5, 3],
  [15, 3],
  [5, 5],
  [60, 2],
])("%im chart, pivot length %i: same SMTs as an independent recomputation", (tf, len) => {
  const cs = buildCandles(a, tf, "NY");
  const lines = smtModel(cs, b, tf, "NY", { ...defaultIct().smt, len });
  expect(lines.length).toBeGreaterThan(0);
  expect(keys(lines)).toEqual(recompute(cs, b, tf, len));
  expect(lines.some((l) => l.bull) && lines.some((l) => !l.bull)).toBe(true);
});

test("only confirmed pivots are used (len candles to the right): nothing from the future", () => {
  const cs = buildCandles(a, 5, "NY");
  const lines = smtModel(cs, b, 5, "NY", defaultIct().smt);
  expect(lines.every((l) => l.k1 + 3 <= cs.length - 1)).toBe(true);
});

test("highs / lows can be turned off separately", () => {
  const cs = buildCandles(a, 5, "NY");
  const onlyLows = smtModel(cs, b, 5, "NY", { ...defaultIct().smt, highs: false });
  expect(onlyLows.every((l) => l.bull)).toBe(true);
});

test("the comparison symbol is the other one of the NQ ↔ ES pair", () => {
  expect(pickOther("US100", ["US100", "US500"], "auto")).toBe("US500");
  expect(pickOther("DEMO US500", ["DEMO US100", "DEMO US500"], "auto")).toBe("DEMO US100");
  expect(pickOther("US100_m1", ["US100_m1", "X", "US500_m1"], "auto")).toBe("US500_m1");
  expect(pickOther("US100", ["US100"], "auto")).toBeNull();
  expect(pickOther("US100", ["US100", "A", "B"], "B")).toBe("B");
});

test("a fresh SMT is one confirmed exactly at the last candle", () => {
  const line = { k0: 1, k1: 6, p0: 1, p1: 2, bull: true, time: 0 };
  expect(freshSmt([line], 10, 3)).toBe(line);
  expect(freshSmt([line], 11, 3)).toBeNull();
});
