import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { useReplay } from "../store/context";

const SHOW_MS = 2500;

/** Thông báo ngắn ở đáy màn hình (lỗi đặt lệnh, nhảy ngày, đã lưu…). */
export function Toast() {
  const { t } = useI18n();
  const notice = useReplay((s) => s.notice);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice.id);
    const h = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(h);
  }, [notice]);
  if (!notice || shown !== notice.id) return null;
  return (
    <div
      role="status"
      data-testid="replay-toast"
      className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-border-strong bg-surface-modal px-4 py-2.5 text-sm text-foreground"
    >
      {t(notice.key, notice.params)}
    </div>
  );
}
