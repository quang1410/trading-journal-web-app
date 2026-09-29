import { useQueries } from "@tanstack/react-query";
import { EMPTY_FILTER } from "@/features/trades/filters";
import { statsQuery } from "@/features/trades/hooks";
import type { Stats } from "@/features/trades/types";
import type { Account } from "./types";

/**
 * /stats KHÔNG filter cho từng account — số dư thật và tiến độ thi.
 *
 * Cùng statsQuery(id, EMPTY_FILTER) với useStats của trang Lệnh, nên hai trang
 * dùng chung cache, và mọi chỗ đang invalidate statsAll(id) (tạo lệnh, nạp/rút,
 * import) làm tươi luôn hàng này mà không phải nhớ thêm gì.
 *
 * N request cho N account là cố ý: một người có hàng chục account trở xuống
 * (spec §5). Endpoint tổng hợp riêng là tối ưu sớm.
 */
export function useAccountStats(accounts: Account[]): Map<number, Stats | undefined> {
  const results = useQueries({
    queries: accounts.map((a) => statsQuery(a.id, EMPTY_FILTER)),
  });
  return new Map(accounts.map((a, i) => [a.id, results[i]?.data]));
}
