import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type Translate } from "@/i18n";

// Ngưỡng lấy từ backend (service/auth.go:25 minPasswordLen = 8). Validate ở
// đây là để phản hồi nhanh, KHÔNG phải để thay backend.
export function credentialsSchema(t: Translate) {
  return z.object({
    email: z.string().min(1, t("auth.emailRequired")).email(t("auth.emailInvalid")),
    password: z.string().min(8, t("auth.passwordMin")),
  });
}

export type Credentials = { email: string; password: string };

type Props = {
  buttonLabel: string;
  submitting: boolean;
  errorMsg: string | null;
  /** Khác null: đang bị chặn tạm (429), nút khoá và ghi số phút phải chờ. */
  lockedMinutes: number | null;
  onSubmit: (v: Credentials) => void;
};

export function CredentialsForm({ buttonLabel, submitting, errorMsg, lockedMinutes, onSubmit }: Props) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema(t)),
    defaultValues: { email: "", password: "" },
  });

  // Nút gửi bị khoá (429) thì focus đang ở nút sẽ rơi về <body> (WCAG 2.4.3).
  // Đưa về ô mật khẩu: chỗ người dùng sẽ gõ lại khi hết thời gian chờ.
  const locked = lockedMinutes !== null;
  useEffect(() => {
    if (locked) setFocus("password");
  }, [locked, setFocus]);

  return (
    // noValidate: để zod là nơi duy nhất quyết định thông báo lỗi, thay vì
    // trình duyệt chen ngang bằng tooltip tiếng Anh của riêng nó.
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && (
          <p role="alert" className="text-sm text-loss">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-loss">
            {errors.password.message}
          </p>
        )}
      </div>

      {errorMsg && (
        <p role="alert" className="text-sm text-loss">
          {errorMsg}
        </p>
      )}

      <Button type="submit" disabled={submitting || locked}>
        {submitting
          ? t("common.loading")
          : locked
            ? t("auth.retryButton", { n: lockedMinutes })
            : buttonLabel}
      </Button>
    </form>
  );
}
