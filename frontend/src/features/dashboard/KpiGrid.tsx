import { StatTile, StatGrid } from "@/components/StatTile";
import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { formatDuration } from "@/lib/format";
import { signAndColor, profitFactorColor, recoveryFactorColor } from "@/lib/thresholds";
import type { Stats } from "@/features/trades/types";
import { useI18n, type Locale } from "@/i18n";

/**
 * Đủ 27 chỉ số của /stats.
 *
 * Khác StatsStrip ở /trades — nơi chỉ bày sáu con số dẫn cạnh bảng lệnh. Ở đây
 * người dùng đến để ĐỌC SỐ, nên bày hết; StatsStrip giữ nguyên sáu, nó không
 * phải bản rút gọn của lưới này.
 *
 * Lưới dựng bằng `gap-px` trên nền `bg-border`: mỗi ô tự vẽ nền của mình nên
 * đường kẻ hiện ra đúng ở mọi số cột mà breakpoint chọn, không phải đếm xem ô
 * nào cần border bên nào. Theme tắt hết lớp đổ bóng nên phân tầng bằng đúng
 * border và bậc surface.
 */

/**
 * Giá trị có thể KHÔNG TÍNH ĐƯỢC.
 *
 * `null` bên Go là con trỏ nil: chưa có lệnh thua thì profit_factor không có
 * giá trị, chứ không bằng 0. `?? 0` ở đây sẽ biến "chưa thua lệnh nào" thành
 * "thua sạch" — một câu trả lời sai mà trông hoàn toàn bình thường.
 */
function Cell({ v, colorClass, render }: { v: string | null; colorClass?: string; render: (s: string) => string }) {
  if (v === null) return <span className="num text-lg text-muted-foreground">—</span>;
  return <span className={`num text-lg font-medium ${colorClass ?? ""}`}>{render(v)}</span>;
}

/**
 * Ô thời lượng. Tách khỏi `Cell` vì giá trị là SỐ, không phải chuỗi thập phân:
 * ép number qua Cell sẽ mất cái cổng `v === null` mà Cell dựng lên để phân
 * biệt "không tính được" với 0.
 */
function DurationCell({ seconds, locale }: { seconds: number | null; locale: Locale }) {
  if (seconds === null) return <span className="num text-lg text-muted-foreground">—</span>;
  return <span className="num text-lg font-medium">{formatDuration(seconds, locale)}</span>;
}

