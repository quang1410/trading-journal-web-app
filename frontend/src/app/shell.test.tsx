import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const session = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function renderLoggedIn() {
  server.use(
    http.post(`${BASE}/auth/refresh`, () => envelope(session)),
    http.get(`${BASE}/accounts`, () => envelope([])),
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
  renderLoggedIn();
  expect(await screen.findByText("toi@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tài khoản" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();
});

test("đổi giao diện thì đổi data-theme và ghi vào localStorage", async () => {
  renderLoggedIn();
  await userEvent.click(await screen.findByRole("button", { name: "Mở tuỳ chọn người dùng" }));
  const button = await screen.findByRole("button", { name: /giao diện sáng/i });

  await userEvent.click(button);

  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
});

// Máy chủ không trả lời cũng phải đăng xuất được. Nếu chỉ dọn phía client
// khi API trả 200 thì mất mạng đồng nghĩa với kẹt lại trong app.
test("đăng xuất được kể cả khi máy chủ trả 500", async () => {
  renderLoggedIn();
  await screen.findByText("toi@example.com");
  server.use(
    http.post(`${BASE}/auth/logout`, () =>
      HttpResponse.json({ code: 1500, msg: "lỗi hệ thống", data: null }, { status: 500 }),
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: "Mở tuỳ chọn người dùng" }));
  await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});

test("thu gọn sidebar và ghi lại trạng thái", async () => {
  renderLoggedIn();
  const button = await screen.findByRole("button", { name: "Thu gọn thanh điều hướng" });

  await userEvent.click(button);

  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(localStorage.getItem("journal.sidebar")).toBe("collapsed");
  expect(screen.getByRole("button", { name: "Mở tuỳ chọn người dùng" })).toHaveAttribute(
    "title",
    "toi@example.com",
  );
  expect(screen.getByRole("img", { name: "Nhật ký giao dịch" })).toBeInTheDocument();
  expect(screen.queryByText("Nhật ký")).not.toBeInTheDocument();
});

// hiệu ứng mờ nội dung sidebar chỉ chạy sau cú bấm: tải trang mà chạy thì cả sidebar chớp mỗi lần F5
test("sidebar chỉ bật hiệu ứng nội dung sau lần thu gọn/mở đầu tiên", async () => {
  renderLoggedIn();
  const button = await screen.findByRole("button", { name: "Thu gọn thanh điều hướng" });
  const sidebar = document.querySelector('[data-slot="sidebar"]');
  expect(sidebar).not.toHaveAttribute("data-animate");

  await userEvent.click(button);

  expect(sidebar).toHaveAttribute("data-animate");
});

// Desktop: nút thu gọn nằm cạnh logo trong sidebar, không có thanh trên riêng tốn chiều cao.
test("nút thu gọn nằm trong sidebar, desktop không có thanh trên", async () => {
  renderLoggedIn();
  const sidebar = await screen.findByRole("complementary", { name: "Thanh điều hướng" });

  await userEvent.click(within(sidebar).getByRole("button", { name: "Thu gọn thanh điều hướng" }));

  expect(within(sidebar).getByRole("button", { name: "Mở rộng thanh điều hướng" })).toBeInTheDocument();
  expect(within(sidebar).getByRole("img", { name: "Nhật ký giao dịch" })).toBeInTheDocument();
  expect(document.querySelector(".horus-topnav")).toBeNull();
});

test("profile popover hiện đủ tuỳ chọn giao diện, ngôn ngữ và đăng xuất", async () => {
  renderLoggedIn();
  await userEvent.click(await screen.findByRole("button", { name: "Mở tuỳ chọn người dùng" }));

  expect(screen.getByText("Giao diện")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tiếng Việt" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
});
