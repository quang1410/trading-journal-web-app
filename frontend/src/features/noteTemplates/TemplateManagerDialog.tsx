import { useState } from "react";
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
import { isEmptyNote, noteToHtml, noteToText, sanitizeNoteHtml } from "@/lib/richText";
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("noteTemplate.managerTitle")}</DialogTitle>
            <DialogDescription>{t("noteTemplate.managerDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {errText && (
              <Alert variant="destructive">
                <AlertDescription>{errText}</AlertDescription>
              </Alert>
            )}

            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {list.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">
                  {t("noteTemplate.emptyHint")}
                </li>
              )}
              {list.map((tpl, i) => (
                <li key={tpl.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{tpl.name}</span>
                    {/*
                      Preview là TEXT THUẦN (spec §7): danh sách chỉ có tên thì
                      không chọn được mẫu khi đã quên trong đó có gì. Không dùng
                      dangerouslySetInnerHTML ở đây — một dòng danh sách không
                      nên nhận thẻ khối, và text thuần không mở mặt tấn công nào
                      cho HTML lạ đã nằm sẵn trong DB.
                    */}
                    <span className="truncate text-xs text-muted-foreground">
                      {noteToText(tpl.body_html).replace(/\n+/g, " · ")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("noteTemplate.moveUp")}
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => move(i, -1)}
                  >
                    ▲
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("noteTemplate.moveDown")}
                    disabled={i === list.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                  >
                    ▼
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(tpl)}
                  >
                    {t("noteTemplate.edit")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAskDelete(tpl)}
                  >
                    {t("noteTemplate.delete")}
                  </Button>
                </li>
              ))}
            </ul>

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
