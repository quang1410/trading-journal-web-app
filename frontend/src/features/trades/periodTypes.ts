/**
 * Kiểu của tab Ngày/Tuần.
 *
 * Tiền luôn là CHUỖI ở phía frontend, không phải number: backend gửi decimal
 * dạng chuỗi để không mất chữ số, và ép sang number là đúng chỗ mất nó — quy
 * tắc 1 của CLAUDE.md nhìn từ phía này. Muốn vẽ biểu đồ thì đi qua một hàm
 * prepare của features/dashboard/prepare.ts — đó là ranh giới chuỗi→số duy
 * nhất của dự án, và có cổng canh trong src/test/styleguard.test.ts.
 */

import type { Stats } from "./types";

export type PeriodKind = "day" | "week";

export type PeriodPoint = {
  stt: number;
  cum_by_trade: string;
};

/**
 * Các chỉ số hiện trên thẻ: một TẬP CON của Stats, chọn bằng Pick chứ không
 * chép tay — đổi kiểu một trường ở Stats thì thẻ kỳ đổi theo, không trôi lệch.
 * Tên trường khớp ĐÚNG json tag của periodKpiDTO bên backend.
 *
 * KHÔNG có current_balance và net_cash_flow: số dư là một mốc tại một thời
 * điểm, không phải đại lượng của một khoảng — backend cũng cắt chúng đi.
 *
 * Trường `| null` nghĩa là "không tính được" — chia cho 0, hoặc chưa đủ dữ
 * liệu. Thẻ hiện "—" cho chúng, vì 0 và "không xác định" khác nhau.
 */
export type PeriodKpi = Pick<
  Stats,
  | "total_win"
  | "total_loss"
  | "net_profit"
  | "total_fees"
  | "profit_factor"
  | "win_count"
  | "loss_count"
  | "total_trades"
  | "win_pct"
  | "ave_win"
  | "ave_loss"
  | "biggest_winner"
  | "biggest_loser"
  | "expectancy"
  | "avg_hold_seconds"
  | "max_drawdown"
>;

export type PeriodStat = {
  key: string;
  start: string;
  end: string;
  volume: string;
  points: PeriodPoint[];
  kpi: PeriodKpi;
};

export type PeriodNote = {
  period: PeriodKind;
  period_key: string;
  body_html: string;
  updated_at: string;
};
