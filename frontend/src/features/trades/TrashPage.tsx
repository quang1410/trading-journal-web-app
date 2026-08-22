import { DangTai } from "@/components/DangTai";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { useRestoreTrade, useTrash } from "./hooks";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { useMetaEnums } from "@/features/meta/hooks";
import { errorMessage } from "@/i18n/errors";

export function TrashPage() {
  const { account, isPending } = useActiveAccount();
  const { t } = useI18n();

  if (isPending) return <DangTai dong={1} />;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        {t("trades.noAccount")} {" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          {t("trades.createAccount")}
        </Link>{" "}
        {t("trades.startJournal")}
      </p>
    );
  }

  return <ThungRac account={account} />;
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
  const khoiPhuc = useRestoreTrade(account.id);
  const { locale, t: dich } = useI18n();
  const { data: enums } = useMetaEnums();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">{account.code}</span>
          <h1 className="text-xl font-semibold tracking-tight">{dich("trash.title")}</h1>
        </div>
        <Link
          to="/trades"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {dich("trash.backToJournal")}
        </Link>
      </header>

      {rac.isPending && <DangTai dong={4} />}
      {rac.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(rac.error, locale, dich)}
          </AlertDescription>
        </Alert>
      )}

      {rac.data && rac.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">{dich("trash.empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {dich("trash.emptyHint")}
          </p>
          <Button asChild variant="outline">
            <Link to="/trades">{dich("trash.backToJournal")}</Link>
          </Button>
        </div>
      )}

      {rac.data && rac.data.length > 0 && (
        <div className="table-sticky overflow-hidden rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-right">{dich("table.stt")}</TableHead>
                <TableHead>{dich("table.enteredAt")}</TableHead>
                <TableHead>{dich("accounts.code")}</TableHead>
                <TableHead>{dich("table.direction")}</TableHead>
                <TableHead className="w-[104px] text-right">{dich("table.profit")}</TableHead>
                <TableHead className="w-[72px] text-right">{dich("table.fee")}</TableHead>
                <TableHead>{dich("tradeForm.setup")}</TableHead>
                <TableHead>{dich("tradeForm.notes")}</TableHead>
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
                      <MuiTen direction={trade.direction} />
                      {enumLabel("direction", trade.direction, locale, enums?.directions)}
                    </span>
                  </TableCell>
                  <TableCell className="num text-right">{formatMoney(trade.profit, undefined, locale)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatMoney(trade.fee, undefined, locale)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{trade.setup}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                    {trade.notes || dich("common.noValue")}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Khôi phục KHÔNG hỏi lại: nó chính là thao tác hoàn tác. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={dich("trash.restoreLabel", { stt: trade.stt })}
                      onClick={() => void khoiPhuc.mutateAsync(trade.id)}
                    >
                      {dich("trash.restore")}
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

function MuiTen({ direction }: { direction: string }) {
  const xuong = direction.slice(0, 1).toLowerCase() === "s";
  const Icon = xuong ? MoveDownRightIcon : MoveUpRightIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}
