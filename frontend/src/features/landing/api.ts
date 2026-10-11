import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Locale } from "@/i18n";

export type WaitlistJoinBody = { email: string; locale: Locale; source: string; website: string };
export type WaitlistAnswersBody = {
  email: string;
  journal_tool: string;
  markets: string[];
  prop_status: string;
};

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: (body: WaitlistJoinBody) => api.post<{ joined: boolean }>("/waitlist", body),
  });
}

export function useSaveWaitlistAnswers() {
  return useMutation({
    mutationFn: (body: WaitlistAnswersBody) => api.put<{ saved: boolean }>("/waitlist/answers", body),
  });
}
