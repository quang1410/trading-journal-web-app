import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { signAndColor, profitFactorColor } from "@/lib/thresholds";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";

/**
 * Câu trả lời của trang, đặt trước mọi biểu đồ.
 *
 * Bảng điều khiển cũ mở đầu bằng lưới 24 ô KPI, mọi ô một cỡ chữ: người đọc
 * phải quét hết 24 con số mới biết mình đang lãi hay lỗ. Đó không phải một
 * bảng điều khiển, đó là một bảng tra cứu. Khối này tách ra NĂM con số trả lời
 * đúng câu người ta mở nhật ký để hỏi — lãi ròng, số dư, tỷ lệ thắng, hệ số
 * lợi nhuận, kỳ vọng mỗi lệnh — và cho lãi ròng cỡ chữ lớn hơn hẳn phần còn
 * lại. 24 ô kia không mất đi, chúng lui về sau một nút mở.
 *
 * Phân tầng bằng CỠ CHỮ, không phải bằng khung hay màu nền: lãi ròng to gấp
 * đôi bốn số bên cạnh là đủ để mắt biết đọc đâu trước. Theme đã tắt shadow,
 * thêm một khung nữa quanh khối này chỉ là thêm một đường viền không mang tin.
 *
 * KHÔNG lặp lại các ô này trong lưới 24: cùng một con số hiện hai cỡ ở hai chỗ
 * trên cùng một màn hình sẽ đọc ra thành hai chỉ số khác nhau. Lưới 24 là bản
 * đầy đủ, khối này là bản trích — nên nó nằm ở nhánh mở/đóng khác.
 */
export function VerdictRow({ stats: s, currency }: { stats: Stats; currency: string }) {
  const { locale, t } = useI18n();
  const net = signAndColor(s.net_profit);

  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-card p-5 sm:flex-row sm:items-end sm:gap-8">
      {/* Con số dẫn. text-4xl so với text-lg của bốn ô bên cạnh — chênh lệch
          phải đủ lớn để đọc được từ khoảng cách ngồi, không phải một bậc. */}
      <figure
        role="group"
        aria-label={t("kpi.netProfit")}
        className="flex min-w-0 flex-col gap-1 sm:border-r sm:border-border sm:pr-8"
      >
        <figcaption className="eyebrow">{t("kpi.netProfit")}</figcaption>
        <span
          data-testid="verdict-net"
          className={`num text-4xl font-semibold leading-none tracking-tight ${net.colorClass}`}
        >
          {net.sign}
          {formatMoney(s.net_profit, currency, locale)}
        </span>
        {/* Lãi ròng không có nghĩa nếu không biết nó gom từ bao nhiêu lệnh:
            +500$ trên 4 lệnh và +500$ trên 400 lệnh là hai câu chuyện khác
            hẳn. Đặt ngay dưới con số dẫn, không phải một ô riêng. */}
        <span className="text-xs text-muted-foreground">
          {t("dashboard.overNTrades", { n: s.total_trades })}
        </span>
      </figure>

      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <Item label={t("kpi.currentBalance")}>
          <span className="num text-lg font-medium">
            {formatMoney(s.current_balance, currency, locale)}
          </span>
        </Item>
        <Item label={t("kpi.winPct")}>
          {s.win_pct === null ? (
            <span className="num text-lg text-muted-foreground">—</span>
          ) : (
            <span className="num text-lg font-medium">{formatPercent(s.win_pct, 1, locale)}</span>
          )}
        </Item>
        <Item label={t("kpi.profitFactor")}>
          {/* null là "không tính được" chứ không phải 0 — chưa có lệnh thua thì
              hệ số lợi nhuận không tồn tại. In 0 ở đây là nói dối. */}
          {s.profit_factor === null ? (
            <span className="num text-lg text-muted-foreground">—</span>
          ) : (
            <span className={`num text-lg font-medium ${profitFactorColor(s.profit_factor)}`}>
              {formatRatio(s.profit_factor, 2, locale)}
            </span>
          )}
        </Item>
        <Item label={t("kpi.expectancy")}>
          {s.expectancy === null ? (
            <span className="num text-lg text-muted-foreground">—</span>
          ) : (
            <span
              className={`num text-lg font-medium ${signAndColor(s.expectancy).colorClass}`}
            >
              {signAndColor(s.expectancy).sign}
              {formatMoney(s.expectancy, currency, locale)}
            </span>
          )}
        </Item>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}
