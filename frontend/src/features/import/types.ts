/** Một ô hỏng trong file, đủ thông tin để người dùng mở file lên sửa đúng chỗ. */
export type ImportRowError = {
  /** Số dòng trong file, TÍNH CẢ dòng tiêu đề — khớp con số Excel hiển thị. */
  line: number;
  /** Tên cột như viết trong file; rỗng khi lỗi thuộc về cả dòng. */
  column: string;
  msg: string;
};

/**
 * Một dòng ĐÃ PARSE, đúng như backend sẽ ghi.
 *
 * Khác `Trade` ở chỗ thiếu hẳn stt và mọi trường suy diễn: lúc xem trước thì
 * lệnh chưa có số thứ tự, và trường lũy kế tính trên dãy đã ghi.
 *
 * Mọi trường tiền là CHUỖI, cùng lý do như Trade: đi qua number là mất chữ số.
 * `null` ở entry/exit/volume nghĩa là CHƯA NHẬP, khác hẳn "0".
 */
export type ImportPreviewRow = {
  /** Ngày đã quy về timezone của account, dạng YYYY-MM-DD. */
  day: string;
  symbol: string;
  /** Đã map BUY/SELL → Long/Short. */
  direction: string;
  entry: string | null;
  exit: string | null;
  volume: string | null;
  profit: string;
  fee: string;
};

export type ImportReport = {
  /** Số dòng đọc được. */
  valid: number;
  /** Số dòng trống bị bỏ qua. */
  skipped: number;
  errors: ImportRowError[];
  /**
   * Vài dòng đầu đã parse, để đối chiếu với file trước khi ghi. Backend trả
   * `null` khi không có dòng nào — đọc bằng `?? []`.
   */
  preview: ImportPreviewRow[] | null;
  /** Đã ghi vào DB hay chưa. Dry-run luôn false. */
  committed: boolean;
};
