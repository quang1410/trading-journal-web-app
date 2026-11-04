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
