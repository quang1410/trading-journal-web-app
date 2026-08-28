import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";
import { THEME_KEY, readStoredTheme, storeTheme, applyTheme } from "./theme";

const store = (value: string | null) => ({ getItem: () => value });

test("mặc định là dark khi chưa lưu gì", () => {
  expect(readStoredTheme(store(null))).toBe("dark");
});

test("mặc định là dark khi giá trị lưu là rác", () => {
  expect(readStoredTheme(store("mau-hong"))).toBe("dark");
});

test("đọc lại đúng giá trị đã lưu", () => {
  expect(readStoredTheme(store("light"))).toBe("light");
  expect(readStoredTheme(store("dark"))).toBe("dark");
});

test("applyTheme đặt thuộc tính data-theme", () => {
  const root = document.createElement("html");
  applyTheme("light", root);
  expect(root.getAttribute("data-theme")).toBe("light");
});

test("storeTheme ghi dưới đúng khoá", () => {
  let storedKey = "";
  storeTheme("light", { setItem: (k: string) => { storedKey = k; } });
  expect(storedKey).toBe(THEME_KEY);
});

// Khoá này bị viết ra HAI nơi: ở đây và trong script inline của index.html.
// Không có test này thì đổi một nơi mà quên nơi kia sẽ làm theme nháy trắng
// mỗi lần tải trang, và không có gì báo.
test("script inline của index.html dùng đúng khoá localStorage", () => {
  const html = readFileSync(fromFrontend("index.html"), "utf8");
  expect(html).toContain(THEME_KEY);
});
