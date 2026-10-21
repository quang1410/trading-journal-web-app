import type { LineStyle } from "./ict";
import type { Projector, Pt, XY } from "./projector";

/**
 * Hình vẽ trên chart: đường xu hướng, hình chữ nhật, tia ngang, bút vẽ, đường mũi tên, Fibonacci,
 * vị thế Long/Short, chữ. Mỗi điểm lưu (giờ UTC, giá). Hình gắn với mã (`sym`), không với chart.
 */

export const DRAW_TOOLS = ["trend", "rect", "hray", "brush", "path", "fib", "long", "short", "text"] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

export interface Drawing {
  id: number;
  sym: string;
  type: DrawTool;
  pts: Pt[];
  text?: string;
  color?: string;
  width?: number;
  dash?: LineStyle;
  note?: string;
  noteColor?: string;
  noteB?: boolean;
  noteI?: boolean;
  noteSize?: number;
}

/** Đường kẻ ngang hết chiều rộng chart ("Kẻ ngang"), của một mã. */
export interface HLine {
  sym: string;
  price: number;
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const fibPrice = (d: Drawing, lv: number): number => d.pts[1].p + (d.pts[0].p - d.pts[1].p) * lv;

/** Hình có ghi chú (tab "Text" của TradingView) và hình đổi được màu / độ dày / kiểu đường. */
export const NOTE_TYPES: readonly DrawTool[] = ["trend", "hray", "rect", "path", "brush"];
export const STYLE_TYPES: readonly DrawTool[] = ["trend", "hray", "rect", "path", "brush", "text"];
const LINE_TYPES: readonly DrawTool[] = ["trend", "fib", "path"];

export const defaultWidth = (d: Drawing): number => (d.type === "rect" ? 1.5 : 2);

export interface Modifiers {
  /** Shift: khoá góc 0° / 45° / 90° so với điểm neo */
  shift: boolean;
  /** nam châm đang bật (nút nam châm, đảo bởi Ctrl/⌘) */
  magnet: boolean;
}

/** Nam châm: điểm bám vào O/H/L/C gần chuột nhất của nến dưới chuột. */
export function magnetPoint(proj: Projector, x: number, y: number): Pt | null {
  const c = proj.candleAt(x);
  if (!c) return null;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const v of [c.open, c.high, c.low, c.close]) {
    const cy = proj.priceToY(v);
    if (cy != null && Math.abs(cy - y) < bestDist) {
      bestDist = Math.abs(cy - y);
      best = v;
    }
  }
  return best == null ? null : { t: c.t, p: best };
}

/** Điểm dưới chuột, sau khi áp Shift (góc so với `anchor`) hoặc nam châm. */
export function pickPoint(proj: Projector, x: number, y: number, mods: Modifiers, anchor: Pt | null): Pt | null {
  const a: XY | null = mods.shift && anchor ? proj.toXY(anchor) : null;
  if (a && anchor) {
    const dx = x - a.x;
    const dy = y - a.y;
    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const ang = (k * Math.PI) / 4;
    const len = dx * Math.cos(ang) + dy * Math.sin(ang);
    const pt = proj.fromXY(a.x + len * Math.cos(ang), a.y + len * Math.sin(ang));
    if (pt && k % 4 === 0) pt.p = anchor.p; // ngang: đúng giá của điểm neo
    if (pt && Math.abs(k) === 2) pt.t = anchor.t; // dọc: đúng giờ của điểm neo
    return pt;
  }
  if (mods.magnet) {
    const m = magnetPoint(proj, x, y);
    if (m) return m;
  }
  return proj.fromXY(x, y);
}

/** Điểm neo cho Shift khi đang vẽ: điểm liền trước của đường. */
export const draftAnchor = (d: Drawing): Pt | null => (LINE_TYPES.includes(d.type) ? (d.pts[d.pts.length - 2] ?? null) : null);
/** Điểm neo cho Shift khi kéo chấm tròn thứ k. */
export const handleAnchor = (d: Drawing, k: number): Pt | null =>
  d.type === "path" ? (d.pts[k - 1] ?? d.pts[k + 1] ?? null) : LINE_TYPES.includes(d.type) ? (d.pts[1 - k] ?? null) : null;

