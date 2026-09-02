import type { ReactNode } from "react";
import { StatTile, StatGrid } from "@/components/StatTile";
import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { signAndColor, profitFactorColor } from "@/lib/thresholds";
import type { Stats } from "./types";
import { useI18n } from "@/i18n";

/**
 * Dải kết quả của tập lệnh đang lọc.
 *
 * MỘT khối có vạch ngăn, không phải sáu thẻ rời. Theme tắt hết shadow nên
 * thẻ rời chỉ còn là sáu khung viền cạnh nhau — sáu vật thể ngang hàng cho
 * sáu con số vốn không ngang hàng. Ở đây Net là con số dẫn, đặt to gấp đôi
 * và chiếm cột rộng nhất; bốn chỉ số còn lại là chú giải cho nó.
 *
 * Vạch ngăn dựng bằng `gap-px` trên nền `bg-border`: mỗi ô tự vẽ nền của
 * mình, nên đường kẻ hiện ra đúng ở mọi số cột mà breakpoint chọn, không
 * cần đếm xem ô nào cần border bên nào.
 */
export function StatsStrip({ stats, currency }: { stats: Stats; currency: string }) {
  const net = signAndColor(stats.net_profit);
  const { locale, t } = useI18n();

  return (
    <StatGrid col="grid-cols-2 sm:grid-cols-3 lg:grid-cols-[minmax(14rem,1.3fr)_repeat(4,minmax(0,1fr))]">
        {/* Ô dẫn: chiếm cả hàng ở màn hẹp, vì nó là câu trả lời còn lại là
            chú thích. */}
        <div className="col-span-2 flex flex-col justify-between gap-2 bg-card p-4 sm:col-span-3 lg:col-span-1">
           <span className="eyebrow" role="group" aria-label={t("stats.tradeCount")}>
             {t("stats.result")} · <span className="num">{stats.total_trades}</span> {t("stats.trades")}
          </span>

          <span role="group" aria-label="Net">
             <span className={`num text-2xl font-semibold tracking-tight ${net.colorClass}`}>
               {`${net.sign}${formatMoney(stats.net_profit, currency, locale)}`}
            </span>
          </span>

          <span className="text-xs text-muted-foreground">
             {stats.net_return_pct === null ? (
               t("stats.notCalculated")
             ) : (
              <>
                <span className={`num ${net.colorClass}`}>
                   {`${net.sign}${formatPercent(stats.net_return_pct, 2, locale)}`}
                 </span>{" "}
                 {t("stats.returnOnCapital")}
              </>
            )}
          </span>
        </div>

         <StatTile wide label={t("stats.balance")}>
           <span className="num text-lg">{formatMoney(stats.current_balance, currency, locale)}</span>
           <Sub>
             {t("stats.fees")} <span className="num">{formatMoney(stats.total_fees, undefined, locale)}</span>
          </Sub>
        </StatTile>

         <StatTile wide label={t("stats.winRate")}>
          <span className="num text-lg">
             {stats.win_pct === null ? t("common.noValue") : formatPercent(stats.win_pct, 2, locale)}
          </span>
          <Sub>
             <span className="num text-primary">{stats.win_count}</span> {t("stats.wins")} ·{" "}
             <span className="num text-destructive">{stats.loss_count}</span> {t("stats.losses")}
          </Sub>
        </StatTile>

         <StatTile wide label={t("stats.profitFactor")}>
          <span
            className={`num text-lg ${
              stats.profit_factor === null ? "" : profitFactorColor(stats.profit_factor)
            }`}
          >
             {stats.profit_factor === null ? t("common.noValue") : formatRatio(stats.profit_factor, 2, locale)}
          </span>
          <Sub>
             {stats.expectancy === null ? (
               t("stats.noExpectancy")
            ) : (
              <>
                {/* Kỳ vọng là một số TRUNG BÌNH, nên nó mang cả đuôi thập
                    phân của phép chia: "226.7289062500000000025". formatMoney
                    tự cắt về hai chữ số — chỗ này từng gọi roundDecimal thủ
                    công, và chính vì việc làm tròn nằm ở đây thay vì ở tầng
                    định dạng mà VerdictRow với KpiGrid vẫn in ra đủ hai mươi
                    chữ số. */}
                 {t("stats.expectancy")} {" "}
                 <span className="num">{formatMoney(stats.expectancy, undefined, locale)}</span>{t("stats.perTrade")}
              </>
            )}
          </Sub>
        </StatTile>

         <StatTile wide label={t("stats.maxDrawdown")}>
           <span className="num text-lg">{formatMoney(stats.max_drawdown, undefined, locale)}</span>
          <Sub>
             {stats.max_dd_pct === null ? (
               t("stats.notCalculated")
            ) : (
              <>
                 <span className="num">{formatPercent(stats.max_dd_pct, 2, locale)}</span> {t("stats.vsPeak")}
              </>
            )}
          </Sub>
        </StatTile>
    </StatGrid>
  );
}

/** Dòng ngữ cảnh dưới mỗi chỉ số: con số trần không nói được nó tốt hay xấu. */
function Sub({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}
