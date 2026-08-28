import { api } from "@/lib/api";
import { toQuery, type TradeFilter } from "./filters";

/**
 * Tên file tải về: mã account cộng ngày xuất.
 *
 * Ngày lấy theo giờ MÁY chứ không theo timezone account, và đó là chủ ý: đây
 * là "tôi tải file này lúc nào", không phải một mốc trong dữ liệu. Người dùng
 * đọc nó để phân biệt hai lần tải, không để tính toán gì.
 */
export function exportFileName(accountCode: string, now = new Date()): string {
  const hai = (n: number) => String(n).padStart(2, "0");
  const ngay = `${now.getFullYear()}-${hai(now.getMonth() + 1)}-${hai(now.getDate())}`;
  return `${accountCode}-${ngay}.csv`;
}

/**
 * Đường dẫn export mang ĐÚNG bộ lọc đang hiển thị.
 *
 * page 1 để toQuery bỏ hẳn tham số phân trang: export xuất cả tập đã lọc, chứ
 * không xuất riêng trang đang xem. Gửi page lên là nói dối về ý định, và
 * người dùng lọc 300 lệnh sẽ nhận về đúng 50 dòng mà không hiểu vì sao.
 */
export function exportPath(accountId: number, f: TradeFilter): string {
  return `/accounts/${accountId}/trades.csv${toQuery(f, 1)}`;
}

/**
 * Tải file rồi kích hoạt hộp thoại lưu của trình duyệt.
 *
 * Phải đi qua api.getBlob chứ không đặt href thẳng vào <a>: request cần header
 * Authorization, mà thẻ <a> thì không gắn header được. Đó cũng là lý do phải
 * tự tạo object URL và tự thu hồi.
 */
export async function downloadTradesCsv(
  accountId: number,
  accountCode: string,
  f: TradeFilter,
): Promise<void> {
  const blob = await api.getBlob(exportPath(accountId, f));
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(accountCode);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Không thu hồi thì blob nằm lại trong bộ nhớ tới khi đóng tab.
    URL.revokeObjectURL(url);
  }
}
