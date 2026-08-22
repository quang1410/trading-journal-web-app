import { ApiError } from "@/lib/api";
import type { TranslationKey, Translate, Locale } from "./index";

export function errorMessage(
  error: unknown,
  locale: Locale,
  t: Translate,
  knownKey?: TranslationKey,
): string {
  if (!(error instanceof ApiError)) return t("common.serverConnectionError");
  if (locale === "vi") return error.msg;
  if (knownKey) return t(knownKey);

  const keyByCode: Partial<Record<number, TranslationKey>> = {
    1400: "errors.validation",
    1401: "errors.unauthorized",
    1403: "errors.forbidden",
    1404: "errors.notFound",
    1409: "errors.conflict",
    1500: "errors.server",
  };
  return t(keyByCode[error.code] ?? "errors.unknown");
}
