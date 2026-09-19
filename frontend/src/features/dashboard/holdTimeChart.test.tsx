import { render, screen } from "@testing-library/react";
import { HoldTimeChart, holdTooltipRow } from "./HoldTimeChart";
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
// tình không xếp nó vào bên nào (holddist.go).
//
// hasData phải xét theo COUNT: xét theo wins/losses thì bucket toàn lệnh hoà
// bị trốn sau trạng thái rỗng, trong khi ba ô KPI thời gian giữ ngay phía trên
// vẫn hiện số thật — hai chỗ trên cùng một dashboard nói ngược nhau về cùng
// một tập lệnh. Cột không cao 0 vì lệnh hoà được vẽ ở tầng `evens`.
test("chỉ toàn lệnh hoà vốn vẫn là có dữ liệu, không trốn sau trạng thái rỗng", () => {
  const rows: HoldBucket[] = [{ label: "< 5m", count: 4, wins: 0, losses: 0, sum_net: "0" }];
  render(<HoldTimeChart rows={rows} currency="USD" />);

  expect(screen.queryByText(/chưa có lệnh nào/i)).not.toBeInTheDocument();

  // Bảng phụ là thứ đọc được trong jsdom (biểu đồ không vẽ, xem ghi chú trên)
  // — 4 lệnh vẫn phải hiện ra, đúng con số KPI đang nói.
  const row = screen.getByRole("row", { name: /< 5m/ });
  const cells = row.querySelectorAll("td, th");
  expect(Array.from(cells).map((c) => c.textContent)).toEqual(["< 5m", "4", "0", "0", "0,00 USD"]);
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

// Recharts gọi formatter MỘT LẦN CHO MỖI <Bar>. Biểu đồ này có ba tầng
// (thắng/thua/hoà), nên formatter trả chuỗi tổng hợp cả bucket sẽ in lại y hệt
// nhau BA LẦN — lỗi đã gặp thật trên màn hình. Mỗi dòng phải nói về đúng tầng
// của nó; con số của cả bucket thuộc về labelFormatter (in một lần).
describe("holdTooltipRow", () => {
  test("mỗi tầng ra một dòng riêng, không phải chuỗi tổng hợp lặp lại", () => {
    expect(holdTooltipRow(7, "Thắng")).toEqual(["7", "Thắng"]);
    expect(holdTooltipRow(3, "Thua")).toEqual(["3", "Thua"]);
    expect(holdTooltipRow(2, "Hoà")).toEqual(["2", "Hoà"]);
  });

  // Tầng cao 0 không vẽ gì trên cột; hiện "Hoà 0" trong tooltip là tiếng ồn.
  test("tầng cao 0 không sinh dòng nào", () => {
    expect(holdTooltipRow(0, "Hoà")).toBeNull();
  });
});
