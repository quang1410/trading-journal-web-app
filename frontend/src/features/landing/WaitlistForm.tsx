import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useJoinWaitlist, useSaveWaitlistAnswers } from "./api";
import { ChoiceChip } from "./ChoiceChip";
import {
  JOURNAL_TOOLS,
  MARKETS,
  MARKET_LABEL,
  PROP_LABEL,
  PROP_STATUSES,
  TOOL_LABEL,
  looksLikeEmail,
  readSource,
  type Market,
} from "./waitlist";

export type SignupState = { email: string; answered: boolean };

type Props = {
  idPrefix: string;
  signup: SignupState | null;
  onJoined: (email: string) => void;
  onAnswered: () => void;
};

/**
 * Hai bước: email trước, ba câu hỏi sau. Email được lưu ngay ở bước một, nên
 * người bỏ qua khảo sát vẫn nằm trong danh sách chờ.
 *
 * Trạng thái đăng ký nằm ở LandingPage chứ không ở đây: trang có hai form,
 * đăng ký ở form này thì form kia cũng phải đổi theo.
 */
export function WaitlistForm({ idPrefix, signup, onJoined, onAnswered }: Props) {
  if (signup) return <AnswersStep idPrefix={idPrefix} signup={signup} onAnswered={onAnswered} />;
  return <EmailStep idPrefix={idPrefix} onJoined={onJoined} />;
}

/** Lỗi 4xx của backend là câu hiển thị được; mạng hỏng và 5xx dùng câu chung. */
function useSubmitError() {
  const { t, locale } = useI18n();
  return (error: unknown) =>
    error instanceof ApiError && error.status < 500
      ? errorMessage(error, locale, t)
      : t("landing.signup.networkError");
}

function EmailStep({ idPrefix, onJoined }: { idPrefix: string; onJoined: (email: string) => void }) {
  const { t, locale } = useI18n();
  const join = useJoinWaitlist();
  const submitError = useSubmitError();
  // Lấy query qua router chứ không qua window.location: cùng một nguồn sự
  // thật với phần còn lại của app, và chạy được dưới MemoryRouter.
  const { search } = useLocation();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [invalid, setInvalid] = useState(false);

  const emailId = `${idPrefix}-email`;
  const messageId = `${idPrefix}-email-message`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) {
      setInvalid(true);
      return;
    }
    join.mutate(
      { email: trimmed, locale, source: readSource(search), website },
      { onSuccess: () => onJoined(trimmed) },
    );
  }

  const hasError = invalid || join.isError;
  const message = invalid
    ? t("landing.signup.invalidEmail")
    : join.isError
      ? submitError(join.error)
      : t("landing.signup.hint");

  return (
    <form onSubmit={submit} noValidate className="grid max-w-[30rem] gap-2.5">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={emailId} className="sr-only">
          {t("landing.signup.emailLabel")}
        </label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          placeholder={t("landing.signup.emailPlaceholder")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setInvalid(false);
            join.reset();
          }}
          aria-invalid={hasError || undefined}
          aria-describedby={messageId}
          className="h-12 min-w-0 flex-[1_1_14rem] text-[16px]"
        />
        {/* Honeypot: ẩn khỏi người dùng và trình đọc màn hình; bot điền vào. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={`${idPrefix}-website`}>{t("landing.signup.honeypotLabel")}</label>
          <input
            id={`${idPrefix}-website`}
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={join.isPending}
          className="h-12 flex-none bg-cta px-5 text-[16px] font-semibold text-cta-foreground hover:bg-cta/90"
        >
          {t("landing.signup.submit")}
        </Button>
      </div>
      <p
        id={messageId}
        role={hasError ? "alert" : undefined}
        className={cn("text-sm", hasError ? "text-loss" : "text-muted-foreground")}
      >
        {message}
      </p>
    </form>
  );
}

function AnswersStep({
  idPrefix,
  signup,
  onAnswered,
}: {
  idPrefix: string;
  signup: SignupState;
  onAnswered: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveWaitlistAnswers();
  const submitError = useSubmitError();
  const [tool, setTool] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [prop, setProp] = useState("");

  if (signup.answered) {
    return (
      <div role="status" className="grid gap-1 rounded-lg border bg-card p-5">
        <p className="font-semibold">{t("landing.answers.saved")}</p>
        <p className="text-muted-foreground">{t("landing.answers.thanks")}</p>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { email: signup.email, journal_tool: tool, markets, prop_status: prop },
      { onSuccess: onAnswered },
    );
  }

  function toggleMarket(m: Market) {
    // Giữ thứ tự hiển thị chứ không phải thứ tự bấm: backend sắp lại đằng nào
    // cũng vậy, nhưng request ổn định thì test và log dễ đọc hơn.
    setMarkets((cur) => MARKETS.filter((x) => (x === m ? !cur.includes(m) : cur.includes(x))));
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-lg border bg-card p-5">
      <p role="status" className="font-semibold">
        {t("landing.signup.joined")}{" "}
        <span className="font-normal text-muted-foreground">
          {t("landing.signup.inviteTo", { email: signup.email })}
        </span>
      </p>

      <Question legend={t("landing.answers.toolQuestion")} note={t("landing.answers.optional")}>
        {JOURNAL_TOOLS.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-tool-${code}`}
            name={`${idPrefix}-tool`}
            type="radio"
            checked={tool === code}
            onChange={() => setTool(code)}
          >
            {t(TOOL_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <Question legend={t("landing.answers.marketQuestion")} note={t("landing.answers.multiple")}>
        {MARKETS.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-market-${code}`}
            name={`${idPrefix}-market`}
            type="checkbox"
            checked={markets.includes(code)}
            onChange={() => toggleMarket(code)}
          >
            {t(MARKET_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <Question legend={t("landing.answers.propQuestion")}>
        {PROP_STATUSES.map((code) => (
          <ChoiceChip
            key={code}
            id={`${idPrefix}-prop-${code}`}
            name={`${idPrefix}-prop`}
            type="radio"
            checked={prop === code}
            onChange={() => setProp(code)}
          >
            {t(PROP_LABEL[code])}
          </ChoiceChip>
        ))}
      </Question>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={save.isPending}
          className="h-11 bg-cta px-5 font-semibold text-cta-foreground hover:bg-cta/90"
        >
          {t("landing.answers.submit")}
        </Button>
        {save.isError && (
          <p role="alert" className="text-sm text-loss">
            {submitError(save.error)}
          </p>
        )}
      </div>
    </form>
  );
}

function Question({ legend, note, children }: { legend: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-medium">
        {legend} {note && <small className="font-normal text-muted-foreground">{note}</small>}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
