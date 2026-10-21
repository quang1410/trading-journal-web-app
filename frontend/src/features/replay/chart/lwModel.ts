import { ColorType, CrosshairMode, type LineStyle } from "lightweight-charts";
import type { HLine } from "../engine/drawings";
import type { ChartStyle } from "../engine/style";
import { bucketOf, type Zone } from "../engine/time";
import type { Pending, Position, Trade } from "../engine/trading";
import type { Candle, Dataset } from "../engine/types";

/**
 * Chuyển trạng thái replay sang thứ lightweight-charts cần (tuỳ chọn chart, màu nến, marker,
 * đường giá). Thuần dữ liệu: nhận một hàm `color` để đổi chuỗi màu CSS ra màu cụ thể, nên test
 * được mà không cần canvas.
 */

export type Resolve = (css: string) => string;
const CLEAR = "rgba(0,0,0,0)";

export function chartOptions(s: ChartStyle, color: Resolve, watermarkText: string) {
  const cross = { color: color(s.crosshair), style: s.crossStyle as LineStyle, labelBackgroundColor: color("var(--surface-inverted)") };
  return {
    layout: { background: { type: ColorType.Solid, color: color(s.bg) }, textColor: color(s.textColor), fontSize: s.fontSize },
    grid: { vertLines: { visible: s.vGrid, color: color(s.vGridColor) }, horzLines: { visible: s.hGrid, color: color(s.hGridColor) } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: cross, horzLine: cross },
    watermark: {
      visible: s.watermark !== "none" && watermarkText !== "", text: watermarkText, color: color(s.watermarkColor), fontSize: 44,
      horzAlign: "center" as const, vertAlign: "center" as const,
    },
    rightPriceScale: { borderColor: color(s.lineColor), scaleMargins: { top: s.marginTop / 100, bottom: s.marginBottom / 100 } },
    timeScale: { borderColor: color(s.lineColor), rightOffset: s.rightBars },
  };
}

export function seriesOptions(s: ChartStyle, color: Resolve) {
  return {
    upColor: s.body ? color(s.bodyUp) : CLEAR,
    downColor: s.body ? color(s.bodyDown) : CLEAR,
    borderVisible: s.border,
    borderUpColor: color(s.borderUp),
    borderDownColor: color(s.borderDown),
    wickVisible: s.wick,
    wickUpColor: color(s.wickUp),
    wickDownColor: color(s.wickDown),
    priceFormat: { type: "price" as const, precision: s.precision, minMove: 10 ** -s.precision },
  };
}

export interface StyledCandle extends Candle {
  color?: string;
  borderColor?: string;
  wickColor?: string;
}

/** "Tô màu nến theo giá đóng cửa của nến trước": màu từng nến tự đặt; không thì để series tự tô. */
export function styleCandle(c: Candle, prev: Candle | undefined, s: ChartStyle, color: Resolve): StyledCandle {
  if (!s.prevClose) return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
  const up = prev ? c.close >= prev.close : c.close >= c.open;
  return {
    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
    color: s.body ? color(up ? s.bodyUp : s.bodyDown) : CLEAR,
    borderColor: color(up ? s.borderUp : s.borderDown),
    wickColor: color(up ? s.wickUp : s.wickDown),
  };
}

export interface MarkerSpec {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

/** Marker vào / ra lệnh trên chart của mã `d` (chỉ những lệnh đã diễn ra tới thời điểm replay). */
export function tradeMarkers(
  d: Dataset, candles: Candle[], tf: number, zone: Zone, trades: Trade[], pos: Position | null, color: Resolve, usd: (v: number) => string,
): MarkerSpec[] {
  if (!candles.length) return [];
  const first = candles[0].time;
  const out: MarkerSpec[] = [];
  const entryText = (side: number, qty: number) => `${side > 0 ? "B" : "S"} ${qty}`;
  for (const t of trades) {
    if (t.sym !== d.name || t.i0 < 0 || t.i0 > d.cur) continue;
    const bi = bucketOf(d.LT[t.i0], tf, zone);
    const bo = bucketOf(d.LT[t.i1], tf, zone);
    if (bi >= first) {
      out.push({ time: bi, position: t.side > 0 ? "belowBar" : "aboveBar", color: color(t.side > 0 ? "var(--replay-long)" : "var(--replay-short)"), shape: t.side > 0 ? "arrowUp" : "arrowDown", text: entryText(t.side, t.qty) });
    }
    if (bo >= first && t.i1 <= d.cur) {
      out.push({ time: bo, position: t.side > 0 ? "aboveBar" : "belowBar", color: color(t.pnl >= 0 ? "var(--replay-win)" : "var(--replay-loss)"), shape: "circle", text: usd(t.pnl) });
    }
  }
  if (pos && pos.sym === d.name && pos.i0 >= 0) {
    const bi = bucketOf(d.LT[pos.i0], tf, zone);
    if (bi >= first) out.push({ time: bi, position: pos.side > 0 ? "belowBar" : "aboveBar", color: color("var(--replay-entry)"), shape: pos.side > 0 ? "arrowUp" : "arrowDown", text: entryText(pos.side, pos.qty) });
  }
  return out.sort((a, b) => a.time - b.time);
}

export interface PriceLineSpec {
  key: string;
  price: number;
  color: string;
  title: string;
  /** LineStyle của lightweight-charts */
  style: number;
}

/** Đường giá của chart: vào lệnh, SL, TP, lệnh chờ và các đường kẻ ngang của mã đó. */
export function priceLines(sym: string | null, pos: Position | null, pending: Pending | null, hlines: HLine[], s: ChartStyle, color: Resolve): PriceLineSpec[] {
  if (!sym) return [];
  const out: PriceLineSpec[] = [];
  if (pos && pos.sym === sym) {
    out.push({ key: "entry", price: pos.entry, color: color("var(--replay-entry)"), title: `${pos.side > 0 ? "LONG" : "SHORT"} ${pos.qty}`, style: 0 });
    if (pos.sl != null) out.push({ key: "sl", price: pos.sl, color: color("var(--replay-sl)"), title: "SL", style: 2 });
    if (pos.tp != null) out.push({ key: "tp", price: pos.tp, color: color("var(--replay-tp)"), title: "TP", style: 2 });
  }
  if (pending && pending.sym === sym) {
    out.push({ key: "pend", price: pending.price, color: color("var(--replay-pending)"), title: `${pending.side > 0 ? "BUY" : "SELL"} ${pending.type.toUpperCase()}`, style: 1 });
  }
  hlines.forEach((h, i) => {
    if (h.sym === sym) out.push({ key: `h${i}`, price: h.price, color: color(s.textColor), title: "", style: 0 });
  });
  return out;
}
