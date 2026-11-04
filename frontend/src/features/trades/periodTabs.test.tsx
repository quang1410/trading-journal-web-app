import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { server } from "@/test/server";
import { makeTrade, makeStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TradesPage } from "./TradesPage";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

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

/** KPI của một kỳ — khớp periodKpiDTO bên backend. */
function makePeriodKpi(over: Record<string, unknown> = {}) {
  return {
    total_win: "300",
    total_loss: "-100",
    net_profit: "200",
    total_fees: "4",
    profit_factor: "3",
    win_count: 3,
    loss_count: 1,
    total_trades: 4,
    win_pct: "0.75",
    ave_win: "100",
    ave_loss: "-100",
    biggest_winner: "150",
    biggest_loser: "-100",
    expectancy: "50",
    avg_hold_seconds: 3600,
    max_drawdown: "-100",
    ...over,
  };
}

function makePeriod(over: Record<string, unknown> = {}) {
  return {
    key: "2026-09-21",
    start: "2026-09-21",
    end: "2026-09-21",
    volume: "3.5",
    points: [
      { stt: 1, cum_by_trade: "100" },
      { stt: 2, cum_by_trade: "200" },
    ],
    kpi: makePeriodKpi(),
    ...over,
  };
}

/** Query string mà tab kỳ đã gửi lên API, để test khẳng định phạm vi lọc. */
let periodsSearch = "";
let notesSearch = "";
let savedBody: unknown = null;
let savedUrl = "";

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  periodsSearch = "";
  notesSearch = "";
  savedBody = null;
  savedUrl = "";
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/trades`, () =>
      envelope({ items: [makeTrade({ stt: 1 })], page: 1, size: 50, total: 1 }),
    ),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(makeStats())),
    http.get(`${BASE}/accounts/1/trades/facets`, () =>
      envelope({ symbols: ["EURUSD", "XAUUSD"], setups: ["Breakout"] }),
    ),
    http.get(`${BASE}/accounts/1/periods`, ({ request }) => {
      periodsSearch = new URL(request.url).search;
      return envelope([makePeriod()]);
    }),
    http.get(`${BASE}/accounts/1/period-notes`, ({ request }) => {
      notesSearch = new URL(request.url).search;
      return envelope([]);
    }),
    http.put(`${BASE}/accounts/1/period-notes/:period/:key`, async ({ request }) => {
      savedUrl = new URL(request.url).pathname;
      savedBody = await request.json();
      return envelope(null);
    }),
  );
});

function HienURL() {
  const l = useLocation();
  return <span data-testid="url">{`${l.pathname}${l.search}`}</span>;
}

function renderPage(url = "/trades") {
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

// REGRESSION: dự án cấu hình react-i18next với prefix "{" / suffix "}", KHÔNG
// phải "{{"/"}}" mặc định của thư viện. Một chuỗi viết "{{n}} lệnh" vẫn biên
// dịch, vẫn qua mọi test khác, và hiện nguyên văn "{{n}} lệnh" lên màn hình.
test("số lệnh trên thẻ được nội suy, không hiện nguyên chỗ giữ chỗ", async () => {
  renderPage("/trades?view=day");

  const card = await screen.findByRole("article");
  expect(within(card).getByText("4 lệnh")).toBeInTheDocument();
  expect(card.textContent).not.toMatch(/\{n\}|\{\{n\}\}/);
});

// Cùng lý do, cho khoá có tham số còn lại: tiêu đề hộp ghi chú.
test("tiêu đề hộp ghi chú nội suy nhãn kỳ", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Ghi chú" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).not.toMatch(/\{period\}|\{\{period\}\}/);
});

test("mặc định mở tab Lệnh, URL không mang view", async () => {
  renderPage();

  expect(await screen.findByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Lệnh" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByTestId("url")).toHaveTextContent("/trades");
  expect(screen.getByTestId("url")).not.toHaveTextContent("view=");
});

// Tab nằm trên URL, không trong useState: gửi link cho người khác thì họ mở ra
// thấy đúng màn hình đó.
test("vào thẳng ?view=day thì tab Ngày có hiệu lực ngay lần tải đầu", async () => {
  renderPage("/trades?view=day");

  expect(await screen.findByRole("button", { name: "Ghi chú" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Ngày" })).toHaveAttribute("aria-checked", "true");
  expect(periodsSearch).toContain("period=day");
});

test("bấm tab Tuần ghi view=week lên URL và gọi API đúng kỳ", async () => {
  const u = userEvent.setup();
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("radio", { name: "Tuần" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("view=week");
  expect(periodsSearch).toContain("period=week");
  expect(notesSearch).toContain("period=week");
});

// Bộ lọc áp cho CẢ BA tab: nó đứng ngoài và đứng sau nhóm tab đúng vì lý do đó.
test("bộ lọc trên URL đi cùng request của tab kỳ", async () => {
  renderPage("/trades?view=day&symbol=XAUUSD");

  await screen.findByRole("button", { name: "Ghi chú" });

  expect(periodsSearch).toContain("symbol=XAUUSD");
  expect(periodsSearch).toContain("period=day");
});

// page/size là chuyện của bảng lệnh, không phải của thẻ kỳ — gửi lên API là
// một tham số backend không nhận.
test("tab kỳ không gửi page và size lên API", async () => {
  renderPage("/trades?view=day&page=3&size=100");

  await screen.findByRole("button", { name: "Ghi chú" });

  expect(periodsSearch).not.toContain("page=");
  expect(periodsSearch).not.toContain("size=");
});

// Thẻ GẬP LẠI: tầng đầu mang kỳ, net và số lệnh; KPI chi tiết chỉ hiện khi mở.
test("thẻ gập lại, mở ra mới thấy KPI chi tiết", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  const expand = await screen.findByRole("button", { name: "Mở chi tiết kỳ" });
  expect(within(screen.getByRole("article")).queryByText("Profit factor")).not.toBeInTheDocument();

  await u.click(expand);

  // Tìm TRONG thẻ, không tìm cả trang: dải KPI phía trên cũng có nhãn
  // "Tỷ lệ thắng", và một phép tìm toàn trang sẽ khớp cả hai rồi hỏng vì
  // "nhiều phần tử" — che mất việc thẻ có hiện đúng hay không.
  const card = screen.getByRole("article");
  expect(await within(card).findByText("Profit factor")).toBeInTheDocument();
  expect(within(card).getByText("Tỷ lệ thắng")).toBeInTheDocument();
  expect(within(card).getByText("Thắng/thua")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thu gọn kỳ" })).toBeInTheDocument();
});

// Volume có trên thẻ theo QĐ-8 của spec, và KHÔNG mang ký hiệu tiền tệ: nó là
// khối lượng lot. Backend tính sẵn stat.volume nhưng thẻ từng bỏ quên nó, nên
// con số đi hết đường mạng rồi chết ở component.
test("thẻ hiện Volume, không kèm ký hiệu tiền tệ", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const card = screen.getByRole("article");
  expect(await within(card).findByText("Volume")).toBeInTheDocument();
  // fixture volume = "3.5" → "3,50" theo locale vi, KHÔNG có "USD".
  const shown = within(card).getByText("3,50");
  expect(shown).toBeInTheDocument();
  expect(shown.textContent).not.toContain("USD");
});

// QĐ-8 của spec liệt kê biggest winner/loser và expectancy trong bộ chỉ số của
// thẻ. Backend tính đủ và DTO gửi đủ, nên thiếu chúng trên thẻ là dữ liệu đi
// hết đường mạng rồi chết ở component.
test("thẻ hiện lãi/lỗ TB, kỳ vọng và thời gian giữ TB", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const card = screen.getByRole("article");
  expect(await within(card).findByText("Lãi trung bình")).toBeInTheDocument();
  expect(within(card).getByText("Lỗ trung bình")).toBeInTheDocument();
  expect(within(card).getByText("Kỳ vọng mỗi lệnh")).toBeInTheDocument();
  expect(within(card).getByText("Thời gian giữ TB")).toBeInTheDocument();
  // avg_hold_seconds = 3600 → "1,0h" (formatDuration luôn giữ một chữ số thập
  // phân từ mốc một phút trở lên), KHÔNG phải con số giây trần "3600".
  expect(within(card).getByText("1,0h")).toBeInTheDocument();
  expect(card.textContent).not.toContain("3600");
  // Sụt giảm trong kỳ — con số mà aggregate.periodKPI tính lại theo phạm vi kỳ.
  expect(within(card).getByText("Sụt giảm lớn nhất")).toBeInTheDocument();
});

// Dải biên độ của QĐ-8: hai đầu là lệnh lỗ sâu nhất và lệnh lãi cao nhất.
test("dải biên độ hiện lệnh lỗ sâu nhất và lãi cao nhất", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const card = screen.getByRole("article");
  const range = await within(card).findByRole("group", { name: "Biên độ lệnh trong kỳ" });
  // Hai đầu mút là con số thật, không phải thanh trang trí.
  expect(within(range).getByText(/100,00/)).toBeInTheDocument();
  expect(within(range).getByText(/150,00/)).toBeInTheDocument();
});

// Kỳ CHỈ CÓ lệnh thắng: biggest_loser vẫn là một số DƯƠNG (min của tập toàn số
// dương, đúng định nghĩa min(net) ở trading-journal-plan.md §E15). Nhãn và màu
// không được khẳng định một khoản lỗ không tồn tại.
test("kỳ toàn lệnh thắng không hiện đầu dải thành màu lỗ", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/periods`, () =>
      envelope([
        makePeriod({
          kpi: makePeriodKpi({
            net_profit: "245",
            loss_count: 0,
            win_count: 1,
            total_trades: 1,
            ave_loss: null,
            biggest_loser: "245",
            biggest_winner: "245",
          }),
        }),
      ]),
    ),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const range = await within(screen.getByRole("article")).findByRole("group", {
    name: "Biên độ lệnh trong kỳ",
  });
  // Nhãn nói về VỊ TRÍ trên dải, không khẳng định dấu.
  expect(within(range).getByText("Lệnh thấp nhất")).toBeInTheDocument();
  expect(within(range).queryByText("Lệnh lỗ nhất")).not.toBeInTheDocument();
  // Con số dương KHÔNG được mang lớp màu lỗ.
  const shown = within(range).getAllByText(/245,00/)[0];
  expect(shown.closest("span")?.className ?? "").not.toContain("chart-loss");
});

