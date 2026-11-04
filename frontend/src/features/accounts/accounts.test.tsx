import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { makeEnums } from "@/test/harness";
import { makeStats } from "@/test/tradeFactory";
import { AccountsPage } from "./AccountsPage";
import type { Account } from "./types";

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
  account_type: "personal",
  prop_firm: "",
  challenge_phase: null,
  challenge_status: null,
  profit_target: null,
  max_drawdown_limit: null,
};

// Trang gọi /stats cho từng account và /meta/enums cho thanh vòng thi. MSW
// đang bật onUnhandledRequest:"error" — thiếu handler nền thì test đỏ vì lý
// do chẳng liên quan gì đến account.
const background = [
  http.get(`${BASE}/meta/enums`, () => envelope(makeEnums())),
  http.get(`${BASE}/accounts/:id/cash-flows`, () => envelope([])),
  http.get(`${BASE}/accounts/:id/stats`, () => envelope(makeStats({ current_balance: "10250", net_return_pct: "0.025" }))),
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

  const row = await screen.findByRole("article", { name: "Quỹ thử thách" });
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

  await screen.findByRole("article", { name: "Quỹ thử thách" });
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
  await screen.findByRole("article", { name: "Quỹ thử thách" });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FTMO" }));
  const box = await screen.findByRole("dialog");
  await userEvent.clear(within(box).getByLabelText("Tên"));
  await userEvent.type(within(box).getByLabelText("Tên"), "Tên mới");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("article", { name: "Tên mới" });
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

const prop = (over: Partial<Account> = {}) => ({
  ...color,
  id: 2,
  code: "FT-01",
  name: "FTMO 100k",
  account_type: "prop" as const,
  prop_firm: "FTMO",
  challenge_phase: "phase_1",
  challenge_status: "in_progress",
  profit_target: "0.1",
  max_drawdown_limit: "0.1",
  ...over,
});

test("splits into two groups, prop first, with phase rail and outcome line", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([color, prop()])),
    http.get(`${BASE}/accounts/2/stats`, () =>
      envelope(
        makeStats({
          challenge: { profit_pct: "0.042", target_progress: "0.42", drawdown_pct: "0.021", drawdown_usage: "0.21" },
        }),
      ),
    ),
  );
  renderPage();

  const propGroup = await screen.findByRole("region", { name: /Tài khoản quỹ/ });
  const row = within(propGroup).getByRole("article", { name: "FTMO 100k" });
  expect(within(row).getByRole("list", { name: "Tiến độ vòng thi" })).toBeInTheDocument();
  expect(within(row).getByText("Đang thi Vòng 1")).toBeInTheDocument();
  expect(await within(row).findByRole("group", { name: "Lợi nhuận" })).toHaveTextContent("4,20%");

  const personalGroup = screen.getByRole("region", { name: /Tài khoản cá nhân/ });
  const personalRow = within(personalGroup).getByRole("article", { name: "Quỹ thử thách" });
  expect(within(personalRow).queryByRole("list", { name: "Tiến độ vòng thi" })).toBeNull();
});

test("type filter shows only when both types exist, and filters", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color, prop()])));
  renderPage();

  const filter = await screen.findByRole("radiogroup", { name: "Lọc theo loại tài khoản" });
  // Nội suy MỘT ngoặc: phải ra "Quỹ (1)", không phải "Quỹ ({n})" hay "{{n}}".
  await userEvent.click(within(filter).getByRole("radio", { name: "Quỹ (1)" }));

  expect(screen.queryByRole("region", { name: /Tài khoản cá nhân/ })).toBeNull();
  expect(screen.getByRole("region", { name: /Tài khoản quỹ/ })).toBeInTheDocument();
});

test("no type filter when only one type exists", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color])));
  renderPage();
  await screen.findByRole("article", { name: "Quỹ thử thách" });
  expect(screen.queryByRole("radiogroup", { name: "Lọc theo loại tài khoản" })).toBeNull();
});

test("failed prop accounts sink to the bottom of the group", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () =>
      envelope([prop({ id: 3, name: "Chết", challenge_status: "failed" }), prop({ id: 4, name: "Sống" })]),
    ),
  );
  renderPage();

  await screen.findByRole("article", { name: "Sống" });
  const names = screen.getAllByRole("article").map((a) => a.querySelector("h3")?.textContent);
  expect(names).toEqual(["Sống", "Chết"]);
});

test("deposit/withdraw opens in the panel of the right account", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([color])));
  renderPage();

  await userEvent.click(await screen.findByRole("button", { name: "Nạp / rút cho FTMO" }));

  expect(await screen.findByRole("dialog", { name: "Nạp / rút — FTMO" })).toBeInTheDocument();
});

test("stats error still shows the account and its buttons", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([color])),
    http.get(`${BASE}/accounts/:id/stats`, () => HttpResponse.json({ code: 1500, msg: "lỗi", data: null }, { status: 500 })),
  );
  renderPage();

  const row = await screen.findByRole("article", { name: "Quỹ thử thách" });
  expect(within(row).getByRole("button", { name: "Sửa FTMO" })).toBeInTheDocument();
});

