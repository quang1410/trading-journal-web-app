import type { ReactNode } from "react";

/**
 * Màn hình rỗng dùng chung: một câu nói vì sao rỗng, một dòng gợi ý, và tuỳ
 * chọn một nút mời làm việc tiếp.
 *
 * Gom về một chỗ vì bảng lệnh, thùng rác và tab Ngày/Tuần đều cần đúng khung
 * này — ba bản chép tay sẽ lệch nhau ở lần chỉnh viền hay khoảng cách tới.
 */
export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  /** Nút hành động, nếu có. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
