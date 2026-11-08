import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

/**
 * Khoá nút gửi sau 429 cho tới hết Retry-After — bấm tiếp chỉ đốt thêm lượt
 * và kéo dài thời gian bị chặn. Số phút hiện trên nút là con số TĨNH lúc nhận
 * lỗi, không đếm ngược: đếm từng giây làm trình đọc màn hình đọc liên tục.
 *
 * Chỉ 1429 (bị chặn vì thử nhiều) mới khoá; 1503 (máy chủ bận) thì không —
 * người dùng không làm gì sai. Không có Retry-After thì không khoá — không
 * biết khoá bao lâu thì đừng đoán.
 */
export function useRetryLock() {
  const [lockSeconds, setLockSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (lockSeconds === null) return;
    const id = setTimeout(() => setLockSeconds(null), lockSeconds * 1000);
    return () => clearTimeout(id);
  }, [lockSeconds]);

  function lockFrom(error: unknown) {
    if (error instanceof ApiError && error.code === 1429 && error.retryAfter) {
      setLockSeconds(error.retryAfter);
    }
  }

  const lockedMinutes = lockSeconds === null ? null : Math.ceil(lockSeconds / 60);
  return { lockedMinutes, lockFrom };
}
