import { render, screen, within } from "@testing-library/react";
import { makeStats } from "@/test/tradeFactory";
import { StatsStrip } from "./StatsStrip";

function o(label: string) {
  return within(screen.getByRole("group", { name: label }));
}

// win_pct và net_return_pct từ backend là PHÂN SỐ (win_count/total_trades),
// không phải phần trăm. Bản trước dán thẳng "%" vào nên 28/64 hiện ra
// "0,4375%" — sai đúng một trăm lần, mà đọc lướt thì thành "thắng gần như
// không lệnh nào". Fixture ở đây nói cùng ngôn ngữ với backend.
test("bày sáu chỉ số của tập đang lọc", () => {
  render(
    <StatsStrip
      stats={makeStats({
        total_trades: 3,
        net_profit: "200",
        win_pct: "0.6667",
        profit_factor: "3",
        max_drawdown: "100",
        current_balance: "10200",
      })}
      currency="USD"
    />,
  );

  expect(o("Số lệnh").getByText("3")).toBeInTheDocument();
  expect(o("Net").getByText("+200 USD")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("66,67%")).toBeInTheDocument();
  expect(o("Hệ số lợi nhuận").getByText("3")).toBeInTheDocument();
  expect(o("Sụt giảm lớn nhất").getByText("100")).toBeInTheDocument();
  expect(o("Số dư").getByText("10.200 USD")).toBeInTheDocument();
});

// null nghĩa là KHÔNG TÍNH ĐƯỢC. Chưa có lệnh thua thì profit_factor là null;
// hiện 0 sẽ đọc ra là "thua sạch", ngược hẳn sự thật.
test("chỉ số không tính được hiện gạch ngang, không hiện 0", () => {
  render(<StatsStrip stats={makeStats({ profit_factor: null, win_pct: null })} currency="USD" />);
  expect(o("Hệ số lợi nhuận").getByText("—")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("—")).toBeInTheDocument();
  expect(o("Hệ số lợi nhuận").queryByText("0")).not.toBeInTheDocument();
});

test("ngưỡng hệ số lợi nhuận đổi màu theo §8.2", () => {
  const color = (pf: string) => {
    const { unmount } = render(
      <StatsStrip stats={makeStats({ profit_factor: pf })} currency="USD" />,
    );
    const colorClass = o("Hệ số lợi nhuận").getByText(pf.replace(".", ",")).className;
    unmount();
    return colorClass;
  };

  expect(color("0.8")).toContain("text-destructive");
  expect(color("1.2")).toContain("text-warning");
  expect(color("1.5")).toContain("text-success");
  expect(color("1.8")).toContain("text-success");
  expect(color("2.5")).toContain("text-info");
});

// Tập rỗng là trạng thái hợp lệ, không phải lỗi: account mới chưa có lệnh nào.
test("tập rỗng vẫn dựng được, không nổ", () => {
  render(
    <StatsStrip
      stats={makeStats({
        total_trades: 0,
        net_profit: "0",
        win_pct: null,
        profit_factor: null,
        max_drawdown: "0",
      })}
      currency="USD"
    />,
  );
  expect(o("Số lệnh").getByText("0")).toBeInTheDocument();
});

// Hồi quy: hai chỉ số này về ở độ chính xác đầy đủ của decimal. Bản trước in
// nguyên xi, cho ra "1,9690964899040831" chiếm chỗ một ô KPI.
test("tỷ số làm tròn hai chữ số, không in nguyên đuôi decimal", () => {
  render(
    <StatsStrip
      stats={makeStats({ profit_factor: "1.9690964899040831", win_pct: "0.4375" })}
      currency="USD"
    />,
  );
  expect(o("Hệ số lợi nhuận").getByText("1,97")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("43,75%")).toBeInTheDocument();
});
