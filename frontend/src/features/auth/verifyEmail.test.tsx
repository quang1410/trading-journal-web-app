import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest, ApiError } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { i18nInstance } from "@/i18n/config";
import { errorMessage } from "@/i18n/errors";
import { AuthProvider } from "./AuthProvider";
import { AppRoutes } from "@/app/router";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const fail = (status: number, code: number, msg: string) =>
  HttpResponse.json({ code, msg, data: null }, { status });
const session = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };
const DAY = 24 * 60 * 60 * 1000;

function me(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: "toi@example.com",
    locale: "vi",
    email_verified: false,
    verify_deadline: new Date(Date.now() + 3 * DAY - 60_000).toISOString(),
    verification_required: false,
    ...over,
  };
}

beforeEach(async () => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  await act(() => i18nInstance.changeLanguage("vi"));
});

function renderAt(path: string, { authed = true, strict = false } = {}) {
  server.use(
    authed
      ? http.post(`${BASE}/auth/refresh`, () => envelope(session))
      : http.post(`${BASE}/auth/refresh`, () => fail(401, 1401, "chưa đăng nhập")),
    http.get(`${BASE}/accounts`, () => envelope([])),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe("verify-email page", () => {
  test("posts the token exactly once under StrictMode and shows success", async () => {
    let calls = 0;
    let body: unknown;
    server.use(
      http.post(`${BASE}/auth/verify`, async ({ request }) => {
        calls++;
        body = await request.json();
        return envelope({ verified: true });
      }),
    );
    renderAt("/verify-email?token=tok_123", { authed: false, strict: true });

    expect(await screen.findByText("Email của bạn đã được xác minh.")).toBeInTheDocument();
    expect(body).toEqual({ token: "tok_123" });
    expect(calls).toBe(1);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });

  test("shows an error for a rejected token", async () => {
    server.use(
      http.post(`${BASE}/auth/verify`, () =>
        fail(400, 1400, "liên kết xác minh không hợp lệ hoặc đã hết hạn"),
      ),
    );
    renderAt("/verify-email?token=bad", { authed: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "liên kết xác minh không hợp lệ hoặc đã hết hạn",
    );
  });

  test("missing token shows the error without calling the API", async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/auth/verify`, () => (calls++, envelope({}))));
    renderAt("/verify-email", { authed: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Liên kết xác minh không hợp lệ hoặc đã hết hạn.",
    );
    expect(calls).toBe(0);
  });

  test("signed-in user gets a link back into the app", async () => {
    server.use(http.post(`${BASE}/auth/verify`, () => envelope({ verified: true })));
    renderAt("/verify-email?token=t");
    expect(await screen.findByRole("link", { name: "Vào ứng dụng" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

describe("verification banner and gate", () => {
  test("unverified user inside the grace period sees days left and can resend", async () => {
    let body: unknown;
    server.use(
      http.get(`${BASE}/auth/me`, () => envelope(me())),
      http.post(`${BASE}/auth/verify/request`, async ({ request }) => {
        body = await request.json();
        return envelope({ sent: true });
      }),
    );
    renderAt("/accounts");

    expect(
      await screen.findByText(
        "Hãy xác minh email toi@example.com. Còn 3 ngày trước khi phải xác minh để tiếp tục dùng ứng dụng.",
      ),
    ).toBeInTheDocument();
    // Nội dung trang vẫn hiện.
    expect(screen.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Gửi lại email xác minh" }));
    expect(await screen.findByText("Đã gửi. Kiểm tra hộp thư toi@example.com.")).toBeInTheDocument();
    expect(body).toEqual({ locale: "vi" });
  });

  test("resend uses the current UI language", async () => {
    let body: unknown;
    server.use(
      http.get(`${BASE}/auth/me`, () => envelope(me())),
      http.post(`${BASE}/auth/verify/request`, async ({ request }) => {
        body = await request.json();
        return envelope({ sent: true });
      }),
    );
    await act(() => i18nInstance.changeLanguage("en"));
    renderAt("/accounts");
    await userEvent.click(await screen.findByRole("button", { name: "Resend verification email" }));
    await waitFor(() => expect(body).toEqual({ locale: "en" }));
  });

  test("verification_required replaces the page with a blocking screen", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        envelope(me({ verification_required: true, verify_deadline: new Date(Date.now() - DAY).toISOString() })),
      ),
    );
    renderAt("/accounts");
    expect(await screen.findByRole("heading", { name: "Cần xác minh email" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tài khoản giao dịch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi lại email xác minh" })).toBeInTheDocument();
  });

  test("verified user sees no banner", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        envelope(me({ email_verified: true, verify_deadline: null })),
      ),
    );
    renderAt("/accounts");
    expect(await screen.findByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi lại email xác minh" })).not.toBeInTheDocument();
  });
});

test("register sends the current UI language", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/auth/register`, async ({ request }) => {
      body = await request.json();
      return envelope(session);
    }),
  );
  await act(() => i18nInstance.changeLanguage("en"));
  renderAt("/register", { authed: false });
  await userEvent.type(await screen.findByLabelText("Email"), "new@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "long-enough-password");
  await userEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() =>
    expect(body).toEqual({ email: "new@example.com", password: "long-enough-password", locale: "en" }),
  );
});

test("code 1460 has its own English message", () => {
  const t = (k: string) => String(i18nInstance.getFixedT("en")(k));
  const msg = errorMessage(new ApiError(1460, "hãy xác minh email", 403), "en", t as never);
  expect(msg).toBe("Please verify your email to keep using the app.");
});
