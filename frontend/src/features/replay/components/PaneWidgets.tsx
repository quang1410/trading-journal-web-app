import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { isTimeframe, parseTf, tfLabel } from "../engine/tf";
import { useReplay, useReplayStore } from "../store/context";
import type { PaneIndex } from "../store/ReplayStore";

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
    <Input
      ref={ref}
      key={`${te.existingId ?? "new"}-${te.x}-${te.y}`}
      defaultValue={existing?.text ?? ""}
      placeholder={t("replay.text.placeholder")}
      aria-label={t("replay.text.label")}
      data-testid="replay-text-editor"
      data-pane-widget
      className="absolute z-[7] h-8 w-56 border-primary bg-[var(--surface-input-default)] px-2 text-foreground md:text-sm"
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
