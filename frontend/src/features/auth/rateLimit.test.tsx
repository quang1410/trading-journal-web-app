import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { BASE, errorEnvelope, renderApp, resetAll } from "@/test/harness";
import { i18nInstance } from "@/i18n/config";
import { AuthProvider } from "./AuthProvider";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

const tooMany = (retryAfter?: string) =>
  HttpResponse.json(
    { code: 1429, msg: "gửi quá nhiều lần, thử lại sau 5 phút", data: null },
    { status: 429, headers: retryAfter === undefined ? {} : { "Retry-After": retryAfter } },
  );

beforeEach(() => {
  resetAll({ loggedIn: false });
  // AuthProvider khôi phục phiên lúc mount: không có cookie → 401 → anon.
  server.use(http.post(`${BASE}/auth/refresh`, () => errorEnvelope(1401, "phiên đăng nhập không hợp lệ", 401)));
});

afterEach(async () => {
  vi.useRealTimers();
  await act(() => i18nInstance.changeLanguage("vi"));
});

function renderPage(page: "login" | "register") {
  return renderApp(page === "login" ? <LoginPage /> : <RegisterPage />, {
    wrap: (c) => <AuthProvider>{c}</AuthProvider>,
  });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, buttonName: RegExp) {
  await user.type(screen.getByLabelText("Email"), "me@example.com");
  await user.type(screen.getByLabelText(/mật khẩu|password/i), "correct-password");
  await user.click(screen.getByRole("button", { name: buttonName }));
}

test("login 429 says how long to wait, locks the button until then, keeps the email", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  let calls = 0;
  server.use(
    http.post(`${BASE}/auth/login`, () => {
      calls++;
      return tooMany("300");
    }),
  );
  renderPage("login");

  await fillAndSubmit(user, /^đăng nhập$/i);

  expect(await screen.findByRole("alert")).toHaveTextContent("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 5 phút.");
  const locked = screen.getByRole("button", { name: "Thử lại sau 5 phút" });
  expect(locked).toBeDisabled();
  expect(screen.getByLabelText("Email")).toHaveValue("me@example.com");
  // Nút bị khoá thì focus không được rơi về <body> (WCAG 2.4.3): đưa về ô mật khẩu.
  expect(screen.getByLabelText("Mật khẩu")).toHaveFocus();

  await user.click(locked);
  expect(calls).toBe(1);

  await act(() => vi.advanceTimersByTimeAsync(300_000));
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
});

test("login 429 without Retry-After shows a wording with no number and does not lock", async () => {
  const user = userEvent.setup();
  server.use(http.post(`${BASE}/auth/login`, () => tooMany()));
  renderPage("login");

  await fillAndSubmit(user, /^đăng nhập$/i);

  expect(await screen.findByRole("alert")).toHaveTextContent("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.");
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
});

test.each([
  ["login", /^log in$/i, "incorrect"],
  ["register", /^register$/i, "registration is closed"],
] as const)("English %s 429 is not mistaken for its usual failure", async (page, button, wrong) => {
  localStorage.setItem("journal.locale", "en");
  const user = userEvent.setup();
  server.use(http.post(`${BASE}/auth/${page}`, () => tooMany("120")));
  renderPage(page);

  await fillAndSubmit(user, button);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Too many attempts. Please try again in 2 min.");
  expect(alert).not.toHaveTextContent(wrong);
  expect(alert.textContent).not.toContain("{");
});

test("login 503 (server busy) shows its message and does not lock the button", async () => {
  const user = userEvent.setup();
  server.use(
    http.post(`${BASE}/auth/login`, () =>
      HttpResponse.json(
        { code: 1503, msg: "máy chủ đang bận, thử lại sau vài giây", data: null },
        { status: 503, headers: { "Retry-After": "5" } },
      ),
    ),
  );
  renderPage("login");

  await fillAndSubmit(user, /^đăng nhập$/i);

  expect(await screen.findByRole("alert")).toHaveTextContent("máy chủ đang bận, thử lại sau vài giây");
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
});
