import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useEditorLabels } from "@/components/ui/editorLabels";
import { TemplateMenu } from "@/features/noteTemplates/TemplateMenu";
import { useI18n } from "@/i18n";
import { noteToHtml, sanitizeNoteHtml } from "@/lib/richText";
import type { PeriodKind } from "./periodTypes";

/**
 * Hộp soạn ghi chú cho một kỳ — một ngày hoặc một tuần.
 *
 * Dùng lại RichTextEditor và TemplateMenu của ô Notes trong form lệnh: cùng
 * trình soạn, cùng bộ mẫu, nên người dùng không phải học lần thứ hai. Mẫu ghi
 * chú lưu đúng định dạng HTML của Quill nên chèn vào đây chỉ là nối chuỗi,
 * không cần tầng dịch nào ở giữa.
 *
 * Hộp KHÔNG tự gọi mutation: lưu là lạc quan nên hộp đóng ngay khi bấm (spec
 * QĐ-10), và lỗi — nếu có — đến SAU khi hộp đã đóng. Chỉ thẻ còn sống để hiện
 * nó, nên mutation nằm ở PeriodCard và hộp chỉ trao nội dung qua `onSave`.
 */
export function PeriodNoteDialog({
  period,
  periodKey,
  title,
  initialHtml,
  open,
  onOpenChange,
  onSave,
}: {
  period: PeriodKind;
  periodKey: string;
  /** Nhãn kỳ đọc được, ví dụ "21/09/2026" hoặc "21/09 – 27/09". */
  title: string;
  initialHtml: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nhận HTML đã qua sanitizeNoteHtml; rỗng nghĩa là xoá. */
  onSave: (bodyHtml: string) => void;
}) {
  const { t } = useI18n();
  const editorLabels = useEditorLabels();

  // Nội dung đang soạn. Khởi tạo từ initialHtml và KHÔNG đồng bộ lại khi prop
  // đổi: hộp chỉ được dựng khi mở (xem `open &&` ở chỗ render), nên mỗi lần mở
  // là một lần khởi tạo mới — còn trong lúc đang mở thì một query nền trả về
  // không được phép ghi đè thứ người dùng đang gõ dở.
  const [html, setHtml] = useState(initialHtml);

  // Tăng để React DỰNG LẠI editor sau khi chèn mẫu. RichTextEditor là component
  // KHÔNG kiểm soát — nó đọc defaultValue đúng một lần lúc dựng và không có API
  // nào chèn từ ngoài vào, nên đây là cơ chế chèn duy nhất, giống hệt
  // TradeFormDialog.
  const [editorKey, setEditorKey] = useState(0);

  function insertTemplate(bodyHtml: string) {
    // Nối vào CUỐI, không thay thế: chữ người dùng đã gõ không bao giờ mất.
    setHtml((prev) => (prev === "" ? bodyHtml : prev + bodyHtml));
    setEditorKey((k) => k + 1);
  }

  function submit() {
    // sanitizeNoteHtml ở ranh giới LƯU, giống ô Notes của lệnh: nội dung ra
    // khỏi DB được render lại, nên mọi đường vào phải gặp nhau ở cùng một luật
    // lọc thay vì tin rằng chuỗi này do editor viết ra.
    onSave(sanitizeNoteHtml(html));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        `sm:max-w-2xl` có tiền tố sm: — `max-w-2xl` trần sẽ THUA `sm:max-w-lg`
        mặc định của DialogContent ở mọi bề ngang từ 640px trở lên.
      */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("periods.noteTitle", { period: title })}</DialogTitle>
          <DialogDescription>{t("periods.notePlaceholder")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <TemplateMenu onInsert={insertTemplate} />
          </div>
          <RichTextEditor
            key={editorKey}
            id={`period-note-${period}-${periodKey}`}
            defaultValue={noteToHtml(html)}
            onChange={setHtml}
            placeholder={t("periods.notePlaceholder")}
            ariaLabel={t("periods.noteTitle", { period: title })}
            labels={editorLabels}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={submit}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
