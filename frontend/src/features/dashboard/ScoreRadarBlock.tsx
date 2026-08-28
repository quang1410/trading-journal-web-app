import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { compareDecimal, formatRatio } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { TOOLTIP_STYLE } from "./chartTheme";
import { PROFIT_COLOR } from "./palette";
import { prepareRadar } from "./prepare";
import type { Radar as RadarData, ScoreSummary } from "./types";

/**
 * Điểm trung bình (số to) và radar bốn trục trong MỘT khối (spec 4b §2.6).
 *
 * Chúng là cùng một câu chuyện — tổng và thành phần — nên đứng cạnh nhau thì
 * đọc một lượt là biết trục nào kéo tổng xuống.
 *
 * Trục radar CỐ ĐỊNH [0, 25]: mỗi score_* tối đa 25 điểm (plan §2.1-2.4). Để
 * Recharts tự co trục theo dữ liệu sẽ vẽ 5/5/5/5 và 25/25/25/25 giống hệt
 * nhau — đây là bất biến, không phải tuỳ chọn.
 *
 * Dùng PROFIT_COLOR (không phải --primary) cho mảng tô radar: mảng tô LỚN cần cặp
 * đã qua validator cho vai mảng tô lớn, giống lý do --chart-profit tồn tại ở
 * 4a — --primary trượt đúng ở vai đó.
 */
export function ScoreRadarBlock({ score, radar }: { score: ScoreSummary; radar: RadarData }) {
  const { t, locale } = useI18n();

  // Bất biến §6: score null ra "—", KHÔNG ra 0. Chưa chấm lệnh nào khác hẳn
  // chấm được 0 điểm — cái sau là một lời phán xét, cái trước là chưa có dữ
  // liệu. Bày "—" cùng câu giải thích chứ không mượn dashboard.emptyGroup:
  // ô điểm vẫn phải có mặt để người đọc thấy chỗ con số SẼ xuất hiện.
  if (score.avg_score_total === null) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.quality")}</h3>
        <div role="group" aria-label={t("dashboard.quality")} className="flex flex-col gap-1">
          <span className="eyebrow">{t("dashboard.score")}</span>
          <span className="num text-3xl font-semibold text-muted-foreground">—</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("dashboard.noScored")}</p>
      </section>
    );
  }

  const axisLabel: Record<string, string> = {
    entry: t("dashboard.axisEntry"),
    inTrade: t("dashboard.axisInTrade"),
    exit: t("dashboard.axisExit"),
    psych: t("dashboard.axisPsych"),
  };
  const radarPoints = prepareRadar(radar).map((d) => ({ ...d, label: axisLabel[d.axis] }));
  // Bất biến §6: chưa chấm KHÁC được 0 điểm. rawScore null (không phải diem =
  // 0, vốn chỉ là toạ độ) mới là tín hiệu đúng để hiện lời nhắc.
  const hasUnscored = radarPoints.some((d) => d.rawScore === null);
  const meets80 = compareDecimal(score.avg_score_total, "80") >= 0;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 lg:flex-row lg:items-center">
      <h3 className="sr-only">{t("dashboard.quality")}</h3>

      <div role="group" aria-label={t("dashboard.quality")} className="flex flex-col gap-1">
        <span className="eyebrow">{t("dashboard.score")}</span>
        <span className={`num text-3xl font-semibold ${meets80 ? "text-primary" : ""}`}>
          {formatRatio(score.avg_score_total, 1, locale)}
        </span>
        <span className="text-xs text-muted-foreground">
          {score.scored_count} {t("dashboard.scoredCountSuffix")}
        </span>
      </div>

      <figure aria-label={`${t("dashboard.radar")} — ${t("dashboard.chartOf")}`} className="h-56 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarPoints} outerRadius="70%">
            <PolarGrid stroke="var(--border-default)" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
            <PolarRadiusAxis
              domain={[0, 25]}
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof radarPoints)[number];
                return [d.rawScore === null ? "—" : formatRatio(d.rawScore, 1, locale), d.label];
              }}
            />
            <Radar dataKey="score" stroke={PROFIT_COLOR} fill={PROFIT_COLOR} fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </figure>

      {hasUnscored && (
        <p role="note" className="text-xs text-muted-foreground lg:basis-full">
          {t("dashboard.radarPartial")}
        </p>
      )}
    </section>
  );
}
