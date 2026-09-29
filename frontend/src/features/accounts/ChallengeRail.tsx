import { XIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { phaseSteps } from "./challenge";
import type { ChallengePhase, ChallengeStatus } from "./types";

const STATE_KEY = {
  done: "accounts.stepDone",
  current: "accounts.stepCurrent",
  failed: "accounts.stepFailed",
  upcoming: "accounts.stepUpcoming",
} as const;

/**
 * Thanh ba vòng: điểm nhấn DUY NHẤT của một hàng quỹ (spec §6.3).
 *
 * Một danh sách có thứ tự thật (<ol>), vì vòng thi đúng là một chuỗi — đây
 * là chỗ hiếm hoi mà đánh số là thông tin chứ không phải trang trí.
 *
 * Trạng thái nói bằng HÌNH của nút (CSS theo data-state) và bằng CHỮ ẩn cho
 * trình đọc màn hình; màu chỉ bổ sung. Câu kết cục đầy đủ ("Thất bại ở Vòng
 * 2") nằm ngay dưới thanh, do ChallengeBlock vẽ.
 */
export function ChallengeRail({
  phases,
  phase,
  status,
}: {
  phases: readonly ChallengePhase[];
  phase: ChallengePhase | null;
  status: ChallengeStatus | null;
}) {
  const { t, locale } = useI18n();
  const steps = phaseSteps(phases, phase, status);
  if (steps.length === 0) return null;

  return (
    <ol className="challenge-rail" aria-label={t("accounts.challengeProgress")}>
      {steps.map((s) => (
        <li key={s.phase} data-state={s.state} aria-current={s.phase === phase ? "step" : undefined}>
          <span className="challenge-node" aria-hidden>
            {s.state === "failed" && <XIcon className="size-2.5" strokeWidth={3} />}
          </span>
          <span className="challenge-label">
            {enumLabel("challenge_phase", s.phase, locale, [...phases])}
            <span className="sr-only">: {t(STATE_KEY[s.state])}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
