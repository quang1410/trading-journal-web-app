import { dayShift, localToUtc, toLocal, type Zone } from "./time";
import type { Candle } from "./types";

/**
 * Đổi (giờ UTC, giá) <-> toạ độ pixel trên chart.
 *
 * Trục ngang của lightweight-charts là "logical index" (0 = nến đầu, 1 = nến kế…). Hình vẽ lưu theo
 * thời gian thật nên phải nội suy: giữa hai nến thì chia tỉ lệ theo thời gian, ngoài vùng nến thì
 * kéo dài theo độ dài một nến. Nhờ vậy hình giữ đúng chỗ khi cuộn, zoom, đổi khung hay đổi múi giờ.
 */

export interface Pt {
  /** giờ UTC (giây) */
  t: number;
  p: number;
}
export interface XY {
  x: number;
  y: number;
}
/** logicalToCoordinate(l) = a + l * sp */
export interface Axis {
  a: number;
  sp: number;
}

const barSec = (tf: number) => Math.min(tf, 1440) * 60;

/** Giờ chart (local, như time của nến) → logical index, có nội suy. */
export function timeToLogical(candles: Candle[], tf: number, ct: number): number | null {
  const n = candles.length;
  if (!n) return null;
  const c = candles;
  if (ct <= c[0].time) return (ct - c[0].time) / barSec(tf);
  if (ct >= c[n - 1].time) return n - 1 + (ct - c[n - 1].time) / barSec(tf);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m].time <= ct) lo = m;
    else hi = m;
  }
  return lo + (ct - c[lo].time) / (c[hi].time - c[lo].time);
}

export function logicalToTime(candles: Candle[], tf: number, l: number): number | null {
  const n = candles.length;
  if (!n) return null;
  const c = candles;
  if (l <= 0) return c[0].time + l * barSec(tf);
  if (l >= n - 1) return c[n - 1].time + (l - (n - 1)) * barSec(tf);
  const i = Math.floor(l);
  return c[i].time + (l - i) * (c[i + 1].time - c[i].time);
}

export interface Projector {
  plotW: number;
  plotH: number;
  axis: Axis;
  toXY(pt: Pt): XY | null;
  fromXY(x: number, y: number): Pt | null;
  priceToY(p: number): number | null;
  yToPrice(y: number): number | null;
  /** x của nến chart có chỉ số k */
  xOfIndex(k: number): number;
  /** x của một mốc giờ UTC */
  xOfTime(t: number): number | null;
  /** nến chart gần x nhất, kèm giờ UTC của nó */
  candleAt(x: number): (Candle & { t: number }) | null;
}

export function makeProjector(o: {
  candles: Candle[];
  tf: number;
  zone: Zone;
  axis: Axis;
  plotW: number;
  plotH: number;
  priceToY: (p: number) => number | null;
  yToPrice: (y: number) => number | null;
}): Projector {
  const { candles, tf, zone, axis } = o;
  const shift = dayShift(tf, zone);
  const xOfTime = (t: number) => {
    const l = timeToLogical(candles, tf, toLocal(t, zone) + shift);
    return l == null ? null : axis.a + l * axis.sp;
  };
  return {
    plotW: o.plotW,
    plotH: o.plotH,
    axis,
    priceToY: o.priceToY,
    yToPrice: o.yToPrice,
    xOfIndex: (k) => axis.a + k * axis.sp,
    xOfTime,
    toXY(pt) {
      const x = xOfTime(pt.t);
      const y = o.priceToY(pt.p);
      return x == null || y == null ? null : { x, y };
    },
    fromXY(x, y) {
      const ct = logicalToTime(candles, tf, (x - axis.a) / axis.sp);
      const p = o.yToPrice(y);
      return ct == null || p == null ? null : { t: localToUtc(ct - shift, zone), p };
    },
    candleAt(x) {
      const k = Math.round((x - axis.a) / axis.sp);
      const c = candles[k];
      return c ? { ...c, t: localToUtc(c.time - shift, zone) } : null;
    },
  };
}
