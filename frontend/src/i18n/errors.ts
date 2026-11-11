import { ApiError } from "@/lib/api";
import type { TranslationKey, Translate, Locale } from "./index";

export function errorMessage(
  error: unknown,
  locale: Locale,
  t: Translate,
  knownKey?: TranslationKey,
): string {
  if (!(error instanceof ApiError)) return t("common.serverConnectionError");
  // 429 ghép câu từ Retry-After ở CẢ hai thứ tiếng và đứng trước knownKey:
  // knownKey là câu của lỗi thường gặp ở form đó ("sai mật khẩu", "đăng ký
  // đã đóng"), áp nó cho 429 là nói sai lý do.
  if (error.code === 1429) {
    return error.retryAfter
      ? t("errors.retryInMinutes", { n: Math.ceil(error.retryAfter / 60) })
      : t("errors.retrySoon");
  }
  // Cùng lý do: "máy chủ bận" không phải "sai mật khẩu".
  if (error.code === 1503) return t("errors.serverBusy");
  if (locale === "vi") return error.msg;
  if (knownKey) return t(knownKey);

  // Hai hỏng hóc client tự phát hiện mang cùng code 1500 nhưng khác câu chữ.
  // Không có nhánh này thì cả hai rơi về "errors.server" chung chung, và hai
  // khoá dưới đây dịch sẵn mà chẳng ai dùng.
  if (error.kind === "unreadable") return t("errors.unreadableResponse");
  if (error.kind === "invalid") return t("errors.invalidResponse");

  const keyByCode: Partial<Record<number, TranslationKey>> = {
    1400: "errors.validation",
    1401: "errors.unauthorized",
    1403: "errors.forbidden",
    1404: "errors.notFound",
    1409: "errors.conflict",
    1413: "errors.payloadTooLarge",
    1460: "errors.emailUnverified",
    1500: "errors.server",
  };
  return t(keyByCode[error.code] ?? "errors.unknown");
}