// Kỳ toàn lệnh THUA: đầu kia của cùng lỗi — biggest_winner là số ÂM, không
// được tô màu lãi.
test("kỳ toàn lệnh thua không hiện đầu dải thành màu lãi", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/periods`, () =>
      envelope([
        makePeriod({
          kpi: makePeriodKpi({
            net_profit: "-115",
            win_count: 0,
            loss_count: 2,
            total_trades: 2,
            ave_win: null,
            biggest_winner: "-40",
            biggest_loser: "-75",
          }),
        }),
      ]),
    ),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const range = await within(screen.getByRole("article")).findByRole("group", {
    name: "Biên độ lệnh trong kỳ",
  });
  const hi = within(range).getByText(/-40,00/);
  expect(hi.closest("span")?.className ?? "").not.toContain("chart-profit");
});

// Kỳ chưa đủ dữ liệu: mọi ô tuỳ chọn là null. Thẻ phải hiện dấu "chưa có",
// không phải "NaN" hay một dải biên độ dựng từ null.
test("kỳ thiếu dữ liệu không dựng dải biên độ", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/periods`, () =>
      envelope([
        makePeriod({
          kpi: makePeriodKpi({
            ave_win: null,
            ave_loss: null,
            biggest_winner: null,
            biggest_loser: null,
            expectancy: null,
            avg_hold_seconds: null,
          }),
        }),
      ]),
    ),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));

  const card = screen.getByRole("article");
  expect(within(card).queryByRole("group", { name: "Biên độ lệnh trong kỳ" })).not.toBeInTheDocument();
  expect(within(card).getByText("Kỳ vọng mỗi lệnh")).toBeInTheDocument();
  expect(card.textContent).not.toContain("NaN");
});

