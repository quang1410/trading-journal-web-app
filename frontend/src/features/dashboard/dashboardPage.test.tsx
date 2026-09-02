import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { makeCharts, makeStats } from "@/test/tradeFactory";
import { BASE, renderApp, resetAll, envelope, errorEnvelope, makeAccount, makeEnums } from "@/test/harness";
import { storeActiveAccountId } from "@/features/accounts/activeAccount";
import { DashboardPage } from "./DashboardPage";

const account = makeAccount({
  code: "ACC1",
  name: "Tài khoản chính",
  initial_balance: "5000",
  one_r: "50",
});

// Enum rỗng: trang bảng điều khiển không phụ thuộc chúng, và để rỗng thì ca
// test này không âm thầm phụ thuộc vào nội dung của bộ enum mặc định.
const emptyEnums = makeEnums({
  entry_qualities: [],
  in_trade_qualities: [],
  exit_qualities: [],
  psychologies: [],
  trade_classes: [],
  cash_flow_types: [],
  weekdays: [],
  default_setup: "",
});

const KHONG_CO_LENH = {
  by_setup: [],
  by_symbol: [],
  by_timeframe: [],
  by_direction: [],
  by_weekday: [],
  by_week: [],
  by_day: [],
  heatmap: [],
  r_distribution: [],
  score: { scored_count: 0, avg_score_total: null },
  radar: { avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null },
  theory_vs_actual: [],
};

beforeEach(() => {
  resetAll();
  storeActiveAccountId(1);

  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.get(`${BASE}/accounts/1/charts`, () => envelope(makeCharts())),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(makeStats())),
    http.get(`${BASE}/meta/enums`, () => envelope(emptyEnums)),
  );
});

function ve(path = "/dashboard") {
  return renderApp(<DashboardPage />, { path });
}

test("mọi mục đều là heading THẬT, kể cả mục đang đóng", async () => {
  ve();
  // Heading THẬT chứ không phải div to chữ: trình đọc màn hình duyệt trang
  // theo cây heading, và các mục này là mục lục của trang. Mục gập lại vẫn
  // phải có mặt trong mục lục đó — vì thế <h2> nằm TRONG <summary>, không
  // nằm trong phần thân bị đóng.
  await waitFor(() => {
    for (const name of ["Đường tăng trưởng", "Phân tích chi tiết", "Theo nhóm", "Theo thời gian", "Chất lượng lệnh", "Phân phối R"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });
});

test("tầng 1 trả lời trước mọi biểu đồ: lãi ròng, lịch, lệnh gần nhất", async () => {
  ve();
  // Câu hỏi người ta mở trang để hỏi là "tôi đang lãi hay lỗ" — con số đó
  // phải có mặt mà không cần mở gì cả.
  await waitFor(() => {
    expect(screen.getByTestId("verdict-net")).toBeInTheDocument();
  });
  expect(screen.getByRole("heading", { name: /Lịch P&L/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Lệnh gần nhất/i })).toBeInTheDocument();
});

test("lưới 24 chỉ số lui xuống dưới nhưng vẫn mở sẵn", async () => {
  ve();
  await waitFor(() => expect(screen.getByTestId("all-metrics")).toBeInTheDocument());

  // Nó không còn là CỬA VÀO của trang — verdict row và lịch nằm trên nó — mà
  // vẫn bày sẵn. Hai chuyện khác nhau: thứ tự nói cái gì đọc trước, còn gập
  // hay không là chuyện người dùng tự quyết.
  const box = screen.getByTestId("all-metrics");
  expect(box).toHaveAttribute("open");
  expect(within(box).getByRole("group", { name: "Sụt giảm lớn nhất" })).toBeInTheDocument();
});

test("mọi mục gập được đều MỞ sẵn khi vào trang", async () => {
  ve();
  await waitFor(() => expect(screen.getByTestId("by-group")).toBeInTheDocument());
  for (const id of ["all-metrics", "by-group", "by-time", "quality", "r-dist"]) {
    expect(screen.getByTestId(id)).toHaveAttribute("open");
  }
});

test("người dùng gập được một mục, và các mục khác đứng yên", async () => {
  const user = userEvent.setup();
  ve();
  await waitFor(() => expect(screen.getByTestId("by-group")).toBeInTheDocument());

  // Bấm vào summary là gập — <details> lo phần này, nhưng vẫn phải ghim: nếu
  // có ngày nào `open` bị biến thành state bị điều khiển thì React sẽ mở lại
  // ngay sau cú bấm, và không có gì khác bật lỗi.
  await user.click(screen.getByRole("heading", { level: 2, name: "Theo nhóm" }));

  expect(screen.getByTestId("by-group")).not.toHaveAttribute("open");
  expect(screen.getByTestId("by-time")).toHaveAttribute("open");
  expect(screen.getByTestId("quality")).toHaveAttribute("open");
});

test("Đường tăng trưởng có cả hai biểu đồ: theo ngày và lý thuyết-vs-thực tế", async () => {
  ve();
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Lãi lỗ theo ngày" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lý thuyết vs thực tế" })).toBeInTheDocument();
  });
});

test("bộ lọc trên URL đi thẳng vào request", async () => {
  let path = "";
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      path = new URL(request.url).search;
      return envelope(makeCharts());
    }),
  );

  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(path).toBe("?symbol=XAUUSD"));
});

test("có lọc thì StreakBlock hiện lời nhắc", async () => {
  ve("/dashboard?symbol=XAUUSD");
  await waitFor(() => expect(screen.getByRole("note")).toBeInTheDocument());
});

test("account chưa có lệnh nào thì mời thêm lệnh, không dựng bảy khung rỗng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => envelope(makeCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(makeStats({ total_trades: 0 }))),
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
    http.get(`${BASE}/accounts/1/charts`, () => envelope(makeCharts(KHONG_CO_LENH))),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(makeStats({ total_trades: 0 }))),
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
    http.get(`${BASE}/accounts/1/charts`, () => errorEnvelope(1500, "hỏng", 500)),
  );

  ve();
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
