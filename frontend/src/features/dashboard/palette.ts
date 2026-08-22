import { compareDecimal } from "@/lib/decimal";

// Chỉ TÊN BIẾN, không bao giờ hex: cổng styleguard cấm hex trong .ts/.tsx, và
// giá trị thật nằm ở src/styles/index.css cùng với lệnh chạy lại validator.
export const MAU_LAI = "var(--chart-profit)";
export const MAU_LO = "var(--chart-loss)";
export const MAU_TRUNG_TINH = "var(--text-muted)";

/**
 * Màu theo DẤU của giá trị, so bằng chuỗi.
 *
 * Ba nhánh chứ không phải hai: net = 0 là hoà, không phải lỗ. Tô nó đỏ sẽ đếm
 * một lệnh hoà vào phía thua bằng thị giác, trong khi backend không đếm nó vào
 * loss_count.
 */
export function mauTheoDau(v: string): string {
  const d = compareDecimal(v, "0");
  return d > 0 ? MAU_LAI : d < 0 ? MAU_LO : MAU_TRUNG_TINH;
}
