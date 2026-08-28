import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import type { ReactElement, ReactNode } from "react";
import { LocaleProvider } from "@/i18n";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { __resetActiveAccountForTest } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import type { MetaEnums } from "@/features/meta/hooks";

/**
 * Bộ đồ nghề chung của test.
 *
 * `BASE` và `envelope` bị khai lại ở 14 file test, tức là hợp đồng envelope
 * `{code,msg,data}` có 15 bản: một bản thật trong lib/api.ts (hàm `wrap`) và
 * mười bốn bản chép trong test. Thêm một field vào envelope là sửa mười lăm chỗ.
 *
 * CHƯA XONG: mới 2 file test dùng chỗ này, 13 file còn lại vẫn tự khai `BASE`
 * riêng. Đây là đích đến, không phải mô tả hiện trạng — đừng đọc file này rồi
 * tưởng việc gộp đã hoàn tất.
 *
 * Đi cùng tradeFactory chứ không thay nó: factory dựng DỮ LIỆU, file này dựng
 * MÔI TRƯỜNG.
 */
export const BASE = "http://localhost/api";

/** Gói data vào đúng envelope backend trả về. Nghịch đảo của `wrap` trong api.ts. */
export const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

/** Envelope lỗi: `code` khác 0 là lỗi, kèm `msg` tiếng Việt như backend thật. */
export const errorEnvelope = (code: number, msg: string, status = 400) =>
  HttpResponse.json({ code, msg, data: null }, { status });

export function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: 1,
    code: "FTMO",
    name: "Quỹ thử thách",
    initial_balance: "10000",
    risk_per_trade: "0.01",
    currency: "USD",
    timezone: "Asia/Ho_Chi_Minh",
    one_r: "100",
    ...over,
  };
}

export function makeEnums(over: Partial<MetaEnums> = {}): MetaEnums {
  return {
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
    ...over,
  };
}

/**
 * Dọn sạch trạng thái toàn cục giữa hai ca test.
 *
 * `__resetApiForTest` gỡ khoá single-flight của refresh token, và
 * `__resetActiveAccountForTest` gỡ account đang chọn — cả hai là biến module,
 * không đi theo React, nên chúng sống sót qua unmount.
 */
export function resetAll({ loggedIn = true }: { loggedIn?: boolean } = {}) {
  clearSession();
  __resetApiForTest();
  __resetActiveAccountForTest();
  localStorage.clear();
  if (loggedIn) setSession("abc", { id: 1, email: "toi@example.com" });
}

/**
 * Dựng UI với đủ ba provider mà app thật có: query, i18n, router.
 *
 * `retry: false` là bắt buộc, không phải tuỳ chọn: mặc định TanStack thử lại
 * ba lần, nên một ca test lỗi sẽ chờ hết backoff rồi mới đỏ — và đỏ vì
 * timeout, che mất lỗi thật.
 */
export function renderApp(
  ui: ReactElement,
  { path = "/", wrap }: { path?: string; wrap?: (children: ReactNode) => ReactNode } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = wrap ? wrap(ui) : ui;
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[path]}>{content}</MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
