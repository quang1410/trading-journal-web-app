import * as React from "react";
import { PanelLeftIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "journal.sidebar";
const SIDEBAR_WIDTH = "15rem";
const SIDEBAR_WIDTH_ICON = "4rem";

type SidebarState = "expanded" | "collapsed";

type SidebarContextValue = {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [openState, setOpenState] = React.useState(() =>
    openProp ?? (typeof window === "undefined" ? defaultOpen : readStoredOpen()),
  );
  const open = openProp ?? openState;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (setOpenProp) setOpenProp(next);
      else setOpenState(next);
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "expanded" : "collapsed");
      } catch {
        // Sidebar state remains available for the current session.
      }
    },
    [open, setOpenProp],
  );
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else setOpen((value) => !value);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const contextValue = React.useMemo<SidebarContextValue>(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn("group/sidebar-wrapper flex min-h-dvh w-full has-[[data-variant=inset]]:bg-background", className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar phải nằm trong SidebarProvider");
  return context;
}

function Sidebar({
  side = "left",
  collapsible = "icon",
  className,
  children,
  ...props
}: React.ComponentProps<"aside"> & {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const { t } = useI18n();

  if (collapsible === "none") {
    return (
      <aside className={cn("flex h-full w-[var(--sidebar-width)] flex-col", className)} {...props}>
        {children}
      </aside>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side={side}
          className={cn("w-[var(--sidebar-width)] p-0", className)}
          aria-label={t("sidebar.label")}
        >
          <SheetTitle className="sr-only">{t("sidebar.label")}</SheetTitle>
          <aside
            aria-label={t("sidebar.label")}
            className="horus-sidenav flex size-full flex-col bg-[var(--sidebar-bg)]"
            {...props}
          >
            {children}
          </aside>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      className="group peer hidden text-[var(--sidebar-text)] md:block"
    >
      <div
        className={cn(
          "relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
        )}
      />
      <div
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] flex-col border-border transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          "group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=offcanvas]:overflow-hidden",
          "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
          className,
        )}
      >
        <aside
          aria-label={t("sidebar.label")}
          className="horus-sidenav flex size-full flex-col bg-[var(--sidebar-bg)]"
          {...props}
        >
          {children}
        </aside>
      </div>
    </div>
  );
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const { t } = useI18n();
  const isExpanded = isMobile ? openMobile : state === "expanded";
  const label = isExpanded ? t("sidebar.collapse") : t("sidebar.expand");

  return (
    <Button
      data-slot="sidebar-trigger"
      data-state={isExpanded ? "expanded" : "collapsed"}
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={isExpanded}
      title={label}
      className={cn("text-muted-foreground", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon aria-hidden />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-2 p-3", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-2 border-t border-border p-3", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";
  const Comp = asChild ? Slot.Root : "button";
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive || undefined}
      className={cn("sidebar-menu-button", className)}
      {...props}
    />
  );

  if (!tooltip || !isCollapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return <main data-slot="sidebar-inset" className={cn("horus-main min-w-0 flex-1", className)} {...props} />;
}

export {
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
};
