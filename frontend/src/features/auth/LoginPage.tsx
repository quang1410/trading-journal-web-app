import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";

export function LoginPage() {
  const { login } = useAuth();
  const { locale, t } = useI18n();
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui(v: Credentials) {
    setLoi(null);
    setDangGui(true);
    try {
      await login(v.email, v.password);
      // Không tự điều hướng: status chuyển sang "authed" và OnlyAnon trong
      // router lo việc đó. Một luật, một nơi.
    } catch (e) {
      setLoi(errorMessage(e, locale, t, "auth.loginFailed"));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-4">
      <BrandLogo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* h1 thẳng, không bọc CardTitle asChild: CardTitle của shadcn là
              một <div> thường, không dựng trên Slot, nên asChild sẽ hỏng. */}
          <h1 className="text-lg font-semibold">{t("auth.login")}</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm nhanNut={t("auth.login")} dangGui={dangGui} loi={loi} onSubmit={gui} />
          <p className="text-sm text-muted-foreground">
            {t("auth.noAccount")} {" "}
            <Link to="/register" className="text-primary underline">
              {t("auth.register")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
