import { makeDataset } from "./series";
import { barsOf } from "./testBars";
import {
  calcQty, closePosition, computeStats, contractFor, lineError, openPosition, pendingError, processBar, type Pending, type Trade,
} from "./trading";

const T0 = Date.UTC(2026, 0, 6, 14, 30) / 1000;
// [minute, open, high, low, close]
const bars = barsOf(T0, [
  [0, 100, 101, 99, 100],
  [1, 100, 106, 99.5, 105], // +5
  [2, 105, 105.5, 89, 90], // dips through 90
  [3, 80, 81, 79, 80], // gaps down
  [4, 80, 130, 79, 129],
]);
const d = makeDataset("US100", bars, "NY", T0 + 4 * 60);
const base = { qty: 1, slPts: 10, tpPts: 20, contract: "NQ" as const, comm: 4 };

test("contract follows the symbol and keeps micro", () => {
  expect(contractFor("US500", "NQ")).toBe("ES");
  expect(contractFor("US500", "MNQ")).toBe("MES");
  expect(contractFor("US100_m1", "MES")).toBe("MNQ");
  expect(contractFor("DEMO US500", "ES")).toBe("ES");
});

test("risk-based sizing: floor(risk / (SL points × point value)), at least 1", () => {
  expect(calcQty(10, "NQ", 1000, 3)).toBe(5);
  expect(calcQty(10, "MNQ", 1000, 3)).toBe(50);
  expect(calcQty(10, "NQ", 50, 3)).toBe(1);
  expect(calcQty(10, "NQ", 0, 3)).toBe(3);
  expect(calcQty(0, "NQ", 1000, 0)).toBe(1);
});

test("pending orders must be on the correct side of the price", () => {
  expect(pendingError(1, "limit", 95, 100)).toBeNull();
  expect(pendingError(1, "limit", 105, 100)).toBe("limitSide");
  expect(pendingError(-1, "stop", 95, 100)).toBeNull();
  expect(pendingError(1, "stop", 95, 100)).toBe("stopSide");
});

test("P&L: points × point value × qty minus round-trip fee; R uses the SL risk", () => {
  const pos = openPosition(d, { side: 1, price: 100, i: 0, ...base, fresh: false });
  const tr = closePosition({ ...pos, qty: 2 }, d, 105, 1, "manual");
  expect(tr.pts).toBe(5);
  expect(tr.pnl).toBe(5 * 20 * 2 - 4 * 2);
  expect(tr.r).toBeCloseTo(tr.pnl / (10 * 20 * 2));
});

test("SL is checked from the next bar; a bar through the SL closes at the SL price", () => {
  let state = { pos: openPosition(d, { side: 1, price: 100, i: 0, ...base, fresh: false }), pending: null as Pending | null };
  const r1 = processBar(state, d, 1);
  expect(r1.trade).toBeNull(); // high 106 < TP 120, low 99.5 > SL 90
  state = r1.state as typeof state;
  const r2 = processBar(state, d, 2);
  expect(r2.trade).toMatchObject({ reason: "sl", exit: 90 });
  expect(r2.state.pos).toBeNull();
});

test("a gap through the SL closes at the bar's open", () => {
  const pos = openPosition(d, { side: 1, price: 100, i: 0, ...base, slPts: 15, fresh: false });
  const r = processBar({ pos, pending: null }, d, 3);
  expect(r.trade).toMatchObject({ reason: "slGap", exit: 80 });
});

test("SL and TP inside the same bar count as SL (worst case)", () => {
  const pos = openPosition(d, { side: 1, price: 100, i: 3, ...base, slPts: 21, tpPts: 25, fresh: false });
  const r = processBar({ pos, pending: null }, d, 4); // low 79 <= SL 79 and high 130 >= TP 125
  expect(r.trade).toMatchObject({ reason: "sl", exit: 79 });
});

test("a short TP closes at the TP price", () => {
  const pos = openPosition(d, { side: -1, price: 100, i: 1, ...base, tpPts: 10, slPts: 50, fresh: false });
  const r = processBar({ pos, pending: null }, d, 2);
  expect(r.trade).toMatchObject({ reason: "tp", exit: 90, pts: 10 });
});

test("limit fills at its price (or the open on a gap); no SL/TP on the fill bar", () => {
  const pending: Pending = { sym: "US100", side: 1, type: "limit", price: 95, ...base, slPts: 50, tpPts: 1, contract: "NQ" };
  const r = processBar({ pos: null, pending }, d, 2); // low 89 <= 95
  expect(r.state.pending).toBeNull();
  expect(r.state.pos).toMatchObject({ entry: 95, sl: 45, tp: 96, fresh: false });
  expect(r.trade).toBeNull(); // TP 96 was touched inside the fill bar, but that is not counted
  const gap = processBar({ pos: null, pending: { ...pending, price: 85 } }, d, 3); // opens at 80 below 85
  expect(gap.state.pos?.entry).toBe(80);
});

test("buy stop fills when the high reaches it", () => {
  const pending: Pending = { sym: "US100", side: 1, type: "stop", price: 103, ...base, contract: "NQ" };
  expect(processBar({ pos: null, pending }, d, 1).state.pos?.entry).toBe(103);
});

test("orders of another symbol are left alone", () => {
  const pending: Pending = { sym: "US500", side: 1, type: "stop", price: 101, ...base, contract: "ES" };
  const r = processBar({ pos: null, pending }, d, 1);
  expect(r.state.pending).toBe(pending);
});

test("SL/TP side checks", () => {
  const pos = openPosition(d, { side: 1, price: 100, i: 0, ...base, fresh: false });
  expect(lineError(pos, "sl", 101, 100)).toBe("slSide");
  expect(lineError(pos, "sl", 99, 100)).toBeNull();
  expect(lineError(pos, "tp", 99, 100)).toBe("tpSide");
});

test("stats: balance, win rate, profit factor, averages, max drawdown", () => {
  const mk = (pnl: number, r: number | null): Trade => ({ ...closePosition(openPosition(d, { side: 1, price: 100, i: 0, ...base, fresh: false }), d, 100, 1, "manual"), pnl, r });
  const st = computeStats([mk(100, 1), mk(-50, -0.5), mk(-50, -0.5), mk(200, 2)], 1000, 25);
  expect(st).toMatchObject({ balance: 1200, equity: 1225, net: 200, count: 4, winRate: 0.5, profitFactor: 3, avgWin: 150, avgLoss: -50, maxDrawdown: 100 });
  expect(st.avgR).toBeCloseTo(0.5);
  expect(computeStats([mk(10, null)], 0, 0).profitFactor).toBe(Infinity);
  expect(computeStats([], 0, 0)).toMatchObject({ count: 0, winRate: null, profitFactor: null });
});
