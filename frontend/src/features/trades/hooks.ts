import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { DEFAULT_PAGE_SIZE, toQuery, type TradeFilter } from "./filters";
import type { DeletedTrade, Stats, Trade, TradeCreate, TradePage, TradePatch } from "./types";

/**
 * `keepPreviousData`: đổi bộ lọc hay sang trang là đổi queryKey, và mặc định
 * TanStack coi key mới là một query chưa từng có — `isPending` bật lại, bảng
 * biến mất, cả trang giật lên rồi tụt xuống theo chiều cao của khối "Đang
 * tải…". Giữ dữ liệu cũ lại thì hàng cũ đứng yên cho tới khi hàng mới về.
 */
export function useTrades(accountId: number, f: TradeFilter, page: number, size = DEFAULT_PAGE_SIZE) {
  return useQuery({
    queryKey: qk.trades(accountId, f, page, size),
    queryFn: () => api.get<TradePage>(`/accounts/${accountId}/trades${toQuery(f, page, size)}`),
    placeholderData: keepPreviousData,
  });
}

export function useStats(accountId: number, f: TradeFilter) {
  return useQuery({
    queryKey: qk.stats(accountId, f),
    // page 1 để toQuery bỏ hẳn tham số page: /stats tính trên TOÀN BỘ tập đã
    // lọc, không phân trang. Gửi page lên sẽ là nói dối về ý định.
    queryFn: () => api.get<Stats>(`/accounts/${accountId}/stats${toQuery(f, 1)}`),
    // Cùng lý do như useTrades: dải KPI biến mất giữa hai lần lọc sẽ đẩy cả
    // bảng bên dưới nhảy chỗ.
    placeholderData: keepPreviousData,
  });
}

export function useTrash(accountId: number) {
  return useQuery({
    queryKey: qk.trash(accountId),
    queryFn: () => api.get<DeletedTrade[]>(`/accounts/${accountId}/trades/trash`),
  });
}

/**
 * Làm mới sau MỌI thay đổi lệnh — cả ba nhánh, không chừa nhánh nào.
 *
 * Quy tắc 8 của CLAUDE.md: cum_by_trade, cum_by_day, cum_theory, running_peak
 * và drawdown tính trên TOÀN BỘ dãy lệnh của account theo thứ tự stt. Sửa một
 * lệnh cũ làm mọi lệnh SAU nó đổi số. Vá riêng dòng vừa sửa vào cache bằng
 * setQueryData sẽ để những dòng khác mang số cũ, và không có lỗi nào bật ra —
 * chỉ có những con số sai trông rất bình thường.
 *
 * `tradesAll` là tiền tố nên nó quét sạch mọi tổ hợp bộ lọc và mọi trang đang
 * nằm trong cache, không chỉ trang đang xem. `chartsAll` cũng vậy — thiếu nó
 * thì sửa lệnh ở /trades rồi sang /dashboard sẽ thấy biểu đồ vẽ số cũ.
 */
function useRefresh(accountId: number) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.tradesAll(accountId) }),
      qc.invalidateQueries({ queryKey: qk.statsAll(accountId) }),
      qc.invalidateQueries({ queryKey: qk.trash(accountId) }),
      qc.invalidateQueries({ queryKey: qk.chartsAll(accountId) }),
    ]);
}

export function useCreateTrade(accountId: number) {
  const refresh = useRefresh(accountId);
  return useMutation({
    mutationFn: (v: TradeCreate) => api.post<Trade>(`/accounts/${accountId}/trades`, v),
    onSuccess: refresh,
  });
}

// Ba đường dưới đây KHÔNG lồng dưới account: backend là /api/trades/{id} và
// tự kiểm quyền sở hữu. Vẫn cần accountId để biết phải làm mới nhánh nào.
export function useUpdateTrade(accountId: number) {
  const refresh = useRefresh(accountId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TradePatch }) =>
      api.patch<Trade>(`/trades/${id}`, patch),
    onSuccess: refresh,
  });
}

export function useDeleteTrade(accountId: number) {
  const refresh = useRefresh(accountId);
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`/trades/${id}`),
    onSuccess: refresh,
  });
}

export function useRestoreTrade(accountId: number) {
  const refresh = useRefresh(accountId);
  return useMutation({
    mutationFn: (id: number) => api.post<Trade>(`/trades/${id}/restore`),
    onSuccess: refresh,
  });
}
