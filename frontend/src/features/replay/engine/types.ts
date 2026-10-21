/**
 * Kiểu dữ liệu của replay.
 *
 * Replay là mô phỏng chạy hoàn toàn trong trình duyệt: giá, P&L và thống kê ở đây là số thực
 * (float) của data CFD, KHÔNG phải tiền thật của sổ nhật ký và không bao giờ gửi lên backend.
 * Quy tắc "tiền là decimal" của CLAUDE.md áp cho tiền của tài khoản; ở đây không có tiền nào như vậy.
 */

/** Nến 1 phút của một mã, xếp theo thời gian tăng dần. T là giây UTC. */
export interface Bars {
  n: number;
  T: Float64Array;
  O: Float64Array;
  H: Float64Array;
  L: Float64Array;
  C: Float64Array;
  V: Float64Array;
}

/** Một mã đang mở trong phiên. LT = giờ local của T; cur = nến 1m cuối cùng đã hiện (-1 = chưa có). */
export interface Dataset extends Bars {
  name: string;
  LT: Float64Array;
  cur: number;
}

/** Nến của chart (khung bất kỳ), time là giờ local mở nến (giây) như lightweight-charts nhận. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Side = 1 | -1;
