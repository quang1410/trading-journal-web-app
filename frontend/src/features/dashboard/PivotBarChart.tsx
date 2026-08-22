import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiPivot } from "./prepare";
import type { Pivot } from "./types";

/**
 * Cột cho bốn nhóm dùng chung kiểu Pivot: setup, symbol, timeframe, week.
 *
 * MỘT chuỗi duy nhất (sum_net), nên không có legend — tiêu đề đã gọi tên nó.
 * Màu ở đây mang nghĩa CỰC TÍNH (lãi/lỗ) chứ không phải danh tính: tô mỗi
 * setup một màu sẽ mã hoá thứ vốn đã nằm ở nhãn trục, và cướp mất kênh màu
 * của thứ duy nhất cần tới nó.
 *
 * Kèm <table> ẩn khỏi mắt nhưng còn cho trình đọc màn hình: biểu đồ SVG với
 * họ là hư không, và ở jsdom nó cũng là hư không — nên bảng vừa là lối vào
 * cho người dùng trình đọc, vừa là thứ test bám vào được.
 */
export function PivotBarChart({
  tieuDe,
  rows,
  currency,
}: {
  tieuDe: string;
  rows: Pivot[];
  currency: string;
}) {
  const { locale, t } = useI18n();
  const data = chuanBiPivot(rows);

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{tieuDe}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{tieuDe}</h3>

      <figure aria-label={`${tieuDe} — ${t("dashboard.chartOf")}`} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            {/* Lưới mờ và chỉ kẻ ngang: đường dọc chồng lên cột không thêm
                thông tin nào mà làm nền ồn hẳn lên. */}
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
                <Cell key={d.key} fill={d.mau} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>

      {/* Bản đọc được của cùng dữ liệu. sr-only chứ không display:none —
          display:none là ẩn với cả trình đọc màn hình. */}
      <table className="sr-only">
        <caption>{tieuDe}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.group")}</th>
            <th scope="col">{t("dashboard.net")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
            <th scope="col">{t("dashboard.winRate")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.key}</th>
              <td>{formatMoney(d.netGoc, currency, locale)}</td>
              <td>{d.count}</td>
              <td>{formatPercent(d.winRateGoc, 2, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
