import { readFileSync } from "node:fs";
import { fromRepo } from "@/test/paths";
import { tradesCsv } from "./csvExport";
import type { Trade } from "./trading";

// File mẫu dùng chung với test Go của importer (TestParseReplayExport): bên này khoá đầu ra của
// tradesCsv vào file, bên kia đọc chính file đó qua importer thật. Một bên lệch là một test đỏ —
// trước đây replay xuất header riêng (side, pnl_usd…) nên trang Nhập/Xuất báo thiếu cột.
const FIXTURE = fromRepo("backend/internal/importer/testdata/replay_export.csv");

const utc = (s: string) => Date.parse(s) / 1000;

const trades: Trade[] = [
  {
    // long 2 NQ (20 $/điểm), phí 4 $/HĐ khứ hồi: lãi gộp 10.5 × 20 × 2 = 420, phí 8, pnl (ròng) 412
    sym: "US100_m1", contract: "NQ", side: 1, qty: 2, entry: 21000.25, exit: 21010.75, i0: 0, i1: 17,
    t0: utc("2026-02-05T14:30:00Z"), t1: utc("2026-02-05T14:47:00Z"), pts: 10.5, pnl: 412, r: 1.03, reason: "tp",
  },
  {
    // short 1 ES (50 $/điểm), sau khi New York sang giờ mùa hè (08/03/2026): lỗ gộp 250, phí 4
    sym: "US500", contract: "ES", side: -1, qty: 1, entry: 6100.5, exit: 6105.5, i0: 0, i1: 20,
    t0: utc("2026-03-09T15:00:00Z"), t1: utc("2026-03-09T15:20:00Z"), pts: -5, pnl: -254, r: null, reason: "manual",
  },
];

test("exports the journal's import format (shared fixture with the Go importer)", () => {
  expect(tradesCsv(trades, "NY")).toBe(readFileSync(FIXTURE, "utf8"));
});

test("times carry the viewing zone's offset, so the account timezone cannot shift them", () => {
  const vn = tradesCsv(trades.slice(0, 1), "VN").split("\n")[1];
  expect(vn.startsWith("2026-02-05T21:30:00+07:00,2026-02-05T21:47:00+07:00,")).toBe(true);
  const z = tradesCsv(trades.slice(0, 1), "UTC").split("\n")[1];
  expect(z.startsWith("2026-02-05T14:30:00+00:00,2026-02-05T14:47:00+00:00,")).toBe(true);
});
