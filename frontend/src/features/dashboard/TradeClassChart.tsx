import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { formatMoney, formatPercent } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { TOOLTIP_STYLE } from "./chartTheme";
import { tradeClassColor } from "./palette";
import type { ClassStat } from "./types";

/**
 * Phân bố loại lệnh: doughnut + bảng (spec §5.14, audit T5 — `chart2.xml`).
 *
 * Doughnut vẽ ĐỦ NĂM lát backend gửi, kể cả lát 0 lệnh: màu lấy theo loại
 * (mauLoaiLenh) nên lát rỗng không làm xê dịch màu của lát khác, và giữ đủ
 * năm lát cho thang chất lượng đọc được nguyên vẹn.
 *
 * Bảng thì NGƯỢC LẠI, chỉ liệt kê loại có lệnh. Một hàng "0 lệnh · 0% · 0" là
 * ba ô trống chiếm một dòng — trong bảng nó là nhiễu, trong biểu đồ nó là
 * khoảng lặng có nghĩa. Hai thành phần cùng dữ liệu, khác nhiệm vụ.
 *
 * Bảng KHÔNG sr-only như các chart khác: ở đây bốn cột (loại, số lệnh, tỷ lệ,
 * lãi lỗ) là nội dung chính người dùng muốn đọc, doughnut chỉ là hình minh
 * hoạ tỉ lệ. Ngược với WeekdayChart, nơi hình mới là thứ mang thông tin.
 */
export function TradeClassChart({ rows, currency }: { rows: ClassStat[]; currency?: string }) {
  const { locale, t } = useI18n();

  const nonEmpty = rows.filter((r) => r.count > 0);

  return (
    <ChartCard
      title={t("dashboard.byTradeClass")}
      empty={nonEmpty.length === 0}
      note={
        <table className="w-full text-sm">
          <caption className="sr-only">{t("dashboard.byTradeClass")}</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="font-normal">
                {t("dashboard.byTradeClass")}
              </th>
              <th scope="col" className="text-right font-normal">
                {t("dashboard.classCount")}
              </th>
              <th scope="col" className="text-right font-normal">
                {t("dashboard.classPct")}
              </th>
              <th scope="col" className="text-right font-normal">
                {t("dashboard.classNet")}
              </th>
            </tr>
          </thead>
          <tbody>
            {nonEmpty.map((r) => {
              const { sign, colorClass } = signAndColor(r.sum_net);
              // Màu tra theo vị trí trong mảng GỐC, không phải trong mảng đã
              // lọc: bỏ một hàng 0 lệnh không được phép đổi màu các hàng sau.
              const color = tradeClassColor(rows.indexOf(r));
              return (
                <tr key={r.class} className="border-t border-border">
                  <th scope="row" className="py-1 font-normal">
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-2 rounded-full align-middle"
                      style={{ background: color }}
                    />
                    {r.class}
                  </th>
                  <td className="num py-1 text-right">{r.count}</td>
                  <td className="num py-1 text-right">{formatPercent(r.pct, 2, locale)}</td>
                  <td className={`num py-1 text-right ${colorClass}`}>
                    {sign}
                    {formatMoney(r.sum_net, currency, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      }
    >
      <PieChart>
        <Pie data={rows} dataKey="count" nameKey="class" innerRadius="55%" outerRadius="80%">
          {rows.map((r, i) => (
            <Cell key={r.class} fill={tradeClassColor(i)} stroke="var(--surface-card)" />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ChartCard>
  );
}
