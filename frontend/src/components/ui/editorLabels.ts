import { useI18n } from "@/i18n";
import type { ToolbarLabels } from "./rich-text-editor";

/**
 * Nhãn mười nút của thanh công cụ soạn thảo.
 *
 * Tách khỏi component vì RichTextEditor nhận nhãn qua props chứ không tự gọi
 * `useI18n`: nó là lớp bọc quanh một thư viện mệnh lệnh, và giữ nó không phụ
 * thuộc vào i18n thì test dựng được nó bằng nhãn bất kỳ.
 */
export function useEditorLabels(): ToolbarLabels {
  const { t } = useI18n();
  return {
    bold: t("editor.bold"),
    italic: t("editor.italic"),
    underline: t("editor.underline"),
    strike: t("editor.strike"),
    bullet: t("editor.bullet"),
    ordered: t("editor.ordered"),
    check: t("editor.check"),
    link: t("editor.link"),
    image: t("editor.image"),
    clean: t("editor.clean"),
  };
}
