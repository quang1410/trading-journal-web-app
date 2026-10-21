import type { Bars } from "./types";

/**
 * Data mặc định của trang replay: public/replay-data/manifest.json + một file .bin mỗi mã,
 * do scripts/replay-data/build.mjs tạo ra. Định dạng .bin: gzip của 6 cột Int32 nối liền
 * (phút Unix, O, H, L, C, V), mỗi cột lưu hiệu số so với giá trị trước, chia `scales` để ra giá.
 */
export const BUNDLE_BASE = "/replay-data";

export interface BundleEntry {
  name: string;
  file: string;
  n: number;
  scales: number[];
  from: number;
  to: number;
}
export interface BundleManifest {
  generated: string;
  symbols: BundleEntry[];
}

/** Giải các cột Int32 (đã giải nén) thành nến. */
export function decodeColumns(raw: Int32Array, entry: Pick<BundleEntry, "n" | "scales">): Bars {
  const { n, scales } = entry;
  if (raw.length !== n * 6) throw new Error(`bundle size mismatch: ${raw.length} values for ${n} bars`);
  const cols = scales.map((scale, k) => {
    const out = new Float64Array(n);
    const off = k * n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += raw[off + i];
      out[i] = k === 0 ? acc * 60 : acc / scale;
    }
    return out;
  });
  return { n, T: cols[0], O: cols[1], H: cols[2], L: cols[3], C: cols[4], V: cols[5] };
}

/** Giải nén gzip bằng DecompressionStream của trình duyệt. */
export async function gunzip(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const gz = new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  return new Response(stream.pipeThrough(gz)).arrayBuffer();
}

export async function fetchManifest(fetcher: typeof fetch = fetch): Promise<BundleManifest | null> {
  try {
    const res = await fetcher(`${BUNDLE_BASE}/manifest.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const m = (await res.json()) as BundleManifest;
    return Array.isArray(m.symbols) && m.symbols.length ? m : null;
  } catch {
    return null;
  }
}

export async function fetchBundleBars(entry: BundleEntry, fetcher: typeof fetch = fetch): Promise<Bars> {
  const res = await fetcher(`${BUNDLE_BASE}/${entry.file}`);
  if (!res.ok || !res.body) throw new Error(`could not load ${entry.file}: HTTP ${res.status}`);
  return decodeColumns(new Int32Array(await gunzip(res.body)), entry);
}
