import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import type { DeletedTrade } from "./types";
import { TrashPage } from "./TrashPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

const daXoa: DeletedTrade = {
  id: 5,
  account_id: 1,
  stt: 2,
  entered_at: "2026-06-09T14:30:00Z",
  symbol: "EURUSD",
  direction: "Short",
  profit: "-45.00",
  fee: "1.50",
  setup: "Break-retest",
  notes: "vào khi chưa xác nhận",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(http.get(`${BASE}/accounts`, () => phongBi([account])));
});

function dung() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bày lệnh đã xoá với các trường input", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([daXoa])));
  dung();

  const d = await screen.findByRole("row", { name: /EURUSD/ });
  expect(within(d).getByText("2")).toBeInTheDocument();
  expect(within(d).getByText("09/06/2026 21:30")).toBeInTheDocument();
  expect(within(d).getByText("Break-retest")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 10.
//
// Lệnh đã xoá KHÔNG nằm trong dãy lũy kế, nên cum_by_trade, drawdown hay
// score_total của nó không tồn tại — backend cố ý không trả về chúng. Dựng
// một cột cho chúng sẽ hiện "undefined", hoặc tệ hơn là số 0 trông như thật.
test("không có cột nào cho trường suy diễn", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([daXoa])));
  dung();
  await screen.findByRole("row", { name: /EURUSD/ });

  for (const cot of ["Lũy kế", "Net", "Điểm", "Phân loại", "Sụt giảm"]) {
    expect(screen.queryByRole("columnheader", { name: cot })).not.toBeInTheDocument();
  }
  expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  expect(screen.queryByText("NaN")).not.toBeInTheDocument();
});

test("khôi phục gọi đúng endpoint và làm mới danh sách", async () => {
  const u = userEvent.setup();
  let daGoi = 0;
  const kho = [daXoa];
  server.use(
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([...kho])),
    http.post(`${BASE}/trades/5/restore`, () => {
      daGoi++;
      kho.length = 0;
      return phongBi(daXoa);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /EURUSD/ });

  await u.click(screen.getByRole("button", { name: "Khôi phục lệnh 2" }));

  expect(await screen.findByText(/thùng rác trống/i)).toBeInTheDocument();
  expect(daGoi).toBe(1);
});

test("thùng rác trống thì nói rõ", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])));
  dung();
  expect(await screen.findByText(/thùng rác trống/i)).toBeInTheDocument();
});
