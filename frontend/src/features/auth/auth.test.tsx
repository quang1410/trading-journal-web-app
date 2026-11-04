import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, fireSessionDead } from "@/lib/session";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const session = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

beforeEach(() => {
  clearSession();
  __resetApiForTest();
});

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>TRANG LOGIN</div>} />
            <Route
              path="/accounts"
              element={
                <RequireAuth>
                  <div>NỘI DUNG RIÊNG</div>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
// Khi refresh còn đang bay, trạng thái là "loading" — CHƯA biết đã đăng nhập
// hay chưa. Redirect lúc này là bug kinh điển: F5 trên /accounts sẽ văng sang
// /login trước khi máy chủ kịp trả lời, và người dùng thấy mình bị đăng xuất
// mỗi lần refresh trang dù phiên vẫn còn nguyên.
test("đang khôi phục phiên thì hiện splash, TUYỆT ĐỐI không đẩy sang /login", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => new Promise<never>(() => {})));
  renderApp();

  expect(await screen.findByRole("status")).toHaveTextContent(/khôi phục phiên/i);
  expect(screen.queryByText("TRANG LOGIN")).not.toBeInTheDocument();
  expect(screen.queryByText("NỘI DUNG RIÊNG")).not.toBeInTheDocument();
});

test("refresh thành công thì vào thẳng nội dung riêng", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => envelope(session)));
  renderApp();
  expect(await screen.findByText("NỘI DUNG RIÊNG")).toBeInTheDocument();
});

test("refresh thất bại thì sang /login", async () => {
  server.use(
    http.post(`${BASE}/auth/refresh`, () =>
      HttpResponse.json(
        { code: 1401, msg: "phiên đăng nhập không hợp lệ, đăng nhập lại", data: null },
        { status: 401 },
      ),
    ),
  );
  renderApp();
  expect(await screen.findByText("TRANG LOGIN")).toBeInTheDocument();
});

// Cache của TanStack Query giữ dữ liệu của user cũ. Không dọn thì user sau
// đăng nhập vào sẽ thấy chớp qua danh sách account của user trước.
test("phiên chết giữa chừng thì dọn cache và sang /login", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => envelope(session)));
  const qc = renderApp();
  await screen.findByText("NỘI DUNG RIÊNG");

  qc.setQueryData(["accounts"], [{ id: 1 }]);
  fireSessionDead();

  expect(await screen.findByText("TRANG LOGIN")).toBeInTheDocument();
  await waitFor(() => expect(qc.getQueryData(["accounts"])).toBeUndefined());
});
