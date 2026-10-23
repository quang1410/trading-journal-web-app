// Đóng gói csv/<MÃ>.csv thành frontend/public/replay-data/<MÃ>.bin + manifest.json cho trang /replay.
// Cách dùng: node build.mjs [--from 2026-01-01]   (download.mjs tự chạy bước này sau khi tải xong)
//
// Định dạng <MÃ>.bin: gzip của 6 cột Int32 nối liền nhau, mỗi cột dài n:
//   phút Unix, open/high/low/close × 1000, volume × 1e6 (CME: × 1e3, xem scaleFor).
// Hệ số thật của từng mã ghi ở `scales` trong manifest.json.
// Mỗi cột lưu HIỆU SỐ so với giá trị trước (giá đi từng chút nên hiệu số nhỏ, nén rất tốt).
// Giá Dukascopy có tối đa 3 chữ số thập phân, giá CME đi theo bước 0.25, volume tối đa 6 chữ số lẻ, nên
// đóng gói không làm mất chữ số nào; script báo ra nếu gặp giá trị không giữ nguyên được.
// Giải nén ở frontend/src/features/replay/engine/bundle.ts.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.resolve(HERE, "../../frontend/public/replay-data");
// hệ số lớn nhất của từng cột: time (phút), O, H, L, C, V. Mỗi mã có `scales` riêng trong manifest
// (volume CME dùng hệ số nhỏ hơn, xem scaleFor); frontend đọc theo manifest.
const SCALES = [1, 1000, 1000, 1000, 1000, 1e6];
// Thứ tự trong manifest = thứ tự trong ô chọn mã. Phiên mới mở hai mã đầu, nên mã có lịch sử dài
// (Dukascopy) đứng trước mã CME chỉ có vài tuần 1m. Mã lạ xếp sau, theo bảng chữ cái.
const ORDER = ["US100", "US500", "NQ", "ES"];
// mã CME gộp dần từ TradingView: giữ trọn lịch sử, không cắt theo --from
const KEEP_ALL = ["NQ", "ES"];
const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);

const INT32_MAX = 2 ** 31 - 1;

/**
 * Hệ số lớn nhất (bắt đầu từ `max`, chia dần cho 1000) mà mọi giá trị cột nhân lên vẫn vừa Int32.
 * Volume Dukascopy là số lẻ nhỏ (0,64) nên giữ 1e6; volume CME là số hợp đồng (tới hàng chục nghìn
 * mỗi phút) nhân 1e6 sẽ tràn Int32, nên hạ xuống 1e3. Giá trị không âm nên hiệu số cũng vừa.
 */
function scaleFor(values, max) {
  const top = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let scale = max;
  while (scale > 1 && Math.round(top * scale) > INT32_MAX) scale /= 1000;
  return scale;
}

export function packCsv(file, fromMs) {
  const rows = [];
  let lastT = -Infinity;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const f = line.split(",");
    const t = Number(f[0]);
    // header, dòng trống, trùng lặp, hoặc trước ngày bắt đầu
    if (f.length < 5 || !Number.isFinite(t) || t <= lastT || t < fromMs) continue;
    lastT = t;
    rows.push([Math.round(t / 60000), +f[1], +f[2], +f[3], +f[4], +f[5] || 0]);
  }
  const n = rows.length;
  const scales = SCALES.map((max, k) => (k === 0 ? 1 : scaleFor(rows.map((r) => r[k]), max)));
  const cols = scales.map(() => new Int32Array(n));
  let inexact = 0;
  scales.forEach((scale, k) => {
    let prev = 0;
    rows.forEach((r, i) => {
      const q = Math.round(r[k] * scale);
      if (q / scale !== r[k]) inexact++;
      const d = q - prev;
      // Int32Array lặng lẽ cắt bit khi tràn: chặn ở đây thay vì ghi ra data sai
      if (Math.abs(q) > INT32_MAX || Math.abs(d) > INT32_MAX) throw new Error(`${file}: column ${k} value ${r[k]} does not fit Int32 at scale ${scale}`);
      cols[k][i] = d;
      prev = q;
    });
  });
  const buf = Buffer.concat(cols.map((c) => Buffer.from(c.buffer, 0, n * 4)));
  return { n, inexact, scales, first: n ? rows[0][0] * 60 : null, last: n ? rows[n - 1][0] * 60 : null, gz: zlib.gzipSync(buf, { level: 9 }) };
}

