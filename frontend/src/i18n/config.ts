import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { vi } from "./vi";

export const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

function initialLocale(): "vi" | "en" {
  try {
    return localStorage.getItem("journal.locale") === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export const i18nInstance = i18n.use(initReactI18next);
void i18nInstance.init({
  resources,
  lng: initialLocale(),
  fallbackLng: "vi",
  supportedLngs: ["vi", "en"],
  ns: ["translation"],
  defaultNS: "translation",
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    escapeValue: false,
    prefix: "{",
    suffix: "}",
  },
  react: {
    useSuspense: false,
  },
});
