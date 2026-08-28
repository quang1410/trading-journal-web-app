import type { Charts } from "@/features/dashboard/types";
import type { Stats, Trade } from "@/features/trades/types";

/**
 * Một lệnh mẫu đủ 40 trường. Truyền `over` để đè trường nào cần.
 *
 * Các trường suy diễn ở đây là số ĐÃ TÍNH SẴN, không phải số đúng theo công
 * thức — test của frontend kiểm việc hiển thị, còn tính toán đã có Phase 1
 * và 3a lo. Test nào cần lũy kế đúng thì tự đặt cho khớp kịch bản của nó.
 *
 * File nằm dưới src/test/ là CÓ CHỦ Ý: nó chứa chuỗi enum tiếng Việt, mà cổng
 * styleguard cấm chuỗi đó trong src/features, src/components, src/app và
 * src/lib. Test buộc phải nói được ngôn ngữ của dữ liệu thật, nên chúng được
 * gom về đúng một chỗ là đây.
 */
export function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    account_id: 1,
    stt: 1,
    entered_at: "2026-06-09T14:30:00Z",

    symbol: "XAUUSD",
    direction: "Long",
    entry: "2048.50",
    exit: "2060.55",
    volume: "1.00",
    profit: "120.50",
    profit_theory: "150.00",
    fee: "2.00",

    setup: "Break-retest",
    timeframe: "H1",
    entry_quality: "Đúng kế hoạch",
    in_trade_quality: "Tuân thủ kế hoạch",
    exit_quality: "Chạm Chốt lời",
    psychology: "Không lỗi",
    notes: "chờ retest H1",

    net: "118.50",
    win_loss: 1,
    streak_sign: 1,

    score_entry: 30,
    score_in_trade: 25,
    score_exit: 20,
    score_psych: 10,
    score_total: 85,
    trade_class: "Đúng kế hoạch",

    day: "2026-06-09",
    week: "Tuần 24",
    week_sort: "2026-W24",
    month: "2026-06",
    weekday: "Tue",

    cum_by_trade: "118.50",
    cum_by_day: "118.50",
    cum_theory: "150.00",
    running_peak: "118.50",
    drawdown: "0",
    ...over,
  };
}

/** KPI mẫu đủ 24 trường. Mặc định là một tập có lệnh, không phải tập rỗng. */
export function makeStats(over: Partial<Stats> = {}): Stats {
  return {
    total_win: "300",
    total_loss: "-100",
    net_profit: "200",
    total_fees: "5",

    // TỶ LỆ dạng PHÂN SỐ, đúng như backend trả: metrics.KPI tính
    // net_profit/vốn và win_count/total_trades rồi gửi thẳng thương đó đi.
    // Đặt "66.67" ở đây từng làm test xanh trong khi màn hình thật hiện
    // "0,4375%" — fixture nói một ngôn ngữ khác với dữ liệu thật.
    net_return_pct: "0.02",
    profit_factor: "3",

    win_count: 2,
    loss_count: 1,
    total_trades: 3,
    win_pct: "0.6667",

    ave_win: "150",
    ave_loss: "-100",

    biggest_winner: "200",
    biggest_loser: "-100",

    one_r: "100",
    biggest_r_win: "2",
    biggest_r_loss: "-1",
    rr_actual: "1.5",

    expectancy: "66.67",

    max_drawdown: "100",
    max_dd_pct: "-0.01",
    recovery_factor: "2",

    current_balance: "10200",
    net_cash_flow: "0",
    ...over,
  };
}

/**
 * Charts mẫu, lấy số thẳng từ backend/internal/httpapi/testdata/charts.golden.json.
 *
 * Dùng đúng file mà backend đã ghim nghĩa là hai bên không thể trôi lệch trong
 * im lặng: đổi hình dạng JSON bên Go làm đỏ test bên này.
 *
 * Chú ý hai chỗ cố ý "trông sai":
 *  - by_timeframe có M15 TRƯỚC H1, dù H1 đứng trước theo bảng chữ cái. Backend
 *    sắp theo thứ tự M1->W của domain.Timeframes.
 *  - by_weekday đủ bảy ngày kể cả ngày count = 0.
 */
