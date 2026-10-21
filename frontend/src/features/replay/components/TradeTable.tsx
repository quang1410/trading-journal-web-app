import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { fmtLocal, toLocal } from "../engine/time";
import { useReplay } from "../store/context";
import { formatPrice, formatUsd } from "./format";
import { REASON_LABEL } from "./labels";

/** Danh sách lệnh đã đóng của phiên, lệnh mới nhất ở trên. */
export function TradeTable() {
  const { t } = useI18n();
  const trades = useReplay((s) => s.trades);
  const zone = useReplay((s) => s.zone);
  const cols = ["#", t("replay.table.side"), t("replay.table.entryTime"), t("replay.table.entry"), t("replay.table.exitTime"), t("replay.table.exit"), t("replay.table.qty"), t("replay.table.points"), t("replay.table.pnl"), "R", t("replay.table.reason")];
  return (
    <div className="max-h-44 overflow-auto border-t border-border bg-surface-base">
      <Table aria-label={t("replay.table.label")}>
        <TableHeader className="sticky top-0 z-[1] bg-surface-base">
          <TableRow>
            {cols.map((c, i) => (
              <TableHead key={i} className={cn("h-8 text-xs font-medium text-text-muted", i > 1 && "text-right")}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="num text-xs">
          {trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols.length} className="py-3 text-center font-sans text-text-muted">
                {t("replay.table.empty")}
              </TableCell>
            </TableRow>
          ) : (
            trades
              .map((tr, i) => (
                <TableRow key={`${tr.t0}-${i}`}>
                  <TableCell className="py-1">{i + 1}</TableCell>
                  <TableCell className={cn("py-1 font-sans font-medium", tr.side > 0 ? "text-profit" : "text-loss")}>
                    {tr.side > 0 ? "Long" : "Short"} {tr.contract}
                  </TableCell>
                  <TableCell className="py-1 text-right">{fmtLocal(toLocal(tr.t0, zone))}</TableCell>
                  <TableCell className="py-1 text-right">{formatPrice(tr.entry)}</TableCell>
                  <TableCell className="py-1 text-right">{fmtLocal(toLocal(tr.t1, zone))}</TableCell>
                  <TableCell className="py-1 text-right">{formatPrice(tr.exit)}</TableCell>
                  <TableCell className="py-1 text-right">{tr.qty}</TableCell>
                  <TableCell className="py-1 text-right">{tr.pts.toFixed(2)}</TableCell>
                  <TableCell className={cn("py-1 text-right", tr.pnl >= 0 ? "text-profit" : "text-loss")}>{formatUsd(tr.pnl)}</TableCell>
                  <TableCell className="py-1 text-right">{tr.r == null ? "—" : tr.r.toFixed(2)}</TableCell>
                  <TableCell className="py-1 text-right font-sans">{t(REASON_LABEL[tr.reason])}</TableCell>
                </TableRow>
              ))
              .reverse()
          )}
        </TableBody>
      </Table>
    </div>
  );
}
