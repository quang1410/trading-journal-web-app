import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";
import { withSiteUrl } from "./siteUrl";

const html = `<meta property="og:image" content="%SITE_URL%/og.png" /><meta property="og:url" content="%SITE_URL%/" />`;

// Facebook và X không tự ghép og:image tương đối thành URL đầy đủ, mà link
// chia sẻ trong group là kênh thu người duy nhất của landing.
test("og tags become absolute when the site URL is set", () => {
  expect(withSiteUrl(html, "https://journal.example")).toBe(
    `<meta property="og:image" content="https://journal.example/og.png" /><meta property="og:url" content="https://journal.example/" />`,
  );
});

test("a trailing slash in the site URL is not doubled", () => {
  expect(withSiteUrl(html, "https://journal.example/")).toContain('content="https://journal.example/og.png"');
});

test("without a site URL the tags fall back to relative paths, never a raw placeholder", () => {
  const out = withSiteUrl(html, undefined);
  expect(out).toContain('content="/og.png"');
  expect(out).not.toContain("%SITE_URL%");
});

test("index.html routes og:image and og:url through the placeholder", () => {
  const index = readFileSync(fromFrontend("index.html"), "utf8");
  expect(index).toContain('<meta property="og:image" content="%SITE_URL%/og.png" />');
  expect(index).toContain('<meta property="og:url" content="%SITE_URL%/" />');
});
