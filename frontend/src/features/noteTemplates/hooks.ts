import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { NoteTemplate, NoteTemplateCreate, NoteTemplatePatch } from "./types";

// URL KHÔNG lồng dưới account: backend là /api/note-templates, vì mẫu thuộc
// user. Xem internal/httpapi/router.go.
const PATH = "/note-templates";

export function useNoteTemplates() {
  return useQuery({
    queryKey: qk.noteTemplates,
    queryFn: () => api.get<NoteTemplate[]>(PATH),
  });
}

export function useCreateNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NoteTemplateCreate) => api.post<NoteTemplate>(PATH, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

export function useUpdateNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: NoteTemplatePatch }) =>
      api.patch<NoteTemplate>(`${PATH}/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

export function useDeleteNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`${PATH}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}

// Gửi ĐỦ tập id theo thứ tự mới. Service từ chối mảng lệch tập (thiếu, thừa,
// trùng) bằng 400 — xem service.Reorder — nên nơi gọi không được cắt cụt mảng.
export function useReorderNoteTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.put<null>(`${PATH}/order`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.noteTemplates }),
  });
}
