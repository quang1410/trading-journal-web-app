import { useState, type ReactNode } from "react";
import { BrushIcon, CandlestickChartIcon, LayersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { ICT_TIMEZONES, LABEL_SIZES, LINE_STYLES, type IctSettings, type LineStyle } from "../engine/ict";
import type { ChartStyle, ChartTemplate, Watermark } from "../engine/style";
import { TIMEFRAMES, tfLabel } from "../engine/tf";
import { ZONES, type Zone } from "../engine/time";
import { toHexColor } from "../chart/colors";
import { useReplay, useReplayStore } from "../store/context";
import { LINE_STYLE_LABEL, ZONE_LONG_LABEL } from "./labels";

type Tab = "symbol" | "canvas" | "ict";
const FIELD = "h-9 rounded-md border border-border bg-[var(--surface-input-default)] px-2 text-sm text-foreground";

function Row({ label, children, className }: { label: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("my-2.5 grid grid-cols-1 items-center gap-2 sm:grid-cols-[13rem_1fr]", className)}>
      <div className="text-sm text-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
function Heading({ children }: { children: ReactNode }) {
  return <h4 className="mt-7 mb-1 border-b border-border pb-2 text-sm font-medium text-foreground first:mt-1">{children}</h4>;
}
function Check({ checked, onChange, children, label }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="size-4 cursor-pointer accent-primary" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
function Color({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input type="color" className="replay-swatch" aria-label={label} title={label} value={toHexColor(value)} onChange={(e) => onChange(e.target.value)} />;
}
function NumberBox({ value, onChange, min, max, step, label, className = "w-24" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; className?: string }) {
  return (
    <input
      type="number"
      className={cn(FIELD, className)}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(min ?? 0, +e.target.value || 0))}
    />
  );
}
function Choice<T extends string | number>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <select
      className={cn(FIELD, "cursor-pointer", className)}
      aria-label={label}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SymbolTab() {
  const store = useReplayStore();
  const { t } = useI18n();
  const s = useReplay((x) => x.chartStyle);
  const zone = useReplay((x) => x.zone);
  const set = (p: Partial<ChartStyle>) => store.setChartStyle(p);
  const pair = (on: "body" | "border" | "wick", up: "bodyUp" | "borderUp" | "wickUp", down: "bodyDown" | "borderDown" | "wickDown", label: string) => (
    <Row label={<Check checked={s[on]} onChange={(v) => set({ [on]: v })}>{label}</Check>}>
      <Color value={s[up]} onChange={(v) => set({ [up]: v })} label={t("replay.set.up", { what: label })} />
      <Color value={s[down]} onChange={(v) => set({ [down]: v })} label={t("replay.set.down", { what: label })} />
    </Row>
  );
  return (
    <>
      <Heading>{t("replay.set.candles")}</Heading>
      <Row label={<Check checked={s.prevClose} onChange={(v) => set({ prevClose: v })}>{t("replay.set.prevClose")}</Check>} className="sm:grid-cols-1" />
      {pair("body", "bodyUp", "bodyDown", t("replay.set.body"))}
      {pair("border", "borderUp", "borderDown", t("replay.set.border"))}
      {pair("wick", "wickUp", "wickDown", t("replay.set.wick"))}
      <Heading>{t("replay.set.priceDisplay")}</Heading>
      <Row label={t("replay.set.precision")}>
        <Choice
          value={s.precision}
          label={t("replay.set.precision")}
          onChange={(v) => set({ precision: v })}
          options={[
            { value: 2, label: t("replay.set.precisionDefault") },
            { value: 0, label: "0 (1)" },
            { value: 1, label: "1 (0.1)" },
            { value: 3, label: "3 (0.001)" },
          ]}
        />
      </Row>
      <Row label={t("replay.top.zone")}>
        <Choice<Zone> value={zone} label={t("replay.top.zone")} onChange={(v) => store.setZone(v)} options={ZONES.map((z) => ({ value: z, label: t(ZONE_LONG_LABEL[z]) }))} />
      </Row>
    </>
  );
}

function CanvasTab() {
  const store = useReplayStore();
  const { t } = useI18n();
  const s = useReplay((x) => x.chartStyle);
  const set = (p: Partial<ChartStyle>) => store.setChartStyle(p);
  return (
    <>
      <Heading>{t("replay.set.basic")}</Heading>
      <Row label={t("replay.set.bg")}>
        <Color value={s.bg} onChange={(v) => set({ bg: v })} label={t("replay.set.bg")} />
      </Row>
      <Row label={<Check checked={s.vGrid} onChange={(v) => set({ vGrid: v })}>{t("replay.set.vGrid")}</Check>}>
        <Color value={s.vGridColor} onChange={(v) => set({ vGridColor: v })} label={t("replay.set.vGrid")} />
      </Row>
      <Row label={<Check checked={s.hGrid} onChange={(v) => set({ hGrid: v })}>{t("replay.set.hGrid")}</Check>}>
        <Color value={s.hGridColor} onChange={(v) => set({ hGridColor: v })} label={t("replay.set.hGrid")} />
      </Row>
      <Row label={t("replay.set.crosshair")}>
        <Color value={s.crosshair} onChange={(v) => set({ crosshair: v })} label={t("replay.set.crosshair")} />
        <Choice
          value={s.crossStyle}
          label={t("replay.set.crossStyle")}
          onChange={(v) => set({ crossStyle: v })}
          options={[
            { value: 2, label: t("replay.set.crossDashed") },
            { value: 1, label: t("replay.set.crossDotted") },
            { value: 3, label: t("replay.set.crossLong") },
            { value: 0, label: t("replay.set.crossSolid") },
          ]}
        />
      </Row>
      <Row label={t("replay.set.watermark")}>
        <Choice<Watermark>
          value={s.watermark}
          label={t("replay.set.watermark")}
          onChange={(v) => set({ watermark: v })}
          options={[
            { value: "replay", label: t("replay.watermark") },
            { value: "symbol", label: t("replay.set.watermarkSymbol") },
            { value: "none", label: t("replay.set.watermarkNone") },
          ]}
        />
        <Color value={s.watermarkColor} onChange={(v) => set({ watermarkColor: v })} label={t("replay.set.watermark")} />
      </Row>
      <Heading>{t("replay.set.scales")}</Heading>
      <Row label={t("replay.set.text")}>
        <Color value={s.textColor} onChange={(v) => set({ textColor: v })} label={t("replay.set.text")} />
        <Choice value={s.fontSize} label={t("replay.set.fontSize")} onChange={(v) => set({ fontSize: v })} options={[10, 11, 12, 13, 14].map((n) => ({ value: n, label: String(n) }))} />
      </Row>
      <Row label={t("replay.set.scaleLine")}>
        <Color value={s.lineColor} onChange={(v) => set({ lineColor: v })} label={t("replay.set.scaleLine")} />
      </Row>
      <Heading>{t("replay.set.margins")}</Heading>
      <Row label={t("replay.set.marginTop")}>
        <NumberBox value={s.marginTop} min={0} max={40} label={t("replay.set.marginTop")} onChange={(v) => set({ marginTop: v })} /> %
      </Row>
      <Row label={t("replay.set.marginBottom")}>
        <NumberBox value={s.marginBottom} min={0} max={40} label={t("replay.set.marginBottom")} onChange={(v) => set({ marginBottom: v })} /> %
      </Row>
      <Row label={t("replay.set.marginRight")}>
        <NumberBox value={s.rightBars} min={0} max={100} label={t("replay.set.marginRight")} onChange={(v) => set({ rightBars: v })} /> {t("replay.set.bars")}
      </Row>
    </>
  );
}

function IctTab() {
  const store = useReplayStore();
  const { t } = useI18n();
  const ict = useReplay((x) => x.ict);
  const update = (fn: (draft: IctSettings) => void) => {
    const next = structuredClone(ict);
    fn(next);
    store.setIct(next);
  };
  const styles = LINE_STYLES.map((s) => ({ value: s, label: t(LINE_STYLE_LABEL[s]) }));
  const tfs = TIMEFRAMES.map((tf) => ({ value: tf as number, label: tfLabel(tf) }));
  const time = (value: string, onChange: (v: string) => void, label: string) => (
    <input type="time" className={cn(FIELD, "w-28")} aria-label={label} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
  );
  const text = (value: string, onChange: (v: string) => void, label: string, className = "w-32") => (
    <input type="text" className={cn(FIELD, className)} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  );
  const lineStyle = (style: LineStyle, width: number, onStyle: (v: LineStyle) => void, onWidth: (v: number) => void) => (
    <Row label={t("replay.ict.lineStyle")}>
      <Choice value={style} label={t("replay.ict.lineStyle")} onChange={onStyle} options={styles} />
      <NumberBox value={width} min={1} max={4} label={t("replay.ict.lineWidth")} onChange={onWidth} className="w-20" />
    </Row>
  );
  return (
    <div data-testid="replay-ict-settings">
      <Heading>{t("replay.ict.general")}</Heading>
      <Row label={<Check checked={ict.on} onChange={(v) => update((d) => void (d.on = v))}>{t("replay.ict.show")}</Check>} className="sm:grid-cols-1" />
      <Row label={t("replay.ict.maxDays")}>
        <NumberBox value={ict.maxDays} min={1} max={10} label={t("replay.ict.maxDays")} onChange={(v) => update((d) => void (d.maxDays = v))} className="w-20" />
      </Row>
      <Row label={t("replay.ict.tz")}>
        <Choice value={ict.tz} label={t("replay.ict.tz")} onChange={(v) => update((d) => void (d.tz = v))} options={ICT_TIMEZONES.map((z) => ({ value: z, label: z }))} />
      </Row>
      <p className="-mt-1 mb-2 text-xs text-text-muted">{t("replay.ict.tzHint")}</p>
      <Row label={t("replay.ict.tfRange")}>
        <Choice value={ict.tfMin} label={t("replay.ict.tfMin")} onChange={(v) => update((d) => void (d.tfMin = v))} options={tfs} />
        {t("replay.ict.to")}
        <Choice value={ict.tfMax} label={t("replay.ict.tfMax")} onChange={(v) => update((d) => void (d.tfMax = v))} options={tfs} />
      </Row>

      <Heading>{t("replay.ict.killzones")}</Heading>
      <Row label={<Check checked={ict.boxes} onChange={(v) => update((d) => void (d.boxes = v))}>{t("replay.ict.boxes")}</Check>}>
        <Check checked={ict.boxText} onChange={(v) => update((d) => void (d.boxText = v))}>{t("replay.ict.boxText")}</Check>
      </Row>
      {ict.sessions.map((s, i) => (
        <div key={i} className="my-2 flex flex-wrap items-center gap-2" data-testid={`replay-ict-session-${i}`}>
          <Check checked={s.on} label={s.name} onChange={(v) => update((d) => void (d.sessions[i].on = v))} />
          {text(s.name, (v) => update((d) => void (d.sessions[i].name = v)), t("replay.ict.name"))}
          {time(s.start, (v) => update((d) => void (d.sessions[i].start = v)), t("replay.ict.start"))}
          {time(s.end, (v) => update((d) => void (d.sessions[i].end = v)), t("replay.ict.end"))}
          <Color value={s.color} label={t("replay.ict.color")} onChange={(v) => update((d) => void (d.sessions[i].color = v))} />
        </div>
      ))}
      <Row label={t("replay.ict.boxAlpha")}>
        <NumberBox value={ict.boxAlpha} min={0} max={100} label={t("replay.ict.boxAlpha")} onChange={(v) => update((d) => void (d.boxAlpha = Math.min(100, v)))} className="w-20" /> %
      </Row>

      <Heading>{t("replay.ict.pivotsTitle")}</Heading>
      <p className="-mt-1 mb-2 text-xs text-text-muted">{t("replay.ict.pivotsHint")}</p>
      <Row label={<Check checked={ict.pivots} onChange={(v) => update((d) => void (d.pivots = v))}>{t("replay.ict.pivots")}</Check>}>
        <Check checked={ict.pivotPrice} onChange={(v) => update((d) => void (d.pivotPrice = v))}>{t("replay.ict.pivotPrice")}</Check>
      </Row>
      <Row label={t("replay.ict.labelSize")}>
        <Choice value={ict.labelSize} label={t("replay.ict.labelSize")} onChange={(v) => update((d) => void (d.labelSize = v))} options={LABEL_SIZES.map((x) => ({ value: x, label: x }))} />
      </Row>
      {lineStyle(ict.pivotStyle, ict.pivotWidth, (v) => update((d) => void (d.pivotStyle = v)), (v) => update((d) => void (d.pivotWidth = v)))}

      <Heading>{t("replay.ict.levels")}</Heading>
      {ict.levels.map((l, i) => (
        <div key={i} className="my-2 flex flex-wrap items-center gap-2">
          <Check checked={l.on} label={l.name} onChange={(v) => update((d) => void (d.levels[i].on = v))} />
          {text(l.name, (v) => update((d) => void (d.levels[i].name = v)), t("replay.ict.name"))}
          {time(l.time, (v) => update((d) => void (d.levels[i].time = v)), t("replay.ict.time"))}
          <Color value={l.color} label={t("replay.ict.color")} onChange={(v) => update((d) => void (d.levels[i].color = v))} />
        </div>
      ))}
      {lineStyle(ict.levelStyle, ict.levelWidth, (v) => update((d) => void (d.levelStyle = v)), (v) => update((d) => void (d.levelWidth = v)))}

      <Heading>{t("replay.ict.verticals")}</Heading>
      {ict.verticals.map((v, i) => (
        <div key={i} className="my-2 flex flex-wrap items-center gap-2">
          <Check checked={v.on} label={t("replay.ict.verticalN", { n: i + 1 })} onChange={(x) => update((d) => void (d.verticals[i].on = x))} />
          {time(v.time, (x) => update((d) => void (d.verticals[i].time = x)), t("replay.ict.time"))}
          <Color value={v.color} label={t("replay.ict.color")} onChange={(x) => update((d) => void (d.verticals[i].color = x))} />
        </div>
      ))}
      {lineStyle(ict.vStyle, ict.vWidth, (v) => update((d) => void (d.vStyle = v)), (v) => update((d) => void (d.vWidth = v)))}

      <Heading>{t("replay.smt.title")}</Heading>
      <p className="-mt-1 mb-2 text-xs text-text-muted">{t("replay.smt.hint")}</p>
      <Row label={<Check checked={ict.smt.on} onChange={(v) => update((d) => void (d.smt.on = v))}>{t("replay.smt.show")}</Check>}>
        <Check checked={ict.smt.alert} onChange={(v) => update((d) => void (d.smt.alert = v))}>{t("replay.smt.alert")}</Check>
      </Row>
      <Row label={t("replay.smt.len")}>
        <NumberBox value={ict.smt.len} min={1} max={20} label={t("replay.smt.len")} onChange={(v) => update((d) => void (d.smt.len = v))} className="w-20" />
      </Row>
      <Row label={<Check checked={ict.smt.highs} onChange={(v) => update((d) => void (d.smt.highs = v))}>{t("replay.smt.highs")}</Check>}>
        <Color value={ict.smt.bearColor} label={t("replay.smt.highs")} onChange={(v) => update((d) => void (d.smt.bearColor = v))} />
      </Row>
      <Row label={<Check checked={ict.smt.lows} onChange={(v) => update((d) => void (d.smt.lows = v))}>{t("replay.smt.lows")}</Check>}>
        <Color value={ict.smt.bullColor} label={t("replay.smt.lows")} onChange={(v) => update((d) => void (d.smt.bullColor = v))} />
      </Row>
      {lineStyle(ict.smt.style, ict.smt.width, (v) => update((d) => void (d.smt.style = v)), (v) => update((d) => void (d.smt.width = v)))}
      <Row label={<Check checked={ict.smt.label} onChange={(v) => update((d) => void (d.smt.label = v))}>{t("replay.smt.label")}</Check>}>
        {text(ict.smt.text, (v) => update((d) => void (d.smt.text = v.slice(0, 12))), t("replay.smt.text"), "w-24")}
      </Row>

      <Heading>{t("replay.ict.macros")}</Heading>
      <Row label={t("replay.ict.macroTf")}>
        <NumberBox value={ict.macroTf} min={1} max={60} label={t("replay.ict.macroTf")} onChange={(v) => update((d) => void (d.macroTf = v))} className="w-20" /> {t("replay.ict.minutes")}
      </Row>
      <Row label={t("replay.ict.macroDist")}>
        <NumberBox value={ict.macroDist} min={0} step={0.25} label={t("replay.ict.macroDist")} onChange={(v) => update((d) => void (d.macroDist = v))} className="w-20" /> {t("replay.ict.points")}
      </Row>
      {ict.macros.map((m, i) => (
        <div key={i} className="my-2 flex flex-wrap items-center gap-2">
          <Check checked={m.on} label={t("replay.ict.macroN", { n: i + 1 })} onChange={(v) => update((d) => void (d.macros[i].on = v))} />
          <span className="w-20 text-sm">{t("replay.ict.macroN", { n: i + 1 })}</span>
          {time(m.start, (v) => update((d) => void (d.macros[i].start = v)), t("replay.ict.start"))}
          {time(m.end, (v) => update((d) => void (d.macros[i].end = v)), t("replay.ict.end"))}
          <Check checked={m.top} onChange={(v) => update((d) => void (d.macros[i].top = v))}>{t("replay.ict.top")}</Check>
          <Check checked={m.bot} onChange={(v) => update((d) => void (d.macros[i].bot = v))}>{t("replay.ict.bottom")}</Check>
        </div>
      ))}
      <Button variant="outline" className="mt-4" onClick={() => store.resetIct()}>
        {t("replay.ict.reset")}
      </Button>
    </div>
  );
}

const TABS: { id: Tab; icon: typeof BrushIcon; key: "replay.set.tabSymbol" | "replay.set.tabCanvas" | "replay.set.tabIct" }[] = [
  { id: "symbol", icon: CandlestickChartIcon, key: "replay.set.tabSymbol" },
  { id: "canvas", icon: BrushIcon, key: "replay.set.tabCanvas" },
  { id: "ict", icon: LayersIcon, key: "replay.set.tabIct" },
];

/** Cửa sổ Cài đặt: đổi tới đâu chart đổi tới đó; OK để lưu, Huỷ (hoặc Esc, click ra ngoài) để trả lại. */
export function SettingsDialog() {
  const store = useReplayStore();
  const { t } = useI18n();
  const open = useReplay((s) => s.settingsOpen);
  const [tab, setTab] = useState<Tab>("symbol");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && store.closeSettings(false)}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] w-[min(880px,calc(100%-2rem))] flex-col sm:max-w-none">
        <DialogTitle>{t("replay.set.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("replay.set.description")}</DialogDescription>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-auto sm:grid-cols-[12rem_1fr]">
          <div role="tablist" aria-orientation="vertical" className="flex gap-1 sm:flex-col">
            {TABS.map(({ id, icon: Icon, key }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-tab={id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-text-muted hover:text-foreground aria-selected:bg-surface-raised aria-selected:font-medium aria-selected:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => setTab(id)}
              >
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="min-w-0">
            {tab === "symbol" && <SymbolTab />}
            {tab === "canvas" && <CanvasTab />}
            {tab === "ict" && <IctTab />}
          </div>
        </div>
        <DialogFooter className="items-center gap-2 border-t border-border pt-4 sm:justify-between">
          <select
            className={cn(FIELD, "cursor-pointer")}
            aria-label={t("replay.set.template")}
            value=""
            onChange={(e) => {
              if (e.target.value) store.applyTemplate(e.target.value as ChartTemplate);
            }}
          >
            <option value="">{t("replay.set.template")}</option>
            <option value="light">{t("replay.set.templateLight")}</option>
            <option value="dark">{t("replay.set.templateDark")}</option>
          </select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => store.closeSettings(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => store.closeSettings(true)} data-testid="replay-settings-ok">
              {t("replay.set.ok")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
