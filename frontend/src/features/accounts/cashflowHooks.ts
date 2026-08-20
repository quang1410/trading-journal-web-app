import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";

export type CashFlow = {
  id: number;
  date: string; // YYYY-MM-DD, không có giờ
  amount: string; // luôn dương; chiều nằm ở `type`
  type: string; // "deposit" | "withdraw", lấy từ /meta/enums
  note: string;
};

export type CashFlowCreate = Omit<CashFlow, "id">;

export function useCashFlows(accountId: number) {
  return useQuery({
    queryKey: qk.cashFlows(accountId),
    queryFn: () => api.get<CashFlow[]>(`/accounts/${accountId}/cash-flows`),
  });
}

export function useCreateCashFlow(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CashFlowCreate) => api.post<CashFlow>(`/accounts/${accountId}/cash-flows`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashFlows(accountId) }),
  });
}

// URL xoá KHÔNG lồng dưới account: backend là DELETE /api/cash-flows/{id},
// và nó tự kiểm quyền sở hữu (service/cashflow.go). Vẫn cần accountId để
// biết phải làm mới danh sách nào.
export function useDeleteCashFlow(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`/cash-flows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashFlows(accountId) }),
  });
}
