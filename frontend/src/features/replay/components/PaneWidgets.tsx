import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trash2Icon, TypeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { defaultWidth, NOTE_TYPES, STYLE_TYPES } from "../engine/drawings";
import { LINE_STYLES } from "../engine/ict";
import type { Projector, XY } from "../engine/projector";
import { isTimeframe, parseTf, tfLabel } from "../engine/tf";
import { useReplay, useReplayStore } from "../store/context";
import type { PaneIndex } from "../store/ReplayStore";
import { LINE_STYLE_LABEL } from "./labels";

export const PALETTE = Array.from({ length: 12 }, (_, i) => `var(--replay-palette-${i + 1})`);
const SWATCH = "size-[22px] rounded border border-border";
const BAR_BTN = "rounded-md p-1.5 text-foreground hover:bg-surface-raised";

/**
 * Thanh của hình đang chọn (giống TradingView): màu, độ dày, kiểu đường, ghi chú, xoá. Nằm phía
 * trên hình; sát mép trên thì xuống dưới hình.
 */
export function SelectionBar({ k, proj }: { k: PaneIndex; proj: Projector | null }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const selected = useReplay((s) => s.selected);
  const drawings = useReplay((s) => s.drawings);
  const pane = useReplay((s) => s.panes[k]);
  const active = useReplay((s) => s.active);
  const busy = useReplay((s) => !!(s.draft || s.tool || s.drawMode || s.selectMode));
  const noteEditId = useReplay((s) => s.noteEditId);
  const [palette, setPalette] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 210, h: 36 });

  useEffect(() => {
    const close = () => setPalette(false);
    window.addEventListener("replay:pane-press", close);
    return () => window.removeEventListener("replay:pane-press", close);
  }, []);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });

  const d = drawings.find((x) => x.id === selected && x.sym === pane.ds);
  // hình của mã hiện ở cả hai chart thì thanh chỉ hiện ở chart đang chọn
  const owner = d && (store.getState().panes[active].ds === d.sym ? active : k);
  if (!d || !proj || busy || owner !== k) return null;
  const P = d.pts.map((pt) => proj.toXY(pt));
  if (P.some((q) => !q)) return null;
  const xs = (P as XY[]).map((q) => q.x);
  const ys = (P as XY[]).map((q) => q.y);
  if (d.type === "hray") xs.push(proj.plotW);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const left = Math.min(Math.max(cx - size.w / 2, 4), Math.max(4, proj.plotW - size.w - 4));
  const top = minY - size.h - 16 >= 4 ? minY - size.h - 16 : Math.min(maxY + 16, proj.plotH - size.h - 4);
  const styled = STYLE_TYPES.includes(d.type);
  const lineish = styled && d.type !== "text";
  const restyle = (patch: Parameters<typeof store.updateDrawing>[1]) => store.updateDrawing(d.id, patch, { undo: true });

  return (
    <>
      <div
        ref={barRef}
        role="toolbar"
        aria-label={t("replay.sel.label")}
        data-testid="replay-selection-bar"
        data-pane-widget
        className="absolute z-[6] flex items-center gap-0.5 rounded-lg border border-border bg-surface-modal p-1"
        style={{ left, top }}
      >
        {styled && (
          <button type="button" className={cn("cursor-pointer", BAR_BTN)} aria-label={t("replay.sel.color")} title={t("replay.sel.color")} aria-expanded={palette} onClick={() => setPalette((v) => !v)}>
            <span className="block size-[18px] rounded border border-border" style={{ background: d.color ?? "var(--replay-draw)" }} />
          </button>
        )}
        {lineish && (
          <>
            <select
              aria-label={t("replay.sel.width")}
              className="h-7 cursor-pointer rounded-md border border-border bg-surface-raised px-1 text-xs text-foreground"
              value={String(Math.round(d.width ?? defaultWidth(d)))}
              onChange={(e) => {
                restyle({ width: +e.target.value });
                e.target.blur();
              }}
            >
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>{`${w}px`}</option>
              ))}
            </select>
            <select
              aria-label={t("replay.sel.style")}
              className="h-7 cursor-pointer rounded-md border border-border bg-surface-raised px-1 text-xs text-foreground"
              value={d.dash ?? "solid"}
              onChange={(e) => {
                restyle({ dash: e.target.value as (typeof LINE_STYLES)[number] });
                e.target.blur();
              }}
            >
              {LINE_STYLES.map((s) => (
                <option key={s} value={s}>{t(LINE_STYLE_LABEL[s])}</option>
              ))}
            </select>
          </>
        )}
        {(NOTE_TYPES.includes(d.type) || d.type === "text") && (
          <button
            type="button"
            className={cn("cursor-pointer", BAR_BTN, noteEditId === d.id && "bg-surface-raised")}
            aria-label={d.type === "text" ? t("replay.sel.editText") : t("replay.sel.note")}
            title={d.type === "text" ? t("replay.sel.editText") : t("replay.sel.noteHint")}
            onClick={() => {
              if (d.type === "text") {
                const q = proj.toXY(d.pts[0]);
                if (q) store.openTextEdit({ pane: k, x: q.x, y: q.y, pt: d.pts[0], existingId: d.id });
              } else store.openNote(d.id);
            }}
          >
            <TypeIcon className="size-5" aria-hidden />
          </button>
        )}
        <button type="button" className={cn("cursor-pointer", BAR_BTN)} aria-label={t("replay.sel.delete")} title={t("replay.sel.delete")} onClick={() => store.deleteSelected()}>
          <Trash2Icon className="size-5" aria-hidden />
        </button>
        {palette && (
          <div className="absolute top-[calc(100%+6px)] left-0 grid grid-cols-6 gap-1 rounded-lg border border-border bg-surface-modal p-2" role="listbox" aria-label={t("replay.sel.color")}>
            {PALETTE.map((c, i) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={(d.color ?? "var(--replay-draw)") === c}
                aria-label={t("replay.sel.colorN", { n: i + 1 })}
                className={cn("cursor-pointer", SWATCH, "aria-selected:outline-2 aria-selected:outline-offset-1 aria-selected:outline-foreground")}
                style={{ background: c }}
                data-color={c}
                onClick={() => {
                  restyle({ color: c });
                  setPalette(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {noteEditId === d.id && <NoteEditor left={left} top={top + size.h + 6} plotH={proj.plotH} />}
    </>
  );
}

/** Hộp ghi chú trên đường: chữ, màu, đậm/nghiêng, cỡ chữ. Gõ tới đâu chart hiện tới đó. */
function NoteEditor({ left, top, plotH }: { left: number; top: number; plotH: number }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const id = useReplay((s) => s.noteEditId);
  const d = useReplay((s) => s.drawings.find((x) => x.id === s.noteEditId));
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [id]);
  if (!d) return null;
  const set = (patch: Parameters<typeof store.previewNote>[0]) => {
    store.previewNote(patch);
    inputRef.current?.focus();
  };
  const y = top + 120 > plotH ? Math.max(4, top - 170) : top;
  return (
    <div
      className="absolute z-[7] w-60 rounded-lg border border-border bg-surface-modal p-2"
      style={{ left, top: y }}
      data-testid="replay-note-editor"
      data-pane-widget
    >
      <input
        ref={inputRef}
        className="mb-1.5 h-8 w-full rounded-md border border-border bg-[var(--surface-input-default)] px-2 text-sm text-foreground"
        placeholder={t("replay.note.placeholder")}
        aria-label={t("replay.note.label")}
        maxLength={80}
        value={d.note ?? ""}
        onChange={(e) => store.previewNote({ note: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") store.commitNote(true);
          if (e.key === "Escape") store.commitNote(false);
        }}
      />
      <div className="mb-1.5 grid grid-cols-8 gap-1" role="listbox" aria-label={t("replay.note.color")}>
        {PALETTE.map((c, i) => (
          <button
            key={c}
            type="button"
            role="option"
            aria-selected={d.noteColor === c}
            aria-label={t("replay.sel.colorN", { n: i + 1 })}
            className={cn("cursor-pointer", SWATCH, "aria-selected:outline-2 aria-selected:outline-offset-1 aria-selected:outline-foreground")}
            style={{ background: c }}
            data-color={c}
            onClick={() => set({ noteColor: c })}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-pressed={!!d.noteB} aria-label={t("replay.note.bold")} className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-primary-foreground" onClick={() => set({ noteB: !d.noteB })}>
          B
        </button>
        <button type="button" aria-pressed={!!d.noteI} aria-label={t("replay.note.italic")} className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-sm italic aria-pressed:bg-primary aria-pressed:text-primary-foreground" onClick={() => set({ noteI: !d.noteI })}>
          I
        </button>
        <select
          aria-label={t("replay.note.size")}
          className="h-7 cursor-pointer rounded-md border border-border bg-surface-raised px-1 text-xs text-foreground"
          value={String(d.noteSize ?? 14)}
          onChange={(e) => set({ noteSize: +e.target.value })}
        >
          {[11, 12, 14, 16, 20].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button type="button" className="ml-auto cursor-pointer rounded-md bg-primary px-3 py-0.5 text-sm text-primary-foreground" onClick={() => store.commitNote(true)}>
          {t("replay.note.ok")}
        </button>
      </div>
    </div>
  );
}

/** Ô gõ chữ của công cụ "Chữ" (và khi double-click vào chữ có sẵn). */
export function TextEditor({ k }: { k: PaneIndex }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const te = useReplay((s) => s.textEdit);
  const drawings = useReplay((s) => s.drawings);
  const ref = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
    // ngay lập tức, để phím gõ liền sau cú click không rơi vào nút trên thanh công cụ
    ref.current?.focus();
  }, [te]);
  if (!te || te.pane !== k) return null;
  const existing = te.existingId != null ? drawings.find((d) => d.id === te.existingId) : undefined;
  const commit = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    store.commitText(ref.current?.value ?? "", save);
  };
  return (
    <input
      ref={ref}
      key={`${te.existingId ?? "new"}-${te.x}-${te.y}`}
      defaultValue={existing?.text ?? ""}
      placeholder={t("replay.text.placeholder")}
      aria-label={t("replay.text.label")}
      data-testid="replay-text-editor"
      data-pane-widget
      className="absolute z-[7] h-8 w-56 rounded-md border border-primary bg-[var(--surface-input-default)] px-2 text-sm text-foreground"
      style={{ left: te.x, top: te.y - 24 }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(true);
        if (e.key === "Escape") commit(false);
      }}
      onBlur={() => commit(true)}
    />
  );
}

/** Ô hiện khung đang gõ, giữa chart đang chọn. */
export function TfBox({ text }: { text: string }) {
  const { t } = useI18n();
  const tf = parseTf(text);
  const ok = tf != null && isTimeframe(tf);
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 z-30 min-w-40 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-primary bg-surface-modal px-4 py-2.5 text-center"
      role="status"
      data-testid="replay-tf-box"
    >
      <div className="text-2xl font-bold text-foreground">{text}</div>
      <div className={cn("mt-0.5 text-xs", ok ? "text-text-muted" : "text-loss")}>
        {ok ? t("replay.tf.apply", { tf: tfLabel(tf) }) : t("replay.tf.unknown")}
      </div>
    </div>
  );
}
