import dayjs from "dayjs";
import type { Locale } from "@/i18n";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Chỗ DUY NHẤT trong dự án được import dayjs.
 *
 * Bọc một tầng vì hai lẽ độc lập:
 *
 *  1. Mọi hàm ở đây BẮT BUỘC nhận `tz`. Quên là lỗi biên dịch, chứ không phải
 *     âm thầm rơi về giờ của máy đang chạy — mà giờ máy thì khác nhau giữa
 *     laptop, CI và container, nên lỗi kiểu đó không tái hiện được.
 *  2. `Temporal` chưa có trong Node 22 (đã kiểm: `typeof globalThis.Temporal`
 *     ra `undefined`). Ngày nào nó phổ cập thì chỉ phải thay ruột file này.
 */

// `T` không phải token của dayjs, nhưng để trần thì nó là ký tự tự do và
// hành vi phụ thuộc phiên bản. `[T]` là cú pháp thoát, nói rõ "in ra chữ T".
const WALL = "YYYY-MM-DD[T]HH:mm";
const DISPLAY = { vi: "DD/MM/YYYY HH:mm", en: "MM/DD/YYYY hh:mm A" } as const;
const TIME_ONLY = { vi: "HH:mm", en: "hh:mm A" } as const;
const WALL_PRECISE = "YYYY-MM-DD[T]HH:mm:ss.SSS";
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DDTHH:mm" theo `tz` — giá trị mặc định cho input[type=datetime-local]. */
export function nowInZone(tz: string): string {
  return dayjs().tz(tz).format(WALL);
}

/**
 * Giờ treo tường trong `tz` thành instant ISO để gửi lên backend.
 *
 * Trả về hậu tố `Z`, vẫn là ISO-8601 có offset hợp lệ. Không cần dựng chuỗi
 * "+07:00" bằng tay: backend lưu UTC, nên instant mới là thứ mang nghĩa.
 *
 * KHÔNG dùng `dayjs.tz(wall, tz)`: nó đoán offset theo thời điểm HIỆN TẠI, nên
 * giờ lặp lại khi lùi đồng hồ ra instant khác nhau tuỳ ngày người dùng nhập.
 *
 * Quy tắc "compatible" (Temporal, java.time), giống hệt wallToUTC ở
 * backend/internal/importer/normalize.go — form và import CSV phải khớp nhau:
 *   - giờ lặp lại (đêm lùi đồng hồ): lấy lần xuất hiện ĐẦU;
 *   - giờ không tồn tại (đêm nhảy đồng hồ): dịch TỚI đúng độ dài khoảng nhảy.
 */
export function wallToInstant(wall: string, tz: string): string {
  // Giờ treo tường đọc như thể UTC; hai offset ứng viên lấy ở một ngày trước và
  // sau — không timezone nào đổi giờ hai lần trong 48 giờ.
  const asUtc = dayjs.utc(wall).valueOf();
  const offsetMs = (at: number) => dayjs(at).tz(tz).utcOffset() * 60_000;
  const before = offsetMs(asUtc - DAY_MS);
  const after = offsetMs(asUtc + DAY_MS);

  // So tới mili-giây chứ không so với chuỗi `wall` theo WALL: wall có kèm giây
  // sẽ không bao giờ khớp và rơi nhầm vào nhánh "không tồn tại".
  const wallKey = dayjs.utc(asUtc).format(WALL_PRECISE);
  const matches = [before, after]
    .map((off) => asUtc - off)
    .filter((at) => dayjs(at).tz(tz).format(WALL_PRECISE) === wallKey);
  // Không ứng viên nào khớp = giờ không tồn tại: đọc theo offset TRƯỚC khoảng
  // nhảy, tức dịch tới.
  const at = matches.length > 0 ? Math.min(...matches) : asUtc - before;
  return new Date(at).toISOString();
}

/** Instant từ API thành "DD/MM/YYYY HH:mm" theo `tz`. */
export function formatInstant(iso: string, tz: string, locale: Locale = "vi"): string {
  return dayjs(iso).tz(tz).format(DISPLAY[locale]);
}

/**
 * Instant từ API thành GIỜ TRONG NGÀY theo `tz` — "21:14" (vi) / "09:14 PM" (en).
 *
 * Dành cho danh sách đã nói rõ mình thuộc ngày nào ở tiêu đề (bảng lệnh của
 * một ngày trong lịch P&L). Lặp lại đủ "17/08/2026 21:14" trên từng dòng ở đó
 * là lặp lại đúng một thông tin mười lần, và nó đẩy cột giờ rộng gấp ba lần
 * phần thật sự khác nhau giữa các dòng.
 */
export function formatTimeOfDay(iso: string, tz: string, locale: Locale = "vi"): string {
  return dayjs(iso).tz(tz).format(TIME_ONLY[locale]);
}

/** Instant từ API thành "YYYY-MM-DDTHH:mm" theo `tz`, để nạp lại vào form sửa. */
export function instantToWall(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format(WALL);
}
