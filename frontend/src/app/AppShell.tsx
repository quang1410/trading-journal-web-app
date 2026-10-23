import { NavLink, Outlet } from "react-router";
import {
  ChartCandlestickIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileUpIcon,
  LayoutDashboardIcon,
  NotebookTextIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
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
              <NavItem to="/dashboard" label={t("nav.dashboard")} icon={LayoutDashboardIcon} />
              <NavItem to="/trades" label={t("nav.journal")} icon={NotebookTextIcon} />
              <NavItem to="/accounts" label={t("nav.accounts")} icon={WalletIcon} />
              <NavItem to="/replay" label={t("nav.replay")} icon={ChartCandlestickIcon} />
              <NavItem to="/import" label={t("nav.import")} icon={FileUpIcon} />
              <NavItem to="/trades/trash" label={t("nav.trash")} icon={Trash2Icon} />
            </SidebarMenu>
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>

        <SidebarEdgeToggle />
      </Sidebar>

      <SidebarInset>
        <MobileTopnav />
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
 * Nút mũi tên tròn gắn trên mép phải sidebar, ngang hàng logo: mở rộng thì `‹`
 * để thu gọn, thu gọn thì `›` để mở ra.
 *
 * Desktop không còn thanh trên riêng cho nút thu gọn — đỡ tốn một hàng chiều cao,
 * và nút cũng không chồng lên logo nên luôn bấm được.
 */
function SidebarEdgeToggle() {
  const { isMobile, state } = useSidebar();
  if (isMobile) return null;

  const Icon = state === "collapsed" ? ChevronRightIcon : ChevronLeftIcon;
  return (
    <SidebarTrigger className="sidebar-edge-toggle">
      <Icon aria-hidden />
    </SidebarTrigger>
  );
}

/** Màn hình hẹp: sidebar là sheet ẩn, cần thanh trên để có chỗ đặt nút mở. */
function MobileTopnav() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;

  return (
    <header className="horus-topnav flex h-12 items-center border-b border-border px-3">
      <SidebarTrigger />
    </header>
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
function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <NavLink to={to} end onClick={() => isMobile && setOpenMobile(false)}>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="sidebar-label">{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
