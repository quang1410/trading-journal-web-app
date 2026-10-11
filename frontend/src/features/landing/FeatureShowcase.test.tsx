import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { FeatureShowcase } from "./FeatureShowcase";

beforeEach(() => {
  resetAll({ loggedIn: false });
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
});

test("lists all five features with their illustrations", () => {
  renderApp(<FeatureShowcase />);
  for (const name of [
    "Dashboard",
    "Tài khoản quỹ và vòng thi",
    "Tổng kết ngày và tuần",
    "Ghi chú và checklist",
    "Nhập từ Excel",
  ]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Hình minh hoạ: ${name}` })).toBeInTheDocument();
  }
});

test("names all 13 chart groups", () => {
  renderApp(<FeatureShowcase />);
  const groups = screen.getByRole("list", { name: "Các nhóm biểu đồ" });
  expect(within(groups).getAllByRole("listitem")).toHaveLength(13);
});

test("the losing setup is the backend default setup", async () => {
  renderApp(<FeatureShowcase />);
  expect(await screen.findByText("KHÔNG CÓ SETUP")).toBeInTheDocument();
});

test("interpolates counts in the import preview", () => {
  renderApp(<FeatureShowcase />);
  expect(screen.getByText("128 dòng đọc được")).toBeInTheDocument();
  expect(screen.getByText("2 dòng cần sửa")).toBeInTheDocument();
});
