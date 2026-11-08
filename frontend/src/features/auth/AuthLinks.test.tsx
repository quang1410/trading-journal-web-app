import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, errorEnvelope, renderApp, resetAll } from "@/test/harness";
import { i18nInstance } from "@/i18n/config";
import { AuthProvider } from "./AuthProvider";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

// Đăng ký chỉ mở cho user đầu tiên; trên production nó luôn đóng. Lối cho
// khách lạ là danh sách chờ trên landing, không phải form đăng ký (K-05).

beforeEach(() => {
  resetAll({ loggedIn: false });
  server.use(http.post(`${BASE}/auth/refresh`, () => errorEnvelope(1401, "phiên đăng nhập không hợp lệ", 401)));
});

afterEach(async () => {
  await act(() => i18nInstance.changeLanguage("vi"));
});

function renderPage(page: "login" | "register") {
  return renderApp(page === "login" ? <LoginPage /> : <RegisterPage />, {
    wrap: (c) => <AuthProvider>{c}</AuthProvider>,
  });
}

async function submitRegister(user: ReturnType<typeof userEvent.setup>, button: RegExp) {
  await user.type(screen.getByLabelText("Email"), "me@example.com");
  await user.type(screen.getByLabelText(/mật khẩu|password/i), "long-enough-password");
  await user.click(screen.getByRole("button", { name: button }));
}

test.each([
  ["vi", "Chưa có tài khoản?", "Tham gia danh sách chờ"],
  ["en", "Don't have an account?", "Join the waitlist"],
] as const)("login page (%s) points to the waitlist, not to /register", async (locale, lead, name) => {
  localStorage.setItem("journal.locale", locale);
  const { container } = renderPage("login");

  const link = await screen.findByRole("link", { name });
  expect(link).toHaveAttribute("href", "/?ref=login");
  expect(link.parentElement).toHaveTextContent(`${lead} ${name}`);
  expect(container.querySelector('a[href="/register"]')).toBeNull();
});

// Chữ link trên nền thẻ: --primary trần chỉ đạt 2,55:1 (CLAUDE.md, Theme).
// Viền focus tường minh, không trông vào outline mặc định của trình duyệt.
test.each(["login", "register"] as const)("links on the %s page avoid bare primary text and show a focus ring", async (page) => {
  const { container } = renderPage(page);
  await screen.findByRole("button", { name: page === "login" ? "Đăng nhập" : "Đăng ký" });

  const links = container.querySelectorAll("a");
  expect(links.length).toBeGreaterThan(0);
  for (const a of links) {
    expect(a.className).not.toMatch(/\btext-primary\b/);
    expect(a.className).toContain("focus-visible:outline-[var(--focus-ring)]");
    // Tailwind v4: outline-none triệt tiêu focus-visible:outline-2 (xem AuthLinks.tsx).
    expect(a.className.split(/\s+/)).not.toContain("outline-none");
  }
});

test.each([
  ["vi", /^đăng ký$/i, "đã có tài khoản, đăng ký đã đóng", "Tham gia danh sách chờ"],
  ["en", /^register$/i, "an account already exists, registration is closed", "Join the waitlist"],
] as const)("register closed (%s): the error comes with a way onto the waitlist", async (locale, button, msg, name) => {
  localStorage.setItem("journal.locale", locale);
  const user = userEvent.setup();
  server.use(http.post(`${BASE}/auth/register`, () => errorEnvelope(1403, "đã có tài khoản, đăng ký đã đóng", 403)));
  renderPage("register");

  await submitRegister(user, button);

  expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/?ref=login");
});

test.each([
  ["vi", "400", /^đăng ký$/i, "Tham gia danh sách chờ"],
  ["vi", "429", /^đăng ký$/i, "Tham gia danh sách chờ"],
  ["en", "400", /^register$/i, "Join the waitlist"],
  ["en", "429", /^register$/i, "Join the waitlist"],
] as const)("register (%s) %s is not 'closed': no waitlist link", async (locale, status, button, name) => {
  localStorage.setItem("journal.locale", locale);
  const user = userEvent.setup();
  server.use(
    http.post(`${BASE}/auth/register`, () =>
      status === "400"
        ? errorEnvelope(1400, "email không hợp lệ", 400)
        : errorEnvelope(1429, "gửi quá nhiều lần, thử lại sau 5 phút", 429),
    ),
  );
  renderPage("register");

  await submitRegister(user, button);

  await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name })).toBeNull();
});

test("the waitlist link disappears with the error on the next attempt", async () => {
  const user = userEvent.setup();
  let first = true;
  server.use(
    http.post(`${BASE}/auth/register`, () => {
      if (first) {
        first = false;
        return errorEnvelope(1403, "đã có tài khoản, đăng ký đã đóng", 403);
      }
      return new Promise<never>(() => {});
    }),
  );
  renderPage("register");

  await submitRegister(user, /^đăng ký$/i);
  await screen.findByRole("link", { name: "Tham gia danh sách chờ" });

  await user.click(screen.getByRole("button", { name: /^đăng ký$/i }));
  expect(screen.queryByRole("link", { name: "Tham gia danh sách chờ" })).toBeNull();
});
