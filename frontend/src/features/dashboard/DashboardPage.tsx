import { Link } from "react-router";
import { AccountGate, ErrorBlock } from "@/components/AccountGate";
import { Loading } from "@/components/Loading";
import { FilterBar } from "@/components/FilterBar";
import type { Account } from "@/features/accounts/types";
import { useFilterParams } from "@/features/trades/useFilterParams";
import { useStats } from "@/features/trades/hooks";
import { useI18n } from "@/i18n";
import { CollapsibleSection } from "./CollapsibleSection";
import { DailyPnlChart } from "./DailyPnlChart";
import { MonthCalendarCard } from "./MonthCalendarCard";
import { RecentTradesPanel } from "./RecentTradesPanel";
import { VerdictRow } from "./VerdictRow";
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
 * AccountGate giữ hộ quy tắc hook: BangDieuKhien chỉ dựng khi đã chắc chắn có
 * account, nên mọi hook bên trong nó gọi được `account.id` mà không cần return
 * sớm. Cùng khuôn với TradesPage và TrashPage.
 */
export function DashboardPage() {
  return <AccountGate row={4}>{(account) => <ControlBar account={account} />}</AccountGate>;
}

function ControlBar({ account }: { account: Account }) {
  const { t } = useI18n();
  const { filter, deferredFilter, setFilter, hasFilter } = useFilterParams();

  const bd = useCharts(account.id, deferredFilter);
  const kpi = useStats(account.id, deferredFilter);

  // KHÔNG có số trang ở đây: /charts và /stats gom trên toàn bộ tập đã lọc.

  if (bd.isError || kpi.isError) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar accountId={account.id} value={filter} onChange={setFilter} />
        <ErrorBlock error={bd.error ?? kpi.error} />
      </section>
    );
  }

  if (bd.isPending || kpi.isPending) {
    return (
      <section className="flex flex-col gap-4">
        <FilterBar accountId={account.id} value={filter} onChange={setFilter} />
        <Loading row={6} />
      </section>
    );
  }

  const c = bd.data;
  const empty = kpi.data.total_trades === 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </header>

      {/* Dính trên đỉnh vì nó áp cho MỌI mục bên dưới; để nó cuộn mất đi sẽ
          làm người ta quên mình đang xem tập lệnh nào. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-1">
        <FilterBar accountId={account.id} value={filter} onChange={setFilter} />
      </div>

      {empty ? (
        // Hai trạng thái rỗng, hai lời mời khác nhau. Gộp làm một sẽ mời người
        // dùng thêm lệnh trong khi họ chỉ cần bỏ một bộ lọc.
        <p className="text-muted-foreground">
          {hasFilter ? t("dashboard.noMatch") : t("dashboard.noTrades")}{" "}
          <Link to="/trades" className="text-primary underline underline-offset-4">
            {t("dashboard.goToJournal")}
          </Link>
        </p>
      ) : (
        <>
          {/* ── Tầng 1: câu trả lời ────────────────────────────────────
              Năm con số và cái lịch. Đây là phần người ta mở trang để xem, và
              nó phải nằm gọn trong màn hình đầu tiên — nên lưới 24 ô KPI cũ
              lui xuống sau một nút mở, còn mười hai biểu đồ nhóm/thời gian lui
              xuống tầng 3. Trước đây tầng này không tồn tại: trang mở bằng 24
              con số cùng một cỡ chữ, không con số nào được ưu tiên. */}
          <section className="flex flex-col gap-3">
            <h2 className="sr-only">{t("dashboard.overview")}</h2>
            <VerdictRow stats={kpi.data} currency={account.currency} />

            {/* Lịch chiếm hai phần ba, danh sách lệnh một phần ba: cái lịch
                phải đủ rộng để một ô chứa được con số, còn danh sách chỉ cần
                đủ cho một dòng ngắn. Màn hẹp thì xếp chồng. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <MonthCalendarCard
                months={c.heatmap}
                currency={account.currency}
                accountId={account.id}
                filter={deferredFilter}
              />
              <RecentTradesPanel
                accountId={account.id}
                filter={deferredFilter}
                currency={account.currency}
                timezone={account.timezone}
              />
            </div>

            {/* Lưới 24 ô KHÔNG mất đi — nó chỉ thôi làm cửa vào của trang.
                Đóng sẵn: ai cần tra một chỉ số cụ thể vẫn mở được bằng một
                cú bấm, còn người mở trang để xem mình lãi hay lỗ thì không
                phải cuộn qua nó. */}
            <CollapsibleSection title={t("dashboard.allMetrics")} id="all-metrics">
              <KpiGrid stats={kpi.data} currency={account.currency} />
            </CollapsibleSection>
          </section>

          {/* ── Tầng 2: đường đi ───────────────────────────────────────
              Hai đường cong + ba tile kết luận + chuỗi thắng/thua. Mở sẵn:
              equity curve là thứ hai người ta nhìn sau con số lãi ròng. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t("dashboard.growth")}</h2>
            <DailyPnlChart rows={c.by_day} currency={account.currency} />
            <TheoryVsActualChart rows={c.theory_vs_actual} currency={account.currency} />
            {/* Ba tile là điểm CUỐI của chính hai đường ngay trên. Tách sang
                section khác thì người đọc phải cuộn để nối kết luận với hình. */}
            <TheorySummaryBlock data={c.theory_summary} currency={account.currency} />
            {/* StreakBlock theo hai đường lũy kế xuống đây: nó cũng là con số
                tính trên TOÀN BỘ dãy lệnh theo thứ tự stt (quy tắc 8), giống
                hệt hai đường trên và khác hẳn mọi thứ ở tầng 1 — vốn tính
                trên tập đã lọc. Đặt cạnh nhau thì cái nhãn "không theo bộ
                lọc" nói về cả cụm, thay vì về mỗi một khối lạc lõng. */}
            <StreakBlock
              win={c.longest_win_streak}
              loss={c.longest_loss_streak}
              isFiltering={hasFilter}
            />
          </section>

          {/* ── Tầng 3: phân tích ──────────────────────────────────────
              Mười hai biểu đồ trả lời những câu hỏi hỏi mỗi tuần một lần, chứ
              không phải mỗi ngày. Đóng sẵn, và đóng theo NHÓM chứ không phải
              từng cái: người ta ngồi xuống để "soi theo nhóm", không phải để
              mở riêng biểu đồ theo khung thời gian. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t("dashboard.detail")}</h2>

            <CollapsibleSection title={t("dashboard.byGroup")} id="by-group">
              <div className="grid gap-4 lg:grid-cols-2">
                <PivotBarChart
                  title={t("dashboard.bySetup")}
                  rows={c.by_setup}
                  currency={account.currency}
                />
                <PivotBarChart
                  title={t("dashboard.bySymbol")}
                  rows={c.by_symbol}
                  currency={account.currency}
                />
                <PivotBarChart
                  title={t("dashboard.byTimeframe")}
                  rows={c.by_timeframe}
                  currency={account.currency}
                />
                <PivotBarChart
                  title={t("dashboard.byDirection")}
                  rows={c.by_direction}
                  currency={account.currency}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title={t("dashboard.byTime")} id="by-time">
              <div className="grid gap-4 lg:grid-cols-2">
                <WeekdayChart rows={c.by_weekday} currency={account.currency} />
                <PivotBarChart
                  title={t("dashboard.byWeek")}
                  rows={c.by_week}
                  currency={account.currency}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title={t("dashboard.quality")} id="quality">
              <ScoreRadarBlock score={c.score} radar={c.radar} />
              <ExecutionQualityBlock data={c.execution} />
              <div className="grid gap-4 lg:grid-cols-2">
                <TradeClassChart rows={c.by_trade_class} currency={account.currency} />
                <WinLossDonut data={c.win_loss} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title={t("dashboard.rDist")} id="r-dist">
              <RDistributionChart rows={c.r_distribution} />
            </CollapsibleSection>
          </section>
        </>
      )}
    </section>
  );
}
