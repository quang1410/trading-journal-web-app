import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { tuFrontend, tuRepo } from "./paths";

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

// Quy tắc số 1 của CLAUDE.md ở phía frontend. Backend gửi tiền dưới dạng
// chuỗi chính vì float làm mất chữ số (0.29 * 100 === 28.999999999999996);
// ép sang Number ở FE là ném đi đúng thứ backend đã cố giữ.
test("không ép tiền sang Number", () => {
  expect(fileCuaMinh.length).toBeGreaterThan(0);
  for (const f of fileCuaMinh) {
    expect(
      readFileSync(f, "utf8"),
      `${f} dùng Number(/parseFloat(/parseInt(; tiền phải ở dạng chuỗi, xem src/lib/decimal.ts`,
    ).not.toMatch(/\b(?:Number|parseFloat|parseInt)\(/);
  }
});

// Quy tắc 5 của CLAUDE.md ở phía frontend. Các chuỗi enum tiếng Việt là KEY
// CHẤM ĐIỂM, không phải nhãn hiển thị. Chép cứng chúng vào FE tạo ra một bản
// sao thứ hai sẽ trôi lệch trong im lặng: đổi một ký tự bên Go là đổi kết quả
// chấm điểm của toàn bộ lịch sử, còn bản chép bên này vẫn hiện text cũ như
// không có gì xảy ra.
//
// Đọc thẳng từ nguồn thay vì chép danh sách vào đây — chép vào đây thì chính
// cổng canh cũng là một bản sao sẽ trôi lệch.
const enumsGo = readFileSync(tuRepo("backend/internal/domain/enums.go"), "utf8");

// Chỉ lấy chuỗi CÓ ký tự ngoài ASCII.
//
// Giới hạn này là cố ý, và nói thẳng ra: "Long", "Short", "M15", "deposit"
// thuần ASCII nên KHÔNG vào danh sách cấm — cấm chúng sẽ đụng false positive
// với comment và mã thường ở khắp nơi. Chúng vẫn phải lấy từ /meta/enums,
// nhưng chỗ đó do người review canh, không có máy canh.
const enumCoDau = [...enumsGo.matchAll(/"([^"]*)"/g)]
  .map((m) => m[1])
  .filter((s) => /[^\x00-\x7F]/.test(s));

// src/test/ được miễn: test buộc phải nói được ngôn ngữ của dữ liệu thật, và
// src/test/tradeFactory.ts tồn tại chính để giữ những chuỗi đó ở MỘT chỗ.
const fileNgoaiTest = fileCuaMinh.filter((f) => !f.includes(`${sep}test${sep}`));

test("không chép cứng chuỗi enum của backend vào frontend", () => {
  // Regex hỏng hoặc file đổi chỗ sẽ cho danh sách rỗng, và vòng lặp rỗng thì
  // pass vĩnh viễn mà không ai biết.
  expect(enumCoDau.length).toBeGreaterThan(10);
  expect(fileNgoaiTest.length).toBeGreaterThan(0);

  for (const f of fileNgoaiTest) {
    const noiDung = readFileSync(f, "utf8");
    for (const s of enumCoDau) {
      expect(
        noiDung,
        `${f} chép cứng chuỗi enum ${JSON.stringify(s)}; lấy từ useMetaEnums()`,
      ).not.toContain(s);
    }
  }
});