export function makeCharts(over: Partial<Charts> = {}): Charts {
  const p = (key: string, sum: string, count = 1, win = 0, rate = "0") => ({
    key,
    count,
    win_count: win,
    sum_net: sum,
    ave_net: sum,
    win_rate: rate,
  });
  const wd = (key: string, pos: string, neg: string, count: number) => ({
    ...p(key, "0", count),
    profit_positive: pos,
    profit_negative: neg,
  });

  return {
    by_setup: [p("Breakout", "98", 1, 1, "1"), p("Pullback", "-51")],
    by_symbol: [p("EURUSD", "-51"), p("XAUUSD", "98", 1, 1, "1")],
    by_timeframe: [p("M15", "-51"), p("H1", "98", 1, 1, "1")],
    by_direction: [p("Long", "98", 1, 1, "1"), p("Short", "-51")],
    by_weekday: [
      wd("Mon", "0", "0", 0),
      wd("Tue", "98", "0", 1),
      wd("Wed", "0", "-51", 1),
      wd("Thu", "0", "0", 0),
      wd("Fri", "0", "0", 0),
      wd("Sat", "0", "0", 0),
      wd("Sun", "0", "0", 0),
    ],
    by_week: [p("W24", "47", 2, 1, "0.5")],
    by_day: [
      { day: "2026-06-09", count: 1, sum_net: "98", cum_by_day: "98" },
      { day: "2026-06-10", count: 1, sum_net: "-51", cum_by_day: "47" },
    ],

    heatmap: [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-09", sum_net: "98", count: 1 },
          { day: "2026-06-10", sum_net: "-51", count: 1 },
        ],
      },
    ],
    // Đủ 22 bucket, đúng thứ tự backend trả (rdist.go:34-56) — hai bucket
    // giữa có dữ liệu khớp golden fixture, hai mươi bucket còn lại rỗng.
    // aggregate.RDistribution LUÔN trả đủ 22 dù rỗng, nên fixture giả cũng
    // phải vậy: một mảng ngắn hơn sẽ làm mọi test dựa trên taoCharts() không
    // còn phản ánh đúng hợp đồng thật.
    r_distribution: [
      { label: "Dưới -20R", count: 0, wins: 0, losses: 0 },
      { label: "-15R to -20R", count: 0, wins: 0, losses: 0 },
      { label: "-10R to -15R", count: 0, wins: 0, losses: 0 },
      { label: "-8R to -10R", count: 0, wins: 0, losses: 0 },
      { label: "-6R to -8R", count: 0, wins: 0, losses: 0 },
      { label: "-5R to -6R", count: 0, wins: 0, losses: 0 },
      { label: "-4R to -5R", count: 0, wins: 0, losses: 0 },
      { label: "-3R to -4R", count: 0, wins: 0, losses: 0 },
      { label: "-2R to -3R", count: 0, wins: 0, losses: 0 },
      { label: "-1R to -2R", count: 0, wins: 0, losses: 0 },
      { label: "0R to -1R", count: 1, wins: 0, losses: 1 },
      { label: "0R to 1R", count: 1, wins: 1, losses: 0 },
      { label: "1R to 2R", count: 0, wins: 0, losses: 0 },
      { label: "2R to 3R", count: 0, wins: 0, losses: 0 },
      { label: "3R to 4R", count: 0, wins: 0, losses: 0 },
      { label: "4R to 5R", count: 0, wins: 0, losses: 0 },
      { label: "5R to R6", count: 0, wins: 0, losses: 0 },
      { label: "6R to 8R", count: 0, wins: 0, losses: 0 },
      { label: "8R to 10R", count: 0, wins: 0, losses: 0 },
      { label: "10R to 15R", count: 0, wins: 0, losses: 0 },
      { label: "15R to 20R", count: 0, wins: 0, losses: 0 },
      { label: "Trên 20R", count: 0, wins: 0, losses: 0 },
    ],
    score: { scored_count: 2, avg_score_total: "62.5" },
    radar: {
      avg_entry: "12.5",
      avg_in_trade: "12.5",
      avg_exit: "25",
      avg_psych: "12.5",
    },
    theory_vs_actual: [
      { stt: 1, cum_theory: "120", cum_by_trade: "98" },
      { stt: 2, cum_theory: "80", cum_by_trade: "47" },
    ],

    // Bốn khối dưới đây chép từ charts.golden.json của backend, cùng fixture
    // hai lệnh: một "Đúng kế hoạch" net 98, một "Giao dịch trả thù" net -51.
    execution: { planned_pct: "0.5", no_setup_count: 0, impulsive_count: 1 },
    by_trade_class: [
      { class: "CHƯA ĐÁNH GIÁ", count: 0, pct: "0", sum_net: "0" },
      { class: "Đúng kế hoạch", count: 1, pct: "0.5", sum_net: "98" },
      { class: "Cần cải thiện", count: 0, pct: "0", sum_net: "0" },
      { class: "Bốc đồng / FOMO", count: 0, pct: "0", sum_net: "0" },
      { class: "Giao dịch trả thù", count: 1, pct: "0.5", sum_net: "-51" },
    ],
    win_loss: { win_count: 1, loss_count: 1, even_count: 0 },
    // Điểm cuối của theory_vs_actual ngay trên: 47 − 80 = −33.
    theory_summary: { theory: "80", actual: "47", diff: "-33" },

    longest_win_streak: 1,
    longest_loss_streak: 1,
    ...over,
  };
}
