import type { RefObject } from "react";
import { GripVerticalIcon, PauseIcon, PlayIcon, ScissorsIcon, SkipForwardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { SPEEDS, STEP_SIZES, tfLabel } from "../engine/tf";
import { fmtLocal, toLocal } from "../engine/time";
import { useReplay, useReplayStore } from "../store/context";
import { ZONE_LABEL } from "./labels";
import { NavMenu } from "./NavMenu";
import { useFloating } from "./useFloating";

const SEP = <span className="mx-0.5 h-6 border-l border-border max-md:hidden" aria-hidden />;

/**
 * Thanh replay nổi giống FX Replay. Nút Phát là nút chính nên to và luôn tô màu; đồng hồ replay
 * đứng giữa thanh vì đó là thứ người dùng nhìn nhiều nhất khi tua. Màn hình hẹp: thanh dính sát đáy
 * chart, rộng hết khung (lớp !important thắng vị trí kéo thả đã lưu) và không kéo được.
 */
export function ReplayBar({ wrapRef }: { wrapRef: RefObject<HTMLDivElement | null> }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const playing = useReplay((s) => s.playing);
  const selectMode = useReplay((s) => s.selectMode);
  const stepTf = useReplay((s) => s.stepTf);
  const speed = useReplay((s) => s.speed);
  const now = useReplay((s) => s.now);
  const zone = useReplay((s) => s.zone);
  // 64 = trục thời gian (~28) + dải nút A/L ở đáy trục giá (30) + khe hở: thanh nằm giữa hai chart,
  // đúng chỗ trục giá của chart trái, thấp hơn thì che mất A/L
  const { barRef, style, gripProps } = useFloating("replay", wrapRef, { left: "50%", bottom: 64, transform: "translateX(-50%)" });
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t("replay.bar.label")}
      className="absolute z-[5] flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-modal py-1.5 pr-2 pl-1 whitespace-nowrap max-md:!top-auto max-md:!right-2 max-md:!bottom-2 max-md:!left-2 max-md:![transform:none] max-md:flex-wrap max-md:pl-2"
      style={style}
    >
      <span className="cursor-grab touch-none self-stretch px-0.5 py-1.5 text-text-muted active:cursor-grabbing max-md:hidden" title={t("replay.bar.drag")} {...gripProps}>
        <GripVerticalIcon className="size-4" aria-hidden />
      </span>
      <Button size="icon" className="rounded-full" aria-label={playing ? t("replay.bar.pause") : t("replay.bar.play")} title={t("replay.bar.playHint")} onClick={() => store.togglePlay()}>
        {playing ? <PauseIcon className="fill-current" aria-hidden /> : <PlayIcon className="translate-x-px fill-current" aria-hidden />}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={t("replay.bar.step")} title={t("replay.bar.stepHint")} onClick={() => store.stepOnce()}>
        <SkipForwardIcon aria-hidden />
      </Button>
      {SEP}
      <select
        aria-label={t("replay.bar.stepSize")}
        className="h-8 cursor-pointer rounded-md border border-border bg-surface-input-default px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        value={stepTf}
        onChange={(e) => store.setStepTf(+e.target.value)}
      >
        {STEP_SIZES.map((s) => (
          <option key={s} value={s}>
            {s ? t("replay.bar.stepOf", { tf: tfLabel(s) }) : t("replay.bar.stepCandle")}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2" title={t("replay.bar.speed")}>
        <input
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          value={speed}
          aria-label={t("replay.bar.speed")}
          className="w-20 cursor-pointer accent-primary"
          onChange={(e) => store.setSpeed(+e.target.value)}
        />
        <span className="num min-w-12 text-xs text-text-muted">{t("replay.bar.perSecond", { n: SPEEDS[speed] })}</span>
      </label>
      {SEP}
      <span className="px-1 text-sm" data-testid="replay-time">
        <span className="num font-medium text-foreground">{fmtLocal(toLocal(now, zone))}</span>{" "}
        <span className="text-xs text-text-muted">{t(ZONE_LABEL[zone])}</span>
      </span>
      {SEP}
      <NavMenu />
      {SEP}
      <Button size="sm" variant={selectMode ? "default" : "ghost"} aria-pressed={selectMode} title={t("replay.bar.selectHint")} onClick={() => store.setSelectMode(!selectMode)}>
        <ScissorsIcon aria-hidden />
        {t("replay.bar.select")}
      </Button>
    </div>
  );
}
