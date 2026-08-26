// Ánh xạ 1-1 từ aggregate.Charts. Hình dạng dưới đây chép từ
// backend/internal/httpapi/testdata/charts.golden.json — file mà backend dùng
// để ghim hợp đồng JSON — chứ không suy ra từ struct Go.
//
// Mọi trường TIỀN là chuỗi. Các trường KHÔNG phải tiền — count, win_count,
// wins, losses, stt, scored_count, hai *_streak — là number.
//
// Khai đủ cả 14 trường dù 4a chỉ vẽ bảy: chúng cùng về trong MỘT response, và
// khai thiếu thì 4b phải sửa lại kiểu thay vì chỉ thêm component.

export type Pivot = {
  key: string;
  count: number;
  win_count: number;
  sum_net: string;
  ave_net: string;
  // PHÂN SỐ 0..1, không phải phần trăm: "1" nghĩa là 100%.
  // Dán "%" thẳng vào đây cho ra "1%" — sai một trăm lần.
  win_rate: string;
};

export type WeekdayStat = Pivot & {
  profit_positive: string;
  profit_negative: string; // ÂM hoặc "0"
};

export type DayStat = {
  day: string; // "2026-06-09"
  count: number;
  sum_net: string;
  cum_by_day: string;
};

// Bốn kiểu dưới đây chưa dùng ở 4a — chúng thuộc 4b. Khai sẵn vì backend đã
// gửi chúng về trong cùng response.
export type HeatmapCell = { day: string; sum_net: string; count: number };
export type HeatmapMonth = { month: string; cells: HeatmapCell[] }; // month: "06/2026"
export type RBucket = { label: string; count: number; wins: number; losses: number };
export type ScoreSummary = { scored_count: number; avg_score_total: string | null };
export type Radar = {
  avg_entry: string | null;
  avg_in_trade: string | null;
  avg_exit: string | null;
  avg_psych: string | null;
};
export type TheoryPoint = { stt: number; cum_theory: string; cum_by_trade: string };

/** Khối "CHẤT LƯỢNG THỰC THI LỆNH". `planned_pct` null = chưa có lệnh nào, KHÁC 0%. */
export type ExecutionQuality = {
  planned_pct: string | null;
  no_setup_count: number;
  impulsive_count: number;
};

/** Một hàng phân bố loại lệnh. Backend LUÔN trả đủ 5 hàng, kể cả count = 0. */
export type ClassStat = { class: string; count: number; pct: string; sum_net: string };

/** Ba con số thắng/thua/hoà. Lệnh hoà tách riêng — xem §10 mục 2. */
export type WinLossSplit = { win_count: number; loss_count: number; even_count: number };

/** Ba tile tổng kết: điểm CUỐI của hai chuỗi theory_vs_actual, và hiệu của chúng. */
export type TheorySummary = { theory: string; actual: string; diff: string };

export type Charts = {
  by_setup: Pivot[];
  by_symbol: Pivot[];
  by_timeframe: Pivot[];
  by_direction: Pivot[];
  by_weekday: WeekdayStat[];
  by_week: Pivot[];
  by_day: DayStat[];

  heatmap: HeatmapMonth[];
  r_distribution: RBucket[];
  score: ScoreSummary;
  radar: Radar;
  theory_vs_actual: TheoryPoint[];

  execution: ExecutionQuality;
  by_trade_class: ClassStat[];
  win_loss: WinLossSplit;
  theory_summary: TheorySummary;

  // Hai con số này tính trên TOÀN BỘ lệnh của account, không phải trên tập đã
  // lọc: aggregate.All gọi Streaks(all) trong khi mười hai nhóm trên nhận
  // filtered (backend/internal/aggregate/charts.go:175). Đó là quy tắc 8 của
  // CLAUDE.md. Hệ quả trên màn hình: đổi bộ lọc thì mọi thứ khác đổi số, còn
  // hai con số này đứng yên — StreakBlock phải nói rõ điều đó.
  longest_win_streak: number;
  longest_loss_streak: number;
};
