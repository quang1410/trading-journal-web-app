import { ErrorBlock } from "@/components/AccountGate";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { useI18n } from "@/i18n";
import type { Account } from "@/features/accounts/types";
import { periodIntensities } from "@/features/dashboard/prepare";
import { PeriodCard } from "./PeriodCard";
import { usePeriodNotes, usePeriods } from "./periodHooks";
import type { PeriodKind, PeriodStat } from "./periodTypes";
import type { TradeFilter } from "./filters";

/**
 * Danh sách thẻ của tab Ngày hoặc tab Tuần.
 *
 * Hai query song song, KHÔNG lồng nhau: số liệu kỳ và ghi chú kỳ không phụ
 * thuộc nhau, nên chờ tuần tự chỉ làm màn hình đứng lâu gấp đôi. Thẻ vẽ được
 * ngay khi có số liệu; ghi chú về sau thì nút đổi nhãn.
 *
 * Lỗi của ghi chú KHÔNG chặn thẻ: mất ghi chú là mất một dòng phụ, còn mất thẻ
 * là mất cả màn hình. Nút vẫn bấm được và vẫn lưu được.
 */
export function PeriodList({
  account,
  period,
  filter,
  hasFilter,
}: {
  account: Account;
  period: PeriodKind;
  filter: TradeFilter;
  hasFilter: boolean;
}) {
  const { t, locale } = useI18n();
  const stats = usePeriods(account.id, filter, period);
  const notes = usePeriodNotes(account.id, period);

  if (stats.isPending) return <Loading row={4} />;
  if (stats.error) return <ErrorBlock error={stats.error} />;

  const rows = stats.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        title={hasFilter ? t("periods.noMatch") : t("periods.empty")}
        hint={hasFilter ? t("periods.noMatchHint") : t("periods.emptyHint")}
      />
    );
  }

  const byKey = new Map((notes.data ?? []).map((n) => [n.period_key, n]));

  // Độ đậm của dải màu, tính so với kỳ mạnh nhất đang hiện. Phép đổi
  // chuỗi→số nằm trong prepare.ts, không rải ra component.
  const intensities = periodIntensities(rows.map((r) => r.kpi.net_profit));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((stat, i) => (
        <PeriodCard
          key={stat.key}
          accountId={account.id}
          stat={stat}
          note={byKey.get(stat.key)}
          period={period}
          intensity={intensities[i]}
          currency={account.currency}
          label={periodLabel(stat, period, locale)}
        />
      ))}
    </div>
  );
}

/**
 * Nhãn kỳ đọc được.
 *
 * Kỳ ngày hiện đúng một ngày; kỳ tuần hiện khoảng đầu–cuối, vì "2026-W39" là
 * khoá máy đọc chứ không phải thứ người ta nghĩ trong đầu.
 *
 * Dựng ngày bằng `T00:00:00` chứ không để Date tự đoán: chuỗi "2026-09-21"
 * trần được parse là UTC, nên ở múi giờ âm nó lùi một ngày — thẻ "21/09" sẽ
 * hiện thành "20/09" với người dùng ở châu Mỹ.
 */
function periodLabel(stat: PeriodStat, period: PeriodKind, locale: string): string {
  const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB", opts);

  if (period === "day") {
    return day(stat.key, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const short: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  return `${day(stat.start, short)} – ${day(stat.end, { ...short, year: "numeric" })}`;
}
