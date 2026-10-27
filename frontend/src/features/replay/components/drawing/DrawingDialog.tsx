import { useState, type ReactNode } from "react";
import { BoldIcon, ItalicIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/strings";
import { FIB_DEFAULT_LEVELS, FIB_GRAY, withDefaults, type Drawing, type DrawTool, type EndCap, type FibLevel, type FibValueMode, type TextH, type TextV } from "../../engine/drawings";
import { defaultVisibility, FONT_SIZES, STAT_KEYS, STATS_POS, VIS_MAX, WIDTHS, type StatKey, type Visibility } from "../../engine/drawStyle";
import { LINE_STYLES } from "../../engine/ict";
import { logicalToTime, timeToLogical } from "../../engine/projector";
import { readPref, writePref } from "../../engine/storage";
import { TICK } from "../../engine/trading";
import { useReplay, useReplayStore } from "../../store/context";
import { LINE_STYLE_LABEL, TOOL_NAME } from "../labels";
import { Check, ColorButton, LineButton, MultiCheck, Row, SelectField } from "./fields";
import { TemplateMenu } from "./TemplateMenu";

/**
 * Cửa sổ Cài đặt của một hình (nút bánh răng trên thanh nổi, hoặc nhấp đúp vào hình), như TradingView.
 * Sửa tới đâu chart đổi tới đó; Cancel / Esc trả lại như cũ, Ok giữ lại thành một bước hoàn tác.
 * Không phủ tối chart (non-modal) để vừa sửa vừa nhìn hình.
 */

type Tab = "style" | "text" | "coords" | "visibility";
const TABS: Record<DrawTool, readonly Tab[]> = {
  trend: ["style", "text", "coords", "visibility"],
  hray: ["style", "text", "coords", "visibility"],
  rect: ["style", "text", "coords", "visibility"],
  brush: ["style", "visibility"],
  path: ["style", "visibility"],
  fib: ["style", "coords", "visibility"],
  long: ["visibility"],
  short: ["visibility"],
  text: ["text", "visibility"],
};
const TAB_LABEL: Record<Tab, TranslationKey> = { style: "replay.dw.tabStyle", text: "replay.dw.tabText", coords: "replay.dw.tabCoords", visibility: "replay.dw.tabVisibility" };
const TAB_KEY = "drawTab";

const STAT_LABEL: Record<StatKey, TranslationKey> = {
  priceRange: "replay.dw.statPriceRange", percent: "replay.dw.statPercent", ticks: "replay.dw.statTicks", bars: "replay.dw.statBars",
  dateRange: "replay.dw.statDateRange", distance: "replay.dw.statDistance", angle: "replay.dw.statAngle",
};
const POS_LABEL: Record<(typeof STATS_POS)[number], TranslationKey> = { left: "replay.dw.left", center: "replay.dw.center", right: "replay.dw.right", auto: "replay.dw.auto" };
const V_LABEL: Record<TextV, TranslationKey> = { top: "replay.dw.top", middle: "replay.dw.middle", bottom: "replay.dw.bottom", inside: "replay.dw.inside" };
const H_LABEL: Record<TextH, TranslationKey> = { left: "replay.dw.left", center: "replay.dw.center", right: "replay.dw.right" };
const H_OPTIONS: readonly TextH[] = ["left", "center", "right"];
/** Căn dọc của chữ theo một đường (không có "inside" như hình chữ nhật). */
const LINE_V = ["top", "middle", "bottom"] as const;
const VIS_LABEL: Record<keyof Visibility, TranslationKey> = { min: "replay.dw.visMinutes", hour: "replay.dw.visHours", day: "replay.dw.visDays" };

type Apply = (patch: Partial<Drawing>) => void;

export function DrawingDialog() {
  const store = useReplayStore();
  const { t } = useI18n();
  const id = useReplay((s) => s.drawDialog);
  const raw = useReplay((s) => s.drawings.find((x) => x.id === s.drawDialog));
  const [tabFor, setTabFor] = useState<{ id: number | null; tab: Tab }>({ id: null, tab: "style" });
  const [renaming, setRenaming] = useState(false);

  // mở cho hình khác: vào tab dùng lần trước (nếu công cụ này có tab đó)
  let tab = tabFor.tab;
  if (raw && tabFor.id !== id) {
    const tabs = TABS[raw.type];
    const want = readPref<Tab>(TAB_KEY, "style");
    tab = tabs.includes(want) ? want : tabs[0];
    setTabFor({ id, tab });
    setRenaming(false);
  }
  if (id == null || !raw) return null;
  const d = withDefaults(raw);
  const set: Apply = (patch) => store.previewDrawing(patch);
  const tabs = TABS[d.type];
  const title = d.name ?? t(TOOL_NAME[d.type]);
  const pick = (x: Tab) => {
    setTabFor({ id, tab: x });
    writePref(TAB_KEY, x);
  };

  return (
    <Dialog open modal={false} onOpenChange={(o) => !o && store.closeDrawDialog(false)}>
      <DialogContent
        className={cn("flex max-h-[calc(100svh-2rem)] flex-col gap-0 p-0 sm:max-w-none", d.type === "fib" ? "w-[min(440px,calc(100%-2rem))]" : "w-[min(360px,calc(100%-2rem))]")}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="replay-draw-dialog"
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          {renaming ? (
            <Input
              autoFocus aria-label={t("replay.dw.rename")} defaultValue={title}
              className="h-8 min-w-0 flex-1 text-lg font-semibold md:text-lg"
              onBlur={(e) => {
                const v = e.target.value.trim();
                set({ name: v && v !== t(TOOL_NAME[d.type]) ? v : undefined });
                setRenaming(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <>
              <DialogTitle className="text-lg">{title}</DialogTitle>
              <Button variant="ghost" size="icon-xs" className="text-text-muted" aria-label={t("replay.dw.rename")} onClick={() => setRenaming(true)}>
                <PencilIcon aria-hidden />
              </Button>
            </>
          )}
        </div>
        <DialogDescription className="sr-only">{t("replay.dw.description")}</DialogDescription>
        <Tabs value={tab} onValueChange={(x) => pick(x as Tab)} className="min-h-0 flex-1">
          <TabsList className="px-5">
            {tabs.map((x) => (
              <TabsTrigger key={x} value={x}>{t(TAB_LABEL[x])}</TabsTrigger>
            ))}
          </TabsList>
          {/* Radix chỉ dựng tab đang mở: tab Text tự focus ô chữ mỗi lần mở ra */}
          {tabs.map((x) => (
            <TabsContent key={x} value={x} className="flex min-h-40 flex-col gap-3 overflow-auto px-5 py-4">
              {x === "style" && <StyleTab d={d} set={set} />}
              {x === "text" && (d.type === "text" ? <TextToolTab d={d} set={set} /> : <NoteTab d={d} set={set} />)}
              {x === "coords" && <CoordsTab d={d} set={set} />}
              {x === "visibility" && <VisibilityTab d={d} set={set} />}
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <TemplateMenu d={raw} apply={set} variant="dialog" />
          <span className="flex-1" />
          <Button variant="outline" onClick={() => store.closeDrawDialog(false)}>{t("replay.dw.cancel")}</Button>
          <Button onClick={() => store.closeDrawDialog(true)}>{t("replay.dw.ok")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndSelect({ value, onChange, label }: { value: EndCap; onChange: (v: EndCap) => void; label: string }) {
  const { t } = useI18n();
  return (
    <SelectField
      label={label} value={value} onChange={onChange} className="w-24"
      options={[{ value: "normal", label: t("replay.dw.endNormal") }, { value: "arrow", label: t("replay.dw.endArrow") }]}
    />
  );
}

/** Extend: hai ô tích trong một ô chọn; không tích gì = "Don't extend". */
function ExtendField({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  const opts = [
    { key: "extL", label: t(d.type === "rect" ? "replay.dw.extendLeft" : "replay.dw.extendLeftLine"), checked: !!d.extL },
    { key: "extR", label: t(d.type === "rect" ? "replay.dw.extendRight" : "replay.dw.extendRightLine"), checked: !!d.extR },
  ];
  const on = opts.filter((o) => o.checked);
  return (
    <Row label={t("replay.dw.extend")}>
      <MultiCheck
        label={t("replay.dw.extend")} summary={on.length ? on.map((o) => o.label).join(", ") : t("replay.dw.dontExtend")} options={opts}
        onToggle={(key) => set({ [key]: !d[key as "extL" | "extR"] })}
      />
    </Row>
  );
}

function StyleTab({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  const line = (
    <LineButton
      label={t("replay.dw.line")} color={d.color ?? "var(--replay-draw)"} width={d.width ?? 2} dash={d.dash} noStyle={d.type === "brush"}
      onChange={set}
    />
  );
  switch (d.type) {
    case "trend": {
      const stats = d.stats ?? [];
      return (
        <>
          <Row label={t("replay.dw.line")}>
            {line}
            <EndSelect label={t("replay.dw.leftEnd")} value={d.endL ?? "normal"} onChange={(v) => set({ endL: v })} />
            <EndSelect label={t("replay.dw.rightEnd")} value={d.endR ?? "normal"} onChange={(v) => set({ endR: v })} />
          </Row>
          <ExtendField d={d} set={set} />
          <Check label={t("replay.dw.midPoint")} checked={!!d.midPoint} onChange={(v) => set({ midPoint: v })} />
          <Check label={t("replay.dw.priceLabels")} checked={!!d.priceLabels} onChange={(v) => set({ priceLabels: v })} />
          <Section>{t("replay.dw.info")}</Section>
          <Row label={t("replay.dw.stats")}>
            <MultiCheck
              label={t("replay.dw.stats")} summary={stats.length ? stats.map((k) => t(STAT_LABEL[k])).join(", ") : t("replay.dw.hidden")}
              options={STAT_KEYS.map((k) => ({ key: k, label: t(STAT_LABEL[k]), checked: stats.includes(k) }))}
              onToggle={(key) => {
                const k = key as StatKey;
                set({ stats: stats.includes(k) ? stats.filter((x) => x !== k) : STAT_KEYS.filter((x) => x === k || stats.includes(x)) });
              }}
            />
          </Row>
          <Row label={t("replay.dw.statsPosition")}>
            <SelectField label={t("replay.dw.statsPosition")} value={d.statsPos ?? "right"} onChange={(v) => set({ statsPos: v })} className="w-44" options={STATS_POS.map((p) => ({ value: p, label: t(POS_LABEL[p]) }))} />
          </Row>
          <Check label={t("replay.dw.alwaysShowStats")} checked={!!d.statsAlways} onChange={(v) => set({ statsAlways: v })} />
        </>
      );
    }
    case "rect":
      return (
        <>
          <ExtendField d={d} set={set} />
          <Row label={t("replay.dw.border")}>
            <LineButton label={t("replay.dw.border")} color={d.color ?? "var(--replay-draw-rect)"} width={d.width ?? 2} dash={d.dash} onChange={set} />
          </Row>
          <Check label={t("replay.dw.middleLine")} checked={!!d.midLine} onChange={(v) => set({ midLine: v })}>
            <LineButton
              label={t("replay.dw.middleLine")} color={d.midColor ?? "var(--replay-draw-rect-mid)"} width={d.midWidth ?? 1} dash={d.midDash} disabled={!d.midLine}
              onChange={(p) => set({ midColor: p.color ?? d.midColor, midWidth: p.width ?? d.midWidth, midDash: p.dash ?? d.midDash })}
            />
          </Check>
          <Check label={t("replay.dw.background")} checked={!!d.fillOn} onChange={(v) => set({ fillOn: v })}>
            <ColorButton label={t("replay.dw.background")} value={d.fill ?? "transparent"} onChange={(c) => set({ fill: c })} disabled={!d.fillOn} />
          </Check>
        </>
      );
    case "hray":
      return (
        <>
          <Row label={t("replay.dw.line")}>{line}</Row>
          <Check label={t("replay.dw.priceLabel")} checked={!!d.priceLabel} onChange={(v) => set({ priceLabel: v })} />
        </>
      );
    case "fib":
      return <FibStyleTab d={d} set={set} />;
    case "path":
      return (
        <Row label={t("replay.dw.line")}>
          {line}
          <EndSelect label={t("replay.dw.leftEnd")} value={d.endL ?? "normal"} onChange={(v) => set({ endL: v })} />
          <EndSelect label={t("replay.dw.rightEnd")} value={d.endR ?? "arrow"} onChange={(v) => set({ endR: v })} />
        </Row>
      );
    default:
      return <Row label={t("replay.dw.line")}>{line}</Row>;
  }
}

/**
 * Tab Style của Fibonacci thoái lui, theo cửa sổ của TradingView: đường xu hướng, nét các mức, kéo
 * dài, 24 mức (bật/tắt · tỉ lệ · màu), một màu cho tất cả, nền, đảo chiều, giá / mức / nhãn, cỡ chữ,
 * thang log.
 */
function FibStyleTab({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  const levels = d.fibLevels ?? FIB_DEFAULT_LEVELS;
  const setLevel = (i: number, patch: Partial<FibLevel>) => set({ fibLevels: levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <>
      <Check label={t("replay.dw.fibTrendLine")} checked={!!d.fibTrend} onChange={(v) => set({ fibTrend: v })}>
        <LineButton label={t("replay.dw.fibTrendLine")} color={d.color ?? FIB_GRAY} width={d.width ?? 1} dash={d.dash} disabled={!d.fibTrend} onChange={set} />
      </Check>
      <Row label={t("replay.dw.fibLevelsLine")}>
        <SelectField label={t("replay.dw.fibLevelWidth")} value={d.fibLevelWidth ?? 1} onChange={(v) => set({ fibLevelWidth: v })} className="w-20" options={WIDTHS.map((w) => ({ value: w, label: `${w}px` }))} />
        <SelectField label={t("replay.dw.fibLevelStyle")} value={d.fibLevelDash ?? "solid"} onChange={(v) => set({ fibLevelDash: v })} className="w-28" options={LINE_STYLES.map((x) => ({ value: x, label: t(LINE_STYLE_LABEL[x]) }))} />
      </Row>
      <ExtendField d={d} set={set} />
      <Section>{t("replay.dw.fibLevels")}</Section>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="fib-levels">
        {levels.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Checkbox checked={l.on} aria-label={t("replay.dw.fibLevelOn", { n: i + 1 })} onCheckedChange={(v) => setLevel(i, { on: v === true })} />
            <NumberField aria-label={t("replay.dw.fibLevelValue", { n: i + 1 })} value={l.v} step={0.001} className="w-24" disabled={!l.on} onValueChange={(v) => Number.isFinite(v) && setLevel(i, { v })} />
            <ColorButton label={t("replay.dw.fibLevelColor", { n: i + 1 })} value={l.color} disabled={!l.on} onChange={(c) => setLevel(i, { color: c })} />
          </div>
        ))}
      </div>
      <Check label={t("replay.dw.fibOneColor")} checked={d.fibOneColor != null} onChange={(v) => set({ fibOneColor: v ? FIB_GRAY : undefined })}>
        {d.fibOneColor != null && <ColorButton label={t("replay.dw.fibOneColor")} value={d.fibOneColor} onChange={(c) => set({ fibOneColor: c })} />}
      </Check>
      <Check label={t("replay.dw.background")} checked={!!d.fibBg} onChange={(v) => set({ fibBg: v })}>
        <Slider
          thumbLabel={t("replay.dw.fibBgOpacity")} className="w-32" min={0} max={100} step={1} disabled={!d.fibBg}
          value={[Math.round((d.fibBgOpacity ?? 0.15) * 100)]} onValueChange={([v]) => set({ fibBgOpacity: v / 100 })}
        />
      </Check>
      <Check label={t("replay.dw.fibReverse")} checked={!!d.fibReverse} onChange={(v) => set({ fibReverse: v })} />
      <Check label={t("replay.dw.fibPrices")} checked={!!d.fibPrices} onChange={(v) => set({ fibPrices: v })} />
      <Check label={t("replay.dw.fibValues")} checked={!!d.fibValues} onChange={(v) => set({ fibValues: v })}>
        <SelectField<FibValueMode>
          label={t("replay.dw.fibValueMode")} value={d.fibValueMode ?? "value"} onChange={(v) => set({ fibValueMode: v })} className="w-28"
          options={[{ value: "value", label: t("replay.dw.fibModeValue") }, { value: "percent", label: t("replay.dw.fibModePercent") }]}
        />
      </Check>
      <Row label={t("replay.dw.fibLabels")}>
        <SelectField label={t("replay.dw.alignHorizontal")} value={d.fibLabelH ?? "left"} onChange={(v) => set({ fibLabelH: v })} className="w-24" options={H_OPTIONS.map((h) => ({ value: h, label: t(H_LABEL[h]) }))} />
        <SelectField label={t("replay.dw.alignVertical")} value={d.fibLabelV ?? "middle"} onChange={(v) => set({ fibLabelV: v })} className="w-24" options={LINE_V.map((v) => ({ value: v, label: t(V_LABEL[v]) }))} />
      </Row>
      <Row label={t("replay.dw.fontSize")}>
        <SelectField label={t("replay.dw.fontSize")} value={d.fibFontSize ?? 12} onChange={(v) => set({ fibFontSize: v })} className="w-20" options={FONT_SIZES.map((x) => ({ value: x, label: String(x) }))} />
      </Row>
      <Check label={t("replay.dw.fibLog")} checked={!!d.fibLog} onChange={(v) => set({ fibLog: v })} />
    </>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="pt-1 text-xs font-medium tracking-wide text-text-muted uppercase">{children}</div>;
}

/** Màu · cỡ · đậm · nghiêng (dòng đầu của tab Text). */
function FontRow({ color, size, b, i, onChange }: { color: string; size: number; b: boolean; i: boolean; onChange: (p: { color?: string; size?: number; b?: boolean; i?: boolean }) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <ColorButton label={t("replay.dw.textColor")} value={color} onChange={(c) => onChange({ color: c })} />
      <SelectField label={t("replay.dw.fontSize")} value={size} onChange={(v) => onChange({ size: v })} className="w-20" options={FONT_SIZES.map((x) => ({ value: x, label: String(x) }))} />
      <Toggle variant="outline" pressed={b} aria-label={t("replay.dw.bold")} onPressedChange={(v) => onChange({ b: v })}>
        <BoldIcon aria-hidden />
      </Toggle>
      <Toggle variant="outline" pressed={i} aria-label={t("replay.dw.italic")} onPressedChange={(v) => onChange({ i: v })}>
        <ItalicIcon aria-hidden />
      </Toggle>
    </div>
  );
}

const AREA = "min-h-24 resize-y";

/** Tab Text của đường / tia / hình chữ nhật (ghi chú trên hình). */
function NoteTab({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  const vs: readonly TextV[] = d.type === "rect" ? ["top", "inside", "bottom"] : LINE_V;
  return (
    <>
      <FontRow
        color={d.noteColor ?? d.color ?? "var(--replay-draw)"} size={d.noteSize ?? 14} b={!!d.noteB} i={!!d.noteI}
        onChange={(p) => set({ ...(p.color && { noteColor: p.color }), ...(p.size && { noteSize: p.size }), ...(p.b !== undefined && { noteB: p.b }), ...(p.i !== undefined && { noteI: p.i }) })}
      />
      <Textarea className={AREA} aria-label={t("replay.dw.text")} placeholder={t("replay.dw.addText")} value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} autoFocus />
      <Row label={t("replay.dw.textAlignment")}>
        <SelectField label={t("replay.dw.alignVertical")} value={d.noteV ?? vs[0]} onChange={(v) => set({ noteV: v })} className="w-28" options={vs.map((v) => ({ value: v, label: t(V_LABEL[v]) }))} />
        <SelectField label={t("replay.dw.alignHorizontal")} value={d.noteH ?? "center"} onChange={(v) => set({ noteH: v })} className="w-28" options={H_OPTIONS.map((h) => ({ value: h, label: t(H_LABEL[h]) }))} />
      </Row>
    </>
  );
}

/** Tab Text của công cụ Text. */
function TextToolTab({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  return (
    <>
      <FontRow
        color={d.color ?? "var(--replay-draw)"} size={d.noteSize ?? 14} b={!!d.noteB} i={!!d.noteI}
        onChange={(p) => set({ ...(p.color && { color: p.color }), ...(p.size && { noteSize: p.size }), ...(p.b !== undefined && { noteB: p.b }), ...(p.i !== undefined && { noteI: p.i }) })}
      />
      <Textarea className={AREA} aria-label={t("replay.dw.text")} value={d.text ?? ""} onChange={(e) => set({ text: e.target.value })} autoFocus />
    </>
  );
}

/** Tab Coordinates: giá và số thứ tự nến (theo khung của chart đang hiện hình) của từng điểm. */
function CoordsTab({ d, set }: { d: Drawing; set: Apply }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const st = store.getState();
  const k = st.panes[st.active].ds === d.sym ? st.active : st.panes[0].ds === d.sym ? 0 : 1;
  const candles = store.candles[k];
  const tf = st.panes[k].tf;
  const update = (i: number, patch: { t?: number; p?: number }) => set({ pts: d.pts.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  return (
    <>
      {d.pts.map((q, i) => (
        <Row key={i} label={t("replay.dw.pointN", { n: i + 1 })}>
          <NumberField aria-label={t("replay.dw.pointPrice", { n: i + 1 })} value={q.p} step={TICK} onValueChange={(v) => update(i, { p: v })} />
          <NumberField
            aria-label={t("replay.dw.pointBar", { n: i + 1 })} value={Math.round(timeToLogical(candles, tf, q.t) ?? 0)} step={1} className="w-20"
            onValueChange={(v) => {
              const time = logicalToTime(candles, tf, Math.round(v));
              if (time != null) update(i, { t: time });
            }}
          />
        </Row>
      ))}
    </>
  );
}

/** Tab Visibility: bật/tắt và khoảng khung cho phút, giờ, ngày. */
function VisibilityTab({ d, set }: { d: Drawing; set: Apply }) {
  const { t } = useI18n();
  const vis = d.vis ?? defaultVisibility();
  const row = (key: keyof Visibility, patch: Partial<Visibility[keyof Visibility]>) => set({ vis: { ...vis, [key]: { ...vis[key], ...patch } } });
  const clamp = (key: keyof Visibility, v: number) => Math.max(1, Math.min(VIS_MAX[key], Math.round(v)));
  // "từ" lớn hơn "đến" thì hình biến mất ở cả họ khung đó mà không báo gì: rời ô thì kéo ô kia theo.
  // Không sửa lúc đang gõ, vì gõ "15" sẽ đi qua "1" và kéo ô kia theo một giá trị dở.
  const order = (key: keyof Visibility, moved: "from" | "to") => {
    const r = vis[key];
    if (r.from > r.to) row(key, moved === "from" ? { to: r.from } : { from: r.to });
  };
  return (
    <>
      {(Object.keys(VIS_LABEL) as (keyof Visibility)[]).map((key) => (
        <Check key={key} label={t(VIS_LABEL[key])} checked={vis[key].on} onChange={(v) => row(key, { on: v })}>
          <NumberField
            aria-label={t("replay.dw.visFrom", { unit: t(VIS_LABEL[key]) })} value={vis[key].from} min={1} max={VIS_MAX[key]} className="w-20" disabled={!vis[key].on}
            onValueChange={(v) => row(key, { from: clamp(key, v) })}
            onBlur={() => order(key, "from")}
          />
          <span className="text-text-muted">–</span>
          <NumberField
            aria-label={t("replay.dw.visTo", { unit: t(VIS_LABEL[key]) })} value={vis[key].to} min={1} max={VIS_MAX[key]} className="w-20" disabled={!vis[key].on}
            onValueChange={(v) => row(key, { to: clamp(key, v) })}
            onBlur={() => order(key, "to")}
          />
        </Check>
      ))}
    </>
  );
}
