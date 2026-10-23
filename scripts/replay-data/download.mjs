// Tải nến 1 phút miễn phí từ Dukascopy cho US100 (≈ NQ) và US500 (≈ ES), rồi đóng gói cho trang /replay.
//
// Cách dùng (trong thư mục scripts/replay-data):
//   npm install
//   node download.mjs                       # từ 01/01 năm nay tới hiện tại, cả US100 và US500
//   node download.mjs --from 2026-03-01     # đổi ngày bắt đầu
//   node download.mjs --symbols US100       # chỉ một mã
//
// Mỗi tháng lưu riêng ở raw/<MÃ>/<YYYY-MM>.csv nên bị ngắt giữa chừng thì chạy lại là tải tiếp
// tháng còn thiếu. Gộp xong ra csv/<MÃ>.csv, rồi build.mjs đóng gói vào frontend/public/replay-data/.
//
// Dukascopy chặn request tự động bằng WAF (trả HTTP 202): bản beta của dukascopy-node vượt qua
// bằng Chrome đã cài trên máy (playwright-core), token lưu ở ~/.dukascopy-node/waf-token.json.

import { getHistoricalRates } from "dukascopy-node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const INSTRUMENTS = {
  US100: "usatechidxusd", // Nasdaq 100 CFD -> dùng thay cho NQ / MNQ
  US500: "usa500idxusd", // S&P 500 CFD -> dùng thay cho ES / MES
};

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const now = new Date();
const from = new Date(`${argValue("from", `${now.getUTCFullYear()}-01-01`)}T00:00:00Z`);
const symbols = argValue("symbols", "US100,US500").split(",").map((s) => s.trim().toUpperCase());
if (Number.isNaN(from.getTime())) throw new Error("--from must be a date like 2026-01-01");

const rawDir = path.join(HERE, "raw");
const csvDir = path.join(HERE, "csv");
fs.mkdirSync(csvDir, { recursive: true });

function monthsBetween(start, end) {
  const list = [];
  let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (d < end) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    list.push({ from: d < start ? start : d, to: next < end ? next : end, key: d.toISOString().slice(0, 7), complete: next <= end });
    d = next;
  }
  return list;
}

function fetchMonth(instrument, month) {
  return getHistoricalRates({
    instrument,
    dates: { from: month.from, to: month.to },
    timeframe: "m1",
    priceType: "bid",
    volumes: true,
    ignoreFlats: true,
    format: "array",
    batchSize: 10,
    pauseBetweenBatchesMs: 500,
    retryCount: 3,
    retryOnEmpty: false, // thứ Bảy không có giao dịch: ngày rỗng là bình thường, không phải lỗi
    pauseBetweenRetriesMs: 1000,
  });
}

for (const symbol of symbols) {
  const instrument = INSTRUMENTS[symbol];
  if (!instrument) {
    console.error(`Unknown symbol ${symbol}. Choose from: ${Object.keys(INSTRUMENTS).join(", ")}`);
    continue;
  }
  const symbolRaw = path.join(rawDir, symbol);
  fs.mkdirSync(symbolRaw, { recursive: true });
  const months = monthsBetween(from, now);
  console.log(`\n== ${symbol} (${instrument}): ${months.length} months from ${months[0].key} ==`);

  for (const [i, month] of months.entries()) {
    const file = path.join(symbolRaw, `${month.key}.csv`);
    // Tháng đã đủ và đã tải thì bỏ qua; tháng hiện tại luôn tải lại.
    if (month.complete && fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`  [${i + 1}/${months.length}] ${month.key} already downloaded, skipping`);
      continue;
    }
    process.stdout.write(`  [${i + 1}/${months.length}] ${month.key} downloading... `);
    try {
      const rows = await fetchMonth(instrument, month);
      fs.writeFileSync(file, rows.map((r) => r.slice(0, 6).join(",")).join("\n"));
      console.log(`${rows.length} bars`);
    } catch (e) {
      console.log(`ERROR: ${e.message} (run the script again to retry)`);
    }
  }

  // Gộp các tháng thành một file, bỏ trùng ở ranh giới tháng.
  const outFile = path.join(csvDir, `${symbol}.csv`);
  const out = fs.createWriteStream(outFile);
  out.write("time,open,high,low,close,volume\n");
  let total = 0;
  let lastTs = 0;
  const firstKey = months[0].key;
  for (const f of fs.readdirSync(symbolRaw).filter((f) => f.endsWith(".csv")).sort()) {
    if (f.slice(0, 7) < firstKey) continue;
    const body = fs.readFileSync(path.join(symbolRaw, f), "utf8").trim();
    for (const line of body ? body.split("\n") : []) {
      const ts = Number(line.slice(0, line.indexOf(",")));
      if (ts <= lastTs || ts < from.getTime()) continue;
      lastTs = ts;
      out.write(line + "\n");
      total++;
    }
  }
  await new Promise((resolve) => out.end(resolve));
  console.log(`  => ${outFile} (${total.toLocaleString()} bars)`);
}

console.log("\nPacking for the /replay page...");
// chỉ đóng gói lại mã của Dukascopy: NQ / ES (tradingview.mjs) gộp lịch sử nhiều năm, không cắt theo --from
buildBundle({ from, only: symbols });
console.log("\nDone. Open /replay in the web app; the new data loads on the next visit.");
