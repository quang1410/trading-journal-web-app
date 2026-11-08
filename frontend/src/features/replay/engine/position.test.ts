import { describe, expect, test } from "vitest";
import { boxValid, orderFromBox, posMetrics, setEntry, setLevelPrice, setLevelTicks, setRR, type PosBox, type PosInputs } from "./position";

// Long: vào 100, chốt lời 110, cắt lỗ 95 (khoảng stop 5 điểm, R/R = 2)
const long: PosBox = { type: "long", pts: [{ t: 0, p: 100 }, { t: 60, p: 110 }, { t: 60, p: 95 }] };
const short: PosBox = { type: "short", pts: [{ t: 0, p: 100 }, { t: 60, p: 90 }, { t: 60, p: 105 }] };
const inp = (patch: Partial<PosInputs> = {}): PosInputs => ({ account: 50000, lot: 20, risk: 1, riskUnit: "pct", qtyPrec: null, ...patch });

describe("posMetrics", () => {
  test("long: offsets, percent, ticks, R/R, qty and amounts from the risk", () => {
    const m = posMetrics(long, inp(), 104, 0.25);
    expect(m).toMatchObject({ side: 1, entry: 100, target: 110, stop: 95, tpOffset: 10, slOffset: 5, tpTicks: 40, slTicks: 20, rr: 2 });
    expect(m.tpPct).toBeCloseTo(10);
    expect(m.slPct).toBeCloseTo(5);
    // rủi ro 1% của 50 000 = 500 USD; 5 điểm × 20 USD = 100 USD mỗi hợp đồng → 5 hợp đồng
    expect(m.riskCash).toBe(500);
    expect(m.qty).toBe(5);
    expect(m.tpAmount).toBe(1000);
    expect(m.slAmount).toBe(500);
    // giá hiện tại 104: lãi 4 điểm × 20 × 5
    expect(m.openPl).toBe(400);
  });

  test("short mirrors the signs", () => {
    const m = posMetrics(short, inp(), 102, 0.25);
    expect(m).toMatchObject({ side: -1, tpOffset: 10, slOffset: 5, rr: 2, qty: 5, openPl: -200 });
  });

  test("risk in cash, and the quantity rounds down to the chosen precision", () => {
    expect(posMetrics(long, inp({ riskUnit: "cash", risk: 330 }), null, 0.25).qty).toBe(3);
    expect(posMetrics(long, inp({ riskUnit: "cash", risk: 330, qtyPrec: 2 }), null, 0.25).qty).toBe(3.3);
  });

  test("no price yet: open P&L is unknown", () => {
    expect(posMetrics(long, inp(), null, 0.25).openPl).toBeNull();
  });

  test("entry on the stop: R/R and quantity are unknown, nothing divides by zero", () => {
    const flat: PosBox = { type: "long", pts: [{ t: 0, p: 100 }, { t: 60, p: 110 }, { t: 60, p: 100 }] };
    const m = posMetrics(flat, inp(), 101, 0.25);
    expect(m.rr).toBeNull();
    expect(m.qty).toBeNull();
    expect(m.tpAmount).toBeNull();
    expect(m.openPl).toBeNull();
  });

  test("account size 0 with risk in percent: quantity is unknown", () => {
    expect(posMetrics(long, inp({ account: 0 }), 101, 0.25).qty).toBeNull();
  });
});

describe("editing the box from the Inputs tab", () => {
  test("ticks and price of a level convert both ways on the tick size", () => {
    expect(setLevelTicks(long, "tp", 60, 0.25)!.pts[1].p).toBe(115);
    expect(setLevelTicks(long, "sl", 8, 0.25)!.pts[2].p).toBe(98);
    expect(setLevelTicks(short, "tp", 60, 0.25)!.pts[1].p).toBe(85);
    expect(setLevelPrice(long, "tp", 120)!.pts[1].p).toBe(120);
  });

  test("a level on the wrong side of the entry is refused", () => {
    expect(setLevelPrice(long, "tp", 99)).toBeNull();
    expect(setLevelPrice(long, "sl", 101)).toBeNull();
    expect(setLevelPrice(short, "tp", 101)).toBeNull();
    expect(setLevelTicks(long, "tp", 0, 0.25)).toBeNull();
  });

  test("R/R moves the target and keeps the stop", () => {
    const b = setRR(long, 3)!;
    expect(b.pts[1].p).toBe(115);
    expect(b.pts[2].p).toBe(95);
    expect(setRR(short, 1.5)!.pts[1].p).toBe(92.5);
    expect(setRR(long, 0)).toBeNull();
  });

  test("entry price keeps target and stop where they are, unless it crosses one", () => {
    const b = setEntry(long, 102)!;
    expect(b.pts.map((q) => q.p)).toEqual([102, 110, 95]);
    expect(setEntry(long, 112)).toBeNull();
  });

  test("editing returns a new box and leaves the old one alone", () => {
    setRR(long, 3);
    expect(long.pts[1].p).toBe(110);
  });
});

describe("orderFromBox (Create limit order)", () => {
  test("long below the price is a buy limit with SL / TP in points and the box quantity", () => {
    expect(orderFromBox(long, inp(), 103, 0.25)).toEqual({ side: 1, type: "limit", price: 100, slPts: 5, tpPts: 10, qty: 5 });
  });

  test("long above the price becomes a buy stop", () => {
    expect(orderFromBox(long, inp(), 97, 0.25)).toMatchObject({ side: 1, type: "stop", price: 100 });
  });

  test("short above the price is a sell limit", () => {
    expect(orderFromBox(short, inp(), 98, 0.25)).toMatchObject({ side: -1, type: "limit", price: 100, slPts: 5, tpPts: 10 });
  });

  test("entry exactly at the price, or no price yet: no order", () => {
    expect(orderFromBox(long, inp(), 100, 0.25)).toBeNull();
    expect(orderFromBox(long, inp(), null, 0.25)).toBeNull();
  });

  test("a box dragged inside out (stop or target past the entry) places no order", () => {
    const stopAbove: PosBox = { type: "long", pts: [{ t: 0, p: 100 }, { t: 60, p: 110 }, { t: 60, p: 104 }] };
    const targetBelow: PosBox = { type: "short", pts: [{ t: 0, p: 100 }, { t: 60, p: 103 }, { t: 60, p: 105 }] };
    expect(boxValid(stopAbove)).toBe(false);
    expect(boxValid(targetBelow)).toBe(false);
    expect(boxValid(long)).toBe(true);
    expect(orderFromBox(stopAbove, inp(), 97, 0.25)).toBeNull();
    expect(orderFromBox(targetBelow, inp(), 98, 0.25)).toBeNull();
  });

  test("a fractional or unknown quantity still sends at least one contract", () => {
    expect(orderFromBox(long, inp({ account: 0 }), 103, 0.25)!.qty).toBe(1);
    expect(orderFromBox(long, inp({ riskUnit: "cash", risk: 50, qtyPrec: 2 }), 103, 0.25)!.qty).toBe(1);
  });
});
