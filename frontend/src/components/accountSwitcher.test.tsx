import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { __resetActiveAccountForTest } from "@/features/accounts/activeAccount";
import { makeStats } from "@/test/tradeFactory";
import { AppRoutes } from "@/app/router";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const session = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

// Đúng dữ liệu gây ra vấn đề: mã do sàn cấp là dãy số lệch nhau một chữ số
// CUỐI, còn tên là thứ duy nhất đọc ra được.
const taiKhoan = (id: number, code: string, name: string, balance: string) => ({
  id,
  code,
  name,
  initial_balance: balance,
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
});

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  __resetActiveAccountForTest();
  localStorage.clear();
});

function renderShell(accounts: unknown[]) {
  server.use(
    http.post(`${BASE}/auth/refresh`, () => envelope(session)),
    http.get(`${BASE}/accounts`, () => envelope(accounts)),
    http.get(`${BASE}/meta/enums`, () =>
      envelope({ directions: [], timeframes: [], trade_classes: [] }),
    ),
    http.get(`${BASE}/accounts/:id/trades`, () =>
      envelope({ items: [], page: 1, size: 50, total: 0 }),
    ),
    http.get(`${BASE}/accounts/:id/stats`, () => envelope(makeStats())),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/trades"]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("ô chọn hiện TÊN tài khoản, mã của sàn xuống dòng phụ", async () => {
  renderShell([
    taiKhoan(1, "455981", "Thử thách FTMO", "10000"),
    taiKhoan(2, "455982", "Tài khoản thật", "25000"),
  ]);

  const trigger = await screen.findByRole("combobox", { name: /tài khoản đang xem/i });
  expect(trigger).toHaveTextContent("Thử thách FTMO");
  expect(trigger).toHaveTextContent("455981");
});

test("danh sách phân biệt được hai tài khoản chỉ lệch chữ số cuối", async () => {
  renderShell([
    taiKhoan(1, "455981", "Thử thách FTMO", "10000"),
    taiKhoan(2, "455982", "Tài khoản thật", "25000"),
  ]);

  await userEvent.click(await screen.findByRole("combobox", { name: /tài khoản đang xem/i }));

  // Mỗi dòng mang TÊN trước, mã sau — đọc tên là xong, không phải so từng
  // chữ số. Vốn KHÔNG lặp lại ở đây: nó đã nằm ở dòng "Vốn · 1R" dưới ô chọn.
  const thuThach = await screen.findByRole("option", { name: /Thử thách FTMO/ });
  expect(thuThach).toHaveTextContent("455981");
  expect(thuThach).not.toHaveTextContent("10.000,00");

  const thatSu = screen.getByRole("option", { name: /Tài khoản thật/ });
  expect(thatSu).toHaveTextContent("455982");
});

test("mỗi tài khoản có một dấu màu bền theo id", async () => {
  renderShell([
    taiKhoan(1, "455981", "Thử thách FTMO", "10000"),
    taiKhoan(2, "455982", "Tài khoản thật", "25000"),
  ]);

  await userEvent.click(await screen.findByRole("combobox", { name: /tài khoản đang xem/i }));

  const chip = (name: RegExp) =>
    within(screen.getByRole("option", { name })).getByTestId("account-chip");

  const a = chip(/Thử thách FTMO/).getAttribute("data-chip");
  const b = chip(/Tài khoản thật/).getAttribute("data-chip");
  expect(a).not.toBeNull();
  expect(a).not.toBe(b);
});

test("tên trùng mã thì không in dãy số hai lần", async () => {
  renderShell([taiKhoan(1, "FTMO", "FTMO", "10000")]);

  const trigger = await screen.findByRole("combobox", { name: /tài khoản đang xem/i });
  expect(trigger).toHaveTextContent("FTMO");
  // Chỉ một lần: dòng phụ phải rỗng khi nó chẳng thêm thông tin gì.
  expect(trigger.textContent?.match(/FTMO/g)).toHaveLength(1);
});

test("thu gọn sidebar thì dấu màu và tooltip thay cho chữ", async () => {
  renderShell([
    taiKhoan(1, "455981", "Thử thách FTMO", "10000"),
    taiKhoan(2, "455982", "Tài khoản thật", "25000"),
  ]);

  await screen.findByRole("combobox", { name: /tài khoản đang xem/i });
  await userEvent.click(screen.getByRole("button", { name: "Thu gọn thanh điều hướng" }));

  const trigger = screen.getByRole("combobox", { name: /tài khoản đang xem: Thử thách FTMO/i });
  expect(trigger).toHaveAttribute("title", "Thử thách FTMO");
  expect(within(trigger).getByTestId("account-chip")).toBeInTheDocument();
});
