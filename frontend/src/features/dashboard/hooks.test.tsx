import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoCharts, taoLenh } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { useUpdateTrade } from "@/features/trades/hooks";
import { useCharts } from "./hooks";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function boc(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function khachHang() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

test("bộ lọc đi vào query string, và KHÔNG gửi page", async () => {
  // /charts gom trên toàn bộ tập đã lọc, không phân trang. Gửi page lên là
  // nói dối về ý định, và backend sẽ bỏ qua nó — nên sai này không bao giờ
  // tự bật ra lỗi.
  let duongDan = "";
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      duongDan = new URL(request.url).search;
      return phongBi(taoCharts());
    }),
  );

  const { result } = renderHook(
    () => useCharts(1, { ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" }),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(duongDan).toBe("?symbol=XAUUSD&direction=Long");
});

// ĐÂY LÀ BẤT BIẾN SỐ 1 CỦA PHASE NÀY.
//
// useLamMoi bên features/trades hiện làm mới ba nhánh. Thiếu nhánh thứ tư thì:
// sửa một lệnh ở /trades -> sang /dashboard -> biểu đồ vẫn vẽ số CŨ. Không có
// lỗi nào bật ra, chỉ có những con số sai trông rất bình thường.
test("sửa một lệnh làm mới cả nhánh charts", async () => {
  const dem = { charts: 0 };
  server.use(
    http.get(`${BASE}/accounts/1/charts`, () => {
      dem.charts++;
      return phongBi(taoCharts());
    }),
    http.get(`${BASE}/accounts/1/trades`, () =>
      phongBi({ items: [taoLenh()], page: 1, size: 50, total: 1 }),
    ),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi({})),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
    http.patch(`${BASE}/trades/1`, () => phongBi(taoLenh())),
  );

  const { result } = renderHook(
    () => ({ bd: useCharts(1, EMPTY_FILTER), sua: useUpdateTrade(1) }),
    { wrapper: boc(khachHang()) },
  );

  await waitFor(() => expect(dem.charts).toBe(1));

  await act(async () => {
    await result.current.sua.mutateAsync({ id: 1, patch: { profit: "200" } });
  });

  await waitFor(() => expect(dem.charts).toBe(2));
});

// Hai bộ lọc khác nhau là hai mục cache khác nhau, nhưng cùng nằm dưới tiền tố
// chartsAll — nên một lần invalidate quét sạch cả hai.
test("mỗi bộ lọc là một mục cache riêng", async () => {
  const daGoi: string[] = [];
  server.use(
    http.get(`${BASE}/accounts/1/charts`, ({ request }) => {
      daGoi.push(new URL(request.url).search);
      return phongBi(taoCharts());
    }),
  );

  const qc = khachHang();
  const { result } = renderHook(
    () => ({
      a: useCharts(1, EMPTY_FILTER),
      b: useCharts(1, { ...EMPTY_FILTER, symbol: "XAUUSD" }),
    }),
    { wrapper: boc(qc) },
  );

  await waitFor(() => {
    expect(result.current.a.data).toBeTruthy();
    expect(result.current.b.data).toBeTruthy();
  });
  expect(daGoi).toEqual(["", "?symbol=XAUUSD"]);
});
