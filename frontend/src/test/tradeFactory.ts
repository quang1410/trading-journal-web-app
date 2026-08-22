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
export function taoLenh(over: Partial<Trade> = {}): Trade {
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
    win_sign: 1,

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
export function taoStats(over: Partial<Stats> = {}): Stats {
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
    ...over,
  };
}