/** Đọc lại nến từ <MÃ>.bin đã đóng gói: mảng [ms Unix, O, H, L, C, V]; rỗng nếu chưa có file. */
export function readBundleRows(name) {
  const manifestFile = path.join(OUT_DIR, "manifest.json");
  if (!fs.existsSync(manifestFile)) return [];
  const entry = JSON.parse(fs.readFileSync(manifestFile, "utf8")).symbols.find((s) => s.name === name);
  const binFile = entry && path.join(OUT_DIR, entry.file);
  if (!entry || !fs.existsSync(binFile)) return [];
  const buf = zlib.gunzipSync(fs.readFileSync(binFile));
  const raw = new Int32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const { n, scales } = entry;
  const acc = scales.map(() => 0);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(scales.map((scale, k) => {
      acc[k] += raw[k * n + i];
      return k === 0 ? acc[k] * 60000 : acc[k] / scale;
    }));
  }
  return rows;
}

/**
 * Đóng gói csv/*.csv vào OUT_DIR. `only` = chỉ đóng gói lại các mã này (download của mã khác giữ
 * nguyên). Mã đã có trong manifest mà không được đóng gói lại (không nằm trong `only`, hoặc máy này
 * không có csv của nó) thì giữ nguyên .bin và mục manifest cũ, không bị rơi khỏi trang /replay.
 */
export function buildBundle({ from, only } = {}) {
  const fromDate = from ?? new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00Z`);
  const csvDir = path.join(HERE, "csv");
  const files = (fs.existsSync(csvDir) ? fs.readdirSync(csvDir).filter((f) => /\.csv$/i.test(f)).sort() : [])
    .filter((f) => !only || only.includes(f.replace(/\.csv$/i, "")));
  if (!files.length) {
    console.log("No csv/*.csv found; run download.mjs first.");
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifestFile = path.join(OUT_DIR, "manifest.json");
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")).symbols : [];
  const symbols = [];
  for (const f of files) {
    const name = f.replace(/\.csv$/i, "");
    // lịch sử CME gộp dần qua nhiều năm (tradingview.mjs): không bao giờ cắt theo --from
    const fromMs = KEEP_ALL.includes(name) ? -Infinity : fromDate.getTime();
    const { n, inexact, scales, first, last, gz } = packCsv(path.join(csvDir, f), fromMs);
    if (!n) {
      console.log(`  ${name}: no bars since ${fromDate.toISOString().slice(0, 10)}, skipped`);
      continue;
    }
    if (inexact) console.log(`  ! ${name}: ${inexact} values could not be stored exactly and were rounded`);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.bin`), gz);
    symbols.push({ name, file: `${name}.bin`, n, scales, from: first, to: last });
    console.log(`  ${name}: ${n.toLocaleString()} bars, ${(gz.length / 1e6).toFixed(1)} MB`);
  }
  for (const e of old) {
    if (!symbols.some((s) => s.name === e.name) && fs.existsSync(path.join(OUT_DIR, e.file))) symbols.push(e);
  }
  symbols.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const manifest = { generated: new Date().toISOString(), symbols };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  => ${OUT_DIR}`);
}

const argFrom = (() => {
  const i = process.argv.indexOf("--from");
  return i >= 0 ? new Date(`${process.argv[i + 1]}T00:00:00Z`) : undefined;
})();
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) buildBundle({ from: argFrom });
