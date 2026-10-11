import "@fontsource/ibm-plex-sans/600.css";
import "./landing.css";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { Faq } from "./Faq";
import { FeatureShowcase } from "./FeatureShowcase";
import { GapChart } from "./GapChart";
import { Hero } from "./Hero";
import { LandingAnalytics } from "./LandingAnalytics";
import { LandingNav } from "./LandingNav";
import { ScoringSection } from "./ScoringSection";
import { WaitlistForm, type SignupState } from "./WaitlistForm";
import { SectionTitle } from "./SectionTitle";

export function LandingPage() {
  const { t } = useI18n();
  const [signup, setSignup] = useState<SignupState | null>(null);
  const onJoined = (email: string) => setSignup({ email, answered: false });
  const onAnswered = () => setSignup((s) => (s ? { ...s, answered: true } : s));

  return (
    <div className="min-h-svh bg-background px-4 text-[16px] leading-relaxed text-foreground">
      <div className="mx-auto max-w-[1120px]">
        <LandingNav />
        <main>
          <Hero
            form={<WaitlistForm idPrefix="hero" signup={signup} onJoined={onJoined} onAnswered={onAnswered} />}
            chart={<GapChart />}
          />
          <ScoringSection />
          <FeatureShowcase />

          <section id="signup" className="border-t py-[72px]">
            <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
              <div>
                <SectionTitle>
                  {t("landing.closing.title")}
                </SectionTitle>
                <p className="mt-3.5 max-w-[36em] text-[18px] text-muted-foreground">{t("landing.closing.body")}</p>
              </div>
              <div data-testid="closing-signup">
                <WaitlistForm idPrefix="closing" signup={signup} onJoined={onJoined} onAnswered={onAnswered} />
              </div>
            </div>
          </section>

          <Faq />
        </main>
        <footer className="flex flex-wrap justify-between gap-4 border-t pt-8 pb-12 text-sm text-muted-foreground">
          <span>{t("nav.appName")}</span>
          <span>{t("landing.footer.sample")}</span>
        </footer>
      </div>
      <LandingAnalytics />
    </div>
  );
}
