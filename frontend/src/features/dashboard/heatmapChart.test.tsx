import { render, screen } from "@testing-library/react";
import { HeatmapChart } from "./HeatmapChart";
import type { HeatmapMonth } from "./types";

// Fixture CÓ lỗ thủng thật — cùng ca dùng ở heatmap.test.ts, để bài kiểm ở
// đây bám vào DOM THẬT thay vì chỉ vào cấu trúc dữ liệu.
const CO_LO_THUNG: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "100", count: 1 },
      { day: "2026-06-15", sum_net: "-40", count: 1 },
    ],
  },
];

test("render được và nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  expect(screen.getByRole("heading", { name: "Lịch nhiệt" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Lịch nhiệt/);
});

test("mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<HeatmapChart months={[]} currency="USD" />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// BẤT BIẾN SỐ 1, kiểm ở mức DOM: đây là biểu đồ DUY NHẤT của dashboard vẽ ra
// thật trong jsdom (không dùng Recharts/ResizeObserver), nên test ở đây được
// phép bám thẳng vào phần tử thay vì chỉ smoke test.
test("năm ngày thủng render thành ô thật, không bị bỏ khỏi DOM", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  const thung = container.querySelectorAll('[data-trangthai="khongGiaoDich"]');
  expect(thung).toHaveLength(5);
});

test("ngoài dải không render ô nào (không có div thừa cho phần đệm)", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  // Lưới 09/06->15/06 trải 2 cột = 14 ô grid, nhưng chỉ 7 ô là NGÀY THẬT
  // (09,10,11,12,13,14,15) — 7 ô còn lại là ngoaiDai, không render.
  const realCells = container.querySelectorAll("[data-trangthai]");
  expect(realCells).toHaveLength(7);
});

test("bảng đọc được có đúng 7 hàng — không nhiều hơn (không lẫn ngoaiDai), không ít hơn (không mất khongGiaoDich)", () => {
  render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  const row = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(row).toEqual([
    "2026-06-09",
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
    "2026-06-13",
    "2026-06-14",
    "2026-06-15",
  ]);
});

test("ô có lệnh mang đúng bậc màu qua thuộc tính style", () => {
  const { container } = render(<HeatmapChart months={CO_LO_THUNG} currency="USD" />);
  // Hai ngày có lệnh: +100 và -40. Tam phân vị tính trên ĐỘ LỚN của CẢ HAI
  // nhánh chung một tập (dấu chỉ quyết định dùng ramp nào, không tách tập):
  // sorted = [40, 100], n = 2 -> b1 = sorted[0] = 40, b2 = sorted[1] = 100.
  //   |100|: không < 40, không < 100  -> bậc 3 -> ramp lãi
  //   |40| : không < 40 (bằng đúng ranh giới, ĐÓNG DƯỚI nên KHÔNG ở bậc 1),
  //          nhưng 40 < 100            -> bậc 2 -> ramp lỗ
  const o09 = container.querySelector('[title^="2026-06-09"]');
  const o15 = container.querySelector('[title^="2026-06-15"]');
  expect(o09?.getAttribute("style")).toContain("--chart-heat-profit-3");
  expect(o15?.getAttribute("style")).toContain("--chart-heat-loss-2");
});
