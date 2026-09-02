import { DEFAULT_PAGE_SIZE, type TradeFilter } from "@/features/trades/filters";

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
};
