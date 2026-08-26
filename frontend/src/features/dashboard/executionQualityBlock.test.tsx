import { render, screen, within } from "@testing-library/react";
import { ExecutionQualityBlock } from "./ExecutionQualityBlock";
import type { ExecutionQuality } from "./types";

function ve(over: Partial<ExecutionQuality> = {}) {
  return render(
    <ExecutionQualityBlock
      data={{ planned_pct: "0.42", no_setup_count: 3, impulsive_count: 5, ...over }}
    />,
  );
}

// Nhãn ô lấy từ i18n; instance i18next toàn cục mặc định locale vi, nên tên ô
// là chuỗi tiếng Việt trong vi.ts.
function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện phần trăm đúng kế hoạch và hai bộ đếm", () => {
  ve();
  // formatPercent trả "42,00%" ở locale vi — hai chữ số thập phân, dấu phẩy.
  expect(o("Tỷ lệ vào đúng kế hoạch").getByText("42,00%")).toBeInTheDocument();
  expect(o("Lệnh không có setup").getByText("3")).toBeInTheDocument();
  expect(o("Lệnh bốc đồng / trả thù").getByText("5")).toBeInTheDocument();
});

// null nghĩa là CHƯA CÓ LỆNH NÀO, không phải 0%. Hiện "0%" ở đó đọc ra là
// "bạn chưa vào đúng kế hoạch lệnh nào" — sai và làm nản người mới dùng.
test("planned_pct null thì hiện — chứ không phải 0%", () => {
  ve({ planned_pct: null });
  expect(o("Tỷ lệ vào đúng kế hoạch").getByText("—")).toBeInTheDocument();
  expect(screen.queryByText("0,00%")).not.toBeInTheDocument();
});

// Ngưỡng 85% là chỉ số kỷ luật: dưới ngưỡng phải nhìn ra ngay.
test("dưới ngưỡng 85% thì tô màu cảnh báo", () => {
  const { container } = ve({ planned_pct: "0.42" });
  expect(container.querySelector(".text-destructive")).not.toBeNull();
});

test("đạt ngưỡng thì tô màu tốt", () => {
  const { container } = ve({ planned_pct: "0.9" });
  expect(container.querySelector(".text-primary")).not.toBeNull();
});

// Đúng bằng ngưỡng vẫn là ĐẠT: "≥ 85%" trong nhãn mục tiêu nói vậy.
test("đúng 85% là đạt", () => {
  const { container } = ve({ planned_pct: "0.85" });
  expect(container.querySelector(".text-primary")).not.toBeNull();
  expect(container.querySelector(".text-destructive")).toBeNull();
});
