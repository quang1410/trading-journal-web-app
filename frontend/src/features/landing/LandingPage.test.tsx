import { screen } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { LandingPage } from "./LandingPage";

beforeEach(() => {
  resetAll({ loggedIn: false });
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
});

test("renders every section in order with working anchors", () => {
  renderApp(<LandingPage />);
  const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(headings).toEqual([
    "Lý thuyết và thực tế",
    "Bốn câu hỏi sau mỗi lệnh",
    "Nhập lệnh một lần.Ứng dụng tính phần còn lại.",
    "Dùng thử sớm",
    "Hỏi đáp",
  ]);
  for (const id of ["scoring", "features", "faq"]) {
    expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getByRole("link", { name: { scoring: "Chấm điểm", features: "Tính năng", faq: "Hỏi đáp" }[id] })).toHaveAttribute("href", `#${id}`);
  }
  expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
});
