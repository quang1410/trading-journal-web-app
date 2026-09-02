import { render, screen, within } from "@testing-library/react";
import { LocaleProvider } from "@/i18n";
import { makeStats } from "@/test/tradeFactory";
import { VerdictRow } from "./VerdictRow";

function ve(over = {}) {
  return render(
    <LocaleProvider>
      <VerdictRow stats={makeStats(over)} currency="USD" />
    </LocaleProvider>,
  );
}

test("lãi ròng mang dấu và số lệnh nó gom từ đó", () => {
  ve({ net_profit: "710", total_trades: 28 });
  expect(screen.getByTestId("verdict-net")).toHaveTextContent("+710");
  // +500$ trên 4 lệnh và trên 400 lệnh là hai câu chuyện khác nhau; con số
  // dẫn không có nghĩa nếu thiếu mẫu số.
  expect(screen.getByText(/28 lệnh/)).toBeInTheDocument();
});

test("lỗ thì mang dấu trừ, không phải dấu cộng", () => {
  ve({ net_profit: "-1240" });
  expect(screen.getByTestId("verdict-net")).toHaveTextContent("-1.240");
  expect(screen.getByTestId("verdict-net")).not.toHaveTextContent("+");
});

/**
 * `null` bên Go là con trỏ nil: chưa có lệnh thua thì profit_factor KHÔNG
 * tồn tại, chứ không bằng 0. In "0" ở đây là biến "chưa thua lệnh nào" thành
 * "thua sạch" — một câu trả lời sai mà trông hoàn toàn bình thường.
 */
test("chỉ số không tính được hiện gạch ngang, không hiện 0", () => {
  ve({ profit_factor: null, expectancy: null, win_pct: null });

  for (const nhan of ["Hệ số lợi nhuận", "Kỳ vọng mỗi lệnh", "Tỷ lệ thắng"]) {
    const o = screen.getByRole("group", { name: nhan });
    expect(within(o).getByText("—")).toBeInTheDocument();
    expect(within(o).queryByText("0")).not.toBeInTheDocument();
  }
});

test("mỗi ô có tên đọc được, không chỉ là con số trơ", () => {
  ve();
  // Trình đọc màn hình phải đọc được TÊN trước con số, nếu không thì cả khối
  // chỉ là một dãy số không nhãn.
  for (const nhan of ["Lãi ròng", "Số dư hiện tại", "Tỷ lệ thắng", "Hệ số lợi nhuận"]) {
    expect(screen.getByRole("group", { name: nhan })).toBeInTheDocument();
  }
});
