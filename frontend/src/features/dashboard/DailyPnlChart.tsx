import { Bar, Cell, ComposedChart, Line, Tooltip } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE, CHART_MARGIN, standardAxes } from "./chartTheme";
import { prepareDaily } from "./prepare";
import type { DayStat } from "./types";

/**
 * Lãi lỗ từng ngày (cột) cùng đường lũy kế cuối ngày (đường).
 *
 * MỘT trục y cho cả hai, và đó là chủ ý: cả hai đều là tiền, cùng đơn vị. Hai
 * trục y với hai thang khác nhau là lỗi biểu đồ phổ biến nhất — nó cho phép
 * đặt hai đường cắt nhau ở bất cứ đâu người vẽ muốn, nên chúng không so sánh
 * được với nhau nữa.
 *
 * Cột đổi màu theo dấu của NGÀY; đường lũy kế giữ MỘT màu suốt tuyến — tô
 * từng đoạn theo dấu sẽ đọc thành một đường đứt quãng.
 */
export function DailyPnlChart({ rows, currency }: { rows: DayStat[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = prepareDaily(rows);

  return (
    <ChartCard
      title={t("dashboard.byDay")}
      empty={data.length === 0}
      height="h-72"
      table={{
        col: [
          t("dashboard.day"),
          t("dashboard.net"),
          t("dashboard.cumulative"),
          t("dashboard.tradeCount"),
        ],
        row: data.map((d) => [
          d.day,
          formatMoney(d.netGoc, currency, locale),
          formatMoney(d.cumGoc, currency, locale),
          d.count,
        ]),
      }}
    >
      <ComposedChart data={data} margin={CHART_MARGIN}>
        {standardAxes({ dataKey: "day" })}
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          formatter={(_v, name, item) => {
            const d = item.payload as (typeof data)[number];
            const origin = name === "cum" ? d.cumGoc : d.netGoc;
            return [
              formatMoney(origin, currency, locale),
              name === "cum" ? t("dashboard.cumulative") : t("dashboard.net"),
            ];
          }}
        />
        <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.day} fill={d.color} />
          ))}
        </Bar>
        {/* strokeWidth 2 và chấm >= 8px theo đặc tả mark. */}
        <Line
          type="monotone"
          dataKey="cum"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}
