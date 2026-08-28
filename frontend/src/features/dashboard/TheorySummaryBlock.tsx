import { StatTile, StatGrid } from "@/components/StatTile";
import { formatMoney } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { useI18n } from "@/i18n";
import type { TheorySummary } from "./types";

/**
 * Ba tile tổng kết dưới biểu đồ lý thuyết-vs-thực tế (spec §5.16, audit T7).
 *
 * Là ĐIỂM CUỐI của hai chuỗi ngay phía trên, không phải tổng của chúng —
 * chuỗi đã lũy kế sẵn. Đặt ngay dưới biểu đồ chứ không ở section khác: đây là
 * phần kết luận của chính hình đó, tách ra thì người đọc phải cuộn để nối lại.
 *
 * CHỈ ô chênh lệch tô màu theo dấu. Hai ô đầu là mốc tham chiếu; tô cả ba sẽ
 * làm loãng đúng con số cần đọc. Và màu lấy theo dấu của DIFF chứ không phải
 * của actual: thực tế +190 vẫn là tin xấu nếu lý thuyết đáng lẽ +250.
 */
export function TheorySummaryBlock({
  data,
  currency,
}: {
  data: TheorySummary;
  currency?: string;
}) {
  const { locale, t } = useI18n();
  const { sign, colorClass } = signAndColor(data.diff);

  return (
    <StatGrid col="sm:grid-cols-3">
      <StatTile label={t("dashboard.theoryProfit")}>
        <span className="num text-lg">{formatMoney(data.theory, currency, locale)}</span>
      </StatTile>

      <StatTile label={t("dashboard.actualProfit")}>
        <span className="num text-lg">{formatMoney(data.actual, currency, locale)}</span>
      </StatTile>

      <StatTile label={t("dashboard.profitGap")}>
        <span className={`num text-lg ${colorClass}`}>
          {sign}
          {formatMoney(data.diff, currency, locale)}
        </span>
      </StatTile>
    </StatGrid>
  );
}
