import { useState, type ReactNode } from "react";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/strings";
import { DEFAULT_NAV, NAV_TIMES, SESSION_ITEMS, SILVER_BULLET_ITEMS, validateNav, type NavItem, type NavSettings } from "../engine/nav";
import { useReplay, useReplayStore } from "../store/context";
import { NAV_LABEL } from "./labels";

// thứ Hai → Chủ nhật như ảnh tham chiếu; số là getUTCDay() (0 = Chủ nhật)
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="border-b border-border pb-2 text-sm font-medium text-foreground">{title}</h3>
      {hint && <p className="mt-2 text-xs text-text-muted">{hint}</p>}
      <div className="mt-1">{children}</div>
    </section>
  );
}

/**
 * Cửa sổ Custom Settings của điều hướng nhanh. Sửa trên bản nháp: Save mới kiểm tra rồi lưu, Cancel /
 * X / Esc bỏ hết. Reset to defaults chỉ đổ giá trị mặc định vào bản nháp — chưa Save thì Cancel
 * vẫn lấy lại được cài đặt cũ, nên không cần hỏi xác nhận.
 */
export function NavDialog() {
  const store = useReplayStore();
  const { t } = useI18n();
  const open = useReplay((s) => s.navOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => store.setNavOpen(o)}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] w-[min(520px,calc(100%-2rem))] flex-col gap-0 p-0 sm:max-w-none">
        <div className="px-6 pt-6 pb-4 pr-12">
          <DialogTitle>{t("replay.nav.title")}</DialogTitle>
          <DialogDescription className="mt-1.5 text-xs">{t("replay.nav.description")}</DialogDescription>
        </div>
        {/* Radix gỡ nội dung khi đóng: mỗi lần mở là một bản nháp mới lấy từ cài đặt đã lưu */}
        {open && <NavForm />}
      </DialogContent>
    </Dialog>
  );
}

function NavForm() {
  const store = useReplayStore();
  const { t } = useI18n();
  const saved = useReplay((s) => s.nav);
  const [draft, setDraft] = useState<NavSettings>(saved);
  const [error, setError] = useState<TranslationKey | null>(null);
  const weekdays = t("replay.weekdays").split(",");

  const edit = (next: NavSettings) => {
    setDraft(next);
    setError(null);
  };
  const setSlot = (k: NavItem, patch: Partial<NavSettings["slots"][NavItem]>) => edit({ ...draft, slots: { ...draft.slots, [k]: { ...draft.slots[k], ...patch } } });
  const save = () => {
    const bad = validateNav(draft);
    if (bad) return setError(bad);
    store.setNav(draft);
    store.setNavOpen(false);
  };

  const row = (k: NavItem, pinnable = true) => {
    const name = t(NAV_LABEL[k]);
    const { time, star } = draft.slots[k];
    return (
      <div key={k} className="flex items-center gap-2 py-1.5" data-testid={`nav-row-${k}`}>
        {pinnable ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-pressed={star}
            aria-label={t(star ? "replay.nav.unpin" : "replay.nav.pin", { what: name })}
            title={t(star ? "replay.nav.unpin" : "replay.nav.pin", { what: name })}
            onClick={() => setSlot(k, { star: !star })}
          >
            <StarIcon className={cn(star ? "fill-current text-warn" : "text-text-muted")} aria-hidden />
          </Button>
        ) : (
          <span className="size-8 shrink-0" aria-hidden />
        )}
        <span className="flex-1 text-sm text-foreground">{name}</span>
        <Select value={time} onValueChange={(v) => setSlot(k, { time: v })}>
          <SelectTrigger className="num h-9 w-28" aria-label={t("replay.nav.timeOf", { what: name })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {NAV_TIMES.map((x) => (
              <SelectItem key={x} value={x} className="num">
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-6 py-5">
        <Section title={t("replay.nav.sessions")}>{SESSION_ITEMS.map((k) => row(k))}</Section>
        <Section title={t("replay.nav.dayOpenSection")} hint={t("replay.nav.dayOpenHint")}>
          {row("dayOpen", false)}
        </Section>
        <Section title={t("replay.nav.silverBullets")}>{SILVER_BULLET_ITEMS.map((k) => row(k))}</Section>
        <Section title={t("replay.nav.skipDays")} hint={t("replay.nav.skipHint")}>
          <ToggleGroup
            type="multiple"
            className="mt-2"
            value={draft.skipDays.map(String)}
            onValueChange={(v) => edit({ ...draft, skipDays: v.map((x) => +x).sort((a, b) => a - b) })}
          >
            {WEEK.map((d) => (
              <ToggleGroupItem key={d} value={String(d)} aria-label={t("replay.nav.skipDay", { day: weekdays[d] })} className="h-9 text-sm">
                {weekdays[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>
      </div>
      <DialogFooter className="items-center gap-2 border-t border-border px-6 py-4 sm:justify-between">
        <Button variant="ghost" onClick={() => edit(structuredClone(DEFAULT_NAV))}>
          {t("replay.nav.reset")}
        </Button>
        <div className="flex flex-col items-end gap-2">
          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {t(error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => store.setNavOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
}
