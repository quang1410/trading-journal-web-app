import { render, screen, within } from "@testing-library/react";
import { TheorySummaryBlock } from "./TheorySummaryBlock";
import type { TheorySummary } from "./types";

function ve(data: TheorySummary) {
  return render(<TheorySummaryBlock data={data} currency="USD" />);
}

function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện đủ ba con số", () => {
  ve({ theory: "250", actual: "190", diff: "-60" });
  expect(o("Lợi nhuận lý thuyết").getByText(/250/)).toBeInTheDocument();
  expect(o("Lợi nhuận thực tế").getByText(/190/)).toBeInTheDocument();
  expect(o("Chênh lệch").getByText(/60/)).toBeInTheDocument();
});

// Màu lấy theo dấu của DIFF, không theo dấu của actual: thực tế +190 vẫn là
// tin xấu nếu lý thuyết đáng lẽ +250.
test("chênh lệch âm tô màu lỗ dù thực tế vẫn dương", () => {
  const { container } = ve({ theory: "250", actual: "190", diff: "-60" });
  expect(container.querySelector(".text-destructive")).not.toBeNull();
});

test("chênh lệch dương tô màu lãi", () => {
  const { container } = ve({ theory: "100", actual: "180", diff: "80" });
  expect(container.querySelector(".text-primary")).not.toBeNull();
});

// Hai ô đầu là MỐC THAM CHIẾU, không phải kết quả — tô màu cả ba sẽ làm mất
// trọng tâm của ô duy nhất cần đọc.
test("hai ô lý thuyết và thực tế không tô màu theo dấu", () => {
  ve({ theory: "-100", actual: "-180", diff: "-80" });
  for (const nhan of ["Lợi nhuận lý thuyết", "Lợi nhuận thực tế"]) {
    expect(screen.getByRole("group", { name: nhan }).querySelector(".text-destructive")).toBeNull();
  }
  // Chỉ ô chênh lệch được tô.
  expect(
    screen.getByRole("group", { name: "Chênh lệch" }).querySelector(".text-destructive"),
  ).not.toBeNull();
});
