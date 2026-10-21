import { fmtLocal, toLocal, type Zone } from "./time";
import type { Trade } from "./trading";

const label = (name: string) => name.replace(/_m1$/i, "");

/** Danh sách lệnh của phiên ra CSV (header tiếng Anh, giờ theo múi giờ đang xem). */
export function tradesCsv(trades: Trade[], zone: Zone): string {
  const rows: (string | number)[][] = [["#", "symbol", "side", "contract", "qty", "entry_time", "entry", "exit_time", "exit", "points", "pnl_usd", "r", "reason"]];
  trades.forEach((t, k) =>
    rows.push([
      k + 1, label(t.sym), t.side > 0 ? "long" : "short", t.contract, t.qty, fmtLocal(toLocal(t.t0, zone)), t.entry.toFixed(2),
      fmtLocal(toLocal(t.t1, zone)), t.exit.toFixed(2), t.pts.toFixed(2), t.pnl.toFixed(2), t.r == null ? "" : t.r.toFixed(3), t.reason,
    ]),
  );
  return rows.map((r) => r.join(",")).join("\n");
}

export const symbolLabel = label;
