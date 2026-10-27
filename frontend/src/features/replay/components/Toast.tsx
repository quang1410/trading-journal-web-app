import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { useReplay } from "../store/context";

const MIN_MS = 2500;
const MAX_MS = 10000;
/** Thời gian đọc thêm cho mỗi ký tự (~15 ký tự/giây). */
const PER_CHAR_MS = 65;

/** Thông báo hiện bao lâu: câu ngắn ("Đã lưu") 2,5 giây, câu dài (lỗi kèm lý do, hướng dẫn) đủ để đọc
 *  hết, tối đa 10 giây. */
export function toastMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, 1000 + text.length * PER_CHAR_MS));
}

/** Thông báo ngắn ở đáy màn hình (lỗi đặt lệnh, nhảy ngày, đã lưu…). Rê chuột vào thì giữ lại. */
export function Toast() {
  const { t } = useI18n();
  const notice = useReplay((s) => s.notice);
  const [shown, setShown] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const text = notice ? t(notice.key, notice.params) : "";
  useEffect(() => {
    if (!notice) return;
    setShown(notice.id);
  }, [notice]);
  useEffect(() => {
    if (shown == null || hover) return;
    const h = setTimeout(() => setShown(null), toastMs(text));
    return () => clearTimeout(h);
  }, [shown, hover, text]);
  if (!notice || shown !== notice.id) return null;
  return (
    <div
      role="status"
      data-testid="replay-toast"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-border-strong bg-surface-modal px-4 py-2.5 text-sm text-foreground"
    >
      {text}
    </div>
  );
}
