import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
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

export function TrashPage() {
  const { account, isPending } = useActiveAccount();

  if (isPending) return <p role="status">Đang tải…</p>;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        Chưa có tài khoản giao dịch nào.{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          Tạo tài khoản giao dịch
        </Link>{" "}
        để bắt đầu ghi nhật ký.
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

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Thùng rác</h1>
        <Link to="/trades" className="text-sm text-muted-foreground underline underline-offset-4">
          Về nhật ký lệnh
        </Link>
      </header>

      {rac.isPending && <p role="status">Đang tải…</p>}
      {rac.error && (
        <Alert variant="destructive">
          <AlertDescription>{rac.error.message}</AlertDescription>
        </Alert>
      )}

      {rac.data && rac.data.length === 0 && (
        <p className="text-muted-foreground">Thùng rác trống.</p>
      )}

      {rac.data && rac.data.length > 0 && (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>Thời điểm</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Chiều</TableHead>
                <TableHead>Lãi/lỗ</TableHead>
                <TableHead>Phí</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rac.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="num">{t.stt}</TableCell>
                  <TableCell>{formatInstant(t.entered_at, account.timezone)}</TableCell>
                  <TableCell className="font-medium">{t.symbol}</TableCell>
                  <TableCell>{t.direction}</TableCell>
                  <TableCell className="num">{formatMoney(t.profit)}</TableCell>
                  <TableCell className="num">{formatMoney(t.fee)}</TableCell>
                  <TableCell>{t.setup}</TableCell>
                  <TableCell className="max-w-64 truncate">{t.notes}</TableCell>
                  <TableCell>
                    {/* Khôi phục KHÔNG hỏi lại: nó chính là thao tác hoàn tác. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Khôi phục lệnh ${t.stt}`}
                      onClick={() => void khoiPhuc.mutateAsync(t.id)}
                    >
                      Khôi phục
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
