import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, renderApp, resetAll, envelope, errorEnvelope } from "@/test/harness";
import { makeTrade } from "@/test/tradeFactory";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { MonthCalendarCard } from "./MonthCalendarCard";
import type { HeatmapMonth } from "./types";

// Bám vào HTTP chứ không mock @/lib/api: cũng như dayTradeList.test.tsx, thứ
// khối này dễ sai nhất là hỏi NHẦM NGÀY hoặc đánh rơi bộ lọc của trang — cả
// hai chỉ nhìn thấy được ở tầng URL.
const asked: string[] = [];

const THANG_07: HeatmapMonth[] = [
  {
    month: "07/2026",
    cells: [
      { day: "2026-07-01", sum_net: "1000", count: 1 },
      { day: "2026-07-07", sum_net: "1381", count: 3 },
      { day: "2026-07-10", sum_net: "-346", count: 8 },
    ],
  },
];

function serveTrades(items: ReturnType<typeof makeTrade>[], total = items.length) {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      asked.push(request.url);
      const url = new URL(request.url);
      const size = Number(url.searchParams.get("size") ?? "50");
      return envelope({ items: items.slice(0, size), page: 1, size, total });
    }),
  );
}

function ve(filter = EMPTY_FILTER) {
  return renderApp(
    <MonthCalendarCard
      months={THANG_07}
      currency="USD"
      accountId={1}
      filter={filter}
      timezone="Asia/Bangkok"
    />,
  );
}

beforeEach(() => {
  resetAll();
  asked.length = 0;
});

// ── Ô lịch ───────────────────────────────────────────────────────────────

test("ô ngày nói cả lãi ròng lẫn số lệnh", () => {
  ve();
  const o = screen.getByTestId("cal-day-2026-07-10");
  expect(within(o).getByText(/346/)).toBeInTheDocument();
  expect(within(o).getByTestId("cal-day-count-2026-07-10")).toHaveTextContent("8");
});

test("ngày nghỉ không có số lệnh", () => {
  ve();
  // "0 lệnh" là một câu vô nghĩa trong lịch: ngày nghỉ đã tự nói mình nghỉ
  // bằng nền lùi và việc không có con số nào.
  expect(screen.queryByTestId("cal-day-count-2026-07-02")).not.toBeInTheDocument();
});

// ── Mở bảng chi tiết ─────────────────────────────────────────────────────

test("bấm ô ngày mở bảng liệt kê từng lệnh của đúng ngày đó", async () => {
  const user = userEvent.setup();
  serveTrades([
    makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", direction: "Long", net: "900" }),
    makeTrade({ id: 2, stt: 2, symbol: "EURUSD", direction: "Short", net: "481" }),
  ]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  await waitFor(() => expect(within(hop).getByText("XAUUSD")).toBeInTheDocument());
  expect(within(hop).getByText("EURUSD")).toBeInTheDocument();

  // Đúng NGÀY đó, không phải cả tháng. Đây là chỗ sai êm nhất của khối này:
  // quên from/to thì bảng vẫn đầy lệnh thật, chỉ là lệnh của những ngày khác.
  const url = new URL(asked.at(-1)!);
  expect(url.searchParams.get("from")).toBe("2026-07-07");
  expect(url.searchParams.get("to")).toBe("2026-07-07");
});

test("tiêu đề nói rõ đang xem ngày nào", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1 })]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  // Mùng 7 tháng 7 năm 2026 là Thứ Ba. Bảng mở ra từ một ô vuông chỉ ghi "7",
  // nên nó phải tự giới thiệu đủ ngày tháng — không thì mở xong không biết
  // mình bấm trúng ô nào.
  const hop = await screen.findByRole("dialog");
  expect(within(hop).getByRole("heading", { name: /07\/07\/2026/ })).toBeInTheDocument();
});

