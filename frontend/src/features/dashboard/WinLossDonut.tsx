import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { TOOLTIP_STYLE } from "./chartTheme";
import { PROFIT_COLOR, LOSS_COLOR, NEUTRAL_COLOR } from "./palette";
import type { WinLossSplit } from "./types";

/**
 * Doughnut thắng / thua / hoà (spec §5.15, audit T6 — `chart4.xml` của file gốc).
 *
 * Excel chỉ vẽ HAI lát. Web thêm lát hoà vì §10 mục 2 đã chốt lệnh net = 0
 * không vào win_count lẫn loss_count — bỏ nó đi thì tổng hai lát nhỏ hơn số
 * lệnh thật và người dùng sẽ tưởng hệ thống nuốt mất lệnh.
 *
 * Lát hoà chỉ xuất hiện khi CÓ lệnh hoà: một lát 0% vẫn chiếm chỗ trong bảng
 * và làm người đọc tưởng có lệnh hoà. Thắng và thua thì luôn giữ, kể cả bằng
 * 0 — hàng vắng mặt trông khác hẳn hàng bằng 0, và cái sau là thông tin.
 */
export function WinLossDonut({ data }: { data: WinLossSplit }) {
  const { t } = useI18n();

  const slices = [
    { key: t("dashboard.wins"), value: data.win_count, color: PROFIT_COLOR },
    { key: t("dashboard.losses"), value: data.loss_count, color: LOSS_COLOR },
    ...(data.even_count > 0
      ? [{ key: t("dashboard.even"), value: data.even_count, color: NEUTRAL_COLOR }]
      : []),
  ];

  const total = slices.reduce((s, l) => s + l.value, 0);

  return (
    <ChartCard
      title={t("dashboard.winLoss")}
      empty={total === 0}
      table={{
        col: [t("dashboard.winLoss"), t("dashboard.classCount")],
        row: slices.map((l) => [l.key, l.value]),
      }}
    >
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="key" innerRadius="55%" outerRadius="80%">
          {slices.map((l) => (
            <Cell key={l.key} fill={l.color} stroke="var(--surface-card)" />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ChartCard>
  );
}
