/**
 * Mẫu ghi chú thuộc USER, không thuộc account — vì thế không có `account_id`.
 *
 * `body_html` là HTML của Quill, ĐÚNG cùng định dạng với `Trade.notes`. Nhờ
 * vậy chèn mẫu vào ghi chú chỉ là nối chuỗi, không cần tầng dịch nào ở giữa.
 */
export type NoteTemplate = {
  id: number;
  name: string;
  body_html: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type NoteTemplateCreate = {
  name: string;
  body_html: string;
};

/**
 * Khoá vắng mặt nghĩa là "không đổi" — backend dùng Tristate, xem
 * `service/notetemplate.go`.
 *
 * Không cho `null`: hai cột đều NOT NULL nên backend trả 400 cho null. Kiểu ở
 * đây nói ra điều đó thay vì để người gọi phát hiện lúc chạy.
 */
export type NoteTemplatePatch = Partial<NoteTemplateCreate>;
