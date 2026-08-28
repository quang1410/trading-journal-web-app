import { readFileSync } from "node:fs";
import { fromFrontend, fromRepo } from "@/test/paths";

test("bản chép theme phải giống bản gốc từng byte", () => {
  const origin = readFileSync(fromRepo("docs/design/theme.css"));
  const chep = readFileSync(fromFrontend("src/styles/theme.css"));
  // So Buffer chứ không so chuỗi: chuỗi che mất khác biệt về BOM và ký tự
  // xuống dòng, mà đó đúng là kiểu trôi lặng lẽ nhất.
  expect(chep.equals(origin)).toBe(true);
});
