import { toPlot } from "@/lib/decimal";
import { PROFIT_COLOR, LOSS_COLOR, colorBySign } from "./palette";
import type { DayStat, HoldBucket, Pivot, RBucket, Radar, TheoryPoint, WeekdayStat } from "./types";

/**
 * Chỗ DUY NHẤT trong dự án đổi tiền từ chuỗi sang số.
 *
 * Mọi hàng trả về mang CẢ HAI dạng của cùng một con số:
 *
 *   net    (number) -> Recharts đặt pixel
 *   netGoc (string) -> tooltip và nhãn, đi qua formatMoney
 *
 * Giữ cả hai chứ không đổi ngược lại từ số: `String(118.5)` cho ra "118.5",
 * mất số 0 cuối mà backend cố ý gửi. Chuỗi gốc là thứ duy nhất còn đúng.
 *
 * KHÔNG sắp xếp lại và KHÔNG cắt bớt: backend đã quyết cả hai (spec 4a §3.1).
 * Thứ tự của by_timeframe là M1->W chứ không theo số lệnh, nên một lần .sort()
 * ở đây là một lần làm sai mà biểu đồ vẫn trông hợp lý.
 */

export type PivotCol = {
  key: string;
  net: number;
  netGoc: string;
  color: string;
  count: number;
  winRateGoc: string;
};

export type WeekdayCol = {
  key: string;
  profit: number;
  profitOrigin: string;
  loss: number;
  lossOrigin: string;
  count: number;
};

export type DayPoint = {
  day: string;
  net: number;
  netGoc: string;
  color: string;
  cum: number;
  cumGoc: string;
  count: number;
};

export function preparePivot(rows: Pivot[]): PivotCol[] {
  return rows.map((r) => ({
    key: r.key,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    color: colorBySign(r.sum_net),
    count: r.count,
    // Giữ nguyên dạng phân số. formatPercent sẽ nhân 100 lúc hiển thị; nhân ở
    // đây nữa là nhân hai lần.
    winRateGoc: r.win_rate,
  }));
}

export function prepareWeekday(rows: WeekdayStat[]): WeekdayCol[] {
  return rows.map((r) => ({
    key: r.key,
    profit: toPlot(r.profit_positive),
    profitOrigin: r.profit_positive,
    loss: toPlot(r.profit_negative),
    lossOrigin: r.profit_negative,
    count: r.count,
  }));
}

export function prepareDaily(rows: DayStat[]): DayPoint[] {
  return rows.map((r) => ({
    day: r.day,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    color: colorBySign(r.sum_net),
    cum: toPlot(r.cum_by_day),
    cumGoc: r.cum_by_day,
    count: r.count,
  }));
}

// Index 11 trở lên là phía LÃI ("0R to 1R" .. "Trên 20R"), dưới đó là phía LỖ
// ("Dưới -20R" .. "0R to -1R") — đúng 11 bucket mỗi bên, cố định theo thứ tự
// backend trả (plan §5.9, rdist.go:34-56). KHÔNG suy cực tính từ wins/losses:
// một lệnh net = 0 rơi vào bucket "0R to 1R" (bucketIndex của Go coi ratio = 0
// thuộc nửa mở [0,1)) nhưng KHÔNG được tính vào wins lẫn losses — bucket đó có
// thể có count > 0 mà wins = losses = 0, và suy màu từ hai con số đó sẽ sai
// đúng ở ranh giới. Vị trí trong mảng thì không bao giờ sai vì backend không
// bao giờ sắp lại thứ tự (bất biến số 6 của 4a).
const PROFIT_THRESHOLD = 11;

export type BucketCol = {
  label: string;
  count: number;
  wins: number;
  losses: number;
  color: string;
};

export function prepareRDist(rows: RBucket[]): BucketCol[] {
  return rows.map((r, i) => ({
    label: r.label,
    count: r.count,
    wins: r.wins,
    losses: r.losses,
    color: i >= PROFIT_THRESHOLD ? PROFIT_COLOR : LOSS_COLOR,
  }));
}

