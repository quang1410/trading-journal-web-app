import { StatTile, StatGrid } from "@/components/StatTile";
import { compareDecimal, formatPercent } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import type { ExecutionQuality } from "./types";

/**
 * Khối "CHẤT LƯỢNG THỰC THI LỆNH" (spec §5.13, audit T4).
 *
 * Ba con số KHÔNG cùng loại, cố ý để cạnh nhau: một tỉ lệ kỷ luật và hai bộ
 * đếm lỗi. Chúng trả lời cùng một câu hỏi — "tôi có làm theo kế hoạch không?"
 * — mà không con số nào trong lưới KPI trả lời được.
 *
 * `no_setup_count` và `impulsive_count` tách riêng vì file Excel gốc gộp
 * chúng dưới một nhãn SAI: nhãn tile kể tên ba trạng thái tâm lý, nhưng công
 * thức `Dashboard!V85` lại đếm lệnh no-setup. Web không kế thừa lỗi đó.
 * Chi tiết ở trading-journal-plan.md §10.
 */

// Ngưỡng 85% là mục tiêu ghi trong file Excel gốc (mục 13 sheet Explain).
// Dưới ngưỡng tô cảnh báo — đây là chỉ số KỶ LUẬT, không phải lãi lỗ, nên
// không dùng signAndColor: "âm/dương" không có nghĩa gì ở đây.
const ON_PLAN_THRESHOLD = "0.85";

export function ExecutionQualityBlock({ data }: { data: ExecutionQuality }) {
  const { locale, t } = useI18n();

  // So sánh trên chuỗi decimal, không ép sang kiểu số — quy tắc 1 của CLAUDE.md.
  const meets =
    data.planned_pct !== null && compareDecimal(data.planned_pct, ON_PLAN_THRESHOLD) >= 0;

  return (
    <StatGrid col="sm:grid-cols-3">
      <StatTile label={t("dashboard.plannedPct")}>
        <span
          className={`num text-lg ${
            data.planned_pct === null ? "" : meets ? "text-primary" : "text-destructive"
          }`}
        >
          {data.planned_pct === null
            ? t("common.noValue")
            : formatPercent(data.planned_pct, 2, locale)}
        </span>
        <span className="text-xs text-muted-foreground">{t("dashboard.plannedTarget")}</span>
      </StatTile>

      <StatTile label={t("dashboard.noSetup")}>
        <span className="num text-lg">{data.no_setup_count}</span>
      </StatTile>

      <StatTile label={t("dashboard.impulsive")}>
        <span className="num text-lg">{data.impulsive_count}</span>
      </StatTile>
    </StatGrid>
  );
}
