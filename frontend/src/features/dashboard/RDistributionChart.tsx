import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE } from "./chartTheme";
import { prepareRDist } from "./prepare";
import type { RBucket } from "./types";

/**
 * Histogram phân phối R — MỘT cột mỗi bucket, không phải cột chồng.
 *
 * Plan gốc §5.9 viết "tách thắng/thua" nghĩa là cột chồng hai màu, nhưng hình
 * dạng dữ liệu không cho phép: R = net / one_R nên dấu của R LUÔN bằng dấu
 * của net — mỗi bucket chỉ có MỘT cực tính thật (spec 4b §3). Một cột chồng
 * ở đây sẽ luôn chỉ có một tầng, mãi mãi. wins/losses vẫn hiện trong tooltip
 * và bảng — chúng là dữ liệu thật, chỉ không đáng một kênh mã hoá.
 *
 * KHÔNG dùng trucChuan: 22 nhãn bucket phải nghiêng 45° và hiện đủ
 * (interval={0}), còn trục y đếm lệnh nên cấm số lẻ.
 */
export function RDistributionChart({ rows }: { rows: RBucket[] }) {
  const { t } = useI18n();
  const data = prepareRDist(rows);
  const hasData = data.some((d) => d.count > 0);

  return (
    <ChartCard
      title={t("dashboard.rDist")}
      empty={!hasData}
      height="h-64 lg:h-[calc(100dvh-8rem)]"
      className="lg:min-h-[calc(100dvh-5rem)]"
      table={{
        col: [
          t("dashboard.rBucket"),
          t("dashboard.tradeCount"),
          t("dashboard.wins"),
          t("dashboard.losses"),
        ],
        row: data.map((d) => [d.label, d.count, d.wins, d.losses]),
      }}
    >
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 40, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9 }}
          stroke="var(--text-muted)"
          interval={0}
          angle={-45}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={40} allowDecimals={false} />
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          formatter={(_v, _n, item) => {
            const d = item.payload as (typeof data)[number];
            return [`${d.wins} ${t("dashboard.wins")} / ${d.losses} ${t("dashboard.losses")}`, d.label];
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}
