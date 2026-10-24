import { BrushCleaningIcon, EyeIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useI18n } from "@/i18n";
import { DRAW_TOOLS } from "../engine/drawings";
import { useReplay, useReplayStore } from "../store/context";
import { ToolIcon } from "./icons";
import { TOOL_LABEL } from "./labels";

// công cụ đang bật tô màu primary như trước, không đảo nền đen/trắng như Toggle mặc định
const TOOL = "text-text-muted hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";
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
  const hidden = useReplay((s) => s.drawings.filter((d) => d.hidden).length);
  return (
    <div
      role="toolbar"
      aria-label={t("replay.tools.label")}
      aria-orientation="vertical"
      className="flex w-10 flex-col items-center gap-0.5 overflow-y-auto border-r border-border bg-surface-base py-1.5"
    >
      {DRAW_TOOLS.map((name) => (
        <Toggle
          key={name}
          size="icon"
          className={TOOL}
          pressed={tool === name}
          aria-label={t(TOOL_LABEL[name])}
          title={t(TOOL_LABEL[name])}
          data-tool={name}
          onPressedChange={(on) => store.setTool(on ? name : null)}
        >
          <ToolIcon name={name} className="size-5" />
        </Toggle>
      ))}
      <Toggle size="icon" className={TOOL} pressed={drawMode} aria-label={t("replay.tools.hline")} title={t("replay.tools.hline")} onPressedChange={(on) => store.setDrawMode(on)}>
        <ToolIcon name="hline" className="size-5" />
      </Toggle>
      {SEP}
      <Toggle size="icon" className={TOOL} pressed={magnet} aria-label={t("replay.tools.magnet")} title={t("replay.tools.magnetHint")} data-testid="replay-magnet" onPressedChange={(on) => store.setMagnet(on)}>
        <ToolIcon name="magnet" className="size-5" />
      </Toggle>
      {hidden > 0 && (
        <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label={t("replay.tools.showHidden", { n: hidden })} title={t("replay.tools.showHidden", { n: hidden })} onClick={() => store.showHidden()}>
          <EyeIcon className="size-[18px]" aria-hidden />
        </Button>
      )}
      {SEP}
      <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label={t("replay.tools.deleteSelected")} title={t("replay.tools.deleteSelected")} onClick={() => store.deleteSelected()}>
        <Trash2Icon className="size-[18px]" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label={t("replay.tools.clear")} title={t("replay.tools.clear")} onClick={() => store.clearDrawings()}>
        <BrushCleaningIcon className="size-[18px]" aria-hidden />
      </Button>
    </div>
  );
}
