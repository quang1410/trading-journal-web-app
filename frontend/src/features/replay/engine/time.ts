/**
 * Thời gian của replay.
 *
 * Mọi mốc thời gian lưu ở dạng giây Unix UTC. "Giờ local" là giây UTC cộng độ lệch của múi giờ
 * hiển thị, rồi đọc lại bằng các hàm getUTC*() — nhờ vậy nến, nhãn trục và ô ngày giờ đều nói
 * cùng một giờ mà không phụ thuộc múi giờ của máy người dùng.
 *
 * New York có giờ mùa hè: từ 2h sáng Chủ nhật thứ hai của tháng 3 tới 2h sáng Chủ nhật đầu tiên
 * của tháng 11 (giờ địa phương), tức 07:00 UTC và 06:00 UTC.
 */

export type Zone = "NY" | "VN" | "UTC";
export const ZONES: readonly Zone[] = ["NY", "VN", "UTC"];

const dstCache = new Map<number, readonly [number, number]>();

/** [bắt đầu, kết thúc) giờ mùa hè New York của năm `year`, giây UTC. */
export function nyDst(year: number): readonly [number, number] {
  const hit = dstCache.get(year);
  if (hit) return hit;
  const mar1 = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const secondSunMar = 1 + ((7 - mar1) % 7) + 7;
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunNov = 1 + ((7 - nov1) % 7);
  const range = [Date.UTC(year, 2, secondSunMar, 7) / 1000, Date.UTC(year, 10, firstSunNov, 6) / 1000] as const;
  dstCache.set(year, range);
  return range;
}

/** Số giây cộng vào giờ UTC `t` để ra giờ local của `zone`. */
export function zoneOffset(t: number, zone: Zone): number {
  if (zone === "UTC") return 0;
  if (zone === "VN") return 7 * 3600;
  const [start, end] = nyDst(new Date(t * 1000).getUTCFullYear());
  return t >= start && t < end ? -4 * 3600 : -5 * 3600;
}

export const toLocal = (t: number, zone: Zone): number => t + zoneOffset(t, zone);

/** Nghịch đảo gần đúng của toLocal (chỉ lệch trong một giờ chuyển mùa). */
export const localToUtc = (lt: number, zone: Zone): number => lt - zoneOffset(lt, zone);

/** Giờ local của cả một mảng thời gian; New York tính lại mốc giờ mùa hè mỗi khi sang năm. */
export function computeLocal(T: Float64Array, zone: Zone): Float64Array {
  const n = T.length;
  const LT = new Float64Array(n);
  if (zone === "UTC") LT.set(T);
  else if (zone === "VN") for (let i = 0; i < n; i++) LT[i] = T[i] + 7 * 3600;
  else {
    let yearStart = 0;
    let yearEnd = -1;
    let start = 0;
    let end = 0;
    for (let i = 0; i < n; i++) {
      const t = T[i];
      if (t < yearStart || t >= yearEnd) {
        const y = new Date(t * 1000).getUTCFullYear();
        yearStart = Date.UTC(y, 0, 1) / 1000;
        yearEnd = Date.UTC(y + 1, 0, 1) / 1000;
        [start, end] = nyDst(y);
      }
      LT[i] = t + (t >= start && t < end ? -4 * 3600 : -5 * 3600);
    }
  }
  return LT;
}

/**
 * Giờ mở (local) của nến khung `tf` phút chứa phút local `lt`.
 *
 * Theo giờ New York, nến ngày bắt đầu lúc 18:00 hôm trước (phiên CME) và nến 4H bám mốc 18:00,
 * giống TradingView với hợp đồng CME. Múi giờ khác thì chia đều từ nửa đêm.
 */
export function bucketOf(lt: number, tf: number, zone: Zone): number {
  if (tf >= 1440) {
    const shift = zone === "NY" ? 6 * 3600 : 0;
    return Math.floor((lt + shift) / 86400) * 86400;
  }
  if (tf === 240 && zone === "NY") return Math.floor((lt + 7200) / 14400) * 14400 - 7200;
  const s = tf * 60;
  return Math.floor(lt / s) * s;
}

/** Nến ngày (giờ NY) mang ngày của phiên, trong khi giờ mở thật là 18:00 hôm trước. */
export const dayShift = (tf: number, zone: Zone): number => (tf >= 1440 && zone === "NY" ? 6 * 3600 : 0);

/** "YYYY-MM-DD HH:MM" của một mốc local. */
export const fmtLocal = (lt: number): string => new Date(lt * 1000).toISOString().slice(0, 16).replace("T", " ");
/**
 * Giờ local kèm múi giờ ("2026-10-27 04:51 NY") cho giờ nằm trong thông báo và trên chart. Nhãn ngắn
 * của múi giờ (replay.zoneShort.*) trùng mã múi giờ ở mọi ngôn ngữ nên dùng thẳng mã; time.test.ts
 * ghim điều đó, đổi nhãn thì phải đổi cả ở đây.
 */
export const fmtLocalZone = (lt: number, zone: Zone): string => `${fmtLocal(lt)} ${zone}`;

/** "Thứ YYYY-MM-DD HH:MM" cho nhãn thời gian của crosshair. `weekdays` bắt đầu từ Chủ nhật, như getUTCDay(). */
export const fmtLocalWeekday = (lt: number, weekdays: readonly string[]): string =>
  `${weekdays[new Date(lt * 1000).getUTCDay()]} ${fmtLocal(lt)}`;

/** Giá trị cho <input type="datetime-local">: "YYYY-MM-DDTHH:MM". */
export const toInputValue = (lt: number): string => new Date(lt * 1000).toISOString().slice(0, 16);

/** Đọc lại giá trị của ô datetime-local thành mốc local (giây), null nếu không hợp lệ. */
export function parseInputValue(v: string): number | null {
  // Date.parse của V8 rất dễ dãi ("not a date" ra năm 2000), nên kiểm đúng dạng trước
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}:00Z`);
  return Number.isFinite(ms) ? ms / 1000 : null;
}
