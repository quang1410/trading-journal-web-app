import type { ReactNode } from "react";
import { MailWarningIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { daysLeft, useMe, useResendVerification, type Me } from "./meHooks";

/**
 * Bọc nội dung trang trong AppShell (K-56).
 *
 * - Chưa xác minh, còn trong ân hạn: banner phía trên, trang vẫn dùng được.
 * - Quá hạn (`verification_required`): thay cả trang bằng màn hình yêu cầu
 *   xác minh — mọi route dữ liệu đang trả 1460, hiện trang là hiện một loạt lỗi.
 * - /auth/me đang tải hoặc lỗi: hiện trang như thường. Không chặn người dùng
 *   chỉ vì không hỏi được trạng thái; backend vẫn là nơi cưỡng chế.
 */
export function VerificationGate({ children }: { children: ReactNode }) {
  const { data } = useMe();
  if (data?.verification_required) return <VerificationRequired me={data} />;
  return (
    <>
      {data && !data.email_verified && data.verify_deadline && (
        <VerificationBanner me={data} deadline={data.verify_deadline} />
      )}
      {children}
    </>
  );
}

function VerificationBanner({ me, deadline }: { me: Me; deadline: string }) {
  const { t } = useI18n();
  return (
    <Alert className="mb-4">
      <MailWarningIcon aria-hidden />
      <AlertDescription className="flex flex-col gap-2">
        <p>{t("verify.bannerDays", { email: me.email, n: daysLeft(deadline) })}</p>
        <ResendButton email={me.email} />
      </AlertDescription>
    </Alert>
  );
}

function VerificationRequired({ me }: { me: Me }) {
  const { t } = useI18n();
  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 py-10">
      <h1 className="text-lg font-semibold">{t("verify.requiredTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("verify.requiredBody", { email: me.email })}</p>
      <ResendButton email={me.email} />
    </section>
  );
}

function ResendButton({ email }: { email: string }) {
  const { locale, t } = useI18n();
  const resend = useResendVerification();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={resend.isPending}
        onClick={() => resend.mutate(locale)}
      >
        {resend.isPending ? t("verify.sending") : t("verify.resend")}
      </Button>
      {/* Vùng live luôn nằm trong DOM, chỉ đổi chữ: trình đọc màn hình mới đọc. */}
      <p role="status" className="text-sm">
        {resend.isSuccess && t("verify.sent", { email })}
      </p>
      {resend.isError && (
        <p role="alert" className="text-sm text-loss">
          {errorMessage(resend.error, locale, t)}
        </p>
      )}
    </div>
  );
}
