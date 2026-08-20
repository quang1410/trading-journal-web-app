import { formatMoney } from "@/lib/decimal";

/** Mọi con số đi qua đây: mono + tabular-nums để cột số thẳng hàng. */
export function MoneyText({ value, currency }: { value: string; currency?: string }) {
  return <span className="num">{formatMoney(value, currency)}</span>;
}
