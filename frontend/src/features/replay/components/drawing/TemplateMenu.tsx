import { useState } from "react";
import { ChevronDownIcon, Grid2x2PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Drawing } from "../../engine/drawings";
import { builtinsChanged, deleteTemplate, listTemplates, restoreBuiltins, saveTemplate, templatePatch, type DrawTemplate } from "../../engine/drawTemplates";

/**
 * Menu mẫu hình vẽ như TradingView, dùng ở hai chỗ: nút đầu tiên của thanh nổi (`toolbar`, áp mẫu là
 * đổi hình luôn) và nút "Mẫu" ở chân cửa sổ Cài đặt (`dialog`, áp mẫu chỉ là xem trước). Gồm "Lưu mẫu
 * hình vẽ thành…", "Áp mẫu mặc định", danh sách mẫu của công cụ (bấm để áp; × hoặc phím Delete để xoá)
 * và "Khôi phục mẫu dựng sẵn" khi một mẫu dựng sẵn đã bị xoá hay ghi đè.
 */
export function TemplateMenu({ d, apply, variant, className }: { d: Drawing; apply: (patch: Partial<Drawing>) => void; variant: "toolbar" | "dialog"; className?: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<DrawTemplate[]>(() => listTemplates(d.type));
  const [changed, setChanged] = useState(() => builtinsChanged(d.type));
  const [naming, setNaming] = useState(false);
  const refresh = (next: DrawTemplate[]) => {
    setList(next);
    setChanged(builtinsChanged(d.type));
  };
  return (
    <>
      {/* đọc lại mỗi lần mở: mẫu lưu ở thanh nổi phải hiện ngay trong cửa sổ Cài đặt và ngược lại */}
      <DropdownMenu onOpenChange={(o) => o && refresh(listTemplates(d.type))}>
        <DropdownMenuTrigger asChild>
          {variant === "toolbar" ? (
            <button type="button" className={cn("cursor-pointer", className)} aria-label={t("replay.dw.templates")} title={t("replay.dw.templates")}>
              <Grid2x2PlusIcon className="size-[18px]" aria-hidden />
            </button>
          ) : (
            <Button variant="outline" className={className}>
              {t("replay.dw.template")}
              <ChevronDownIcon aria-hidden />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={() => setNaming(true)}>{t("replay.dw.saveTemplate")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => apply(templatePatch(d, null))}>{t("replay.dw.applyDefault")}</DropdownMenuItem>
          {list.length > 0 && <DropdownMenuSeparator />}
          {list.map((tpl) => (
            <DropdownMenuItem
              key={tpl.name} onSelect={() => apply(templatePatch(d, tpl))} className="group justify-between" aria-keyshortcuts="Delete"
              // bàn phím: nút × không nhận focus trong menu, nên Delete / Backspace trên mục là xoá
              onKeyDown={(e) => {
                if (e.key !== "Delete" && e.key !== "Backspace") return;
                e.preventDefault();
                refresh(deleteTemplate(d.type, tpl.name));
              }}
            >
              <span className="truncate">{tpl.name}</span>
              <Button
                variant="ghost" size="icon-xs" tabIndex={-1} className="text-text-muted opacity-60 group-hover:opacity-100"
                aria-label={t("replay.dw.deleteTemplate", { name: tpl.name })} title={t("replay.dw.deleteTemplate", { name: tpl.name })}
                // chặn cả pointerup: Radix bấm hộ mục menu khi nhả chuột trên nó, xoá xong lại áp luôn mẫu
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  refresh(deleteTemplate(d.type, tpl.name));
                }}
              >
                <XIcon aria-hidden />
              </Button>
            </DropdownMenuItem>
          ))}
          {changed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => refresh(restoreBuiltins(d.type))}>{t("replay.dw.restoreTemplates")}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {naming && (
        <SaveTemplateDialog
          d={d} list={list}
          onDone={(next) => {
            if (next) refresh(next);
            setNaming(false);
          }}
        />
      )}
    </>
  );
}

/**
 * "Lưu mẫu hình vẽ thành": đặt tên rồi Lưu. Trùng tên một mẫu đã có (không phân biệt hoa thường) thì
 * hỏi lại có thay thế không, như TradingView.
 */
function SaveTemplateDialog({ d, list, onDone }: { d: Drawing; list: DrawTemplate[]; onDone: (next: DrawTemplate[] | null) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const trimmed = name.trim();
  const save = (replace: boolean) => {
    if (!trimmed) return;
    if (!replace && list.some((x) => x.name.toLowerCase() === trimmed.toLowerCase())) return setConfirm(true);
    onDone(saveTemplate(d, trimmed));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onDone(null)}>
      <DialogContent className="w-[min(340px,calc(100%-2rem))] gap-3" data-testid="replay-template-dialog">
        <DialogTitle>{t("replay.dw.saveTemplateTitle")}</DialogTitle>
        {confirm ? (
          <>
            <DialogDescription className="text-foreground">{t("replay.dw.templateReplace", { name: trimmed })}</DialogDescription>
            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(false)}>{t("replay.dw.no")}</Button>
              <Button onClick={() => save(true)} autoFocus>{t("replay.dw.yes")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogDescription className="sr-only">{t("replay.dw.templateName")}</DialogDescription>
            <Input
              autoFocus aria-label={t("replay.dw.templateName")} placeholder={t("replay.dw.templateName")} value={name}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(false)}
            />
            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => onDone(null)}>{t("replay.dw.cancel")}</Button>
              <Button onClick={() => save(false)} disabled={!trimmed}>{t("replay.dw.save")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
