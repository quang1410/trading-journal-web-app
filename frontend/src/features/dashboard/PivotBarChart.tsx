import { Bar, BarChart, Cell, Tooltip } from "recharts";
import { formatMoney, formatPercent } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE, CHART_MARGIN, standardAxes } from "./chartTheme";
import { preparePivot } from "./prepare";
import type { Pivot } from "./types";

/**
 * Cột cho bốn nhóm dùng chung kiểu Pivot: setup, symbol, timeframe, week.
 *
 * MỘT chuỗi duy nhất (sum_net), nên không có legend — tiêu đề đã gọi tên nó.
 * Màu ở đây mang nghĩa CỰC TÍNH (lãi/lỗ) chứ không phải danh tính: tô mỗi
 * setup một màu sẽ mã hoá thứ vốn đã nằm ở nhãn trục, và cướp mất kênh màu
 * của thứ duy nhất cần tới nó.
 */
export function PivotBarChart({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: Pivot[];
  currency: string;
}) {
  const { locale, t } = useI18n();
  const data = preparePivot(rows);

  return (
    <ChartCard
      title={title}
      empty={data.length === 0}
      table={{
        col: [t("dashboard.group"), t("dashboard.net"), t("dashboard.tradeCount"), t("dashboard.winRate")],
        row: data.map((d) => [
          d.key,
          formatMoney(d.netGoc, currency, locale),
          d.count,
          formatPercent(d.winRateGoc, 2, locale),
        ]),
      }}
    >
      <BarChart data={data} margin={CHART_MARGIN}>
        {standardAxes({ dataKey: "key" })}
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          // Nhãn đi từ CHUỖI GỐC, không từ con số Recharts đang giữ:
          // String(118.5) mất số 0 cuối mà backend cố ý gửi.
          formatter={(_v, _n, item) => {
            const d = item.payload as (typeof data)[number];
            return [formatMoney(d.netGoc, currency, locale), t("dashboard.net")];
          }}
        />
        {/* radius bo 4px ở đầu cột, neo vào đường 0. */}
        <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}
