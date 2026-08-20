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

export function AccountsPage() {
  const { data, isPending, error } = useAccounts();
  const { account: accountDangChon } = useActiveAccount();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Tài khoản giao dịch</h1>
        <AccountFormDialog />
      </header>

      {isPending && <p role="status">Đang tải…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">
          Chưa có tài khoản giao dịch nào. Tạo một tài khoản để bắt đầu ghi nhật ký.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Vốn ban đầu</TableHead>
                <TableHead>Rủi ro</TableHead>
                <TableHead>1R</TableHead>
                <TableHead>Múi giờ</TableHead>
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
