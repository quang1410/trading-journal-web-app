import * as React from "react";
import { CalendarDaysIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar, parseDateOnly } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

function hienThiNgay(value: string, locale: "vi" | "en"): string {
  const day = parseDateOnly(value);
  if (!day) return "";
  const date = `${day.year}-${String(day.month + 1).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
  const [year, month, ngayTrongThang] = date.split("-");
  return locale === "en" ? `${month}/${ngayTrongThang}/${year}` : `${ngayTrongThang}/${month}/${year}`;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { locale, t } = useI18n();
  const text = hienThiNgay(value, locale);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn("w-full justify-between font-normal", !text && "text-muted-foreground")}
        >
          <span className={cn("truncate", !text && "text-left")}>{text || placeholder}</span>
          <CalendarDaysIcon aria-hidden className="size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
       <PopoverContent align="start" role="dialog" aria-label={t("calendar.dialogLabel", { field: ariaLabel })}>
        <Calendar
          value={value}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
