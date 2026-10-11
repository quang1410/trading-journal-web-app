import { useI18n } from "@/i18n";
import { ScoreTicket } from "./ScoreTicket";
import { SectionTitle } from "./SectionTitle";

export function ScoringSection() {
  const { t } = useI18n();
  return (
    <section id="scoring" className="border-t py-[72px]">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
        <div className="grid gap-4 text-[17px]">
          <SectionTitle>
            {t("landing.scoring.title")}
          </SectionTitle>
          <p className="text-muted-foreground">{t("landing.scoring.questions")}</p>
          <p className="text-muted-foreground">
            {t("landing.scoring.pointsLead")}{" "}
            <strong className="font-semibold text-foreground">{t("landing.scoring.pointsStrong")}</strong>{" "}
            {t("landing.scoring.pointsTail")}
          </p>
          <p className="text-sm text-muted-foreground">{t("landing.scoring.tryIt")}</p>
        </div>
        <ScoreTicket />
      </div>
    </section>
  );
}
