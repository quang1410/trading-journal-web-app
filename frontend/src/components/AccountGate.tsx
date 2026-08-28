import type { ReactNode } from "react";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loading } from "@/components/Loading";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";

/**
 * Cổng "đã có tài khoản chưa" đứng trước mọi trang cần account.id.
 *
 * Ba trang từng chép nguyên khối này. Nó phải là component chứ không phải hook
 * vì mọi hook bên trong trang đều cần `account.id`: gọi chúng rồi mới return
 * sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì số lượng hook
 * đổi giữa các lần render. Truyền `account` qua render prop thì trang con chỉ
 * dựng khi đã chắc chắn có account, và quy tắc hook được giữ bằng HÌNH DẠNG
 * chứ không bằng lời dặn trong comment.
 */
export function AccountGate({
  row = 1,
  children,
}: {
  /** Số vạch skeleton, xấp xỉ số dòng thật của trang. */
  row?: number;
  children: (account: Account) => ReactNode;
}) {
  const { account, isPending } = useActiveAccount();
  const { t } = useI18n();

  if (isPending) return <Loading row={row} />;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        {t("trades.noAccount")}{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          {t("trades.createAccount")}
        </Link>{" "}
        {t("trades.startJournal")}
      </p>
    );
  }

  return <>{children(account)}</>;
}

/**
 * Khối báo lỗi của một trang — anh em còn thiếu của Loading.
 *
 * Loading đã gói `role="status"` cho nhánh ĐANG TẢI, nhưng nhánh LỖI thì bốn
 * trang vẫn tự dựng Alert + errorMessage y hệt nhau. Gói nốt thì cả ba trạng
 * thái của một trang đều có đúng một bản.
 */
export function ErrorBlock({ error }: { error: unknown }) {
  const { locale, t } = useI18n();
  return (
    <Alert variant="destructive">
      <AlertDescription>{errorMessage(error, locale, t)}</AlertDescription>
    </Alert>
  );
}
