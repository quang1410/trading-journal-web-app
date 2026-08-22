import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/features/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { useSidebar } from "@/components/ui/sidebar";

export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { state } = useSidebar();
  const email = user?.email ?? "";
  const initials = email.slice(0, 1).toUpperCase() || "?";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="user-menu-trigger w-full justify-start px-2 text-left text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)]"
          aria-label={t("profile.open")}
          title={state === "collapsed" ? email : undefined}
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="sidebar-label min-w-0 flex-1 truncate">{email}</span>
          <ChevronsUpDownIcon aria-hidden className="sidebar-label size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-2">
        <div className="border-b border-border px-2 pb-2">
          <p className="text-sm font-medium">{t("profile.account")}</p>
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
        </div>

        <div className="flex flex-col gap-1 py-2">
          <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
            <span className="text-sm">{t("profile.theme")}</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
            <span className="text-sm">{t("profile.language")}</span>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="border-t border-border pt-2">
          <Button
            variant="ghost"
            className="w-full justify-start px-2 text-[var(--status-error)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error)]"
            onClick={() => void logout()}
          >
            <LogOutIcon aria-hidden />
            {t("nav.logout")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
