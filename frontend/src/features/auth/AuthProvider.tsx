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
import { clearSession, getUser, setOnSessionDead, setSession, type User } from "@/lib/session";

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
  const qc = useQueryClient();

  // Khôi phục phiên lúc mở app. Access token chỉ ở memory nên mỗi lần F5 là
  // mất; cookie refresh (HttpOnly) là thứ duy nhất còn lại để dựng phiên dậy.
  useEffect(() => {
    let con = true;
    void bootstrapSession().then((ok) => {
      if (!con) return;
      setUser(ok ? getUser() : null);
      setStatus(ok ? "authed" : "anon");
    });
    return () => {
      con = false;
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

  const nhanPhien = useCallback((s: Session) => {
    setSession(s.access_token, s.user);
    setUser(s.user);
    setStatus("authed");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      nhanPhien(await api.post<Session>("/auth/login", { email, password }));
    },
    [nhanPhien],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      nhanPhien(await api.post<Session>("/auth/register", { email, password }));
    },
    [nhanPhien],
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
