import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Account, AccountCreate, AccountPatch } from "./types";

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: () => api.get<Account[]>("/accounts") });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AccountCreate) => api.post<Account>("/accounts", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AccountPatch }) =>
      api.patch<Account>(`/accounts/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}
