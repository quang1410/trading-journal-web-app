import { ErrorBlock } from "@/components/AccountGate";
import { Loading } from "@/components/Loading";
import { MoneyText } from "@/components/MoneyText";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { percentFromFraction } from "@/lib/decimal";
import { useActiveAccount } from "./activeAccount";
import { AccountFormDialog } from "./AccountFormDialog";
import { CashFlowPanel } from "./CashFlowPanel";
import { useAccounts } from "./hooks";
import { useI18n } from "@/i18n";

export function AccountsPage() {
  const { data, isPending, error } = useAccounts();
  const { account: accountDangChon } = useActiveAccount();
  const { t } = useI18n();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
         <h1 className="text-xl font-semibold">{t("accounts.title")}</h1>
        <AccountFormDialog />
      </header>

      {isPending && <Loading row={3} />}
      {error && (
        <ErrorBlock error={error} />
      )}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">
           {t("accounts.empty")}
        </p>
      )}

      {data && data.length > 0 && (
        <div className="scroll-hairline overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                 <TableHead>{t("accounts.code")}</TableHead>
                 <TableHead>{t("accounts.name")}</TableHead>
                 <TableHead>{t("accounts.initialBalance")}</TableHead>
                 <TableHead>{t("accounts.risk")}</TableHead>
                 <TableHead>{t("accounts.oneR")}</TableHead>
                 <TableHead>{t("accounts.timezone")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>
                    <MoneyText value={a.initial_balance} currency={a.currency} />
                  </TableCell>
                  {/* Một chuỗi duy nhất, không phải {bieu_thuc}% — tách làm hai text node
                      thì getByText("1%") không khớp được. */}
                  <TableCell>
                    <span className="num">{`${percentFromFraction(a.risk_per_trade)}%`}</span>
                  </TableCell>
                  <TableCell>
                    <MoneyText value={a.one_r} currency={a.currency} />
                  </TableCell>
                  <TableCell>{a.timezone}</TableCell>
                  <TableCell>
                    <AccountFormDialog account={a} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {accountDangChon && <CashFlowPanel account={accountDangChon} />}
    </section>
  );
}
