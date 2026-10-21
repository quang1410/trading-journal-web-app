/**
 * Màu của replay là chuỗi màu CSS: biến `var(--replay-*)` (mặc định, khai ở replay.css) hoặc mã
 * màu người dùng tự chọn. SVG đọc được `var()` trực tiếp, còn canvas của lightweight-charts và
 * ô chọn màu (<input type="color">) thì cần màu cụ thể, nên đổi ở đây lúc chạy.
 */

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/;

/** Màu cụ thể của một chuỗi màu (giải `var(--x)` theo theme đang dùng). */
export function resolveColor(color: string, root: Element = document.documentElement): string {
  const m = VAR_RE.exec(color.trim());
  if (!m) return color;
  const v = getComputedStyle(root).getPropertyValue(m[1]).trim();
  return v || (m[2] ?? "").trim() || "transparent";
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Mã màu 6 chữ số cho ô chọn màu (bỏ độ trong suốt). */
export function toHexColor(color: string): string {
  const c = resolveColor(color);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7).toLowerCase();
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (rgb) return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}`;
  return `#${"0".repeat(6)}`;
}

/** Độ sáng cảm nhận (0–255) của màu nền, để chọn chữ đậm hay chữ sáng trên chart. */
export function luminance(color: string): number {
  const h = toHexColor(color);
  const n = +`0x${h.slice(1)}`;
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
