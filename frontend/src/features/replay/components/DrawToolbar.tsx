import { BrushCleaningIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { DRAW_TOOLS } from "../engine/drawings";
import { useReplay, useReplayStore } from "../store/context";
import { ToolIcon } from "./icons";
import { TOOL_LABEL } from "./labels";

const BTN =
  "grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-raised hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary";
const SEP = <span className="my-1 w-5 shrink-0 border-t border-border" aria-hidden />;

/**
 * Thanh công cụ vẽ dọc, gắn cố định bên trái khung chart như TradingView: không che nến, luôn ở
 * một chỗ. Trên cùng là công cụ vẽ, rồi kẻ ngang và nam châm, dưới cùng là các nút xoá.
 */
export function DrawToolbar() {
  const store = useReplayStore();
  const { t } = useI18n();
  const tool = useReplay((s) => s.tool);
  const magnet = useReplay((s) => s.magnet);
  const drawMode = useReplay((s) => s.drawMode);
  return (
    <div
      role="toolbar"
      aria-label={t("replay.tools.label")}
      aria-orientation="vertical"
      className="flex w-10 flex-col items-center gap-0.5 overflow-y-auto border-r border-border bg-surface-base py-1.5"
    >
      {DRAW_TOOLS.map((name) => (
        <button
          key={name}
          type="button"
          className={cn("cursor-pointer", BTN)}
          aria-pressed={tool === name}
          aria-label={t(TOOL_LABEL[name])}
          title={t(TOOL_LABEL[name])}
          data-tool={name}
          onClick={() => store.setTool(tool === name ? null : name)}
        >
          <ToolIcon name={name} className="size-5" />
        </button>
      ))}
      <button type="button" className={cn("cursor-pointer", BTN)} aria-pressed={drawMode} aria-label={t("replay.tools.hline")} title={t("replay.tools.hline")} onClick={() => store.setDrawMode(!drawMode)}>
        <ToolIcon name="hline" className="size-5" />
      </button>
      {SEP}
      <button
        type="button"
        className={cn("cursor-pointer", BTN)}
        aria-pressed={magnet}
        aria-label={t("replay.tools.magnet")}
        title={t("replay.tools.magnetHint")}
        data-testid="replay-magnet"
        onClick={() => store.setMagnet(!magnet)}
      >
        <ToolIcon name="magnet" className="size-5" />
      </button>
      {SEP}
      <button type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.tools.deleteSelected")} title={t("replay.tools.deleteSelected")} onClick={() => store.deleteSelected()}>
        <Trash2Icon className="size-[18px]" aria-hidden />
      </button>
      <button type="button" className={cn("cursor-pointer", BTN)} aria-label={t("replay.tools.clear")} title={t("replay.tools.clear")} onClick={() => store.clearDrawings()}>
        <BrushCleaningIcon className="size-[18px]" aria-hidden />
      </button>
    </div>
  );
}
