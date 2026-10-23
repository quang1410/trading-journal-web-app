import { extendSegment, type StatKey, type StatsPos, type Visibility } from "./drawStyle";
import type { LineStyle } from "./ict";
import type { Projector, Pt, XY } from "./projector";

/**
 * Hình vẽ trên chart: đường xu hướng, hình chữ nhật, tia ngang, bút vẽ, đường mũi tên, Fibonacci,
 * vị thế Long/Short, chữ. Mỗi điểm lưu (giờ UTC, giá). Hình gắn với mã (`sym`), không với chart.
 */

export const DRAW_TOOLS = ["trend", "rect", "hray", "brush", "path", "fib", "long", "short", "text"] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

export type EndCap = "normal" | "arrow";
/** Căn dọc của chữ trên hình; "inside" chỉ có ở hình chữ nhật. */
export type TextV = "top" | "middle" | "bottom" | "inside";
export type TextH = "left" | "center" | "right";

/**
 * Mọi trường kiểu dáng đều tuỳ chọn: thiếu thì lấy mặc định của công cụ (`TOOL_DEFAULTS`), nên phiên
 * lưu từ bản cũ mở ra vẫn đúng. Ghi chú (`note*`) chính là tab Text của TradingView.
 */
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
  noteV?: TextV;
  noteH?: TextH;
  /** tên ở tiêu đề cửa sổ Cài đặt (mặc định là tên công cụ) */
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  vis?: Visibility;
  // đường xu hướng (extL/extR dùng chung với hình chữ nhật)
  extL?: boolean;
  extR?: boolean;
  endL?: EndCap;
  endR?: EndCap;
  midPoint?: boolean;
  priceLabels?: boolean;
  stats?: StatKey[];
  statsPos?: StatsPos;
  statsAlways?: boolean;
  // tia ngang
  priceLabel?: boolean;
  // hình chữ nhật
  fill?: string;
  fillOn?: boolean;
  midLine?: boolean;
  midColor?: string;
  midWidth?: number;
  midDash?: LineStyle;
}

const BLUE = "var(--replay-draw)";
const PURPLE = "var(--replay-draw-rect)";

/** Mặc định của TradingView cho từng công cụ. */
export const TOOL_DEFAULTS: Record<DrawTool, Partial<Drawing>> = {
  trend: { color: BLUE, width: 2, dash: "solid", endL: "normal", endR: "normal", statsPos: "right", noteSize: 14, noteV: "top", noteH: "center" },
  hray: { color: BLUE, width: 2, dash: "solid", priceLabel: true, noteSize: 12, noteV: "bottom", noteH: "center" },
  rect: {
    color: PURPLE, width: 2, dash: "solid", fill: "var(--replay-draw-rect-fill)", fillOn: true,
    midColor: "var(--replay-draw-rect-mid)", midWidth: 1, midDash: "dashed", noteSize: 14, noteV: "inside", noteH: "center",
  },
  brush: { color: "var(--replay-draw-brush)", width: 2 },
  path: { color: BLUE, width: 2, dash: "solid", endL: "normal", endR: "arrow" },
  fib: {},
  long: {},
  short: {},
  text: { color: BLUE, noteSize: 14 },
};

/** Hình đã điền mặc định cho các trường còn thiếu. */
export function withDefaults(d: Drawing): Drawing {
  const out: Drawing = { ...TOOL_DEFAULTS[d.type] } as Drawing;
  for (const [k, v] of Object.entries(d)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}

/** Phần kiểu dáng của hình (bỏ toạ độ, chữ, tên, khoá, ẩn): để hình mới nhớ kiểu dùng lần trước. */
export function styleSnapshot(d: Drawing): Partial<Drawing> {
  // Visibility không phải kiểu dáng (TradingView cũng không nhớ): hình mới mà kế thừa "ẩn ở 1m" thì
  // vừa vẽ xong đã biến mất
  const { id: _i, sym: _s, type: _t, pts: _p, text: _x, note: _n, name: _m, locked: _l, hidden: _h, vis: _v, ...style } = d;
  return style;
}

/** Hình có tab Text trong cửa sổ Cài đặt. */
export const TEXT_TAB_TYPES: readonly DrawTool[] = ["trend", "hray", "rect"];
/** Hình có tab Coordinates. */
export const COORD_TYPES: readonly DrawTool[] = ["trend", "hray", "rect", "fib"];

/** Đường kẻ ngang hết chiều rộng chart ("Kẻ ngang"), của một mã. */
export interface HLine {
  sym: string;
  price: number;
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const fibPrice = (d: Drawing, lv: number): number => d.pts[1].p + (d.pts[0].p - d.pts[1].p) * lv;

const LINE_TYPES: readonly DrawTool[] = ["trend", "fib", "path"];

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

/**
 * Chấm tròn kéo được của hình (bút vẽ và chữ thì không có). Hình chữ nhật có 8 chấm như TradingView:
 * hai góc của hai điểm, hai góc còn lại, rồi giữa cạnh trên/dưới (theo điểm 0/1) và trái/phải.
 */
export function handlesOf(d: Drawing, P: XY[]): XY[] {
  if (d.type === "brush" || d.type === "text") return [];
  if (d.type !== "rect") return P;
  const [a, b] = P;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }, { x: mx, y: a.y }, { x: mx, y: b.y }, { x: a.x, y: my }, { x: b.x, y: my }];
}

