import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, renderApp, resetAll, envelope, errorEnvelope } from "@/test/harness";
import { makeTrade } from "@/test/tradeFactory";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { MonthCalendarCard } from "./MonthCalendarCard";
import type { HeatmapMonth } from "./types";

// Bám vào HTTP chứ không mock @/lib/api: khối này sống hay chết ở chỗ nó hỏi
// ĐÚNG NGÀY NÀO và có giữ bộ lọc của trang không — cả hai chỉ nhìn thấy được
// ở tầng URL.
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
      return envelope({ items, page: 1, size: 5, total });
    }),
  );
}

function ve(filter = EMPTY_FILTER) {
  return renderApp(
    <MonthCalendarCard months={THANG_07} currency="USD" accountId={1} filter={filter} />,
  );
}

beforeEach(() => {
  resetAll();
  asked.length = 0;
});

// Đây là lý do khối này tồn tại: /charts chỉ trả {day, sum_net, count}, đủ vẽ
// lịch nhưng không đủ nói "3 lệnh đó là những lệnh nào".
test("hover vào ngày thì hỏi đúng ngày đó và liệt kê từng lệnh", async () => {
  const user = userEvent.setup();
  serveTrades([
    makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", direction: "Long", net: "900" }),
    makeTrade({ id: 2, stt: 2, symbol: "EURUSD", direction: "Short", net: "481" }),
  ]);

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));

  const tip = await screen.findByRole("tooltip");
  await waitFor(() => expect(within(tip).getByText("XAUUSD")).toBeInTheDocument());
  expect(within(tip).getByText("EURUSD")).toBeInTheDocument();
  expect(within(tip).getByText("Short")).toBeInTheDocument();

  // from=to=<ngày>: backend so sánh chuỗi trên Enriched.Day, cùng trường mà
  // nó gom heatmap — nên tập lệnh trả về khớp CHÍNH XÁC con số ô lịch đã đếm.
  const url = asked.find((u) => u.includes("from=2026-07-07"));
  expect(url).toBeDefined();
  expect(url).toContain("to=2026-07-07");
});

/**
 * Ô lịch chỉ đếm lệnh KHỚP BỘ LỌC của trang. Bỏ bộ lọc đi khi hỏi chi tiết sẽ
 * cho ra danh sách dài hơn con số ngay phía trên nó — hai con số cãi nhau
 * trong cùng một cái tooltip.
 */
test("giữ nguyên bộ lọc của trang, chỉ ghi đè from/to", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", net: "900" })]);

  ve({ ...EMPTY_FILTER, symbol: "XAUUSD", setup: "Breakout", from: "2026-01-01", to: "2026-12-31" });
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));
  await screen.findByRole("tooltip");

  await waitFor(() => expect(asked.length).toBeGreaterThan(0));
  const url = asked.at(-1)!;
  expect(url).toContain("symbol=XAUUSD");
  expect(url).toContain("setup=Breakout");
  // from/to của trang bị GHI ĐÈ bằng ngày của ô, không phải cộng thêm.
  expect(url).toContain("from=2026-07-07");
  expect(url).toContain("to=2026-07-07");
  expect(url).not.toContain("2026-01-01");
});

// Cái giá của tính năng này là một request mỗi ngày. Trả cái giá đó cho cả 31
// ngày lúc dựng lịch thì gần hết số request là vô ích.
test("KHÔNG hỏi gì khi chưa ai hover", async () => {
  serveTrades([makeTrade({ id: 1, stt: 1 })]);
  ve();

  await screen.findByTestId("cal-day-2026-07-07");
  // Chờ đủ lâu để một request lỡ bị bắn đi kịp xuất hiện.
  await new Promise((r) => setTimeout(r, 60));
  expect(asked).toHaveLength(0);
});

test("chỉ hỏi ngày được hover, không hỏi 30 ngày còn lại", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", net: "900" })]);

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));
  await screen.findByRole("tooltip");
  await waitFor(() => expect(asked.length).toBeGreaterThan(0));

  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain("from=2026-07-07");
});

/**
 * Ô lịch đã hứa "8 lệnh"; tooltip chỉ liệt kê 5. Không nói ra phần còn lại thì
 * người đọc tưởng danh sách này là đủ, và hai con số trong cùng tooltip đá
 * nhau.
 */
