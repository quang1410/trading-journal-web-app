import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { server } from "@/test/server";
import { taoLenh, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TradesPage } from "./TradesPage";

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

const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1"],
  entry_qualities: ["Đúng kế hoạch"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

let duongDanTrades = "";

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  duongDanTrades = "";
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([account])),
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh({ stt: 1 })], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats())),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
  );
});

/** Hiện URL hiện tại ra DOM để test đọc được mà không cần chạm router nội bộ. */
function HienURL() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

function dung(url = "/trades") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <HienURL />
        <Routes>
          <Route path="/trades" element={<TradesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bảng và dải KPI cùng dựng từ một bộ lọc", async () => {
  dung();
  expect(await screen.findByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Số lệnh" })).getByText("3")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 5. Vào thẳng URL có sẵn bộ lọc thì bộ lọc phải có hiệu
// lực ngay từ request ĐẦU TIÊN — đó là điều một useState trong component
// không làm được.
test("bộ lọc trên URL có hiệu lực ngay lần tải đầu", async () => {
  dung("/trades?symbol=XAUUSD&direction=Long&page=2");

  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(duongDanTrades).toBe("?symbol=XAUUSD&direction=Long&page=2");
  expect(screen.getByLabelText("Mã sản phẩm")).toHaveValue("XAUUSD");
});

test("đổi bộ lọc thì ghi lên URL", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "EU");

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?symbol=EU");
});

// Lọc lại mà vẫn ở trang 7 thì người dùng thấy một trang trống và tưởng
// không có kết quả nào.
test("đổi bộ lọc thì về trang 1", async () => {
  const u = userEvent.setup();
  dung("/trades?page=3");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "E");

  const url = await screen.findByTestId("url");
  expect(url).toHaveTextContent("symbol=E");
  expect(url).not.toHaveTextContent("page=");
});

test("chưa có tài khoản nào thì chỉ đường sang trang tài khoản", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  expect(await screen.findByRole("link", { name: /tài khoản/i })).toBeInTheDocument();
  expect(duongDanTrades).toBe("");
});

test("phân trang ghi số trang lên URL", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh()], page: 1, size: 50, total: 120 });
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Trang sau" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("page=2");
});

test("mở form thêm lệnh từ nút trên đầu trang", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Thêm lệnh" }));

  expect(await screen.findByRole("dialog")).toHaveTextContent("Thêm lệnh");
});

test("xoá lệnh phải xác nhận trước", async () => {
  const u = userEvent.setup();
  let daXoa = false;
  server.use(
    http.delete(`${BASE}/trades/1`, () => {
      daXoa = true;
      return phongBi(null);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));
  expect(daXoa).toBe(false);

  await u.click(await screen.findByRole("button", { name: "Xoá" }));
  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(daXoa).toBe(true);
});
