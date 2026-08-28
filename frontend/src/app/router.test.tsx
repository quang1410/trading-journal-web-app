import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AppRoutes } from "./router";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const errorEnvelope = (code: number, msg: string, status: number) =>
  HttpResponse.json({ code, msg, data: null }, { status });
const notLoggedIn = http.post(`${BASE}/auth/refresh`, () =>
  errorEnvelope(1401, "phiên đăng nhập không hợp lệ, đăng nhập lại", 401),
);

beforeEach(() => {
  clearSession();
  __resetApiForTest();
});

function renderPage(duong: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[duong]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("chưa đăng nhập, vào / thì kết cục là trang đăng nhập", async () => {
  server.use(notLoggedIn);
  renderPage("/");
  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});

// Backend đã trả tiếng Việt hiển thị được. FE viết lại câu này là tạo nguồn
// sự thật thứ hai, và hai nguồn sẽ lệch nhau.
test("hiện NGUYÊN VĂN msg của backend khi sai mật khẩu", async () => {
  server.use(
    notLoggedIn,
    http.post(`${BASE}/auth/login`, () => errorEnvelope(1401, "email hoặc mật khẩu không đúng", 401)),
  );
  renderPage("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhausai");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByText("email hoặc mật khẩu không đúng")).toBeInTheDocument();
});

// Đích sau đăng nhập là /dashboard, không phải /accounts (spec 4a §9): đăng
// nhập xong nên thấy KẾT QUẢ giao dịch, không phải trang cấu hình. Tài khoản
// rỗng nên DashboardPage rơi vào nhánh "chưa có tài khoản" — đúng route, nên
// route đó phải render, và lối "Tạo tài khoản giao dịch" là bằng chứng.
test("đăng nhập thành công thì vào bảng điều khiển", async () => {
  server.use(
    notLoggedIn,
    http.post(`${BASE}/auth/login`, () =>
      envelope({ access_token: "abc", user: { id: 1, email: "toi@example.com" } }),
    ),
    http.get(`${BASE}/accounts`, () => envelope([])),
  );
  renderPage("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhaudung");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(
    await screen.findByRole("link", { name: "Tạo tài khoản giao dịch" }),
  ).toBeInTheDocument();
});

// Ngưỡng 8 lấy từ backend (service/auth.go:25). Chặn ở FE là để phản hồi
// nhanh; MSW đang bật onUnhandledRequest:"error" nên nếu có request lọt ra
// thì test này đỏ — tức là nó cũng chứng minh luôn rằng KHÔNG có request nào.
test("mật khẩu ngắn bị chặn ngay ở client", async () => {
  server.use(notLoggedIn);
  renderPage("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "ngan");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByText("mật khẩu phải dài ít nhất 8 ký tự")).toBeInTheDocument();
});

// Đăng ký chỉ mở cho user đầu tiên (quyết định #4 của spec 2a).
test("đăng ký khi đã đóng thì hiện msg của backend kèm lối sang đăng nhập", async () => {
  server.use(
    notLoggedIn,
    http.post(`${BASE}/auth/register`, () => errorEnvelope(1403, "đã có tài khoản, đăng ký đã đóng", 403)),
  );
  renderPage("/register");
  await screen.findByRole("heading", { name: "Đăng ký" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhaudai");
  await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));

  expect(await screen.findByText("đã có tài khoản, đăng ký đã đóng")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /đăng nhập/i })).toBeInTheDocument();
});
