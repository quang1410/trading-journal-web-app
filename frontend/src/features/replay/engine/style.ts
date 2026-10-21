/**
 * Giao diện chart (cửa sổ Cài đặt → "Mã & nến" và "Nền chart").
 *
 * Màu là chuỗi màu CSS. Hai bộ có sẵn ("Sáng" kiểu FX Replay và "Tối") trỏ vào biến
 * `--replay-light-*` / `--replay-dark-*` khai trong replay.css; màu người dùng tự chọn là mã màu
 * họ chọn, lưu nguyên văn. Lần đầu mở trang, chart theo giao diện sáng/tối của app.
 */

export type ChartTemplate = "light" | "dark";
export type Watermark = "replay" | "symbol" | "none";

export interface ChartStyle {
  prevClose: boolean;
  body: boolean;
  bodyUp: string;
  bodyDown: string;
  border: boolean;
  borderUp: string;
  borderDown: string;
  wick: boolean;
  wickUp: string;
  wickDown: string;
  precision: number;
  bg: string;
  vGrid: boolean;
  vGridColor: string;
  hGrid: boolean;
  hGridColor: string;
  crosshair: string;
  /** LineStyle của lightweight-charts: 0 liền, 1 chấm, 2 nét đứt, 3 nét dài */
  crossStyle: number;
  watermark: Watermark;
  watermarkColor: string;
  textColor: string;
  fontSize: number;
  lineColor: string;
  marginTop: number;
  marginBottom: number;
  rightBars: number;
}

/** Các trường màu của ChartStyle, theo đúng tên biến CSS (camelCase → kebab-case). */
export const STYLE_COLOR_KEYS = [
  "bodyUp", "bodyDown", "borderUp", "borderDown", "wickUp", "wickDown", "bg", "vGridColor", "hGridColor",
  "crosshair", "watermarkColor", "textColor", "lineColor",
] as const satisfies readonly (keyof ChartStyle)[];

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function chartTemplate(t: ChartTemplate): ChartStyle {
  const color = Object.fromEntries(STYLE_COLOR_KEYS.map((k) => [k, `var(--replay-${t}-${kebab(k)})`])) as Pick<ChartStyle, (typeof STYLE_COLOR_KEYS)[number]>;
  return t === "light"
    ? { ...color, prevClose: false, body: true, border: true, wick: true, precision: 2, vGrid: false, hGrid: false, crossStyle: 2, watermark: "replay", fontSize: 12, marginTop: 10, marginBottom: 8, rightBars: 10 }
    : { ...color, prevClose: false, body: true, border: false, wick: true, precision: 2, vGrid: true, hGrid: true, crossStyle: 3, watermark: "none", fontSize: 12, marginTop: 10, marginBottom: 8, rightBars: 12 };
}
