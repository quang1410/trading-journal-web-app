import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  CirclePlusIcon, EllipsisIcon, GripVerticalIcon, LockIcon, LockOpenIcon, PaintBucketIcon, PencilIcon, PinIcon, PlusIcon, SettingsIcon, TextCursorInputIcon, Trash2Icon, TypeIcon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { drawingXY, withDefaults, type Drawing, type DrawTool } from "../../engine/drawings";
import { FIB_WIDTHS, FONT_SIZES, matchVisPreset, VIS_PRESETS, visPreset, WIDTHS, type VisPreset } from "../../engine/drawStyle";
import { LINE_STYLES } from "../../engine/ict";
import type { Projector, XY } from "../../engine/projector";
import { readPref, writePref } from "../../engine/storage";
import { useReplay, useReplayStore } from "../../store/context";
import type { PaneIndex } from "../../store/ReplayStore";
import { LINE_STYLE_LABEL } from "../labels";
import { ColorPanel, LineSample } from "./fields";
import { TemplateMenu } from "./TemplateMenu";

/**
 * Thanh nổi của hình đang chọn, như TradingView: mỗi công cụ một bộ nút. Nằm ở đầu chart (không bám
 * theo hình), kéo tay nắm để dời; vị trí nhớ trong trình duyệt.
 */

type Btn =
  | "templates" | "lineColor" | "fillColor" | "textColor" | "targetColor" | "stopColor" | "width" | "style" | "fontSize"
  | "createOrder" | "editText" | "anchor" | "settings" | "lock" | "delete" | "more";

const BUTTONS: Record<DrawTool, readonly Btn[]> = {
  trend: ["templates", "lineColor", "textColor", "width", "style", "settings", "lock", "delete", "more"],
  hray: ["templates", "lineColor", "textColor", "width", "style", "settings", "lock", "delete", "more"],
  rect: ["templates", "lineColor", "fillColor", "textColor", "width", "style", "settings", "lock", "delete", "more"],
  brush: ["templates", "lineColor", "width", "settings", "lock", "delete", "more"],
  path: ["templates", "lineColor", "width", "style", "settings", "lock", "delete", "more"],
  // Fib: màu / độ dày / kiểu nét ở đây là của các mức (màu = "dùng một màu"), như FX Replay
  fib: ["templates", "lineColor", "width", "style", "settings", "lock", "delete", "more"],
  long: ["templates", "textColor", "targetColor", "stopColor", "createOrder", "settings", "lock", "delete", "more"],
  short: ["templates", "textColor", "targetColor", "stopColor", "createOrder", "settings", "lock", "delete", "more"],
  text: ["templates", "editText", "textColor", "fontSize", "anchor", "settings", "lock", "delete", "more"],
};

const BTN = "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-foreground hover:bg-surface-raised";
const VIS_LABEL: Record<VisPreset, "replay.dw.visAll" | "replay.dw.visCurrent" | "replay.dw.visUp" | "replay.dw.visDown"> = {
  all: "replay.dw.visAll", current: "replay.dw.visCurrent", up: "replay.dw.visUp", down: "replay.dw.visDown",
};
const POS_KEY = "float.drawbar";

