// Cách một tài khoản tự giới thiệu trên UI. Thuần, không React, để test được
// không cần render.
import type { Account } from "./types";

/** Số dấu màu có sẵn trong CSS (.account-chip[data-chip="..."]). */
export const CHIP_COUNT = 6;

/**
 * Nhãn chính: TÊN, không phải mã.
 *
 * Mã tài khoản do sàn cấp là dãy số ("455981"), còn tên là chữ người dùng tự
 * đặt. Đưa mã lên trước thì mỗi lần đổi tài khoản là một lần đọc so từng chữ
 * số. Tên rỗng thì lùi về mã, vì một dòng trống còn tệ hơn một dãy số.
 */
export function accountLabel(account: Account | null | undefined): string {
  if (!account) return "";
  const name = account.name.trim();
  return name === "" ? account.code : name;
}

/**
 * Nhãn phụ: mã tài khoản — nhưng chỉ khi nó nói thêm được điều gì.
 *
 * Khi tên trùng mã (mặc định lúc mới tạo), hiện cả hai là in ra hai lần cùng
 * một chuỗi, làm dòng dưới thành nhiễu thay vì thông tin.
 */
export function accountSubLabel(account: Account | null | undefined): string {
  if (!account) return "";
  return accountLabel(account) === account.code ? "" : account.code;
}

/**
 * Chỉ số dấu màu, suy ra từ id.
 *
 * Lấy theo id chứ không theo vị trí trong danh sách: id là bất biến của tài
 * khoản, nên màu bám theo tài khoản suốt đời nó. Nếu lấy theo vị trí thì xoá
 * một tài khoản là toàn bộ phần còn lại đổi màu, và trí nhớ "tài khoản của
 * mình màu hổ phách" thành vô dụng.
 */
export function accountChipIndex(id: number): number {
  // id âm không đến từ backend, nhưng % của JS giữ nguyên dấu nên vẫn chặn
  // để không bao giờ sinh ra data-chip không có kiểu tương ứng trong CSS.
  return ((id % CHIP_COUNT) + CHIP_COUNT) % CHIP_COUNT;
}
