import { compareDecimal } from "@/lib/decimal";

// Chỉ TÊN BIẾN, không bao giờ hex: cổng styleguard cấm hex trong .ts/.tsx, và
// giá trị thật nằm ở src/styles/index.css cùng với lệnh chạy lại validator.
export const PROFIT_COLOR = "var(--chart-profit)";
export const LOSS_COLOR = "var(--chart-loss)";
export const NEUTRAL_COLOR = "var(--text-muted)";

/**
 * Màu theo DẤU của giá trị, so bằng chuỗi.
 *
 * Ba nhánh chứ không phải hai: net = 0 là hoà, không phải lỗ. Tô nó đỏ sẽ đếm
 * một lệnh hoà vào phía thua bằng thị giác, trong khi backend không đếm nó vào
 * loss_count.
 */
export function colorBySign(v: string): string {
  const d = compareDecimal(v, "0");
  return d > 0 ? PROFIT_COLOR : d < 0 ? LOSS_COLOR : NEUTRAL_COLOR;
}

/**
 * Đường "thực tế" của theory_vs_actual.
 *
 * KHÔNG dùng --primary: đường lũy kế của DailyPnlChart dùng --primary vì đó
 * là biểu đồ MỘT chuỗi. Ở đây có HAI chuỗi cạnh nhau, cần một màu tách bạch
 * khỏi cả --primary lẫn cặp lãi/lỗ để không mang nhầm nghĩa cực tính — đường
 * "thực tế" không phải là "lãi", nó chỉ là MỘT trong hai đường.
 */
export const ACTUAL_COLOR = "var(--chart-actual)";

/** Ô lịch nhiệt của một ngày HOÀ (có giao dịch, sum_net = 0).
 *
 * KHÁC MAU_TRUNG_TINH: đó là màu cho CHỮ/ĐƯỜNG (đủ tương phản để đọc), cái
 * này là màu cho Ô nền — chỉ cần là một điểm neo trung tính giữa hai đầu
 * ramp, không cần đạt ngưỡng tương phản văn bản.
 */
export const BREAKEVEN_COLOR = "var(--chart-zero)";

/** Ô lịch nhiệt của một ngày KHÔNG giao dịch — trong dải ngày nhưng backend
 * không gửi ô nào cho ngày đó. */
export const NO_TRADE_COLOR = "var(--chart-empty)";

const PROFIT_HEAT_TIERS = [
  "var(--chart-heat-profit-1)",
  "var(--chart-heat-profit-2)",
  "var(--chart-heat-profit-3)",
] as const;
const LOSS_HEAT_TIERS = [
  "var(--chart-heat-loss-1)",
  "var(--chart-heat-loss-2)",
  "var(--chart-heat-loss-3)",
] as const;

/**
 * Màu ô lịch nhiệt theo bậc cường độ VÀ cực tính.
 *
 * `tier`: 1 (yếu, gần nền) .. 3 (mạnh nhất) — heatmap.ts tính bậc bằng tam
 * phân vị của |sum_net|. `profit`: true dùng ramp teal, false dùng ramp đỏ. Cả
 * hai ramp đã qua validateOrdinal ở cả hai theme; dark mode đọc NGƯỢC chiều
 * qua khối [data-theme="dark"] ở index.css, nên hàm này không cần biết theme
 * hiện tại — nó chỉ chọn ĐÚNG BIẾN, giá trị thật CSS tự lo.
 */
export function heatTier(tier: 1 | 2 | 3, profit: boolean): string {
  return (profit ? PROFIT_HEAT_TIERS : LOSS_HEAT_TIERS)[tier - 1];
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
export function theoryLineColor(kind: "lyThuyet" | "thucTe"): string {
  return kind === "thucTe" ? ACTUAL_COLOR : NEUTRAL_COLOR;
}

/**
 * Màu của một loại lệnh trong doughnut phân bố (§5.14).
 *
 * Khoá theo VỊ TRÍ, không theo chuỗi enum. Hai lý do, cả hai đều bắt buộc:
 *
 *  1. styleguard cấm chép cứng chuỗi enum tiếng Việt ngoài src/test/ — chúng
 *     là dữ liệu của backend, không phải hằng của frontend.
 *  2. Backend LUÔN trả đủ năm hàng theo đúng thứ tự domain.TradeClasses
 *     (aggregate.ByTradeClass), kể cả hàng 0 lệnh — chính là để chỉ số hàng
 *     ổn định giữa hai lần render. Không có bảo đảm đó thì cách này sai.
 *
 * Thứ tự enum (domain.TradeClasses): phần tử đầu là lệnh CHƯA CHẤM ĐIỂM, bốn
 * phần tử sau xếp từ tốt nhất tới tệ nhất. Trade class là thang
 * THỨ BẬC chứ không phải danh mục rời rạc, nên dùng lại hai ramp ORDINAL đã
 * qua validateOrdinal ở cả hai theme, thay vì bịa một bảng 5 màu categorical
 * mới chưa ai kiểm tương phản. Phần tử đầu là lệnh chưa chấm — nó nằm NGOÀI
 * thang chất lượng, nên mang màu trung tính.
 */
const TRADE_CLASS_COLOR = [
  NEUTRAL_COLOR,
  "var(--chart-heat-profit-3)",
  "var(--chart-heat-profit-1)",
  "var(--chart-heat-loss-1)",
  "var(--chart-heat-loss-3)",
] as const;

/**
 * `i` là chỉ số hàng trong mảng by_trade_class của backend.
 *
 * Ngoài dải trả màu trung tính thay vì undefined: thà một lát xám còn hơn một
 * lát trong suốt không ai giải thích được — và nếu backend thêm loại thứ sáu,
 * biểu đồ vẫn vẽ được trong lúc chờ bổ sung màu.
 */
export function tradeClassColor(i: number): string {
  return TRADE_CLASS_COLOR[i] ?? NEUTRAL_COLOR;
}
