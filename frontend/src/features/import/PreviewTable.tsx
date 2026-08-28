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
const MAX_HIEN_THI = 50;

export function PreviewTable({ errors }: { errors: ImportRowError[] }) {
  const { t } = useI18n();
  const hienThi = errors.slice(0, MAX_HIEN_THI);
  const conLai = errors.length - hienThi.length;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--status-error)]">
        {t("import.errorsTitle")}
      </h2>
      <div className="overflow-x-auto rounded-md border border-[var(--border-default)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("import.colLine")}</TableHead>
              <TableHead className="w-48">{t("import.colColumn")}</TableHead>
              <TableHead>{t("import.colProblem")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hienThi.map((e, i) => (
              <TableRow key={`${e.line}-${e.column}-${i}`}>
                <TableCell className="font-mono tabular-nums">{e.line}</TableCell>
                <TableCell>{e.column || t("common.noValue")}</TableCell>
                <TableCell className="text-[var(--status-error)]">{e.msg}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {conLai > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("common.more")}: {conLai}
        </p>
      )}
    </div>
  );
}
