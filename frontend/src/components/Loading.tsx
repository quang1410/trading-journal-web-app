import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";

/**
 * Khối xám nhấp nháy thay cho nội dung chưa về.
 *
 * Bọc Skeleton lại thay vì rải nó khắp nơi vì phần quan trọng nhất ở đây
 * KHÔNG nhìn thấy được: Skeleton chỉ là mấy cái <div> rỗng, nên với trình
 * đọc màn hình nó là hư không. `role="status"` cộng một dòng sr-only mới là
 * thứ giữ cho người dùng bàn phím biết trang đang chờ chứ không phải đã
 * hỏng. Rải tay thì sẽ có chỗ quên.
 *
 * `row` là số vạch — đặt xấp xỉ số dòng thật sắp hiện ra để trang không
 * nhảy chiều cao khi dữ liệu về.
 */
export function Loading({ row = 3, label }: { row?: number; label?: string }) {
  const { t } = useI18n();
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {Array.from({ length: row }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" aria-hidden />
      ))}
    </div>
  );
}
