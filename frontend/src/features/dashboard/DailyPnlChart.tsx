import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiNgay } from "./prepare";
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
  const data = chuanBiNgay(rows);

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.byDay")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.byDay")}</h3>

      <figure aria-label={`${t("dashboard.byDay")} — ${t("dashboard.chartOf")}`} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
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
                const goc = name === "cum" ? d.cumGoc : d.netGoc;
                return [
                  formatMoney(goc, currency, locale),
                  name === "cum" ? t("dashboard.cumulative") : t("dashboard.net"),
                ];
              }}
            />
            <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.day} fill={d.mau} />
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
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.byDay")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.day")}</th>
            <th scope="col">{t("dashboard.net")}</th>
            <th scope="col">{t("dashboard.cumulative")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{formatMoney(d.netGoc, currency, locale)}</td>
              <td>{formatMoney(d.cumGoc, currency, locale)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
