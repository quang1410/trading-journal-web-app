import type { Locale } from "@/i18n";

/**
 * Định dạng số MINH HOẠ của landing (USD nguyên). Không dùng cho tiền thật từ
 * backend — tiền thật là chuỗi và đi qua src/lib/decimal.ts.
 */
function formatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 2 });
}

/** "+1.330" / "−1.140" — dấu trừ thật (U+2212), thẳng hàng với dấu cộng. */
export function formatSigned(n: number, locale: Locale): string {
  const body = formatter(locale).format(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

export function formatPlain(n: number, locale: Locale): string {
  return formatter(locale).format(n);
}
