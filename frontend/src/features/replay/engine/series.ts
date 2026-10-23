import { bucketOf, computeLocal, type Zone } from "./time";
import type { Bars, Candle, Dataset } from "./types";

/** Số nến tối đa dựng cho một chart (đủ cuộn ngược, không làm chậm chart). */
export const MAX_CANDLES = 4000;

/** Chỉ số đầu tiên có arr[i] >= x. */
export function lowerBound(arr: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Nến 1m cuối cùng có T <= t (-1 = chưa có nến nào). */
export const upperIdx = (d: Bars, t: number): number => lowerBound(d.T, t + 0.5) - 1;

/**
 * Gộp hai dãy nến 1m (đều tăng dần theo giờ) thành một: nến trùng giờ lấy bản của `b` (bản mới kéo về
 * thay nến cũ, ví dụ nến cuối lần trước kéo khi phút chưa đóng). Chỉ đọc cột nến, trả mảng mới.
 * Đầu vào hỏng (giờ không phải số, trùng hay lùi trong cùng một dãy) thì bỏ nến đó: chỉ số nến của
 * replay dựa vào việc giờ tăng ngặt.
 */
export function mergeBars(a: Bars, b: Bars): Bars {
  const cap = a.n + b.n;
  const out = { T: new Float64Array(cap), O: new Float64Array(cap), H: new Float64Array(cap), L: new Float64Array(cap), C: new Float64Array(cap), V: new Float64Array(cap) };
  const keys = ["T", "O", "H", "L", "C", "V"] as const;
  let i = 0;
  let j = 0;
  let n = 0;
  const take = (src: Bars, k: number) => {
    if (!Number.isFinite(src.T[k]) || (n > 0 && src.T[k] <= out.T[n - 1])) return;
    for (const c of keys) out[c][n] = src[c][k];
    n++;
  };
  while (i < a.n || j < b.n) {
    if (j >= b.n || (i < a.n && a.T[i] < b.T[j])) take(a, i++);
    else {
      if (i < a.n && a.T[i] === b.T[j]) i++;
      take(b, j++);
    }
  }
  return { n, T: out.T.slice(0, n), O: out.O.slice(0, n), H: out.H.slice(0, n), L: out.L.slice(0, n), C: out.C.slice(0, n), V: out.V.slice(0, n) };
}

export function makeDataset(name: string, bars: Bars, zone: Zone, now: number): Dataset {
  const d: Dataset = { ...bars, name, LT: computeLocal(bars.T, zone), cur: -1 };
  d.cur = upperIdx(d, now);
  return d;
}

/** Chỉ số nến 1m đầu tiên thuộc nến khung `tf` mở SAU `time` (giờ local của nến). */
export function firstBucketAfter(d: Dataset, time: number, tf: number, zone: Zone): number {
  let lo = 0;
  let hi = d.n;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (bucketOf(d.LT[m], tf, zone) <= time) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Số nến 1m tính từ `from` tới hết nến khung `tf` hiện tại (hoặc kế tiếp, nếu `from` là nến cuối của nó). */
export function barsToCandleEnd(d: Dataset, tf: number, from: number, zone: Zone): number {
  let n = 0;
  let i = from;
  do {
    i++;
    n++;
  } while (i < d.n - 1 && bucketOf(d.LT[i + 1], tf, zone) === bucketOf(d.LT[i], tf, zone));
  return n;
}

/**
 * Giờ UTC sau `k` bước khung `tf`, đếm trên mã `d`. Mã đó hết data thì tiến tới nến kế tiếp
 * của các mã còn lại; tất cả đều hết thì trả null.
 */
export function stepTarget(d: Dataset, all: Dataset[], tf: number, k: number, zone: Zone): number | null {
  let i = d.cur;
  for (let s = 0; s < k && i < d.n - 1; s++) i += barsToCandleEnd(d, tf, i, zone);
  if (i > d.cur) return d.T[Math.min(i, d.n - 1)];
  const next = Math.min(...all.map((x) => (x.cur + 1 < x.n ? x.T[x.cur + 1] : Infinity)));
  return Number.isFinite(next) ? next : null;
}

/** Gộp nến 1m thứ `i` vào nến cuối của `candles` (hoặc mở nến mới). Trả về nến vừa đổi. */
export function pushBar(candles: Candle[], d: Dataset, i: number, tf: number, zone: Zone): Candle {
  const b = bucketOf(d.LT[i], tf, zone);
  const last = candles[candles.length - 1];
  if (last && last.time === b) {
    last.high = Math.max(last.high, d.H[i]);
    last.low = Math.min(last.low, d.L[i]);
    last.close = d.C[i];
    return last;
  }
  const c = { time: b, open: d.O[i], high: d.H[i], low: d.L[i], close: d.C[i] };
  candles.push(c);
  return c;
}

/** Dựng nến khung `tf` từ nến 1m, tới nến hiện tại (`d.cur`). Không bao giờ chạm nến tương lai. */
export function buildCandles(d: Dataset, tf: number, zone: Zone, max = MAX_CANDLES): Candle[] {
  const candles: Candle[] = [];
  const i0 = Math.max(0, d.cur - Math.min(tf, 1440) * max);
  for (let i = i0; i <= d.cur; i++) pushBar(candles, d, i, tf, zone);
  return candles;
}
