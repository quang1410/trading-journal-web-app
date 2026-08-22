import { I18nextProvider, useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { i18nInstance } from "./config";
import type { TranslationKey } from "./vi";

export type { TranslationKey };
export type Locale = "vi" | "en";
export const LOCALE_KEY = "journal.locale";

function isLocale(value: string | null): value is Locale {
  return value === "vi" || value === "en";
}

export function readStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return isLocale(value) ? value : "vi";
  } catch {
    return "vi";
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // localStorage có thể bị chặn; locale trong phiên vẫn hoạt động.
  }
}

type Params = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: Params) => string;

export function useI18n(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
} {
  const { t: translate, i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "vi";

  return {
    locale,
    setLocale: (next) => {
      storeLocale(next);
      void i18n.changeLanguage(next);
    },
    t: (key, params) => String(translate(key, params)),
  };
}

function LocaleDocumentSync() {
  const { locale } = useI18n();

  useEffect(() => {
    storeLocale(locale);
    document.documentElement.lang = locale;
    document.title = i18nInstance.t("app.title");
  }, [locale]);

  return null;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [initialLocale] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    if (i18nInstance.language !== initialLocale) void i18nInstance.changeLanguage(initialLocale);
  }, [initialLocale]);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <LocaleDocumentSync />
      {children}
    </I18nextProvider>
  );
}
