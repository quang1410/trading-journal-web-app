import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";

const bridge = readFileSync(fromFrontend("src/styles/bridge.css"), "utf8");

// Tailwind v4 chỉ đúc utility cho tên đã khai trong @theme. Thiếu một dòng
// --color-* thì `text-loss` là một lớp không tồn tại — không lỗi build, chỉ
// là chữ lỗ hiện màu mặc định.
test("landing tokens are declared for both themes and exposed to Tailwind", () => {
  const light = /:root,\s*\[data-theme="light"\]\s*\{[^}]*\}/.exec(bridge)?.[0] ?? "";
  const dark = /\[data-theme="dark"\]\s*\{[^}]*\}/.exec(bridge)?.[0] ?? "";
  for (const token of ["--loss-text", "--warn-text", "--cta", "--cta-foreground"]) {
    expect(light, `${token} missing in light theme`).toContain(`${token}:`);
    expect(dark, `${token} missing in dark theme`).toContain(`${token}:`);
  }
  expect(bridge).toContain("--color-loss: var(--loss-text);");
  expect(bridge).toContain("--color-warn: var(--warn-text);");
  expect(bridge).toContain("--color-cta: var(--cta);");
  expect(bridge).toContain("--color-cta-foreground: var(--cta-foreground);");
  expect(bridge).toMatch(/--font-display:\s*"IBM Plex Sans"/);
});
