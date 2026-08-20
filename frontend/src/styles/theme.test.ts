import { readFileSync } from "node:fs";
import { tuFrontend, tuRepo } from "@/test/paths";

test("bản chép theme phải giống bản gốc từng byte", () => {
  const goc = readFileSync(tuRepo("docs/design/theme.css"));
  const chep = readFileSync(tuFrontend("src/styles/theme.css"));
  // So Buffer chứ không so chuỗi: chuỗi che mất khác biệt về BOM và ký tự
  // xuống dòng, mà đó đúng là kiểu trôi lặng lẽ nhất.
  expect(chep.equals(goc)).toBe(true);
});
