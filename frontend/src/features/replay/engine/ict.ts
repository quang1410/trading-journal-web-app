import { bucketOf, nyDst, type Zone } from "./time";
import type { Dataset } from "./types";

/**
 * Indicator "My ICT" (port từ Pine Script v6 của chủ sản phẩm): killzones, pivot của killzone,
 * mức giá mở cửa theo giờ (True Day Open), mốc thời gian dọc, macros.
 *
 * Chỉ đọc các nến 1m tới `d.cur` (nến replay đã hiện), nên không bao giờ lộ giá tương lai.
 * Màu là chuỗi màu CSS bất kỳ; mặc định là biến `--replay-*` khai trong replay.css.
 */

export type LineStyle = "solid" | "dotted" | "dashed";
export const DASH: Record<LineStyle, string> = { solid: "", dotted: "1.5 3", dashed: "6 4" };
export const LINE_STYLES: readonly LineStyle[] = ["solid", "dotted", "dashed"];
export const LABEL_SIZES = ["Auto", "Tiny", "Small", "Normal", "Large", "Huge"] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];
export const LABEL_PX: Record<LabelSize, number> = { Auto: 11, Tiny: 9, Small: 10, Normal: 12, Large: 14, Huge: 18 };

export interface IctSession { on: boolean; name: string; start: string; end: string; color: string }
export interface IctLevel { on: boolean; name: string; time: string; color: string }
export interface IctVertical { on: boolean; time: string; color: string }
export interface IctMacro { on: boolean; start: string; end: string; top: boolean; bot: boolean }
export interface SmtSettings {
  on: boolean;
  /** "auto" = mã còn lại của cặp NQ ↔ ES */
  other: string;
  len: number;
  highs: boolean;
  lows: boolean;
  bearColor: string;
  bullColor: string;
  style: LineStyle;
  width: number;
  label: boolean;
  text: string;
  alert: boolean;
}

export interface IctSettings {
  on: boolean;
  /** "America/New_York" (có giờ mùa hè) hoặc "GMT±N" (không đổi theo mùa, giống bản Pine) */
  tz: string;
  /** "Session Drawing Limit": mỗi loại giữ bao nhiêu lần gần nhất */
  maxDays: number;
  tfMin: number;
  tfMax: number;
  boxes: boolean;
  boxText: boolean;
  /** độ trong suốt của hộp, 0–100 */
  boxAlpha: number;
  sessions: IctSession[];
  pivots: boolean;
  pivotPrice: boolean;
  labelSize: LabelSize;
  pivotStyle: LineStyle;
  pivotWidth: number;
  levels: IctLevel[];
  levelStyle: LineStyle;
  levelWidth: number;
  verticals: IctVertical[];
  vStyle: LineStyle;
  vWidth: number;
  macroTf: number;
  macroDist: number;
  macros: IctMacro[];
  smt: SmtSettings;
}

const token = (name: string) => `var(--replay-${name})`;

export const ICT_TIMEZONES: readonly string[] = [
  "America/New_York",
  ...Array.from({ length: 27 }, (_, i) => {
    const n = i - 12;
    return `GMT${n < 0 ? n : `+${n}`}`;
  }),
];

export function defaultIct(): IctSettings {
  return {
    on: true,
    tz: "America/New_York",
    maxDays: 1,
    tfMin: 1,
    tfMax: 60,
    boxes: true,
    boxText: true,
    boxAlpha: 90,
    sessions: [
      { on: true, name: "Asia", start: "20:00", end: "00:00", color: token("pine-yellow") },
      { on: true, name: "London", start: "02:00", end: "05:00", color: token("pine-blue") },
      { on: true, name: "NY AM", start: "09:30", end: "11:00", color: token("pine-red") },
      { on: true, name: "NY Lunch", start: "12:00", end: "13:00", color: token("pine-gray") },
      { on: true, name: "NY PM", start: "13:30", end: "16:00", color: token("pine-purple") },
    ],
    pivots: true,
    pivotPrice: false,
    labelSize: "Normal",
    pivotStyle: "solid",
    pivotWidth: 1,
    levels: [
      { on: true, name: "True Day Open", time: "00:00", color: token("pine-green") },
      { on: false, name: "06:00", time: "06:00", color: token("pine-black") },
      { on: false, name: "10:00", time: "10:00", color: token("pine-black") },
      { on: false, name: "14:00", time: "14:00", color: token("pine-black") },
      { on: false, name: "00:00", time: "00:00", color: token("pine-black") },
    ],
    levelStyle: "dotted",
    levelWidth: 1,
    verticals: [0, 1, 2, 3].map(() => ({ on: false, time: "00:00", color: token("pine-black") })),
    vStyle: "dotted",
    vWidth: 1,
    macroTf: 3,
    macroDist: 0.5,
    macros: [
      { on: true, start: "09:50", end: "10:10", top: true, bot: true },
      { on: true, start: "10:50", end: "11:10", top: true, bot: true },
      { on: true, start: "14:50", end: "15:10", top: true, bot: true },
      { on: true, start: "08:20", end: "08:40", top: true, bot: true },
      { on: false, start: "15:50", end: "16:10", top: true, bot: true },
    ],
    smt: {
      on: true,
      other: "auto",
      len: 3,
      highs: true,
      lows: true,
      bearColor: token("pine-red"),
      bullColor: token("pine-green"),
      style: "solid",
      width: 1,
      label: true,
      text: "SMT",
      alert: false,
    },
  };
}

