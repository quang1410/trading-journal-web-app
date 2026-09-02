import { Link } from "react-router";
import { ErrorBlock } from "@/components/AccountGate";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import { formatInstant } from "@/lib/datetime";
import { useTrades } from "@/features/trades/hooks";
import type { TradeFilter } from "@/features/trades/filters";
import { useI18n } from "@/i18n";
import { BareCard } from "./ChartCard";

const SIZE = 8;

/**
 * Tám lệnh gần nhất, đặt cạnh lịch P&L.
 *
 * Backend sắp lệnh theo stt TĂNG dần (repository/trade.go ListPaged), nên
 * "gần nhất" nằm ở TRANG CUỐI chứ không phải trang 1. Đây là chỗ dễ sai nhất
 * của khối này và sai rất êm: lấy trang 1 sẽ hiện tám lệnh CŨ NHẤT, vẫn là
 * lệnh thật, vẫn đúng định dạng, chỉ sai ý nghĩa.
 *
 * Cái giá là hai lượt hỏi: lượt đầu để biết `total`, lượt sau lấy đúng trang
 * cuối. Chấp nhận được vì TanStack cache cả hai và bộ lọc đổi mới hỏi lại;
 * đổi lại là không phải thêm tham số sort vào API. Nếu sau này backend có
 * `sort=desc` thì bỏ được lượt đầu.
 *
 * Trong lúc lượt đầu còn chạy, `total` chưa biết nên `lastPage` tạm là 1 —
 * tức hai query mang ĐÚNG CÙNG một khoá. TanStack gộp chúng làm một request,
 * nên khoảng thời gian đó không sinh lượt hỏi thừa, cũng không dựng nhầm
 * trang 1 ra màn hình: cả hai cùng trỏ vào một entry cache đang pending.
 */
export function RecentTradesPanel({
  accountId,
  filter,
  currency,
  timezone,
}: {
  accountId: number;
  filter: TradeFilter;
  currency: string;
  timezone: string;
}) {
  const { locale, t } = useI18n();

  const probe = useTrades(accountId, filter, 1, SIZE);
  const total = probe.data?.total ?? 0;
  const lastPage = total > 0 ? Math.ceil(total / SIZE) : 1;
  // Trang cuối trùng trang 1 thì query này dùng lại đúng cache của lượt đầu,
  // không phát sinh request thứ hai.
  const page = useTrades(accountId, filter, lastPage, SIZE);

  const q = lastPage === 1 ? probe : page;

  if (q.isError || probe.isError) {
    return (
      <BareCard title={t("dashboard.recentTrades")} empty={false}>
        <ErrorBlock error={q.error ?? probe.error} />
      </BareCard>
    );
  }

  const items = q.data?.items ?? [];
  if (!q.isPending && items.length === 0) {
    return (
      <BareCard title={t("dashboard.recentTrades")} empty={false}>
        <p className="text-sm text-muted-foreground">{t("dashboard.noRecentTrades")}</p>
      </BareCard>
    );
  }

  // Trang cuối vẫn tăng dần theo stt; đảo lại để lệnh mới nhất lên đầu.
  const recent = [...items].reverse();

  return (
    <BareCard title={t("dashboard.recentTrades")} empty={false}>
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((x) => (
            <li key={x.id}>
              {/* Cả dòng là một đích bấm: mắt đã đọc dòng đó như một đơn vị,
                  bắt người ta nhắm vào riêng mã sản phẩm là bắt nhắm hai lần. */}
              <Link
                to="/trades"
                className="-mx-1 flex items-baseline gap-2 rounded-sm border-b border-[var(--border-muted)] px-1 py-2 last:border-0 hover:bg-[var(--surface-sunken)]"
              >
                <span className="num shrink-0 text-[10px] text-muted-foreground">
                  {formatInstant(x.entered_at, timezone, locale).slice(0, 10)}
                </span>
                <span className="truncate text-xs font-medium">{x.symbol}</span>
                {/* Chiều lệnh là chip viền, không phải chip tô nền: hai màu tô
                    duy nhất của khối này đã dành cho lãi/lỗ. */}
                <span className="num shrink-0 rounded-sm border border-[var(--border-input)] px-1 text-[10px] uppercase text-muted-foreground">
                  {x.direction}
                </span>
                <span className={`num ml-auto shrink-0 text-xs font-semibold ${sign(x.net)}`}>
                  {formatMoney(x.net, currency, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BareCard>
  );
}

function sign(v: string): string {
  const d = compareDecimal(v, "0");
  return d > 0 ? "text-[var(--chart-profit)]" : d < 0 ? "text-[var(--chart-loss)]" : "";
}
