import { screen } from "@testing-library/react";
import { http } from "msw";
import { expect, test } from "vitest";
import { server } from "@/test/server";
import { BASE, renderApp, resetAll, envelope, makeAccount } from "@/test/harness";
import { ApiError } from "@/lib/api";
import { AccountGate, ErrorBlock } from "./AccountGate";

beforeEach(() => resetAll());

// Hình dạng này là thứ giữ quy tắc hook: children chỉ được gọi khi đã CÓ
// account, nên trang con không bao giờ phải return sớm giữa các hook.
test("chỉ dựng children khi đã có account, và trao account cho nó", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([makeAccount()])));
  renderApp(<AccountGate>{(a) => <p>{`account ${a.id}`}</p>}</AccountGate>);
  expect(await screen.findByText("account 1")).toBeInTheDocument();
});

test("chưa có account thì mời tạo, KHÔNG dựng children", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderApp(<AccountGate>{() => <p>đáng lẽ không hiện</p>}</AccountGate>);
  expect(await screen.findByRole("link")).toBeInTheDocument();
  expect(screen.queryByText("đáng lẽ không hiện")).toBeNull();
});

test("ErrorBlock đọc được thông điệp của ApiError", () => {
  renderApp(<ErrorBlock error={new ApiError(1404, "không tìm thấy", 404)} />);
  expect(screen.getByText("không tìm thấy")).toBeInTheDocument();
});
