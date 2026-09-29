import { useId } from "react";
import { useSearchParams } from "react-router";
import { ErrorBlock } from "@/components/AccountGate";
import { Loading } from "@/components/Loading";
import { Segmented } from "@/components/ui/segmented";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";
import { useActiveAccount } from "./activeAccount";
import { AccountFormDialog } from "./AccountFormDialog";
import { AccountRow } from "./AccountRow";
import { readTypeFilter, splitByType, TYPE_FILTERS, type TypeFilter } from "./challenge";
import { useAccounts } from "./hooks";
import type { Account } from "./types";
import { useAccountStats } from "./useAccountStats";

const FILTER_KEY = {
  all: "accounts.filterAll",
  prop: "accounts.filterProp",
  personal: "accounts.filterPersonal",
} as const;

export function AccountsPage() {
  const { data, isPending, error } = useAccounts();
  const { account: active, choose } = useActiveAccount();
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();

  const accounts = data ?? [];
  const stats = useAccountStats(accounts);
  const { prop, personal } = splitByType(accounts);

  // Bộ lọc chỉ có nghĩa khi có cả hai loại. Có một loại mà vẫn hiện nó là
  // bày ra ba nút, hai trong đó cho cùng một kết quả.
  const showFilter = prop.length > 0 && personal.length > 0;
  const filter: TypeFilter = showFilter ? readTypeFilter(sp) : "all";
  const count: Record<TypeFilter, number> = { all: accounts.length, prop: prop.length, personal: personal.length };

  function setFilter(v: TypeFilter) {
    const next = new URLSearchParams(sp);
    if (v === "all") next.delete("type");
    else next.set("type", v);
    setSp(next, { replace: true });
  }

  const groupProps = { stats, activeId: active?.id ?? null, onView: choose };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("accounts.title")}</h1>
        <AccountFormDialog />
      </header>

      {isPending && <Loading row={3} />}
      {error && <ErrorBlock error={error} />}
      {data && data.length === 0 && <p className="text-muted-foreground">{t("accounts.empty")}</p>}

      {showFilter && (
        <Segmented
          className="w-auto self-start"
          label={t("accounts.filterLabel")}
          value={filter}
          onChange={setFilter}
          options={TYPE_FILTERS}
          renderOption={(o) => t(FILTER_KEY[o], { n: count[o] })}
          optionClassName={() => "whitespace-nowrap px-3"}
        />
      )}

      {prop.length > 0 && filter !== "personal" && (
        <AccountGroup title={t("accounts.groupProp")} accounts={prop} {...groupProps} />
      )}
      {personal.length > 0 && filter !== "prop" && (
        <AccountGroup title={t("accounts.groupPersonal")} accounts={personal} {...groupProps} />
      )}
    </section>
  );
}

/**
 * Một nhóm = MỘT khung viền, các account là hàng ngăn bằng vạch — trang sổ
 * cái, không phải lưới thẻ (spec §6.3 nguyên tắc 2). Theme tắt shadow nên
 * phân tầng bằng border + bg-card trên nền trang.
 */
function AccountGroup({
  title,
  accounts,
  stats,
  activeId,
  onView,
}: {
  title: string;
  accounts: Account[];
  stats: Map<number, Stats | undefined>;
  activeId: number | null;
  onView: (id: number) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="flex items-baseline gap-2 text-[length:var(--text-md)] font-semibold">
        {title}
        <span className="num text-sm font-normal text-muted-foreground">{accounts.length}</span>
      </h2>
      {/* @container: hàng đổi số cột theo bề rộng CỦA DANH SÁCH, không theo
          viewport — sidebar ăn mất ~210px, nên md: của viewport (768px) chỉ
          còn ~510px cho ba cột và thanh vòng đè chữ lên nhau. */}
      <ul className="@container divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {accounts.map((a) => (
          <li key={a.id}>
            <AccountRow account={a} stats={stats.get(a.id)} active={a.id === activeId} onView={() => onView(a.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
