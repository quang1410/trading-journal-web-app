import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { meterWidth, type DrawdownTone } from "./challenge";

const FILL: Record<"profit" | DrawdownTone, string> = {
  profit: "bg-primary",
  calm: "bg-border-strong",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/**
 * Một luật của quỹ: nhãn, con số hiện tại / giới hạn, và thanh.
 *
 * Thanh aria-hidden: con số bằng chữ đã nói đủ, và role="meter" đòi
 * aria-valuenow là số — tức là ép tỷ lệ sang number, điều styleguard cấm.
 */
export function ProgressMeter({
  label,
  value,
  limit,
  ratio,
  tone,
}: {
  label: string;
  value: ReactNode;
  limit: string;
  ratio: string | null;
  tone: "profit" | DrawdownTone;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs @sm:grid-cols-[5rem_8.5rem_minmax(0,1fr)]"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="num">
        {value} <span className="text-muted-foreground">/ {limit}</span>
      </span>
      <span aria-hidden className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-sunken @sm:col-span-1">
        <span data-fill className={cn("block h-full rounded-full", FILL[tone])} style={{ width: meterWidth(ratio) }} />
      </span>
    </div>
  );
}
