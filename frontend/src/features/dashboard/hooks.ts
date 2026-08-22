import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { toQuery, type TradeFilter } from "@/features/trades/filters";
import type { Charts } from "./types";

/**
 * Mười hai nhóm biểu đồ trong MỘT request.
 *
 * Backend cố ý gộp (aggregate.All): cả mười hai đều xuất phát từ cùng một lần
 * nạp danh sách lệnh, nên tách thành mười hai endpoint là nạp lại mười hai lần.
 *
 * `toQuery(f, 1)` — trang 1 để hàm bỏ hẳn tham số page. /charts gom trên TOÀN
 * BỘ tập đã lọc chứ không phân trang, giống /stats.
 */
export function useCharts(accountId: number, f: TradeFilter) {
  return useQuery({
    queryKey: qk.charts(accountId, f),
    queryFn: () => api.get<Charts>(`/accounts/${accountId}/charts${toQuery(f, 1)}`),
  });
}
