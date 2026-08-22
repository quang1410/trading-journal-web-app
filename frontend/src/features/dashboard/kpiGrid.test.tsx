import { render, screen, within } from "@testing-library/react";
import { taoStats } from "@/test/tradeFactory";
import { KpiGrid } from "./KpiGrid";

// Không bọc provider ngôn ngữ: useI18n dựa trên instance i18next toàn cục, và
// các test sẵn có trong repo (statsStrip.test.tsx) cũng render trần như vậy.
function ve(over = {}) {
  return render(<KpiGrid stats={taoStats(over)} currency="USD" />);
}

// Khoanh vùng theo ô thay vì tìm chữ trên cả trang — nhiều ô mang cùng một
// con số. taoStats mặc định có profit_factor "3" VÀ total_trades 3, nên
// screen.getByText("3") sẽ vớ hai phần tử rồi ném.
function o(nhan: string) {
  return within(screen.getByRole("group", { name: nhan }));
}

test("hiện đủ 23 chỉ số", () => {
  ve();
  expect(screen.getAllByRole("group")).toHaveLength(23);
});

// null nghĩa là KHÔNG TÍNH ĐƯỢC, không phải bằng 0.
//
// Chưa có lệnh thua thì profit_factor là null. Hiện "0" ở đó đọc ra là "thua
// sạch" — ngược hẳn sự thật, vì chưa thua lệnh nào mới là lý do nó null.
test.each([
  ["Hệ số lợi nhuận", "profit_factor"],
  ["Hệ số hồi phục", "recovery_factor"],
  ["Kỳ vọng mỗi lệnh", "expectancy"],
  ["Tỷ lệ thắng", "win_pct"],
  ["Lãi trung bình", "ave_win"],
  ["Sụt giảm lớn nhất (%)", "max_dd_pct"],
])("%s bằng null thì hiện dấu gạch, không hiện 0", (nhan, khoa) => {
  ve({ [khoa]: null });
  expect(o(nhan).getByText("—")).toBeInTheDocument();
  expect(o(nhan).queryByText("0")).not.toBeInTheDocument();
});

test("profit_factor đổi màu theo bốn bậc ngưỡng", () => {
  const { unmount } = ve({ profit_factor: "3" });
  expect(o("Hệ số lợi nhuận").getByText("3")).toHaveClass("text-info");
  unmount();

  ve({ profit_factor: "0.5" });
  // Locale mặc định là vi nên dấu thập phân là dấu phẩy.
  expect(o("Hệ số lợi nhuận").getByText("0,5")).toHaveClass("text-destructive");
});

// win_pct là PHÂN SỐ. Dán "%" vào chuỗi thô cho ra "0,6667%" — sai một trăm
// lần, và đọc lướt thì thành "tỷ lệ thắng gần bằng không".
test("win_pct nhân 100 trước khi dán phần trăm", () => {
  ve({ win_pct: "0.6667" });
  expect(o("Tỷ lệ thắng").getByText("66,67%")).toBeInTheDocument();
});

test("tiền âm mang màu lỗ", () => {
  ve({ net_profit: "-51" });
  // formatMoney nối đơn vị tiền vào sau nên ô hiện "-51 USD", không phải
  // "-51" — tìm bằng chuỗi khít sẽ trượt.
  expect(o("Lãi ròng").getByText(/-51/)).toHaveClass("text-destructive");
});
