import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { DEFAULT_PAGE_SIZE, toQuery, type TradeFilter } from "./filters";
import type { DeletedTrade, Stats, Trade, TradeCreate, TradeFacets, TradePage, TradePatch } from "./types";

/**
 * `keepPreviousData`: đổi bộ lọc hay sang trang là đổi queryKey, và mặc định
 * TanStack coi key mới là một query chưa từng có — `isPending` bật lại, bảng
 * biến mất, cả trang giật lên rồi tụt xuống theo chiều cao của khối "Đang
 * tải…". Giữ dữ liệu cũ lại thì hàng cũ đứng yên cho tới khi hàng mới về.
 */
/**
 * `staleTime`: dành cho danh sách bị GẮN RỒI GỠ liên tục — DayTradeList sống
 * trong tooltip lịch P&L, mà Radix unmount hẳn nội dung tooltip mỗi lần đóng.
 * Với mặc định `staleTime: 0`, mỗi lần hover lại là một request mới cho đúng
 * một ngày đã hỏi xong; rê chuột qua lại mười lần là mười request.
 *
 * Mặc định 0 để mọi chỗ gọi khác giữ nguyên hành vi cũ: bảng /trades phải
 * thấy ngay số mới sau khi sửa một lệnh.
 */
export function useTrades(
  accountId: number,
  f: TradeFilter,
  page: number,
  size = DEFAULT_PAGE_SIZE,
  staleTime = 0,
) {
  return useQuery({
    queryKey: qk.trades(accountId, f, page, size),
    queryFn: () => api.get<TradePage>(`/accounts/${accountId}/trades${toQuery(f, page, size)}`),
    placeholderData: keepPreviousData,
    staleTime,
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

/**
 * Danh sách giá trị cho hai ô lọc chọn-thay-vì-gõ.
 *
 * KHÔNG nhận bộ lọc: danh sách là mọi giá trị account từng dùng, không phải
 * phần còn lại sau khi lọc — thu hẹp theo bộ lọc hiện hành sẽ khiến người
 * dùng chọn một mã rồi không tìm thấy mã nào khác để đổi sang.
 *
 * Vì thế queryKey không mang bộ lọc, và một request duy nhất phục vụ cả
 * phiên. Cache tự hết hạn khi lệnh thay đổi: key nằm dưới tiền tố
 * `tradesAll`, xem lib/queryKeys.ts.
 */
export function useTradeFacets(accountId: number) {
  return useQuery({
    queryKey: qk.tradeFacets(accountId),
    queryFn: () => api.get<TradeFacets>(`/accounts/${accountId}/trades/facets`),
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
