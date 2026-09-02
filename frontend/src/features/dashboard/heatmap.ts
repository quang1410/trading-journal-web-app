import { addDecimal, compareDecimal } from "@/lib/decimal";
import type { HeatmapMonth } from "./types";

/**
 * Dựng lưới lịch P&L từ dữ liệu heatmap của backend.
 *
 * KHÔNG dùng toPlot: mọi so sánh và cộng dồn đi qua compareDecimal/addDecimal
 * trên chuỗi. File này không nạp Recharts, không cần toạ độ pixel, nên không
 * có lý do đụng tới ranh giới chuỗi->số (sửa spec §5.2 — bản spec dự đoán
 * ngược).
 *
 * Bản lưới liên tục kiểu GitHub (prepareHeatmap cũ) đã bỏ cùng HeatmapChart:
 * ô 11px không chứa nổi con số, mà con số mới là thứ người ta mở lịch để đọc.
 */

function abs(v: string): string {
  return compareDecimal(v, "0") < 0 ? v.replace(/^-/, "") : v;
}

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function themNgay(d: Date, dayCount: number): Date {
  const ket = new Date(d);
  ket.setUTCDate(ket.getUTCDate() + dayCount);
  return ket;
}

// ── Lịch tháng ────────────────────────────────────────────────────────────
//
// Khác hẳn prepareHeatmap ở trên: nơi đó gộp mọi tháng thành MỘT dải liên tục
// kiểu GitHub để thấy nhịp cả năm, ở đây dựng đúng MỘT tháng dương lịch, ô đủ
// lớn để chứa con số. Hai cách đọc khác nhau nên giữ hai hàm, không ép một
// hàm phục vụ cả hai.

export type DayKind = "lai" | "lo" | "hoa" | "khong";

export type DayCell = {
  /** null khi ô nằm ngoài tháng — chỗ đệm đầu/cuối lưới, không phải ngày thật. */
  day: string | null;
  inMonth: boolean;
  /** null khi ngoài tháng hoặc ngày không có lệnh nào. */
  net: string | null;
  count: number;
  kind: DayKind;
  /** Bậc chiều cao thanh cường độ, 1..5. 0 = không vẽ thanh (hoà/không lệnh). */
  step: number;
  /**
   * Hạng ĐỘ LỚN trong tháng, 1 = lớn nhất. 0 khi không xếp hạng được (ngày
   * nghỉ, ngày hoà) — chúng không có độ lớn để so.
   *
   * Khác `step`: `step` gom về năm bậc để vẽ, `rank` là vị trí chính xác để
   * NÓI THÀNH LỜI trong tooltip. Năm ngày cùng bậc 5 thì thanh cao bằng nhau,
   * nhưng chỉ một ngày là "lớn nhất tháng".
   */
  rank: number;
  /** Tổng số ngày được xếp hạng — mẫu số của `rank`. */
  rankOf: number;
};

export type WeekRow = {
  /** Số thứ tự tuần TRONG THÁNG, bắt đầu từ 1 — nhãn của cột kết quả. */
  index: number;
  day: DayCell[];
  net: string;
};

export type MonthGrid = {
  weeks: WeekRow[];
  totalNet: string;
  tradingDays: number;
};

/** "07/2026" -> { y: 2026, m: 7 }. Định dạng do backend đặt (aggregate.Heatmap). */
function parseMonth(label: string): { y: number; m: number } {
  const [m, y] = label.split("/");
  return { y: +y, m: +m };
}

/**
 * Bậc cường độ theo THỨ HẠNG, không theo tỷ lệ.
 *
 * Chia |net| cho |net| lớn nhất sẽ là một phép chia trên tiền — đúng thứ quy
 * tắc 1 của CLAUDE.md và cổng canh styleguard chặn. Xếp hạng thì chỉ cần
 * compareDecimal, và trên màn hình lại đọc tốt hơn: năm bậc rời rạc so sánh
 * được bằng mắt, còn chiều cao liên tục ở 11px thì không.
 *
 * Chia đều theo ngũ phân vị của DÃY ĐÃ SẮP. Mọi giá trị bằng nhau thì cùng
 * rơi vào một bậc, vì thứ hạng của chúng bằng nhau.
 */
function stepByRank(magnitude: string, sorted: string[]): number {
  if (sorted.length === 0) return 0;
  // Thứ hạng = số phần tử NHỎ HƠN hẳn nó. Giá trị bằng nhau -> cùng thứ hạng,
  // nên ba ngày cùng 100$ không bao giờ hiện ba chiều cao khác nhau.
  let rank = 0;
  for (const v of sorted) {
    if (compareDecimal(v, magnitude) < 0) rank++;
    else break;
  }

  // Chia trên THỨ HẠNG (số nguyên đếm được), không phải trên tiền.
  //
  // Mẫu số là (n - 1) chứ không phải n: ngày lớn nhất có rank = n - 1, và nó
  // phải chạm bậc 5 — với n = 4 thì rank 3 chia cho 4 mới ra bậc 4, tức ngày
  // lãi lớn nhất tháng lại không phải thanh cao nhất. n = 1 thì mẫu số 0 nên
  // trả thẳng bậc cao nhất: một ngày duy nhất vừa là lớn nhất vừa là nhỏ nhất.
  if (sorted.length === 1) return 5;
  const step = Math.floor((rank * 4) / (sorted.length - 1)) + 1;
  return step > 5 ? 5 : step;
}

