import { MoveDownRightIcon, MoveUpRightIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { formatMoney, formatPrice } from "@/lib/decimal";
import { useMetaEnums } from "@/features/meta/hooks";
import type { ImportPreviewRow } from "./types";

/**
 * Vài dòng đầu ĐÃ PARSE, để đối chiếu với file trước khi ghi.
 *
 * Vì sao là dữ liệu đã parse chứ không phải nội dung thô của file: người dùng
 * đã nhìn file trong Excel rồi, cái họ chưa biết là backend HIỂU nó thế nào.
 * Ngày "09/06/2026" đọc thành 9 tháng 6 hay 6 tháng 9, "BUY" có thành Long
 * không, ô tiền có dấu phẩy ngăn nghìn có ra đúng số không — cả ba chỉ lộ ra ở
 * đây, và lộ ra TRƯỚC khi có gì được ghi.
 *
 * Cột hiển thị là tập con: ngày, mã, chiều, giá, khối lượng, tiền. Setup,
 * Notes và bốn cột chấm điểm cố ý vắng mặt — chúng không phải chỗ dữ liệu bị
 * đọc sai, và thêm vào thì bảng tràn ngang trên màn hẹp.
 */
export function PreviewDataTable({
  rows,
  totalValid,
  currency,
}: {
  rows: ImportPreviewRow[];
  /** Tổng số dòng đọc được, để nói còn bao nhiêu dòng không hiện ở đây. */
  totalValid: number;
  currency: string;
}) {
  const { locale, t } = useI18n();
  const { data: enums } = useMetaEnums();
  const remaining = totalValid - rows.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="eyebrow">{t("import.previewTitle")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("import.previewHint", { shown: String(rows.length) })}
        </p>
      </div>

      <div className="scroll-hairline overflow-x-auto rounded-md border border-[var(--border-default)]">
        <Table>
          {/* Xem chú thích ở PreviewTable: hai bảng cạnh nhau cần hai tên. */}
          <caption className="sr-only">{t("import.previewTitle")}</caption>
          <TableHeader className="bg-[var(--surface-sunken)]">
            <TableRow>
              <TableHead className="w-28">{t("import.colDay")}</TableHead>
              <TableHead>{t("import.colSymbol")}</TableHead>
              <TableHead>{t("import.colDirection")}</TableHead>
              <TableHead className="text-right">{t("import.colEntry")}</TableHead>
              <TableHead className="text-right">{t("import.colExit")}</TableHead>
              <TableHead className="text-right">{t("import.colVolume")}</TableHead>
              <TableHead className="text-right">{t("import.colProfit")}</TableHead>
              <TableHead className="text-right">{t("import.colFee")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.day}-${r.symbol}-${i}`}>
                <TableCell className="num text-xs">{r.day}</TableCell>
                <TableCell className="num font-medium">{r.symbol}</TableCell>
                <TableCell>
                  {/*
                    Mũi tên chứ không phải màu, cùng quy ước với bảng lệnh ở
                    /trades: chiều lệnh không phải lãi hay lỗ, tô nó bằng màu
                    lãi/lỗ là dạy người đọc một quy ước sai.
                  */}
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Arrow direction={r.direction} />
                    {enumLabel("direction", r.direction, locale, enums?.directions)}
                  </span>
                </TableCell>
                <Price value={r.entry} locale={locale} noValue={t("common.noValue")} />
                <Price value={r.exit} locale={locale} noValue={t("common.noValue")} />
                <Price value={r.volume} locale={locale} noValue={t("common.noValue")} />
                <TableCell className="num text-right font-medium">
                  {formatMoney(r.profit, currency, locale)}
                </TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {formatMoney(r.fee, undefined, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {remaining > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("import.previewMoreRows", { n: String(remaining) })}
        </p>
      )}
    </div>
  );
}

/**
 * Ô giá. Hai bất biến, cả hai đều về việc KHÔNG BỊA SỐ.
 *
 * `null` là CHƯA NHẬP, hiện dấu gạch chứ không phải 0 — cùng bất biến mà
 * ParseMoneyPtr giữ ở backend. Gộp "để trống" với "bằng 0" là bịa ra một con
 * số người dùng chưa từng gõ.
 *
 * Và dùng formatPrice chứ KHÔNG dùng formatMoney: giá không phải tiền. Cắt
 * cứng 2 chữ số biến entry 1.08420 và exit 1.08110 thành hai ô "1,08" giống
 * hệt nhau. Preview mà bóp méo giá thì hỏng đúng việc nó sinh ra để làm.
 */
function Price({
  value,
  locale,
  noValue,
}: {
  value: string | null;
  locale: "vi" | "en";
  noValue: string;
}) {
  return (
    <TableCell className="num text-right text-muted-foreground">
      {value === null ? noValue : formatPrice(value, locale)}
    </TableCell>
  );
}

/** Hướng mũi tên nói chiều lệnh mà không mượn màu lãi/lỗ. */
function Arrow({ direction }: { direction: string }) {
  const down = direction.slice(0, 1).toLowerCase() === "s";
  const Icon = down ? MoveDownRightIcon : MoveUpRightIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}
