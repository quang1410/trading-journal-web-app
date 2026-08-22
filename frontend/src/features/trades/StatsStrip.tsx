import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import type { Stats } from "./types";

const KHONG_TINH_DUOC = "—";

/**
 * Ngưỡng §8.2 của spec mẹ, so bằng compareDecimal chứ không ép sang số.
 *
 * Bậc đóng dưới: > 2 xanh dương, >= 1.5 xanh lá, >= 1 vàng, còn lại đỏ.
 */
function mauProfitFactor(pf: string): string {
  if (compareDecimal(pf, "2") > 0) return "text-info";
  if (compareDecimal(pf, "1.5") >= 0) return "text-success";
  if (compareDecimal(pf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" };
  return { dau: "", lop: "text-muted-foreground" };
}

export function StatsStrip({ stats, currency }: { stats: Stats; currency: string }) {
  const net = dauVaMau(stats.net_profit);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <O nhan="Số lệnh">
        <span className="num">{stats.total_trades}</span>
      </O>

      <O nhan="Net">
        <span className={`num ${net.lop}`}>
          {`${net.dau}${formatMoney(stats.net_profit, currency)}`}
        </span>
      </O>

      <O nhan="Tỷ lệ thắng">
        <span className="num">
          {stats.win_pct === null ? KHONG_TINH_DUOC : `${formatMoney(stats.win_pct)}%`}
        </span>
      </O>

      <O nhan="Hệ số lợi nhuận">
        <span
          className={`num ${
            stats.profit_factor === null ? "" : mauProfitFactor(stats.profit_factor)
          }`}
        >
          {stats.profit_factor === null ? KHONG_TINH_DUOC : formatMoney(stats.profit_factor)}
        </span>
      </O>

      <O nhan="Sụt giảm lớn nhất">
        <span className="num">{formatMoney(stats.max_drawdown)}</span>
      </O>

      <O nhan="Số dư">
        <span className="num">{formatMoney(stats.current_balance, currency)}</span>
      </O>
    </div>
  );
}

/**
 * Một ô KPI. `role="group"` kèm `aria-label` để mỗi ô tự giới thiệu tên mình
 * cho trình đọc màn hình — và để test truy được từng ô mà không cần testid.
 */
function O({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <Card role="group" aria-label={nhan}>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-xs text-muted-foreground">{nhan}</span>
        {children}
      </CardContent>
    </Card>
  );
}
