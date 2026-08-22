import dayjs from "dayjs";
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
const HIEN_THI = "DD/MM/YYYY HH:mm";

/** "YYYY-MM-DDTHH:mm" theo `tz` — giá trị mặc định cho input[type=datetime-local]. */
export function nowInZone(tz: string): string {
  return dayjs().tz(tz).format(WALL);
}

/**
 * Giờ treo tường trong `tz` thành instant ISO để gửi lên backend.
 *
 * Trả về hậu tố `Z`, vẫn là ISO-8601 có offset hợp lệ. Không cần dựng chuỗi
 * "+07:00" bằng tay: backend lưu UTC, nên instant mới là thứ mang nghĩa.
 */
export function wallToInstant(wall: string, tz: string): string {
  return dayjs.tz(wall, tz).toISOString();
}

/** Instant từ API thành "DD/MM/YYYY HH:mm" theo `tz`. */
export function formatInstant(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format(HIEN_THI);
}

/** Instant từ API thành "YYYY-MM-DDTHH:mm" theo `tz`, để nạp lại vào form sửa. */
export function instantToWall(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format(WALL);
}
