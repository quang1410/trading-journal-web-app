import { toLocal, type Zone } from "./time";
import { CONTRACTS, type Trade } from "./trading";

const label = (name: string) => name.replace(/_m1$/i, "");

/** "YYYY-MM-DDTHH:MM:SS±HH:MM" (RFC 3339): giờ của múi đang xem, kèm offset để đọc lại không lệch. */
function stamp(t: number, zone: Zone): string {
  const lt = toLocal(t, zone);
  const off = (lt - t) / 60;
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${new Date(lt * 1000).toISOString().slice(0, 19)}${off < 0 ? "-" : "+"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/**
 * Danh sách lệnh của phiên ra CSV theo đúng định dạng nhập của trang Nhập/Xuất — header như file
 * Excel gốc (backend/internal/csvformat), để xuất ở đây rồi nhập vào nhật ký được ngay.
 *
 * - Day / Ngày đóng: giờ của múi đang xem, có offset — account ở múi khác vẫn đọc đúng thời điểm.
 * - Profit là lãi GỘP, Phí tách riêng (nhật ký tính net = Profit − Phí); `pnl` của replay đã trừ
 *   phí rồi, nên phí = lãi gộp − pnl.
 * - Contract, Points, R, Exit reason chỉ replay mới có: importer không biết tên các cột này nên bỏ qua.
 */
export function tradesCsv(trades: Trade[], zone: Zone): string {
  const rows: (string | number)[][] = [
    ["Day", "Ngày đóng", "Symbol", "Long/ Short", "Entry", "Exit", "Volume", "Profit", "Phí", "Contract", "Points", "R", "Exit reason"],
  ];
  for (const t of trades) {
    const gross = t.pts * CONTRACTS[t.contract] * t.qty;
    rows.push([
      stamp(t.t0, zone), stamp(t.t1, zone), label(t.sym), t.side > 0 ? "Long" : "Short", t.entry.toFixed(2), t.exit.toFixed(2), t.qty,
      gross.toFixed(2), (gross - t.pnl).toFixed(2), t.contract, t.pts.toFixed(2), t.r == null ? "" : t.r.toFixed(3), t.reason,
    ]);
  }
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export const symbolLabel = label;
