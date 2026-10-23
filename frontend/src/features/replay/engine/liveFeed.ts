import { api } from "@/lib/api";
import type { Bars } from "./types";

/**
 * Nút "Cập nhật" ở thanh trên: kéo tuần nến 1m CME mới nhất của NQ, ES qua backend
 * (GET /api/replay/live/{mã}). Trình duyệt không tự kéo từ TradingView được: họ chỉ nhận kết nối có
 * Origin là tradingview.com hoặc localhost, nên server kéo hộ (backend/internal/tvfeed).
 * Phần kéo về được gộp với data có sẵn và lưu trong IndexedDB (khoá liveKey), nên bấm mỗi tuần thì
 * lịch sử dài dần. Lịch sử dài hơn, dùng chung cho mọi máy: scripts/replay-data/tradingview.mjs.
 */

/** Các mã trong bundle kéo được bản mới nhất; phải khớp tvfeed.Tickers ở backend. */
export const LIVE_SYMBOLS = ["NQ", "ES"] as const;
export const isLive = (name: string | null | undefined): name is string => (LIVE_SYMBOLS as readonly string[]).includes(name ?? "");
/** Khoá IndexedDB (kho datasets) của dãy nến đã gộp phần kéo về trình duyệt. */
export const liveKey = (name: string) => `live:${name}`;

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
}

/** Tuần nến 1m mới nhất của một mã (NQ / ES). Lỗi thì ném ApiError mang thông điệp của server. */
export async function fetchLiveBars(name: string): Promise<Bars> {
  const d = await api.get<LiveBarsDto>(`/replay/live/${encodeURIComponent(name)}`);
  return { n: d.t.length, T: Float64Array.from(d.t), O: Float64Array.from(d.o), H: Float64Array.from(d.h), L: Float64Array.from(d.l), C: Float64Array.from(d.c), V: Float64Array.from(d.v) };
}
