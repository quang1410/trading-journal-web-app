import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fromFrontend, fromRepo } from "./paths";

function scan(dir: string, acc: string[] = []): string[] {
  for (const entryName of readdirSync(dir)) {
    const p = join(dir, entryName);
    if (statSync(p).isDirectory()) scan(p, acc);
    else if (/\.tsx?$/.test(entryName) && !/\.(test|d)\.tsx?$/.test(entryName)) acc.push(p);
  }
  return acc;
}

const allFiles = scan(fromFrontend("src"));
const uiDir = `${sep}components${sep}ui${sep}`;
const uiFiles = allFiles.filter((f) => f.includes(uiDir));
const ownFiles = allFiles.filter((f) => !f.includes(uiDir));

test("component shadcn không được dùng shadow-*", () => {
  // Không có dòng này thì vòng lặp rỗng sẽ pass vĩnh viễn và không ai biết.
  expect(uiFiles.length).toBeGreaterThan(0);
  for (const f of uiFiles) {
    expect(
      readFileSync(f, "utf8"),
      `${f} còn dùng shadow-*; theme tắt hết shadow, phải phân tầng bằng border`,
    ).not.toMatch(/\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/);
  }
});

test("code của mình không hardcode màu hex", () => {
  expect(ownFiles.length).toBeGreaterThan(0);
  for (const f of ownFiles) {
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
  const css = readFileSync(fromFrontend("src/styles/index.css"), "utf8");
  expect(css).toMatch(/@custom-variant\s+dark\s*\(/);
  expect(css).toContain('[data-theme="dark"]');
});

// Quy tắc số 1 của CLAUDE.md ở phía frontend. Backend gửi tiền dưới dạng
// chuỗi chính vì float làm mất chữ số (0.29 * 100 === 28.999999999999996);
// ép sang Number ở FE là ném đi đúng thứ backend đã cố giữ.
test("không ép tiền sang Number", () => {
  expect(ownFiles.length).toBeGreaterThan(0);
  for (const f of ownFiles) {
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
const enumsGo = readFileSync(fromRepo("backend/internal/domain/enums.go"), "utf8");

// Chỉ lấy chuỗi CÓ ký tự ngoài ASCII.
//
// Giới hạn này là cố ý, và nói thẳng ra: "Long", "Short", "M15", "deposit"
// thuần ASCII nên KHÔNG vào danh sách cấm — cấm chúng sẽ đụng false positive
// với comment và mã thường ở khắp nơi. Chúng vẫn phải lấy từ /meta/enums,
// nhưng chỗ đó do người review canh, không có máy canh.
const nonAsciiEnums = [...enumsGo.matchAll(/"([^"]*)"/g)]
  .map((m) => m[1])
  .filter((s) => /[^\x00-\x7F]/.test(s));

// src/test/ được miễn: test buộc phải nói được ngôn ngữ của dữ liệu thật, và
// src/test/tradeFactory.ts tồn tại chính để giữ những chuỗi đó ở MỘT chỗ.
const fileNgoaiTest = ownFiles.filter((f) => !f.includes(`${sep}test${sep}`));

test("không chép cứng chuỗi enum của backend vào frontend", () => {
  // Regex hỏng hoặc file đổi chỗ sẽ cho danh sách rỗng, và vòng lặp rỗng thì
  // pass vĩnh viễn mà không ai biết.
  expect(nonAsciiEnums.length).toBeGreaterThan(10);
  expect(fileNgoaiTest.length).toBeGreaterThan(0);

  for (const f of fileNgoaiTest) {
    const content = readFileSync(f, "utf8");
    for (const s of nonAsciiEnums) {
      expect(
        content,
        `${f} chép cứng chuỗi enum ${JSON.stringify(s)}; lấy từ useMetaEnums()`,
      ).not.toContain(s);
    }
  }
});

// Ranh giới chuỗi->số phải là MỘT chỗ, và phải là chỗ đã biết tên.
//
// toPlot ném đi độ chính xác mà cả backend lẫn src/lib/decimal.ts bỏ công giữ.
// Đổi lấy điều đó là hợp lý ĐÚNG MỘT CHỖ: nơi dựng mảng cho Recharts. Rải nó
// vào component thì mỗi lần rải là một chỗ có thể lỡ đưa số đã mất chính xác
// ra nhãn, và không có test nào bắt được vì con số vẫn trông rất bình thường.
const TOPLEVEL_ALLOWED = join("features", "dashboard", "prepare.ts");

test("toPlot chỉ được gọi trong features/dashboard/prepare.ts", () => {
  const pham = ownFiles.filter(
    (f) => !f.endsWith(TOPLEVEL_ALLOWED) && !f.endsWith(join("lib", "decimal.ts")),
  );
  expect(pham.length).toBeGreaterThan(0);

  for (const f of pham) {
    expect(
      readFileSync(f, "utf8"),
      `${f} gọi toPlot; chỉ features/dashboard/prepare.ts được gọi, xem spec 4a §2.3`,
    ).not.toMatch(/\btoPlot\s*\(/);
  }
});

// Con trỏ phải nói được cái gì bấm được.
//
// Tailwind Preflight đặt `cursor: default` cho MỌI <button>, kể cả nút thật —
// nên không có lớp `cursor-pointer` thì nút bấm được trông y hệt một mảng chữ
// chết. Với <a href> thì trình duyệt tự cho con trỏ bàn tay, nên chỉ những
// phần tử KHÔNG phải thẻ neo mới cần lớp này.
//
// Nguồn phát lớp ấy nằm ở vài chỗ dùng chung — buttonVariants của Button,
// .sidebar-menu-button trong index.css, SelectTrigger/SelectItem — nên phần
// lớn component không tự khai. Test này chỉ quét những thẻ <button> viết
// TAY: chúng không đi qua chỗ dùng chung nào cả.
test("thẻ <button> viết tay phải có cursor-pointer", () => {
  expect(allFiles.length).toBeGreaterThan(0);

  const viPham: string[] = [];
  for (const f of allFiles) {
    // Bỏ comment trước khi quét: pagination.tsx nhắc tới "<button onClick>"
    // trong một đoạn giải thích, và đó không phải một thẻ thật.
    const content = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    // Quét THẺ MỞ của <button>, từ "<button" tới dấu ">" khép nó — chứ không
    // tới "</button>". Hai lý do, cả hai đều từng làm test này bỏ lọt:
    //
    //   - `<button ... />` tự đóng không có "</button>" nào để khớp, nên cả
    //     thẻ biến mất khỏi vùng quét.
    //   - Với button lồng nhau, "tới </button>" nuốt luôn button con, và một
    //     `cursor-pointer` của con là đủ để cha thoát — cha vẫn thiếu lớp.
    //
    // className nằm trong thẻ mở nên cắt tới ">" là đủ. Cái ">" ấy phải là
    // ">" thật của thẻ, không phải ">" nằm trong chuỗi hay trong arrow
    // function của một handler, nên vòng lặp dưới dò từng ký tự: bỏ qua
    // nguyên cụm nháy đơn/kép/backtick và nguyên cụm {...} lồng nhau.
    for (const dau of [...content.matchAll(/<button\b/g)]) {
      const from = dau.index;
      let i = from + "<button".length;
      let depth = 0;
      let the = "";
      for (; i < content.length; i++) {
        const c = content[i];
        if (c === "'" || c === '"' || c === "`") {
          const quote = c;
          for (i++; i < content.length; i++) {
            if (content[i] === "\\") i++;
            else if (content[i] === quote) break;
          }
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) {
          the = content.slice(from, i + 1);
          break;
        }
      }
      // Không tìm thấy ">" khép thẻ: file dở dang hoặc cú pháp lạ. Báo lên
      // thay vì lặng lẽ coi như đạt — một thẻ không quét được không phải một
      // thẻ hợp lệ.
      if (the === "") {
        viPham.push(`${f}: không tìm được thẻ mở khép kín tại vị trí ${from}`);
        continue;
      }
      if (!the.includes("cursor-pointer") && !the.includes("cursor-not-allowed")) {
        viPham.push(`${f}: ${the.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
  }

  expect(viPham, `thiếu cursor-pointer:\n${viPham.join("\n")}`).toEqual([]);
});

// Nguồn phát cursor-pointer dùng chung. Nếu ai đó gỡ lớp khỏi buttonVariants
// thì mọi nút trong app im lặng mất con trỏ mà test trên không bắt được, vì nó
// chỉ nhìn thẻ <button> viết tay.
test("Button và nav sidebar giữ nguồn phát cursor-pointer", () => {
  expect(readFileSync(fromFrontend("src/components/ui/button.tsx"), "utf8")).toContain(
    "cursor-pointer",
  );
  expect(readFileSync(fromFrontend("src/styles/index.css"), "utf8")).toMatch(
    /\.sidebar-menu-button\s*\{[^}]*cursor:\s*pointer/,
  );
});

// Preflight của Tailwind v4 đặt `border: 0 solid` — CÓ kiểu, CÓ độ dày, mà
// KHÔNG có màu, nên `class="border"` trần rơi về `currentColor`: viền lấy đúng
// màu CHỮ. Modal vì thế viền đen kịt ở giao diện sáng và trắng toát ở giao
// diện tối — sai ngược nhau ở hai chế độ nên rất dễ tưởng là cố ý.
//
// Chín component từng dính (Dialog, AlertDialog, Card, Alert, Badge…). Sửa
// bằng một luật nền thay vì vá từng chỗ; test này canh luật ấy còn đó.
test("có màu viền mặc định, để `border` trần không lấy màu chữ", () => {
  const css = readFileSync(fromFrontend("src/styles/index.css"), "utf8");
  const base = /@layer\s+base\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  expect(base, "index.css thiếu @layer base").not.toBe("");
  expect(
    base.replace(/\s+/g, " "),
    "thiếu luật border-color mặc định; `class=\"border\"` sẽ lấy currentColor",
  ).toMatch(/\*,\s*::after,\s*::before,\s*::backdrop\s*\{\s*border-color:\s*var\(--border-default\)/);
});

// Modal phải dùng bậc nền dành cho nó. `bg-background` là nền TRANG, nên modal
// dùng nó sẽ chìm vào chính cái trang nó đang phủ lên.
test("Dialog và AlertDialog dùng bậc nền của modal", () => {
  for (const f of ["src/components/ui/dialog.tsx", "src/components/ui/alert-dialog.tsx"]) {
    const content = readFileSync(fromFrontend(f), "utf8");
    expect(content, `${f}: modal phải dùng bg-surface-modal`).toContain("bg-surface-modal");
  }
});

// Chữ gợi ý của Quill là `::before` dùng `position: absolute`. Thiếu mốc định
// vị ở tổ tiên gần nhất thì nó bám vào dialog và rơi xuống đáy dialog, NẰM
// DƯỚI hai nút Lưu — đã thấy đúng như vậy trên ảnh chụp.
test("vùng soạn thảo là mốc định vị cho chữ gợi ý và tooltip", () => {
  const css = readFileSync(fromFrontend("src/styles/quill.css"), "utf8");
  const block = /\.quill-editor\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
  expect(block, "quill.css thiếu khối .quill-editor").not.toBe("");
  expect(
    block.replace(/\s+/g, " "),
    ".quill-editor thiếu `position: relative`; chữ gợi ý sẽ rơi ra ngoài khung soạn thảo",
  ).toMatch(/position:\s*relative/);
});
