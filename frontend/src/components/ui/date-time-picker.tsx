import * as React from "react";
import { CalendarClockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar, parseDateOnly } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

function tachNgayGio(value: string): { ngay: string; gio: string } {
  const [ngay = "", gio = ""] = value.split("T");
  return { ngay, gio: gio.slice(0, 5) };
}

function ghepNgayGio(ngay: string, gio: string): string {
  return ngay && gio ? `${ngay}T${gio}` : "";
}

function hienThiNgayGio(value: string, locale: "vi" | "en"): string {
  const { ngay, gio } = tachNgayGio(value);
  if (!parseDateOnly(ngay) || !gio) return "";
  return `${formatDateOnly(ngay, locale)}, ${gio}`;
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
  const [parts, setParts] = React.useState(() => tachNgayGio(value));
  const { locale, t } = useI18n();
  const text = hienThiNgayGio(value, locale);

  React.useEffect(() => {
    if (value !== ghepNgayGio(parts.ngay, parts.gio)) setParts(tachNgayGio(value));
  }, [value]);

  function doiParts(next: { ngay: string; gio: string }) {
    setParts(next);
    onChange(ghepNgayGio(next.ngay, next.gio));
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
            value={parts.gio}
            onChange={(event) => doiParts({ ngay: parts.ngay, gio: event.target.value })}
            aria-label={timeLabel}
            className="w-[8.5rem]"
          />
        </div>
        <Calendar value={parts.ngay} onSelect={(next) => doiParts({ ngay: next, gio: parts.gio })} />
      </PopoverContent>
    </Popover>
  );
}