// Chưa có ghi chú thì nút mời tạo; có rồi thì nút mời sửa và nội dung hiện ra.
test("thẻ đã có ghi chú đổi nhãn nút và hiện nội dung", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/period-notes`, () =>
      envelope([
        {
          period: "day",
          period_key: "2026-09-21",
          body_html: "<p>vào lệnh sớm</p>",
          updated_at: "2026-09-21T10:00:00Z",
        },
      ]),
    ),
  );
  renderPage("/trades?view=day");

  expect(await screen.findByRole("button", { name: "Sửa ghi chú" })).toBeInTheDocument();

  await u.click(screen.getByRole("button", { name: "Mở chi tiết kỳ" }));

  expect(await screen.findByText("vào lệnh sớm")).toBeInTheDocument();
});

// Vòng đời đầy đủ: mở hộp, gõ, lưu — và PUT đi đúng địa chỉ mang khoá kỳ.
test("lưu ghi chú gửi PUT tới đúng khoá kỳ", async () => {
  const u = userEvent.setup();
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Ghi chú" }));

  const dialog = await screen.findByRole("dialog");
  await u.click(within(dialog).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(savedUrl).toBe("/api/accounts/1/period-notes/day/2026-09-21"));
  expect(savedBody).toHaveProperty("body_html");
});

// Rỗng vì chưa có lệnh, và rỗng vì bộ lọc cắt hết là HAI tình huống khác nhau.
test("màn hình rỗng phân biệt chưa có lệnh với bộ lọc cắt hết", async () => {
  server.use(http.get(`${BASE}/accounts/1/periods`, () => envelope([])));

  renderPage("/trades?view=day");
  expect(await screen.findByText("Chưa có lệnh nào để tổng kết")).toBeInTheDocument();
});

test("màn hình rỗng khi đang lọc nói rõ là do bộ lọc", async () => {
  server.use(http.get(`${BASE}/accounts/1/periods`, () => envelope([])));

  renderPage("/trades?view=day&symbol=XAUUSD");
  expect(await screen.findByText("Không có kỳ nào khớp bộ lọc")).toBeInTheDocument();
});

// Thẻ tuần hiện KHOẢNG ngày, vì "2026-W39" là khoá máy đọc.
test("thẻ tuần hiện khoảng đầu–cuối thay vì khoá ISO", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/periods`, () =>
      envelope([
        makePeriod({ key: "2026-W39", start: "2026-09-21", end: "2026-09-27" }),
      ]),
    ),
  );
  renderPage("/trades?view=week");

  expect(await screen.findByRole("button", { name: "Ghi chú" })).toBeInTheDocument();
  expect(screen.queryByText(/2026-W39/)).not.toBeInTheDocument();
});

