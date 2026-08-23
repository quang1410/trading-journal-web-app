import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n";
import { chuanBiRDist } from "./prepare";
import type { RBucket } from "./types";

/**
 * Histogram phân phối R — MỘT cột mỗi bucket, không phải cột chồng.
 *
 * Plan gốc §5.9 viết "tách thắng/thua" nghĩa là cột chồng hai màu, nhưng hình
 * dạng dữ liệu không cho phép: R = net / one_R nên dấu của R LUÔN bằng dấu
 * của net — mỗi bucket chỉ có MỘT cực tính thật (spec 4b §3). Một cột chồng
 * ở đây sẽ luôn chỉ có một tầng, mãi mãi. wins/losses vẫn hiện trong tooltip
 * và bảng — chúng là dữ liệu thật, chỉ không đáng một kênh mã hoá.
 */
export function RDistributionChart({ rows }: { rows: RBucket[] }) {
  const { t } = useI18n();
  const data = chuanBiRDist(rows);
  const coLenh = data.some((d) => d.count > 0);

  if (!coLenh) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.rDist")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.rDist")}</h3>

      <figure aria-label={`${t("dashboard.rDist")} — ${t("dashboard.chartOf")}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
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
              cursor={{ fill: "var(--surface-raised)" }}
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number];
                return [`${d.wins} ${t("dashboard.wins")} / ${d.losses} ${t("dashboard.losses")}`, d.label];
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.mau} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.rDist")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.rBucket")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
            <th scope="col">{t("dashboard.wins")}</th>
            <th scope="col">{t("dashboard.losses")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.count}</td>
              <td>{d.wins}</td>
              <td>{d.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
