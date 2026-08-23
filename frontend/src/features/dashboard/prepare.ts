import { toPlot } from "@/lib/decimal";
import { MAU_LAI, MAU_LO, mauTheoDau } from "./palette";
import type { DayStat, Pivot, RBucket, Radar, TheoryPoint, WeekdayStat } from "./types";

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

export type CotPivot = {
  key: string;
  net: number;
  netGoc: string;
  mau: string;
  count: number;
  winRateGoc: string;
};

export type CotWeekday = {
  key: string;
  lai: number;
  laiGoc: string;
  lo: number;
  loGoc: string;
  count: number;
};

export type DiemNgay = {
  day: string;
  net: number;
  netGoc: string;
  mau: string;
  cum: number;
  cumGoc: string;
  count: number;
};

export function chuanBiPivot(rows: Pivot[]): CotPivot[] {
  return rows.map((r) => ({
    key: r.key,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    mau: mauTheoDau(r.sum_net),
    count: r.count,
    // Giữ nguyên dạng phân số. formatPercent sẽ nhân 100 lúc hiển thị; nhân ở
    // đây nữa là nhân hai lần.
    winRateGoc: r.win_rate,
  }));
}

export function chuanBiWeekday(rows: WeekdayStat[]): CotWeekday[] {
  return rows.map((r) => ({
    key: r.key,
    lai: toPlot(r.profit_positive),
    laiGoc: r.profit_positive,
    lo: toPlot(r.profit_negative),
    loGoc: r.profit_negative,
    count: r.count,
  }));
}

export function chuanBiNgay(rows: DayStat[]): DiemNgay[] {
  return rows.map((r) => ({
    day: r.day,
    net: toPlot(r.sum_net),
    netGoc: r.sum_net,
    mau: mauTheoDau(r.sum_net),
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
const NGUONG_LAI = 11;

export type CotBucket = {
  label: string;
  count: number;
  wins: number;
  losses: number;
  mau: string;
};

export function chuanBiRDist(rows: RBucket[]): CotBucket[] {
  return rows.map((r, i) => ({
    label: r.label,
    count: r.count,
    wins: r.wins,
    losses: r.losses,
    mau: i >= NGUONG_LAI ? MAU_LAI : MAU_LO,
  }));
}

export type DiemRadar = {
  truc: "entry" | "inTrade" | "exit" | "psych";
  diem: number;
  diemGoc: string | null;
};

export function chuanBiRadar(r: Radar): DiemRadar[] {
  const cap: [DiemRadar["truc"], string | null][] = [
    ["entry", r.avg_entry],
    ["inTrade", r.avg_in_trade],
    ["exit", r.avg_exit],
    ["psych", r.avg_psych],
  ];
  return cap.map(([truc, v]) => ({
    truc,
    // Trục null (chưa chấm) vẽ TẠI GỐC — radar bốn trục không vẽ được với ba
    // đỉnh, hình học ép buộc phải có con số. diemGoc null đi kèm để phân biệt
    // với "được 0 điểm" (spec 4b §6).
    diem: v === null ? 0 : toPlot(v),
    diemGoc: v,
  }));
}

export type DiemTheory = {
  stt: number;
  thucTe: number;
  thucTeGoc: string;
  lyThuyet: number;
  lyThuyetGoc: string;
};

export function chuanBiTheory(rows: TheoryPoint[]): DiemTheory[] {
  return rows.map((r) => ({
    stt: r.stt,
    thucTe: toPlot(r.cum_by_trade),
    thucTeGoc: r.cum_by_trade,
    lyThuyet: toPlot(r.cum_theory),
    lyThuyetGoc: r.cum_theory,
  }));
}
