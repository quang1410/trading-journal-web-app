import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useEditorLabels } from "@/components/ui/editorLabels";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { isEmptyNote, noteToHtml, noteToOneLine, sanitizeNoteHtml } from "@/lib/richText";
import {
  useCreateNoteTemplate,
  useDeleteNoteTemplate,
  useNoteTemplates,
  useReorderNoteTemplates,
  useUpdateNoteTemplate,
} from "./hooks";
import type { NoteTemplate } from "./types";

/**
 * Quản lý mẫu ghi chú: xem, thêm, sửa, xoá, đổi thứ tự.
 *
 * Đây là dialog LỒNG trong TradeFormDialog. Radix lo phần xếp lớp: Esc đóng
 * đúng lớp trong cùng, nên form lệnh phía sau không bị đóng theo — mất lệnh
 * đang gõ là hỏng dữ liệu, không phải lỗi hiển thị. Có test riêng ghim điều đó.
 */
export function TemplateManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const { data: templates } = useNoteTemplates();
  const list = templates ?? [];

  // `editing` có ba trạng thái: undefined = không mở form, null = form thêm
  // mới, một mẫu = form sửa mẫu đó.
  const [editing, setEditing] = useState<NoteTemplate | null | undefined>(undefined);
  const [askDelete, setAskDelete] = useState<NoteTemplate | null>(null);

  const del = useDeleteNoteTemplate();
  const reorder = useReorderNoteTemplates();

  // Đổi thứ tự gửi ĐỦ tập id: service từ chối mảng lệch tập bằng 400.
  function move(index: number, delta: number) {
    const ids = list.map((x) => x.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    reorder.mutate(ids);
  }

  const errText = del.error
    ? errorMessage(del.error, locale, t)
    : reorder.error
      ? errorMessage(reorder.error, locale, t)
      : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          // Đóng thì DỌN form đang soạn. Radix giữ component sống khi đóng, nên
          // không dọn thì mở lại sẽ thấy đúng cái form nửa vời của lần trước —
          // và nếu lần trước đang SỬA mẫu nào thì mở lại vẫn đang sửa mẫu đó,
          // dễ ghi đè ngoài ý muốn.
          if (!v) setEditing(undefined);
          onOpenChange(v);
        }}
      >
        {/*
          `sm:max-w-2xl` chứ không phải `max-w-2xl`, và lý do nằm ở
          tailwind-merge trong `cn`, không phải ở thứ tự CSS:

          - `max-w-2xl` trần: tailwind-merge thấy hai lớp KHÁC breakpoint nên
            giữ cả `sm:max-w-lg` của lớp nền. Từ 640px trở lên nền thắng và
            dialog co về 32rem — đúng cái đã thấy trên màn hình.
          - `sm:max-w-2xl`: CÙNG breakpoint, nên tailwind-merge XOÁ hẳn
            `sm:max-w-lg` và 42rem được áp dụng.

          Vì thế không sửa được bằng `!important` hay giá trị tuỳ ý: phải khớp
          đúng breakpoint của lớp nền mới đẩy được nó ra.
        */}
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("noteTemplate.managerTitle")}</DialogTitle>
            <DialogDescription>{t("noteTemplate.managerDescription")}</DialogDescription>
          </DialogHeader>

          {/*
            `min-w-0` là bắt buộc: DialogContent là `display:grid`, và grid
            item mặc định có `min-width:auto` — nó KHÔNG co xuống dưới kích
            thước nội dung. Dòng preview dài vì thế đẩy cả cột grid rộng hơn
            dialog (đo được 702px trong khung 586px), chữ tràn ra ngoài viền,
            và `truncate` bên dưới không bao giờ kích hoạt vì không có mốc
            rộng nào để cắt theo.
          */}
          <div className="flex min-w-0 flex-col gap-4">
            {errText && (
              <Alert variant="destructive">
                <AlertDescription>{errText}</AlertDescription>
              </Alert>
            )}

            {/*
              Khung viền chỉ vẽ khi CÓ mẫu. Một cái khung rỗng bọc quanh dòng
              chữ mờ trông như thứ đã hỏng, chứ không như trạng thái bình
              thường của tài khoản chưa tạo mẫu nào.
            */}
            {list.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                {t("noteTemplate.emptyHint")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {list.map((tpl, i) => (
                  <li key={tpl.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{tpl.name}</span>
                      {/*
                        Preview là TEXT THUẦN (spec §7): danh sách chỉ có tên
                        thì không chọn được mẫu khi đã quên trong đó có gì.
                        Không dùng dangerouslySetInnerHTML ở đây — một dòng
                        danh sách không nên nhận thẻ khối, và text thuần không
                        mở mặt tấn công nào cho HTML lạ đã nằm sẵn trong DB.

                        Dùng `noteToOneLine` của lib thay vì tự thay `\n+`:
                        bản tự cuộn để lại khoảng trắng quanh dấu phân cách
                        khi block có thụt lề ("a ·  b"), và nó là đúng một
                        dòng tóm tắt mà bảng lệnh cũng đang dùng.
                      */}
                      <span className="truncate text-xs text-muted-foreground">
                        {noteToOneLine(tpl.body_html)}
                      </span>
                    </div>
                    {/*
                      Icon thật thay cho hai chữ "▲"/"▼": ký tự hình học không
                      chung baseline với chữ nên nằm lệch trong nút, và bề
                      rộng của nó đổi theo font hệ thống. Hai nút đặt sát nhau
                      (không gap) để đọc như MỘT cặp điều khiển thứ tự, tách
                      khỏi cặp Sửa/Xoá bằng gap-3 của <li>.
                    */}
                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={t("noteTemplate.moveUp")}
                        disabled={i === 0 || reorder.isPending}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={t("noteTemplate.moveDown")}
                        disabled={i === list.length - 1 || reorder.isPending}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDownIcon />
                      </Button>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(tpl)}
                      >
                        {t("noteTemplate.edit")}
                      </Button>
                      {/*
                        Xoá là hành động phá huỷ duy nhất trong dialog này:
                        cho nó màu chữ lỗi để không bị nhầm với "Sửa" ngay
                        cạnh. Vẫn là ghost — theme tắt shadow, phân tầng bằng
                        màu chữ chứ không bằng nền.
                      */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setAskDelete(tpl)}
                      >
                        {t("noteTemplate.delete")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {editing === undefined ? (
              <div>
                <Button type="button" onClick={() => setEditing(null)}>
                  {t("noteTemplate.new")}
                </Button>
              </div>
            ) : (
              <TemplateForm
                // key đổi theo mẫu đang sửa để RichTextEditor DỰNG LẠI: nó là
                // component không kiểm soát, đọc defaultValue đúng một lần lúc
                // dựng. Không có key thì bấm "Sửa" mẫu thứ hai vẫn thấy nội
                // dung mẫu thứ nhất.
                key={editing?.id ?? "new"}
                template={editing}
                onDone={() => setEditing(undefined)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askDelete !== null} onOpenChange={(v) => !v && setAskDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("noteTemplate.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("noteTemplate.deleteConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("noteTemplate.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (askDelete) del.mutate(askDelete.id);
                setAskDelete(null);
              }}
            >
              {t("noteTemplate.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Form soạn một mẫu. `template === null` là thêm mới.
 *
 * Không dùng react-hook-form: form này có đúng hai trường và một luật mỗi
 * trường, nên thêm cả bộ máy resolver + zod vào đây là nhiều hơn phần nó tiết
 * kiệm được.
 */
function TemplateForm({
  template,
  onDone,
}: {
  template: NoteTemplate | null;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const editorLabels = useEditorLabels();
  const create = useCreateNoteTemplate();
  const update = useUpdateNoteTemplate();

  const [name, setName] = useState(template?.name ?? "");
  // Giữ HTML của editor ở state; RichTextEditor đã sanitize trong onChange.
  const [body, setBody] = useState(template?.body_html ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const serverError = create.error ?? update.error;
  const errText = localError ?? (serverError ? errorMessage(serverError, locale, t) : null);

  function submit() {
    setLocalError(null);
    if (name.trim() === "") {
      setLocalError(t("noteTemplate.nameRequired"));
      return;
    }
    if (isEmptyNote(body)) {
      setLocalError(t("noteTemplate.bodyRequired"));
      return;
    }
    // Sanitize lần nữa trước khi gửi: cùng kỷ luật với cột trades.notes —
    // backend không sanitize, nên FE làm cả lúc lưu và lúc render.
    const payload = { name: name.trim(), body_html: sanitizeNoteHtml(body) };

    if (template === null) {
      create.mutate(payload, { onSuccess: onDone });
      return;
    }
    update.mutate({ id: template.id, patch: payload }, { onSuccess: onDone });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      {errText && (
        <Alert variant="destructive">
          <AlertDescription>{errText}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-name">{t("noteTemplate.name")}</Label>
        <Input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("noteTemplate.namePlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-body">{t("noteTemplate.body")}</Label>
        <RichTextEditor
          id="tpl-body"
          defaultValue={noteToHtml(template?.body_html ?? "")}
          onChange={setBody}
          placeholder={t("noteTemplate.bodyPlaceholder")}
          ariaLabel={t("noteTemplate.body")}
          labels={editorLabels}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {t("noteTemplate.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("noteTemplate.cancel")}
        </Button>
      </div>
    </div>
  );
}
