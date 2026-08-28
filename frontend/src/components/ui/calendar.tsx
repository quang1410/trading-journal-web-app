import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { formatDateOnly } from "@/lib/format";

type YearMonth = { year: number; month: number };
type DayValue = YearMonth & { day: number };

const WEEKDAYS = {
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const;

function pad(v: number): string {
  return String(v).padStart(2, "0");
}

export function toDateOnly(day: DayValue): string {
  return `${day.year}-${pad(day.month + 1)}-${pad(day.day)}`;
}

export function parseDateOnly(value: string): DayValue | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;

  const year = +m[1];
  const month = +m[2] - 1;
  const day = +m[3];
  if (month < 0 || month > 11 || day < 1 || day > new Date(year, month + 1, 0).getDate()) {
    return null;
  }
  return { year, month, day };
}

function today(): DayValue {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function soNgay(day: YearMonth): number {
  return new Date(day.year, day.month + 1, 0).getDate();
}

function mondayOffset(day: YearMonth): number {
  return (new Date(day.year, day.month, 1).getDay() + 6) % 7;
}

function isSameDay(a: DayValue | null, b: DayValue): boolean {
  return a?.year === b.year && a.month === b.month && a.day === b.day;
}

function shiftMonth(day: YearMonth, step: number): YearMonth {
  const date = new Date(day.year, day.month + step, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function Calendar({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const selected = parseDateOnly(value);
  const [viewMonth, setViewMonth] = React.useState<YearMonth>(() =>
    selected ? selected : today(),
  );

  React.useEffect(() => {
    if (selected) setViewMonth(selected);
  }, [value]);

  const start = mondayOffset(viewMonth);
  const daysInMonth = soNgay(viewMonth);
  const cellCount = Math.ceil((start + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cellCount }, (_, i) => {
    const day = i - start + 1;
    return day >= 1 && day <= daysInMonth ? { ...viewMonth, day } : null;
  });
  const homNayValue = toDateOnly(today());
  const dinhDangThang = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "vi-VN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3" role="application" aria-label={t("calendar.label")}>
      <div className="flex items-center justify-between">
        <span className="font-semibold capitalize">
           {dinhDangThang.format(new Date(viewMonth.year, viewMonth.month, 1))}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
             aria-label={t("calendar.previousMonth")}
            onClick={() => setViewMonth((prev) => shiftMonth(prev, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
             aria-label={t("calendar.nextMonth")}
            onClick={() => setViewMonth((prev) => shiftMonth(prev, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
         {WEEKDAYS[locale].map((wd) => (
          <span key={wd} className="py-1 font-medium">
            {wd}
          </span>
        ))}
        {days.map((day, i) =>
          day ? (
            <button
              key={toDateOnly(day)}
              type="button"
               aria-label={t("calendar.chooseDate", {
                 date: formatDateOnly(toDateOnly(day), locale),
               })}
              aria-current={isSameDay(selected, day) ? "date" : undefined}
              onClick={() => onSelect(toDateOnly(day))}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isSameDay(selected, day) && "bg-primary font-semibold text-primary-foreground",
                toDateOnly(day) === homNayValue && !isSameDay(selected, day) && "font-semibold",
              )}
            >
              {day.day}
            </button>
          ) : (
            <span key={`trong-${i}`} aria-hidden className="h-8" />
          ),
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
           <Button type="button" variant="ghost" size="sm" onClick={() => onSelect("")}>
           {t("calendar.clear")}
         </Button>
         <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(homNayValue)}>
           {t("calendar.today")}
        </Button>
      </div>
    </div>
  );
}
