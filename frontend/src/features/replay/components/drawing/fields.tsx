import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { resolveColor } from "../../chart/colors";
import { parseColor, TV_PALETTE, WIDTHS, withAlpha } from "../../engine/drawStyle";
import { DASH, LINE_STYLES, type LineStyle } from "../../engine/ict";
import { readPref, writePref } from "../../engine/storage";
import { LINE_STYLE_LABEL } from "../labels";

/**
 * Ô điều khiển dùng chung của thanh nổi và cửa sổ Cài đặt hình vẽ, theo giao diện TradingView:
 * bảng màu 10 × 8 + màu tự chọn + Opacity (kèm Thickness / Line style khi là ô "nét").
 * Chỉ dựng từ component ở components/ui — không dùng ô nhập mặc định của trình duyệt.
 */

const CUSTOM_MAX = 10;
const BOX = "flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-modal px-2 text-sm text-foreground hover:bg-surface-raised";
const PANEL_W = "w-[232px]";

/** Bảng chọn màu. Giữ nguyên độ trong suốt khi đổi màu; Opacity đổi riêng phần trong suốt. */
export function ColorPanel({
  value, onChange, opacity = true, width, onWidth, dash, onDash,
}: {
  value: string;
  onChange: (c: string) => void;
  opacity?: boolean;
  width?: number;
  onWidth?: (w: number) => void;
  dash?: LineStyle;
  onDash?: (d: LineStyle) => void;
}) {
  const { t } = useI18n();
  const { hex, a } = parseColor(resolveColor(value));
  const [custom, setCustom] = useState<string[]>(() => readPref<string[]>("customColors", []));
  // "+" mở bảng tự chọn màu ngay trong ô này (như TradingView), bấm Add mới áp và lưu vào hàng màu riêng
  const [picking, setPicking] = useState<string | null>(null);
  // màu của bảng là var(--replay-tv-N): đục hẳn thì lưu nguyên biến, có trong suốt thì lưu rgba
  const pick = (c: string) => onChange(a >= 1 ? c : withAlpha(parseColor(resolveColor(c)).hex, a));
  const same = (c: string) => {
    if (c === value) return true;
    const r = resolveColor(c);
    return r !== "transparent" && parseColor(r).hex === hex;
  };
  const swatch = (c: string, key: string, label: string) => (
    <button
      key={key} type="button" role="option" aria-selected={same(c)} aria-label={label} data-color={c}
      className="size-[18px] cursor-pointer rounded-[3px] border border-border aria-selected:outline-2 aria-selected:outline-offset-1 aria-selected:outline-foreground"
      style={{ background: c }}
      onClick={() => pick(c)}
    />
  );

  if (picking != null) {
    return (
      <div className={cn("flex flex-col gap-3", PANEL_W)} data-testid="replay-color-panel">
        <ColorPicker
          value={picking} onChange={setPicking}
          labels={{ area: t("replay.dw.colorArea"), hue: t("replay.dw.hue"), hex: t("replay.dw.hex") }}
        />
        <Button
          size="sm"
          onClick={() => {
            const next = [picking, ...custom.filter((x) => x !== picking)].slice(0, CUSTOM_MAX);
            setCustom(next);
            writePref("customColors", next);
            pick(picking);
            setPicking(null);
          }}
        >
          {t("replay.dw.addColor")}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", PANEL_W)} data-testid="replay-color-panel">
      <div className="grid grid-cols-10 gap-1" role="listbox" aria-label={t("replay.dw.color")}>
        {TV_PALETTE.slice(0, 20).map((c, i) => swatch(c, `p${i}`, t("replay.dw.colorN", { n: i + 1 })))}
      </div>
      <div className="grid grid-cols-10 gap-1" role="listbox" aria-label={t("replay.dw.colorShades")}>
        {TV_PALETTE.slice(20).map((c, i) => swatch(c, `s${i}`, t("replay.dw.colorN", { n: i + 21 })))}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
        {custom.map((c, i) => swatch(c, `c${i}`, c))}
        <button type="button" className="grid size-[18px] cursor-pointer place-items-center rounded-[3px] text-foreground hover:bg-surface-raised" aria-label={t("replay.dw.customColor")} onClick={() => setPicking(hex)}>
          <PlusIcon className="size-4" aria-hidden />
        </button>
      </div>
      {opacity && (
        <div className="flex flex-col gap-1.5 text-xs text-text-muted">
          {t("replay.dw.opacity")}
          <span className="flex items-center gap-3">
            <Slider
              min={0} max={100} step={1} value={[Math.round(a * 100)]} thumbLabel={t("replay.dw.opacity")} className="flex-1"
              onValueChange={([v]) => onChange(withAlpha(hex, v / 100))}
            />
            <span className="w-11 rounded-md border border-border px-1 py-0.5 text-right text-foreground">{Math.round(a * 100)}%</span>
          </span>
        </div>
      )}
      {onWidth && (
        <div className="flex flex-col gap-1 text-xs text-text-muted">
          {t("replay.dw.thickness")}
          <ToggleGroup type="single" aria-label={t("replay.dw.thickness")} value={`${width}`} onValueChange={(v) => v && onWidth(+v)}>
            {WIDTHS.map((w) => (
              <ToggleGroupItem key={w} value={`${w}`} size="sm" aria-label={`${w}px`}>
                <span className="block w-6 bg-current" style={{ height: w }} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {onDash && (
        <div className="flex flex-col gap-1 text-xs text-text-muted">
          {t("replay.dw.lineStyle")}
          <ToggleGroup type="single" aria-label={t("replay.dw.lineStyle")} value={dash ?? "solid"} onValueChange={(v) => v && onDash(v as LineStyle)}>
            {LINE_STYLES.map((s) => (
              <ToggleGroupItem key={s} value={s} size="sm" aria-label={t(LINE_STYLE_LABEL[s])}>
                <LineSample dash={s} width={2} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}

/** Mẫu nét nhỏ (cho nút độ dày / kiểu nét). */
export function LineSample({ dash, width, color = "currentColor", w = 24 }: { dash?: LineStyle; width: number; color?: string; w?: number }) {
  return (
    <svg width={w} height={8} aria-hidden>
      <line x1={0} y1={4} x2={w} y2={4} stroke={color} strokeWidth={width} strokeDasharray={dash && DASH[dash] ? DASH[dash] : undefined} />
    </svg>
  );
}

/** Ô màu mở bảng màu (không có Thickness / Line style). */
export function ColorButton({ value, onChange, label, opacity = true, disabled }: { value: string; onChange: (c: string) => void; label: string; opacity?: boolean; disabled?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" aria-label={label} title={label} className={cn("grid size-8 cursor-pointer place-items-center rounded-md border border-border bg-surface-modal hover:bg-surface-raised disabled:cursor-default disabled:opacity-50")}>
          <span className="size-5 rounded-[3px] border border-border" style={{ background: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <ColorPanel value={value} onChange={onChange} opacity={opacity} />
      </PopoverContent>
    </Popover>
  );
}

/** Ô "nét": màu + mẫu nét; mở bảng màu kèm Thickness và (tuỳ) Line style. */
export function LineButton({
  color, width, dash, onChange, label, noStyle, disabled,
}: {
  color: string;
  width: number;
  dash?: LineStyle;
  onChange: (patch: { color?: string; width?: number; dash?: LineStyle }) => void;
  label: string;
  noStyle?: boolean;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" aria-label={label} title={label} className={cn("cursor-pointer", BOX, "disabled:cursor-default disabled:opacity-50")}>
          <span className="size-5 rounded-[3px] border border-border" style={{ background: color }} />
          <LineSample dash={dash} width={Math.min(width, 3)} color={color} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <ColorPanel
          value={color} onChange={(c) => onChange({ color: c })} width={width} onWidth={(w) => onChange({ width: w })}
          dash={dash} onDash={noStyle ? undefined : (d) => onChange({ dash: d })}
        />
      </PopoverContent>
    </Popover>
  );
}

export function Check({ checked, onChange, label, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-h-8 items-center gap-3">
      <div className="flex min-w-36 items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="font-normal text-foreground">{label}</Label>
      </div>
      {children}
    </div>
  );
}

export function SelectField<V extends string | number>({
  value, options, onChange, label, className,
}: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select
      value={`${value}`}
      onValueChange={(s) => {
        const o = options.find((x) => `${x.value}` === s);
        if (o) onChange(o.value);
      }}
    >
      <SelectTrigger aria-label={label} className={cn("h-8 bg-surface-modal", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={`${o.value}`} value={`${o.value}`}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Ô chọn nhiều (Extend, Stats): hiện tóm tắt, mở danh sách ô tích; tích xong menu vẫn mở. */
export function MultiCheck({ label, summary, options, onToggle }: { label: string; summary: string; options: readonly { key: string; label: string; checked: boolean }[]; onToggle: (key: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={cn("cursor-pointer", BOX, "w-44 justify-between")}>
          <span className="truncate">{summary}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" aria-label={label}>
        {options.map((o) => (
          <DropdownMenuCheckboxItem key={o.key} checked={o.checked} onCheckedChange={() => onToggle(o.key)} onSelect={(e) => e.preventDefault()}>
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Một hàng của cửa sổ Cài đặt: nhãn bên trái, ô điều khiển bên phải. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
