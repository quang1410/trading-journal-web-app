/** Một ô hỏng trong file, đủ thông tin để người dùng mở file lên sửa đúng chỗ. */
export type ImportRowError = {
  /** Số dòng trong file, TÍNH CẢ dòng tiêu đề — khớp con số Excel hiển thị. */
  line: number;
  /** Tên cột như viết trong file; rỗng khi lỗi thuộc về cả dòng. */
  column: string;
  msg: string;
};

export type ImportReport = {
  /** Số dòng đọc được. */
  valid: number;
  /** Số dòng trống bị bỏ qua. */
  skipped: number;
  errors: ImportRowError[];
  /** Đã ghi vào DB hay chưa. Dry-run luôn false. */
  committed: boolean;
};
