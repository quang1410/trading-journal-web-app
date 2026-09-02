// Mọi trường TIỀN là chuỗi. Backend marshal decimal.Decimal ra chuỗi JSON
// chính vì float làm mất chữ số (0.29 * 100 ra 28.999999999999996); khai
// `number` ở đây là ném đi điều đó ngay tại ranh giới.
//
// Các trường KHÔNG phải tiền — stt, win_loss, streak_sign, score_*, page, size,
// total — là number bình thường.

export type Trade = {
  id: number;
  account_id: number;
  stt: number;
  entered_at: string; // ISO UTC

  symbol: string;
  direction: string;
  entry: string | null;
  exit: string | null;
  volume: string | null;
  profit: string;
  profit_theory: string | null;
  fee: string;

  setup: string;
  timeframe: string;
  entry_quality: string;
  in_trade_quality: string;
  exit_quality: string;
  psychology: string;
  notes: string;

  net: string;
  win_loss: number;
  streak_sign: number;

  score_entry: number;
  score_in_trade: number;
  score_exit: number;
  score_psych: number;
  score_total: number | null; // null = chưa đánh giá, KHÔNG phải 0 điểm
  trade_class: string;

  day: string;
  week: string;
  week_sort: string;
  month: string;
  weekday: string;

  cum_by_trade: string;
  cum_by_day: string;
  cum_theory: string;
  running_peak: string;
  drawdown: string;
};

// Lệnh trong thùng rác — CHỈ trường input.
//
// Không có trường suy diễn, và đó là chủ ý của backend: lệnh đã xoá không nằm
// trong dãy lũy kế, nên cum_by_trade hay drawdown của nó không có nghĩa gì.
// Số 0 ở đó sẽ trông như một con số thật.
export type DeletedTrade = {
  id: number;
  account_id: number;
  stt: number;
  entered_at: string;
  symbol: string;
  direction: string;
  profit: string;
  fee: string;
  setup: string;
  notes: string;
};

// Hai danh sách giá trị người dùng đã từng nhập, để ô lọc "mã sản phẩm" và
// "setup" cho chọn thay vì bắt gõ. Backend luôn trả mảng, không bao giờ null.
export type TradeFacets = {
  symbols: string[];
  setups: string[];
};

export type TradePage = {
  items: Trade[];
  page: number;
  size: number;
  total: number;
};

// 16 trường của form. Không có `account_code` (suy ra từ account đang chọn)
// và không có `stt` (backend cấp — CLAUDE.md quy tắc 7).
export type TradeCreate = {
  entered_at: string;
  symbol: string;
  direction: string;
  entry: string | null;
  exit: string | null;
  volume: string | null;
  profit: string;
  profit_theory: string | null;
  fee: string;
  setup: string;
  timeframe: string;
  entry_quality: string;
  in_trade_quality: string;
  exit_quality: string;
  psychology: string;
  notes: string;
};

// Ánh xạ 1-1 vào service.Tri[T] của backend, và không phải tình cờ:
//
//   khoá vắng (hoặc undefined, bị JSON.stringify bỏ) -> Set=false, không đổi
//   entry: null                                      -> Set=true Value=nil, xoá
//   entry: "2048.5"                                  -> Set=true Value=&v, đặt
//
// Năm trường BẮT BUỘC được kiểu canh giúp: TradeCreate khai `symbol: string`
// chứ không `string | null`, nên gán `symbol: null` là lỗi biên dịch. Backend
// trả 400 cho trường hợp đó, và ở đây nó không đi tới được lúc chạy.
export type TradePatch = Partial<TradeCreate>;

// Ánh xạ 1-1 từ statsDTO. Các trường `| null` là con trỏ bên Go: KHÔNG tính
// được, chứ không phải bằng 0. Chưa có lệnh thua thì profit_factor là null;
// hiển thị 0 sẽ đọc ra là "thua sạch", ngược hẳn sự thật.
export type Stats = {
  total_win: string;
  total_loss: string;
  net_profit: string;
  total_fees: string;

  net_return_pct: string | null;
  profit_factor: string | null;

  win_count: number;
  loss_count: number;
  total_trades: number;
  win_pct: string | null;

  ave_win: string | null;
  ave_loss: string | null;

  biggest_winner: string | null;
  biggest_loser: string | null;

  one_r: string;
  biggest_r_win: string | null;
  biggest_r_loss: string | null;
  rr_actual: string | null;

  expectancy: string | null;

  max_drawdown: string;
  max_dd_pct: string | null;
  recovery_factor: string | null;

  current_balance: string;
  /** Σnạp − Σrút. Cùng current_balance, KHÔNG chịu bộ lọc. */
  net_cash_flow: string;
};
