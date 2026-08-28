import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { BarChart } from "recharts";
import { ChartCard } from "./ChartCard";

// Bảng sr-only là bề mặt test DUY NHẤT của mọi biểu đồ: Recharts không vẽ gì
// trong jsdom. Trước đây bảy file tự viết lại nó, và không có gì hỏng khi một
// file quên — nó chỉ lặng lẽ mục đi. Giờ hợp đồng nằm ở một chỗ và test được.
test("dựng bảng sr-only từ BangSpec, cột đầu là rowheader", () => {
  render(
    <ChartCard
      title="Theo ngày"
      empty={false}
      table={{ col: ["Ngày", "Net"], row: [["2026-08-01", "+100"], ["2026-08-02", "-50"]] }}
    >
      <BarChart data={[]} />
    </ChartCard>,
  );

  const table = screen.getByRole("table");
  expect(within(table).getByText("Theo ngày")).toBeInTheDocument();
  expect(screen.getAllByRole("rowheader").map((e) => e.textContent)).toEqual([
    "2026-08-01",
    "2026-08-02",
  ]);
  expect(within(table).getByText("+100")).toBeInTheDocument();
});

test("trạng thái rỗng không dựng figure lẫn bảng", () => {
  render(
    <ChartCard title="Theo ngày" empty table={{ col: ["Ngày"], row: [["x"]] }}>
      <BarChart data={[]} />
    </ChartCard>,
  );

  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("figure")).toBeNull();
  expect(screen.getByText("Theo ngày")).toBeInTheDocument();
});

// Nhãn của figure là thứ trình đọc màn hình đọc trước khi vào biểu đồ.
test("figure mang nhãn ghép từ tiêu đề", () => {
  render(
    <ChartCard title="Theo ngày" empty={false}>
      <BarChart data={[]} />
    </ChartCard>,
  );
  expect(screen.getByRole("figure").getAttribute("aria-label")).toContain("Theo ngày");
});
