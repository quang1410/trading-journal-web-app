import { Link } from "react-router";
import { useI18n } from "@/i18n";

// Link chữ trên thẻ của trang đăng nhập / đăng ký. --primary trần chỉ đạt
// 2,55:1 trên nền trắng, nên dùng màu chữ thường + gạch chân (giống link Đăng
// nhập ở LandingNav), và viền focus tường minh thay vì trông vào trình duyệt.
// KHÔNG thêm `outline-none`: ở Tailwind v4 nó đặt --tw-outline-style: none, và
// `focus-visible:outline-2` đọc lại đúng biến đó → viền focus biến mất (QC K-05).
export const authLinkClass =
  "rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

// Đăng ký chỉ mở cho user đầu tiên, trên production nó luôn đóng: lối cho
// khách lạ là danh sách chờ ở landing. Link hiện ở cả /login lẫn /register
// (khi gặp 1403), nên source "login" trong waitlist nghĩa là "đi từ trang
// auth", không riêng trang đăng nhập (K-05).
export function WaitlistLink() {
  const { t } = useI18n();
  return (
    <Link to="/?ref=login" className={authLinkClass}>
      {t("auth.joinWaitlist")}
    </Link>
  );
}
