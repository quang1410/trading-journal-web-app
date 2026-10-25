import { CartesianGrid, XAxis, YAxis } from "recharts";

/**
 * Trang phục chung của mọi biểu đồ Recharts trên bảng điều khiển.
 *
 * Tám file từng chép nguyên khối contentStyle này, năm file chép thêm cả cặp
 * lưới + hai trục. Theme là nguồn sự thật ở docs/design/theme.css và không
 * được sửa, nên mọi giá trị dưới đây đều là biến ngữ nghĩa — đổi theme thì
 * biểu đồ đi theo, miễn là chỉ có MỘT bản.
 */
export const TOOLTIP_STYLE = {
  background: "var(--surface-modal)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-default)",
  color: "var(--text-primary)",
} as const;

/**
 * Chờ khung chứa thôi đổi cỡ bao lâu thì mới vẽ lại biểu đồ.
 *
 * Không debounce thì ResponsiveContainer vẽ lại cả biểu đồ ở mỗi khung hình của animation thu
 * gọn/mở sidebar (240ms): bảng điều khiển rớt từ 120fps xuống ~35fps.
 *
 * Phải dài hơn CẢ animation, không chỉ một khung hình: đường cong ease-out đưa bề rộng gần
 * tới đích sau vài chục ms nên sự kiện resize thôi bắn sớm; với 150ms lần vẽ lại rơi vào giữa
 * đoạn nội dung đang mờ dần lên (khung 100ms ở bản dev). 300ms thì rơi hẳn sau khi đã đứng yên.
 */
export const RESIZE_DEBOUNCE_MS = 300;

/** Vệt nền dưới con trỏ tooltip của biểu đồ cột. */
export const BAR_CURSOR = { fill: "var(--surface-raised)" } as const;

export const CHART_MARGIN = { top: 4, right: 4, bottom: 4, left: 4 } as const;

/**
 * Lưới mờ chỉ kẻ ngang, cộng hai trục.
 *
 * Đường dọc chồng lên cột không thêm thông tin nào mà làm nền ồn hẳn lên.
 * Trả về mảng chứ không phải <>…</>: Recharts đọc children của mình theo
 * type để biết cái nào là trục, một Fragment bọc ngoài sẽ giấu mất chúng.
 */
export function standardAxes({ dataKey, yWidth = 56 }: { dataKey: string; yWidth?: number }) {
  return [
    <CartesianGrid
      key="grid"
      strokeDasharray="3 3"
      vertical={false}
      stroke="var(--border-default)"
    />,
    <XAxis key="x" dataKey={dataKey} tick={{ fontSize: 12 }} stroke="var(--text-muted)" />,
    <YAxis key="y" tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={yWidth} />,
  ];
}
