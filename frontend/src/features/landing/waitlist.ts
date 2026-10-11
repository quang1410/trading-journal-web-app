import type { TranslationKey } from "@/i18n";

/**
 * Mã câu trả lời — khớp domain.JournalTools / WaitlistMarkets / PropStatuses
 * của backend và CHECK của migration 0007. ASCII nên không phải chuỗi enum
 * chấm điểm; nhãn hiển thị nằm ở strings.ts.
 */
export const JOURNAL_TOOLS = ["spreadsheet", "notion", "other_app", "none"] as const;
export const MARKETS = ["fx_gold", "crypto", "vn_stocks", "vn_derivatives"] as const;
export const PROP_STATUSES = ["active", "past", "never"] as const;

export type JournalTool = (typeof JOURNAL_TOOLS)[number];
export type Market = (typeof MARKETS)[number];
export type PropStatus = (typeof PROP_STATUSES)[number];

export const TOOL_LABEL: Record<JournalTool, TranslationKey> = {
  spreadsheet: "landing.answers.toolSpreadsheet",
  notion: "landing.answers.toolNotion",
  other_app: "landing.answers.toolOtherApp",
  none: "landing.answers.toolNone",
};
export const MARKET_LABEL: Record<Market, TranslationKey> = {
  fx_gold: "landing.answers.marketFxGold",
  crypto: "landing.answers.marketCrypto",
  vn_stocks: "landing.answers.marketVnStocks",
  vn_derivatives: "landing.answers.marketVnDerivatives",
};
export const PROP_LABEL: Record<PropStatus, TranslationKey> = {
  active: "landing.answers.propActive",
  past: "landing.answers.propPast",
  never: "landing.answers.propNever",
};

/** Kiểm sơ bộ để báo lỗi ngay tại ô nhập. Luật thật nằm ở domain.NormalizeEmail. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Nhãn nguồn của lượt truy cập: ?utm_source= trước, rồi ?ref=. Backend tự lọc
 * ký tự. Dùng || chứ không ??: utm_source rỗng là không có nguồn, không được
 * che mất ref.
 */
export function readSource(search: string): string {
  const params = new URLSearchParams(search);
  return params.get("utm_source") || params.get("ref") || "";
}