test("creating a prop account sends type, phase and target as a fraction", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      const fresh = { ...prop(), ...submitted, id: 9 };
      store.push(fresh);
      return envelope(fresh);
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "FT1");
  await userEvent.type(within(box).getByLabelText("Tên"), "FTMO 100k");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "100000");
  await userEvent.type(within(box).getByLabelText("Tên quỹ"), "FTMO");
  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 2" }));
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "8");
  await userEvent.type(within(box).getByLabelText("Max drawdown (%)"), "10");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted).toMatchObject({
    account_type: "prop",
    prop_firm: "FTMO",
    challenge_phase: "phase_2",
    challenge_status: "in_progress",
    profit_target: "0.08",
    max_drawdown_limit: "0.1",
  });
});

test("creating a personal account sends no prop fields", async () => {
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([])),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope({ ...color, ...submitted });
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "MAIN");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "5000");
  expect(within(box).queryByLabelText("Tên quỹ")).toBeNull();
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted).toMatchObject({ account_type: "personal" });
  expect(submitted).not.toHaveProperty("challenge_phase");
  expect(submitted).not.toHaveProperty("profit_target");
});

test("Funded phase has no Passed option", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  const status = within(box).getByRole("radiogroup", { name: "Trạng thái" });
  expect(within(status).getByRole("radio", { name: "Đã qua" })).toBeInTheDocument();

  await userEvent.click(within(box).getByRole("radio", { name: "Funded" }));

  expect(within(status).queryByRole("radio", { name: "Đã qua" })).toBeNull();
  expect(within(status).getByRole("radio", { name: "Đang giao dịch" })).toBeInTheDocument();
});

test("switching prop to personal sends only account_type", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      store[0] = { ...store[0], ...submitted } as ReturnType<typeof prop>;
      return envelope(store[0]);
    }),
  );
  renderPage();
  await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FT-01" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(within(box).getByRole("radio", { name: "Cá nhân" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).toEqual({ account_type: "personal" }));
});

test("clearing the target sends null", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope({ ...store[0], ...submitted });
    }),
  );
  renderPage();
  await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FT-01" }));
  const box = await screen.findByRole("dialog");
  const target = within(box).getByLabelText("Mục tiêu lợi nhuận (%)");
  expect(target).toHaveValue("10");
  await userEvent.clear(target);
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).toEqual({ profit_target: null }));
});

test("target above 100% is blocked on the client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "150");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  expect(await within(box).findByText("phải lớn hơn 0 và không quá 100%")).toBeInTheDocument();
});

test("mark passed sends exactly one key and the row updates", async () => {
  let submitted: Record<string, unknown> | null = null;
  const store = [prop()];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      store[0] = { ...store[0], ...submitted } as ReturnType<typeof prop>;
      return envelope(store[0]);
    }),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(within(row).getByRole("button", { name: "Cập nhật vòng thi FT-01" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Đánh dấu đã qua" }));

  await waitFor(() => expect(submitted).toEqual({ challenge_status: "passed" }));
  expect(await within(row).findByText("Đã qua Vòng 1")).toBeInTheDocument();
});

test("passed account menu offers the next phase and sends only challenge_phase", async () => {
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([prop({ challenge_status: "passed" })])),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(prop({ challenge_phase: "phase_2" }));
    }),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(within(row).getByRole("button", { name: "Cập nhật vòng thi FT-01" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Lên Vòng 2" }));

  await waitFor(() => expect(submitted).toEqual({ challenge_phase: "phase_2" }));
});

test("failed account has no quick-action menu", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([prop({ challenge_status: "failed" })])));
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  expect(within(row).queryByRole("button", { name: "Cập nhật vòng thi FT-01" })).toBeNull();
});

// --- Sửa sau review cuối ---

// Store có trạng thái để GET sau PATCH thấy bản mới, như backend thật.
function statefulProp(over: Partial<Account> = {}) {
  const sent: Record<string, unknown>[] = [];
  const store = [prop(over)];
  server.use(
    http.get(`${BASE}/accounts`, () => envelope(store)),
    http.patch(`${BASE}/accounts/2`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push(body);
      store[0] = { ...store[0], ...body } as ReturnType<typeof prop>;
      return envelope(store[0]);
    }),
  );
  return sent;
}

async function openEdit() {
  const row = await screen.findByRole("article", { name: "FTMO 100k" });
  await userEvent.click(within(row).getByRole("button", { name: "Sửa FT-01" }));
  const box = await screen.findByRole("dialog");
  return { box, status: within(box).getByRole("radiogroup", { name: "Trạng thái" }) };
}