export type HoldCol = {
  label: string;
  count: number;
  wins: number;
  losses: number;
  /**
   * Số lệnh HOÀ VỐN (net = 0) của bucket, suy ra từ count − wins − losses.
   *
   * Backend cố tình không xếp lệnh hoà vào bên nào (holddist.go), nên nếu
   * biểu đồ chỉ vẽ wins/losses thì một bucket toàn lệnh hoà sẽ có count > 0
   * mà cả hai cột đều cao 0 — biểu đồ nói "không có lệnh nào" trong khi ba ô
   * KPI thời gian giữ ngay phía trên hiện số thật. Tầng thứ ba này giữ cho
   * tổng chiều cao cột luôn bằng count, nên hai chỗ không bao giờ nói ngược
   * nhau.
   */
  evens: number;
  /**
   * Recharts chỉ vẽ được number, nên tiền phải qua toPlot() ở ĐÚNG một chỗ —
   * ngay tại ranh giới vào biểu đồ. Ép kiểu trần bị cổng styleguard cấm trên
   * toàn bộ src của mình (xem src/test/styleguard.test.ts). Mọi chỗ khác giữ
   * chuỗi theo quy tắc 1. Sai số dấu phẩy động ở đây vô hại: nó chỉ quyết
   * định chiều cao một cột nếu có ngày dùng tới, còn con số người dùng đọc
   * lấy từ sumNetGoc qua tooltip và bảng.
   */
  sumNet: number;
  // Chuỗi gốc — dùng cho tooltip/bảng, cùng lý do netGoc ở PivotCol: qua
  // toPlot rồi String() lại sẽ mất số 0 cuối mà backend cố ý gửi.
  sumNetGoc: string;
};

export function prepareHoldDist(rows: HoldBucket[]): HoldCol[] {
  return rows.map((r) => ({
    label: r.label,
    count: r.count,
    wins: r.wins,
    losses: r.losses,
    // Math.max chặn số âm nếu backend có lúc gửi count < wins + losses: một
    // cột âm làm Recharts vẽ ngược xuống dưới trục, trông như lỗi render chứ
    // không như lỗi dữ liệu.
    evens: Math.max(0, r.count - r.wins - r.losses),
    sumNet: toPlot(r.sum_net),
    sumNetGoc: r.sum_net,
  }));
}

export type RadarChartPoint = {
  axis: "entry" | "inTrade" | "exit" | "psych";
  score: number;
  rawScore: string | null;
};

export function prepareRadar(r: Radar): RadarChartPoint[] {
  const pair: [RadarChartPoint["axis"], string | null][] = [
    ["entry", r.avg_entry],
    ["inTrade", r.avg_in_trade],
    ["exit", r.avg_exit],
    ["psych", r.avg_psych],
  ];
  return pair.map(([axis, v]) => ({
    axis,
    // Trục null (chưa chấm) vẽ TẠI GỐC — radar bốn trục không vẽ được với ba
    // đỉnh, hình học ép buộc phải có con số. rawScore null đi kèm để phân biệt
    // với "được 0 điểm" (spec 4b §6).
    score: v === null ? 0 : toPlot(v),
    rawScore: v,
  }));
}

export type TheoryChartPoint = {
  stt: number;
  actual: number;
  actualOrigin: string;
  theory: number;
  theoryOrigin: string;
};

export function prepareTheory(rows: TheoryPoint[]): TheoryChartPoint[] {
  return rows.map((r) => ({
    stt: r.stt,
    actual: toPlot(r.cum_by_trade),
    actualOrigin: r.cum_by_trade,
    theory: toPlot(r.cum_theory),
    theoryOrigin: r.cum_theory,
  }));
}

/** Một điểm trên sparkline của thẻ kỳ. */
export type PeriodChartPoint = {
  stt: number;
  cum: number;
  cumOrigin: string;
};

/**
 * Điểm vẽ sparkline của một thẻ kỳ.
 *
 * Nằm ở ĐÂY chứ không trong PeriodSparkline vì cùng lý do mọi hàm prepare khác
 * nằm đây: toPlot ném đi độ chính xác, nên ranh giới chuỗi→số phải là một chỗ
 * có tên, không rải vào component (spec 4a §2.3, và cổng canh ở
 * src/test/styleguard.test.ts).
 *
 * Giữ cả `cumOrigin`: chuỗi gốc là thứ duy nhất còn đúng nếu sau này thẻ muốn
 * hiện con số chứ không chỉ hình dạng.
 *
 * KHÔNG rebase về 0 tại đầu kỳ — cum_by_trade là giá trị toàn cục, và đường
 * trên thẻ là một ĐOẠN của đường equity thật (quy tắc 8 của CLAUDE.md).
 */