/** Ghép cài đặt đã lưu lên mặc định: thêm trường mới vào bản lưu cũ, bỏ trường không còn dùng. */
export function mergeDeep<T>(base: T, saved: unknown): T {
  if (Array.isArray(base)) return base.map((b, i) => mergeDeep(b, Array.isArray(saved) ? saved[i] : undefined)) as T;
  if (base && typeof base === "object") {
    const src = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(base)) out[k] = mergeDeep((base as Record<string, unknown>)[k], src[k]);
    return out as T;
  }
  return saved === undefined || saved === null || typeof saved !== typeof base ? base : (saved as T);
}

/** Số giây cộng vào giờ UTC để ra giờ của indicator. */
export function ictOffset(t: number, tz: string): number {
  if (tz === "America/New_York") {
    const [s, e] = nyDst(new Date(t * 1000).getUTCFullYear());
    return t >= s && t < e ? -4 * 3600 : -5 * 3600;
  }
  const n = +tz.replace("GMT", "");
  return (Number.isFinite(n) ? n : 0) * 3600;
}
const minuteOfDay = (t: number, tz: string) => (((Math.floor((t + ictOffset(t, tz)) / 60) % 1440) + 1440) % 1440);
export const hmOf = (s: string): number => {
  const [h, m] = String(s).split(":").map((x) => +x);
  return ((((h || 0) * 60 + (m || 0)) % 1440) + 1440) % 1440;
};
/** Như session "HHMM-HHMM" của Pine: start <= phút < end; end <= start là qua nửa đêm. */
export const inRange = (m: number, a: number, b: number): boolean => (a < b ? m >= a && m < b : a > b ? m >= a || m < b : false);

export interface IctBox { t0: number; t1: number; hi: number; lo: number; color: string; text: string }
export interface IctLine { t0: number; t1: number; p: number; color: string; dash: string; w: number; label: string; size: number }
export interface IctVLine { t: number; color: string; dash: string; w: number }
export interface IctMacroBox { t0: number; t1: number; top: number | null; bot: number | null; label: string }
export interface IctModel { boxes: IctBox[]; lines: IctLine[]; vlines: IctVLine[]; macros: IctMacroBox[] }

export const ictEmpty = (m: IctModel | null): boolean =>
  !m || !(m.boxes.length || m.lines.length || m.vlines.length || m.macros.length);

/**
 * Mọi thứ indicator vẽ trên chart khung `tf` của mã `d`, theo (giờ UTC, giá).
 * `macroLabel` dựng nhãn macro (chuỗi hiển thị nằm ở strings.ts).
 */
