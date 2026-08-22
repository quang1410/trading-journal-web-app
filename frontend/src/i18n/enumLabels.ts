import type { Locale } from "./index";

export type EnumField =
  | "direction"
  | "timeframe"
  | "entry_quality"
  | "in_trade_quality"
  | "exit_quality"
  | "psychology"
  | "trade_class"
  | "weekday"
  | "cash_flow_type";

const EN_LABELS: Partial<Record<EnumField, string[]>> = {
  direction: ["Long", "Short"],
  timeframe: ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W"],
  entry_quality: ["Planned", "Too early", "Too late", "Impulsive"],
  in_trade_quality: ["Followed plan", "Moved take profit", "Moved stop loss farther", "Wanted to exit"],
  exit_quality: ["Hit take profit", "Hit stop loss", "Active exit (technical reason)", "Emotional exit, fear"],
  psychology: ["No error", "Fear of missing out (FOMO)", "FEAR", "HOPE", "GREED", "REVENGE TRADING", "ALWAYS NEED TO BE RIGHT"],
  trade_class: ["NOT EVALUATED", "Planned", "Needs improvement", "Impulsive / FOMO", "Revenge trading"],
  weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  cash_flow_type: ["Deposit", "Withdrawal"],
};

const LABELS: Partial<Record<Locale, Partial<Record<EnumField, Record<string, string>>>>> = {
  vi: {
    cash_flow_type: { deposit: "Nạp", withdraw: "Rút" },
  },
  en: {
    cash_flow_type: { deposit: "Deposit", withdraw: "Withdrawal" },
  },
};

export function enumLabel(field: EnumField, value: string, locale: Locale, values?: string[]): string {
  const direct = LABELS[locale]?.[field]?.[value];
  if (direct) return direct;
  if (locale === "vi") return value;
  const index = values?.indexOf(value) ?? -1;
  return index >= 0 ? (EN_LABELS[field]?.[index] ?? value) : value;
}