export function preparePeriodPoints(
  points: { stt: number; cum_by_trade: string }[],
): PeriodChartPoint[] {
  return points.map((p) => ({
    stt: p.stt,
    cum: toPlot(p.cum_by_trade),
    cumOrigin: p.cum_by_trade,
  }));
}

/**
 * Độ đậm 0..1 của dải màu mép trái, so với kỳ mạnh nhất đang hiện.
 *
 * So với kỳ mạnh nhất chứ không một mốc cố định: người đánh 20 US$ một ngày và
 * người đánh 2000 US$ đều phải thấy được nhịp của chính mình.
 *
 * Giá trị trả về CHỈ nuôi một độ mờ — không con số nào từ phép đổi này hiện ra
 * cho người dùng đọc, nên mất chữ số cuối của một decimal lớn không ảnh hưởng
 * gì. Mọi số HIỂN THỊ vẫn đi qua formatMoney trên chuỗi gốc (quy tắc 1).
 */
export function periodIntensities(netProfits: string[]): number[] {
  const magnitudes = netProfits.map((v) => Math.abs(toPlot(v)));
  const peak = Math.max(...magnitudes, 1);
  return magnitudes.map((m) => m / peak);
}

/**
 * Vị trí 0..1 của chấm "lãi trung bình" trên dải biên độ của thẻ kỳ.
 *
 * 0 là đầu mút lệnh lỗ sâu nhất, 1 là đầu mút lệnh lãi cao nhất. Trả null khi
 * không đặt được chấm: thiếu aveWin, hoặc hai đầu mút trùng nhau (kỳ chỉ có
 * một lệnh) — chia cho khoảng bằng 0 sẽ ra Infinity và đẩy chấm ra khỏi dải.
 *
 * Kẹp vào [0,1]: aveWin về lý thuyết luôn nằm giữa hai cực, nhưng một bộ lọc
 * lạ hay dữ liệu nhập tay lệch có thể phá giả định đó, và một chấm ở left:
 * -40% là một chấm nằm ngoài thẻ.
 *
 * Như periodIntensities, con số này CHỈ nuôi một vị trí CSS — không chữ số nào
 * từ đây hiện ra cho người dùng đọc. Hai đầu mút hiển thị vẫn đi qua formatMoney
 * trên chuỗi gốc (quy tắc 1).
 */
export function periodRangeMarker(
  biggestLoser: string,
  biggestWinner: string,
  aveWin: string | null,
): number | null {
  if (aveWin === null) return null;
  const lo = toPlot(biggestLoser);
  const hi = toPlot(biggestWinner);
  const span = hi - lo;
  if (span <= 0) return null;
  const at = (toPlot(aveWin) - lo) / span;
  return Math.min(1, Math.max(0, at));
}

/**
 * Vị trí 0..1 của mốc KHÔNG (hoà vốn) trên dải biên độ, hoặc null khi mốc đó
 * nằm ngoài dải.
 *
 * Dải đi từ lệnh thấp nhất tới lệnh cao nhất, mà hai đầu ấy không nhất thiết
 * trái dấu: một ngày toàn lệnh thắng có dải +12 → +245, nằm trọn bên dương.
 * Vẽ nửa đỏ cho một dải như thế là khẳng định một khoản lỗ không tồn tại.
 *
 * Trả null cho dải cùng dấu để chỗ gọi tô MỘT màu theo dấu chung, thay vì tự
 * đoán một điểm giữa.
 */
export function periodZeroStop(biggestLoser: string, biggestWinner: string): number | null {
  const lo = toPlot(biggestLoser);
  const hi = toPlot(biggestWinner);
  if (lo >= 0 || hi <= 0) return null;
  const span = hi - lo;
  if (span <= 0) return null;
  return -lo / span;
}
