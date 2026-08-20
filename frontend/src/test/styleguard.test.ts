import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { tuFrontend } from "./paths";

function quet(thuMuc: string, ra: string[] = []): string[] {
  for (const ten of readdirSync(thuMuc)) {
    const p = join(thuMuc, ten);
    if (statSync(p).isDirectory()) quet(p, ra);
    else if (/\.tsx?$/.test(ten) && !/\.(test|d)\.tsx?$/.test(ten)) ra.push(p);
  }
  return ra;
}

const tatCa = quet(tuFrontend("src"));
const duongUI = `${sep}components${sep}ui${sep}`;
const fileUI = tatCa.filter((f) => f.includes(duongUI));
const fileCuaMinh = tatCa.filter((f) => !f.includes(duongUI));

test("component shadcn không được dùng shadow-*", () => {
  // Không có dòng này thì vòng lặp rỗng sẽ pass vĩnh viễn và không ai biết.
  expect(fileUI.length).toBeGreaterThan(0);
  for (const f of fileUI) {
    expect(
      readFileSync(f, "utf8"),
      `${f} còn dùng shadow-*; theme tắt hết shadow, phải phân tầng bằng border`,
    ).not.toMatch(/\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/);
  }
});

test("code của mình không hardcode màu hex", () => {
  expect(fileCuaMinh.length).toBeGreaterThan(0);
  for (const f of fileCuaMinh) {
    expect(
      readFileSync(f, "utf8"),
      `${f} hardcode màu hex; chỉ được dùng biến ngữ nghĩa của theme`,
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  }
});

// Component của shadcn có sẵn class dark:*. Mặc định của Tailwind v4 gắn
// biến thể `dark:` vào prefers-color-scheme, tức theo hệ điều hành — trong
// khi theme của dự án dùng [data-theme]. Thiếu khai báo này thì người dùng
// để máy ở dark mà chọn giao diện sáng sẽ thấy ô input nền tối trên nền sáng.
// Đã kiểm trên CSS build: bỏ dòng đó ra là prefers-color-scheme quay lại.
test("biến thể dark: phải bám vào [data-theme], không phải hệ điều hành", () => {
  const css = readFileSync(tuFrontend("src/styles/index.css"), "utf8");
  expect(css).toMatch(/@custom-variant\s+dark\s*\(/);
  expect(css).toContain('[data-theme="dark"]');
});