export function KpiGrid({ stats: s, currency }: { stats: Stats; currency: string }) {
  const { locale, t } = useI18n();
  const money = (v: string) => formatMoney(v, currency, locale);
  const signedMoney = (v: string) => `${signAndColor(v).sign}${formatMoney(v, currency, locale)}`;
  const ratio = (v: string) => formatRatio(v, 2, locale);
  const percent = (v: string) => formatPercent(v, 2, locale);
  const intText = (n: number) => String(n);

  return (
    <StatGrid col="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label={t("kpi.netProfit")}>
          <Cell v={s.net_profit} colorClass={signAndColor(s.net_profit).colorClass} render={signedMoney} />
        </StatTile>
        <StatTile label={t("kpi.currentBalance")}>
          <Cell v={s.current_balance} render={money} />
        </StatTile>
        {/*
          Nạp/rút ròng đứng ngay cạnh số dư vì hai số kể cùng một câu chuyện,
          và cùng là ngoại lệ của quy tắc 8 — không chịu bộ lọc.

          CỐ Ý không truyền `colorClass`: đây là dòng tiền, không phải lãi lỗ. Tô đỏ
          khoản rút sẽ đọc ra thành khoản lỗ.
        */}
        <StatTile label={t("kpi.netCashFlow")}>
          <Cell v={s.net_cash_flow} render={signedMoney} />
        </StatTile>
        <StatTile label={t("kpi.netReturnPct")}>
          <Cell v={s.net_return_pct} render={percent} />
        </StatTile>
        <StatTile label={t("kpi.profitFactor")}>
          <Cell
            v={s.profit_factor}
            colorClass={s.profit_factor === null ? undefined : profitFactorColor(s.profit_factor)}
            render={ratio}
          />
        </StatTile>

        <StatTile label={t("kpi.totalWin")}>
          <Cell v={s.total_win} colorClass="text-primary" render={money} />
        </StatTile>
        <StatTile label={t("kpi.totalLoss")}>
          <Cell v={s.total_loss} colorClass="text-destructive" render={money} />
        </StatTile>
        <StatTile label={t("kpi.totalFees")}>
          <Cell v={s.total_fees} render={money} />
        </StatTile>
        <StatTile label={t("kpi.totalTrades")}>
          <span className="num text-lg font-medium">{intText(s.total_trades)}</span>
        </StatTile>

        <StatTile label={t("kpi.winCount")}>
          <span className="num text-lg font-medium text-primary">{intText(s.win_count)}</span>
        </StatTile>
        <StatTile label={t("kpi.lossCount")}>
          <span className="num text-lg font-medium text-destructive">{intText(s.loss_count)}</span>
        </StatTile>
        <StatTile label={t("kpi.winPct")}>
          <Cell v={s.win_pct} render={percent} />
        </StatTile>
        <StatTile label={t("kpi.expectancy")}>
          <Cell
            v={s.expectancy}
            colorClass={s.expectancy === null ? undefined : signAndColor(s.expectancy).colorClass}
            render={signedMoney}
          />
        </StatTile>

        {/*
          Ba ô thời gian giữ lệnh, cạnh Kỳ vọng mỗi lệnh: cùng là chỉ số về
          HÀNH VI giao dịch, khác nhóm số dư/tiền ở đầu lưới. KHÔNG tô màu
          lãi/lỗ — giữ lệnh lâu không phải "tốt" hay "xấu" tự thân, và tô
          teal/đỏ ở đây sẽ khẳng định một điều mà dữ liệu không nói.
        */}
        <StatTile label={t("kpi.avgHold")}>
          <DurationCell seconds={s.avg_hold_seconds} locale={locale} />
        </StatTile>
        <StatTile label={t("kpi.avgHoldWin")}>
          <DurationCell seconds={s.avg_hold_seconds_win} locale={locale} />
        </StatTile>
        <StatTile label={t("kpi.avgHoldLoss")}>
          <DurationCell seconds={s.avg_hold_seconds_loss} locale={locale} />
        </StatTile>

        <StatTile label={t("kpi.aveWin")}>
          <Cell v={s.ave_win} render={money} />
        </StatTile>
        <StatTile label={t("kpi.aveLoss")}>
          <Cell v={s.ave_loss} render={money} />
        </StatTile>
        <StatTile label={t("kpi.biggestWinner")}>
          <Cell v={s.biggest_winner} render={money} />
        </StatTile>
        <StatTile label={t("kpi.biggestLoser")}>
          <Cell v={s.biggest_loser} render={money} />
        </StatTile>

        <StatTile label={t("kpi.oneR")}>
          <Cell v={s.one_r} render={money} />
        </StatTile>
        <StatTile label={t("kpi.biggestRWin")}>
          <Cell v={s.biggest_r_win} render={ratio} />
        </StatTile>
        <StatTile label={t("kpi.biggestRLoss")}>
          <Cell v={s.biggest_r_loss} render={ratio} />
        </StatTile>
        <StatTile label={t("kpi.rrActual")}>
          <Cell v={s.rr_actual} render={ratio} />
        </StatTile>

        <StatTile label={t("kpi.maxDrawdown")}>
          <Cell v={s.max_drawdown} colorClass="text-destructive" render={money} />
        </StatTile>
        <StatTile label={t("kpi.maxDdPct")}>
          <Cell v={s.max_dd_pct} render={percent} />
        </StatTile>
        <StatTile label={t("kpi.recoveryFactor")}>
          <Cell
            v={s.recovery_factor}
            colorClass={s.recovery_factor === null ? undefined : recoveryFactorColor(s.recovery_factor)}
            render={ratio}
          />
        </StatTile>
    </StatGrid>
  );
}