/**
 * Hạng độ lớn, 1 = lớn nhất tháng.
 *
 * `sorted` tăng dần, nên hạng = số phần tử LỚN HƠN hẳn nó, cộng một. Giá trị
 * bằng nhau cùng hạng: hai ngày cùng 500$ đều là "lớn thứ 3", không phải một
 * cái thứ 3 và một cái thứ 4 — thứ tự giữa chúng là ngẫu nhiên theo thứ tự
 * mảng, mà tooltip thì không được nói một điều ngẫu nhiên như thể nó có nghĩa.
 */
function rankByMagnitude(magnitude: string, sorted: string[]): number {
  let lonHon = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (compareDecimal(sorted[i], magnitude) > 0) lonHon++;
    else break;
  }
  return lonHon + 1;
}

/**
 * Một tháng dương lịch thành lưới tuần x thứ, kèm tổng tháng và net từng tuần.
 *
 * Ngày trong tháng mà backend không gửi ô là ngày KHÔNG giao dịch — phải chế
 * ra, cùng bất biến với prepareHeatmap. Ngày sum_net = 0 nhưng count > 0 là
 * ngày HOÀ, khác hẳn: có vào lệnh, kết quả bằng không.
 */
export function prepareMonthGrid(month: HeatmapMonth): MonthGrid {
  const { y, m } = parseMonth(month.month);
  const byDate = new Map(month.cells.map((c) => [c.day, c]));

  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const lastDay = new Date(Date.UTC(y, m, 0)); // ngày 0 của tháng sau = ngày cuối tháng này
  const gridStart = themNgay(firstDay, -firstDay.getUTCDay());
  const gridEnd = themNgay(lastDay, 6 - lastDay.getUTCDay());

  // Ngũ phân vị tính trên ngày CÓ lãi/lỗ thật; ngày hoà không cạnh tranh bậc
  // vì nó không có thanh nào để so.
  const sortedMagnitude = month.cells
    .filter((c) => compareDecimal(c.sum_net, "0") !== 0)
    .map((c) => abs(c.sum_net))
    .sort(compareDecimal);

  const flat: DayCell[] = [];
  for (let d = gridStart; d.getTime() <= gridEnd.getTime(); d = themNgay(d, 1)) {
    const iso = isoUTC(d);
    if (d.getUTCMonth() !== m - 1 || d.getUTCFullYear() !== y) {
      flat.push({ day: null, inMonth: false, net: null, count: 0, kind: "khong", step: 0, rank: 0, rankOf: 0 });
      continue;
    }

    const o = byDate.get(iso);
    if (!o) {
      flat.push({ day: iso, inMonth: true, net: null, count: 0, kind: "khong", step: 0, rank: 0, rankOf: 0 });
      continue;
    }

    const sign = compareDecimal(o.sum_net, "0");
    const kind: DayKind = sign > 0 ? "lai" : sign < 0 ? "lo" : "hoa";
    flat.push({
      day: iso,
      inMonth: true,
      net: o.sum_net,
      count: o.count,
      kind,
      step: sign === 0 ? 0 : stepByRank(abs(o.sum_net), sortedMagnitude),
      // Ngày hoà không xếp hạng: nó không nằm trong sortedMagnitude nên mọi
      // hạng gán cho nó đều là bịa.
      rank: sign === 0 ? 0 : rankByMagnitude(abs(o.sum_net), sortedMagnitude),
      rankOf: sign === 0 ? 0 : sortedMagnitude.length,
    });
  }

  const weeks: WeekRow[] = [];
  for (let i = 0; i < flat.length; i += 7) {
    const day = flat.slice(i, i + 7);
    const net = day.reduce((sum, o) => (o.net === null ? sum : addDecimal(sum, o.net)), "0");
    weeks.push({ index: weeks.length + 1, day, net });
  }

  const totalNet = month.cells.reduce((sum, c) => addDecimal(sum, c.sum_net), "0");
  return { weeks, totalNet, tradingDays: month.cells.length };
}

/**
 * Nhãn tháng có dữ liệu, sắp theo THỜI GIAN.
 *
 * Sắp chuỗi thẳng sẽ ra "09/2025" sau "07/2026" vì so ký tự đầu — nút lật
 * tháng đi theo thứ tự đó sẽ nhảy loạn qua các năm.
 */
export function listMonths(months: HeatmapMonth[]): string[] {
  return months
    .map((x) => x.month)
    .sort((a, b) => {
      const A = parseMonth(a);
      const B = parseMonth(b);
      return A.y !== B.y ? A.y - B.y : A.m - B.m;
    });
}
