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

/**
 * Đường "thực tế" của theory_vs_actual.
 *
 * KHÔNG dùng --primary: đường lũy kế của DailyPnlChart dùng --primary vì đó
 * là biểu đồ MỘT chuỗi. Ở đây có HAI chuỗi cạnh nhau, cần một màu tách bạch
 * khỏi cả --primary lẫn cặp lãi/lỗ để không mang nhầm nghĩa cực tính — đường
 * "thực tế" không phải là "lãi", nó chỉ là MỘT trong hai đường.
 */
export const MAU_THUC_TE = "var(--chart-actual)";

/** Ô lịch nhiệt của một ngày HOÀ (có giao dịch, sum_net = 0).
 *
 * KHÁC MAU_TRUNG_TINH: đó là màu cho CHỮ/ĐƯỜNG (đủ tương phản để đọc), cái
 * này là màu cho Ô nền — chỉ cần là một điểm neo trung tính giữa hai đầu
 * ramp, không cần đạt ngưỡng tương phản văn bản.
 */
export const MAU_HOA = "var(--chart-zero)";

/** Ô lịch nhiệt của một ngày KHÔNG giao dịch — trong dải ngày nhưng backend
 * không gửi ô nào cho ngày đó. */
export const MAU_KHONG_GIAO_DICH = "var(--chart-empty)";

const BAC_NHIET_LAI = [
  "var(--chart-heat-profit-1)",
  "var(--chart-heat-profit-2)",
  "var(--chart-heat-profit-3)",
] as const;
const BAC_NHIET_LO = [
  "var(--chart-heat-loss-1)",
  "var(--chart-heat-loss-2)",
  "var(--chart-heat-loss-3)",
] as const;

/**
 * Màu ô lịch nhiệt theo bậc cường độ VÀ cực tính.
 *
 * `bac`: 1 (yếu, gần nền) .. 3 (mạnh nhất) — heatmap.ts tính bậc bằng tam
 * phân vị của |sum_net|. `lai`: true dùng ramp teal, false dùng ramp đỏ. Cả
 * hai ramp đã qua validateOrdinal ở cả hai theme; dark mode đọc NGƯỢC chiều
 * qua khối [data-theme="dark"] ở index.css, nên hàm này không cần biết theme
 * hiện tại — nó chỉ chọn ĐÚNG BIẾN, giá trị thật CSS tự lo.
 */
export function bacNhiet(bac: 1 | 2 | 3, lai: boolean): string {
  return (lai ? BAC_NHIET_LAI : BAC_NHIET_LO)[bac - 1];
}

/**
 * Màu của hai đường trong TheoryVsActualChart.
 *
 * Tách thành hàm THUẦN thay vì hằng số gọi trực tiếp trong component: đây là
 * chỗ DUY NHẤT falsify được bằng test mà không cần DOM thật. Recharts không
 * vẽ path/line nào trong jsdom (4a §2.5, ResponsiveContainer đo bằng
 * ResizeObserver), nên không thể assert lên stroke của <path> thật — nhưng
 * assert được lên giá trị mà component SẼ truyền vào stroke.
 */
export function mauDuongTheory(loai: "lyThuyet" | "thucTe"): string {
  return loai === "thucTe" ? MAU_THUC_TE : MAU_TRUNG_TINH;
}
