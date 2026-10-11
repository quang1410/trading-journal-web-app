import { Analytics } from "@vercel/analytics/react";
import { useAuth } from "@/features/auth/AuthProvider";

type AnalyticsEvent = { type: "pageview" | "event"; url: string };

/**
 * Chỉ gửi sự kiện của đường dẫn landing.
 *
 * Script của Vercel được chèn MỘT lần và sống tiếp sau khi LandingPage unmount:
 * nó tự đếm mọi lần đổi route trong tab. Không lọc thì khách bấm "Đăng nhập"
 * là /login, /dashboard… bị gửi đi — vừa theo dõi người dùng app, vừa làm
 * sai mẫu số của tỷ lệ chuyển đổi.
 */
export function landingOnly<E extends AnalyticsEvent>(event: E): E | null {
  return new URL(event.url).pathname === "/" ? event : null;
}

/**
 * Đo lượt xem landing (Vercel Web Analytics, không cookie). Chỉ chạy ở bản
 * build, và chỉ khi phiên đã xác định là khách: người đã đăng nhập mở / thấy
 * landing một nhịp trước khi sang /dashboard, không được tính là một lượt xem.
 */
export function LandingAnalytics() {
  // Kiểm cờ build TRƯỚC khi đọc phiên: ngoài bản build không có gì để đo, và
  // test của trang không phải dựng AuthProvider chỉ vì component này.
  return import.meta.env.PROD ? <AnonOnlyAnalytics /> : null;
}

function AnonOnlyAnalytics() {
  const { status } = useAuth();
  return status === "anon" ? <Analytics beforeSend={landingOnly} /> : null;
}
