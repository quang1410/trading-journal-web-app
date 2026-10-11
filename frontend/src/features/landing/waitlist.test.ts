import { readFileSync } from "node:fs";
import { fromRepo } from "@/test/paths";
import { JOURNAL_TOOLS, MARKETS, PROP_STATUSES, looksLikeEmail, readSource } from "./waitlist";

test("looksLikeEmail accepts plain addresses and trims", () => {
  expect(looksLikeEmail("toi@gmail.com")).toBe(true);
  expect(looksLikeEmail("  toi@gmail.com ")).toBe(true);
  expect(looksLikeEmail("toi@localhost")).toBe(false);
  expect(looksLikeEmail("toi gmail.com")).toBe(false);
  expect(looksLikeEmail("")).toBe(false);
});

test("readSource prefers utm_source over ref", () => {
  expect(readSource("?utm_source=fb&ref=zalo")).toBe("fb");
  expect(readSource("?ref=zalo")).toBe("zalo");
  expect(readSource("")).toBe("");
});

// Link chia sẻ hay mang utm_source rỗng do công cụ rút gọn link tự gắn.
// Rỗng phải coi như không có, để ref phía sau vẫn được ghi nhận.
test("readSource falls back to ref when utm_source is empty", () => {
  expect(readSource("?utm_source=&ref=fb-group")).toBe("fb-group");
});

// Mã câu trả lời có bản Go (domain/waitlist_rules.go) và bản TS ở đây. Lệch
// nhau thì một lựa chọn trên form sẽ bị backend trả 400.
test.each([
  ["JournalTools", JOURNAL_TOOLS],
  ["WaitlistMarkets", MARKETS],
  ["PropStatuses", PROP_STATUSES],
] as const)("%s matches the backend list", (goName, codes) => {
  const go = readFileSync(fromRepo("backend/internal/domain/waitlist_rules.go"), "utf8");
  const body = new RegExp(`${goName}\\s*=\\s*\\[\\]string\\{([^}]*)\\}`).exec(go)?.[1];
  expect(body, `${goName} not found in waitlist_rules.go`).toBeDefined();
  expect([...body!.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...codes]);
});
