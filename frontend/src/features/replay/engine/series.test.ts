import { buildCandles, firstBucketAfter, lowerBound, makeDataset, mergeBars, pushBar, stepTarget, upperIdx } from "./series";
import { barsOf, testPair } from "./testBars";
import { bucketOf } from "./time";

const [nq, es] = testPair();

test("lowerBound / upperIdx find the bar at or before a time", () => {
  expect(lowerBound([1, 3, 3, 7], 3)).toBe(1);
  expect(lowerBound([1, 3, 3, 7], 8)).toBe(4);
  const d = makeDataset("A", nq, "NY", 0);
  expect(upperIdx(d, d.T[100])).toBe(100);
  expect(upperIdx(d, d.T[100] + 30)).toBe(100);
  expect(upperIdx(d, d.T[0] - 1)).toBe(-1);
});

test("candles aggregate exactly the 1m bars up to the cursor, never later ones", () => {
  const d = makeDataset("A", nq, "NY", nq.T[5000]);
  for (const tf of [5, 15, 60, 240, 1440]) {
    const cs = buildCandles(d, tf, "NY");
    const last = cs[cs.length - 1];
    // recompute the last candle straight from the 1m bars
    let open = NaN;
    let high = -Infinity;
    let low = Infinity;
    for (let i = 0; i <= d.cur; i++) {
      if (bucketOf(d.LT[i], tf, "NY") !== last.time) continue;
      if (Number.isNaN(open)) open = d.O[i];
      high = Math.max(high, d.H[i]);
      low = Math.min(low, d.L[i]);
    }
    expect(last).toEqual({ time: last.time, open, high, low, close: d.C[d.cur] });
    expect(cs.every((c, i) => i === 0 || c.time > cs[i - 1].time)).toBe(true);
  }
});

test("pushBar grows the last candle, then opens a new one at the bucket boundary", () => {
  const d = makeDataset("A", nq, "NY", nq.T[2000]);
  const cs = buildCandles(d, 15, "NY");
  const n = cs.length;
  let i = d.cur;
  while (bucketOf(d.LT[i + 1], 15, "NY") === cs[n - 1].time) {
    i++;
    d.cur = i;
    pushBar(cs, d, i, 15, "NY");
  }
  expect(cs.length).toBe(n);
  d.cur = i + 1;
  pushBar(cs, d, i + 1, 15, "NY");
  expect(cs.length).toBe(n + 1);
  expect(cs[n]).toEqual({ time: bucketOf(d.LT[i + 1], 15, "NY"), open: d.O[i + 1], high: d.H[i + 1], low: d.L[i + 1], close: d.C[i + 1] });
});

test("one step of 15m stops at the end of the current 15m candle; steps use the selected symbol", () => {
  const a = makeDataset("A", nq, "NY", nq.T[3001]);
  const b = makeDataset("B", es, "NY", nq.T[3001]);
  const t = stepTarget(a, [a, b], 15, 1, "NY")!;
  const j = upperIdx(a, t);
  expect(j).toBeGreaterThan(a.cur);
  expect(j - a.cur).toBeLessThanOrEqual(15);
  expect(bucketOf(a.LT[j], 15, "NY")).not.toBe(bucketOf(a.LT[j + 1], 15, "NY"));
});

test("stepTarget returns null when every symbol is out of data", () => {
  const a = makeDataset("A", nq, "NY", nq.T[nq.n - 1]);
  expect(stepTarget(a, [a], 1, 1, "NY")).toBeNull();
});

test("firstBucketAfter finds the first 1m bar after a candle", () => {
  const d = makeDataset("A", nq, "NY", nq.T[nq.n - 1]);
  const time = bucketOf(d.LT[4000], 60, "NY");
  const i = firstBucketAfter(d, time, 60, "NY");
  expect(bucketOf(d.LT[i - 1], 60, "NY")).toBe(time);
  expect(bucketOf(d.LT[i], 60, "NY")).toBeGreaterThan(time);
});

test("mergeBars keeps both histories in time order; the newer copy wins on the same minute", () => {
  const t0 = 1792360800;
  // tuần cũ: phút 0..3 (phút 3 kéo lúc chưa đóng); tuần mới: phút 3..5; phút 10 lấp sau một khoảng hở
  const old = barsOf(t0, [[0, 1, 1, 1, 1], [1, 2, 2, 2, 2], [2, 3, 3, 3, 3], [3, 4, 4, 4, 4]]);
  const fresh = barsOf(t0, [[3, 40, 41, 39, 40.5], [4, 5, 5, 5, 5], [5, 6, 6, 6, 6], [10, 7, 7, 7, 7]]);
  const m = mergeBars(old, fresh);
  expect(m.n).toBe(7);
  expect([...m.T].map((t) => (t - t0) / 60)).toEqual([0, 1, 2, 3, 4, 5, 10]);
  expect([m.O[3], m.H[3], m.L[3], m.C[3]]).toEqual([40, 41, 39, 40.5]);
  // thứ tự tham số không quyết định thứ tự giờ, chỉ quyết định bản nào thắng
  expect([...mergeBars(fresh, old).T]).toEqual([...m.T]);
  expect(mergeBars(fresh, old).O[3]).toBe(4);
  expect(mergeBars(old, barsOf(t0, [])).n).toBe(4);
});

test("mergeBars drops broken rows so bar times stay strictly increasing", () => {
  const t0 = 1792360800;
  const a = barsOf(t0, [[0, 1, 1, 1, 1], [0, 9, 9, 9, 9], [2, 2, 2, 2, 2], [1, 8, 8, 8, 8]]);
  const b = barsOf(t0, [[3, 3, 3, 3, 3]]);
  b.T[0] = Number.NaN;
  const m = mergeBars(a, b);
  expect([...m.T].map((t) => (t - t0) / 60)).toEqual([0, 2]);
  expect(m.O[0]).toBe(1);
});
