import * as React from "react";
import { CalendarClockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar, parseDateOnly } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

function splitDateTime(value: string): { day: string; time: string } {
  const [day = "", time = ""] = value.split("T");
  return { day, time: time.slice(0, 5) };
}

function joinDateTime(day: string, time: string): string {
  return day && time ? `${day}T${time}` : "";
}

function hienThiNgayGio(value: string, locale: "vi" | "en"): string {
  const { day, time } = splitDateTime(value);
  if (!parseDateOnly(day) || !time) return "";
  return `${formatDateOnly(day, locale)}, ${time}`;
}

export function DateTimePicker({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
  timeLabel,
  "aria-invalid": ariaInvalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  ariaLabel: string;
  timeLabel: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [parts, setParts] = React.useState(() => splitDateTime(value));
  const { locale, t } = useI18n();
  const text = hienThiNgayGio(value, locale);

  React.useEffect(() => {
    if (value !== joinDateTime(parts.day, parts.time)) setParts(splitDateTime(value));
  }, [value]);

  function doiParts(next: { day: string; time: string }) {
    setParts(next);
    onChange(joinDateTime(next.day, next.time));
  }

  function close() {
    setOpen(false);
    onBlur?.();
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          className={cn("w-full justify-between font-normal", !text && "text-muted-foreground")}
        >
          <span className={cn("truncate", !text && "text-left")}>{text || placeholder}</span>
          <CalendarClockIcon aria-hidden className="size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-[19rem]"
        role="dialog"
        aria-label={t("calendar.dialogLabel", { field: ariaLabel })}
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
          <span className="text-sm font-medium">{timeLabel}</span>
          <Input
            type="time"
            value={parts.time}
            onChange={(event) => doiParts({ day: parts.day, time: event.target.value })}
            aria-label={timeLabel}
            className="w-[8.5rem]"
          />
        </div>
        <Calendar value={parts.day} onSelect={(next) => doiParts({ day: next, time: parts.time })} />
      </PopoverContent>
    </Popover>
  );
}
