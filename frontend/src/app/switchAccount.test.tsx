import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { taoLenh, taoStats } from "@/test/tradeFactory";
import { AppRoutes } from "./router";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const phien = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

const taiKhoan = (id: number, code: string) => ({
  id,
  code,
  name: code,
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
});

const trang = (t: ReturnType<typeof taoLenh>) => ({ items: [t], page: 1, size: 50, total: 1 });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
});

test("đổi tài khoản ở sidebar thì bảng lệnh đổi theo", async () => {
  server.use(
    http.post(`${BASE}/auth/refresh`, () => phongBi(phien)),
    http.get(`${BASE}/accounts`, () => phongBi([taiKhoan(1, "FTMO"), taiKhoan(2, "LIVE")])),
    http.get(`${BASE}/meta/enums`, () =>
      phongBi({ directions: [], timeframes: [], trade_classes: [] }),
    ),
    http.get(`${BASE}/accounts/1/trades`, () =>
      phongBi(trang(taoLenh({ id: 11, symbol: "XAUUSD" }))),
    ),
    http.get(`${BASE}/accounts/2/trades`, () =>
      phongBi(trang(taoLenh({ id: 22, symbol: "EURUSD" }))),
    ),
    http.get(`${BASE}/accounts/:id/stats`, () => phongBi(taoStats())),
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

  expect(await screen.findByText("XAUUSD")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Thu gọn thanh điều hướng" }));
  expect(screen.getByRole("combobox", { name: /tài khoản đang xem: FTMO/i })).toHaveAttribute(
    "title",
    "FTMO",
  );

  await userEvent.click(await screen.findByRole("combobox", { name: /tài khoản đang xem: FTMO/i }));
  await userEvent.click(await screen.findByRole("option", { name: "LIVE" }));

  expect(await screen.findByText("EURUSD")).toBeInTheDocument();
});