/** Icon có vạch màu bên dưới (màu nét / nền / chữ). */
function Tinted({ icon, color }: { icon: ReactNode; color: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      {icon}
      <span className="block h-[3px] w-5 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Nút mở bảng màu (Popover: bảng màu có ô nhập hex, không hợp với điều hướng phím của menu). */
function ColorMenu({ trigger, label, children }: { trigger: ReactNode; label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("cursor-pointer", BTN)} aria-label={label} title={label}>
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Nút mở danh sách chọn một (độ dày, kiểu nét, cỡ chữ). */
function PickMenu<V extends string | number>({
  trigger, label, value, options, onPick, className,
}: {
  trigger: ReactNode;
  label: string;
  value: V;
  options: readonly { value: V; content: ReactNode }[];
  onPick: (v: V) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("cursor-pointer", BTN)} aria-label={label} title={label}>
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn("min-w-0", className)} align="start">
        <DropdownMenuRadioGroup
          value={`${value}`}
          onValueChange={(s) => {
            const o = options.find((x) => `${x.value}` === s);
            if (o) onPick(o.value);
          }}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={`${o.value}`} value={`${o.value}`}>
              {o.content}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DrawingBar({ k, proj }: { k: PaneIndex; proj: Projector | null }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const selected = useReplay((s) => s.selected);
  const drawings = useReplay((s) => s.drawings);
  const pane = useReplay((s) => s.panes[k]);
  const active = useReplay((s) => s.active);
  const busy = useReplay((s) => !!(s.draft || s.tool || s.drawMode || s.selectMode));
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(() => readPref<[number, number] | null>(POS_KEY, null));
  const [w, setW] = useState(320);
  const grab = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (el && el.offsetWidth && el.offsetWidth !== w) setW(el.offsetWidth);
  });

  const raw = drawings.find((x) => x.id === selected && x.sym === pane.ds);
  // hình của mã hiện ở cả hai chart thì thanh chỉ hiện ở chart đang chọn
  const owner = raw && (store.getState().panes[active].ds === raw.sym ? active : k);
  if (!raw || !proj || busy || owner !== k || raw.hidden) return null;
  const d = withDefaults(raw);
  const id = d.id;
  const style = (patch: Partial<Drawing>) => store.styleDrawing(id, patch);
  const textKey = d.type === "text" ? "color" : "noteColor";
  const textColor = (d.type === "text" ? d.color : (d.noteColor ?? d.color)) ?? "var(--replay-draw)";

  const parentW = barRef.current?.parentElement?.clientWidth ?? proj.plotW;
  const clamp = (x: number, y: number): [number, number] => [Math.max(0, Math.min(parentW - w, x)), Math.max(0, Math.min(proj.plotH - 40, y))];
  const [left, top] = pos ? clamp(pos[0], pos[1]) : [Math.max(4, (proj.plotW - w) / 2), 8];
  // thả chuột, bị huỷ (cử chỉ hệ thống) hay mất capture đều kết thúc kéo; vị trí lưu lấy từ chính sự
  // kiện cuối, không lấy `pos` của lần vẽ trước (có thể chậm một nhịp)
  const release = (e: ReactPointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g) return;
    grab.current = null;
    const at = clamp(e.clientX - g[0], e.clientY - g[1]);
    setPos(at);
    writePref(POS_KEY, at);
  };
  const grip = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      grab.current = [e.clientX - left, e.clientY - top];
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (grab.current) setPos(clamp(e.clientX - grab.current[0], e.clientY - grab.current[1]));
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  };

  const btn = (b: Btn): ReactNode => {
    switch (b) {
      // áp mẫu ở đây là đổi hình luôn (một bước hoàn tác) và hình mới cùng công cụ vẽ theo mẫu đó
      case "templates":
        return <TemplateMenu key={b} d={raw} apply={style} variant="toolbar" className={BTN} />;
      case "targetColor":
      case "stopColor": {
        const key = b === "targetColor" ? "posTargetColor" : "posStopColor";
        const value = d[key] ?? "transparent";
        const label = t(b === "targetColor" ? "replay.dw.targetColor" : "replay.dw.stopColor");
        return (
          <ColorMenu key={b} label={label} trigger={<Tinted icon={<span className="text-xs leading-4 font-bold">{b === "targetColor" ? "P" : "S"}</span>} color={value} />}>
            <ColorPanel value={value} onChange={(c) => style({ [key]: c })} />
          </ColorMenu>
        );
      }
      case "lineColor":
      case "fillColor":
      case "textColor": {
        const fibColor = d.type === "fib" && b === "lineColor";
        const key = fibColor ? "fibOneColor" : b === "lineColor" ? "color" : b === "fillColor" ? "fill" : textKey;
        const value = fibColor ? (d.fibOneColor ?? d.color ?? "var(--replay-draw)") : b === "lineColor" ? (d.color ?? "var(--replay-draw)") : b === "fillColor" ? (d.fill ?? "transparent") : textColor;
        const label = t(b === "lineColor" ? "replay.dw.lineColor" : b === "fillColor" ? "replay.dw.fillColor" : "replay.dw.textColor");
        const icon = b === "lineColor" ? <PencilIcon className="size-4" aria-hidden /> : b === "fillColor" ? <PaintBucketIcon className="size-4" aria-hidden /> : <TypeIcon className="size-4" aria-hidden />;
        return (
          <ColorMenu key={b} label={label} trigger={<Tinted icon={icon} color={value} />}>
            <ColorPanel value={value} onChange={(c) => style({ [key]: c, ...(b === "fillColor" ? { fillOn: true } : {}) })} />
          </ColorMenu>
        );
      }
      case "width": {
        // Fib: độ dày của các mức (tới 10px như FX Replay)
        const fib = d.type === "fib";
        const cur = (fib ? d.fibLevelWidth : d.width) ?? (fib ? 1 : 2);
        return (
          <PickMenu
            key={b} label={t("replay.dw.width")} trigger={<><LineSample width={cur} w={14} /><span>{`${cur}px`}</span></>}
            value={cur} onPick={(x) => style(fib ? { fibLevelWidth: x } : { width: x })} className={fib ? "max-h-64" : undefined}
            options={(fib ? FIB_WIDTHS : WIDTHS).map((x) => ({ value: x, content: <><LineSample width={x} />{`${x}px`}</> }))}
          />
        );
      }
      case "style":
        return (
          <PickMenu
            key={b} label={t("replay.dw.lineStyle")} trigger={<LineSample dash={d.type === "fib" ? d.fibLevelDash : d.dash} width={2} w={18} />}
            value={(d.type === "fib" ? d.fibLevelDash : d.dash) ?? "solid"} onPick={(x) => style(d.type === "fib" ? { fibLevelDash: x } : { dash: x })}
            options={LINE_STYLES.map((x) => ({ value: x, content: <><LineSample dash={x} width={2} />{t(LINE_STYLE_LABEL[x])}</> }))}
          />
        );
      case "fontSize":
        return (
          <PickMenu
            key={b} label={t("replay.dw.fontSize")} trigger={<span>{d.noteSize ?? 14}</span>} className="max-h-64"
            value={d.noteSize ?? 14} onPick={(x) => style({ noteSize: x })}
            options={FONT_SIZES.map((x) => ({ value: x, content: x }))}
          />
        );
      case "createOrder":
        return (
          <button key={b} type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.dw.createOrder")} title={t("replay.dw.createOrder")} onClick={() => store.orderFromDrawing(id)}>
            <CirclePlusIcon className="size-[18px]" aria-hidden />
          </button>
        );
      case "editText": {
        const q = drawingXY(d, proj)?.[0];
        return (
          <button
            key={b} type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.dw.editText")} title={t("replay.dw.editText")} disabled={!q}
            onClick={() => q && store.openTextEdit({ pane: k, x: q.x, y: q.y, pt: d.pts[0], existingId: id })}
          >
            <TextCursorInputIcon className="size-[18px]" aria-hidden />
          </button>
        );
      }
      case "anchor":
        return (
          <Toggle
            key={b} variant="ghost" pressed={!!d.anchor} aria-label={t("replay.dw.anchor")} title={t("replay.dw.anchor")}
            onPressedChange={(on) => {
              // bật: ghim ở đúng chỗ đang thấy; tắt: chữ bám lại giá / thời gian tại chỗ đang ghim
              if (on) {
                const q = proj.toXY(d.pts[0]);
                if (q) store.updateDrawing(id, { anchor: { x: q.x / proj.plotW, y: q.y / proj.plotH } }, { undo: true });
              } else if (d.anchor) {
                const pt = proj.fromXY(d.anchor.x * proj.plotW, d.anchor.y * proj.plotH);
                store.updateDrawing(id, { anchor: undefined, ...(pt ? { pts: [pt] } : {}) }, { undo: true });
              }
            }}
          >
            <PinIcon className="size-[18px]" aria-hidden />
          </Toggle>
        );
      case "settings":
        return (
          <button key={b} type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.dw.settings")} title={t("replay.dw.settings")} onClick={() => store.openDrawDialog(id)}>
            <SettingsIcon className="size-[18px]" aria-hidden />
          </button>
        );
      case "lock":
        return (
          <Toggle
            key={b} variant="ghost" pressed={!!d.locked}
            aria-label={t(d.locked ? "replay.dw.unlock" : "replay.dw.lock")} title={t(d.locked ? "replay.dw.unlock" : "replay.dw.lock")}
            onPressedChange={() => store.toggleLock(id)}
          >
            {d.locked ? <LockIcon className="size-[18px]" aria-hidden /> : <LockOpenIcon className="size-[18px]" aria-hidden />}
          </Toggle>
        );
      case "delete":
        return (
          <button key={b} type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.sel.delete")} title={t("replay.sel.delete")} onClick={() => store.deleteSelected()}>
            <Trash2Icon className="size-[18px]" aria-hidden />
          </button>
        );
      case "more":
        return (
          <DropdownMenu key={b}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.dw.more")} title={t("replay.dw.more")}>
                <EllipsisIcon className="size-[18px]" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("replay.dw.visualOrder")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => store.orderDrawing(id, "front")}>{t("replay.dw.toFront")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => store.orderDrawing(id, "forward")}>{t("replay.dw.forward")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => store.orderDrawing(id, "backward")}>{t("replay.dw.backward")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => store.orderDrawing(id, "back")}>{t("replay.dw.toBack")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("replay.dw.visOnIntervals")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={matchVisPreset(d.vis, pane.tf) ?? ""} onValueChange={(v) => style({ vis: visPreset(v as VisPreset, pane.tf) })}>
                {VIS_PRESETS.map((p) => (
                  <DropdownMenuRadioItem key={p} value={p}>{t(VIS_LABEL[p])}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuItem
                onSelect={() => {
                  writePref("drawTab", "visibility");
                  store.openDrawDialog(id);
                }}
              >
                {t("replay.dw.visCustom")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => store.cloneDrawing(id)}>{t("replay.dw.clone")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => store.copyDrawing(id)}>{t("replay.dw.copy")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => store.hideDrawing(id)}>{t("replay.dw.hide")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  };

  return (
    <>
      <div
        ref={barRef}
        role="toolbar"
        aria-label={t("replay.sel.label")}
        data-testid="replay-selection-bar"
        data-tool={d.type}
        data-pane-widget
        className="absolute z-[6] flex items-center gap-0.5 rounded-lg border border-border bg-surface-modal p-1"
        style={{ left, top }}
      >
        <span className="flex h-8 w-4 cursor-grab touch-none items-center justify-center text-text-muted active:cursor-grabbing" aria-hidden {...grip}>
          <GripVerticalIcon className="size-4" />
        </span>
        {BUTTONS[d.type].map(btn)}
      </div>
      {d.type === "rect" && !d.note && !d.locked && <AddText d={d} proj={proj} />}
    </>
  );
}

/** "+ Add text" giữa hình chữ nhật đang chọn: mở cửa sổ Cài đặt ở tab Text. */
function AddText({ d, proj }: { d: Drawing; proj: Projector }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const P = d.pts.map((p) => proj.toXY(p));
  if (P.some((q) => !q)) return null;
  const [a, b] = P as XY[];
  if (Math.abs(a.x - b.x) < 80 || Math.abs(a.y - b.y) < 24) return null;
  return (
    <button
      type="button" data-pane-widget
      className={cn("absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-sm opacity-80 hover:opacity-100")}
      style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, color: d.noteColor ?? d.color }}
      onClick={() => {
        writePref("drawTab", "text");
        store.openDrawDialog(d.id);
      }}
    >
      <PlusIcon className="size-4" aria-hidden />
      {t("replay.dw.addText")}
    </button>
  );
}