export function ictModel(d: Dataset, tf: number, zone: Zone, s: IctSettings, macroLabel: (start: string) => string): IctModel {
  const out: IctModel = { boxes: [], lines: [], vlines: [], macros: [] };
  if (!s.on || d.cur < 0) return out;
  const kzOn = tf >= s.tfMin && tf <= s.tfMax;
  const mcOn = tf <= s.macroTf;
  if (!kzOn && !mcOn) return out;
  const keep = Math.max(1, Math.trunc(s.maxDays) || 1);
  const lo = Math.max(0, d.cur - 1440 * (keep + 2));
  const n = d.cur - lo + 1;
  const last = n - 1;
  // Như Pine trên khung của chart: một nến 1m được tính theo giờ mở của nến chart chứa nó.
  const bt = new Float64Array(n);
  const bm = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    const i = lo + k;
    bt[k] = d.T[i] - (d.LT[i] - bucketOf(d.LT[i], tf, zone));
    bm[k] = minuteOfDay(bt[k], s.tz);
  }
  type Run = { k0: number; k1: number };
  // các đoạn nến liên tiếp thoả test(phút); cách nhau quá 6 tiếng là đoạn mới
  const runs = (test: (m: number) => boolean): Run[] => {
    const r: Run[] = [];
    let cur: Run | null = null;
    for (let k = 0; k < n; k++) {
      if (!test(bm[k])) {
        cur = null;
        continue;
      }
      if (!cur || bt[k] - bt[k - 1] > 21600) r.push((cur = { k0: k, k1: k }));
      else cur.k1 = k;
    }
    return r;
  };
  const hiLo = (r: Run): [number, number] => {
    let h = -Infinity;
    let l = Infinity;
    for (let k = r.k0; k <= r.k1; k++) {
      h = Math.max(h, d.H[lo + k]);
      l = Math.min(l, d.L[lo + k]);
    }
    return [h, l];
  };
  const size = LABEL_PX[s.labelSize] ?? 12;
  if (kzOn) {
    for (const ses of s.sessions) {
      if (!ses.on) continue;
      const a = hmOf(ses.start);
      const b = hmOf(ses.end);
      const all = runs((m) => inRange(m, a, b));
      for (const r of all.slice(-keep)) {
        const [h, l] = hiLo(r);
        const live = r.k1 === last; // phiên vẫn đang chạy ở nến hiện tại
        if (s.boxes) out.boxes.push({ t0: bt[r.k0], t1: bt[r.k1], hi: h, lo: l, color: ses.color, text: s.boxText ? ses.name : "" });
        if (!s.pivots) continue;
        // Sau phiên, pivot kéo sang phải tới nến phá nó (high > đỉnh / low < đáy). Chỉ pivot mới nhất
        // còn kéo ("Most Recent"): pivot cũ dừng lại khi phiên cùng loại tiếp theo bắt đầu.
        const next = all[all.indexOf(r) + 1];
        const stop = next ? next.k0 - 1 : last;
        const end = (broke: (i: number) => boolean) => {
          if (live) return last;
          for (let k = r.k1 + 1; k <= stop; k++) if (broke(lo + k)) return k;
          return Math.max(r.k1, stop);
        };
        const label = (name: string, v: number) => (s.pivotPrice ? `${name} (${v.toFixed(2)})` : name);
        const line = (v: number, k1: number, name: string): IctLine => ({
          t0: bt[r.k0], t1: bt[k1], p: v, color: ses.color, dash: DASH[s.pivotStyle], w: s.pivotWidth, label: label(name, v), size,
        });
        out.lines.push(line(h, end((i) => d.H[i] > h), `${ses.name}.H`), line(l, end((i) => d.L[i] < l), `${ses.name}.L`));
      }
    }
    for (const lv of s.levels) {
      // giá mở cửa ở một giờ cố định (True Day Open = 00:00 New York)
      if (!lv.on) continue;
      const a = hmOf(lv.time);
      const all = runs((m) => m === a);
      for (const r of all.slice(-keep)) {
        const next = all[all.indexOf(r) + 1];
        out.lines.push({
          t0: bt[r.k0], t1: bt[next ? next.k0 - 1 : last], p: d.O[lo + r.k0], color: lv.color, dash: DASH[s.levelStyle], w: s.levelWidth, label: lv.name, size,
        });
      }
    }
    for (const v of s.verticals) {
      if (!v.on) continue;
      const a = hmOf(v.time);
      for (const r of runs((m) => m === a).slice(-keep)) out.vlines.push({ t: bt[r.k0], color: v.color, dash: DASH[s.vStyle], w: s.vWidth });
    }
  }
  if (mcOn) {
    const dist = +s.macroDist || 0;
    for (const mc of s.macros) {
      if (!mc.on) continue;
      const a = hmOf(mc.start);
      const b = hmOf(mc.end);
      for (const r of runs((m) => inRange(m, a, b)).slice(-keep)) {
        const [h, l] = hiLo(r);
        out.macros.push({ t0: bt[r.k0], t1: bt[r.k1], top: mc.top ? h + dist : null, bot: mc.bot ? l - dist : null, label: macroLabel(mc.start) });
      }
    }
  }
  return out;
}
