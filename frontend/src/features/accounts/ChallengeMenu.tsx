import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMetaEnums } from "@/features/meta/hooks";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { errorMessage } from "@/i18n/errors";
import { challengeActions, type ChallengeAction } from "./challenge";
import { useUpdateAccount } from "./hooks";
import type { Account } from "./types";

/**
 * Ba thao tác người thi quỹ làm nhiều nhất sau khi tạo account. Mọi thứ khác
 * (đổi tên quỹ, sửa luật, quay lại vòng cũ) đi qua dialog Sửa — menu này cố
 * ý không phải một bản sao thứ hai của form.
 *
 * Không hỏi xác nhận: mọi thao tác ở đây đảo lại được bằng dialog Sửa.
 */
export function ChallengeMenu({ account }: { account: Account }) {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const update = useUpdateAccount();
  const phases = enums?.challenge_phases ?? [];
  const actions = challengeActions(phases, account.challenge_phase, account.challenge_status);
  if (actions.length === 0) return null;

  function label(a: ChallengeAction): string {
    if (a.kind === "advance") {
      return t("accounts.advanceTo", { phase: enumLabel("challenge_phase", a.patch.challenge_phase, locale, phases) });
    }
    return t(a.kind === "pass" ? "accounts.markPassed" : "accounts.markFailed");
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("accounts.challengeMenu", { code: account.code })}>
            <EllipsisIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <DropdownMenuItem key={a.kind} onSelect={() => update.mutate({ id: account.id, patch: a.patch })}>
              {label(a)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {update.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(update.error, locale, t)}
        </p>
      )}
    </div>
  );
}
