import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { MAU_LAI, MAU_LO } from "./palette";
import { chuanBiWeekday } from "./prepare";
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
  const data = chuanBiWeekday(rows);

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.byWeekday")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.byWeekday")}</h3>

      <figure aria-label={`${t("dashboard.byWeekday")} — ${t("dashboard.chartOf")}`} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
            <XAxis dataKey="key" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
            <Tooltip
              cursor={{ fill: "var(--surface-raised)" }}
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, name, item) => {
                const d = item.payload as (typeof data)[number];
                const goc = name === "lai" ? d.laiGoc : d.loGoc;
                return [
                  formatMoney(goc, currency, locale),
                  name === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"),
                ];
              }}
            />
            <Legend
              formatter={(v) => (v === "lai" ? t("dashboard.profitPart") : t("dashboard.lossPart"))}
            />
            {/* Khe 2px giữa hai cột kề nhau: barGap tính bằng pixel. */}
            <Bar dataKey="lai" fill={MAU_LAI} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="lo" fill={MAU_LO} radius={[0, 0, 4, 4]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.byWeekday")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.weekday")}</th>
            <th scope="col">{t("dashboard.profitPart")}</th>
            <th scope="col">{t("dashboard.lossPart")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.key}</th>
              <td>{formatMoney(d.laiGoc, currency, locale)}</td>
              <td>{formatMoney(d.loGoc, currency, locale)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
