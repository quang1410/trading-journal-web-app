import { readFileSync } from "node:fs";
import { tuFrontend } from "@/test/paths";
import { THEME_KEY, readStoredTheme, storeTheme, applyTheme } from "./theme";

const kho = (giaTri: string | null) => ({ getItem: () => giaTri });

test("mặc định là dark khi chưa lưu gì", () => {
  expect(readStoredTheme(kho(null))).toBe("dark");
});

test("mặc định là dark khi giá trị lưu là rác", () => {
  expect(readStoredTheme(kho("mau-hong"))).toBe("dark");
});

test("đọc lại đúng giá trị đã lưu", () => {
  expect(readStoredTheme(kho("light"))).toBe("light");
  expect(readStoredTheme(kho("dark"))).toBe("dark");
});

test("applyTheme đặt thuộc tính data-theme", () => {
  const root = document.createElement("html");
  applyTheme("light", root);
  expect(root.getAttribute("data-theme")).toBe("light");
});

test("storeTheme ghi dưới đúng khoá", () => {
  let khoaDaGhi = "";
  storeTheme("light", { setItem: (k: string) => { khoaDaGhi = k; } });
  expect(khoaDaGhi).toBe(THEME_KEY);
});

// Khoá này bị viết ra HAI nơi: ở đây và trong script inline của index.html.
// Không có test này thì đổi một nơi mà quên nơi kia sẽ làm theme nháy trắng
// mỗi lần tải trang, và không có gì báo.
test("script inline của index.html dùng đúng khoá localStorage", () => {
  const html = readFileSync(tuFrontend("index.html"), "utf8");
  expect(html).toContain(THEME_KEY);
});
