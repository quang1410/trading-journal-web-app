import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { formatPlain } from "../format";

const PHASES = ["phase_1", "phase_2", "funded"] as const;

export function ChallengePreview() {
  const { t, locale } = useI18n();
  const phase = (p: (typeof PHASES)[number]) => enumLabel("challenge_phase", p, locale);
  const pct = (n: number) => `${formatPlain(n, locale)}%`;
  return (
    <div className="grid gap-3 rounded-md border bg-card px-3 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b>{t("landing.features.challengeName")}</b>
        <span className="text-xs text-muted-foreground">{t("accounts.outcomeInProgress", { phase: phase("phase_2") })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-full border border-primary px-2 py-0.5 text-profit">{phase("phase_1")} ✓</span>
        <em className="text-input not-italic">—</em>
        <span className="rounded-full border border-foreground px-2 py-0.5 font-semibold">{phase("phase_2")}</span>
        <em className="text-input not-italic">—</em>
        <span className="rounded-full border border-input px-2 py-0.5 text-muted-foreground">{phase("funded")}</span>
      </div>
      {(
        [
          ["accounts.meterProfit", 3.4, 5, "bg-primary"],
          ["accounts.meterDrawdown", 2.1, 10, "bg-warning"],
        ] as const
      ).map(([key, value, limit, bar]) => (
        <div key={key} className="grid gap-1">
          <div className="flex justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t(key)}</span>
            <span className="font-mono tabular-nums">
              {pct(value)} / {pct(limit)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <i className={`block h-full rounded-full ${bar}`} style={{ width: `${(value / limit) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
