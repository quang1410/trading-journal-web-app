import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n";
import type { ImportRowError } from "./types";

/** Số dòng lỗi hiển thị tối đa — quá số này thì file cần sửa hàng loạt chứ
 *  không sửa từng ô, và một danh sách 500 dòng thì không ai đọc. */
const MAX_VISIBLE = 50;

export function PreviewTable({ errors }: { errors: ImportRowError[] }) {
  const { t } = useI18n();
  const visible = errors.slice(0, MAX_VISIBLE);
  const remaining = errors.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="eyebrow text-[var(--status-error)]">{t("import.errorsTitle")}</h3>
      <div className="scroll-hairline max-h-80 overflow-auto rounded-md border border-[var(--border-default)]">
        <Table>
          {/* Trang có HAI bảng cạnh nhau — dòng cần sửa và dữ liệu sẽ ghi.
              Caption sr-only đặt tên cho từng bảng, để trình đọc màn hình
              phân biệt được chúng thay vì gặp "bảng, bảng". */}
          <caption className="sr-only">{t("import.errorsTitle")}</caption>
          {/* Header dính khi cuộn: danh sách lỗi dài thì "Dòng / Cột / Vấn đề"
              phải còn nhìn thấy, nếu không ba cột số trở thành ba cột số vô danh. */}
          <TableHeader className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
            <TableRow>
              <TableHead className="w-16">{t("import.colLine")}</TableHead>
              <TableHead className="w-44">{t("import.colColumn")}</TableHead>
              <TableHead>{t("import.colProblem")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e, i) => (
              <TableRow key={`${e.line}-${e.column}-${i}`}>
                <TableCell className="num text-[var(--text-muted)]">{e.line}</TableCell>
                {/* Tên cột là chuỗi lấy nguyên văn từ file người dùng — đặt ở
                    mono để phân biệt với câu chữ mô tả lỗi bên cạnh. */}
                <TableCell className="num text-xs">{e.column || t("common.noValue")}</TableCell>
                <TableCell className="text-[var(--status-error)]">{e.msg}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("common.more")}: <span className="num">{remaining}</span>
        </p>
      )}
    </div>
  );
}