/** Chấm tròn kéo được của hình (bút vẽ và chữ thì không có). */
export const handlesOf = (d: Drawing, P: XY[]): XY[] => (d.type === "brush" || d.type === "text" ? [] : P);

/** Ghi chú nằm trên đường, ở đầu bên phải, nghiêng theo đường. */
export function noteAnchor(d: Drawing, P: XY[], plotW: number): { x: number; y: number; ang: number } {
  if (d.type === "trend") {
    const [a, b] = P[0].x <= P[1].x ? [P[0], P[1]] : [P[1], P[0]];
    const x = Math.min(b.x, plotW - 4);
    const y = a.x === b.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (Math.abs(ang) > 90) ang += 180;
    return { x, y, ang };
  }
  if (d.type === "hray") return { x: plotW - 6, y: P[0].y, ang: 0 };
  if (d.type === "rect") return { x: Math.max(P[0].x, P[1].x) - 4, y: Math.min(P[0].y, P[1].y), ang: 0 };
  const q = P[P.length - 1];
  return { x: q.x, y: q.y, ang: 0 };
}

const segDist = (x: number, y: number, a: XY, b: XY) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
};

/** Điểm (x, y) có nằm trên thân hình (hoặc trên ghi chú của nó) không. */
export function bodyHit(d: Drawing, P: XY[], x: number, y: number, proj: Projector): boolean {
  const T = 6;
  if (d.note) {
    // xét điểm trong hệ trục đã xoay của ghi chú
    const a = noteAnchor(d, P, proj.plotW);
    const size = d.noteSize ?? 14;
    const w = d.note.length * size * 0.62;
    const r = (-a.ang * Math.PI) / 180;
    const u = a.x + (x - a.x) * Math.cos(r) - (y - a.y) * Math.sin(r);
    const v = a.y + (x - a.x) * Math.sin(r) + (y - a.y) * Math.cos(r);
    if (u >= a.x - w - 3 && u <= a.x + 3 && v >= a.y - 5 - size - 2 && v <= a.y - 2) return true;
  }
  switch (d.type) {
    case "trend":
      return segDist(x, y, P[0], P[1]) <= T;
    case "hray":
      return x >= P[0].x - T && Math.abs(y - P[0].y) <= T;
    case "brush":
    case "path":
      return P.some((q, i) => i > 0 && segDist(x, y, P[i - 1], q) <= T);
    case "text":
      return x >= P[0].x - 3 && x <= P[0].x + (d.text ?? "").length * 8 + 3 && y >= P[0].y - 17 && y <= P[0].y + 5;
    default: {
      // rect, fib, long, short: bên trong hộp
      const ys = d.type === "fib" ? FIB_LEVELS.map((lv) => proj.priceToY(fibPrice(d, lv)) ?? NaN) : P.map((q) => q.y);
      const xs = P.map((q) => q.x);
      return x >= Math.min(...xs) - T && x <= Math.max(...xs) + T && y >= Math.min(...ys) - T && y <= Math.max(...ys) + T;
    }
  }
}

/** Hình trên cùng dưới (x, y): k = chỉ số chấm tròn, -1 = thân hình. */
export function hitDrawing(list: Drawing[], selected: number | null, proj: Projector, x: number, y: number): { d: Drawing; k: number } | null {
  for (let j = list.length - 1; j >= 0; j--) {
    const d = list[j];
    const P = d.pts.map((pt) => proj.toXY(pt));
    if (P.some((q) => !q)) continue;
    const XYs = P as XY[];
    if (d.id === selected) {
      const k = handlesOf(d, XYs).findIndex((h) => Math.hypot(x - h.x, y - h.y) <= 7);
      if (k >= 0) return { d, k };
    }
    if (bodyHit(d, XYs, x, y, proj)) return { d, k: -1 };
  }
  return null;
}

/** Kéo cả hình đi (dl nến theo chiều ngang, dp giá theo chiều dọc), giữ đúng thời gian thật của từng điểm. */
export function shiftPoints(orig: Pt[], dl: number, dp: number, proj: Projector): Pt[] {
  return orig.map((o) => {
    const xy = proj.toXY(o);
    const moved = xy ? proj.fromXY(xy.x + dl * proj.axis.sp, xy.y) : null;
    return { t: moved ? moved.t : o.t, p: o.p + dp };
  });
}
