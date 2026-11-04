import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, bootstrapSession, type Session } from "@/lib/api";
import {
  clearSession,
  getUser,
  setOnRefreshThrottled,
  setOnSessionDead,
  setSession,
  type User,
} from "@/lib/session";
import { useI18n } from "@/i18n";

export type AuthStatus = "loading" | "authed" | "anon";

type AuthValue = {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth phải nằm trong AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const qc = useQueryClient();
  const { t } = useI18n();

  // Khôi phục phiên lúc mở app. Access token chỉ ở memory nên mỗi lần F5 là
  // mất; cookie refresh (HttpOnly) là thứ duy nhất còn lại để dựng phiên dậy.
  useEffect(() => {
    let remaining = true;
    void bootstrapSession().then((ok) => {
      if (!remaining) return;
      setUser(ok ? getUser() : null);
      setStatus(ok ? "authed" : "anon");
    });
    return () => {
      remaining = false;
    };
  }, []);

  useEffect(() => {
    setOnSessionDead(() => {
      qc.clear();
      setUser(null);
      setStatus("anon");
    });
    return () => setOnSessionDead(null);
  }, [qc]);

  useEffect(() => {
    setOnRefreshThrottled(setReconnecting);
    return () => setOnRefreshThrottled(null);
  }, []);

  const receiveSession = useCallback((s: Session) => {
    setSession(s.access_token, s.user);
    setUser(s.user);
    setStatus("authed");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      receiveSession(await api.post<Session>("/auth/login", { email, password }));
    },
    [receiveSession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      receiveSession(await api.post<Session>("/auth/register", { email, password }));
    },
    [receiveSession],
  );

  // Kể cả khi máy chủ không trả lời, phía client vẫn phải sạch.
  //
  // catch rỗng là CÓ CHỦ Ý, không phải nuốt lỗi cẩu thả: nơi gọi (AppShell)
  // gọi `void logout()` và không có chỗ nào hiển thị lỗi đăng xuất, nên để
  // promise này reject chỉ tạo ra unhandled rejection — trong trình duyệt là
  // "Uncaught (in promise)", và với Sentry là một báo động giả mỗi lần user
  // đăng xuất lúc mất mạng. Kết cục đã được quyết ở finally rồi.
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // đã giải thích ở trên
    } finally {
      clearSession();
      qc.clear();
      setUser(null);
      setStatus("anon");
    }
  }, [qc]);

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return (
    <Ctx.Provider value={value}>
      {/* /auth/refresh bị chặn tạm (429): api.ts đang chờ để thử lại, phiên
          vẫn sống. Vùng live LUÔN có trong DOM, chỉ đổi chữ — vùng chèn vào
          cùng lúc với chữ thường bị trình đọc màn hình bỏ qua. */}
      <p
        role="status"
        data-testid="reconnecting-status"
        className={
          reconnecting
            ? "fixed inset-x-0 top-2 z-50 mx-auto w-fit rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
            : "sr-only"
        }
      >
        {reconnecting ? t("auth.reconnecting") : ""}
      </p>
      {children}
    </Ctx.Provider>
  );
}
