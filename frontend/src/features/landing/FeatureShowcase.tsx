import type { ReactNode } from "react";
import { useI18n, type TranslationKey } from "@/i18n";
import { ChallengePreview } from "./previews/ChallengePreview";
import { DashboardPreview } from "./previews/DashboardPreview";
import { ImportPreview } from "./previews/ImportPreview";
import { NotePreview } from "./previews/NotePreview";
import { PeriodPreview } from "./previews/PeriodPreview";
import { SectionTitle } from "./SectionTitle";

const GROUPS: TranslationKey[] = [
  "landing.features.groupEquity",
  "landing.features.groupSetup",
  "landing.features.groupSymbol",
  "landing.features.groupTimeframe",
  "landing.features.groupDirection",
  "landing.features.groupWeekday",
  "landing.features.groupWeek",
  "landing.features.groupDay",
  "landing.features.groupHeatmap",
  "landing.features.groupR",
  "landing.features.groupHold",
  "landing.features.groupRadar",
  "landing.features.groupTheory",
];

const CARDS: [TranslationKey, TranslationKey, () => ReactNode][] = [
  ["landing.features.challengeTitle", "landing.features.challengeBody", () => <ChallengePreview />],
  ["landing.features.periodTitle", "landing.features.periodBody", () => <PeriodPreview />],
  ["landing.features.noteTitle", "landing.features.noteBody", () => <NotePreview />],
  ["landing.features.importTitle", "landing.features.importBody", () => <ImportPreview />],
];

/** Khung "màn hình" quanh một hình minh hoạ. role="img" + tên để trình đọc màn hình không đọc từng số mẫu. */
function Screen({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div
      role="img"
      aria-label={t("landing.features.previewLabel", { name })}
      className="grid min-w-0 gap-2.5 rounded-lg border bg-surface-sunken p-3"
    >
      {children}
    </div>
  );
}

export function FeatureShowcase() {
  const { t } = useI18n();
  const dashboard = t("landing.features.dashboardTitle");
  return (
    <section id="features" className="border-t py-[72px]">
      <SectionTitle>
        {t("landing.features.title1")}
        <br />
        {t("landing.features.title2")}
      </SectionTitle>
      <p className="mt-3.5 max-w-[36em] text-[18px] text-muted-foreground">{t("landing.features.intro")}</p>

      <div className="mt-10 grid gap-5">
        <article className="grid min-w-0 gap-6 rounded-[10px] border bg-card p-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-8 lg:p-7">
          <div>
            <h3 className="font-display text-[24px] leading-[1.22] font-semibold">{dashboard}</h3>
            <p className="mt-2.5 text-muted-foreground">
              <strong className="font-semibold text-foreground">{t("landing.features.dashboardStrong")}</strong>{" "}
              {t("landing.features.dashboardBody")}
            </p>
            <ul aria-label={t("landing.features.groupsLabel")} className="mt-[18px] flex list-none flex-wrap gap-1.5 p-0">
              {GROUPS.map((key) => (
                <li key={key} className="rounded bg-surface-sunken px-2 py-0.5 text-[13px]">
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <Screen name={dashboard}>
            <DashboardPreview />
          </Screen>
        </article>

        <div className="grid gap-5 md:grid-cols-2">
          {CARDS.map(([titleKey, bodyKey, preview]) => (
            <article key={titleKey} className="grid min-w-0 content-start gap-[18px] rounded-[10px] border bg-card p-6">
              <div>
                <h3 className="font-display text-[20px] leading-[1.22] font-semibold">{t(titleKey)}</h3>
                <p className="mt-1.5 text-muted-foreground">{t(bodyKey)}</p>
              </div>
              <Screen name={t(titleKey)}>{preview()}</Screen>
            </article>
          ))}
        </div>
      </div>

      <p className="mt-7 max-w-[52em] text-[15px] text-muted-foreground">
        <strong className="font-semibold text-foreground">{t("landing.features.extrasLead")}</strong>{" "}
        {t("landing.features.extras")}
      </p>
      <p className="mt-3 max-w-[52em] text-[15px] text-muted-foreground">{t("landing.features.origin")}</p>
    </section>
  );
}
