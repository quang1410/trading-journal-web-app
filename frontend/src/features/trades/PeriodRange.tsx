import { MoneyText } from "@/components/MoneyText";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { periodRangeMarker, periodZeroStop } from "@/features/dashboard/prepare";
import { colorBySign, LOSS_COLOR, PROFIT_COLOR, textClassBySign } from "@/features/dashboard/palette";

/**
 * Dải biên độ của một kỳ: lệnh lỗ sâu nhất ở đầu trái, lệnh lãi cao nhất ở đầu
 * phải, một con trượt đánh dấu lãi trung bình nằm giữa hai đầu.
 *
 * Đây là thứ mà hai con số rời không nói được. "Lớn nhất +150 / nhỏ nhất −100"
 * bắt người đọc tự dựng hình; một dải có con trượt cho biết NGAY kỳ này lệch về
 * phía nào — trượt sát mép phải là lãi dồn vào vài lệnh lớn, sát mép trái là
 * lãi mỏng đều. Cùng câu hỏi mà bảng lệnh phải cuộn hết mới trả lời.
 *
 * Chỉ dựng khi CÓ CẢ HAI đầu mút: một kỳ toàn lệnh thắng không có "lỗ sâu
 * nhất", và vẽ một dải thiếu một đầu là vẽ một khoảng không tồn tại.
 */
export function PeriodRange({
  biggestLoser,
  biggestWinner,
  aveWin,
  currency,
}: {
  biggestLoser: string;
  biggestWinner: string;
  aveWin: string | null;
  currency: string;
}) {
  const { t } = useI18n();
  const marker = periodRangeMarker(biggestLoser, biggestWinner, aveWin);
  // Mốc hoà vốn nằm ở đâu trên dải. null nghĩa là cả dải cùng một dấu, và khi
  // đó ray tô MỘT màu theo dấu chung — nửa đỏ trên một dải toàn lãi là khẳng
  // định một khoản lỗ không có thật.
  const zero = periodZeroStop(biggestLoser, biggestWinner);
  const track =
    zero === null
      ? colorBySign(biggestWinner)
      : `linear-gradient(to right, ${LOSS_COLOR}, var(--border-muted) ${zero * 100}%, ${PROFIT_COLOR})`;

  return (
    <div role="group" aria-label={t("periods.range")} className="flex items-center gap-3">
      <div className="flex shrink-0 flex-col">
        <span className="eyebrow">{t("periods.worstTrade")}</span>
        {/*
          Màu theo DẤU THẬT của con số, không phải theo đầu ray.
          Một ngày chỉ có lệnh thắng thì "lệnh thấp nhất" vẫn là một số dương
          — tô đỏ nó là khẳng định một khoản lỗ không tồn tại.
        */}
        <span className={cn("num text-sm font-medium", textClassBySign(biggestLoser))}>
          <MoneyText value={biggestLoser} currency={currency} />
        </span>
      </div>

      {/*
        Đường ray THẬT, không phải một gạch 1px: nó là thứ duy nhất trên thẻ nói
        về HÌNH DẠNG chứ không về giá trị, nên nó được phép chiếm chỗ. Chiều cao
        6px đủ để chứa con trượt mà không thành một thanh tiến trình.

        aria-hidden: hai con số hai bên đã là nội dung khả truy cập, và một
        thanh gradient thì không đọc thành lời được.
      */}
      <div
        aria-hidden
        className="relative h-1.5 min-w-0 flex-1 rounded-full bg-surface-sunken"
      >
        <div
          className="absolute inset-0 rounded-full opacity-45"
          style={{
            background: track,
          }}
        />
        {marker !== null && (
          // Con trượt lãi trung bình. Viền cùng màu nền thẻ để nó nổi khỏi ray
          // mà không cần đổ bóng — theme đã tắt mọi shadow.
          <span
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-surface-base"
            style={{ left: `${marker * 100}%` }}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="eyebrow">{t("periods.bestTrade")}</span>
        <span className={cn("num text-sm font-medium", textClassBySign(biggestWinner))}>
          <MoneyText value={biggestWinner} currency={currency} />
        </span>
      </div>
    </div>
  );
}
