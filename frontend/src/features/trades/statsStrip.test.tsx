import { render, screen, within } from "@testing-library/react";
import { taoStats } from "@/test/tradeFactory";
import { StatsStrip } from "./StatsStrip";

function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("bày sáu chỉ số của tập đang lọc", () => {
  render(
    <StatsStrip
      stats={taoStats({
        total_trades: 3,
        net_profit: "200",
        win_pct: "66.67",
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
  render(<StatsStrip stats={taoStats({ profit_factor: null, win_pct: null })} currency="USD" />);
  expect(o("Hệ số lợi nhuận").getByText("—")).toBeInTheDocument();
  expect(o("Tỷ lệ thắng").getByText("—")).toBeInTheDocument();
  expect(o("Hệ số lợi nhuận").queryByText("0")).not.toBeInTheDocument();
});

test("ngưỡng hệ số lợi nhuận đổi màu theo §8.2", () => {
  const mau = (pf: string) => {
    const { unmount } = render(
      <StatsStrip stats={taoStats({ profit_factor: pf })} currency="USD" />,
    );
    const lop = o("Hệ số lợi nhuận").getByText(pf.replace(".", ",")).className;
    unmount();
    return lop;
  };

  expect(mau("0.8")).toContain("text-destructive");
  expect(mau("1.2")).toContain("text-warning");
  expect(mau("1.5")).toContain("text-success");
  expect(mau("1.8")).toContain("text-success");
  expect(mau("2.5")).toContain("text-info");
});

// Tập rỗng là trạng thái hợp lệ, không phải lỗi: account mới chưa có lệnh nào.
test("tập rỗng vẫn dựng được, không nổ", () => {
  render(
    <StatsStrip
      stats={taoStats({
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
