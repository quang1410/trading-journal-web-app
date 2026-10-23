import { useState, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { writePref } from "../engine/storage";

/** Chart trái chiếm từ 20% tới 80% bề ngang; mỗi lần bấm ←/→ dịch 2%. */
const MIN = 0.2;
const MAX = 0.8;
const STEP = 0.02;

export const clampSplit = (r: number): number => (Number.isFinite(r) ? Math.min(MAX, Math.max(MIN, r)) : 0.5);

/** Tỉ lệ chart trái khi con trỏ ở `x` trong khung bắt đầu ở `left`, rộng `width`. */
export const splitAt = (x: number, left: number, width: number): number => (width > 0 ? clampSplit((x - left) / width) : 0.5);

/**
 * Tay nắm giữa hai chart ở bố cục 2 chart (chỉ màn rộng, khi hai chart nằm cạnh nhau). Kéo để đổi
 * độ rộng, ←/→ để dịch từng chút, nhấp đúp để về 50/50. Tỉ lệ lưu trong trình duyệt khi thả chuột.
 */
export function SplitHandle({ split, onChange, containerRef }: {
  split: number;
  onChange: (r: number) => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);

  const commit = (r: number) => {
    onChange(r);
    writePref("split", r);
  };
  const endDrag = () => {
    if (!drag) return;
    setDrag(false);
    writePref("split", split);
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("replay.splitHint")}
        aria-valuemin={MIN * 100}
        aria-valuemax={MAX * 100}
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        title={t("replay.splitHint")}
        className="group absolute inset-y-0 z-[5] hidden w-2 -translate-x-1/2 cursor-col-resize touch-none justify-center outline-none md:flex"
        style={{ left: `calc(${split * 100}% + 0.5px)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          setDrag(true);
        }}
        onPointerMove={(e) => {
          const box = containerRef.current?.getBoundingClientRect();
          if (drag && box) onChange(splitAt(e.clientX, box.left, box.width));
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // mất capture mà không có pointerup (cửa sổ mất focus…): không để lớp phủ toàn màn hình kẹt lại
        onLostPointerCapture={endDrag}
        onDoubleClick={() => commit(0.5)}
        onKeyDown={(e) => {
          // ← → nhích từng bước, Home / End về hai đầu (như thanh trượt)
          const to = { ArrowLeft: split - STEP, ArrowRight: split + STEP, Home: MIN, End: MAX }[e.key];
          if (to == null) return;
          e.preventDefault();
          commit(clampSplit(to));
        }}
      >
        <span
          className={cn(
            "h-full w-px transition-[width,background-color] group-hover:w-[3px] group-hover:bg-primary group-focus-visible:w-[3px] group-focus-visible:bg-primary",
            drag && "w-[3px] bg-primary",
          )}
        />
      </div>
      {/* đang kéo: giữ con trỏ ↔ trên cả màn hình, chart bên dưới không nhận hover */}
      {drag && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  );
}
