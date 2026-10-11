import { useI18n, type TranslationKey } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { formatSigned } from "../format";

/** Số minh hoạ — xem chú thích đầu gapSample.ts về vì sao là number. */
const KPIS: [TranslationKey, string, "up" | "down" | "plain"][] = [
  ["kpi.netProfit", "net", "up"],
  ["kpi.winPct", "win", "plain"],
  ["kpi.profitFactor", "pf", "plain"],
  ["kpi.maxDrawdown", "dd", "down"],
];
const SETUPS: [string, number][] = [
  ["FVG H1", 1420],
  ["Order block", 860],
  ["Breakout", 310],
];
const DEFAULT_SETUP_NET = -540;
const RADAR: [TranslationKey, number][] = [
  ["dashboard.axisEntry", 18],
  ["dashboard.axisInTrade", 21],
  ["dashboard.axisExit", 14],
  ["dashboard.axisPsych", 11],
];

export function DashboardPreview() {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const pct = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "percent" });
  const dec = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: 2 });
  const values: Record<string, string> = {
    net: formatSigned(2480, locale),
    win: pct.format(0.46),
    pf: dec.format(1.62),
    dd: formatSigned(-640, locale),
  };
  const setups: [string, number][] = enums ? [...SETUPS, [enums.default_setup, DEFAULT_SETUP_NET]] : SETUPS;
  const maxAbs = Math.max(...setups.map(([, v]) => Math.abs(v)));

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {KPIS.map(([key, id, tone]) => (
          <div key={id} className="min-w-0 rounded-md border bg-card px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{t(key)}</span>
            <b
              className={`mt-1 block font-mono text-[17px] font-semibold tabular-nums ${
                tone === "up" ? "text-profit" : tone === "down" ? "text-loss" : ""
              }`}
            >
              {values[id]}
            </b>
          </div>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{t("landing.features.bySetup")}</span>
          <div className="mt-2 grid gap-[7px] text-[13px]">
            {setups.map(([name, v]) => {
              // Gốc 0 nằm ở 30% bề rộng: bên phải cho lãi, bên trái cho lỗ.
              const w = (Math.abs(v) / maxAbs) * (v >= 0 ? 70 : 30);
              return (
                <div key={name} className="grid grid-cols-[9.2rem_minmax(0,1fr)_3.6rem] items-center gap-2">
                  <span className="truncate">{name}</span>
                  <span className="relative h-2.5 before:absolute before:-top-[3px] before:-bottom-[3px] before:left-[30%] before:border-l before:border-input">
                    <i
                      className={`absolute inset-y-0 rounded-sm ${v >= 0 ? "bg-primary" : "bg-destructive"}`}
                      style={v >= 0 ? { left: "30%", width: `${w}%` } : { right: "70%", width: `${w}%` }}
                    />
                  </span>
                  <span className={`text-right font-mono tabular-nums ${v >= 0 ? "text-profit" : "text-loss"}`}>
                    {formatSigned(v, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{t("landing.features.radarCaption")}</span>
          <Radar />
        </div>
      </div>
    </div>
  );
}

function Radar() {
  const { t } = useI18n();
  const cx = 130;
  const cy = 95;
  const R = 58;
  const pt = (k: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (k * Math.PI) / 2;
    return [cx + (Math.cos(a) * R * v) / 25, cy + (Math.sin(a) * R * v) / 25];
  };
  const poly = (v: (k: number) => number) => RADAR.map((_, k) => pt(k, v(k)).join(",")).join(" ");
  const labelPos: [number, number, "middle" | "start" | "end"][] = [
    [cx, 18, "middle"],
    [cx + R + 8, cy + 4, "start"],
    [cx, cy + R + 16, "middle"],
    [cx - R - 8, cy + 4, "end"],
  ];
  return (
    <svg viewBox="0 0 260 190" className="mx-auto mt-1 block h-auto w-full max-w-[260px]" aria-hidden="true">
      {[25, 12.5].map((v) => (
        <polygon key={v} points={poly(() => v)} className="fill-none stroke-border" />
      ))}
      {RADAR.map((_, k) => {
        const [x2, y2] = pt(k, 25);
        return <line key={k} x1={cx} y1={cy} x2={x2} y2={y2} className="stroke-border" />;
      })}
      <polygon points={poly((k) => RADAR[k][1])} className="fill-interactive-bg-pressed stroke-primary" strokeWidth="2" />
      {RADAR.map(([key, v], k) => (
        <text key={key} x={labelPos[k][0]} y={labelPos[k][1]} textAnchor={labelPos[k][2]} className="fill-muted-foreground text-[10.5px]">
          {t(key)} {v}
        </text>
      ))}
    </svg>
  );
}
