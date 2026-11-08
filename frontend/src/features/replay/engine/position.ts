import type { Pt } from "./projector";
import type { Side } from "./types";

/**
 * Số liệu của hình Long / Short position (tab Inputs và nhãn Stats), như FX Replay / TradingView.
 * Thuần: không React, không store. Số thực của mô phỏng (xem engine/types.ts), không phải tiền sổ nhật ký.
 *
 * Hộp gồm 3 điểm: [0] giá vào, [1] chốt lời (target), [2] cắt lỗ (stop); [1] và [2] chung mép phải.
 */

export type RiskUnit = "pct" | "cash";

/** Các mục của "Stats" (Long / Short), theo thứ tự hiện trên hình: dòng target, dòng giữa, dòng stop. */
export const POS_STAT_KEYS = ["tpOffset", "tpPct", "tpTicks", "tpAmount", "openPl", "qty", "rr", "slOffset", "slPct", "slTicks", "slAmount"] as const;
export type PosStatKey = (typeof POS_STAT_KEYS)[number];

export interface PosBox {
  type: "long" | "short";
  pts: Pt[];
}

export interface PosInputs {
  /** vốn tài khoản dùng để tính rủi ro theo % */
  account: number;
  /** giá trị một điểm của một hợp đồng (NQ 20, ES 50…) */
  lot: number;
  risk: number;
  riskUnit: RiskUnit;
  /** số chữ số lẻ của Qty; null = mặc định (hợp đồng nguyên) */
  qtyPrec: number | null;
}

export interface PosMetrics {
  side: Side;
  entry: number;
  target: number;
  stop: number;
  tpOffset: number;
  slOffset: number;
  tpPct: number;
  slPct: number;
  tpTicks: number;
  slTicks: number;
  rr: number | null;
  riskCash: number | null;
  qty: number | null;
  tpAmount: number | null;
  slAmount: number | null;
  /** lãi/lỗ nếu đóng ở giá hiện tại; null khi chưa có giá hoặc chưa tính được Qty */
  openPl: number | null;
}

export const sideOf = (b: PosBox): Side => (b.type === "long" ? 1 : -1);

/** Làm tròn xuống theo số chữ số lẻ (không để 0,1 + 0,2 kiểu số thực làm lệch một bậc). */
function floorTo(x: number, prec: number): number {
  const f = 10 ** prec;
  return Math.floor(x * f + 1e-9) / f;
}

export function posMetrics(b: PosBox, inp: PosInputs, last: number | null, tick: number): PosMetrics {
  const side = sideOf(b);
  const [entry, target, stop] = [b.pts[0].p, b.pts[1].p, b.pts[2].p];
  const tpOffset = Math.abs(target - entry);
  const slOffset = Math.abs(entry - stop);
  const riskCash = inp.riskUnit === "pct" ? (inp.account > 0 && inp.risk > 0 ? (inp.account * inp.risk) / 100 : null) : inp.risk > 0 ? inp.risk : null;
  const perUnit = slOffset * inp.lot;
  const qty = riskCash != null && perUnit > 0 ? floorTo(riskCash / perUnit, inp.qtyPrec ?? 0) : null;
  const amount = (pts: number) => (qty != null ? pts * inp.lot * qty : null);
  return {
    side, entry, target, stop, tpOffset, slOffset,
    tpPct: entry ? (tpOffset / entry) * 100 : 0,
    slPct: entry ? (slOffset / entry) * 100 : 0,
    tpTicks: Math.round(tpOffset / tick),
    slTicks: Math.round(slOffset / tick),
    rr: slOffset > 0 ? tpOffset / slOffset : null,
    riskCash,
    qty,
    tpAmount: amount(tpOffset),
    slAmount: amount(slOffset),
    openPl: last != null && qty != null ? side * (last - entry) * inp.lot * qty : null,
  };
}

type Level = "tp" | "sl";
const slot = (lv: Level) => (lv === "tp" ? 1 : 2);

function withPrice(b: PosBox, i: number, p: number): PosBox {
  return { ...b, pts: b.pts.map((q, j) => (j === i ? { ...q, p } : { ...q })) };
}

/** Target phải ở phía lãi, stop ở phía lỗ so với giá vào (bằng giá vào cũng không được). */
function rightSide(b: PosBox, lv: Level, p: number, entry = b.pts[0].p): boolean {
  const d = sideOf(b) * (p - entry);
  return lv === "tp" ? d > 0 : d < 0;
}

/** Đặt giá của một mức; sai phía thì trả null (ô báo lỗi, không áp). */
export function setLevelPrice(b: PosBox, lv: Level, p: number): PosBox | null {
  return Number.isFinite(p) && rightSide(b, lv, p) ? withPrice(b, slot(lv), p) : null;
}

/** Đặt khoảng cách của một mức tính bằng tick. */
export function setLevelTicks(b: PosBox, lv: Level, ticks: number, tick: number): PosBox | null {
  if (!(ticks > 0)) return null;
  const dir = sideOf(b) * (lv === "tp" ? 1 : -1);
  return setLevelPrice(b, lv, b.pts[0].p + dir * ticks * tick);
}

/** Sửa R/R: dời target cho khoảng target = R/R × khoảng stop; stop giữ nguyên. */
export function setRR(b: PosBox, rr: number): PosBox | null {
  const sl = Math.abs(b.pts[0].p - b.pts[2].p);
  if (!(rr > 0) || !(sl > 0)) return null;
  return setLevelPrice(b, "tp", b.pts[0].p + sideOf(b) * rr * sl);
}

/** Sửa giá vào: target và stop đứng yên; giá vào vượt qua một trong hai thì không áp. */
export function setEntry(b: PosBox, p: number): PosBox | null {
  if (!Number.isFinite(p) || !rightSide(b, "tp", b.pts[1].p, p) || !rightSide(b, "sl", b.pts[2].p, p)) return null;
  return withPrice(b, 0, p);
}

/**
 * Hộp đúng chiều: target phía lãi, stop phía lỗ so với giá vào. Kéo chấm tròn có thể lộn hộp (FX Replay
 * cũng cho kéo), khi đó không đặt lệnh được: SL / TP sẽ ngược với hình đang thấy.
 */
export function boxValid(b: PosBox): boolean {
  return rightSide(b, "tp", b.pts[1].p) && rightSide(b, "sl", b.pts[2].p);
}

export interface BoxOrder {
  side: Side;
  type: "limit" | "stop";
  price: number;
  slPts: number;
  tpPts: number;
  qty: number;
}

/**
 * "Create limit order": lệnh chờ ở giá vào của hộp, SL / TP theo hai mức. Giá vào nằm phía có lợi
 * (long dưới giá, short trên giá) là lệnh limit, phía kia là lệnh stop. Bằng đúng giá hiện tại hoặc chưa
 * có giá, hoặc hộp bị lộn (boxValid), thì không đặt. Hợp đồng là số nguyên, ít nhất một.
 */
export function orderFromBox(b: PosBox, inp: PosInputs, last: number | null, tick: number): BoxOrder | null {
  const m = posMetrics(b, inp, last, tick);
  if (last == null || m.entry === last || !boxValid(b)) return null;
  const type = m.side * (m.entry - last) < 0 ? "limit" : "stop";
  return { side: m.side, type, price: m.entry, slPts: m.slOffset, tpPts: m.tpOffset, qty: Math.max(1, Math.floor(m.qty ?? 0)) };
}
