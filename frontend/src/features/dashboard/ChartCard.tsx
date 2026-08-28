import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { useI18n } from "@/i18n";

/**
 * Vỏ chung của một thẻ biểu đồ: khung, tiêu đề, trạng thái rỗng, figure có
 * nhãn, và bản <table> cho trình đọc màn hình.
 *
 * Trước đây chín file tự viết lại đúng bốn thứ này; khối rỗng giống nhau từng
 * byte, chỉ khác mỗi khoá tiêu đề. Cái đắt nhất là bảng sr-only: không có gì
 * hỏng khi một biểu đồ quên nó, nên nó sẽ mục đi trong im lặng.
 *
 * Bảng đi từ `bang` chứ không phải children: mô tả bằng DỮ LIỆU thì
 * ChartCard tự dựng được, và test bám vào cấu trúc đó thay vì vào SVG —
 * Recharts không vẽ gì trong jsdom (ResponsiveContainer đo bằng ResizeObserver),
 * nên bảng vừa là lối vào cho người dùng trình đọc, vừa là bề mặt test.
 */
export type TableSpec = {
  /** Nhãn cột, cột đầu là cột khoá (dựng thành <th scope="row">). */
  col: string[];
  /** Mỗi hàng: phần tử đầu là khoá hàng, phần còn lại là ô dữ liệu. */
  row: (string | number)[][];
};

/**
 * Vỏ thẻ trần: khung, tiêu đề, trạng thái rỗng — KHÔNG có figure và
 * ResponsiveContainer.
 *
 * Dành cho biểu đồ không chạy trên Recharts (HeatmapChart vẽ bằng CSS grid) và
 * cho khối bố cục riêng (ScoreRadarBlock xếp ngang ở màn rộng). Nhờ vậy khối
 * rỗng và khung thẻ vẫn chỉ có MỘT bản cho cả bảng điều khiển.
 */
export function BareCard({
  title,
  empty,
  children,
  className = "",
  hideTitle = false,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
  className?: string;
  /** Tiêu đề chỉ dành cho trình đọc màn hình, khi bố cục đã tự nói tên khối. */
  hideTitle?: boolean;
}) {
  const { t } = useI18n();

  if (empty) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section
      className={`flex flex-col gap-3 rounded-md border border-border bg-card p-4 ${className}`.trimEnd()}
    >
      <h3 className={hideTitle ? "sr-only" : "text-sm font-medium"}>{title}</h3>
      {children}
    </section>
  );
}

export function ChartCard({
  title,
  empty,
  height = "h-56",
  table,
  children,
  note,
  className = "",
}: {
  title: string;
  /** Rỗng thì chỉ hiện tiêu đề và một dòng giải thích, không dựng figure. */
  empty: boolean;
  /** Lớp chiều cao của figure. Mỗi biểu đồ có nhu cầu riêng. */
  height?: string;
  table?: TableSpec;
  children: ReactNode;
  /** Dòng chú thích dưới biểu đồ, ví dụ lời nhắc dữ liệu chưa đủ. */
  note?: ReactNode;
  /** Lớp thêm cho <section>, cho biểu đồ cần chiều cao riêng ở màn rộng. */
  className?: string;
}) {
  const { t } = useI18n();

  if (empty) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section
      className={`flex flex-col gap-3 rounded-md border border-border bg-card p-4 ${className}`.trimEnd()}
    >
      <h3 className="text-sm font-medium">{title}</h3>

      <figure aria-label={`${title} — ${t("dashboard.chartOf")}`} className={`${height} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </figure>

      {/* sr-only chứ không display:none — display:none là ẩn với cả trình đọc
          màn hình, tức là ẩn mất bản dữ liệu duy nhất họ đọc được. */}
      {table && (
        <table className="sr-only">
          <caption>{title}</caption>
          <thead>
            <tr>
              {table.col.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.row.map(([key, ...o]) => (
              <tr key={String(key)}>
                <th scope="row">{key}</th>
                {o.map((v, i) => (
                  <td key={table.col[i + 1] ?? i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {note}
    </section>
  );
}