const existingNote = {
  period: "day",
  period_key: "2026-09-21",
  body_html: "<p>vào lệnh sớm</p>",
  updated_at: "2026-09-21T10:00:00Z",
};

// QĐ-10: lưu LẠC QUAN — hộp đóng ngay khi bấm, không chờ mạng. PUT treo vô
// hạn ở đây, nên nếu hộp còn chờ server thì nó không bao giờ đóng.
test("lưu ghi chú đóng hộp ngay, không chờ server trả lời", async () => {
  const u = userEvent.setup();
  server.use(
    http.put(`${BASE}/accounts/1/period-notes/:period/:key`, async () => {
      await delay("infinite");
      return envelope(null);
    }),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Ghi chú" }));
  const dialog = await screen.findByRole("dialog");
  await u.click(within(dialog).getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

// Cache đổi TRƯỚC khi server trả lời: xoá ghi chú thì thẻ gỡ nội dung ngay,
// trong lúc PUT vẫn đang treo.
test("xoá ghi chú gỡ nội dung khỏi thẻ ngay trong lúc PUT còn treo", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/period-notes`, () => envelope([existingNote])),
    http.put(`${BASE}/accounts/1/period-notes/:period/:key`, async () => {
      await delay("infinite");
      return envelope(null);
    }),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));
  expect(await screen.findByText("vào lệnh sớm")).toBeInTheDocument();

  await u.click(screen.getByRole("button", { name: "Xoá ghi chú" }));
  const confirm = await screen.findByRole("alertdialog");
  await u.click(within(confirm).getByRole("button", { name: "Xoá" }));

  await waitFor(() => expect(screen.queryByText("vào lệnh sớm")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Ghi chú" })).toBeInTheDocument();
});

// Lỗi mạng: hoàn lại nội dung cũ và hiện Alert TRÊN THẺ — hộp đã đóng rồi nên
// lỗi không được phép rơi vào một component đã unmount rồi biến mất.
test("xoá thất bại thì hoàn lại ghi chú và hiện lỗi trên thẻ", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/period-notes`, () => envelope([existingNote])),
    http.put(`${BASE}/accounts/1/period-notes/:period/:key`, () =>
      HttpResponse.json({ code: 1500, msg: "máy chủ đang bận", data: null }, { status: 500 }),
    ),
  );
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));
  await u.click(await screen.findByRole("button", { name: "Xoá ghi chú" }));
  const confirm = await screen.findByRole("alertdialog");
  await u.click(within(confirm).getByRole("button", { name: "Xoá" }));

  const alert = await screen.findByRole("alert");
  // Assert chuỗi ĐÃ nội suy, không chỉ khoá: "{reason}" lọt ra màn hình là lỗi.
  expect(alert.textContent).toMatch(/^Không xoá được ghi chú: /);
  expect(alert.textContent).not.toContain("{reason}");
  expect(await screen.findByText("vào lệnh sớm")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sửa ghi chú" })).toBeInTheDocument();
});

// Nút xoá gửi đúng lệnh xoá: PUT body rỗng tới khoá kỳ, mà backend xử như XOÁ.
test("xoá ghi chú hỏi lại rồi gửi body rỗng tới đúng khoá kỳ", async () => {
  const u = userEvent.setup();
  server.use(http.get(`${BASE}/accounts/1/period-notes`, () => envelope([existingNote])));
  renderPage("/trades?view=day");

  await u.click(await screen.findByRole("button", { name: "Mở chi tiết kỳ" }));
  await u.click(await screen.findByRole("button", { name: "Xoá ghi chú" }));

  const confirm = await screen.findByRole("alertdialog");
  expect(savedUrl).toBe("");
  await u.click(within(confirm).getByRole("button", { name: "Xoá" }));

  await waitFor(() => expect(savedUrl).toBe("/api/accounts/1/period-notes/day/2026-09-21"));
  expect(savedBody).toEqual({ body_html: "" });
});
