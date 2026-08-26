import { render, screen, within } from "@testing-library/react";
import { TradeClassChart } from "./TradeClassChart";
import type { ClassStat } from "./types";

// Chuỗi loại lệnh chép nguyên văn từ backend/internal/domain/enums.go:47-51.
// Gõ lại bằng tay là sai một dấu là hỏng, và lỗi sẽ khó đọc.
const rows: ClassStat[] = [
  { class: "CHƯA ĐÁNH GIÁ", count: 1, pct: "0.2", sum_net: "10" },
  { class: "Đúng kế hoạch", count: 2, pct: "0.4", sum_net: "150" },
  { class: "Cần cải thiện", count: 0, pct: "0", sum_net: "0" },
  { class: "Bốc đồng / FOMO", count: 1, pct: "0.2", sum_net: "-30" },
  { class: "Giao dịch trả thù", count: 1, pct: "0.2", sum_net: "-200" },
];

function hang(nhan: string) {
  return within(screen.getByRole("rowheader", { name: nhan }).closest("tr") as HTMLElement);
}

test("bảng liệt kê mọi loại có lệnh", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);

  expect(hang("Đúng kế hoạch").getByText("40,00%")).toBeInTheDocument();
  expect(hang("Đúng kế hoạch").getByText("2")).toBeInTheDocument();
  expect(hang("Đúng kế hoạch").getByText(/150/)).toBeInTheDocument();
});

// Backend cố ý trả đủ 5 hàng kể cả count = 0 để màu doughnut ổn định giữa hai
// lần render. Bảng thì ngược lại: hàng 0 lệnh chỉ làm loãng thông tin.
test("bảng bỏ loại không có lệnh nào", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);

  expect(screen.queryByRole("rowheader", { name: "Cần cải thiện" })).not.toBeInTheDocument();
});

test("net âm tô màu lỗ", () => {
  render(<TradeClassChart rows={rows} currency="USD" />);

  const tr = screen.getByRole("rowheader", { name: "Giao dịch trả thù" }).closest("tr");
  expect(tr?.querySelector(".text-destructive")).not.toBeNull();
});

test("không có lệnh nào thì không ném", () => {
  const rong = rows.map((r) => ({ ...r, count: 0, pct: "0", sum_net: "0" }));
  expect(() => render(<TradeClassChart rows={rong} currency="USD" />)).not.toThrow();
});
