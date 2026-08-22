import type { ReactNode } from "react";
import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { dauVaMau, mauProfitFactor, mauRecoveryFactor } from "@/lib/thresholds";
import type { Stats } from "@/features/trades/types";
import { useI18n } from "@/i18n";

/**
 * Đủ 23 chỉ số của /stats.
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

/** Một ô. `role="group"` + `aria-label` để trình đọc màn hình gọi được tên. */
function O({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={nhan} className="flex flex-col gap-1 bg-card p-3">
      <span className="eyebrow">{nhan}</span>
      {children}
    </div>
  );
}

/**
 * Giá trị có thể KHÔNG TÍNH ĐƯỢC.
 *
 * `null` bên Go là con trỏ nil: chưa có lệnh thua thì profit_factor không có
 * giá trị, chứ không bằng 0. `?? 0` ở đây sẽ biến "chưa thua lệnh nào" thành
 * "thua sạch" — một câu trả lời sai mà trông hoàn toàn bình thường.
 */
function Co({ v, lop, ve }: { v: string | null; lop?: string; ve: (s: string) => string }) {
  if (v === null) return <span className="num text-lg text-muted-foreground">—</span>;
  return <span className={`num text-lg font-medium ${lop ?? ""}`}>{ve(v)}</span>;
}

export function KpiGrid({ stats: s, currency }: { stats: Stats; currency: string }) {
  const { locale, t } = useI18n();
  const tien = (v: string) => formatMoney(v, currency, locale);
  const tienCoDau = (v: string) => `${dauVaMau(v).dau}${formatMoney(v, currency, locale)}`;
  const ty = (v: string) => formatRatio(v, 2, locale);
  const phanTram = (v: string) => formatPercent(v, 2, locale);
  const so = (n: number) => String(n);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-border">
      <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-4">
        <O nhan={t("kpi.netProfit")}>
          <Co v={s.net_profit} lop={dauVaMau(s.net_profit).lop} ve={tienCoDau} />
        </O>
        <O nhan={t("kpi.currentBalance")}>
          <Co v={s.current_balance} ve={tien} />
        </O>
        <O nhan={t("kpi.netReturnPct")}>
          <Co v={s.net_return_pct} ve={phanTram} />
        </O>
        <O nhan={t("kpi.profitFactor")}>
          <Co
            v={s.profit_factor}
            lop={s.profit_factor === null ? undefined : mauProfitFactor(s.profit_factor)}
            ve={ty}
          />
        </O>

        <O nhan={t("kpi.totalWin")}>
          <Co v={s.total_win} lop="text-primary" ve={tien} />
        </O>
        <O nhan={t("kpi.totalLoss")}>
          <Co v={s.total_loss} lop="text-destructive" ve={tien} />
        </O>
        <O nhan={t("kpi.totalFees")}>
          <Co v={s.total_fees} ve={tien} />
        </O>
        <O nhan={t("kpi.totalTrades")}>
          <span className="num text-lg font-medium">{so(s.total_trades)}</span>
        </O>

        <O nhan={t("kpi.winCount")}>
          <span className="num text-lg font-medium text-primary">{so(s.win_count)}</span>
        </O>
        <O nhan={t("kpi.lossCount")}>
          <span className="num text-lg font-medium text-destructive">{so(s.loss_count)}</span>
        </O>
        <O nhan={t("kpi.winPct")}>
          <Co v={s.win_pct} ve={phanTram} />
        </O>
        <O nhan={t("kpi.expectancy")}>
          <Co
            v={s.expectancy}
            lop={s.expectancy === null ? undefined : dauVaMau(s.expectancy).lop}
            ve={tienCoDau}
          />
        </O>

        <O nhan={t("kpi.aveWin")}>
          <Co v={s.ave_win} ve={tien} />
        </O>
        <O nhan={t("kpi.aveLoss")}>
          <Co v={s.ave_loss} ve={tien} />
        </O>
        <O nhan={t("kpi.biggestWinner")}>
          <Co v={s.biggest_winner} ve={tien} />
        </O>
        <O nhan={t("kpi.biggestLoser")}>
          <Co v={s.biggest_loser} ve={tien} />
        </O>

        <O nhan={t("kpi.oneR")}>
          <Co v={s.one_r} ve={tien} />
        </O>
        <O nhan={t("kpi.biggestRWin")}>
          <Co v={s.biggest_r_win} ve={ty} />
        </O>
        <O nhan={t("kpi.biggestRLoss")}>
          <Co v={s.biggest_r_loss} ve={ty} />
        </O>
        <O nhan={t("kpi.rrActual")}>
          <Co v={s.rr_actual} ve={ty} />
        </O>

        <O nhan={t("kpi.maxDrawdown")}>
          <Co v={s.max_drawdown} lop="text-destructive" ve={tien} />
        </O>
        <O nhan={t("kpi.maxDdPct")}>
          <Co v={s.max_dd_pct} ve={phanTram} />
        </O>
        <O nhan={t("kpi.recoveryFactor")}>
          <Co
            v={s.recovery_factor}
            lop={s.recovery_factor === null ? undefined : mauRecoveryFactor(s.recovery_factor)}
            ve={ty}
          />
        </O>
      </div>
    </div>
  );
}
