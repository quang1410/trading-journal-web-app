import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { mauDuongTheory } from "./palette";
import { chuanBiTheory } from "./prepare";
import type { TheoryPoint } from "./types";

/**
 * cum_theory là MỐC so sánh (tiền lẽ ra có nếu mọi lệnh chạy đúng kế hoạch),
 * không phải một chuỗi ngang hàng với cum_by_trade — nên nó vẽ nét ĐỨT màu
 * trung tính, không mang màu lãi/lỗ. Xem spec 4b §4.2 cho lý do không dùng
 * cặp phân loại xanh dương/cam dù cặp đó đạt đủ sáu phép kiểm ở cả hai theme.
 */
export function TheoryVsActualChart({ rows, currency }: { rows: TheoryPoint[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = chuanBiTheory(rows);

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.theoryVsActual")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.theoryVsActual")}</h3>

      <figure aria-label={`${t("dashboard.theoryVsActual")} — ${t("dashboard.chartOf")}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
            <XAxis dataKey="stt" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={56} />
            <Tooltip
              contentStyle={{
                background: "var(--surface-modal)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-default)",
                color: "var(--text-primary)",
              }}
              formatter={(_v, name, item) => {
                const d = item.payload as (typeof data)[number];
                const goc = name === "lyThuyet" ? d.lyThuyetGoc : d.thucTeGoc;
                return [
                  formatMoney(goc, currency, locale),
                  name === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"),
                ];
              }}
            />
            <Legend formatter={(v) => (v === "lyThuyet" ? t("dashboard.theory") : t("dashboard.actual"))} />
            <Line
              type="monotone"
              dataKey="lyThuyet"
              stroke={mauDuongTheory("lyThuyet")}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="thucTe"
              stroke={mauDuongTheory("thucTe")}
              strokeWidth={2}
              dot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.theoryVsActual")}</caption>
        <thead>
          <tr>
            <th scope="col">STT</th>
            <th scope="col">{t("dashboard.theory")}</th>
            <th scope="col">{t("dashboard.actual")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.stt}>
              <th scope="row">{d.stt}</th>
              <td>{formatMoney(d.lyThuyetGoc, currency, locale)}</td>
              <td>{formatMoney(d.thucTeGoc, currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
