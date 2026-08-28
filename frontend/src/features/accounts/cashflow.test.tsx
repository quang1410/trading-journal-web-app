import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { CashFlowPanel } from "./CashFlowPanel";
import type { Account } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tk: Account = {
  id: 1,
  code: "FTMO",
  name: "Quỹ",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

const enums = {
  directions: [],
  timeframes: [],
  entry_qualities: [],
  in_trade_qualities: [],
  exit_qualities: [],
  psychologies: [],
  trade_classes: [],
  weekdays: [],
  cash_flow_types: ["deposit", "withdraw"],
  default_setup: "KHÔNG CÓ SETUP",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CashFlowPanel account={tk} />
    </QueryClientProvider>,
  );
  return qc;
}

async function pickDate(value: string) {
  const [year, month, date] = value.split("-").map(Number);
  const now = new Date();
  const monthGap = year * 12 + month - 1 - (now.getFullYear() * 12 + now.getMonth());
  const monthButton = monthGap < 0 ? "Tháng trước" : "Tháng sau";
  for (let i = 0; i < Math.abs(monthGap); i += 1) {
    await userEvent.click(screen.getByRole("button", { name: monthButton }));
  }
  await userEvent.click(screen.getByRole("button", { name: `Chọn ngày ${String(date).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}` }));
}

test("hiện ngày theo DD/MM/YYYY, không đi qua Date", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      envelope([{ id: 5, date: "2026-03-01", amount: "500", type: "deposit", note: "nạp thêm" }]),
    ),
  );
  renderPage();

  const row = await screen.findByRole("row", { name: /nạp thêm/ });
  expect(within(row).getByText("01/03/2026")).toBeInTheDocument();
});

// Đúng lỗi đã xuất hiện HAI lần liên tiếp ở Phase 2a: danh sách rỗng trả
// null thay vì [] rồi FE nổ khi .map. Backend đã sửa; test này canh phía FE.
test("danh sách rỗng thì hiện trạng thái rỗng chứ không nổ", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () => envelope([])),
  );
  renderPage();
  expect(await screen.findByText(/chưa có giao dịch tiền nào/i)).toBeInTheDocument();
});

// Chuỗi enum phải lấy từ /meta/enums, không được chép cứng vào FE. Ở đây
// backend chỉ cấp "deposit", nên nếu FE hardcode thì "Rút" vẫn hiện ra.
test("loại giao dịch lấy từ /meta/enums chứ không hardcode", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope({ ...enums, cash_flow_types: ["deposit"] })),
    http.get(`${BASE}/accounts/1/cash-flows`, () => envelope([])),
  );
  renderPage();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  // Radix Select đẩy danh sách option vào một portal ở cuối <body>, không
  // phải vào trong trigger như <option> của <select> native — nên phải mở ra
  // rồi hỏi ở tầm tài liệu, không dùng within(trigger).
  await userEvent.click(await screen.findByLabelText("Loại"));
  expect(await screen.findByRole("option", { name: "Nạp" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Rút" })).not.toBeInTheDocument();
});

test("thêm giao dịch gửi đúng bốn trường và làm mới danh sách", async () => {
  let submitted: Record<string, unknown> | null = null;
  let created = false;
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      envelope(
        created
          ? [{ id: 9, date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" }]
          : [],
      ),
    ),
    http.post(`${BASE}/accounts/1/cash-flows`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      created = true;
      return envelope({ id: 9, date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" });
    }),
  );
  renderPage();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  await userEvent.click(screen.getByLabelText("Ngày"));
  await pickDate("2026-03-02");
  await userEvent.type(screen.getByLabelText("Số tiền"), "250");
  // Radix Select không phải <select> thật, nên selectOptions không dùng được:
  // mở trigger rồi bấm vào option, đúng như người dùng làm.
  await userEvent.click(screen.getByLabelText("Loại"));
  await userEvent.click(await screen.findByRole("option", { name: "Rút" }));
  await userEvent.type(screen.getByLabelText("Ghi chú"), "rút bớt");
  await userEvent.click(screen.getByRole("button", { name: "Thêm giao dịch" }));

  await screen.findByRole("row", { name: /rút bớt/ });
  expect(submitted).toEqual({ date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" });
});

// Chiều tiền nằm ở `type`, nên `amount` luôn dương — trùng CHECK (amount > 0)
// của migration 0001 và validate của service/cashflow.go:46.
test("số tiền âm hoặc 0 bị chặn ở client", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () => envelope([])),
  );
  renderPage();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  await userEvent.click(screen.getByLabelText("Ngày"));
  await pickDate("2026-03-02");
  await userEvent.type(screen.getByLabelText("Số tiền"), "0");
  await userEvent.click(screen.getByRole("button", { name: "Thêm giao dịch" }));

  expect(await screen.findByText(/số tiền phải lớn hơn 0/i)).toBeInTheDocument();
});

test("xoá gọi DELETE /cash-flows/:id và làm mới danh sách", async () => {
  let removed = false;
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      envelope(
        removed
          ? []
          : [{ id: 5, date: "2026-03-01", amount: "500", type: "deposit", note: "nạp thêm" }],
      ),
    ),
    http.delete(`${BASE}/cash-flows/5`, () => {
      removed = true;
      return envelope(null);
    }),
  );
  renderPage();
  await screen.findByRole("row", { name: /nạp thêm/ });

  await userEvent.click(screen.getByRole("button", { name: "Xoá giao dịch ngày 01/03/2026" }));
  await userEvent.click(await screen.findByRole("button", { name: "Xoá" }));

  expect(await screen.findByText(/chưa có giao dịch tiền nào/i)).toBeInTheDocument();
});
