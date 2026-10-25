/**
 * Khung "viên" cho các nút mang GIÁ TRỊ đang chọn trên thanh replay (mốc tua tới, bước · tốc độ).
 * Hai nút này cùng một kiểu việc — hiện lựa chọn hiện tại, bấm mũi tên để đổi — nên phải trông giống
 * nhau: cùng cao, cùng nền chìm, cùng cỡ chữ; còn nút chỉ có biểu tượng (tiến 1 bước, chọn nến) để trần.
 */
export const PILL = "flex h-8 items-stretch overflow-hidden rounded-md border border-border bg-surface-sunken";
/** Nút nằm trong viên: phẳng, ăn hết chiều cao, chữ 13px, biểu tượng mờ để chữ là thứ đọc trước. */
export const PILL_BUTTON = "h-full gap-1.5 rounded-none text-[13px] [&_svg]:text-text-muted";
/** Mũi tên mở menu / popover ở cuối viên. */
export const PILL_CHEVRON = "size-3.5";
