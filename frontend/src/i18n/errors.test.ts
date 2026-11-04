import { expect, test } from "vitest";
import { ApiError } from "@/lib/api";
import { errorMessage } from "./errors";
import { strings } from "./strings";
import type { TranslationKey } from "./strings";

const t = (key: TranslationKey) => strings[key].en;

// Trước đây hai hỏng hóc này cùng rơi về "errors.server", còn hai khoá
// errors.unreadableResponse / errors.invalidResponse thì dịch sẵn cả hai thứ
// tiếng mà không chỗ nào tham chiếu.
test("body không đọc được cho ra đúng câu tiếng Anh của nó", () => {
  const err = new ApiError(1500, "máy chủ trả về dữ liệu không đọc được", 502, "unreadable");
  expect(errorMessage(err, "en", t)).toBe(strings["errors.unreadableResponse"].en);
});

test("envelope sai định dạng cho ra đúng câu tiếng Anh của nó", () => {
  const err = new ApiError(1500, "máy chủ trả về dữ liệu sai định dạng", 200, "invalid");
  expect(errorMessage(err, "en", t)).toBe(strings["errors.invalidResponse"].en);
});

test("lỗi 1500 thật từ backend vẫn là errors.server", () => {
  const err = new ApiError(1500, "internal", 500);
  expect(errorMessage(err, "en", t)).toBe(strings["errors.server"].en);
});

test("tiếng Việt vẫn đọc thẳng msg của server", () => {
  const err = new ApiError(1500, "máy chủ trả về dữ liệu không đọc được", 502, "unreadable");
  expect(errorMessage(err, "vi", t)).toBe("máy chủ trả về dữ liệu không đọc được");
});

test("1413 has its own English message, not errors.validation", () => {
  const err = new ApiError(1413, "dữ liệu gửi lên quá lớn", 413);
  expect(errorMessage(err, "en", t)).toBe(strings["errors.payloadTooLarge"].en);
});

// 429 tự ghép câu từ số giây Retry-After ở CẢ hai thứ tiếng, và xếp trước
// knownKey — trước đây trang login tiếng Anh báo "email or password is
// incorrect" khi thực ra là bị chặn tạm.
test("1429 with Retry-After says how many minutes to wait, in both locales", () => {
  const err = new ApiError(1429, "gửi quá nhiều lần, thử lại sau 5 phút", 429, undefined, 241);
  const vi = (key: TranslationKey, o?: { n?: number }) => strings[key].vi.replace("{n}", String(o?.n));
  const en = (key: TranslationKey, o?: { n?: number }) => strings[key].en.replace("{n}", String(o?.n));
  expect(errorMessage(err, "vi", vi, "auth.loginFailed")).toBe("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 5 phút.");
  expect(errorMessage(err, "en", en, "auth.loginFailed")).toBe("Too many attempts. Please try again in 5 min.");
});

test("1429 without Retry-After falls back to a wording with no number", () => {
  const err = new ApiError(1429, "gửi quá nhiều lần", 429);
  expect(errorMessage(err, "en", t, "auth.registerClosed")).toBe(strings["errors.retrySoon"].en);
  expect(errorMessage(err, "vi", (k) => strings[k].vi)).toBe(strings["errors.retrySoon"].vi);
});

test("1503 (server busy) has its own English message and is not a rate limit", () => {
  const err = new ApiError(1503, "máy chủ đang bận, thử lại sau vài giây", 503, undefined, 5);
  expect(errorMessage(err, "en", t, "auth.loginFailed")).toBe(strings["errors.serverBusy"].en);
  expect(errorMessage(err, "vi", (k) => strings[k].vi, "auth.loginFailed")).toBe("máy chủ đang bận, thử lại sau vài giây");
});
