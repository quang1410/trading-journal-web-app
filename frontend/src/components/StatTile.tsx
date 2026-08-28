import type { ReactNode } from "react";

/**
 * Ô chỉ số và lưới chứa nó — một chỗ duy nhất cho cả hai.
 *
 * Trước đây bốn file tự khai `function O` riêng: KpiGrid, ExecutionQualityBlock,
 * TheorySummaryBlock giống nhau từng byte, còn StatsStrip đã trôi sang `p-4`.
 * Cùng một chỉ số hiện hai kiểu ở hai trang, và không test nào bắt được vì mỗi
 * bản tự nó đúng — đúng thứ mà lib/thresholds.ts đã cảnh báo cho phần màu sắc.
 *
 * `role="group"` + `aria-label` là hợp đồng trợ năng: trình đọc màn hình đọc
 * được tên của ô trước khi đọc con số. Để nó ở đây thì không ô nào quên được.
 *
 * Vạch ngăn dựng bằng `gap-px` trên nền `bg-border`: mỗi ô tự vẽ nền của mình
 * nên đường kẻ hiện ra đúng ở mọi số cột mà breakpoint chọn, không phải đếm xem
 * ô nào cần border bên nào. Theme tắt hết shadow nên phân tầng bằng đúng border
 * và bậc surface.
 */
export function StatTile({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  /** Ô dẫn của StatsStrip cần nhiều khoảng thở hơn — `p-4` thay vì `p-3`. */
  wide?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex flex-col gap-1 bg-card ${wide ? "p-4" : "p-3"}`}
    >
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

/**
 * Khung lưới có vạch ngăn. `col` chỉ đặt số cột ở breakpoint rộng nhất; các
 * mức hẹp hơn do caller tự thêm qua `extra` nếu cần khác mặc định.
 */
export function StatGrid({
  children,
  col,
  extra = "",
}: {
  children: ReactNode;
  col?: string;
  extra?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-border">
      <div className={`grid gap-px ${col ?? ""} ${extra}`.trim()}>{children}</div>
    </div>
  );
}
