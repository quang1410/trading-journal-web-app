/** Khung thời gian của chart (phút). Nhãn là ký hiệu chung của dân trade, giống nhau ở mọi ngôn ngữ. */
export const TIMEFRAMES = [1, 5, 15, 30, 60, 240, 1440] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const LABELS: Record<Timeframe, string> = { 1: "1m", 5: "5m", 15: "15m", 30: "30m", 60: "1H", 240: "4H", 1440: "D" };

export const isTimeframe = (tf: number): tf is Timeframe => (TIMEFRAMES as readonly number[]).includes(tf);
export const tfLabel = (tf: number): string => (isTimeframe(tf) ? LABELS[tf] : `${tf}m`);

/**
 * Khung gõ từ bàn phím như TradingView / FX Replay: "1" → 1, "15" → 15, "1h" / "h1" / "60" → 60,
 * "4h" / "h4" → 240, "d" / "1d" / "d1" → 1440. Trả về số phút (có thể là khung không có), null nếu
 * không đọc được.
 */
export function parseTf(s: string): number | null {
  let n: number;
  let unit: string;
  let m = /^(\d+)([mhd]?)$/i.exec(s);
  if (m) {
    n = +m[1];
    unit = m[2];
  } else if ((m = /^([mhd])(\d*)$/i.exec(s))) {
    unit = m[1];
    n = m[2] ? +m[2] : 1;
  } else return null;
  const u = (unit || "m").toLowerCase();
  return n * (u === "h" ? 60 : u === "d" ? 1440 : 1);
}

/** Tốc độ phát: số bước mỗi giây. */
export const SPEEDS = [0.5, 1, 2, 3, 5, 10, 20, 40, 60, 120] as const;
export const DEFAULT_SPEED_INDEX = 4;

/** Cỡ một bước replay (phút); 0 = theo khung của chart đang chọn. */
export const STEP_SIZES = [1, 5, 15, 60, 240, 0] as const;
