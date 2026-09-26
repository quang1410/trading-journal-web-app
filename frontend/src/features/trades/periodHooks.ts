import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { isEmptyNote } from "@/lib/richText";
import { writeParams, type TradeFilter } from "./filters";
import type { PeriodKind, PeriodNote, PeriodStat } from "./periodTypes";

/**
 * Query string của thẻ kỳ: bộ lọc hiện có cộng thêm `period`.
 *
 * Dùng lại writeParams để bảy ô lọc không phải liệt kê lần thứ hai ở đây —
 * thêm ô lọc thứ tám thì tab Ngày/Tuần tự hiểu, không cần ai nhớ sửa chỗ này.
 *
 * Không có page và size: thẻ kỳ không phân trang. writeParams(filter, 1) với
 * size mặc định vốn không ghi hai khoá đó, nên không cần xoá gì thêm.
 */
function periodQuery(filter: TradeFilter, period: PeriodKind): string {
  const sp = writeParams(filter, 1);
  sp.set("period", period);
  return sp.toString();
}

export function usePeriods(accountId: number, filter: TradeFilter, period: PeriodKind) {
  return useQuery({
    queryKey: qk.periods(accountId, filter, period),
    queryFn: () =>
      api.get<PeriodStat[]>(`/accounts/${accountId}/periods?${periodQuery(filter, period)}`),
  });
}

/**
 * Ghi chú của MỌI kỳ trong một lần gọi.
 *
 * Một request cho cả danh sách chứ không một request mỗi thẻ: ba mươi thẻ trên
 * màn hình là ba mươi request, và chúng đều trả về vài trăm byte.
 *
 * Query key KHÔNG mang bộ lọc: ghi chú gắn với khoá kỳ, nên đổi bộ lọc không
 * đổi nội dung ghi chú — nhồi filter vào key chỉ làm cache trượt mỗi lần lọc.
 */
export function usePeriodNotes(accountId: number, period: PeriodKind) {
  return useQuery({
    queryKey: qk.periodNotes(accountId, period),
    queryFn: () => api.get<PeriodNote[]>(`/accounts/${accountId}/period-notes?period=${period}`),
  });
}

/**
 * Lưu ghi chú cho một kỳ, LẠC QUAN (spec QĐ-10). Body rỗng nghĩa là XOÁ —
 * backend xử như vậy, nên nút "Xoá ghi chú" cũng đi qua đúng mutation này.
 *
 * onMutate ghi ngay nội dung mới vào cache để thẻ đổi tức thì và hộp soạn
 * đóng được mà không chờ mạng; onError trả lại bản chụp cũ để thẻ không nói
 * một điều server chưa đồng ý. onSettled vẫn invalidate để lấy updated_at
 * thật và bắt mọi thay đổi từ tab khác.
 */
export function useSavePeriodNote(accountId: number, period: PeriodKind) {
  const qc = useQueryClient();
  const key = qk.periodNotes(accountId, period);
  return useMutation({
    mutationFn: ({ key: periodKey, bodyHtml }: { key: string; bodyHtml: string }) =>
      api.put<PeriodNote | null>(`/accounts/${accountId}/period-notes/${period}/${periodKey}`, {
        body_html: bodyHtml,
      }),
    onMutate: async ({ key: periodKey, bodyHtml }) => {
      // Huỷ lượt tải đang bay: nó mang dữ liệu CŨ và sẽ đè lên bản lạc quan.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PeriodNote[]>(key);
      qc.setQueryData<PeriodNote[]>(key, (list = []) => {
        const rest = list.filter((n) => n.period_key !== periodKey);
        if (isEmptyNote(bodyHtml)) return rest;
        const next: PeriodNote = {
          period,
          period_key: periodKey,
          body_html: bodyHtml,
          updated_at: new Date().toISOString(),
        };
        return [...rest, next].sort((a, b) => a.period_key.localeCompare(b.period_key));
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