// Menu nhanh hứa "đảo lại được bằng dialog Sửa". Form giữ giá trị lúc mount
// thì dialog hiện trạng thái CŨ, và chọn lại đúng trạng thái cũ đó gửi PATCH {}.
test("after a quick action the Edit dialog shows the new status and can revert it", async () => {
  const sent = statefulProp();
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });
  await userEvent.click(within(row).getByRole("button", { name: "Cập nhật vòng thi FT-01" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Đánh dấu thất bại" }));
  await within(row).findByText("Thất bại ở Vòng 1");

  const { box, status } = await openEdit();
  expect(within(status).getByRole("radio", { name: "Thất bại" })).toHaveAttribute("aria-checked", "true");
  await userEvent.click(within(status).getByRole("radio", { name: "Đang thi" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(sent.at(-1)).toEqual({ challenge_status: "in_progress" }));
});

// Đổi vòng trong form: trạng thái HIỆN RA phải là trạng thái SẼ LƯU. Backend
// đưa về in_progress khi vòng đổi mà không kèm trạng thái — form phải nói
// trước điều đó, và luôn gửi kèm trạng thái để không có gì xảy ra ngầm.
test("changing phase in the form resets status to in progress and sends it", async () => {
  const sent = statefulProp({ challenge_status: "passed" });
  renderPage();
  const { box, status } = await openEdit();

  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 2" }));
  expect(within(status).getByRole("radio", { name: "Đang thi" })).toHaveAttribute("aria-checked", "true");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(sent.at(-1)).toEqual({ challenge_phase: "phase_2", challenge_status: "in_progress" }));
});

test("editing a failed account's phase while keeping Failed does not revive it", async () => {
  const sent = statefulProp({ challenge_status: "failed" });
  renderPage();
  const { box, status } = await openEdit();

  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 2" }));
  await userEvent.click(within(status).getByRole("radio", { name: "Thất bại" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(sent.at(-1)).toEqual({ challenge_phase: "phase_2", challenge_status: "failed" }));
});

test("switching to another phase and back restores the saved status", async () => {
  statefulProp({ challenge_status: "failed" });
  renderPage();
  const { box, status } = await openEdit();

  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 2" }));
  await userEvent.click(within(box).getByRole("radio", { name: "Vòng 1" }));

  expect(within(status).getByRole("radio", { name: "Thất bại" })).toHaveAttribute("aria-checked", "true");
});

// Ô của nhóm quỹ đã bị gỡ khỏi màn hình thì không được chặn nút Lưu âm thầm.
test("invalid prop fields do not block saving after switching to Personal", async () => {
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([])),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope({ ...color, ...submitted });
    }),
  );
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mã tài khoản"), "MAIN");
  await userEvent.type(within(box).getByLabelText("Vốn ban đầu"), "5000");
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "150");
  await userEvent.click(within(box).getByRole("radio", { name: "Cá nhân" }));
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).toMatchObject({ account_type: "personal" }));
});

// Spec §6.3 nguyên tắc 5: đạt mục tiêu → gợi ý + nút "Đánh dấu đã qua" NGAY
// trong hàng. Backend không tự đổi; người dùng bấm.
test("reaching the target shows a Mark passed button next to the hint", async () => {
  const sent = statefulProp();
  server.use(
    http.get(`${BASE}/accounts/2/stats`, () =>
      envelope(
        makeStats({
          challenge: { profit_pct: "0.105", target_progress: "1.05", drawdown_pct: "0.02", drawdown_usage: "0.2" },
        }),
      ),
    ),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  expect(await within(row).findByText("Đã đạt mục tiêu lợi nhuận")).toBeInTheDocument();
  await userEvent.click(within(row).getByRole("button", { name: "Đánh dấu đã qua" }));

  await waitFor(() => expect(sent.at(-1)).toEqual({ challenge_status: "passed" }));
  expect(await within(row).findByText("Đã qua Vòng 1")).toBeInTheDocument();
});

// Regression: nút trong hàng từng gọi mutate mà không hiện lỗi — PATCH hỏng
// thì người dùng bấm mà không có gì xảy ra. Menu ⋯ thì có hiện.
test("mark-passed button in the row shows the API error", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([prop()])),
    http.get(`${BASE}/accounts/2/stats`, () =>
      envelope(
        makeStats({
          challenge: { profit_pct: "0.105", target_progress: "1.05", drawdown_pct: "0.02", drawdown_usage: "0.2" },
        }),
      ),
    ),
    http.patch(`${BASE}/accounts/2`, () =>
      HttpResponse.json({ code: 1400, msg: "trạng thái vòng thi không hợp lệ", data: null }, { status: 400 }),
    ),
  );
  renderPage();
  const row = await screen.findByRole("article", { name: "FTMO 100k" });

  await userEvent.click(await within(row).findByRole("button", { name: "Đánh dấu đã qua" }));

  expect(await within(row).findByRole("alert")).toHaveTextContent("trạng thái vòng thi không hợp lệ");
});

// Regression: client từng cho qua "10.555", form gửi lên rồi mới nhận 400 từ
// fitsRatioScale của backend. Assert chuỗi ĐÃ nội suy: {n} phải thành 2.
test("percent with more than 2 decimals is blocked on the client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const box = await screen.findByRole("dialog");
  await userEvent.click(await within(box).findByRole("radio", { name: "Quỹ" }));
  await userEvent.type(within(box).getByLabelText("Mục tiêu lợi nhuận (%)"), "10.555");
  await userEvent.click(within(box).getByRole("button", { name: "Lưu" }));

  expect(await within(box).findByText("tối đa 2 chữ số thập phân")).toBeInTheDocument();
});
