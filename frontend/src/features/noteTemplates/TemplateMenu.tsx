import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useNoteTemplates } from "./hooks";
import { TemplateManagerDialog } from "./TemplateManagerDialog";

/**
 * Nút "Chèn mẫu" cạnh nhãn Ghi chú của form nhập lệnh.
 *
 * `onInsert` nhận HTML của mẫu; nơi gọi quyết định nối vào đâu. Component này
 * cố ý KHÔNG biết gì về form lệnh — nó chỉ biết mẫu.
 */
export function TemplateMenu({ onInsert }: { onInsert: (bodyHtml: string) => void }) {
  const { t } = useI18n();
  const { data: templates, isError: loadFailed } = useNoteTemplates();
  const [managerOpen, setManagerOpen] = useState(false);
  const list = templates ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/*
            type="button" là BẮT BUỘC: nút này nằm trong <form> của
            TradeFormDialog, thiếu nó thì bấm "Chèn mẫu" sẽ submit cả form.
          */}
          <Button type="button" variant="ghost" size="sm">
            {t("noteTemplate.insert")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {loadFailed ? (
            // Tải hỏng KHÁC với chưa có mẫu nào — cùng lý lẽ với
            // filters.optionsFailed ở FilterBar. Gộp hai chuyện vào một dòng
            // "chưa có mẫu nào" là nói SAI với người đang có mẫu, và sai theo
            // hướng khiến họ tưởng mẫu đã mất mà ngồi tạo lại. Vẫn để lối
            // vào dialog quản lý để người dùng không bị kẹt trong menu này.
            <>
              <DropdownMenuItem disabled>{t("noteTemplate.loadFailed")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
                {t("noteTemplate.manage")}
              </DropdownMenuItem>
            </>
          ) : list.length === 0 ? (
            // Menu rỗng là một cái bẫy: người dùng bấm vào rồi không hiểu đang
            // thấy gì. Dòng này vừa giải thích vừa dẫn tới chỗ tạo mẫu.
            <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
              {t("noteTemplate.emptyHint")}
            </DropdownMenuItem>
          ) : (
            <>
              {list.map((tpl) => (
                <DropdownMenuItem key={tpl.id} onSelect={() => onInsert(tpl.body_html)}>
                  {tpl.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
                {t("noteTemplate.manage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
