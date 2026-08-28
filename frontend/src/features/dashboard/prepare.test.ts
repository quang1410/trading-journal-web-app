import {
  PROFIT_COLOR,
  LOSS_COLOR,
  NEUTRAL_COLOR,
  ACTUAL_COLOR,
  theoryLineColor,
} from "./palette";
import {
  prepareDaily,
  preparePivot,
  prepareRadar,
  prepareRDist,
  prepareTheory,
  prepareWeekday,
} from "./prepare";
import type {
  DayStat,
  Pivot,
  RBucket,
  Radar,
  TheoryPoint,
  WeekdayStat,
} from "./types";

function pivot(over: Partial<Pivot> = {}): Pivot {
  return {
    key: "Break-retest",
    count: 3,
    win_count: 2,
    sum_net: "118.50",
    ave_net: "39.50",
    win_rate: "0.6667",
    ...over,
  };
}

test("giữ nguyên thứ tự backend đã trả", () => {
  // Backend đã cắt top 6 và đã sắp xong (topN trong pivot.go:83; ByTimeframe
  // giữ thứ tự M1->W). Sắp lại ở FE là dựng một nguồn sự thật thứ hai sẽ trôi
  // lệch. Ca này cố ý KHÔNG theo thứ tự bảng chữ cái lẫn thứ tự số lệnh.
  const input = [
    pivot({ key: "M15", count: 1, sum_net: "-51" }),
    pivot({ key: "H1", count: 9, sum_net: "98" }),
  ];
  expect(preparePivot(input).map((r) => r.key)).toEqual(["M15", "H1"]);
});

test("không cắt bớt nhóm nào, kể cả nhóm rỗng", () => {
  // by_direction luôn trả đủ hai nhóm và by_weekday luôn đủ bảy ngày, kể cả
  // count = 0. Lọc bỏ chúng làm biểu đồ mất cột, và một cột vắng mặt trông
  // khác hẳn một cột bằng 0.
  const input = [pivot({ key: "Long", count: 1 }), pivot({ key: "Short", count: 0, sum_net: "0" })];
  expect(preparePivot(input)).toHaveLength(2);
});

test("mỗi cột mang CẢ HAI dạng: số để vẽ, chuỗi để đọc", () => {
  const [c] = preparePivot([pivot({ sum_net: "118.50" })]);
  expect(c.net).toBe(118.5); // toạ độ
  expect(c.netGoc).toBe("118.50"); // chữ số, giữ nguyên cả số 0 cuối
});

test.each([
  ["120", PROFIT_COLOR],
  ["-51", LOSS_COLOR],
  ["0", NEUTRAL_COLOR],
])("net %s tô màu theo dấu", (net, mongDoi) => {
  expect(preparePivot([pivot({ sum_net: net })])[0].color).toBe(mongDoi);
});

test("win_rate giữ nguyên dạng phân số, không tự nhân 100", () => {
  // Nhân ở đây rồi lại nhân lần nữa ở formatPercent là ra 6667%. Việc đổi sang
  // phần trăm thuộc tầng hiển thị, và formatPercent đã làm.
  expect(preparePivot([pivot({ win_rate: "0.6667" })])[0].winRateGoc).toBe("0.6667");
});

test("weekday tách phần lãi và phần lỗ thành hai cột", () => {
  const wd: WeekdayStat = {
    ...pivot({ key: "Tue", count: 2 }),
    profit_positive: "98",
    profit_negative: "-51",
  };
  const [c] = prepareWeekday([wd]);
  expect(c.profit).toBe(98);
  expect(c.loss).toBe(-51);
  expect(c.profitOrigin).toBe("98");
  expect(c.lossOrigin).toBe("-51");
});

test("ngày mang cả cột net lẫn điểm của đường lũy kế", () => {
  const date: DayStat[] = [
    { day: "2026-06-09", count: 1, sum_net: "98", cum_by_day: "98" },
    { day: "2026-06-10", count: 1, sum_net: "-51", cum_by_day: "47" },
  ];
  const acc = prepareDaily(date);
  expect(acc.map((r) => r.net)).toEqual([98, -51]);
  expect(acc.map((r) => r.cum)).toEqual([98, 47]);
  expect(acc[1].color).toBe(LOSS_COLOR);
  // Đường lũy kế KHÔNG đổi màu theo ngày: nó là một đường liên tục, và tô
  // từng đoạn theo dấu của ngày sẽ đọc thành một đường đứt quãng.
  expect(acc[1].cumGoc).toBe("47");
});

test("mảng rỗng ra mảng rỗng, không ném", () => {
  expect(preparePivot([])).toEqual([]);
  expect(prepareWeekday([])).toEqual([]);
  expect(prepareDaily([])).toEqual([]);
});

