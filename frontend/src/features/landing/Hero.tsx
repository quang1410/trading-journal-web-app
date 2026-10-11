import type { ReactNode } from "react";
import { useI18n } from "@/i18n";

/**
 * Khối mở đầu. Form và biểu đồ do LandingPage dựng rồi truyền vào: Hero chỉ
 * lo bố cục, còn trạng thái đăng ký (dùng chung với form cuối trang) nằm ở
 * LandingPage.
 */
export function Hero({ form, chart }: { form: ReactNode; chart: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="grid items-center gap-10 pt-6 pb-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-12 lg:pb-20">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-profit before:size-[7px] before:rounded-full before:bg-primary">
          {t("landing.hero.eyebrow")}
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.5rem,5.2vw,4.2rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
          {t("landing.hero.titleLead")} <em className="text-loss not-italic">{t("landing.hero.titleEmphasis")}</em>
        </h1>
        <p className="mt-5 max-w-[32em] text-[18px] text-muted-foreground">
          {t("landing.hero.lede")}{" "}
          <strong className="font-semibold text-foreground">{t("landing.hero.ledeStrong")}</strong>
        </p>
        <div data-testid="hero-signup" className="mt-8">
          {form}
        </div>
      </div>
      <div className="min-w-0">{chart}</div>
    </section>
  );
}
