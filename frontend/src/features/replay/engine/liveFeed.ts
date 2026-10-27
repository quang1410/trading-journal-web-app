import { api } from "@/lib/api";
import type { Bars } from "./types";

/**
 * Nút "Cập nhật" ở thanh trên: kéo tuần nến 1m CME mới nhất của NQ, ES qua backend
 * (GET /api/replay/live/{mã}). Trình duyệt không tự kéo từ TradingView được: họ chỉ nhận kết nối có
 * Origin là tradingview.com hoặc localhost, nên server kéo hộ (backend/internal/tvfeed).
 * Backend lưu mọi lần kéo vào DB (cron mỗi sáng thứ Bảy cũng kéo và lưu), nên nút này nhận mọi nến
 * máy này còn thiếu — kể cả những tuần chưa từng bấm. Phần nhận về được gộp với data có sẵn và
 * lưu trong IndexedDB (khoá liveKey). Đóng gói vào git cho mọi máy: scripts/replay-data/tradingview.mjs.
 */

/** Các mã trong bundle kéo được bản mới nhất; phải khớp tvfeed.Tickers ở backend. */
export const LIVE_SYMBOLS = ["NQ", "ES"] as const;
export const isLive = (name: string | null | undefined): name is string => (LIVE_SYMBOLS as readonly string[]).includes(name ?? "");
/** Khoá IndexedDB (kho datasets) của dãy nến đã gộp phần kéo về trình duyệt. */
export const liveKey = (name: string) => `live:${name}`;

/** Chặn vòng lặp trang nếu backend cứ báo more: 100 trang × 40 000 nến là thừa cho nhiều năm. */
const MAX_PAGES = 100;

/** Nến theo cột như backend trả; T là giây Unix lúc mở nến, đã bỏ phút chưa đóng. */
interface LiveBarsDto {
  symbol: string;
  ticker: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  /** còn trang sau: đọc tiếp /replay/bars/{mã}?after=<giờ nến cuối> */
  more?: boolean;
  /** TradingView không kéo được: chỉ có nến đã lưu trong DB, có thể thiếu tuần mới nhất */
  stale?: boolean;
}

/** Nến nhận về; stale = true khi backend không kéo được TradingView và chỉ trả nến đã lưu. */
export interface LiveBars extends Bars {
  stale?: boolean;
}

/**
 * Nến 1m của một mã (NQ / ES) cho nút Cập nhật. `last` là giờ nến cuối máy đang có (bỏ trống = chưa
 * có nến nào): backend trả mọi nến từ một tuần trước `last` — tuần gần nhất gửi lại để nến TradingView
 * trả muộn chen được vào giữa (gộp ở mergeBars). Trang đầu đi qua /replay/live (có kéo TradingView),
 * các trang sau chỉ đọc DB qua /replay/bars. Lỗi thì ném ApiError mang thông điệp của server.
 */
export async function fetchLiveBars(name: string, last?: number): Promise<LiveBars> {
  const cols: Record<"t" | "o" | "h" | "l" | "c" | "v", number[][]> = { t: [], o: [], h: [], l: [], c: [], v: [] };
  const sym = encodeURIComponent(name);
  let path = `/replay/live/${sym}${last === undefined ? "" : `?last=${Math.floor(last)}`}`;
  let stale = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await api.get<LiveBarsDto>(path);
    for (const k of ["t", "o", "h", "l", "c", "v"] as const) cols[k].push(d[k]);
    stale ||= !!d.stale;
    if (!d.more || !d.t.length) break;
    path = `/replay/bars/${sym}?after=${d.t[d.t.length - 1]}`;
  }
  const col = (k: keyof typeof cols) => Float64Array.from(cols[k].flat());
  const T = col("t");
  return { n: T.length, T, O: col("o"), H: col("h"), L: col("l"), C: col("c"), V: col("v"), stale };
}
