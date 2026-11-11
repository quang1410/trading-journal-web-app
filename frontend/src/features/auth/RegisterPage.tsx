import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { ApiError } from "@/lib/api";
import { useRetryLock } from "./useRetryLock";
import { WaitlistLink, authLinkClass } from "./AuthLinks";

export function RegisterPage() {
  const { register } = useAuth();
  const { locale, t } = useI18n();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [submitting, setDangGui] = useState(false);
  const { lockedMinutes, lockFrom } = useRetryLock();

  async function submit(v: Credentials) {
    setErrorMsg(null);
    setClosed(false);
    setDangGui(true);
    try {
      await register(v.email, v.password, locale);
    } catch (e) {
      // 1403 "đã có tài khoản, đăng ký đã đóng" là đường đi BÌNH THƯỜNG ở
      // đây, không phải sự cố: đăng ký chỉ mở cho user đầu tiên.
      setErrorMsg(errorMessage(e, locale, t, "auth.registerClosed"));
      // Đã đóng thì đừng để khách đứng ở ngõ cụt: chỉ lối sang danh sách chờ.
      setClosed(e instanceof ApiError && e.code === 1403);
      lockFrom(e);
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-4">
      <BrandLogo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-semibold">{t("auth.register")}</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm buttonLabel={t("auth.register")} submitting={submitting} errorMsg={errorMsg} lockedMinutes={lockedMinutes} onSubmit={submit} />
          {closed && (
            <p className="text-sm">
              <WaitlistLink />
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("auth.haveAccount")} {" "}
            <Link to="/login" className={authLinkClass}>
              {t("auth.login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
