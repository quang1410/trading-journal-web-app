import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { isTimeframe, parseTf, tfLabel } from "../engine/tf";
import { useReplay, useReplayStore } from "../store/context";
import type { PaneIndex } from "../store/ReplayStore";

/**
 * Ô gõ chữ của công cụ "Chữ" (và khi double-click / bấm "Sửa chữ" trên chữ có sẵn). Sửa tại chỗ như
 * FX Replay: ô nằm đè đúng lên chữ, cùng cỡ / màu / kiểu chữ, chữ trên chart ẩn đi trong lúc sửa (Overlay),
 * con trỏ gõ đặt sau chữ cuối.
 */
export function TextEditor({ k }: { k: PaneIndex }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const te = useReplay((s) => s.textEdit);
  const drawings = useReplay((s) => s.drawings);
  const ref = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  const [len, setLen] = useState(0);
  const existing = te && te.existingId != null ? drawings.find((d) => d.id === te.existingId) : undefined;
  useEffect(() => {
    done.current = false;
    const el = ref.current;
    if (!el) return;
    setLen(el.value.length);
    // ngay lập tức, để phím gõ liền sau cú click không rơi vào nút trên thanh công cụ
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [te]);
  if (!te || te.pane !== k) return null;
  const commit = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    store.commitText(ref.current?.value ?? "", save);
  };
  const st = existing ?? store.lastStyle("text");
  const size = st.noteSize ?? TEXT_SIZE;
  const placeholder = t("replay.text.placeholder");
  return (
    <Input
      ref={ref}
      key={`${te.existingId ?? "new"}-${te.x}-${te.y}`}
      defaultValue={existing?.text ?? ""}
      placeholder={placeholder}
      aria-label={t("replay.text.label")}
      data-testid="replay-text-editor"
      data-pane-widget
      className="absolute z-[7] h-auto rounded-sm border-primary bg-transparent px-[2px] py-0 text-foreground caret-primary focus-visible:ring-0 md:text-[length:inherit]"
      style={{
        left: te.x - PAD_X - 1,
        top: te.y - Math.round(BASELINE * size) - 1,
        width: `${Math.max(len || placeholder.length, 1) + 2}ch`,
        fontSize: size,
        lineHeight: LINE_H,
        color: st.color,
        fontWeight: st.noteB ? 700 : 500,
        fontStyle: st.noteI ? "italic" : undefined,
      }}
      onChange={(e) => setLen(e.currentTarget.value.length)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(true);
        if (e.key === "Escape") commit(false);
      }}
      onBlur={() => commit(true)}
    />
  );
}

/** Cỡ chữ mặc định của hình "Chữ" (Overlay vẽ cùng cỡ). */
const TEXT_SIZE = 14;
const PAD_X = 2;
const LINE_H = 1.4;
/** Khoảng từ đỉnh dòng tới đường chân chữ, theo cỡ chữ, khi line-height 1,4. */
const BASELINE = 1.1;

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
