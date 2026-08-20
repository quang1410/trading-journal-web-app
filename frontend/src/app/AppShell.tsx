import { NavLink, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh">
      {/*
        .horus-sidenav của theme CHỈ cấp token cục bộ (--sidebar-bg,
        --sidebar-text, --sidebar-active-bg…) và một border-right. Nó không
        phải shell dựng sẵn: chiều rộng, flex và cuộn vẫn phải tự đặt ở đây.
      */}
      <aside
        className="horus-sidenav flex w-60 shrink-0 flex-col gap-1 p-3"
        style={{ backgroundColor: "var(--sidebar-bg)" }}
      >
        <div className="px-2 py-3 font-semibold">Nhật ký giao dịch</div>

        <nav className="flex flex-col gap-1">
          <NavLink
            to="/accounts"
            className={({ isActive }) =>
              cn("rounded-md px-2 py-1.5 text-sm", isActive && "font-medium")
            }
            style={({ isActive }) =>
              isActive
                ? {
                    backgroundColor: "var(--sidebar-active-bg)",
                    color: "var(--sidebar-text-active)",
                  }
                : { color: "var(--sidebar-text)" }
            }
          >
            Tài khoản
          </NavLink>
        </nav>

        <div className="mt-3">
          <AccountSwitcher />
        </div>

        <div className="mt-auto flex flex-col items-start gap-2 px-2 pb-2">
          <ThemeToggle />
          <span className="max-w-full truncate text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </div>
      </aside>

      <main className="horus-main min-w-0 flex-1">
        <div className="horus-page-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
