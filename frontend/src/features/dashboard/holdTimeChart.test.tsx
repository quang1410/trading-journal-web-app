import { render, screen } from "@testing-library/react";
import { HoldTimeChart } from "./HoldTimeChart";
import type { HoldBucket } from "./types";

// SMOKE TEST, cố ý nông — cùng lý do đã ghi ở pivotBarChart.test.tsx:
// ResponsiveContainer đo bằng ResizeObserver mà jsdom không có, nên biểu đồ
// không vẽ path/rect nào trong môi trường test. Phần đáng kiểm (thứ tự bucket,
// đổi sum_net sang số) nằm ở prepare.test.ts.
test("không có lệnh nào có giờ đóng thì hiện trạng thái rỗng", () => {
  const rows: HoldBucket[] = [
    { label: "< 5m", count: 0, wins: 0, losses: 0, sum_net: "0" },
    { label: "5m – 15m", count: 0, wins: 0, losses: 0, sum_net: "0" },
  ];
  render(<HoldTimeChart rows={rows} />);

  // Sáu cột cao 0 trông như một biểu đồ hỏng; trạng thái rỗng nói đúng sự
  // thật (ChartCard dùng chung khoá dashboard.emptyGroup với mọi chart khác).
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("bảng phụ liệt kê đủ bucket kèm thắng thua", () => {
  const rows: HoldBucket[] = [{ label: "< 5m", count: 3, wins: 2, losses: 1, sum_net: "120.5" }];
  render(<HoldTimeChart rows={rows} />);

  expect(screen.getByRole("table")).toBeInTheDocument();
  const group = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(group).toEqual(["< 5m"]);
});
