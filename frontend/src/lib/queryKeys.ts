import { DEFAULT_PAGE_SIZE, type TradeFilter } from "@/features/trades/filters";
import type { PeriodKind } from "@/features/trades/periodTypes";

// Query key tập trung một chỗ, để không ai tự chế key lệch nhau rồi
// invalidate hụt.
//
// Key của một trang lệnh nằm DƯỚI `tradesAll` về mặt tiền tố:
//
//   tradesAll(1)    = ["accounts", 1, "trades"]
//   trades(1, f, 2, 100) = ["accounts", 1, "trades", { ...f, page: 2, size: 100 }]
//
// TanStack Query khớp theo tiền tố, nên invalidate `tradesAll` là quét sạch
// MỌI tổ hợp bộ lọc và MỌI trang đang nằm trong cache. Đó chính là thứ quy
// tắc 8 của CLAUDE.md đòi hỏi — xem features/trades/hooks.ts.
export const qk = {
  accounts: ["accounts"] as const,
  cashFlows: (accountId: number) => ["accounts", accountId, "cash-flows"] as const,
  metaEnums: ["meta", "enums"] as const,

  // KHÔNG nằm dưới tiền tố ["accounts", id]: mẫu ghi chú thuộc user, nên đổi
  // account không được làm mất cache, và invalidate accounts không được quét
  // nó. Đây là query key duy nhất ngoài phạm vi account.
  noteTemplates: ["note-templates"] as const,

  trades: (accountId: number, f: TradeFilter, page: number, size = DEFAULT_PAGE_SIZE) =>
    ["accounts", accountId, "trades", { ...f, page, size }] as const,
  tradesAll: (accountId: number) => ["accounts", accountId, "trades"] as const,

  stats: (accountId: number, f: TradeFilter) => ["accounts", accountId, "stats", f] as const,
  statsAll: (accountId: number) => ["accounts", accountId, "stats"] as const,

  trash: (accountId: number) => ["accounts", accountId, "trash"] as const,

  // Nằm DƯỚI tiền tố tradesAll một cách có chủ ý: danh sách symbol/setup do
  // chính các lệnh sinh ra, nên mọi lần invalidate tradesAll — tạo, sửa,
  // xoá, khôi phục, import — quét luôn cả nó. Thêm một lệnh với mã mới thì
  // ô lọc thấy mã đó ngay, không cần ai nhớ invalidate thêm chỗ nào.
  tradeFacets: (accountId: number) => ["accounts", accountId, "trades", "facets"] as const,

  charts: (accountId: number, f: TradeFilter) => ["accounts", accountId, "charts", f] as const,
  chartsAll: (accountId: number) => ["accounts", accountId, "charts"] as const,

  // Thẻ kỳ nằm DƯỚI tiền tố ["accounts", id]: chúng là số liệu suy ra từ lệnh
  // và phải bay theo mọi lần lệnh thay đổi, giống charts.
  periods: (accountId: number, f: TradeFilter, period: PeriodKind) =>
    ["accounts", accountId, "periods", period, f] as const,
  periodsAll: (accountId: number) => ["accounts", accountId, "periods"] as const,

  // Ghi chú kỳ KHÔNG chịu bộ lọc nên key không mang filter: nó gắn với khoá
  // kỳ, và thẻ nào hiện ra thì ghi chú của kỳ đó đi kèm.
  periodNotes: (accountId: number, period: PeriodKind) =>
    ["accounts", accountId, "period-notes", period] as const,
};
