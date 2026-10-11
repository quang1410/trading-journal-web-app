import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { enumLabel } from "@/i18n/enumLabels";
import { formatPlain, formatSigned } from "./format";
import {
  DEVIATIONS,
  DEVIATION_INDEXES,
  THEORY,
  actualSeries,
  cumulative,
  reasonLabel,
  sampleTotals,
  worstDeviation,
} from "./gapSample";
import { ENUM_FIELD_OF } from "./ticket";

const HEIGHT = 280;
const MARGIN = { l: 46, r: 10, t: 10, b: 24 };
const STEP = 500;
/** jsdom và lần render đầu chưa có kích thước thật. */
const FALLBACK_WIDTH = 600;

/** Bề rộng thật của khung, để chữ trục không bị co nhỏ trên điện thoại. */
function useWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width || FALLBACK_WIDTH;
}

export function GapChart() {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const [active, setActive] = useState(worstDeviation);

  const theory = cumulative(THEORY);
  const actual = cumulative(actualSeries());
  const totals = sampleTotals();

  const lo = Math.min(0, ...theory, ...actual);
  const hi = Math.max(...theory, ...actual);
  const yMin = Math.floor(lo / STEP) * STEP;
  const yMax = Math.ceil(hi / STEP) * STEP;
  const x = (i: number) => MARGIN.l + (i / (theory.length - 1)) * (W - MARGIN.l - MARGIN.r);
  const y = (v: number) => MARGIN.t + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - MARGIN.t - MARGIN.b);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const gapPath =
    line(theory) +
    actual
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse()
      .join("") +
    "Z";

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += STEP) ticks.push(v);

  const dev = DEVIATIONS[active];
  const raw = reasonLabel(dev.reason, enums);
  const label =
    raw && enums ? enumLabel(ENUM_FIELD_OF[dev.reason.field], raw, locale, enums[dev.reason.field]) : undefined;

  return (
    <figure className="m-0 min-w-0 rounded-[10px] border bg-card px-5 pt-5 pb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] font-semibold">{t("landing.gap.title")}</h2>
        <span className="text-[13px] text-muted-foreground">{t("landing.gap.meta")}</span>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {(
          [
            ["gap-theory", "landing.gap.theory", totals.theory, "text-profit"],
            ["gap-actual", "landing.gap.actual", totals.actual, "text-profit"],
            ["gap-diff", "landing.gap.gap", totals.gap, "text-loss"],
          ] as const
        ).map(([id, key, value, color]) => (
          <div key={id} className="grid gap-0.5">
            <dt className="text-[13px] text-muted-foreground">{t(key)}</dt>
            <dd data-testid={id} className={`m-0 font-mono text-[clamp(18px,2.4vw,24px)] font-semibold tabular-nums ${color}`}>
              {formatSigned(value, locale)}
            </dd>
          </div>
        ))}
      </dl>

      <div ref={box} className="mt-2">
        <svg
          role="img"
          aria-label={t("landing.gap.chartLabel")}
          width={W}
          height={HEIGHT}
          viewBox={`0 0 ${W} ${HEIGHT}`}
          className="block max-w-full"
        >
          <defs>
            <pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="fill-destructive/10" />
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-destructive" strokeWidth="1.4" />
            </pattern>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.l}
                x2={W - MARGIN.r}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? "stroke-input" : "stroke-border"}
              />
              <text x={MARGIN.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
                {formatSigned(v, locale)}
              </text>
            </g>
          ))}
          {[1, 10, 20, 30].map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">
              #{i}
            </text>
          ))}
          <path d={gapPath} className="landing-fade fill-[url(#gap-hatch)]" />
          <path d={line(theory)} className="fill-none stroke-muted-foreground [stroke-dasharray:5_4]" strokeWidth="1.75" />
          <path
            d={line(actual)}
            pathLength={1}
            className="landing-draw fill-none stroke-primary"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {DEVIATION_INDEXES.map((i) => (
            <circle
              key={i}
              cx={x(i + 1)}
              cy={y(actual[i + 1])}
              r={5}
              tabIndex={0}
              role="button"
              aria-label={t("landing.gap.dotLabel", { n: i + 1 })}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`landing-fade cursor-pointer stroke-destructive outline-none ${
                i === active ? "fill-destructive" : "fill-card hover:fill-destructive focus:fill-destructive"
              }`}
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-2 border-dashed border-muted-foreground" />
          {t("landing.gap.legendTheory")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-2 border-primary" />
          {t("landing.gap.legendActual")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-[18px] border border-destructive bg-[repeating-linear-gradient(45deg,var(--status-error)_0_1.5px,transparent_1.5px_5px)]" />
          {t("landing.gap.legendGap")}
        </span>
      </div>

      <p data-testid="gap-note" aria-live="polite" className="mt-3 min-h-[3.2em] border-t pt-3 text-sm">
        <b className="font-semibold">{t("landing.gap.noteTrade", { n: active + 1 })}</b>
        {label && (
          <>
            {" · "}
            <span className="font-mono text-[12.5px] text-loss">{label}</span>
          </>
        )}
        <br />
        {t("landing.gap.noteDetail", {
          plan: formatSigned(THEORY[active], locale),
          actual: formatSigned(dev.actual, locale),
          lost: formatPlain(THEORY[active] - dev.actual, locale),
        })}
      </p>
    </figure>
  );
}
