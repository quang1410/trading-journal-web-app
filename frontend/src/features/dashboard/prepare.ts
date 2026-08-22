import { toPlot } from "@/lib/decimal";
import { mauTheoDau } from "./palette";
import type { DayStat, Pivot, WeekdayStat } from "./types";

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