/** Toạ độ mới của hình khi kéo chấm tròn `k` tới `pt` (theo thứ tự chấm của `handlesOf`). */
export function moveHandle(d: Drawing, k: number, pt: Pt): Pt[] {
  const pts = d.pts.map((q) => ({ ...q }));
  if (d.type !== "rect") {
    pts[k] = pt;
    return pts;
  }
  // [điểm nào đổi giờ, điểm nào đổi giá] của từng chấm; -1 = không đổi
  const MAP: Record<number, [number, number]> = { 0: [0, 0], 1: [1, 1], 2: [0, 1], 3: [1, 0], 4: [-1, 0], 5: [-1, 1], 6: [0, -1], 7: [1, -1] };
  const [ti, pi] = MAP[k] ?? [-1, -1];
  if (ti >= 0) pts[ti].t = pt.t;
  if (pi >= 0) pts[pi].p = pt.p;
  return pts;
}

/**
 * Chỗ đặt chữ (tab Text) của hình: điểm neo, góc xoay (theo đường), cách căn ngang và độ lệch dọc
 * `off` tính trong hệ trục đã xoay (âm = phía trên đường). `base` là dominant-baseline của SVG.
 */
export interface TextBox {
  x: number;
  y: number;
  ang: number;
  anchor: "start" | "middle" | "end";
  base: "auto" | "middle" | "hanging";
  off: number;
}

const GAP = 4;

export function textPlacement(d: Drawing, P: XY[], plotW: number): TextBox {
  const s = withDefaults(d);
  const h = s.noteH ?? "center";
  const v = s.noteV ?? "top";
  const anchor = h === "left" ? "start" : h === "right" ? "end" : "middle";
  const vert = (top: number, bottom: number, mid: number) =>
    v === "top" ? { y: top, base: "auto" as const, off: -GAP } : v === "bottom" ? { y: bottom, base: "hanging" as const, off: GAP } : { y: mid, base: "middle" as const, off: 0 };
  if (d.type === "rect") {
    const L = s.extL ? 0 : Math.min(P[0].x, P[1].x);
    const R = s.extR ? plotW : Math.max(P[0].x, P[1].x);
    const top = Math.min(P[0].y, P[1].y);
    const bot = Math.max(P[0].y, P[1].y);
    const x = h === "left" ? L + GAP : h === "right" ? R - GAP : (L + R) / 2;
    return { x, ang: 0, anchor, ...vert(top, bot, (top + bot) / 2) };
  }
  if (d.type === "hray") {
    const x0 = P[0].x;
    const x = h === "left" ? x0 + GAP : h === "right" ? plotW - GAP : (x0 + plotW) / 2;
    return { x, ang: 0, anchor, ...vert(P[0].y, P[0].y, P[0].y) };
  }
  if (P.length > 1) {
    // đường: neo ở đầu trái / giữa / đầu phải, xoay theo đường (chữ không bao giờ lộn ngược)
    const [a, b] = P[0].x <= P[1].x ? [P[0], P[1]] : [P[1], P[0]];
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (Math.abs(ang) > 90) ang += 180;
    const q = h === "left" ? a : h === "right" ? b : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { x: q.x, ang, anchor, ...vert(q.y, q.y, q.y) };
  }
  return { x: P[0].x, ang: 0, anchor, ...vert(P[0].y, P[0].y, P[0].y) };
}

/** Điểm (x, y) có nằm trên chữ của hình không (xét trong hệ trục đã xoay của chữ). */
function noteHit(d: Drawing, P: XY[], x: number, y: number, plotW: number): boolean {
  if (!d.note) return false;
  const tb = textPlacement(d, P, plotW);
  const size = d.noteSize ?? withDefaults(d).noteSize ?? 14;
  const w = d.note.length * size * 0.62;
  const r = (-tb.ang * Math.PI) / 180;
  const u = tb.x + (x - tb.x) * Math.cos(r) - (y - tb.y) * Math.sin(r);
  const v = tb.y + (x - tb.x) * Math.sin(r) + (y - tb.y) * Math.cos(r) - tb.off;
  const x0 = tb.anchor === "start" ? tb.x : tb.anchor === "end" ? tb.x - w : tb.x - w / 2;
  const y0 = tb.base === "auto" ? tb.y - size : tb.base === "hanging" ? tb.y : tb.y - size / 2;
  return u >= x0 - 3 && u <= x0 + w + 3 && v >= y0 - 2 && v <= y0 + size + 2;
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
  if (noteHit(d, P, x, y, proj.plotW)) return true;
  switch (d.type) {
    case "trend": {
      const [a, b] = extendSegment(P[0], P[1], !!d.extL, !!d.extR, proj.plotW);
      return segDist(x, y, a, b) <= T;
    }
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
      if (d.type === "rect" && d.extL) xs.push(0);
      if (d.type === "rect" && d.extR) xs.push(proj.plotW);
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