test("nhiều hơn trần thì nói còn bao nhiêu lệnh nữa", async () => {
  const user = userEvent.setup();
  serveTrades(
    Array.from({ length: 5 }, (_, i) => makeTrade({ id: i + 1, stt: i + 1, symbol: `SYM${i}` })),
    8,
  );

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-10"));

  const tip = await screen.findByRole("tooltip");
  await waitFor(() => expect(within(tip).getByText("SYM0")).toBeInTheDocument());
  // 8 - 5 = 3.
  expect(within(tip).getByText(/còn 3 lệnh nữa/i)).toBeInTheDocument();
});

test("vừa đủ trần thì không nói thừa dòng 'còn n lệnh'", async () => {
  const user = userEvent.setup();
  serveTrades([
    makeTrade({ id: 1, stt: 1, symbol: "XAUUSD" }),
    makeTrade({ id: 2, stt: 2, symbol: "EURUSD" }),
  ]);

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));

  const tip = await screen.findByRole("tooltip");
  await waitFor(() => expect(within(tip).getByText("XAUUSD")).toBeInTheDocument());
  expect(within(tip).queryByText(/còn .* lệnh nữa/i)).not.toBeInTheDocument();
});

// Phần số tổng của tooltip đến từ /charts, KHÔNG phụ thuộc request này. Nuốt
// lỗi đi sẽ để một tooltip trông bình thường mà thiếu hẳn danh sách lệnh.
test("request hỏng thì nói ra, phần số tổng vẫn còn", async () => {
  const user = userEvent.setup();
  server.use(http.get(`${BASE}/accounts/1/trades`, () => errorEnvelope(1500, "hỏng", 500)));

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));

  const tip = await screen.findByRole("tooltip");
  await waitFor(() => expect(within(tip).getByText(/không tải được/i)).toBeInTheDocument());
  // Ngày, tiền và số lệnh vẫn phải đứng đó.
  expect(tip).toHaveTextContent(/1\.381/);
  expect(tip).toHaveTextContent(/Thứ Ba/i);
});

/**
 * Radix UNMOUNT hẳn nội dung tooltip khi đóng, nên query bị gỡ rồi gắn lại mỗi
 * lần hover. Với staleTime mặc định (0), lần hover thứ hai sẽ hỏi lại từ đầu —
 * rê chuột qua lại mười lần là mười request cho cùng một ngày.
 *
 * Đây là ca đã đo thật rồi mới viết: trước khi có staleTime, lần hover thứ hai
 * cho ra 2 request thay vì 1.
 */
test("hover lại lần hai dùng cache, không hỏi lại", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", net: "900" })]);

  ve();
  const cell = screen.getByTestId("cal-day-2026-07-07");

  await user.hover(cell);
  await screen.findByRole("tooltip");
  await waitFor(() => expect(asked).toHaveLength(1));

  await user.unhover(cell);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

  await user.hover(cell);
  const tip = await screen.findByRole("tooltip");
  // Dữ liệu có ngay, không qua khung chờ.
  await waitFor(() => expect(within(tip).getByText("XAUUSD")).toBeInTheDocument());
  expect(asked).toHaveLength(1);
});

// Ngày nghỉ không có lệnh nào để hỏi. Bắn request cho nó là hỏi một câu mà
// câu trả lời đã biết trước là rỗng.
test("ngày nghỉ không sinh request nào", async () => {
  const user = userEvent.setup();
  serveTrades([]);

  ve();
  await user.hover(screen.getByTestId("cal-day-2026-07-02"));

  const tip = await screen.findByRole("tooltip");
  expect(tip).toHaveTextContent(/không vào lệnh nào/i);
  await new Promise((r) => setTimeout(r, 60));
  expect(asked).toHaveLength(0);
});

// Thẻ dựng không kèm accountId vẫn phải chạy — và không được đòi
// QueryClientProvider chỉ để phục vụ một query không bao giờ gọi.
test("không có accountId thì tooltip dừng ở phần số tổng, không gọi API", async () => {
  const user = userEvent.setup();
  serveTrades([makeTrade({ id: 1, stt: 1, symbol: "XAUUSD" })]);

  renderApp(<MonthCalendarCard months={THANG_07} currency="USD" />);
  await user.hover(screen.getByTestId("cal-day-2026-07-07"));

  const tip = await screen.findByRole("tooltip");
  expect(tip).toHaveTextContent(/1\.381/);
  expect(within(tip).queryByText("XAUUSD")).not.toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 60));
  expect(asked).toHaveLength(0);
});
