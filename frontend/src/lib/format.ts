const NGAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Định dạng chuỗi ngày `YYYY-MM-DD` (không có giờ) sang `DD/MM/YYYY`.
 *
 * Làm bằng thao tác chuỗi có chủ ý. `new Date("2026-03-01")` là nửa đêm UTC,
 * nên ở mọi múi giờ âm nó hiển thị thành ngày 28/02. Thời gian CÓ giờ
 * (entered_at của trade, Phase 3) mới dùng Intl.DateTimeFormat với timeZone
 * lấy từ account.
 */
export function formatDateOnly(iso: string): string {
  const m = NGAY.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
