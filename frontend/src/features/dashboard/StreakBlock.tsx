import { useI18n } from "@/i18n";

/**
 * Chuỗi thắng và chuỗi thua dài nhất.
 *
 * Khối RIÊNG, không nằm trong lưới KPI, và đó không phải chuyện thẩm mỹ:
 * backend tính hai con số này trên TOÀN BỘ dãy lệnh của account
 * (aggregate.All gọi Streaks(all), charts.go:175) trong khi mọi thứ khác trên
 * trang tính trên tập đã lọc. Đó là quy tắc 8 của CLAUDE.md — chuỗi và lũy kế
 * đi theo thứ tự stt của cả dãy, bộ lọc chỉ lọc phần hiển thị.
 *
 * Hệ quả: lọc còn một setup thì 23 KPI và bảy biểu đồ đổi số, hai con số này
 * đứng yên. Xếp chúng cạnh các KPI đã lọc là để người đọc tự suy ra một điều
 * sai, mà không có dòng chữ nào nói ngược lại.
 */
export function StreakBlock({
  win,
  loss,
  dangLoc,
}: {
  win: number;
  loss: number;
  dangLoc: boolean;
}) {
  const { t } = useI18n();

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.streaks")}</h3>

      <div className="flex flex-wrap gap-6">
        <div role="group" aria-label={t("dashboard.longestWin")} className="flex flex-col gap-1">
          <span className="eyebrow">{t("dashboard.longestWin")}</span>
          <span className="num text-2xl font-semibold text-primary">{win}</span>
        </div>
        <div role="group" aria-label={t("dashboard.longestLoss")} className="flex flex-col gap-1">
          <span className="eyebrow">{t("dashboard.longestLoss")}</span>
          <span className="num text-2xl font-semibold text-destructive">{loss}</span>
        </div>
      </div>

      {/* Chỉ hiện khi đang lọc. Hiện mọi lúc sẽ dạy người dùng bỏ qua nó, và
          lúc nó thật sự quan trọng thì nó đã thành nhiễu nền. */}
      {dangLoc && (
        <p role="note" className="text-xs text-muted-foreground">
          {t("dashboard.streakIgnoresFilter")}
        </p>
      )}
    </section>
  );
}
