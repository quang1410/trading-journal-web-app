import { useI18n, type TranslationKey } from "@/i18n";
import { formatPlain, formatSigned } from "../format";

export function PeriodPreview() {
  const { t, locale } = useI18n();
  const tabs: [TranslationKey, boolean][] = [
    ["periods.tabTrade", false],
    ["periods.tabDay", false],
    ["periods.tabWeek", true],
  ];
  const stats: [TranslationKey, string, string][] = [
    ["periods.grossProfit", formatSigned(1240, locale), "text-profit"],
    ["periods.grossLoss", formatSigned(-610, locale), "text-loss"],
    ["periods.winners", "7/5", ""],
    ["periods.profitFactor", new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: 2 }).format(2.03), ""],
  ];
  return (
    <div className="grid gap-2.5 text-[13px]">
      <div className="flex w-max gap-0.5 rounded-md border bg-card p-0.5">
        {tabs.map(([key, on]) => (
          <span key={key} className={`rounded px-2.5 py-0.5 ${on ? "bg-surface-sunken font-semibold" : "text-muted-foreground"}`}>
            {t(key)}
          </span>
        ))}
      </div>
      <div className="rounded-md border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <b>{t("landing.features.periodRange")}</b>
          <span className="text-xs text-muted-foreground">{t("periods.tradeCount", { n: formatPlain(12, locale) })}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([key, value, color]) => (
            <div key={key}>
              <span className="text-xs text-muted-foreground">{t(key)}</span>
              <b className={`block font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</b>
            </div>
          ))}
        </div>
        <p className="mt-2.5 border-t border-dashed border-input pt-2.5">{t("landing.features.periodNote")}</p>
      </div>
    </div>
  );
}
