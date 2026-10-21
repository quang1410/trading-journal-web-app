import { gzipSync } from "node:zlib";
import { decodeColumns, fetchBundleBars, fetchManifest, gunzip } from "./bundle";
import { parseCsv } from "./csv";
import { parseTf, isTimeframe } from "./tf";

test("CSV: ms / seconds / ISO times, header and broken lines skipped, duplicates dropped", () => {
  const b = parseCsv(
    [
      "time,open,high,low,close,volume",
      "1767625200000,1,2,0.5,1.5,10",
      "1767625260,1.5,2,1,1.8",
      "1767625260,9,9,9,9", // duplicate time
      "garbage",
      "2026-01-05 15:02,1.8;2;1.7;1.9",
      "2026-01-05T15:03:00Z\t1.9\t2.1\t1.8\t2",
    ].join("\n"),
  );
  expect(b.n).toBe(4);
  expect([...b.T]).toEqual([1767625200, 1767625260, 1767625320, 1767625380]);
  expect([...b.C]).toEqual([1.5, 1.8, 1.9, 2]);
  expect(b.V[0]).toBe(10);
});

/** Đóng gói giống scripts/replay-data/build.mjs: hiệu số Int32 theo cột, rồi gzip. */
function pack(rows: number[][], scales = [1, 1000, 1000, 1000, 1000, 1e6]) {
  const n = rows.length;
  const out = new Int32Array(n * 6);
  scales.forEach((sc, k) => {
    let prev = 0;
    rows.forEach((r, i) => {
      const q = k === 0 ? Math.round(r[0] / 60) : Math.round(r[k] * sc);
      out[k * n + i] = q - prev;
      prev = q;
    });
  });
  return { gz: gzipSync(Buffer.from(out.buffer)), n, scales };
}

const rows = [
  [1767625200, 25566.123, 25570.5, 25560.001, 25568.25, 0.049172],
  [1767625260, 25568.25, 25569, 25561.75, 25562.999, 0.1182],
  [1767625380, 25563, 25580.125, 25562, 25579.004, 4.308],
];

test("bundle: decoding the packed columns gives back every value exactly", async () => {
  const { gz, n, scales } = pack(rows);
  const raw = new Int32Array(await gunzip(new Response(gz).body!));
  const b = decodeColumns(raw, { n, scales });
  rows.forEach((r, i) => expect([b.T[i], b.O[i], b.H[i], b.L[i], b.C[i], b.V[i]]).toEqual(r));
  expect(() => decodeColumns(new Int32Array(5), { n, scales })).toThrow(/mismatch/);
});

test("bundle: manifest + bin are fetched from /replay-data", async () => {
  const { gz, n, scales } = pack(rows);
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(url);
    if (url.endsWith("manifest.json")) return new Response(JSON.stringify({ generated: "x", symbols: [{ name: "US100", file: "US100.bin", n, scales, from: 0, to: 1 }] }));
    return new Response(gz);
  }) as typeof fetch;
  const m = await fetchManifest(fetcher);
  expect(m?.symbols[0].name).toBe("US100");
  const bars = await fetchBundleBars(m!.symbols[0], fetcher);
  expect(bars.C[2]).toBe(25579.004);
  expect(urls).toEqual(["/replay-data/manifest.json", "/replay-data/US100.bin"]);
  expect(await fetchManifest((async () => new Response("", { status: 404 })) as typeof fetch)).toBeNull();
});

test.each([
  ["1", 1], ["5", 5], ["15", 15], ["30", 30], ["60", 60], ["1h", 60], ["h1", 60], ["H1", 60], ["4h", 240], ["h4", 240],
  ["240", 240], ["d", 1440], ["1d", 1440], ["D1", 1440], ["m5", 5], ["m15", 15],
])("typed timeframe %s → %i minutes", (s, tf) => {
  expect(parseTf(s)).toBe(tf);
  expect(isTimeframe(tf)).toBe(true);
});

test("unknown or malformed timeframes", () => {
  expect(parseTf("2")).toBe(2);
  expect(isTimeframe(2)).toBe(false);
  expect(parseTf("hd")).toBeNull();
  expect(parseTf("")).toBeNull();
});
