import { CheckIcon, ChevronUpIcon, ChevronsRightIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { NAV_ITEMS, type NavAction, type NavItem } from "../engine/nav";
import { useReplay, useReplayStore } from "../store/context";
import { cn } from "@/lib/utils";
import { NAV_LABEL } from "./labels";
import { PILL, PILL_BUTTON, PILL_CHEVRON } from "./pill";

/** Luôn có trong menu; các mốc lẻ chỉ hiện khi đã ghim (★ trong Custom Settings). */
export const FIXED: readonly NavAction[] = ["nextSession", "nextSilverBullet", "dayOpen"];
const isItem = (a: NavAction): a is NavItem => (NAV_ITEMS as readonly string[]).includes(a);

/**
 * Nút điều hướng nhanh trên thanh replay (kiểu FX Replay): phần chính mang tên mốc đang chọn và
 * bấm là tua tới lần kế tiếp của mốc đó; mũi tên mở menu để chọn mốc khác (chọn là tua luôn) hoặc
 * mở Custom Settings.
 */
export function NavMenu() {
  const store = useReplayStore();
  const { t } = useI18n();
  const action = useReplay((s) => s.navAction);
  const slots = useReplay((s) => s.nav.slots);
  const pinned = NAV_ITEMS.filter((k) => slots[k].star && !FIXED.includes(k));
  const name = t(NAV_LABEL[action]);
  const item = (a: NavAction) => (
    <DropdownMenuItem key={a} onSelect={() => store.jumpNext(a)}>
      <CheckIcon className={a === action ? "size-4" : "invisible size-4"} aria-hidden />
      {t(NAV_LABEL[a])}
      {isItem(a) && <span className="num ml-auto pl-4 text-xs text-text-muted">{slots[a].time}</span>}
    </DropdownMenuItem>
  );
  return (
    <div className={PILL} role="group" aria-label={t("replay.nav.label")}>
      <Button size="sm" variant="ghost" className={cn(PILL_BUTTON, "max-w-44 px-2")} title={t("replay.nav.runHint", { what: name })} onClick={() => store.jumpNext()}>
        <ChevronsRightIcon aria-hidden />
        <span className="truncate">{name}</span>
      </Button>
      {/* modal={false}: mở Dialog từ một mục menu modal thì Radix để lại pointer-events: none trên body */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" className={cn(PILL_BUTTON, "w-6 border-l border-border")} aria-label={t("replay.nav.menu")} title={t("replay.nav.menu")}>
            <ChevronUpIcon className={PILL_CHEVRON} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="min-w-64">
          {FIXED.map(item)}
          {pinned.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-text-muted">{t("replay.nav.pinned")}</DropdownMenuLabel>
              {pinned.map(item)}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => store.setNavOpen(true)}>
            <SlidersHorizontalIcon className="size-4" aria-hidden />
            {t("replay.nav.custom")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
