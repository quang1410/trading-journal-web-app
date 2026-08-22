import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";

/** Mọi con số đi qua đây: mono + tabular-nums để cột số thẳng hàng. */
export function MoneyText({ value, currency }: { value: string; currency?: string }) {
  const { locale } = useI18n();
  return <span className="num">{formatMoney(value, currency, locale)}</span>;
}
