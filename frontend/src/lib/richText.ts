/**
 * Ghi chú lệnh được LƯU dưới dạng HTML của Quill, nhưng ba nơi khác vẫn cần
 * text thuần: bảng lệnh, thùng rác và file CSV xuất ra. Các hàm ở đây là ranh
 * giới giữa hai dạng đó, và chúng THUẦN — test được mà không cần DOM của
 * trình duyệt hay dựng editor.
 *
 * Không bóc thẻ bằng `innerHTML`, dù đó là cách ngắn nhất: cách này chạy được
 * cả ở nơi không có `document` (test Node), và quan trọng hơn — gán chuỗi
 * chưa tin cậy vào innerHTML là mở đúng cánh cửa mà `sanitizeNoteHtml` sinh
 * ra để đóng.
 */

/** Ghi chú rỗng của Quill: editor trống vẫn trả về một đoạn văn có <br>. */
const EMPTY_HTML = new Set(["", "<p><br></p>", "<p></p>", "<p><br/></p>", "<p><br /></p>"]);

export function isEmptyNote(html: string): boolean {
  return EMPTY_HTML.has(html.trim());
}

/**
 * Mã điểm thập phân của một thực thể `&#39;`.
 *
 * Cộng từng chữ số thay vì gọi hàm ép kiểu số có sẵn: cổng styleguard cấm cả
 * ba hàm đó trong `src/` vì tiền phải ở dạng chuỗi (quy tắc 1). Ở đây không
 * phải tiền, nhưng một ngoại lệ cho cổng ấy là một ngoại lệ người sau phải
 * đọc lại và cân nhắc — rẻ hơn thì viết thẳng phép cộng.
 */
function codePoint(digits: string): number {
  let n = 0;
  for (let i = 0; i < digits.length; i++) n = n * 10 + (digits.charCodeAt(i) - 48);
  return n;
}

/** Đổi các thực thể HTML mà `escapeHtml` sinh ra trở lại ký tự gốc. */
function decodeEntities(s: string): string {
  return (
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(codePoint(code)))
      // & đi CUỐI: giải mã nó trước thì "&amp;lt;" ra "<" thay vì "&lt;".
      .replace(/&amp;/g, "&")
  );
}

/**
 * Text thuần của một ghi chú HTML, để hiện ở bảng và xuất ra CSV.
 *
 * Ranh giới khối (`</p>`, `</li>`, `<br>`) thành xuống dòng chứ không dính
 * liền nhau: "Vào lệnh sớm</p><p>Bài học: chờ nến đóng" mà nối thẳng sẽ ra
 * "Vào lệnh sớmBài học", tức là bịa ra một từ không ai gõ.
 */
