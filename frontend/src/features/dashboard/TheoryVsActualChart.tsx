import { Legend, Line, LineChart, Tooltip } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { TOOLTIP_STYLE, CHART_MARGIN, standardAxes } from "./chartTheme";
import { theoryLineColor } from "./palette";
import { prepareTheory } from "./prepare";
import type { TheoryPoint } from "./types";

/**
 * cum_theory là MỐC so sánh (tiền lẽ ra có nếu mọi lệnh chạy đúng kế hoạch),
 * không phải một chuỗi ngang hàng với cum_by_trade — nên nó vẽ nét ĐỨT màu
 * trung tính, không mang màu lãi/lỗ. Xem spec 4b §4.2 cho lý do không dùng
 * cặp phân loại xanh dương/cam dù cặp đó đạt đủ sáu phép kiểm ở cả hai theme.
 */
export function TheoryVsActualChart({ rows, currency }: { rows: TheoryPoint[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = prepareTheory(rows);

  return (
    <ChartCard
      title={t("dashboard.theoryVsActual")}
      empty={data.length === 0}
      height="h-64"
      table={{
        col: ["STT", t("dashboard.theory"), t("dashboard.actual")],
        row: data.map((d) => [
          d.stt,
          formatMoney(d.theoryOrigin, currency, locale),
          formatMoney(d.actualOrigin, currency, locale),
        ]),
      }}
    >
      <LineChart data={data} margin={CHART_MARGIN}>
        {standardAxes({ dataKey: "stt" })}
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(_v, name, item) => {
            const d = item.payload as (typeof data)[number];
            const origin = name === "lyThuyet" ? d.theoryOrigin : d.actualOrigin;
            return [
              formatMoney(origin, currency, locale),
              name === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"),
            ];
          }}
        />
        <Legend formatter={(v) => (v === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"))} />
        <Line
          type="monotone"
          dataKey="theory"
          stroke={theoryLineColor("lyThuyet")}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={theoryLineColor("thucTe")}
          strokeWidth={2}
          dot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartCard>
  );
}
