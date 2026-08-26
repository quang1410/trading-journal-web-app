import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/i18n";
import { MAU_LAI, MAU_LO, MAU_TRUNG_TINH } from "./palette";
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

  const lat = [
    { key: t("dashboard.wins"), value: data.win_count, mau: MAU_LAI },
    { key: t("dashboard.losses"), value: data.loss_count, mau: MAU_LO },
    ...(data.even_count > 0
      ? [{ key: t("dashboard.even"), value: data.even_count, mau: MAU_TRUNG_TINH }]
      : []),
  ];

  const tong = lat.reduce((s, l) => s + l.value, 0);

  if (tong === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.winLoss")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.winLoss")}</h3>

      <figure
        aria-label={`${t("dashboard.winLoss")} — ${t("dashboard.chartOf")}`}
        className="h-56 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={lat} dataKey="value" nameKey="key" innerRadius="55%" outerRadius="80%">
              {lat.map((l) => (
                <Cell key={l.key} fill={l.mau} stroke="var(--surface-card)" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.winLoss")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.winLoss")}</th>
            <th scope="col">{t("dashboard.classCount")}</th>
          </tr>
        </thead>
        <tbody>
          {lat.map((l) => (
            <tr key={l.key}>
              <th scope="row">{l.key}</th>
              <td>{l.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
