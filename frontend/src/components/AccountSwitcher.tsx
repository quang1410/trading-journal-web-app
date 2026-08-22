import { Label } from "@/components/ui/label";
import { WalletIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/decimal";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import { useI18n } from "@/i18n";
import { useSidebar } from "@/components/ui/sidebar";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  const { t, locale } = useI18n();
  const { state } = useSidebar();
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="account-switcher" className="eyebrow sidebar-label px-1">
        {t("nav.viewingAccount")}
      </Label>
      {/* Giá trị của Radix Select là CHUỖI, còn id account là số. Đổi qua lại
          ở đúng ranh giới này, và dùng +v vì chuỗi đó là id chính mình vừa
          phát ra ở thuộc tính value bên dưới, không phải dữ liệu lạ. */}
      <Select value={account ? String(account.id) : ""} onValueChange={(v) => choose(+v)}>
        <SelectTrigger
          id="account-switcher"
          className={state === "collapsed" ? "w-10 justify-center overflow-hidden px-0 font-medium [&>svg:last-of-type]:hidden" : "w-full font-medium"}
          aria-label={state === "collapsed" ? `${t("nav.viewingAccount")}: ${account?.code}` : undefined}
          title={state === "collapsed" ? account?.code : undefined}
        >
          {state === "collapsed" ? (
            <WalletIcon aria-hidden className="size-4" />
          ) : (
            <SelectValue placeholder={t("nav.chooseAccount")} />
          )}
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Vốn và 1R đi kèm ngay dưới ô chọn, vì cả hai là hằng số của tài khoản
          mà người đọc phải quy chiếu liên tục: mọi con số R trong nhật ký đều
          là bội của 1R này. Bắt người ta mở trang Tài khoản để tra lại là bắt
          rời khỏi chỗ đang cần nó. */}
      {account && (
        <p className="sidebar-label px-1 text-xs text-muted-foreground">
           {t("nav.capital")} <span className="num">{formatMoney(account.initial_balance, undefined, locale)}</span> · 1R{" "}
           <span className="num">{formatMoney(account.one_r, account.currency, locale)}</span>
        </p>
      )}
    </div>
  );
}
