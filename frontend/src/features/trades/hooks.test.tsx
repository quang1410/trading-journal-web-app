import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { makeTrade, makeStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER } from "./filters";
import { useStats, useTrades, useTrash, useUpdateTrade } from "./hooks";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

test("bộ lọc đi vào query string của request", async () => {
  let path = "";
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      path = new URL(request.url).search;
      return envelope({ items: [], page: 2, size: 50, total: 0 });
    }),
  );

  const { result } = renderHook(
    () => useTrades(1, { ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" }, 2),
    { wrapper: wrap(client()) },
  );

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(path).toBe("?symbol=XAUUSD&direction=Long&page=2");
});

test("stats không gửi page — nó tính trên cả tập đã lọc", async () => {
  let path = "";
  server.use(
    http.get(`${BASE}/accounts/1/stats`, ({ request }) => {
      path = new URL(request.url).search;
      return envelope(makeStats());
    }),
  );

  const { result } = renderHook(() => useStats(1, { ...EMPTY_FILTER, symbol: "XAUUSD" }), {
    wrapper: wrap(client()),
  });

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(path).toBe("?symbol=XAUUSD");
});

// ĐÂY LÀ BẤT BIẾN SỐ 1.
//
// Quy tắc 8 của CLAUDE.md: lũy kế tính trên TOÀN BỘ dãy lệnh theo thứ tự stt.
// Sửa lệnh 1 làm cum_by_trade của lệnh 2 đổi theo. Nếu FE chỉ vá dòng vừa sửa
// vào cache thì dòng 2 giữ số cũ — không có lỗi nào bật ra, chỉ có một con số
// sai trông rất bình thường.
//
// Mock ở đây CÓ TRẠNG THÁI và tự tính lại lũy kế, đúng như backend thật. Mock
// tĩnh sẽ làm test này xanh kể cả khi FE vá một dòng.
test("sửa một lệnh làm lũy kế của lệnh sau nó cập nhật theo", async () => {
  const store = [
    makeTrade({ id: 1, stt: 1, profit: "100", net: "100", cum_by_trade: "100" }),
    makeTrade({ id: 2, stt: 2, profit: "50", net: "50", cum_by_trade: "150" }),
  ];

  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      envelope({ items: [...store], page: 1, size: 50, total: store.length }),
    ),
    http.patch(`${BASE}/trades/1`, async ({ request }) => {
      const p = (await request.json()) as { profit?: string };
      const fresh = p.profit ?? store[0].profit;
      store[0] = { ...store[0], profit: fresh, net: fresh, cum_by_trade: fresh };
      store[1] = { ...store[1], cum_by_trade: "250" };
      return envelope(store[0]);
    }),
  );

  const qc = client();
  const { result } = renderHook(
    () => ({ ds: useTrades(1, EMPTY_FILTER, 1), edit: useUpdateTrade(1) }),
    { wrapper: wrap(qc) },
  );

  await waitFor(() => expect(result.current.ds.data).toBeTruthy());
  expect(result.current.ds.data!.items[1].cum_by_trade).toBe("150");

  await act(async () => {
    await result.current.edit.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => {
    expect(result.current.ds.data!.items[1].cum_by_trade).toBe("250");
  });
});

// Ba nhánh, không phải một. Thùng rác cũng đổi: xoá và khôi phục đi qua cùng
// một mutation, và stats đổi vì net_profit tính trên tập đã lọc.
test("một lần sửa làm mới cả ba nhánh trades, stats, trash", async () => {
  const dem = { trades: 0, stats: 0, trash: 0 };
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () => {
      dem.trades++;
      return envelope({ items: [makeTrade()], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => {
      dem.stats++;
      return envelope(makeStats());
    }),
    http.get(`${BASE}/accounts/1/trades/trash`, () => {
      dem.trash++;
      return envelope([]);
    }),
    http.patch(`${BASE}/trades/1`, () => envelope(makeTrade())),
  );

  const { result } = renderHook(
    () => ({
      ds: useTrades(1, EMPTY_FILTER, 1),
      kpi: useStats(1, EMPTY_FILTER),
      rac: useTrash(1),
      edit: useUpdateTrade(1),
    }),
    { wrapper: wrap(client()) },
  );

  await waitFor(() => {
    expect(dem).toEqual({ trades: 1, stats: 1, trash: 1 });
  });

  await act(async () => {
    await result.current.edit.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => {
    expect(dem).toEqual({ trades: 2, stats: 2, trash: 2 });
  });
});
