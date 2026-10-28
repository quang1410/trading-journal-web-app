import { api } from "@/lib/api";
import type { Bars } from "./types";

/**
 * Nút "Cập nhật" ở thanh trên: kéo tuần nến 1m CME mới nhất của NQ, ES qua backend
 * (GET /api/replay/live/{mã}). Trình duyệt không tự kéo từ TradingView được: họ chỉ nhận kết nối có
 * Origin là tradingview.com hoặc localhost, nên server kéo hộ (backend/internal/tvfeed). Server kéo
 * song song cả Yahoo (backend/internal/yahoofeed) để lấp phút trống, và cron lấp thêm khoảng 30 ngày
 * trước đó — nên nút này còn đọc cả phần CŨ hơn nến đầu máy đang có.
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
  /** TradingView không kéo được, phần mới chỉ từ Yahoo (Open / Close có thể lệch vài tick) */
  backup?: boolean;
}

/**
 * Nến nhận về; stale = true khi backend không kéo được nguồn nào và chỉ trả nến đã lưu, backup = true
 * khi TradingView hỏng và phần mới chỉ từ Yahoo.
 */
export interface LiveBars extends Bars {
  stale?: boolean;
  backup?: boolean;
}

type Cols = Record<"t" | "o" | "h" | "l" | "c" | "v", number[][]>;

/** Đọc lần lượt các trang bắt đầu ở `path`, trang kế qua /replay/bars với after = giờ nến cuối. */
async function readPages(path: string, next: (after: number) => string, cols: Cols): Promise<{ stale: boolean; backup: boolean }> {
  let stale = false;
  let backup = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await api.get<LiveBarsDto>(path);
    for (const k of ["t", "o", "h", "l", "c", "v"] as const) cols[k].push(d[k]);
    stale ||= !!d.stale;
    backup ||= !!d.backup;
    if (!d.more || !d.t.length) break;
    path = next(d.t[d.t.length - 1]);
  }
  return { stale, backup };
}

/**
 * Nến 1m của một mã (NQ / ES) cho nút Cập nhật. `last` là giờ nến cuối máy đang có (bỏ trống = chưa
 * có nến nào): backend trả mọi nến từ một tuần trước `last` — tuần gần nhất gửi lại để nến TradingView
 * trả muộn chen được vào giữa (gộp ở mergeBars). Trang đầu đi qua /replay/live (có kéo TradingView và
 * Yahoo), các trang sau chỉ đọc DB qua /replay/bars. Lỗi thì ném ApiError mang thông điệp của server.
 *
 * `first` là giờ nến đầu máy đang có: đọc thêm từ DB mọi nến trước nó (Yahoo lùi được ~30 ngày, xa
 * hơn bundle). Phần này chỉ là thêm lịch sử: lỗi (ví dụ server không có DB nên không có route) thì
 * bỏ qua, vẫn trả phần mới.
 */
export async function fetchLiveBars(name: string, last?: number, first?: number): Promise<LiveBars> {
  const cols: Cols = { t: [], o: [], h: [], l: [], c: [], v: [] };
  const sym = encodeURIComponent(name);
  const latest = `/replay/live/${sym}${last === undefined ? "" : `?last=${Math.floor(last)}`}`;
  const { stale, backup } = await readPages(latest, (after) => `/replay/bars/${sym}?after=${after}`, cols);
  if (first !== undefined) {
    const before = Math.floor(first);
    const older: Cols = { t: [], o: [], h: [], l: [], c: [], v: [] };
    try {
      await readPages(`/replay/bars/${sym}?after=0&before=${before}`, (after) => `/replay/bars/${sym}?after=${after}&before=${before}`, older);
      // phần cũ đứng trước để cột vẫn tăng dần
      for (const k of ["t", "o", "h", "l", "c", "v"] as const) cols[k].unshift(...older[k]);
    } catch {
      // không đọc được lịch sử cũ: giữ phần mới đã có
    }
  }
  const col = (k: keyof typeof cols) => Float64Array.from(cols[k].flat());
  const T = col("t");
  return { n: T.length, T, O: col("o"), H: col("h"), L: col("l"), C: col("c"), V: col("v"), stale, backup };
}
