import type { Dataset, Side } from "./types";

/** Giá trị một điểm của mỗi hợp đồng (USD). */
export const CONTRACTS = { NQ: 20, MNQ: 2, ES: 50, MES: 5 } as const;
export type Contract = keyof typeof CONTRACTS;
export const CONTRACT_LIST = Object.keys(CONTRACTS) as Contract[];

/** Bước giá khi kéo SL / TP / lệnh chờ trên chart. */
export const TICK = 0.25;

/** Hợp đồng hợp với mã: mã S&P 500 → ES/MES, còn lại → NQ/MNQ; giữ loại micro nếu đang chọn micro. */
export function contractFor(symbol: string, current: Contract): Contract {
  const micro = current.startsWith("M");
  return /500|SPX|\bES\b/i.test(symbol) ? (micro ? "MES" : "ES") : micro ? "MNQ" : "NQ";
}

export type OrderType = "market" | "limit" | "stop";
export type ExitReason = "sl" | "tp" | "slGap" | "tpGap" | "manual";

export interface Position {
  sym: string;
  contract: Contract;
  side: Side;
  qty: number;
  entry: number;
  /** chỉ số nến 1m lúc vào lệnh và giờ UTC của nó */
  i0: number;
  t0: number;
  sl: number | null;
  tp: number | null;
  slPts: number;
  /** vừa khớp ở nến này: chưa xét SL/TP trong chính nến đó (không biết thứ tự giá bên trong nến) */
  fresh: boolean;
  /** giá trị một điểm và phí khứ hồi mỗi hợp đồng */
  pv: number;
  comm: number;
}

export interface Pending {
  sym: string;
  contract: Contract;
  side: Side;
  type: "limit" | "stop";
  price: number;
  qty: number;
  slPts: number;
  tpPts: number;
  /** phí khứ hồi mỗi hợp đồng, lấy lúc đặt lệnh */
  comm: number;
}

export interface Trade {
  sym: string;
  contract: Contract;
  side: Side;
  qty: number;
  entry: number;
  exit: number;
  i0: number;
  i1: number;
  t0: number;
  t1: number;
  pts: number;
  pnl: number;
  r: number | null;
  reason: ExitReason;
}

/** Số hợp đồng: có "Rủi ro $" và SL thì tự tính, không thì lấy ô số hợp đồng. */
export function calcQty(slPts: number, contract: Contract, riskUsd: number, qty: number): number {
  if (riskUsd > 0 && slPts > 0) return Math.max(1, Math.floor(riskUsd / (slPts * CONTRACTS[contract])));
  return Math.max(1, Math.trunc(qty) || 1);
}

export type PendingError = "limitSide" | "stopSide";
/** Limit mua phải dưới giá, limit bán phải trên; stop thì ngược lại. */
export function pendingError(side: Side, type: "limit" | "stop", price: number, last: number): PendingError | null {
  const ok = type === "limit" ? (side > 0 ? price < last : price > last) : side > 0 ? price > last : price < last;
  if (ok) return null;
  return type === "limit" ? "limitSide" : "stopSide";
}

export type LineError = "slSide" | "tpSide";
/** SL phải nằm phía lỗ, TP phía lãi so với giá hiện tại. */
export function lineError(pos: Position, key: "sl" | "tp", v: number, px: number): LineError | null {
  if (key === "sl") return (pos.side > 0 ? v >= px : v <= px) ? "slSide" : null;
  return (pos.side > 0 ? v <= px : v >= px) ? "tpSide" : null;
}

export function openPosition(
  d: Dataset,
  o: { side: Side; price: number; i: number; qty: number; slPts: number; tpPts: number; contract: Contract; comm: number; fresh: boolean },
): Position {
  return {
    sym: d.name,
    contract: o.contract,
    side: o.side,
    qty: o.qty,
    entry: o.price,
    i0: o.i,
    t0: d.T[o.i],
    sl: o.slPts > 0 ? o.price - o.side * o.slPts : null,
    tp: o.tpPts > 0 ? o.price + o.side * o.tpPts : null,
    slPts: o.slPts,
    fresh: o.fresh,
    pv: CONTRACTS[o.contract],
    comm: o.comm,
  };
}