export function noteToText(html: string): string {
  if (isEmptyNote(html)) return "";
  return decodeEntities(
    html
      .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Một dòng tóm tắt cho ô bảng: xuống dòng thành dấu chấm giữa câu. */
export function noteToOneLine(html: string): string {
  return noteToText(html).replace(/\s*\n+\s*/g, " · ");
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

/**
 * Ghi chú CŨ là text thuần: bọc thành đoạn văn để Quill mở lên đúng.
 *
 * Nhận biết bằng "có thẻ mở nào không" chứ không bằng "có dấu < không": một
 * ghi chú thật hoàn toàn có thể chứa "giá < 2000", và coi nó là HTML sẽ nuốt
 * mất phần sau dấu nhỏ hơn. Regex đòi một tên thẻ ngay sau dấu <.
 */
export function noteToHtml(stored: string): string {
  const s = stored.trim();
  if (s === "") return "";
  if (/<\/?[a-zA-Z][^>]*>/.test(s)) return s;
  return s
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Chỉ giữ lại những thẻ mà thanh công cụ có thể sinh ra.
 *
 * Quill tự sinh HTML nên bình thường không có gì lạ trong đó — nhưng ghi chú
 * đi vào DB còn qua đường import CSV, nơi nội dung do người dùng cung cấp, và
 * ra khỏi DB thì được render bằng `dangerouslySetInnerHTML`. Lọc ở đây để hai
 * đường vào gặp nhau ở cùng một luật, thay vì tin rằng mọi thứ trong cột
 * `notes` đều do editor này viết ra.
 *
 * Danh sách CHO PHÉP, không phải danh sách cấm: thẻ lạ thì bỏ thẻ, giữ chữ.
 */
const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "u", "s", "ol", "ul", "li", "a", "img"]);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

/**
 * `getSemanticHTML()` của Quill 2 đổi MỌI dấu cách thành `&nbsp;`, không chỉ
 * dấu cách ở đầu hay cuối dòng nơi việc đó có nghĩa. Ghi chú "vào lệnh sớm"
 * lưu xuống thành "vào&nbsp;lệnh&nbsp;sớm", và những gì đọc nó sau đó —
 * cột CSV xuất ra, ô tìm kiếm, con mắt người mở DB — nhận về một chuỗi có
 * U+00A0 xen giữa các từ thay vì dấu cách thường. Tìm "vào lệnh" sẽ không ra.
 *
 * Đổi ngược về dấu cách thường ngay tại ranh giới lưu, chứ không để mỗi nơi
 * đọc tự chống đỡ.
 */
function normalizeSpaces(html: string): string {
  return html.replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ");
}

export function sanitizeNoteHtml(html: string): string {
  return normalizeSpaces(html).replace(TAG_RE, (_m, slash: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (tag === "a") {
      const href = safeHref(attrs);
      // Link không có đích hợp lệ thì giữ chữ, bỏ thẻ: một <a> rỗng vẫn trông
      // như link mà bấm không đi đâu.
      if (href === null) return "";
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
    }
    if (tag === "img") {
      const src = safeImageSrc(attrs);
      // Ảnh không có nguồn dùng được thì bỏ hẳn thẻ — khác <a>, ở đây không
      // có chữ nào để giữ lại.
      if (src === null) return "";
      const alt = imageAlt(attrs);
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
    }
    if (tag === "ol" || tag === "ul" || tag === "li") {
      // Quill 2 đánh dấu kiểu danh sách bằng data-list trên <li>.
      const dataList = /\bdata-list\s*=\s*["']?(bullet|ordered|checked|unchecked)["']?/i.exec(attrs);
      return dataList ? `<${tag} data-list="${dataList[1].toLowerCase()}">` : `<${tag}>`;
    }
    return `<${tag}>`;
  });
}

/**
 * Nguồn của một ảnh, hoặc null nếu không dùng được.
 *
 * CHẶT hơn `safeHref` một bậc, và khác nhau ở đúng hai chỗ:
 *
 *   1. Chỉ `https:`. Ảnh nhúng qua `http:` trên trang chạy https bị trình
 *      duyệt chặn vì nội dung hỗn hợp, nên cho phép nó chỉ là hứa hẹn một ô
 *      vuông vỡ.
 *   2. Không nhận đường dẫn tương đối. Với <a> thì "/trades/7" là một link
 *      nội bộ hợp lệ; với <img> thì nó trỏ vào chính máy chủ này, nơi chưa
 *      có chỗ chứa ảnh nào cả.
 *
 * `data:` bị chặn theo cùng luật danh sách cho phép, và đó là chủ đích: cột
 * `notes` không phải chỗ chứa ảnh base64. Một chart 300KB thành ~400KB chuỗi
 * đi qua MỌI lần đọc danh sách lệnh, kể cả khi người dùng chỉ xem bảng.
 */
function safeImageSrc(attrs: string): string | null {
  const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
  const scheme = raw.replace(CONTROL_CHARS, "").toLowerCase();
  return /^https:\/\//.test(scheme) ? raw : null;
}

/** Mô tả ảnh cho trình đọc màn hình; rỗng thì để rỗng, không bịa ra chữ. */
function imageAlt(attrs: string): string {
  const m = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  return decodeEntities((m?.[1] ?? m?.[2] ?? "").trim());
}

// Ký tự điều khiển (U+0000–U+001F) bị nhét vào giữa tên giao thức để né bộ
// lọc — "java\\0script:" trông khác "javascript:" với một phép so chuỗi
// nhưng trình duyệt vẫn chạy nó. Bỏ hết trước khi xét.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Đích của một link, hoặc null nếu không dùng được.
 *
 * Chỉ http, https và mailto. `javascript:` là lý do hàm này tồn tại; giao
 * thức lạ khác cũng chặn luôn theo cùng nguyên tắc danh sách cho phép.
 */
function safeHref(attrs: string): string | null {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
  const scheme = raw.replace(CONTROL_CHARS, "").toLowerCase();
  if (/^(?:https?:|mailto:)/.test(scheme)) return raw;
  // Có giao thức nhưng không nằm trong danh sách cho phép.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(scheme)) return null;
  // Đường dẫn tương đối không mang giao thức nên vô hại.
  return raw === "" ? null : raw;
}
