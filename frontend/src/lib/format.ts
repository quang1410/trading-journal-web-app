const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Định dạng chuỗi ngày `YYYY-MM-DD` (không có giờ) sang `DD/MM/YYYY`.
 *
 * Làm bằng thao tác chuỗi có chủ ý. `new Date("2026-03-01")` là nửa đêm UTC,
 * nên ở mọi múi giờ âm nó hiển thị thành ngày 28/02. Thời gian CÓ giờ
 * (entered_at của trade, Phase 3) mới dùng Intl.DateTimeFormat với timeZone
 * lấy từ account.
 */
export function formatDateOnly(iso: string, locale: Locale = "vi"): string {
  const m = DATE.exec(iso);
  if (!m) return iso;
  return locale === "en" ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Chuỗi ngày `YYYY-MM-DD` sang dạng đầy đủ có THỨ: "Thứ Sáu, 03/07/2026".
 *
 * Khác formatDateOnly ở chỗ dùng cho TIÊU ĐỀ — nơi một cái ngày đứng một mình
 * và phải tự giới thiệu đủ. Trong bảng thì thứ chỉ là nhiễu vì mọi dòng cùng
 * một ngày.
 *
 * Ghép "T00:00:00Z" và ép timeZone UTC: chuỗi của backend là NGÀY LỊCH, không
 * phải một thời điểm. Thả cho Date tự đoán sẽ diễn giải nó theo múi giờ máy, và
 * với người dùng ở phía tây UTC thì mùng 3 hiện thành mùng 2.
 */
export function formatDateWithWeekday(iso: string, locale: Locale = "vi"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

import type { Locale } from "@/i18n";
