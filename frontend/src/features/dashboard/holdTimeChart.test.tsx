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
  render(<HoldTimeChart rows={rows} currency="USD" />);

  // Sáu cột cao 0 trông như một biểu đồ hỏng; trạng thái rỗng nói đúng sự
  // thật (ChartCard dùng chung khoá dashboard.emptyGroup với mọi chart khác).
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// Lệnh hoà vốn (net = 0) có count > 0 nhưng wins = losses = 0 — backend cố
// tình không xếp nó vào bên nào (holddist.go). Nếu hasData xét theo count thì
// bucket này một mình cũng đủ ép biểu đồ "có dữ liệu", trong khi hai cột
// wins/losses cao 0 — một hình trông như hỏng. hasData phải xét theo
// wins/losses, thứ THẬT SỰ được vẽ.
test("chỉ toàn lệnh hoà vốn thì vẫn hiện trạng thái rỗng, không vẽ cột cao 0", () => {
  const rows: HoldBucket[] = [{ label: "< 5m", count: 4, wins: 0, losses: 0, sum_net: "0" }];
  render(<HoldTimeChart rows={rows} currency="USD" />);

  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("kèm bảng số đọc được: đủ bucket, đúng thắng/thua, đúng lãi ròng", () => {
  const rows: HoldBucket[] = [{ label: "< 5m", count: 3, wins: 2, losses: 1, sum_net: "120.5" }];
  render(<HoldTimeChart rows={rows} currency="USD" />);

  expect(screen.getByRole("table")).toBeInTheDocument();
  const group = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(group).toEqual(["< 5m"]);

  const row = screen.getByRole("row", { name: /< 5m/ });
  const cells = row.querySelectorAll("td, th");
  // label, count, wins, losses, net — đúng thứ tự cột khai báo trong
  // HoldTimeChart. sum_net qua CHUỖI GỐC (formatMoney), không qua toPlot.
  expect(Array.from(cells).map((c) => c.textContent)).toEqual(["< 5m", "3", "2", "1", "120,50 USD"]);
});
