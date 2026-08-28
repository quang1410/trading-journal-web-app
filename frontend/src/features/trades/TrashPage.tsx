import { AccountGate, ErrorBlock } from "@/components/AccountGate";
import { Loading } from "@/components/Loading";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { MoveDownRightIcon, MoveUpRightIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInstant } from "@/lib/datetime";
import { formatMoney } from "@/lib/decimal";
import type { Account } from "@/features/accounts/types";
import { useRestoreTrade, useTrash } from "./hooks";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { useMetaEnums } from "@/features/meta/hooks";

export function TrashPage() {
  return <AccountGate>{(account) => <ThungRac account={account} />}</AccountGate>;
}

/**
 * Bảng ở đây CHỈ có trường input — mười cột của deletedTradeDTO.
 *
 * Không có cột lũy kế, điểm hay phân loại, và đó không phải chuyện bỏ sót:
 * lệnh đã xoá nằm ngoài dãy lũy kế nên những con số ấy không tồn tại. Backend
 * cố ý không trả về chúng, và kiểu DeletedTrade cũng không khai chúng — thêm
 * một cột như vậy là lỗi biên dịch trước khi kịp thành số 0 giả trên màn hình.
 */
function ThungRac({ account }: { account: Account }) {
  const rac = useTrash(account.id);
  const restore = useRestoreTrade(account.id);
  const { locale, t: translate } = useI18n();
  const { data: enums } = useMetaEnums();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">{account.code}</span>
          <h1 className="text-xl font-semibold tracking-tight">{translate("trash.title")}</h1>
        </div>
        <Link
          to="/trades"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {translate("trash.backToJournal")}
        </Link>
      </header>

      {rac.isPending && <Loading row={4} />}
      {rac.error && (
        <ErrorBlock error={rac.error} />
      )}

      {rac.data && rac.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">{translate("trash.empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {translate("trash.emptyHint")}
          </p>
          <Button asChild variant="outline">
            <Link to="/trades">{translate("trash.backToJournal")}</Link>
          </Button>
        </div>
      )}

      {rac.data && rac.data.length > 0 && (
        <div className="table-sticky overflow-hidden rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-right">{translate("table.stt")}</TableHead>
                <TableHead>{translate("table.enteredAt")}</TableHead>
                <TableHead>{translate("accounts.code")}</TableHead>
                <TableHead>{translate("table.direction")}</TableHead>
                <TableHead className="w-[104px] text-right">{translate("table.profit")}</TableHead>
                <TableHead className="w-[72px] text-right">{translate("table.fee")}</TableHead>
                <TableHead>{translate("tradeForm.setup")}</TableHead>
                <TableHead>{translate("tradeForm.notes")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rac.data.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="num text-right text-muted-foreground">{trade.stt}</TableCell>
                  <TableCell className="num text-xs">
                    {formatInstant(trade.entered_at, account.timezone, locale)}
                  </TableCell>
                  <TableCell className="num font-medium">{trade.symbol}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Arrow direction={trade.direction} />
                      {enumLabel("direction", trade.direction, locale, enums?.directions)}
                    </span>
                  </TableCell>
                  <TableCell className="num text-right">{formatMoney(trade.profit, undefined, locale)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatMoney(trade.fee, undefined, locale)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{trade.setup}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                    {trade.notes || translate("common.noValue")}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Khôi phục KHÔNG hỏi lại: nó chính là thao tác hoàn tác. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={translate("trash.restoreLabel", { stt: trade.stt })}
                      onClick={() => void restore.mutateAsync(trade.id)}
                    >
                      {translate("trash.restore")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Arrow({ direction }: { direction: string }) {
  const down = direction.slice(0, 1).toLowerCase() === "s";
  const Icon = down ? MoveDownRightIcon : MoveUpRightIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}
