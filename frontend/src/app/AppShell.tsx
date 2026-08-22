import { NavLink, Outlet } from "react-router";
import { NotebookTextIcon, Trash2Icon, WalletIcon } from "lucide-react";
import type { ComponentType } from "react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { BrandLogo } from "@/components/BrandLogo";
import { UserMenu } from "@/components/UserMenu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/i18n";

export function AppShell() {
  const { t } = useI18n();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarBrand />
        </SidebarHeader>

        <SidebarContent>
          <div className="sidebar-account border-b border-border pb-3">
            <AccountSwitcher />
          </div>

          <nav aria-label={t("nav.navigation")}>
            <SidebarMenu>
              <Muc to="/trades" nhan={t("nav.journal")} icon={NotebookTextIcon} />
              <Muc to="/accounts" nhan={t("nav.accounts")} icon={WalletIcon} />
              <Muc to="/trades/trash" nhan={t("nav.trash")} icon={Trash2Icon} />
            </SidebarMenu>
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="horus-topnav flex h-12 items-center border-b border-border px-3">
          <SidebarTrigger />
        </header>
        <div className="horus-page-body">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarBrand() {
  const { isMobile, state } = useSidebar();

  return (
    <BrandLogo
      compact={!isMobile && state === "collapsed"}
      className="sidebar-brand px-1 py-1"
    />
  );
}

/**
 * Một mục điều hướng.
 *
 * Biểu tượng để `aria-hidden`: tên trang đã nằm ngay cạnh dưới dạng chữ, nên
 * để trình đọc màn hình đọc luôn cả biểu tượng chỉ tạo ra "sổ sổ Nhật ký lệnh".
 * Tên khả truy cập của link phải đúng bằng nhãn — shell.test.tsx tìm link
 * theo tên "Tài khoản".
 */
function Muc({
  to,
  nhan,
  icon: Icon,
}: {
  to: string;
  nhan: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={nhan}>
        <NavLink to={to} end onClick={() => isMobile && setOpenMobile(false)}>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="sidebar-label">{nhan}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
