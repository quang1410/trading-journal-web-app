import { Button } from "@/components/ui/button";
import { useI18n, type Locale } from "@/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="flex items-center gap-0.5" aria-label={t("language.label")}>
      {(["vi", "en"] as const).map((item: Locale) => (
        <Button
          key={item}
          type="button"
          variant={locale === item ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={locale === item}
          aria-label={item === "vi" ? t("language.vietnamese") : t("language.english")}
          onClick={() => setLocale(item)}
        >
          {item.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
