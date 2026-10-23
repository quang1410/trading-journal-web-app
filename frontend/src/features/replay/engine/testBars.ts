import { gzipSync } from "node:zlib";
import { makeDemoBars } from "./demo";
import type { Bars } from "./types";

/** Bộ sinh số ngẫu nhiên cố định cho test (mulberry32): cùng hạt giống thì cùng chuỗi số. */
export function seeded(seed = 7): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hai mã giả lập cố định (≈ NQ, ES), 60 ngày từ 04/01/2026. */
export const testPair = (seed = 7): [Bars, Bars] => makeDemoBars(seeded(seed));

/** Nến 1m từ danh sách [phút UTC kể từ t0, open, high, low, close]. */
export function barsOf(t0: number, rows: [number, number, number, number, number][]): Bars {
  const n = rows.length;
  const col = (k: number) => Float64Array.from(rows, (r) => (k === 0 ? t0 + r[0] * 60 : r[k]));
  return { n, T: col(0), O: col(1), H: col(2), L: col(3), C: col(4), V: new Float64Array(n) };
}

/** fetch giả của public/replay-data: manifest.json + mỗi mã một .bin đóng gói như build.mjs. */
export function bundleFetcher(bars: Record<string, Bars>): typeof fetch {
  const scales = [1, 1000, 1000, 1000, 1000, 1e6];
  return (async (url: string) => {
    if (url.endsWith("manifest.json")) {
      return new Response(JSON.stringify({ generated: "x", symbols: Object.entries(bars).map(([name, b]) => ({ name, file: `${name}.bin`, n: b.n, scales, from: b.T[0], to: b.T[b.n - 1] })) }));
    }
    const b = bars[url.split("/").pop()!.replace(".bin", "")];
    const cols = [b.T, b.O, b.H, b.L, b.C, b.V];
    const out = new Int32Array(b.n * 6);
    cols.forEach((col, k) => {
      let prev = 0;
      col.forEach((v, i) => {
        const q = k === 0 ? Math.round(v / 60) : Math.round(v * scales[k]);
        out[k * b.n + i] = q - prev;
        prev = q;
      });
    });
    return new Response(gzipSync(Buffer.from(out.buffer)));
  }) as typeof fetch;
}
