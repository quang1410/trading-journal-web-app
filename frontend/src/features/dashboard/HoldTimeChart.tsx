import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE } from "./chartTheme";
import { PROFIT_COLOR, LOSS_COLOR } from "./palette";
import { prepareHoldDist } from "./prepare";
import type { HoldBucket } from "./types";

/**
 * Phân phối lệnh theo khoảng thời gian giữ — cột CHỒNG hai màu thắng/thua.
 *
 * Khác RDistributionChart ở chỗ này, và khác có lý do: ở đó R = net / one_R
 * nên dấu của R luôn bằng dấu của net, mỗi bucket chỉ có một cực tính và cột
 * chồng sẽ mãi mãi chỉ có một tầng. Ở đây một khoảng thời gian chứa CẢ lệnh
 * thắng lẫn lệnh thua — và tỉ lệ hai tầng trong cùng một cột chính là câu trả
 * lời cho "giữ lệnh bao lâu thì tôi thắng".
 *
 * Màu lấy từ palette dùng chung với mọi biểu đồ khác (PROFIT_COLOR/LOSS_COLOR
 * = --chart-profit/--chart-loss), không tự đặt tên token mới.
 *
 * Số lệnh mỗi bucket không trả lời hết câu hỏi thật — "khoảng giữ lệnh nào
 * SINH LỜI" cần cả sum_net (xem holddist.go). Tooltip và bảng phụ vì vậy
 * cũng hiện lãi/lỗ ròng của bucket, không chỉ đếm lệnh.
 */
export function HoldTimeChart({ rows, currency }: { rows: HoldBucket[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = prepareHoldDist(rows);
  const hasData = data.some((d) => d.wins > 0 || d.losses > 0);

  return (
    <ChartCard
      title={t("dashboard.holdDist")}
      empty={!hasData}
      height="h-64"
      table={{
        col: [
          t("dashboard.holdBucket"),
          t("dashboard.tradeCount"),
          t("dashboard.wins"),
          t("dashboard.losses"),
          t("dashboard.net"),
        ],
        row: data.map((d) => [d.label, d.count, d.wins, d.losses, formatMoney(d.sumNetGoc, currency, locale)]),
      }}
    >
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 24, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" interval={0} />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" width={40} allowDecimals={false} />
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          // Nhãn đi từ CHUỖI GỐC, không từ con số Recharts đang giữ — cùng lý
          // do PivotBarChart: String(118.5) mất số 0 cuối backend cố ý gửi.
          formatter={(_v, _n, item) => {
            const d = item.payload as (typeof data)[number];
            return [
              `${d.wins} ${t("dashboard.wins")} / ${d.losses} ${t("dashboard.losses")} · ${formatMoney(d.sumNetGoc, currency, locale)}`,
              d.label,
            ];
          }}
        />
        <Bar dataKey="wins" stackId="hold" fill={PROFIT_COLOR} name={t("dashboard.wins")} />
        <Bar dataKey="losses" stackId="hold" fill={LOSS_COLOR} name={t("dashboard.losses")} />
      </BarChart>
    </ChartCard>
  );
}
