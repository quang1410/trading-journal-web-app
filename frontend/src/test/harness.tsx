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
    account_type: "personal",
    prop_firm: "",
    challenge_phase: null,
    challenge_status: null,
    profit_target: null,
    max_drawdown_limit: null,
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
    account_types: ["personal", "prop"],
    challenge_phases: ["phase_1", "phase_2", "funded"],
    challenge_statuses: ["in_progress", "passed", "failed"],
    weekdays: ["Mon"],
    default_setup: "KHÔNG CÓ SETUP",
    score_points: {
      entry_qualities: { "Đúng kế hoạch": 25 },
      in_trade_qualities: { "Tuân thủ kế hoạch": 25 },
      exit_qualities: { "Chạm Chốt lời": 25 },
      psychologies: { "Không lỗi": 25 },
    },
    class_bands: [
      { min: 80, class: "Đúng kế hoạch" },
      { min: 55, class: "Cần cải thiện" },
      { min: 30, class: "Bốc đồng / FOMO" },
      { min: 0, class: "Giao dịch trả thù" },
    ],
    ...over,
  };
}

/**
 * Enum ĐẦY ĐỦ, đúng thứ tự của backend/internal/domain/enums.go, kèm điểm của
 * trading-journal-plan.md §2. Landing chọn lựa chọn mặc định theo điểm và trỏ
 * vào nhãn theo vị trí, nên nó cần bộ thật chứ không phải bộ một phần tử của
 * makeEnums.
 */
export function makeFullEnums(): MetaEnums {
  return makeEnums({
    entry_qualities: ["Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"],
    in_trade_qualities: ["Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"],
    exit_qualities: ["Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"],
    psychologies: [
      "Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG",
    ],
    trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện", "Bốc đồng / FOMO", "Giao dịch trả thù"],
    score_points: {
      entry_qualities: { "Đúng kế hoạch": 25, "Quá sớm": 10, "Quá muộn": 10, "Bốc đồng": 0 },
      in_trade_qualities: { "Tuân thủ kế hoạch": 25, "Dời Chốt lời": 10, "Dời dừng lỗ ra xa": 0, "Muốn thoát lệnh": 5 },
      exit_qualities: {
        "Chạm Chốt lời": 25, "Chạm Dừng lỗ": 25, "Thoát chủ động (lý do kỹ thuật)": 15, "Thoát lệnh cảm tính, sợ hãi": 0,
      },
      psychologies: {
        "Không lỗi": 25, "SỢ BỎ LỠ (FOMO)": 0, "SỢ HÃI": 5, "HI VỌNG": 5, "THAM LAM": 5,
        "GIAO DỊCH TRẢ THÙ": 0, "LUÔN MUỐN MÌNH ĐÚNG": 0,
      },
    },
  });
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
