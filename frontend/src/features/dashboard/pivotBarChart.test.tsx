import { render, screen } from "@testing-library/react";
import { PivotBarChart } from "./PivotBarChart";
import type { Pivot } from "./types";

const rows: Pivot[] = [
  { key: "M15", count: 1, win_count: 0, sum_net: "-51.00", ave_net: "-51.00", win_rate: "0" },
  { key: "H1", count: 9, win_count: 9, sum_net: "98", ave_net: "10.89", win_rate: "1" },
];

// SMOKE TEST, cố ý nông.
//
// ResponsiveContainer đo bằng ResizeObserver, mà jsdom không có — nên trong
// jsdom biểu đồ rộng 0px và KHÔNG vẽ ra path hay rect nào. Assert lên hình vẽ
// ở đây là assert lên khoảng trắng.
//
// Phần đáng kiểm — thứ tự, màu, hai dạng của con số — nằm ở prepare.test.ts và
// đã được kiểm ở đó, không cần DOM. Chỗ này chỉ bắt lỗi thiếu prop và lỗi dựng
// cây component.
test("render được và nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<PivotBarChart title="Theo khung thời gian" rows={rows} currency="USD" />);

  expect(screen.getByRole("heading", { name: "Theo khung thời gian" })).toBeInTheDocument();
  // figure + aria-label là thứ CÒN LẠI khi biểu đồ không vẽ được: người dùng
  // trình đọc màn hình không bao giờ "nhìn" thấy cột, nên bảng số bên dưới và
  // nhãn này là toàn bộ nội dung họ nhận được.
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Theo khung thời gian/);
});

test("mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<PivotBarChart title="Theo setup" rows={[]} currency="USD" />);

  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// Không dùng màu làm tín hiệu duy nhất (§8.2 thiết kế mẹ). Bảng số là bản đọc
// được của biểu đồ, và nó cũng là thứ duy nhất hoạt động ở jsdom.
test("kèm bảng số đọc được, không chỉ có hình", () => {
  render(<PivotBarChart title="Theo khung thời gian" rows={rows} currency="USD" />);

  expect(screen.getByRole("table")).toBeInTheDocument();
  // Thứ tự backend trả: M15 trước H1, dù H1 đứng trước theo bảng chữ cái.
  const group = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(group).toEqual(["M15", "H1"]);

  // formatMoney tự chuẩn hoá qua Intl.NumberFormat (không đặt
  // minimumFractionDigits), nên "-51.00" và "-51" ra CÙNG một chuỗi hiển thị —
  // phép kiểm giữ số 0 cuối đã nằm ở prepare.test.ts (mức hàm thuần, trước khi
  // qua Intl). Ở đây chỉ xác nhận ống dẫn thật sự nối tới bảng.
  expect(screen.getByText("-51,00 USD")).toBeInTheDocument();
});
