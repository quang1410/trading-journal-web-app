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
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const mau = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function dung() {
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
  server.use(http.get(`${BASE}/accounts`, () => phongBi([mau])));
  dung();

  const dong = await screen.findByRole("row", { name: /FTMO/ });
  expect(within(dong).getByText("1%")).toBeInTheDocument();
  expect(within(dong).getByText(/100/)).toBeInTheDocument();
});

test("chưa có account nào thì mời tạo", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  expect(await screen.findByText(/chưa có tài khoản giao dịch nào/i)).toBeInTheDocument();
});

// Người dùng gõ % , backend nhận phân số. Đi qua float thì 0.29*100 ra
// 28.999999999999996 — nên chiều nào cũng phải dùng dịch dấu chấm.
test("tạo mới gửi risk dạng phân số, không phải %", async () => {
  let daGui: Record<string, unknown> | null = null;
  // Mock có TRẠNG THÁI, không phải hằng số: GET sau khi POST phải thấy bản
  // ghi mới. Nhờ vậy test này chứng minh luôn rằng onSuccess có invalidate
  // và danh sách thật sự được nạp lại, chứ không chỉ rằng POST đã bay đi.
  const kho: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi(kho)),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      const moi = { ...mau, ...daGui, id: 2 };
      kho.push(moi);
      return phongBi(moi);
    }),
  );
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(hop).getByLabelText("Tên"), "Quỹ thử thách");
  await userEvent.clear(within(hop).getByLabelText("Đơn vị tiền tệ"));
  await userEvent.type(within(hop).getByLabelText("Đơn vị tiền tệ"), "USD");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.clear(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"), "1");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /FTMO/ });
  expect(daGui).toMatchObject({ risk_per_trade: "0.01", initial_balance: "10000" });
});

// PATCH của backend dùng con trỏ: khoá VẮNG MẶT nghĩa là "không đổi".
// Gửi cả bảng lên là biến một lần sửa tên thành một lần ghi đè toàn bộ.
test("sửa chỉ gửi đúng field đã đổi", async () => {
  let daGui: Record<string, unknown> | null = null;
  const kho = [{ ...mau }];
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi(kho)),
    http.patch(`${BASE}/accounts/1`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      // Áp patch đúng ngữ nghĩa của backend: chỉ khoá CÓ MẶT mới đổi.
      kho[0] = { ...kho[0], ...daGui };
      return phongBi(kho[0]);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /FTMO/ });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FTMO" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.clear(within(hop).getByLabelText("Tên"));
  await userEvent.type(within(hop).getByLabelText("Tên"), "Tên mới");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /Tên mới/ });
  expect(daGui).toEqual({ name: "Tên mới" });
});

test("risk quá 100% bị chặn ở client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "X");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "1000");
  await userEvent.clear(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"), "150");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText(/không được vượt quá 100/i)).toBeInTheDocument();
});

test("lỗi từ backend hiện nguyên văn trong hộp thoại", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([])),
    http.post(`${BASE}/accounts`, () =>
      HttpResponse.json({ code: 1409, msg: "mã tài khoản đã tồn tại", data: null }, { status: 409 }),
    ),
  );
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã tài khoản đã tồn tại")).toBeInTheDocument();
});
