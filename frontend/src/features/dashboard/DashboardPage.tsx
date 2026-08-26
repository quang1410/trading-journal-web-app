import { useDeferredValue, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { DangTai } from "@/components/DangTai";
import { FilterBar } from "@/components/FilterBar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { readFilter, writeParams, type TradeFilter } from "@/features/trades/filters";
import { useStats } from "@/features/trades/hooks";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { DailyPnlChart } from "./DailyPnlChart";
import { HeatmapChart } from "./HeatmapChart";
import { KpiGrid } from "./KpiGrid";
import { PivotBarChart } from "./PivotBarChart";
import { RDistributionChart } from "./RDistributionChart";
import { ExecutionQualityBlock } from "./ExecutionQualityBlock";
import { ScoreRadarBlock } from "./ScoreRadarBlock";
import { StreakBlock } from "./StreakBlock";
import { TheorySummaryBlock } from "./TheorySummaryBlock";
import { TradeClassChart } from "./TradeClassChart";
import { WinLossDonut } from "./WinLossDonut";
import { TheoryVsActualChart } from "./TheoryVsActualChart";
import { WeekdayChart } from "./WeekdayChart";
import { useCharts } from "./hooks";

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi BangDieuKhien vì mọi hook đều cần `account.id`: gọi chúng rồi
 * mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì số
 * lượng hook đổi giữa các lần render. Cùng khuôn với TradesPage.
 */
export function DashboardPage() {
  const { account, isPending } = useActiveAccount();
  const { t } = useI18n();

  if (isPending) return <DangTai dong={4} />;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        {t("trades.noAccount")}{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          {t("trades.createAccount")}
        </Link>{" "}
        {t("trades.startJournal")}
      </p>
    );
  }

  return <BangDieuKhien account={account} />;
}

function BangDieuKhien({ account }: { account: Account }) {
  const { locale, t } = useI18n();
  const [sp, setSp] = useSearchParams();

  // useMemo vì readFilter dựng object MỚI mỗi lần render, mà object đó là đầu
  // vào của useDeferredValue ngay bên dưới — so bằng Object.is thì "mới mỗi
  // lần" nghĩa là "luôn khác", và cơ chế hoãn không bao giờ bắt kịp.
  const filter = useMemo(() => readFilter(sp), [sp]);
  const filterHoan = useDeferredValue(filter);

  const bd = useCharts(account.id, filterHoan);
  const kpi = useStats(account.id, filterHoan);

  const coLoc = Object.values(filter).some((v) => v !== "");

  // KHÔNG có số trang ở đây: /charts và /stats gom trên toàn bộ tập đã lọc.
  // replace chứ không push — gõ mười ký tự vào ô mã sản phẩm mà đẩy mười mục
  // vào history thì nút Back phải bấm mười lần mới rời khỏi trang.
  function datFilter(f: TradeFilter) {
    setSp(writeParams(f, 1), { replace: true });
  }

  if (bd.isError || kpi.isError) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar value={filter} onChange={datFilter} />
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(bd.error ?? kpi.error, locale, t)}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (bd.isPending || kpi.isPending) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar value={filter} onChange={datFilter} />
        <DangTai dong={6} />
      </section>
    );
  }

  const c = bd.data;
  const trong = kpi.data.total_trades === 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </header>

      {/* Dính trên đỉnh vì nó áp cho MỌI mục bên dưới; để nó cuộn mất đi sẽ
          làm người ta quên mình đang xem tập lệnh nào. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-1">
        <FilterBar value={filter} onChange={datFilter} />
      </div>

      {trong ? (
        // Hai trạng thái rỗng, hai lời mời khác nhau. Gộp làm một sẽ mời người
        // dùng thêm lệnh trong khi họ chỉ cần bỏ một bộ lọc.
        <p className="text-muted-foreground">
          {coLoc ? t("dashboard.noMatch") : t("dashboard.noTrades")}{" "}
          <Link to="/trades" className="text-primary underline underline-offset-4">
            {t("dashboard.goToJournal")}
          </Link>
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.overview")}</h2>
            <KpiGrid stats={kpi.data} currency={account.currency} />
            <StreakBlock
              win={c.longest_win_streak}
              loss={c.longest_loss_streak}
              dangLoc={coLoc}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.growth")}</h2>
            <DailyPnlChart rows={c.by_day} currency={account.currency} />
            <TheoryVsActualChart rows={c.theory_vs_actual} currency={account.currency} />
            {/* Ba tile là điểm CUỐI của chính hai đường ngay trên. Tách sang
                section khác thì người đọc phải cuộn để nối kết luận với hình. */}
            <TheorySummaryBlock data={c.theory_summary} currency={account.currency} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.byGroup")}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <PivotBarChart
                tieuDe={t("dashboard.bySetup")}
                rows={c.by_setup}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.bySymbol")}
                rows={c.by_symbol}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.byTimeframe")}
                rows={c.by_timeframe}
                currency={account.currency}
              />
              <PivotBarChart
                tieuDe={t("dashboard.byDirection")}
                rows={c.by_direction}
                currency={account.currency}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.byTime")}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <WeekdayChart rows={c.by_weekday} currency={account.currency} />
              <PivotBarChart
                tieuDe={t("dashboard.byWeek")}
                rows={c.by_week}
                currency={account.currency}
              />
            </div>
            <HeatmapChart months={c.heatmap} currency={account.currency} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.quality")}</h2>
            <ScoreRadarBlock score={c.score} radar={c.radar} />
            <ExecutionQualityBlock data={c.execution} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TradeClassChart rows={c.by_trade_class} currency={account.currency} />
              <WinLossDonut data={c.win_loss} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.rDist")}</h2>
            <RDistributionChart rows={c.r_distribution} />
          </section>
        </>
      )}
    </section>
  );
}