export function closePosition(pos: Position, d: Dataset, price: number, i: number, reason: ExitReason): Trade {
  const pts = pos.side * (price - pos.entry);
  const pnl = pts * pos.pv * pos.qty - pos.comm * pos.qty;
  const riskUsd = pos.slPts > 0 ? pos.slPts * pos.pv * pos.qty : null;
  return {
    sym: pos.sym,
    contract: pos.contract,
    side: pos.side,
    qty: pos.qty,
    entry: pos.entry,
    exit: price,
    i0: pos.i0,
    i1: i,
    t0: pos.t0,
    t1: d.T[i],
    pts,
    pnl,
    r: riskUsd ? pnl / riskUsd : null,
    reason,
  };
}

export interface OrderState {
  pos: Position | null;
  pending: Pending | null;
}

/**
 * Xử lý nến 1m vừa hiện `i` của mã `d`: khớp lệnh chờ, rồi kiểm SL/TP.
 *
 * - Lệnh chờ khớp ở giá mở nếu nến mở vượt qua giá đặt (gap), không thì ở đúng giá đặt.
 * - Không xét SL/TP trong chính nến vừa khớp: không biết giá đi tới SL hay TP trước.
 * - SL và TP cùng chạm trong một nến thì tính là chạm SL (giả định bất lợi).
 * - Nến mở vượt qua SL/TP thì đóng ở giá mở (SL/TP gap).
 */
export function processBar(state: OrderState, d: Dataset, i: number): { state: OrderState; trade: Trade | null; changed: boolean } {
  let { pos, pending } = state;
  let trade: Trade | null = null;
  let changed = false;
  const o = d.O[i];
  const h = d.H[i];
  const l = d.L[i];
  if (pending && pending.sym === d.name) {
    const { side, type, price } = pending;
    let fill: number | null = null;
    if (type === "limit") {
      if (side > 0) fill = o <= price ? o : l <= price ? price : null;
      else fill = o >= price ? o : h >= price ? price : null;
    } else if (side > 0) fill = o >= price ? o : h >= price ? price : null;
    else fill = o <= price ? o : l <= price ? price : null;
    if (fill != null) {
      pos = openPosition(d, { side, price: fill, i, qty: pending.qty, slPts: pending.slPts, tpPts: pending.tpPts, contract: pending.contract, comm: pending.comm, fresh: true });
      pending = null;
      changed = true;
    }
  }
  if (pos && pos.sym === d.name) {
    if (!pos.fresh) {
      const { side, sl, tp } = pos;
      const slGap = sl != null && (side > 0 ? o <= sl : o >= sl);
      const tpGap = tp != null && (side > 0 ? o >= tp : o <= tp);
      const slHit = sl != null && (side > 0 ? l <= sl : h >= sl);
      const tpHit = tp != null && (side > 0 ? h >= tp : l <= tp);
      if (slGap) trade = closePosition(pos, d, o, i, "slGap");
      else if (tpGap) trade = closePosition(pos, d, o, i, "tpGap");
      else if (slHit && sl != null) trade = closePosition(pos, d, sl, i, "sl");
      else if (tpHit && tp != null) trade = closePosition(pos, d, tp, i, "tp");
      if (trade) {
        pos = null;
        changed = true;
      }
    }
    if (pos && pos.fresh) pos = { ...pos, fresh: false };
  }
  return { state: { pos, pending }, trade, changed };
}

export const openPnl = (pos: Position | null, px: number | null): number =>
  pos && px != null ? pos.side * (px - pos.entry) * pos.pv * pos.qty : 0;

export interface Stats {
  balance: number;
  equity: number;
  net: number;
  count: number;
  winRate: number | null;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgR: number | null;
  maxDrawdown: number;
}

export function computeStats(trades: Trade[], balance0: number, open: number): Stats {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const net = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  let eq = balance0;
  let peak = balance0;
  let mdd = 0;
  for (const t of trades) {
    eq += t.pnl;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, peak - eq);
  }
  const withR = trades.filter((t) => t.r != null);
  const n = trades.length;
  return {
    balance: balance0 + net,
    equity: balance0 + net + open,
    net,
    count: n,
    winRate: n ? wins.length / n : null,
    // không có lệnh lỗ nào thì profit factor là vô cực
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : n ? Infinity : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    avgR: withR.length ? withR.reduce((s, t) => s + (t.r ?? 0), 0) / withR.length : null,
    maxDrawdown: mdd,
  };
}
