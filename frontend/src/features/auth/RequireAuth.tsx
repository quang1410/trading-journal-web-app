import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthProvider";

function Splash() {
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center text-muted-foreground"
    >
      Đang khôi phục phiên…
    </div>
  );
}

/**
 * `loading` PHẢI render splash, không được redirect.
 *
 * Lúc đó ta chưa biết người dùng đã đăng nhập hay chưa — refresh còn đang
 * bay. Đẩy sang /login ở nhánh này làm mọi lần F5 trông như bị đăng xuất.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "anon") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Ngược lại: đã đăng nhập thì không cho vào /login, /register nữa. */
export function OnlyAnon({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authed") return <Navigate to="/accounts" replace />;
  return <>{children}</>;
}
