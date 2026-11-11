import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { useAuth } from "./AuthProvider";
import { authLinkClass } from "./AuthLinks";

type State = { kind: "pending" } | { kind: "ok" } | { kind: "error"; msg: string };

/**
 * Trang đích của link trong thư xác minh (K-56). Công khai: link có thể mở ở
 * một trình duyệt chưa đăng nhập.
 *
 * Token chỉ dùng được MỘT lần, nên request phải đi đúng một lần. StrictMode
 * chạy effect hai lần ở dev; `started` là ref nên sống qua lần chạy lại đó.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const { status } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const started = useRef(false);
  const [state, setState] = useState<State>(() =>
    token ? { kind: "pending" } : { kind: "error", msg: t("verify.invalidLink") },
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.post("/auth/verify", { token }).then(
      () => {
        setState({ kind: "ok" });
        void qc.invalidateQueries({ queryKey: qk.me });
      },
      (e: unknown) => setState({ kind: "error", msg: errorMessage(e, locale, t, "verify.invalidLink") }),
    );
    // locale/t chỉ dùng lúc báo lỗi; chạy lại khi đổi ngôn ngữ là gửi token lần hai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, qc]);

  const authed = status === "authed";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-4">
      <BrandLogo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-semibold">{t("verify.title")}</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.kind === "pending" && <p role="status">{t("verify.pending")}</p>}
          {state.kind === "ok" && <p role="status">{t("verify.success")}</p>}
          {state.kind === "error" && (
            <p role="alert" className="text-loss">
              {state.msg}
            </p>
          )}
          {state.kind !== "pending" && (
            <p className="text-sm">
              <Link to={authed ? "/dashboard" : "/login"} className={authLinkClass}>
                {authed ? t("verify.toApp") : t("auth.login")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
