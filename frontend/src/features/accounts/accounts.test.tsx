import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { AccountsPage } from "./AccountsPage";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const color = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

// Trang này nhúng CashFlowPanel cho account đầu tiên, nên khi danh sách
// không rỗng sẽ có thêm hai request. MSW đang bật onUnhandledRequest:"error"
// — thiếu handler nền thì test đỏ vì lý do chẳng liên quan gì đến account.
const background = [
  http.get(`${BASE}/meta/enums`, () => envelope({ cash_flow_types: ["deposit", "withdraw"] })),
  http.get(`${BASE}/accounts/:id/cash-flows`, () => envelope([])),
];

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(...background);
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("hiện risk dưới dạng % và one_r do backend tính", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color])));
  renderPage();

  const row = await screen.findByRole("row", { name: /FTMO/ });
  expect(within(row).getByText("1%")).toBeInTheDocument();
  expect(within(row).getByText(/100/)).toBeInTheDocument();
});

test("chưa có account nào thì mời tạo", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  expect(await screen.findByText(/chưa có tài khoản giao dịch nào/i)).toBeInTheDocument();
});

// Người dùng gõ % , backend nhận phân số. Đi qua float thì 0.29*100 ra
// 28.999999999999996 — nên chiều nào cũng phải dùng dịch dấu chấm.
test("tạo mới gửi risk dạng phân số, không phải %", async () => {
  let submitted: Record<string, unknown> | null = null;
  // Mock có TRẠNG THÁI, không phải hằng số: GET sau khi POST phải thấy bản
  // ghi mới. Nhờ vậy test này chứng minh luôn rằng onSuccess có invalidate
  // và danh sách thật sự được nạp lại, chứ không chỉ rằng POST đã bay đi.
  const store: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      const fresh = { ...color, ...submitted, id: 2 };
      store.push(fresh);
      return envelope(fresh);
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(box).getByLabelText("Tên"), "Quỹ thử thách");
  await userEvent.clear(within(box).getByLabelText("Đơn vị tiền tệ"));
  await userEvent.type(within(box).getByLabelText("Đơn vị tiền tệ"), "USD");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.clear(within(box).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(box).getByLabelText("Rủi ro mỗi lệnh (%)"), "1");
  await userEvent.click(within(box).getByRole("combobox", { name: "Múi giờ" }));
  await userEvent.type(screen.getByRole("searchbox", { name: "Tìm múi giờ" }), "New_York");
  await userEvent.click(screen.getByRole("option", { name: "America/New_York" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /FTMO/ });
  expect(submitted).toMatchObject({
    risk_per_trade: "0.01",
    initial_balance: "10000",
    timezone: "America/New_York",
  });
});

// PATCH của backend dùng con trỏ: khoá VẮNG MẶT nghĩa là "không đổi".
// Gửi cả bảng lên là biến một lần sửa tên thành một lần ghi đè toàn bộ.
test("sửa chỉ gửi đúng field đã đổi", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [{ ...color }];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/1`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      // Áp patch đúng ngữ nghĩa của backend: chỉ khoá CÓ MẶT mới đổi.
      store[0] = { ...store[0], ...submitted };
      return envelope(store[0]);
    }),
  );
  renderPage();
  await screen.findByRole("row", { name: /FTMO/ });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FTMO" }));
  const box = await screen.findByRole("dialog");
  await userEvent.clear(within(box).getByLabelText("Tên"));
  await userEvent.type(within(box).getByLabelText("Tên"), "Tên mới");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /Tên mới/ });
  expect(submitted).toEqual({ name: "Tên mới" });
});

test("risk quá 100% bị chặn ở client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "X");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "1000");
  await userEvent.clear(within(box).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(box).getByLabelText("Rủi ro mỗi lệnh (%)"), "150");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText(/không được vượt quá 100/i)).toBeInTheDocument();
});

test("lỗi từ backend hiện nguyên văn trong hộp thoại", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([])),
    http.post(`${BASE}/accounts`, () =>
      HttpResponse.json({ code: 1409, msg: "mã tài khoản đã tồn tại", data: null }, { status: 409 }),
    ),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã tài khoản đã tồn tại")).toBeInTheDocument();
});
