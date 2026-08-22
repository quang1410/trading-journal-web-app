import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { taoLenh } from "@/test/tradeFactory";
import type { Trade } from "./types";
import { TradeTable } from "./TradeTable";

const TZ = "Asia/Ho_Chi_Minh";

function dung(rows: Trade[] = [taoLenh()], tz = TZ) {
  return render(
    <TradeTable rows={rows} timezone={tz} currency="USD" onSua={() => {}} onXoa={() => {}} />,
  );
}

test("bày trường suy diễn do backend tính", () => {
  dung([taoLenh({ stt: 3, net: "118.50", cum_by_trade: "298.50", score_total: 85 })]);
  const d = screen.getByRole("row", { name: /XAUUSD/ });
  expect(within(d).getByText("3")).toBeInTheDocument();
  // Cột Net hiện kèm đơn vị tiền, cột Lãi/lỗ thì không — Net là con số người
  // đọc mang đi so với số dư, nên nó phải tự nói mình là tiền gì.
  expect(within(d).getByText("+118,5 USD")).toBeInTheDocument();
  expect(within(d).getByText("298,5")).toBeInTheDocument();
  expect(within(d).getByText("85")).toBeInTheDocument();
});

// null nghĩa là CHƯA ĐÁNH GIÁ, không phải ĐƯỢC 0 ĐIỂM. Hai chuyện khác hẳn
// nhau, và số 0 ở đây đọc ra là "vào lệnh sai hết mọi mặt".
test("chưa đánh giá thì hiện gạch ngang, không hiện 0", () => {
  dung([taoLenh({ score_total: null, trade_class: "CHƯA ĐÁNH GIÁ" })]);
  const d = screen.getByRole("row", { name: /XAUUSD/ });
  expect(within(d).getByText("—")).toBeInTheDocument();
  expect(within(d).queryByText("0")).not.toBeInTheDocument();
});

test("lãi, lỗ và hoà khác nhau cả dấu lẫn màu", () => {
  dung([
    taoLenh({ id: 1, stt: 1, symbol: "LAILON", net: "118.50" }),
    taoLenh({ id: 2, stt: 2, symbol: "LOVON", net: "-45.00" }),
    taoLenh({ id: 3, stt: 3, symbol: "HOAVON", net: "0.00" }),
  ]);

  const lai = within(screen.getByRole("row", { name: /LAILON/ }));
  expect(lai.getByText("+118,5 USD")).toHaveClass("text-primary");

  const lo = within(screen.getByRole("row", { name: /LOVON/ }));
  expect(lo.getByText("-45 USD")).toHaveClass("text-destructive");

  // "0.00" phải đọc ra là HOÀ. Một phép so sánh chuỗi ngây thơ kiểu
  // `net !== "0"` xếp nó vào nhóm lãi và gắn thêm dấu cộng.
  const hoa = within(screen.getByRole("row", { name: /HOAVON/ }));
  expect(hoa.getByText("0 USD")).toHaveClass("text-muted-foreground");
  expect(hoa.queryByText("+0 USD")).not.toBeInTheDocument();
});

test("thời điểm bám timezone của account, không bám giờ máy", () => {
  const { unmount } = dung([taoLenh({ entered_at: "2026-06-09T14:30:00Z" })], "Asia/Ho_Chi_Minh");
  expect(screen.getByText("09/06/2026 21:30")).toBeInTheDocument();
  unmount();

  dung([taoLenh({ entered_at: "2026-06-09T14:30:00Z" })], "America/New_York");
  expect(screen.getByText("09/06/2026 10:30")).toBeInTheDocument();
});

// Bung dòng KHÔNG gọi request nào: GET /trades đã trả đủ 40 trường. Test này
// chạy không có MSW handler nào, mà setup.ts đang bật onUnhandledRequest
// "error" — một request lọt ra là đỏ ngay.
test("bung dòng mới thấy chi tiết, và không gọi thêm request nào", async () => {
  const u = userEvent.setup();
  dung([taoLenh({ stt: 3, notes: "chờ retest H1", entry: "2048.50" })]);

  expect(screen.queryByText(/chờ retest H1/)).not.toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 3" }));
  expect(screen.getByText(/chờ retest H1/)).toBeInTheDocument();
  expect(screen.getByText("2.048,5")).toBeInTheDocument();
});

test("nút Sửa và Xoá gọi đúng lệnh", async () => {
  const u = userEvent.setup();
  const daSua: number[] = [];
  const daXoa: number[] = [];
  render(
    <TradeTable
      rows={[taoLenh({ id: 7, stt: 3 })]}
      timezone={TZ}
      currency="USD"
      onSua={(t) => daSua.push(t.id)}
      onXoa={(t) => daXoa.push(t.id)}
    />,
  );

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 3" }));
  await u.click(screen.getByRole("button", { name: "Sửa lệnh 3" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 3" }));

  expect(daSua).toEqual([7]);
  expect(daXoa).toEqual([7]);
});
