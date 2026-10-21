// Đóng gói csv/<MÃ>.csv thành frontend/public/replay-data/<MÃ>.bin + manifest.json cho trang /replay.
// Cách dùng: node build.mjs [--from 2026-01-01]   (download.mjs tự chạy bước này sau khi tải xong)
//
// Định dạng <MÃ>.bin: gzip của 6 cột Int32 nối liền nhau, mỗi cột dài n:
//   phút Unix, open/high/low/close × 1000, volume × 1e6.
// Mỗi cột lưu HIỆU SỐ so với giá trị trước (giá đi từng chút nên hiệu số nhỏ, nén rất tốt).
// Giá Dukascopy có tối đa 3 chữ số thập phân, volume tối đa 6, nên đóng gói không làm mất chữ số nào;
// script báo ra nếu gặp giá trị không giữ nguyên được. Giải nén ở frontend/src/features/replay/engine/bundle.ts.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.resolve(HERE, "../../frontend/public/replay-data");
const SCALES = [1, 1000, 1000, 1000, 1000, 1e6]; // time (phút), O, H, L, C, V

function packCsv(file, fromMs) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const cols = SCALES.map(() => new Int32Array(lines.length));
  const prev = SCALES.map(() => 0);
  let n = 0;
  let lastT = -Infinity;
  let inexact = 0;
  let first = null;
  let last = null;
  for (const line of lines) {
    const f = line.split(",");
    const t = Number(f[0]);
    // header, dòng trống, trùng lặp, hoặc trước ngày bắt đầu
    if (f.length < 5 || !Number.isFinite(t) || t <= lastT || t < fromMs) continue;
    lastT = t;
    const values = [Math.round(t / 60000), +f[1], +f[2], +f[3], +f[4], +f[5] || 0];
    values.forEach((v, k) => {
      const q = k === 0 ? v : Math.round(v * SCALES[k]);
      if (k > 0 && q / SCALES[k] !== v) inexact++;
      cols[k][n] = q - prev[k];
      prev[k] = q;
    });
    first ??= t / 1000;
    last = t / 1000;
    n++;
  }
  const buf = Buffer.concat(cols.map((c) => Buffer.from(c.buffer, 0, n * 4)));
  return { n, inexact, first, last, gz: zlib.gzipSync(buf, { level: 9 }) };
}

export function buildBundle({ from } = {}) {
  const fromDate = from ?? new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00Z`);
  const csvDir = path.join(HERE, "csv");
  const files = fs.existsSync(csvDir) ? fs.readdirSync(csvDir).filter((f) => /\.csv$/i.test(f)).sort() : [];
  if (!files.length) {
    console.log("No csv/*.csv found; run download.mjs first.");
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const symbols = [];
  for (const f of files) {
    const name = f.replace(/\.csv$/i, "");
    const { n, inexact, first, last, gz } = packCsv(path.join(csvDir, f), fromDate.getTime());
    if (!n) {
      console.log(`  ${name}: no bars since ${fromDate.toISOString().slice(0, 10)}, skipped`);
      continue;
    }
    if (inexact) console.log(`  ! ${name}: ${inexact} values could not be stored exactly and were rounded`);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.bin`), gz);
    symbols.push({ name, file: `${name}.bin`, n, scales: SCALES, from: first, to: last });
    console.log(`  ${name}: ${n.toLocaleString()} bars, ${(gz.length / 1e6).toFixed(1)} MB`);
  }
  const manifest = { generated: new Date().toISOString(), symbols };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  => ${OUT_DIR}`);
}

const argFrom = (() => {
  const i = process.argv.indexOf("--from");
  return i >= 0 ? new Date(`${process.argv[i + 1]}T00:00:00Z`) : undefined;
})();
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) buildBundle({ from: argFrom });