test("bảng chi tiết GIỮ bộ lọc của trang, chỉ ghi đè khoảng ngày", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, symbol: "XAUUSD" })]);

  // Ô lịch đếm theo bộ lọc đang bật. Bỏ bộ lọc đi khi hỏi chi tiết sẽ cho ra
  // một bảng dài hơn con số ghi trên chính ô vừa bấm — hai con số cãi nhau.
  ve({ ...EMPTY_FILTER, symbol: "XAUUSD" });
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  await screen.findByRole("dialog");
  await waitFor(() => expect(asked.length).toBeGreaterThan(0));
  const url = new URL(asked.at(-1)!);
  expect(url.searchParams.get("symbol")).toBe("XAUUSD");
  expect(url.searchParams.get("from")).toBe("2026-07-07");
});

test("thiếu timezone thì ô ngày không mời bấm", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1 })]);

  // Không có múi giờ thì bảng chi tiết sẽ in giờ vào lệnh sai bảy tiếng. Thà
  // không mở còn hơn mở ra một bảng nói dối — và ô phải TRÔNG như không mở
  // được, chứ không phải mời bấm rồi im lặng.
  renderApp(<MonthCalendarCard months={THANG_07} currency="USD" accountId={1} filter={EMPTY_FILTER} />);

  const o = screen.getByTestId("cal-day-2026-07-07");
  expect(o).toHaveAttribute("aria-disabled", "true");
  await user.click(o);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("ngày nghỉ không mở bảng nào", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1 })]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-02"));

  // Không có lệnh nào để liệt kê, nên mở ra một bảng rỗng là tệ hơn không mở.
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("giờ vào lệnh đọc theo timezone của account, không phải UTC", async () => {
  const user = userEvent.setup();
  // 14:30 UTC = 21:30 ở Asia/Bangkok (+7). In thẳng UTC ra sẽ lệch bảy tiếng
  // và người dùng đối chiếu với sao kê sàn sẽ thấy sai mọi dòng.
  serveTrades([makeTrade({ id: 1, entered_at: "2026-07-07T14:30:00Z" })]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  await waitFor(() => expect(within(hop).getByText("21:30")).toBeInTheDocument());
});

test("dòng cuối cộng lãi ròng của những lệnh đang hiện", async () => {
  const user = userEvent.setup();
  serveTrades([
    makeTrade({ id: 1, stt: 1, net: "900" }),
    makeTrade({ id: 2, stt: 2, net: "481" }),
  ]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(hop).getByTestId("day-total-net")).toHaveTextContent(/1.381/),
  );
});

test("lệnh xếp theo thời gian TĂNG dần, dù backend trả mới nhất trước", async () => {
  const user = userEvent.setup();
  // Backend trả lệnh mới nhất trước (service/journal.go, `Page`) — đúng cho
  // bảng nhật ký. Trong phạm vi một ngày thì ngược: đọc từ trên xuống phải là
  // đọc lại phiên theo trình tự nó xảy ra.
  serveTrades([
    makeTrade({ id: 2, stt: 128, symbol: "NQ", entered_at: "2026-07-07T14:50:00Z" }),
    makeTrade({ id: 1, stt: 1, symbol: "NAS100", entered_at: "2026-07-07T06:00:00Z" }),
  ]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  await waitFor(() => expect(within(hop).getByText("NAS100")).toBeInTheDocument());

  const hang = within(hop).getAllByRole("row").map((r) => r.textContent ?? "");
  const iSom = hang.findIndex((x) => x.includes("NAS100"));
  const iMuon = hang.findIndex((x) => x.includes("NQ"));
  expect(iSom).toBeGreaterThan(-1);
  expect(iSom).toBeLessThan(iMuon);
});

test("ngày nhiều lệnh hơn một trang thì tải thêm được", async () => {
  const user = userEvent.setup();
  // Backend nói có 60 lệnh nhưng một trang chỉ chở 50: nút phải nói còn 10.
  const many = Array.from({ length: 60 }, (_, i) =>
    makeTrade({ id: i + 1, stt: i + 1, net: "1" }),
  );
  serveTrades(many, 60);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-10"));

  const hop = await screen.findByRole("dialog");
  const nut = await within(hop).findByRole("button", { name: /tải thêm/i });
  expect(nut).toHaveTextContent("10");

  await user.click(nut);
  // Lượt sau xin một trang RỘNG hơn chứ không phải trang kế tiếp: bảng nối
  // dài thêm, không thay nội dung.
  await waitFor(() => expect(new URL(asked.at(-1)!).searchParams.get("size")).toBe("100"));
});

test("còn lệnh chưa tải thì dòng cuối nói rõ mình chỉ đếm một phần", async () => {
  const user = userEvent.setup();
  const many = Array.from({ length: 60 }, (_, i) =>
    makeTrade({ id: i + 1, stt: i + 1, net: "1" }),
  );
  serveTrades(many, 60);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-10"));

  // "50 lệnh" đứng trơ dưới một ngày 60 lệnh là một con số sai, và nó cãi
  // thẳng với con số ghi trên ô lịch vừa bấm.
  const hop = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(hop).getByText(/50 lệnh — trên tổng 60/)).toBeInTheDocument(),
  );
});

