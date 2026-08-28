import { compareDecimal } from "@/lib/decimal";
import { BREAKEVEN_COLOR, NO_TRADE_COLOR, heatTier } from "./palette";
import type { HeatmapCell, HeatmapMonth } from "./types";

/**
 * Gấp `HeatmapMonth[]` — mỗi tháng một mảng ô, chỉ chứa ngày CÓ giao dịch —
 * thành MỘT lưới lịch liên tục kiểu GitHub: 7 hàng (CN..T7) x n cột tuần.
 *
 * Vẽ đúng theo cấu trúc backend gửi (mười hai lưới lịch xếp dọc, mỗi tháng
 * một cái) sẽ nuốt chửng phần còn lại của trang với một năm giao dịch. Gộp
 * thành một lưới liên tục là MỘT màn hình thấy hết nhịp giao dịch — vốn là
 * điều duy nhất lịch nhiệt làm tốt hơn biểu đồ cột (spec 4b §2.2).
 *
 * KHÔNG dùng toPlot: mọi so sánh độ lớn đi qua compareDecimal trên chuỗi.
 * heatmap.ts không nạp Recharts, không cần toạ độ pixel, nên không có lý do
 * đụng tới ranh giới chuỗi->số (sửa spec §5.2 — bản spec dự đoán ngược).
 */

export type CellState = "ngoaiDai" | "khongGiaoDich" | "hoa" | "coLenh";

export type OLich = {
  /** null CHỈ khi trangThai === "ngoaiDai" — không có ngày thật để gắn nhãn. */
  day: string | null;
  status: CellState;
  color: string;
  sumNetGoc: string | null;
  count: number;
};

export type LabelledMonth = { month: string; col: number };

export type LuoiNhiet = { col: OLich[][]; monthLabel: LabelledMonth[] };

function abs(v: string): string {
  return compareDecimal(v, "0") < 0 ? v.replace(/^-/, "") : v;
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function themNgay(d: Date, dayCount: number): Date {
  const ket = new Date(d);
  ket.setUTCDate(ket.getUTCDate() + dayCount);
  return ket;
}

/**
 * Ranh giới tam phân vị theo RANK, đóng dưới: một giá trị BẰNG ranh giới thì
 * thuộc bậc TRÊN. Với dưới ba giá trị khác nhau — kể cả đúng một hoặc mọi giá
 * trị bằng nhau — công thức tự nhiên cho bậc thấp rỗng và dồn hết lên bậc cao
 * nhất, không cần nhánh riêng (spec 4b §2.5).
 */
function tinhRanhGioi(magnitude: string[]): { b1: string; b2: string } {
  const sorted = [...magnitude].sort(compareDecimal);
  const n = sorted.length;
  return { b1: sorted[Math.floor(n / 3)] ?? "0", b2: sorted[Math.floor((2 * n) / 3)] ?? "0" };
}

function assignTier(m: string, b1: string, b2: string): 1 | 2 | 3 {
  if (compareDecimal(m, b1) < 0) return 1;
  if (compareDecimal(m, b2) < 0) return 2;
  return 3;
}

export function prepareHeatmap(months: HeatmapMonth[]): LuoiNhiet {
  const cells: HeatmapCell[] = months.flatMap((m) => m.cells);
  if (cells.length === 0) return { col: [], monthLabel: [] };

  const byDate = new Map(cells.map((c) => [c.day, c]));
  let minDate = cells[0].day;
  let maxDate = cells[0].day;
  for (const c of cells) {
    if (c.day < minDate) minDate = c.day;
    if (c.day > maxDate) maxDate = c.day;
  }

  // Tam phân vị chỉ tính trên ngày CÓ LỆNH và KHÁC HOÀ — hoà đã có màu riêng
  // (MAU_HOA), không cạnh tranh bậc với những ngày thật sự lãi/lỗ.
  const doLonCoLenh = cells
    .filter((c) => compareDecimal(c.sum_net, "0") !== 0)
    .map((c) => abs(c.sum_net));
  const { b1, b2 } = tinhRanhGioi(doLonCoLenh);

  const rangeStart = utcDate(minDate);
  const rangeEnd = utcDate(maxDate);
  const gridStart = themNgay(rangeStart, -rangeStart.getUTCDay());
  const gridEnd = themNgay(rangeEnd, 6 - rangeEnd.getUTCDay());

  const flatCells: OLich[] = [];
  for (let d = gridStart; d.getTime() <= gridEnd.getTime(); d = themNgay(d, 1)) {
    const iso = isoUTC(d);

    if (iso < minDate || iso > maxDate) {
      flatCells.push({ day: null, status: "ngoaiDai", color: "transparent", sumNetGoc: null, count: 0 });
      continue;
    }

    const o = byDate.get(iso);
    if (!o) {
      flatCells.push({
        day: iso,
        status: "khongGiaoDich",
        color: NO_TRADE_COLOR,
        sumNetGoc: null,
        count: 0,
      });
      continue;
    }

    if (compareDecimal(o.sum_net, "0") === 0) {
      flatCells.push({ day: iso, status: "hoa", color: BREAKEVEN_COLOR, sumNetGoc: o.sum_net, count: o.count });
      continue;
    }

    const profit = compareDecimal(o.sum_net, "0") > 0;
    const tier = assignTier(abs(o.sum_net), b1, b2);
    flatCells.push({
      day: iso,
      status: "coLenh",
      color: heatTier(tier, profit),
      sumNetGoc: o.sum_net,
      count: o.count,
    });
  }

  const col: OLich[][] = [];
  for (let i = 0; i < flatCells.length; i += 7) col.push(flatCells.slice(i, i + 7));

  const monthLabel: LabelledMonth[] = [];
  let prevMonth: string | null = null;
  col.forEach((c, idx) => {
    const firstDate = c.find((o) => o.day)?.day;
    if (!firstDate) return;
    const month = firstDate.slice(0, 7); // "YYYY-MM"
    if (month !== prevMonth) {
      const [y, m] = month.split("-");
      monthLabel.push({ month: `${m}/${y}`, col: idx });
      prevMonth = month;
    }
  });

  return { col, monthLabel };
}
