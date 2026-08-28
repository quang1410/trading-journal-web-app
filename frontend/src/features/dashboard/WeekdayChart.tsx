import { Bar, BarChart, Legend, Tooltip } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE, CHART_MARGIN, standardAxes } from "./chartTheme";
import { PROFIT_COLOR, LOSS_COLOR } from "./palette";
import { prepareWeekday } from "./prepare";
import type { WeekdayStat } from "./types";

/**
 * Thứ trong tuần, tách phần lãi và phần lỗ thành HAI cột cạnh nhau.
 *
 * Khác các biểu đồ pivot khác: ở đây có hai chuỗi thật, nên legend là bắt
 * buộc — danh tính không được để một mình màu gánh.
 *
 * Không cộng hai phần thành một cột net: một ngày thứ Ba có +500 và −480 cho
 * ra net +20, trông y hệt một ngày thứ Ba chỉ có +20. Hai ngày đó rất khác
 * nhau, và đây đúng là thứ biểu đồ này sinh ra để cho thấy.
 */
export function WeekdayChart({ rows, currency }: { rows: WeekdayStat[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = prepareWeekday(rows);

  return (
    <ChartCard
      title={t("dashboard.byWeekday")}
      empty={data.length === 0}
      table={{
        col: [
          t("dashboard.weekday"),
          t("dashboard.profitPart"),
          t("dashboard.lossPart"),
          t("dashboard.tradeCount"),
        ],
        row: data.map((d) => [
          d.key,
          formatMoney(d.profitOrigin, currency, locale),
          formatMoney(d.lossOrigin, currency, locale),
          d.count,
        ]),
      }}
    >
      <BarChart data={data} margin={CHART_MARGIN}>
        {standardAxes({ dataKey: "key" })}
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          formatter={(_v, name, item) => {
            const d = item.payload as (typeof data)[number];
            const origin = name === "lai" ? d.profitOrigin : d.lossOrigin;
            return [
              formatMoney(origin, currency, locale),
              name === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"),
            ];
          }}
        />
        <Legend
          formatter={(v) => (v === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"))}
        />
        {/* Khe 2px giữa hai cột kề nhau: barGap tính bằng pixel. */}
        <Bar dataKey="profit" fill={PROFIT_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="loss" fill={LOSS_COLOR} radius={[0, 0, 4, 4]} isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  );
}
