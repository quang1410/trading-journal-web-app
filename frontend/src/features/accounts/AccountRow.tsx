import { useId } from "react";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";
import { formatPercent, formatRatio, percentFromFraction } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { cn } from "@/lib/utils";
import { AccountFormDialog } from "./AccountFormDialog";
import { CashFlowSheet } from "./CashFlowSheet";
import { ChallengeBlock } from "./ChallengeBlock";
import { ChallengeMenu } from "./ChallengeMenu";
import { accountChipIndex, accountLabel, accountSubLabel } from "./identity";
import type { Account } from "./types";

/**
 * Một hàng của sổ tài khoản (spec §6.2).
 *
 * Hàng quỹ ba cột: danh tính | thanh vòng + luật | số dư + nút. Hàng cá nhân
 * hai cột — không có cột giữa, không vẽ khung rỗng cho nó (nguyên tắc 4).
 *
 * Số cột theo bề rộng của danh sách (container query trên <ul>), ba nấc:
 *   < @3xl   xếp dọc theo đúng thứ tự trên
 *   @3xl     danh tính | số dư + nút; khối thi xuống dòng riêng, trải hết bề
 *            ngang — ba cột ở bề rộng này bóp thanh đo còn vài chục pixel
 *   @6xl     đủ ba cột
 */
export function AccountRow({
  account,
  stats,
  active,
  onView,
}: {
  account: Account;
  stats: Stats | undefined;
  active: boolean;
  onView: () => void;
}) {
  const { t, locale } = useI18n();
  const nameId = useId();
  const isProp = account.account_type === "prop";
  const sub = accountSubLabel(account);

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "grid gap-4 p-4 @3xl:items-start @3xl:gap-x-6",
        // Cột phải RỘNG CỐ ĐỊNH, không auto: auto co theo số nút của từng hàng
        // (hàng đang xem không có "Xem", hàng thất bại không có ⋯), làm thanh
        // vòng của mỗi hàng bắt đầu ở một chỗ khác — sổ cái mất cột.
        "@3xl:grid-cols-[minmax(0,1fr)_21rem]",
        isProp && "@6xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_21rem]",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span className="account-chip mt-1" data-chip={accountChipIndex(account.id)} aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 id={nameId} className="truncate text-[length:var(--text-md)] font-semibold">
              {accountLabel(account)}
            </h3>
            {active && (
              <span className="shrink-0 rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
                {t("accounts.viewing")}
              </span>
            )}
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {sub && <span className="num">{sub}</span>}
            {isProp && account.prop_firm && <span>{account.prop_firm}</span>}
            <span>{account.timezone}</span>
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{t("accounts.risk")}</dt>
              {/* Một chuỗi duy nhất, không phải {bieu_thuc}% — tách làm hai text
                  node thì getByText("1%") không khớp được. formatRatio để
                  dấu thập phân theo locale như mọi con số khác trên hàng:
                  "0,5%" chứ không phải "0.5%" cạnh "4,20%". */}
              <dd className="num">{`${formatRatio(percentFromFraction(account.risk_per_trade), 2, locale)}%`}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{t("accounts.oneR")}</dt>
              <dd>
                <MoneyText value={account.one_r} currency={account.currency} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {isProp && (
        <div className="min-w-0 @3xl:col-span-2 @3xl:row-start-2 @6xl:col-span-1 @6xl:col-start-2 @6xl:row-start-1">
          <ChallengeBlock account={account} challenge={stats?.challenge ?? null} />
        </div>
      )}

      <div className="flex flex-col gap-3 @3xl:col-start-2 @3xl:row-start-1 @3xl:items-end @6xl:col-start-3">
        <Balance account={account} stats={stats} />
        <div className="flex flex-wrap gap-2 @3xl:justify-end">
          {!active && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("accounts.viewLabel", { name: accountLabel(account) })}
              onClick={onView}
            >
              {t("accounts.view")}
            </Button>
          )}
          <CashFlowSheet account={account} />
          <AccountFormDialog account={account} />
          {isProp && <ChallengeMenu account={account} />}
        </div>
      </div>
    </article>
  );
}

/**
 * Số dư thật + lãi/lỗ trên vốn ban đầu. Stats chưa về hoặc lỗi thì vẽ vạch
 * ngang: hàng vẫn dùng được (sửa, nạp/rút), chỉ thiếu con số.
 */
function Balance({ account, stats }: { account: Account; stats: Stats | undefined }) {
  const { t, locale } = useI18n();
  const ret = stats?.net_return_pct ?? null;
  const tone = ret ? signAndColor(ret) : null;

  return (
    <div role="group" aria-label={t("accounts.balance")} className="flex flex-col @3xl:items-end">
      <span className="text-[length:var(--text-md)] font-medium">
        {stats ? (
          <MoneyText value={stats.current_balance} currency={account.currency} />
        ) : (
          <span className="text-muted-foreground">{t("common.noValue")}</span>
        )}
      </span>
      {ret && tone && <span className={cn("num text-xs", tone.colorClass)}>{`${tone.sign}${formatPercent(ret, 2, locale)}`}</span>}
    </div>
  );
}
