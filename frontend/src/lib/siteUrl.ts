/**
 * Thay chỗ giữ chỗ %SITE_URL% trong index.html bằng origin của bản deploy, để
 * og:image / og:url là URL tuyệt đối — Facebook và X không tự ghép đường dẫn
 * tương đối. Chạy lúc build (plugin trong vite.config.ts), không chạy ở trình
 * duyệt.
 *
 * Chưa đặt SITE_URL thì rơi về đường dẫn tương đối như trước: link preview có
 * thể thiếu ảnh, nhưng HTML không bao giờ chứa nguyên chuỗi "%SITE_URL%".
 */
export function withSiteUrl(html: string, siteUrl: string | undefined): string {
  const origin = (siteUrl ?? "").trim().replace(/\/+$/, "");
  return html.replaceAll("%SITE_URL%", origin);
}
