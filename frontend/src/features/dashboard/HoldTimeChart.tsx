import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { ChartCard } from "./ChartCard";
import { BAR_CURSOR, TOOLTIP_STYLE } from "./chartTheme";
import { PROFIT_COLOR, LOSS_COLOR, NEUTRAL_COLOR } from "./palette";
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
/**
 * Nội dung MỘT DÒNG của tooltip, ứng với MỘT tầng cột.
 *
 * Recharts gọi formatter một lần cho mỗi <Bar>, nên hàm này chỉ được nói về
 * tầng đang hỏi. Trả null cho tầng cao 0 để dòng đó biến mất: bucket không có
 * lệnh hoà mà vẫn hiện "Hoà 0" là tiếng ồn.
 *
 * Tách khỏi component để test được — jsdom không vẽ Recharts (ResizeObserver),
 * nên đây là cách duy nhất kiểm nội dung tooltip mà không dựng cả biểu đồ.
 */
export function holdTooltipRow(value: unknown, name: unknown): [string, string] | null {
  // So sánh trực tiếp trên number, KHÔNG ép kiểu: cổng styleguard cấm mọi phép
  // ép chuỗi sang số trên toàn src để tiền không bao giờ đi qua float (quy tắc
  // 1). Ở đây `value` là CHIỀU CAO CỘT (số lệnh) chứ không phải tiền, nhưng
  // luật là luật — và `typeof` còn chặt hơn: ép một ô rỗng sẽ âm thầm ra 0,
  // còn nhánh này thì không.
  return typeof value === "number" && value > 0 ? [`${value}`, `${name}`] : null;
}

export function HoldTimeChart({ rows, currency }: { rows: HoldBucket[]; currency: string }) {
  const { locale, t } = useI18n();
  const data = prepareHoldDist(rows);
  // Xét COUNT, không phải wins/losses: một tập toàn lệnh hoà vốn có count > 0
  // nhưng wins = losses = 0, và nếu trốn sau trạng thái rỗng thì biểu đồ nói
  // "chưa có lệnh nào" trong khi ba ô KPI thời gian giữ ngay phía trên hiện số
  // thật — hai chỗ trên cùng một màn hình nói ngược nhau. Lệnh hoà vẫn được vẽ
  // (tầng `evens`) nên cột không bao giờ cao 0 khi count > 0.
  const hasData = data.some((d) => d.count > 0);

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
          // Chia việc giữa hai formatter, vì chúng chạy khác số lần:
          // labelFormatter in MỘT lần ở đầu tooltip, còn formatter chạy MỘT
          // LẦN CHO MỖI <Bar>.
          //
          // Nên con số của cả bucket (số lệnh, lãi ròng) thuộc về nhãn: để nó
          // trong formatter thì ba tầng in lại y hệt nhau ba lần — đúng lỗi đã
          // gặp. Còn formatter chỉ mô tả tầng đang được hỏi.
          //
          // Lãi ròng nằm ở đây cũng vì nó là câu hỏi thật của QĐ-5: "khoảng
          // giữ lệnh nào SINH LỜI". Chuỗi tiền lấy từ sumNetGoc (chuỗi gốc
          // backend gửi), không từ con số Recharts đang giữ — cùng lý do
          // PivotBarChart: String(118.5) mất số 0 cuối backend cố ý gửi.
          labelFormatter={(label, items) => {
            const d = items?.[0]?.payload as (typeof data)[number] | undefined;
            if (!d) return label;
            return `${d.label} · ${d.count} ${t("dashboard.tradeCount")} · ${formatMoney(d.sumNetGoc, currency, locale)}`;
          }}
          // Tầng cao 0 KHÔNG in ra dòng nào: bucket không có lệnh hoà mà vẫn
          // hiện "Hoà 0" là tiếng ồn, và tầng đó cũng không vẽ gì trên cột.
          // Trả null để Recharts bỏ qua dòng đó.
          formatter={holdTooltipRow}
        />
        <Bar dataKey="wins" stackId="hold" fill={PROFIT_COLOR} name={t("dashboard.wins")} />
        <Bar dataKey="losses" stackId="hold" fill={LOSS_COLOR} name={t("dashboard.losses")} />
        {/* Tầng thứ ba giữ tổng chiều cao cột = count. NEUTRAL_COLOR chứ
            không phải đỏ: net = 0 là hoà, tô đỏ sẽ đếm nó vào phía thua bằng
            thị giác trong khi backend không đếm (cùng lý do colorBySign có ba
            nhánh). */}
        <Bar dataKey="evens" stackId="hold" fill={NEUTRAL_COLOR} name={t("dashboard.even")} />
      </BarChart>
    </ChartCard>
  );
}
