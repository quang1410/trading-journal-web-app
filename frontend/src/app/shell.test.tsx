import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { THEME_KEY } from "@/lib/theme";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AppRoutes } from "./router";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const phien = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function dungDaDangNhap() {
  server.use(
    http.post(`${BASE}/auth/refresh`, () => phongBi(phien)),
    http.get(`${BASE}/accounts`, () => phongBi([])),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("shell hiện email người dùng và điều hướng", async () => {
  dungDaDangNhap();
  expect(await screen.findByText("toi@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tài khoản" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();
});

test("đổi giao diện thì đổi data-theme và ghi vào localStorage", async () => {
  dungDaDangNhap();
  const nut = await screen.findByRole("button", { name: /giao diện sáng/i });

  await userEvent.click(nut);

  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
});

// Máy chủ không trả lời cũng phải đăng xuất được. Nếu chỉ dọn phía client
// khi API trả 200 thì mất mạng đồng nghĩa với kẹt lại trong app.
test("đăng xuất được kể cả khi máy chủ trả 500", async () => {
  dungDaDangNhap();
  await screen.findByText("toi@example.com");
  server.use(
    http.post(`${BASE}/auth/logout`, () =>
      HttpResponse.json({ code: 1500, msg: "lỗi hệ thống", data: null }, { status: 500 }),
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});
