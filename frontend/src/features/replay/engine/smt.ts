import { bucketOf, type Zone } from "./time";
import { lowerBound } from "./series";
import type { SmtSettings } from "./ict";
import type { Candle, Dataset } from "./types";

/**
 * SMT Divergence, dựng lại theo mô tả của "SMT Divergence [TFO]" (script gốc đóng mã nguồn).
 *
 * Tìm pivot (đỉnh/đáy cục bộ) trên nến chart của mã này, so với đỉnh/đáy của mã còn lại ở cùng
 * chỗ. Hai pivot liền nhau là SMT khi hai mã đi ngược nhau (một bên đỉnh cao hơn, bên kia đỉnh thấp
 * hơn; tương tự với đáy) và nối được một đường sạch (không nến nào cắt qua). Pivot chỉ được xác nhận
 * sau `len` nến bên phải, nên không lộ tương lai.
 */

export interface SmtLine {
  /** chỉ số nến chart của hai pivot */
  k0: number;
  k1: number;
  p0: number;
  p1: number;
  bull: boolean;
  /** giờ local mở nến của pivot sau, để nhận ra cùng một SMT qua các lần tính lại */
  time: number;
}

/** Mã so sánh: theo cài đặt, không thì mã còn lại của cặp US100 ↔ US500 (kể cả bản DEMO). */
export function pickOther(mine: string, names: string[], wanted: string): string | null {
  if (wanted && wanted !== "auto" && names.includes(wanted) && wanted !== mine) return wanted;
  const others = names.filter((n) => n !== mine);
  const pair = ({ US100: "US500", US500: "US100" } as Record<string, string>)[mine.replace(/^DEMO /i, "").replace(/_m1$/i, "").toUpperCase()];
  return others.find((n) => pair && n.replace(/_m1$/i, "").toUpperCase().endsWith(pair)) ?? others[0] ?? null;
}

export function smtModel(candles: Candle[], other: Dataset, tf: number, zone: Zone, cfg: SmtSettings): SmtLine[] {
  const n = candles.length;
  if (!n || other.cur < 0) return [];
  // nến của mã so sánh trên cùng các mốc (cùng khung, cùng thời điểm replay)
  const at = new Map(candles.map((c, k) => [c.time, k]));
  const oh = new Float64Array(n).fill(NaN);
  const ol = new Float64Array(n).fill(NaN);
  for (let i = Math.max(0, lowerBound(other.LT, candles[0].time - 86400)); i <= other.cur; i++) {
    const k = at.get(bucketOf(other.LT[i], tf, zone));
    if (k === undefined) continue;
    oh[k] = Number.isNaN(oh[k]) ? other.H[i] : Math.max(oh[k], other.H[i]);
    ol[k] = Number.isNaN(ol[k]) ? other.L[i] : Math.min(ol[k], other.L[i]);
  }
  const L = Math.max(1, Math.trunc(cfg.len) || 1);
  const last = n - 1;
  // như ta.pivothigh/low của Pine: cao (thấp) nhất trong L nến mỗi bên, hoà với nến bên trái thì không tính
  const isPivot = (v: (k: number) => number, k: number, hi: boolean) => {
    for (let j = k - L; j <= k + L; j++) {
      if (j === k) continue;
      const beaten = hi ? v(j) > v(k) : v(j) < v(k);
      if (beaten || (j < k && v(j) === v(k))) return false;
    }
    return true;
  };
  // đỉnh/đáy của mã so sánh quanh pivot (±L nến)
  const near = (arr: Float64Array, k: number, hi: boolean) => {
    let r = NaN;
    for (let j = Math.max(0, k - L); j <= Math.min(last, k + L); j++) {
      if (Number.isNaN(arr[j])) continue;
      r = Number.isNaN(r) ? arr[j] : hi ? Math.max(r, arr[j]) : Math.min(r, arr[j]);
    }
    return r;
  };
  const out: SmtLine[] = [];
  for (const hi of [true, false]) {
    if (hi ? !cfg.highs : !cfg.lows) continue;
    const v = hi ? (k: number) => candles[k].high : (k: number) => candles[k].low;
    const arr = hi ? oh : ol;
    let prev = -1;
    for (let k = L; k + L <= last; k++) {
      if (!isPivot(v, k, hi)) continue;
      if (prev >= 0) {
        const a = v(prev);
        const b = v(k);
        const oa = near(arr, prev, hi);
        const ob = near(arr, k, hi);
        let ok = !Number.isNaN(oa) && !Number.isNaN(ob) && ((b > a && ob < oa) || (b < a && ob > oa));
        for (let j = prev + 1; ok && j < k; j++) {
          const y = a + ((b - a) * (j - prev)) / (k - prev);
          if (hi ? v(j) > y : v(j) < y) ok = false;
        }
        if (ok) out.push({ k0: prev, k1: k, p0: a, p1: b, bull: !hi, time: candles[k].time });
      }
      prev = k;
    }
  }
  return out.sort((x, y) => x.k1 - y.k1);
}

/** SMT vừa được xác nhận đúng ở nến cuối (để báo "có SMT mới"). */
export function freshSmt(lines: SmtLine[], candleCount: number, len: number): SmtLine | null {
  const nw = lines[lines.length - 1];
  return nw && nw.k1 + Math.max(1, Math.trunc(len) || 1) === candleCount - 1 ? nw : null;
}
