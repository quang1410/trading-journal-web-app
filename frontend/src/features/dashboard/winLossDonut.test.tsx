import { render, screen, within } from "@testing-library/react";
import { WinLossDonut } from "./WinLossDonut";
import type { WinLossSplit } from "./types";

function ve(data: WinLossSplit) {
  return render(<WinLossDonut data={data} />);
}

// Recharts không vẽ gì trong jsdom (ResponsiveContainer đo bằng
// ResizeObserver), nên bảng đi kèm là bản đọc được DUY NHẤT của biểu đồ —
// vừa để test assert, vừa là đường truy cập cho trình đọc màn hình.
//
// Khoanh theo rowheader chứ không theo tên hàng: tiêu đề bảng là "Thắng /
// Thua" nên regex /Thua/ vớ cả hàng tiêu đề lẫn hàng dữ liệu.
function row(label: string) {
  return within(screen.getByRole("rowheader", { name: label }).closest("tr") as HTMLElement);
}

test("hiện đủ ba con số, gồm cả lệnh hoà", () => {
  ve({ win_count: 7, loss_count: 3, even_count: 1 });

  expect(row("Thắng").getByText("7")).toBeInTheDocument();
  expect(row("Thua").getByText("3")).toBeInTheDocument();
  expect(row("Hoà").getByText("1")).toBeInTheDocument();
});

// Một lát 0% vẫn chiếm chỗ trong bảng và làm người đọc tưởng có lệnh hoà.
test("không có lệnh hoà thì không hiện hàng hoà", () => {
  ve({ win_count: 2, loss_count: 1, even_count: 0 });

  expect(screen.queryByRole("rowheader", { name: "Hoà" })).not.toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "Thắng" })).toBeInTheDocument();
});

// Thắng và thua LUÔN hiện kể cả bằng 0: một hàng vắng mặt trông khác hẳn một
// hàng bằng 0, và cái sau là thông tin thật.
test("thua = 0 vẫn giữ hàng thua", () => {
  ve({ win_count: 3, loss_count: 0, even_count: 0 });

  expect(row("Thua").getByText("0")).toBeInTheDocument();
});

test("không có lệnh nào thì không ném", () => {
  expect(() => ve({ win_count: 0, loss_count: 0, even_count: 0 })).not.toThrow();
});
