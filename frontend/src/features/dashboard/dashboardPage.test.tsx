import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoCharts, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import {
  __resetActiveAccountForTest,
  storeActiveAccountId,
} from "@/features/accounts/activeAccount";
import { clearSession, setSession } from "@/lib/session";
import { DashboardPage } from "./DashboardPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "ACC1",
  name: "Tài khoản chính",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "5000",
  risk_per_trade: "0.01",
  one_r: "50",
};

const enumsRong = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1"],
  entry_qualities: [],
  in_trade_qualities: [],
  exit_qualities: [],
  psychologies: [],
  trade_classes: [],
  cash_flow_types: [],
  weekdays: [],
  default_setup: "",
};

const KHONG_CO_LENH = {
  by_setup: [],
  by_symbol: [],
  by_timeframe: [],
  by_direction: [],
  by_weekday: [],
  by_week: [],
  by_day: [],
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  __resetActiveAccountForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  storeActiveAccountId(1);

  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([account])),
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts())),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats())),
    http.get(`${BASE}/meta/enums`, () => phongBi(enumsRong)),
  );
});

function ve(duongDan = "/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[duongDan]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("dựng đủ bốn mục có heading thật", async () => {
  ve();
  // Heading THẬT chứ không phải div to chữ: trình đọc màn hình duyệt trang
  // theo cây heading, và bốn mục này là mục lục của trang.
  await waitFor(() => {
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });
});

test("bộ lọc trên URL đi thẳng vào request", async () => {
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi(taoCharts());
    }),
  );

  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(duongDan).toBe("?symbol=XAUUSD"));
});

test("có lọc thì StreakBlock hiện lời nhắc", async () => {
  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(screen.getByRole("note")).toBeInTheDocument());
});

test("account chưa có lệnh nào thì mời thêm lệnh, không dựng bảy khung rỗng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats({ total_trades: 0 }))),
  );

  ve();
  await waitFor(() => {
    expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  });
  // Không có lệnh nào thì bảy khung rỗng chỉ là bảy lời nhắc giống hệt nhau.
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("lọc không ra gì thì mời bỏ lọc, không mời thêm lệnh", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => phongBi(taoCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats({ total_trades: 0 }))),
  );

  ve("/dashboard?symbol=KHONGCO");
  // Khác hẳn ca trên: ở đây lời mời phải là BỎ LỌC. Gộp hai trạng thái làm một
  // sẽ mời người dùng thêm lệnh trong khi họ chỉ cần xoá một bộ lọc.
  await waitFor(() => {
    expect(screen.getByText(/không có lệnh nào khớp/i)).toBeInTheDocument();
  });
  expect(screen.queryByText(/tài khoản này chưa có lệnh nào/i)).not.toBeInTheDocument();
});

test("request hỏng thì báo lỗi cấp trang", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () =>
      HttpResponse.json({ code: 1500, msg: "hỏng", data: null }, { status: 500 }),
    ),
  );

  ve();
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
