// Tải nến 1 phút CME thật cho NQ và ES (hợp đồng liên tục NQ1!, ES1!, phiên Globex đầy đủ) miễn phí
// qua websocket chart của TradingView, rồi đóng gói cho trang /replay.
//
// Cách dùng (trong thư mục scripts/replay-data, Node 22+ vì cần WebSocket có sẵn):
//   node tradingview.mjs                  # cả NQ và ES
//   node tradingview.mjs --symbols NQ     # chỉ một mã
//
// Không đăng nhập thì TradingView chỉ trả khoảng MỘT TUẦN nến 1m gần nhất. Mỗi lần chạy, nến mới được
// GỘP vào csv/<MÃ>.csv (nến cũ giữ lại, nến trùng giờ thì lấy bản mới), nên chạy đều mỗi tuần thì
// lịch sử 1m dài dần ra. Máy không có csv (mới clone) thì lấy lại lịch sử cũ từ <MÃ>.bin đã đóng gói.
// Chỉ đóng gói lại NQ / ES; US100 / US500 của Dukascopy giữ nguyên.
//
// Đây là endpoint không chính thức của TradingView (không có API công khai): họ đổi giao thức là
// script hỏng, và việc lấy data kiểu này không nằm trong điều khoản sử dụng của họ.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle, readBundleRows } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOCKET = "wss://data.tradingview.com/socket.io/websocket?type=chart";

const TICKERS = {
  NQ: "CME_MINI:NQ1!",
  ES: "CME_MINI:ES1!",
};

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const symbols = argValue("symbols", Object.keys(TICKERS).join(",")).split(",").map((s) => s.trim().toUpperCase());

// Khung tin của socket.io cũ: "~m~<độ dài>~m~<nội dung>", có thể nhiều khung trong một lần nhận.
const frame = (s) => `~m~${s.length}~m~${s}`;

/** Mọi nến 1m TradingView chịu trả cho `ticker`: mảng [giây Unix, O, H, L, C, V], tăng dần. */
function fetchBars(ticker) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SOCKET, { headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    const send = (m, p) => ws.send(frame(JSON.stringify({ m, p })));
    const bars = new Map();
    let lastSize = -1;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.close();
      if (err) reject(err);
      else resolve([...bars.values()].sort((a, b) => a[0] - b[0]));
    };
    const timer = setTimeout(() => finish(bars.size ? null : new Error("timed out")), 90_000);

    ws.onopen = () => {
      send("set_auth_token", ["unauthorized_user_token"]);
      send("chart_create_session", ["cs", ""]);
      send("resolve_symbol", ["cs", "sym", `=${JSON.stringify({ symbol: ticker, adjustment: "splits", session: "extended" })}`]);
      send("create_series", ["cs", "s", "s1", "sym", "1", 5000, ""]);
    };
    ws.onerror = (e) => finish(new Error(e.message || "websocket error"));
    ws.onclose = () => finish(bars.size ? null : new Error("connection closed before any data"));
    ws.onmessage = (ev) => {
      for (const part of String(ev.data).split(/~m~\d+~m~/).filter(Boolean)) {
        // nhịp tim: gửi trả nguyên văn, không thì server cắt kết nối
        if (part.startsWith("~h~")) {
          ws.send(frame(part));
          continue;
        }
        let msg;
        try {
          msg = JSON.parse(part);
        } catch {
          continue;
        }
        // lỗi lúc xin thêm nến cũ (đã có nến) thì giữ phần đã nhận; lỗi ngay từ đầu (sai mã…) thì báo
        if (/error/.test(msg.m ?? "")) return finish(bars.size ? null : new Error(`${msg.m}: ${JSON.stringify(msg.p).slice(0, 200)}`));
        if (msg.m === "timescale_update" || msg.m === "du") {
          for (const b of msg.p[1]?.s?.s ?? []) bars.set(b.v[0], [b.v[0], b.v[1], b.v[2], b.v[3], b.v[4], b.v[5] ?? 0]);
        }
        // mỗi lần trả xong một đợt thì xin thêm nến cũ hơn, tới khi không thêm được cây nào
        if (msg.m === "series_completed") {
          if (bars.size === lastSize) return finish();
          lastSize = bars.size;
          send("request_more_data", ["cs", "s", 5000]);
        }
      }
    };
  });
}

const csvDir = path.join(HERE, "csv");
fs.mkdirSync(csvDir, { recursive: true });
const done = [];

for (const symbol of symbols) {
  const ticker = TICKERS[symbol];
  if (!ticker) {
    console.error(`Unknown symbol ${symbol}. Choose from: ${Object.keys(TICKERS).join(", ")}`);
    continue;
  }
  process.stdout.write(`== ${symbol} (${ticker}) downloading... `);
  let fresh;
  try {
    fresh = await fetchBars(ticker);
  } catch (e) {
    console.log(`ERROR: ${e.message} (run the script again to retry)`);
    continue;
  }
  // bỏ nến của phút đang chạy: chưa đóng, giá còn đổi
  const openMinute = Math.floor(Date.now() / 60000) * 60;
  fresh = fresh.filter((b) => b[0] < openMinute);
  if (!fresh.length) {
    console.log("no bars");
    continue;
  }
  console.log(`${fresh.length.toLocaleString()} bars, ${day(fresh[0][0] * 1000)} → ${day(fresh.at(-1)[0] * 1000)}`);

  // gộp với lịch sử đã có (csv, không có thì .bin), khoá là ms Unix như file csv của Dukascopy
  const csvFile = path.join(csvDir, `${symbol}.csv`);
  const rows = new Map();
  if (fs.existsSync(csvFile)) {
    for (const line of fs.readFileSync(csvFile, "utf8").split("\n").slice(1)) {
      if (line) rows.set(+line.slice(0, line.indexOf(",")), line);
    }
  } else {
    for (const r of readBundleRows(symbol)) rows.set(r[0], r.join(","));
  }
  const before = rows.size;
  for (const b of fresh) rows.set(b[0] * 1000, [b[0] * 1000, ...b.slice(1)].join(","));
  const keys = [...rows.keys()].sort((a, b) => a - b);
  fs.writeFileSync(csvFile, `time,open,high,low,close,volume\n${keys.map((k) => rows.get(k)).join("\n")}\n`);
  console.log(`  => ${csvFile}: ${keys.length.toLocaleString()} bars (${(keys.length - before).toLocaleString()} new), ${day(keys[0])} → ${day(keys.at(-1))}`);
  done.push(symbol);
}

function day(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

if (done.length) {
  console.log("\nPacking for the /replay page...");
  // build.mjs không cắt NQ / ES theo ngày (KEEP_ALL), nên lịch sử gộp nhiều năm vẫn còn đủ
  buildBundle({ only: done });
  console.log("\nDone. Open /replay in the web app; the new data loads on the next visit.");
}