describe("chuanBiRDist", () => {
  test("bucket phía lỗ tô đỏ, phía lãi tô lãi — theo VỊ TRÍ, không theo wins/losses", () => {
    // "0R to -1R" (index 10) và "0R to 1R" (index 11) là ranh giới thật: một
    // lệnh net = 0 rơi vào index 11 (bucketIndex của Go coi ratio = 0 thuộc nửa
    // mở [0,1)) nhưng KHÔNG được tính vào wins lẫn losses — nên suy màu từ
    // wins/losses sẽ sai đúng ở ranh giới này. Test này dựng đúng ca đó: index
    // 11 có count = 1 nhưng wins = losses = 0.
    const rows: RBucket[] = Array.from({ length: 22 }, (_, i) => ({
      label: `bucket-${i}`,
      count: i === 10 || i === 11 ? 1 : 0,
      wins: 0,
      losses: 0,
    }));
    const acc = prepareRDist(rows);
    expect(acc[10].color).toBe(LOSS_COLOR);
    expect(acc[11].color).toBe(PROFIT_COLOR);
  });

  test("đủ 22 cột, không cắt bớt bucket rỗng nào", () => {
    const rows: RBucket[] = Array.from({ length: 22 }, (_, i) => ({
      label: `b${i}`,
      count: 0,
      wins: 0,
      losses: 0,
    }));
    expect(prepareRDist(rows)).toHaveLength(22);
  });

  test("giữ nguyên nhãn, count, wins, losses của backend", () => {
    const rows: RBucket[] = [{ label: "0R to 1R", count: 3, wins: 3, losses: 0 }];
    const [c] = prepareRDist(rows);
    expect(c).toMatchObject({ label: "0R to 1R", count: 3, wins: 3, losses: 0 });
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(prepareRDist([])).toEqual([]);
  });
});

describe("chuanBiRadar", () => {
  test("trục null vẽ tại gốc nhưng GIỮ chuỗi gốc null để phân biệt với 0 điểm", () => {
    // Bất biến: null (chưa chấm) khác 0 (chấm được 0 điểm). diem = 0 chỉ là
    // toạ độ hình học cho trục không vẽ được với dữ liệu thiếu; rawScore null
    // là thứ ScoreRadarBlock đọc để quyết định có hiện lời nhắc hay không.
    const r: Radar = {
      avg_entry: "12.5",
      avg_in_trade: null,
      avg_exit: "25",
      avg_psych: "12.5",
    };
    const acc = prepareRadar(r);
    const inTrade = acc.find((d) => d.axis === "inTrade")!;
    expect(inTrade.score).toBe(0);
    expect(inTrade.rawScore).toBeNull();
    const entry = acc.find((d) => d.axis === "entry")!;
    expect(entry.score).toBe(12.5);
    expect(entry.rawScore).toBe("12.5");
  });

  test("đủ bốn trục theo đúng thứ tự entry, inTrade, exit, psych", () => {
    const r: Radar = { avg_entry: "1", avg_in_trade: "2", avg_exit: "3", avg_psych: "4" };
    expect(prepareRadar(r).map((d) => d.axis)).toEqual(["entry", "inTrade", "exit", "psych"]);
  });

  test("cả bốn trục null thì cả bốn đều diem = 0, rawScore = null", () => {
    const r: Radar = { avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null };
    const acc = prepareRadar(r);
    expect(acc.every((d) => d.score === 0)).toBe(true);
    expect(acc.every((d) => d.rawScore === null)).toBe(true);
  });
});

describe("chuanBiTheory", () => {
  test("hai đường giữ cả dạng số lẫn chuỗi gốc, đúng thứ tự stt", () => {
    const rows: TheoryPoint[] = [
      { stt: 1, cum_theory: "120", cum_by_trade: "98" },
      { stt: 2, cum_theory: "80", cum_by_trade: "47" },
    ];
    const acc = prepareTheory(rows);
    expect(acc.map((r) => r.theory)).toEqual([120, 80]);
    expect(acc.map((r) => r.actual)).toEqual([98, 47]);
    expect(acc[0].theoryOrigin).toBe("120");
    expect(acc[0].actualOrigin).toBe("98");
    expect(acc.map((r) => r.stt)).toEqual([1, 2]);
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(prepareTheory([])).toEqual([]);
  });
});

test("đường lý thuyết dùng màu trung tính, KHÔNG mang màu lãi/lỗ", () => {
  // Bất biến số 7 của plan này. cum_theory là MỐC so sánh, không phải chuỗi
  // ngang hàng — tô nó lãi/lỗ là nói nó cũng thắng/thua, trong khi nó chỉ là
  // con số lẽ ra có nếu mọi lệnh chạy đúng kế hoạch.
  expect(theoryLineColor("lyThuyet")).toBe(NEUTRAL_COLOR);
  expect(theoryLineColor("lyThuyet")).not.toBe(PROFIT_COLOR);
  expect(theoryLineColor("lyThuyet")).not.toBe(LOSS_COLOR);
  expect(theoryLineColor("thucTe")).toBe(ACTUAL_COLOR);
});
