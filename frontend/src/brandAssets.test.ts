import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const favicon = readFileSync(resolve(process.cwd(), "public/favicon.svg"), "utf8");

test("favicon uses the ledger brand mark", () => {
  expect(favicon).toContain('viewBox="0 0 32 32"');
  expect(favicon).toContain("#12b886");
  expect(favicon).toContain("#101828");
});
