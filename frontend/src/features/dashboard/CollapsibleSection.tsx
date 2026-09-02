import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Một mục của trang, mở/đóng được, dựng trên <details>.
 *
 * Dùng <details>/<summary> chứ không phải nút + state React, và đó không phải
 * chuyện lười: trình duyệt cho sẵn phím Enter/Space, vai trò trợ năng, và quan
 * trọng nhất là Ctrl+F tìm được chữ nằm trong phần đang đóng rồi tự mở ra.
 * Dựng lại bằng useState sẽ mất cả ba, mà không có gì bật lỗi.
 *
 * `open` là mặc định LÚC DỰNG, không phải state bị điều khiển — mở hay đóng
 * sau đó là chuyện của người đọc, React không giành lại quyền đó. Đây là lý do
 * mặc định `true` an toàn: dựng ra là mở, còn ai gập lại thì nó nằm gập cho
 * tới khi họ mở lại, không có lần render nào bật nó lên lại sau lưng họ.
 *
 * MỞ SẴN, KHÔNG PHẢI ĐÓNG SẴN. Thứ tự trên trang đã đủ nói cái gì quan trọng
 * hơn cái gì — tầng 1 nằm trên, phân tích nằm dưới. Đóng sẵn thêm lần nữa là
 * phạt người muốn xem: họ phải bấm bốn lần mới thấy thứ vốn đã ở đúng chỗ của
 * nó. Cái gập lại để dành cho người ĐÃ BIẾT mình không cần mục nào.
 */
export function CollapsibleSection({
  title,
  children,
  open = true,
  id,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  id?: string;
}) {
  return (
    <details open={open} className="group flex flex-col gap-3" data-testid={id}>
      <summary
        className={
          // list-none + marker:hidden: bỏ tam giác mặc định của trình duyệt,
          // đã có chevron riêng xoay theo trạng thái.
          //
          // Có viền và nền: một dòng chữ trần với cái mũi tên bé cạnh nó không
          // đọc ra thành "bấm được" — mà cả tầng 3 của trang nằm sau đúng
          // những dòng này, nên chúng phải mời được người ta bấm vào.
          "flex cursor-pointer list-none items-center gap-2 rounded-md border " +
          "border-border bg-card px-3 py-2 transition-colors hover:bg-[var(--surface-sunken)] " +
          "marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 " +
          "focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden"
        }
      >
        {/* Đóng thì chỉ sang phải, mở thì chỉ xuống — hướng mũi tên nói phần
            nội dung sẽ bung ra ở đâu. Lật 180° chỉ đổi trên/dưới, không nói
            được điều đó. */}
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {/* h2 nằm TRONG summary để cây heading của trang không đứt quãng:
            trình đọc màn hình duyệt theo heading, và mục đóng vẫn phải có mặt
            trong mục lục đó. */}
        <h2 className="text-base font-semibold">{title}</h2>
      </summary>

      <div className="flex flex-col gap-3 pt-1">{children}</div>
    </details>
  );
}
