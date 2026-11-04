import { Button } from "@/components/ui/button";
import { useMetaEnums } from "@/features/meta/hooks";
import type { Challenge } from "@/features/trades/types";
import { useI18n, type Locale, type Translate } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { errorMessage } from "@/i18n/errors";
import { formatPercent } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { challengeActions, drawdownTone, isReached } from "./challenge";
import { ChallengeRail } from "./ChallengeRail";
import { useUpdateAccount } from "./hooks";
import { ProgressMeter } from "./ProgressMeter";
import type { Account, ChallengePhase } from "./types";

function outcomeText(t: Translate, locale: Locale, phases: ChallengePhase[], a: Account): string {
  if (a.challenge_phase === "funded") {
    return t(a.challenge_status === "failed" ? "accounts.outcomeFundedFailed" : "accounts.outcomeFunded");
  }
  const phase = enumLabel("challenge_phase", a.challenge_phase ?? "", locale, phases);
  if (a.challenge_status === "passed") return t("accounts.outcomePassed", { phase });
  if (a.challenge_status === "failed") return t("accounts.outcomeFailed", { phase });
  return t("accounts.outcomeInProgress", { phase });
}

/**
 * Cột giữa của hàng quỹ: thanh vòng, câu kết cục, hai thanh luật, gợi ý.
 *
 * Gợi ý chỉ nói, không làm (spec §6.3 nguyên tắc 5): đạt mục tiêu thì hiện
 * câu "Đã đạt mục tiêu" kèm nút "Đánh dấu đã qua" ngay đó — người dùng tự
 * bấm, backend không tự đổi. Funded không có nút: không còn vòng nào để
 * qua (accounts_funded_not_passed). Và chỉ
 * hiện khi vòng còn đang thi: account đã thất bại không cần được nhắc là nó
 * chạm drawdown.
 */
export function ChallengeBlock({ account, challenge }: { account: Account; challenge: Challenge | null }) {
  const { t, locale } = useI18n();
  const { data: enums } = useMetaEnums();
  const phases = enums?.challenge_phases ?? [];
  const running = account.challenge_status === "in_progress";
  const update = useUpdateAccount();
  // Cùng nguồn với menu ⋯: Funded không có thao tác "pass" nào để hiện.
  const pass = challengeActions(phases, account.challenge_phase, account.challenge_status).find(
    (a) => a.kind === "pass",
  );

  const profit = challenge ? signAndColor(challenge.profit_pct) : null;

  return (
    // @container: thanh đo chọn bố cục theo bề rộng CỦA KHỐI NÀY — cùng một
    // khối nằm ở cột giữa hẹp hoặc trải hết hàng tuỳ bề rộng danh sách.
    <div className="@container flex min-w-0 flex-col gap-2">
      <ChallengeRail phases={phases} phase={account.challenge_phase} status={account.challenge_status} />
      <p className="text-sm">{outcomeText(t, locale, phases, account)}</p>

      {challenge && profit && account.profit_target && (
        <ProgressMeter
          label={t("accounts.meterProfit")}
          value={<span className={profit.colorClass}>{`${profit.sign}${formatPercent(challenge.profit_pct, 2, locale)}`}</span>}
          limit={formatPercent(account.profit_target, 2, locale)}
          ratio={challenge.target_progress}
          tone="profit"
        />
      )}
      {challenge && account.max_drawdown_limit && (
        <ProgressMeter
          label={t("accounts.meterDrawdown")}
          value={formatPercent(challenge.drawdown_pct, 2, locale)}
          limit={formatPercent(account.max_drawdown_limit, 2, locale)}
          ratio={challenge.drawdown_usage}
          tone={drawdownTone(challenge.drawdown_usage)}
        />
      )}

      {/* Hai câu gợi ý là NHÃN TRẠNG THÁI, không phải con số lãi/lỗ: dùng
          cặp --status-*-bg/-text của theme. Chữ xs bằng --primary hay
          --status-error trần trên nền thẻ chỉ đạt 2,5–3,8:1. */}
      {running && challenge && isReached(challenge.drawdown_usage) && (
        <p className="self-start rounded-sm bg-[var(--status-error-bg)] px-1.5 py-0.5 text-xs text-[var(--status-error-text)]">
          {t("accounts.drawdownBreached")}
        </p>
      )}
      {running && challenge && !isReached(challenge.drawdown_usage) && isReached(challenge.target_progress) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="rounded-sm bg-[var(--status-success-bg)] px-1.5 py-0.5 text-xs text-[var(--status-success-text)]">
            {t("accounts.targetReached")}
          </p>
          {pass && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: account.id, patch: pass.patch })}
            >
              {t("accounts.markPassed")}
            </Button>
          )}
        </div>
      )}
      {update.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(update.error, locale, t)}
        </p>
      )}
    </div>
  );
}
