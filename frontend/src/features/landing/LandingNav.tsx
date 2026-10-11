import { Link } from "react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n, type TranslationKey } from "@/i18n";

const ANCHORS: [string, TranslationKey][] = [
  ["#scoring", "landing.nav.scoring"],
  ["#features", "landing.nav.features"],
  ["#faq", "landing.nav.faq"],
];

export function LandingNav() {
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <Link to="/" aria-label={t("nav.appName")}>
        <BrandLogo />
      </Link>
      <nav aria-label={t("landing.nav.label")} className="flex items-center gap-4 text-[15px] text-muted-foreground">
        {ANCHORS.map(([href, key]) => (
          <a key={href} href={href} className="hidden hover:text-foreground md:inline">
            {t(key)}
          </a>
        ))}
        <LanguageSwitcher />
        <ThemeToggle />
        <Link to="/login" className="font-medium text-foreground">
          {t("landing.nav.login")}
        </Link>
      </nav>
    </header>
  );
}
