import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, renderApp, resetAll, envelope, errorEnvelope } from "@/test/harness";
import { makeTrade } from "@/test/tradeFactory";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { RecentTradesPanel } from "./RecentTradesPanel";

// Bám vào HTTP như dashboardPage.test.tsx, KHÔNG mock module @/lib/api: khối
// này sống hay chết ở chỗ nó hỏi ĐÚNG TRANG NÀO, mà tham số trang chỉ nhìn
// thấy được ở tầng URL.
const asked: string[] = [];

function serveTrades(total: number, itemsByPage: Record<number, ReturnType<typeof makeTrade>[]>) {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      const sp = new URL(request.url).searchParams;
      asked.push(request.url);
      const page = sp.get("page") ?? "1";
      const size = sp.get("size") ?? "50";
      return envelope({
        items: itemsByPage[+page] ?? [],
        page: +page,
        size: +size,
        total,
      });
    }),
  );
}

function ve() {
  return renderApp(
    <RecentTradesPanel
      accountId={1}
      filter={EMPTY_FILTER}
      currency="USD"
      timezone="Asia/Ho_Chi_Minh"
    />,
  );
}

beforeEach(() => {
  resetAll();
  asked.length = 0;
});

// Backend sắp lệnh theo stt TĂNG dần (repository/trade.go), nên "lệnh gần
// nhất" nằm ở TRANG CUỐI, không phải trang 1. Đây là bất biến dễ hỏng nhất
// của khối này: lấy nhầm trang 1 sẽ hiện lệnh CŨ NHẤT mà trông vẫn hợp lý.
test("hỏi trang cuối rồi đảo, lệnh mới nhất lên đầu", async () => {
  serveTrades(20, {
    1: [makeTrade({ id: 1, stt: 1, symbol: "CUNHAT" })],
    3: [
      makeTrade({ id: 17, stt: 17, symbol: "APCHOT" }),
      makeTrade({ id: 18, stt: 18, symbol: "MOINHAT" }),
    ],
  });

  ve();

  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  // total 20 / size 8 -> 3 trang.
  expect(asked.some((u) => u.includes("page=3"))).toBe(true);
  const first = screen.getAllByRole("listitem")[0];
  expect(within(first).getByText("MOINHAT")).toBeInTheDocument();
  expect(screen.queryByText("CUNHAT")).not.toBeInTheDocument();
});

test("chỉ một trang thì không hỏi trang nào khác", async () => {
  serveTrades(1, { 1: [makeTrade({ id: 1, stt: 1, symbol: "DUYNHAT" })] });

  ve();

  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  expect(asked.every((u) => !u.includes("page=2"))).toBe(true);
});

test("không có lệnh nào thì nói ra, không để khung trống", async () => {
  serveTrades(0, {});
  ve();
  await waitFor(() => expect(screen.getByText(/chưa có lệnh nào khớp/i)).toBeInTheDocument());
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("mỗi dòng nêu mã, chiều lệnh và net", async () => {
  serveTrades(1, {
    1: [makeTrade({ id: 1, stt: 1, symbol: "XAUUSD", direction: "Short", net: "-725" })],
  });

  ve();

  const row = await screen.findByRole("listitem");
  expect(within(row).getByText("XAUUSD")).toBeInTheDocument();
  expect(within(row).getByText("Short")).toBeInTheDocument();
  expect(within(row).getByText(/725/)).toBeInTheDocument();
});

test("lỗi thì báo lỗi, không im lặng hiện rỗng", async () => {
  server.use(http.get(`${BASE}/accounts/1/trades`, () => errorEnvelope(1500, "hỏng", 500)));
  ve();
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.queryByText(/chưa có lệnh nào khớp/i)).not.toBeInTheDocument();
});
