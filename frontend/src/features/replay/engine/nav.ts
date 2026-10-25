import { lowerBound } from "./series";
import { zoneOffset } from "./time";

/**
 * Điều hướng nhanh của replay: nhảy tới phiên / Silver Bullet / ngày giao dịch kế tiếp.
 *
 * Mọi mốc "HH:MM" ở đây là giờ New York (có giờ mùa hè), bất kể chart đang hiển thị múi giờ nào:
 * phiên Á / London / NY và Silver Bullet của ICT đều định nghĩa theo giờ NY, giống indicator ICT.
 *
 * "Ngày giao dịch" bắt đầu ở mốc Next Day Open (mặc định 17:00, như CME): 19:00 Chủ nhật là phiên Á
 * của thứ Hai. Mốc mở ngày từ 12:00 trở đi thì ngày giao dịch mang tên ngày nó kết thúc (kiểu CME),
 * trước 12:00 thì mang tên ngày nó bắt đầu. "Days to skip" xét theo ngày giao dịch đó.
 */

export type NavItem = "asian" | "london" | "ny" | "dayOpen" | "sbLondon" | "sbNyAm" | "sbNyPm";
/** Hành động của nút điều hướng: một mốc, hoặc mốc gần nhất của cả nhóm. */
export type NavAction = NavItem | "nextSession" | "nextSilverBullet";

export interface NavSlot {
  /** "HH:MM" giờ New York */
  time: string;
  /** ghim vào menu nhanh */
  star: boolean;
}

export interface NavSettings {
  slots: Record<NavItem, NavSlot>;
  /** ngày giao dịch bỏ qua, 0 = Chủ nhật … 6 = thứ Bảy (như getUTCDay()) */
  skipDays: number[];
}

export const SESSION_ITEMS = ["asian", "london", "ny"] as const satisfies readonly NavItem[];
export const SILVER_BULLET_ITEMS = ["sbLondon", "sbNyAm", "sbNyPm"] as const satisfies readonly NavItem[];
export const NAV_ITEMS: readonly NavItem[] = [...SESSION_ITEMS, "dayOpen", ...SILVER_BULLET_ITEMS];
export const NAV_ACTIONS: readonly NavAction[] = ["nextSession", "nextSilverBullet", ...NAV_ITEMS];

/** Giờ theo ảnh tham chiếu (FX Replay). Mặc định chỉ ghim phiên New York vào menu nhanh. */
export const DEFAULT_NAV: NavSettings = {
  slots: {
    asian: { time: "19:00", star: false },
    london: { time: "02:00", star: false },
    ny: { time: "09:15", star: true },
    dayOpen: { time: "17:00", star: false },
    sbLondon: { time: "03:00", star: false },
    sbNyAm: { time: "09:15", star: false },
    sbNyPm: { time: "14:00", star: false },
  },
  skipDays: [],
};
export const DEFAULT_NAV_ACTION: NavAction = "ny";

const pad = (v: number) => String(v).padStart(2, "0");
/** Các lựa chọn của ô giờ: mỗi 15 phút, 00:00 … 23:45. */
export const NAV_TIMES: readonly string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  return m ? +m[1] * 60 + +m[2] : -1;
};

/** Các mốc mà một hành động tìm trong đó. */
export function actionItems(a: NavAction): readonly NavItem[] {
  if (a === "nextSession") return SESSION_ITEMS;
  if (a === "nextSilverBullet") return SILVER_BULLET_ITEMS;
  return [a];
}

export const isNavAction = (v: unknown): v is NavAction => typeof v === "string" && (NAV_ACTIONS as readonly string[]).includes(v);

/** Đọc lại cài đặt đã lưu: giữ giá trị hợp lệ, phần hỏng hoặc thiếu lấy mặc định. */
export function sanitizeNav(raw: unknown): NavSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { slots?: Record<string, unknown>; skipDays?: unknown };
  const slots = {} as Record<NavItem, NavSlot>;
  for (const k of NAV_ITEMS) {
    const v = r.slots?.[k] as Partial<NavSlot> | undefined;
    slots[k] =
      v && typeof v.time === "string" && HHMM.test(v.time) && typeof v.star === "boolean" ? { time: v.time, star: v.star } : { ...DEFAULT_NAV.slots[k] };
  }
  const days = Array.isArray(r.skipDays) ? r.skipDays : [];
  const skipDays = [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return { slots, skipDays };
}

/** Khoá lỗi (strings.ts) nếu cài đặt không lưu được, null nếu hợp lệ. */
export function validateNav(s: NavSettings): "replay.nav.allSkipped" | "replay.nav.badTime" | null {
  if (NAV_ITEMS.some((k) => minutesOf(s.slots[k].time) < 0)) return "replay.nav.badTime";
  if (new Set(s.skipDays).size >= 7) return "replay.nav.allSkipped";
  return null;
}

const DAY = 86400;
const nyLocal = (t: number) => t + zoneOffset(t, "NY");
/** Giờ NY (giây "local") → giây UTC. Đoán giờ mùa đông trước rồi chỉnh theo độ lệch thật. */
const nyToUtc = (lt: number) => lt - zoneOffset(lt + 5 * 3600, "NY");
/** Số thứ tự ngày giao dịch chứa mốc local `lt`, với ngày mở lúc `open` phút. */
const tradingDay = (lt: number, open: number) => Math.floor((lt - open * 60) / DAY) + (open >= 720 ? 1 : 0);
/** Thứ trong tuần của số ngày kể từ 01/01/1970 (một ngày thứ Năm). */
const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;

/**
 * Chỉ số nến 1m đầu tiên của lần kế tiếp một trong các mốc `times` (giờ NY), tính từ sau nến
 * `cur`. Bỏ qua ngày giao dịch thuộc `skipDays`. Mốc không có nến (cuối tuần, giờ nghỉ 17:00 của
 * CME, ngày lễ) thì lấy nến đầu tiên sau đó, miễn là vẫn cùng ngày giao dịch — không thì sang lần
 * kế tiếp. null nếu hết data.
 */
export function nextJump(T: ArrayLike<number>, cur: number, times: readonly string[], dayOpen: string, skipDays: readonly number[]): number | null {
  const n = T.length;
  const mins = [...new Set(times.map(minutesOf).filter((m) => m >= 0))].sort((a, b) => a - b);
  if (!mins.length || cur >= n - 1 || new Set(skipDays).size >= 7) return null;
  const open = Math.max(0, minutesOf(dayOpen));
  const tNow = T[Math.max(0, cur)];
  const lastDay = Math.floor(nyLocal(T[n - 1]) / DAY);
  for (let day = Math.floor(nyLocal(tNow) / DAY); day <= lastDay; day++) {
    for (const m of mins) {
      const lt = day * DAY + m * 60;
      const td = tradingDay(lt, open);
      if (skipDays.includes(weekday(td))) continue;
      const u = nyToUtc(lt);
      if (u <= tNow) continue;
      const i = lowerBound(T, u);
      if (i >= n) return null;
      if (i > cur && tradingDay(nyLocal(T[i]), open) === td) return i;
    }
  }
  return null;
}
