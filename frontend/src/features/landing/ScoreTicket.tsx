import { useState } from "react";
import { useI18n, type TranslationKey } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { cn } from "@/lib/utils";
import { useMetaEnums, type MetaEnums, type ScoredField } from "@/features/meta/hooks";
import { ChoiceChip } from "./ChoiceChip";
import {
  ENUM_FIELD_OF,
  SCORED_FIELDS,
  classify,
  defaultSelection,
  toneOf,
  totalScore,
  type Selection,
  type Tone,
} from "./ticket";

const AXIS_LABEL: Record<ScoredField, TranslationKey> = {
  entry_qualities: "dashboard.axisEntry",
  in_trade_qualities: "dashboard.axisInTrade",
  exit_qualities: "dashboard.axisExit",
  psychologies: "dashboard.axisPsych",
};

const TONE_TEXT: Record<Tone, string> = { good: "text-profit", warn: "text-warn", bad: "text-loss" };
const TONE_BAR: Record<Tone, string> = { good: "bg-primary", warn: "bg-warning", bad: "bg-destructive" };

/** Mỗi trục tối đa 25 điểm (trading-journal-plan.md §2). */
const AXIS_MAX = 25;

/**
 * Phiếu chấm điểm mẫu. Nhãn, điểm và ngưỡng phân loại đều đến từ /meta/enums;
 * đang tải thì hiện khung cùng kích thước, lỗi thì ẩn hẳn (khối chữ bên cạnh
 * vẫn đứng được một mình).
 */
export function ScoreTicket() {
  const { data, isPending, isError } = useMetaEnums();
  if (isError) return <div data-testid="ticket-unavailable" hidden />;
  if (isPending) return <div aria-hidden="true" className="h-[28rem] rounded-[10px] border bg-card" />;
  return <Ticket enums={data} />;
}

function Ticket({ enums }: { enums: MetaEnums }) {
  const { t, locale } = useI18n();
  const [sel, setSel] = useState<Selection>(() => defaultSelection(enums));
  const total = totalScore(sel, enums.score_points);
  const band = classify(total, enums.class_bands);
  const tone = toneOf(band, enums.class_bands);
  const max = AXIS_MAX * SCORED_FIELDS.length;

  return (
    <form aria-label={t("landing.scoring.ticketLabel")} className="min-w-0 rounded-[10px] border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <b className="font-mono text-[16px]">XAUUSD</b>
          <span className="font-mono text-[13px] text-muted-foreground">{t("landing.scoring.ticketMeta")}</span>
        </div>
        <div className="font-mono text-[18px] font-semibold text-profit">{t("landing.scoring.ticketPnl")}</div>
      </div>

      <div className="grid gap-[18px] p-5">
        {SCORED_FIELDS.map((field) => {
          const points = enums.score_points[field][sel[field]] ?? 0;
          return (
            <fieldset
              key={field}
              className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-0 p-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_3.5rem]"
            >
              <legend className="float-left pt-1.5 text-sm font-medium">{t(AXIS_LABEL[field])}</legend>
              <div className="col-span-full row-start-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:row-start-auto">
                {enums[field].map((label, i) => (
                  <ChoiceChip
                    key={label}
                    id={`ticket-${field}-${i}`}
                    name={`ticket-${field}`}
                    type="radio"
                    checked={sel[field] === label}
                    onChange={() => setSel((s) => ({ ...s, [field]: label }))}
                  >
                    {enumLabel(ENUM_FIELD_OF[field], label, locale, enums[field])}
                  </ChoiceChip>
                ))}
              </div>
              <div className="pt-1.5 text-right font-mono text-sm text-muted-foreground">
                <b className="font-semibold text-foreground">{points}</b>/{AXIS_MAX}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-b-[10px] border-t bg-surface-sunken px-5 py-4">
        <div data-testid="ticket-total" className="font-mono text-[30px] leading-none font-semibold">
          {total}
          <small className="text-[15px] font-normal text-muted-foreground">
            {t("landing.scoring.outOf", { max })}
          </small>
        </div>
        <div aria-hidden="true" className="h-2 max-w-64 flex-[1_1_10rem] overflow-hidden rounded-full bg-border">
          <i
            className={cn("block h-full transition-[width] duration-300", TONE_BAR[tone])}
            style={{ width: `${(total / max) * 100}%` }}
          />
        </div>
        <div data-testid="ticket-class" className={cn("text-[15px] font-semibold", TONE_TEXT[tone])}>
          {band ? enumLabel("trade_class", band.class, locale, enums.trade_classes) : ""}
        </div>
      </div>
    </form>
  );
}
