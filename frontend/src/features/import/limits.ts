/**
 * Trần cỡ file import — BẢN CHÉP của `service.MaxImportBytes` ở backend.
 *
 * Chép sang đây để chặn ngay ở trình duyệt: trên Vercel, body vượt 4,5 MB bị
 * chặn trước khi tới Go, và người dùng phải chờ upload xong mới nhận về một
 * lỗi. Backend vẫn là nơi canh thật; con số này chỉ để báo sớm.
 * `fileDropzone.test.tsx` buộc chữ gợi ý và câu báo lỗi nói đúng con số này.
 */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
