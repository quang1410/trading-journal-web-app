import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { formatDateOnly } from "@/lib/format";

type Ngay = { nam: number; thang: number };
type NgayCoSo = Ngay & { ngay: number };

const THU = {
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const;

function pad(v: number): string {
  return String(v).padStart(2, "0");
}

export function toDateOnly(ngay: NgayCoSo): string {
  return `${ngay.nam}-${pad(ngay.thang + 1)}-${pad(ngay.ngay)}`;
}

export function parseDateOnly(value: string): NgayCoSo | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;

  const nam = +m[1];
  const thang = +m[2] - 1;
  const ngay = +m[3];
  if (thang < 0 || thang > 11 || ngay < 1 || ngay > new Date(nam, thang + 1, 0).getDate()) {
    return null;
  }
  return { nam, thang, ngay };
}

function homNay(): NgayCoSo {
  const now = new Date();
  return { nam: now.getFullYear(), thang: now.getMonth(), ngay: now.getDate() };
}

function soNgay(ngay: Ngay): number {
  return new Date(ngay.nam, ngay.thang + 1, 0).getDate();
}

function thuHaiDauThang(ngay: Ngay): number {
  return (new Date(ngay.nam, ngay.thang, 1).getDay() + 6) % 7;
}

function cungNgay(a: NgayCoSo | null, b: NgayCoSo): boolean {
  return a?.nam === b.nam && a.thang === b.thang && a.ngay === b.ngay;
}

function doiThang(ngay: Ngay, buoc: number): Ngay {
  const date = new Date(ngay.nam, ngay.thang + buoc, 1);
  return { nam: date.getFullYear(), thang: date.getMonth() };
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
  const [thangDangXem, setThangDangXem] = React.useState<Ngay>(() =>
    selected ? selected : homNay(),
  );

  React.useEffect(() => {
    if (selected) setThangDangXem(selected);
  }, [value]);

  const dau = thuHaiDauThang(thangDangXem);
  const soNgayTrongThang = soNgay(thangDangXem);
  const soO = Math.ceil((dau + soNgayTrongThang) / 7) * 7;
  const cacNgay = Array.from({ length: soO }, (_, i) => {
    const ngay = i - dau + 1;
    return ngay >= 1 && ngay <= soNgayTrongThang ? { ...thangDangXem, ngay } : null;
  });
  const homNayValue = toDateOnly(homNay());
  const dinhDangThang = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "vi-VN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3" role="application" aria-label={t("calendar.label")}>
      <div className="flex items-center justify-between">
        <span className="font-semibold capitalize">
           {dinhDangThang.format(new Date(thangDangXem.nam, thangDangXem.thang, 1))}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
             aria-label={t("calendar.previousMonth")}
            onClick={() => setThangDangXem((cu) => doiThang(cu, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
             aria-label={t("calendar.nextMonth")}
            onClick={() => setThangDangXem((cu) => doiThang(cu, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
         {THU[locale].map((thu) => (
          <span key={thu} className="py-1 font-medium">
            {thu}
          </span>
        ))}
        {cacNgay.map((ngay, i) =>
          ngay ? (
            <button
              key={toDateOnly(ngay)}
              type="button"
               aria-label={t("calendar.chooseDate", {
                 date: formatDateOnly(toDateOnly(ngay), locale),
               })}
              aria-current={cungNgay(selected, ngay) ? "date" : undefined}
              onClick={() => onSelect(toDateOnly(ngay))}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                cungNgay(selected, ngay) && "bg-primary font-semibold text-primary-foreground",
                toDateOnly(ngay) === homNayValue && !cungNgay(selected, ngay) && "font-semibold",
              )}
            >
              {ngay.ngay}
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