test("tải hết rồi thì dòng cuối đếm gọn, không nhắc lại tổng", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, stt: 1, net: "900" }), makeTrade({ id: 2, stt: 2, net: "481" })]);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  // Hai con số bằng nhau thì "2 trên tổng 2" chỉ là nhiễu.
  await waitFor(() => expect(within(hop).getByText(/^2 lệnh$/)).toBeInTheDocument());
});

test("mở ngày khác thì bảng bắt đầu lại, không giữ trang đã tải", async () => {
  const user = userEvent.setup();
  const many = Array.from({ length: 60 }, (_, i) =>
    makeTrade({ id: i + 1, stt: i + 1, net: "1" }),
  );
  serveTrades(many, 60);

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-10"));
  const hop = await screen.findByRole("dialog");
  await user.click(await within(hop).findByRole("button", { name: /tải thêm/i }));
  await waitFor(() => expect(new URL(asked.at(-1)!).searchParams.get("size")).toBe("100"));

  // Đóng rồi mở ngày khác: bảng mới phải xin lại từ một trang, không thừa
  // hưởng số trang của bảng cũ — nếu không, mở một ngày ba lệnh sau một ngày
  // scalping sẽ kéo về 100 dòng để hiển thị ba.
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  asked.length = 0;
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  await screen.findByRole("dialog");
  await waitFor(() => expect(asked.length).toBeGreaterThan(0));
  // `size` VẮNG MẶT chính là bằng chứng đã reset: toQuery bỏ tham số này khi
  // nó bằng DEFAULT_PAGE_SIZE (50). Còn "100" thì state đã sống sót qua lần mở.
  expect(new URL(asked.at(-1)!).searchParams.get("size")).not.toBe("100");
});

test("mã sản phẩm dẫn tới nhật ký ĐÃ lọc về đúng ngày đó", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, symbol: "XAUUSD" })]);

  ve({ ...EMPTY_FILTER, symbol: "XAUUSD" });
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  const link = await within(hop).findByRole("link", { name: "XAUUSD" });
  // Nhãn hứa "mở trong nhật ký"; thả người ta xuống một cuốn nhật ký chưa lọc
  // thì họ phải tự lọc lại bằng tay đúng cái vừa bấm.
  const href = link.getAttribute("href") ?? "";
  expect(href).toContain("from=2026-07-07");
  expect(href).toContain("to=2026-07-07");
  expect(href).toContain("symbol=XAUUSD");
});

test("lỗi mạng thì nói ra, không để bảng trống", async () => {
  const user = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () => errorEnvelope(500, "sập", 500)),
  );

  ve();
  await user.click(screen.getByTestId("cal-day-2026-07-07"));

  const hop = await screen.findByRole("dialog");
  // Bảng trống trông y hệt "ngày này không có lệnh" — một lời nói dối, vì ô
  // vừa bấm ghi rõ 3 lệnh.
  await waitFor(() => expect(within(hop).queryByRole("table")).not.toBeInTheDocument());
});
