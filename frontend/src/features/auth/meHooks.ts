import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Locale } from "@/i18n";

/** GET /api/auth/me (K-56). */
export type Me = {
  id: number;
  email: string;
  locale: Locale;
  email_verified: boolean;
  /** Hạn xác minh (ISO, UTC). null khi đã xác minh hoặc server tắt xác minh. */
  verify_deadline: string | null;
  /** Đã quá hạn mà chưa xác minh: route dữ liệu đang trả 403 / 1460. */
  verification_required: boolean;
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.get<Me>("/auth/me") });
}

export function useResendVerification() {
  return useMutation<unknown, ApiError, Locale>({
    mutationFn: (locale) => api.post("/auth/verify/request", { locale }),
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày còn lại tới hạn, làm tròn lên, không âm. */
export function daysLeft(deadlineIso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(deadlineIso) - now) / DAY_MS));
}
