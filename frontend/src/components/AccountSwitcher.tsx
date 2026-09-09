import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/decimal";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import { accountChipIndex, accountLabel, accountSubLabel } from "@/features/accounts/identity";
import type { Account } from "@/features/accounts/types";
import { useI18n } from "@/i18n";
import { useSidebar } from "@/components/ui/sidebar";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  const { t, locale } = useI18n();
  const { state } = useSidebar();
  if (accounts.length === 0) return null;

  const collapsed = state === "collapsed";

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
          className={
            collapsed
              ? "account-trigger-collapsed h-9 w-9 justify-center overflow-hidden px-0 [&>svg:last-of-type]:hidden"
              : "account-trigger h-auto w-full py-1.5"
          }
          aria-label={
            account ? `${t("nav.viewingAccount")}: ${accountLabel(account)}` : t("nav.chooseAccount")
          }
          title={collapsed ? accountLabel(account) : undefined}
        >
          {/* Không dùng SelectValue: nó chỉ chép lại phần text của option đang
              chọn, mà option ở đây là hai dòng + con số tiền — dồn tất cả vào ô
              trigger một dòng thì thành một chuỗi dính liền. Vẽ lại từ account
              đang chọn cho phép ô trigger có bố cục riêng, gọn hơn dòng option. */}
          {account ? (
            collapsed ? (
              <AccountChip account={account} />
            ) : (
              <span className="account-identity">
                <AccountChip account={account} />
                <span className="account-identity-text">
                  <span className="account-name">{accountLabel(account)}</span>
                  {accountSubLabel(account) && (
                    <span className="account-code num">{accountSubLabel(account)}</span>
                  )}
                </span>
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{t("nav.chooseAccount")}</span>
          )}
        </SelectTrigger>
        <SelectContent className="account-list">
          {accounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)} className="account-option">
              <span className="account-identity">
                <AccountChip account={a} />
                <span className="account-identity-text">
                  <span className="account-name">{accountLabel(a)}</span>
                  {/* CHỈ mã, không kèm vốn. Vốn của tài khoản đang chọn đã nằm
                      ở dòng "Vốn · 1R" ngay dưới ô này, nên in lại trên từng
                      dòng là một con số to tranh chỗ với đúng thứ cần đọc —
                      tên và mã. Mã đã đủ để phân biệt hai tài khoản cùng tên. */}
                  {accountSubLabel(a) && (
                    <span className="account-code num">{accountSubLabel(a)}</span>
                  )}
                </span>
              </span>
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

/**
 * Dấu màu của tài khoản.
 *
 * Đây là thứ giúp nhận ra tài khoản mà KHÔNG phải đọc: mã tài khoản thật của
 * sàn là dãy số gần trùng nhau ("455981" cạnh "455982"), đọc tới chữ số cuối
 * mới phân biệt được. Một ô màu cố định cho mỗi tài khoản thì nhận ra trước cả
 * khi kịp đọc.
 *
 * Màu suy ra từ id nên nó BỀN: cùng một tài khoản luôn ra cùng một màu ở mọi
 * phiên, mọi máy, và không đổi khi thêm/xoá tài khoản khác — nếu lấy theo vị
 * trí trong danh sách thì xoá một tài khoản là đổi màu toàn bộ phần còn lại,
 * phá đúng cái ký ức mà dấu màu này dựng lên.
 */
function AccountChip({ account }: { account: Account }) {
  return (
    <span
      aria-hidden
      className="account-chip"
      data-testid="account-chip"
      data-chip={accountChipIndex(account.id)}
    />
  );
}
