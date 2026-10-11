import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const authStatus = { current: "anon" as "anon" | "authed" | "loading" };
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: authStatus.current }),
}));
vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <i data-testid="vercel-analytics" />,
}));

import { LandingAnalytics, landingOnly } from "./LandingAnalytics";

afterEach(() => vi.unstubAllEnvs());

// Script của Vercel sống tiếp sau khi landing unmount và tự đếm mọi lần đổi
// route. Lọc ở beforeSend thì /login, /dashboard… không bao giờ bị gửi đi.
test("only page views of the landing path are sent", () => {
  expect(landingOnly({ type: "pageview", url: "https://journal.example/" })).not.toBeNull();
  expect(landingOnly({ type: "pageview", url: "https://journal.example/?ref=fb" })).not.toBeNull();
  expect(landingOnly({ type: "pageview", url: "https://journal.example/dashboard" })).toBeNull();
  expect(landingOnly({ type: "pageview", url: "https://journal.example/login" })).toBeNull();
});

test("mounts in a production build for anonymous visitors", () => {
  vi.stubEnv("PROD", true);
  authStatus.current = "anon";
  render(<LandingAnalytics />);
  expect(screen.getByTestId("vercel-analytics")).toBeInTheDocument();
});

// Người đã đăng nhập mở / sẽ thấy landing trong lúc phiên khôi phục rồi bị
// chuyển sang /dashboard. Không được tính họ là một lượt xem landing.
test.each(["loading", "authed"] as const)("does not mount while auth is %s", (status) => {
  vi.stubEnv("PROD", true);
  authStatus.current = status;
  render(<LandingAnalytics />);
  expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
});

test("does not mount outside a production build", () => {
  vi.stubEnv("PROD", false);
  authStatus.current = "anon";
  render(<LandingAnalytics />);
  expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
});
