import { Bar, BarChart, Legend, Tooltip } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import {
  BAR_CURSOR,
  TOOLTIP_STYLE,
  CHART_MARGIN,
  standardAxes,
} from "./chartTheme";
import { PROFIT_COLOR, LOSS_COLOR } from "./palette";
import { prepareWeekday, type WeekdayCol } from "./prepare";
import type { WeekdayStat } from "./types";

/**
 * Khoá của hai chuỗi dữ liệu, dùng CHUNG cho `dataKey` và cho chỗ so sánh
 * `name` trong tooltip/legend.
 *
 * Một hằng số chứ không hai chuỗi viết tay ở hai nơi: đợt đổi định danh sang
 * tiếng Anh đã sửa `dataKey` mà bỏ sót các phép so sánh, và vì Recharts nhận
 * `dataKey: string` nên tsc không thấy gì cả. Buộc hai bên đọc cùng một hằng
 * số thì kiểu chữ không thể lệch nhau được nữa.
 *
 * Phải khớp tên field của `WeekdayCol` (xem prepareWeekday) — `satisfies` dưới
 * đây bắt tsc kiểm điều đó.
 */
const PROFIT_KEY = "profit" satisfies keyof WeekdayCol;
const LOSS_KEY = "loss" satisfies keyof WeekdayCol;

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
export function WeekdayChart({
  rows,
  currency,
}: {
  rows: WeekdayStat[];
  currency: string;
}) {
  const { locale, t } = useI18n();
  const data = prepareWeekday(rows);

  return (
    <ChartCard
      title={t("dashboard.byWeekday")}
      empty={data.length === 0}
      table={{
        col: [
          t("dashboard.weekday"),
          t("dashboard.profitPart"),
          t("dashboard.lossPart"),
          t("dashboard.tradeCount"),
        ],
        row: data.map((d) => [
          d.key,
          formatMoney(d.profitOrigin, currency, locale),
          formatMoney(d.lossOrigin, currency, locale),
          d.count,
        ]),
      }}
    >
      <BarChart data={data} margin={CHART_MARGIN}>
        {standardAxes({ dataKey: "key" })}
        <Tooltip
          cursor={BAR_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          // So với PROFIT_KEY chứ không với một chuỗi viết tay: `name` mà
          // Recharts đưa vào chính là dataKey của <Bar> (hai Bar dưới đây
          // không đặt prop `name`). Trước đây chỗ này so với "lai" — tên cũ
          // trước đợt đổi định danh sang tiếng Anh — nên nhánh đó KHÔNG BAO
          // GIỜ đúng: cả hai chuỗi đều rơi xuống phần lỗ, in ra hai dòng "Phần
          // lỗ" giống hệt nhau và legend cũng hỏng theo.
          formatter={(_v, name, item) => {
            const d = item.payload as (typeof data)[number];
            const isProfit = name === PROFIT_KEY;
            return [
              formatMoney(
                isProfit ? d.profitOrigin : d.lossOrigin,
                currency,
                locale,
              ),
              isProfit ? t("dashboard.profitPart") : t("dashboard.lossPart"),
            ];
          }}
        />
        <Legend
          formatter={(v) =>
            v === PROFIT_KEY
              ? t("dashboard.profitPart")
              : t("dashboard.lossPart")
          }
        />
        {/* Khe 2px giữa hai cột kề nhau: barGap tính bằng pixel. */}
        <Bar
          dataKey={PROFIT_KEY}
          fill={PROFIT_COLOR}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey={LOSS_KEY}
          fill={LOSS_COLOR}
          radius={[0, 0, 4, 4]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartCard>
  );
}
