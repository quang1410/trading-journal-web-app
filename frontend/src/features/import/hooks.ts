import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { ImportReport } from "./types";

function guiFile(accountId: number, file: File, dryRun: boolean) {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<ImportReport>(
    `/accounts/${accountId}/import?dry_run=${dryRun}`,
    form,
  );
}

/**
 * Xem trước: đọc file, đếm dòng, liệt kê lỗi — KHÔNG ghi gì vào DB.
 *
 * Là mutation chứ không phải query vì nó có tác dụng phụ ở phía người dùng
 * (chọn file) và không có khoá cache nào có nghĩa: hai file khác nhau cùng
 * tên vẫn là hai lần đọc khác nhau.
 */
export function useImportPreview(accountId: number) {
  return useMutation({
    mutationFn: (file: File) => guiFile(accountId, file, true),
  });
}

/**
 * Ghi thật.
 *
 * Sau khi ghi phải làm mới CẢ BỐN nhóm khoá, cùng lý do như useRefresh của
 * features/trades: import chèn lệnh vào giữa dãy stt, và quy tắc 8 của
 * CLAUDE.md nói mọi trường lũy kế tính trên TOÀN BỘ dãy. Thiếu chartsAll thì
 * import xong sang /dashboard sẽ thấy biểu đồ vẽ số cũ mà không báo gì.
 */
export function useImportCommit(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => guiFile(accountId, file, false),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.tradesAll(accountId) }),
        qc.invalidateQueries({ queryKey: qk.statsAll(accountId) }),
        qc.invalidateQueries({ queryKey: qk.trash(accountId) }),
        qc.invalidateQueries({ queryKey: qk.chartsAll(accountId) }),
      ]),
  });
}
