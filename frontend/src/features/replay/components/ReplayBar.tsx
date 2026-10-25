import type { RefObject } from "react";
import { ChevronUpIcon, GaugeIcon, GripVerticalIcon, PauseIcon, PlayIcon, ScissorsIcon, SkipForwardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { SPEEDS, STEP_SIZES, tfLabel } from "../engine/tf";
import { fmtLocalWeekday, toLocal } from "../engine/time";
import { useReplay, useReplayStore } from "../store/context";
import { ZONE_LABEL, ZONE_SHORT_LABEL } from "./labels";
import { NavMenu } from "./NavMenu";
import { PILL, PILL_BUTTON, PILL_CHEVRON } from "./pill";
import { useFloating } from "./useFloating";

const STEP_VALUES = STEP_SIZES.map(String);

/**
 * Thanh replay nổi giống FX Replay, xếp theo việc người dùng làm khi tua:
 *
 *   [Phát ▸ Tiến ▸ Tua tới mốc] │ đồng hồ │ [bước · tốc độ] │ chọn nến
 *
 * Mọi nút đẩy thời gian về phía trước đứng chung một cụm bên trái; nút Phát là nút chính nên to và
 * luôn tô màu. Cỡ bước và tốc độ là cài đặt, chỉnh ít hơn nhiều so với bấm Phát, nên gom vào một chip
 * mở popover — chip vẫn hiện cả hai giá trị để không phải mở ra mới biết đang ở đâu. Đồng hồ xếp hai
 * dòng (thứ + ngày nhỏ ở trên, giờ to ở dưới) để thanh ngắn lại mà vẫn đọc được thứ trong tuần.
 *
 * Màn hình hẹp: thanh dính sát đáy chart, rộng hết khung (lớp !important thắng vị trí kéo thả đã lưu)
 * và không kéo được.
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
  const stepName = (s: number) => (s ? tfLabel(s) : t("replay.bar.stepCandleShort"));
  const perSecond = t("replay.bar.perSecond", { n: SPEEDS[speed] });
  const [weekday, date, time] = fmtLocalWeekday(toLocal(now, zone), t("replay.weekdays").split(",")).split(" ");
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t("replay.bar.label")}
      className="absolute z-[5] flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-modal py-1 pr-1.5 pl-1 whitespace-nowrap max-md:!top-auto max-md:!right-2 max-md:!bottom-2 max-md:!left-2 max-md:![transform:none] max-md:flex-wrap max-md:pl-1.5"
      style={style}
    >
      <span className="flex cursor-grab touch-none items-center self-stretch px-0.5 text-text-muted active:cursor-grabbing max-md:hidden" title={t("replay.bar.drag")} {...gripProps}>
        <GripVerticalIcon className="size-4" aria-hidden />
      </span>
      <Button size="icon" className="rounded-full" aria-label={playing ? t("replay.bar.pause") : t("replay.bar.play")} title={t("replay.bar.playHint")} onClick={() => store.togglePlay()}>
        {playing ? <PauseIcon className="fill-current" aria-hidden /> : <PlayIcon className="translate-x-px fill-current" aria-hidden />}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={t("replay.bar.step")} title={t("replay.bar.stepHint")} onClick={() => store.stepOnce()}>
        <SkipForwardIcon aria-hidden />
      </Button>
      <NavMenu />
      {/* cao đúng bằng các nút (h-8) và canh giữa hai dòng: đồng hồ là tâm của thanh, không được
          phình cao hơn hay lệch mép như một khối chữ dán vào */}
      <span className="flex h-8 flex-col items-center justify-center gap-[3px] px-2.5 leading-none" data-testid="replay-time" title={`${date} ${time} ${t(ZONE_LABEL[zone])}`}>
        <span className="num text-[10px] text-text-muted">
          {weekday} {date}
        </span>
        <span className="text-[13px]">
          <span className="num font-semibold text-foreground">{time}</span> <span className="text-[10px] font-medium text-text-muted">{t(ZONE_SHORT_LABEL[zone])}</span>
        </span>
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className={cn(PILL_BUTTON, PILL, "items-center px-2")} title={t("replay.bar.pace")}>
            <GaugeIcon aria-hidden />
            <span className="sr-only">{t("replay.bar.pace")}: </span>
            {/* chấm ngăn dùng lề thay cho dấu cách: dấu cách của font mono rộng cả một ô chữ */}
            <span className="num">
              {stepName(stepTf)}
              <span className="mx-1 text-text-muted">·</span>
              {perSecond}
            </span>
            <ChevronUpIcon className={PILL_CHEVRON} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" sideOffset={10} className="w-80 space-y-3" aria-label={t("replay.bar.pace")}>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-text-muted">{t("replay.bar.stepHeading")}</div>
            <Segmented value={String(stepTf)} onChange={(v) => store.setStepTf(+v)} options={STEP_VALUES} label={t("replay.bar.stepSize")} renderOption={(v) => stepName(+v)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-text-muted">{t("replay.bar.speedHeading")}</span>
              <span className="num text-foreground">{perSecond}</span>
            </div>
            <Slider min={0} max={SPEEDS.length - 1} step={1} value={[speed]} thumbLabel={t("replay.bar.speed")} onValueChange={([v]) => store.setSpeed(v)} />
          </div>
        </PopoverContent>
      </Popover>
      <Button
        size="icon-sm"
        variant={selectMode ? "default" : "ghost"}
        aria-label={t("replay.bar.select")}
        aria-pressed={selectMode}
        title={`${t("replay.bar.select")} — ${t("replay.bar.selectHint")}`}
        onClick={() => store.setSelectMode(!selectMode)}
      >
        <ScissorsIcon aria-hidden />
      </Button>
    </div>
  );
}
