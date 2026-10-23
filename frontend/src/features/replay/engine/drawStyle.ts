import type { Pt, XY } from "./projector";

/**
 * Phần thuần của việc tuỳ chỉnh hình vẽ (giống TradingView): bảng màu, màu ↔ độ trong suốt, ẩn/hiện
 * theo khung thời gian, số liệu của đường xu hướng, kéo dài đoạn thẳng tới mép chart.
 */

/** Lưới màu 10 cột × 8 hàng (xám, 10 màu gốc, 6 hàng nhạt → đậm); giá trị nằm ở replay.css. */
export const TV_PALETTE: readonly string[] = Array.from({ length: 80 }, (_, i) => `var(--replay-tv-${i})`);

export const WIDTHS = [1, 2, 3, 4] as const;
export const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40] as const;

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Tách chuỗi màu (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) thành mã 6 chữ số và độ đục 0–1. */
export function parseColor(c: string): { hex: string; a: number } {
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return { hex: `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`, a: 1 };
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { hex: `#${m[1]}`, a: m[2] ? Math.round((+`0x${m[2]}` / 255) * 100) / 100 : 1 };
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(s);
  if (m) return { hex: `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`, a: m[4] == null ? 1 : +m[4] };
  return { hex: `#${"0".repeat(6)}`, a: 1 };
}

/** Màu với độ đục `a` (làm tròn 1%); đục hẳn thì trả mã hex. */
export function withAlpha(hex: string, a: number): string {
  const op = Math.round(Math.max(0, Math.min(1, a)) * 100) / 100;
  if (op >= 1) return hex;
  const n = +`0x${hex.slice(1)}`;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${op})`;
}

// ---------- ẩn/hiện theo khung ----------

export interface VisRow {
  on: boolean;
  from: number;
  to: number;
}
/** Tab Visibility: chỉ các họ khung replay có (phút, giờ, ngày). */
export interface Visibility {
  min: VisRow;
  hour: VisRow;
  day: VisRow;
}
export const VIS_MAX: Record<keyof Visibility, number> = { min: 59, hour: 24, day: 366 };
export const defaultVisibility = (): Visibility => ({
  min: { on: true, from: 1, to: VIS_MAX.min },
  hour: { on: true, from: 1, to: VIS_MAX.hour },
  day: { on: true, from: 1, to: VIS_MAX.day },
});

/** Hình có hiện ở khung `tf` (phút) không. */
export function visibleOnTf(vis: Visibility | undefined, tf: number): boolean {
  if (!vis) return true;
  const [row, n] = tf >= 1440 ? [vis.day, tf / 1440] : tf >= 60 ? [vis.hour, tf / 60] : [vis.min, tf];
  return row.on && n >= row.from && n <= row.to;
}

// ---------- số liệu của đường xu hướng ----------

export const STAT_KEYS = ["priceRange", "percent", "ticks", "bars", "dateRange", "distance", "angle"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const STATS_POS = ["left", "center", "right", "auto"] as const;
export type StatsPos = (typeof STATS_POS)[number];

export interface TrendStats {
  change: number;
  percent: number;
  ticks: number;
  bars: number;
  seconds: number;
  /** pixel trên màn hình */
  distance: number;
  /** độ, lên trên là dương */
  angle: number;
}

/** Số liệu từ điểm `a` tới điểm `b`; `dx`/`dy` là khoảng cách pixel trên màn hình. */
export function trendStats(a: Pt, b: Pt, ctx: { tick: number; tf: number; dx: number; dy: number }): TrendStats {
  const change = b.p - a.p;
  return {
    change,
    percent: a.p ? (change / a.p) * 100 : 0,
    ticks: Math.round(change / ctx.tick),
    bars: Math.round((b.t - a.t) / (ctx.tf * 60)),
    seconds: b.t - a.t,
    distance: Math.hypot(ctx.dx, ctx.dy),
    angle: (Math.atan2(-ctx.dy, ctx.dx) * 180) / Math.PI,
  };
}

// ---------- hình học ----------

/** Kéo dài đoạn a–b về bên trái (tới x = 0) và/hoặc bên phải (tới x = W), giữ thứ tự a, b. */
export function extendSegment(a: XY, b: XY, left: boolean, right: boolean, W: number): [XY, XY] {
  if (a.x === b.x || (!left && !right)) return [a, b];
  const k = (b.y - a.y) / (b.x - a.x);
  const at = (x: number): XY => ({ x, y: a.y + k * (x - a.x) });
  const aLeft = a.x < b.x;
  const L = left ? at(0) : aLeft ? a : b;
  const R = right ? at(W) : aLeft ? b : a;
  return aLeft ? [L, R] : [R, L];
}
