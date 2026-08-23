import {
  MAU_LAI,
  MAU_LO,
  MAU_TRUNG_TINH,
  MAU_THUC_TE,
  mauDuongTheory,
} from "./palette";
import {
  chuanBiNgay,
  chuanBiPivot,
  chuanBiRadar,
  chuanBiRDist,
  chuanBiTheory,
  chuanBiWeekday,
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
  const vao = [
    pivot({ key: "M15", count: 1, sum_net: "-51" }),
    pivot({ key: "H1", count: 9, sum_net: "98" }),
  ];
  expect(chuanBiPivot(vao).map((r) => r.key)).toEqual(["M15", "H1"]);
});

test("không cắt bớt nhóm nào, kể cả nhóm rỗng", () => {
  // by_direction luôn trả đủ hai nhóm và by_weekday luôn đủ bảy ngày, kể cả
  // count = 0. Lọc bỏ chúng làm biểu đồ mất cột, và một cột vắng mặt trông
  // khác hẳn một cột bằng 0.
  const vao = [pivot({ key: "Long", count: 1 }), pivot({ key: "Short", count: 0, sum_net: "0" })];
  expect(chuanBiPivot(vao)).toHaveLength(2);
});

test("mỗi cột mang CẢ HAI dạng: số để vẽ, chuỗi để đọc", () => {
  const [c] = chuanBiPivot([pivot({ sum_net: "118.50" })]);
  expect(c.net).toBe(118.5); // toạ độ
  expect(c.netGoc).toBe("118.50"); // chữ số, giữ nguyên cả số 0 cuối
});

test.each([
  ["120", MAU_LAI],
  ["-51", MAU_LO],
  ["0", MAU_TRUNG_TINH],
])("net %s tô màu theo dấu", (net, mongDoi) => {
  expect(chuanBiPivot([pivot({ sum_net: net })])[0].mau).toBe(mongDoi);
});

test("win_rate giữ nguyên dạng phân số, không tự nhân 100", () => {
  // Nhân ở đây rồi lại nhân lần nữa ở formatPercent là ra 6667%. Việc đổi sang
  // phần trăm thuộc tầng hiển thị, và formatPercent đã làm.
  expect(chuanBiPivot([pivot({ win_rate: "0.6667" })])[0].winRateGoc).toBe("0.6667");
});

test("weekday tách phần lãi và phần lỗ thành hai cột", () => {
  const wd: WeekdayStat = {
    ...pivot({ key: "Tue", count: 2 }),
    profit_positive: "98",
    profit_negative: "-51",
  };
  const [c] = chuanBiWeekday([wd]);
  expect(c.lai).toBe(98);
  expect(c.lo).toBe(-51);
  expect(c.laiGoc).toBe("98");
  expect(c.loGoc).toBe("-51");
});

test("ngày mang cả cột net lẫn điểm của đường lũy kế", () => {
  const ngay: DayStat[] = [
    { day: "2026-06-09", count: 1, sum_net: "98", cum_by_day: "98" },
    { day: "2026-06-10", count: 1, sum_net: "-51", cum_by_day: "47" },
  ];
  const ra = chuanBiNgay(ngay);
  expect(ra.map((r) => r.net)).toEqual([98, -51]);
  expect(ra.map((r) => r.cum)).toEqual([98, 47]);
  expect(ra[1].mau).toBe(MAU_LO);
  // Đường lũy kế KHÔNG đổi màu theo ngày: nó là một đường liên tục, và tô
  // từng đoạn theo dấu của ngày sẽ đọc thành một đường đứt quãng.
  expect(ra[1].cumGoc).toBe("47");
});

test("mảng rỗng ra mảng rỗng, không ném", () => {
  expect(chuanBiPivot([])).toEqual([]);
  expect(chuanBiWeekday([])).toEqual([]);
  expect(chuanBiNgay([])).toEqual([]);
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
    const ra = chuanBiRDist(rows);
    expect(ra[10].mau).toBe(MAU_LO);
    expect(ra[11].mau).toBe(MAU_LAI);
  });

  test("đủ 22 cột, không cắt bớt bucket rỗng nào", () => {
    const rows: RBucket[] = Array.from({ length: 22 }, (_, i) => ({
      label: `b${i}`,
      count: 0,
      wins: 0,
      losses: 0,
    }));
    expect(chuanBiRDist(rows)).toHaveLength(22);
  });

  test("giữ nguyên nhãn, count, wins, losses của backend", () => {
    const rows: RBucket[] = [{ label: "0R to 1R", count: 3, wins: 3, losses: 0 }];
    const [c] = chuanBiRDist(rows);
    expect(c).toMatchObject({ label: "0R to 1R", count: 3, wins: 3, losses: 0 });
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(chuanBiRDist([])).toEqual([]);
  });
});

describe("chuanBiRadar", () => {
  test("trục null vẽ tại gốc nhưng GIỮ chuỗi gốc null để phân biệt với 0 điểm", () => {
    // Bất biến: null (chưa chấm) khác 0 (chấm được 0 điểm). diem = 0 chỉ là
    // toạ độ hình học cho trục không vẽ được với dữ liệu thiếu; diemGoc null
    // là thứ ScoreRadarBlock đọc để quyết định có hiện lời nhắc hay không.
    const r: Radar = {
      avg_entry: "12.5",
      avg_in_trade: null,
      avg_exit: "25",
      avg_psych: "12.5",
    };
    const ra = chuanBiRadar(r);
    const inTrade = ra.find((d) => d.truc === "inTrade")!;
    expect(inTrade.diem).toBe(0);
    expect(inTrade.diemGoc).toBeNull();
    const entry = ra.find((d) => d.truc === "entry")!;
    expect(entry.diem).toBe(12.5);
    expect(entry.diemGoc).toBe("12.5");
  });

  test("đủ bốn trục theo đúng thứ tự entry, inTrade, exit, psych", () => {
    const r: Radar = { avg_entry: "1", avg_in_trade: "2", avg_exit: "3", avg_psych: "4" };
    expect(chuanBiRadar(r).map((d) => d.truc)).toEqual(["entry", "inTrade", "exit", "psych"]);
  });

  test("cả bốn trục null thì cả bốn đều diem = 0, diemGoc = null", () => {
    const r: Radar = { avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null };
    const ra = chuanBiRadar(r);
    expect(ra.every((d) => d.diem === 0)).toBe(true);
    expect(ra.every((d) => d.diemGoc === null)).toBe(true);
  });
});

describe("chuanBiTheory", () => {
  test("hai đường giữ cả dạng số lẫn chuỗi gốc, đúng thứ tự stt", () => {
    const rows: TheoryPoint[] = [
      { stt: 1, cum_theory: "120", cum_by_trade: "98" },
      { stt: 2, cum_theory: "80", cum_by_trade: "47" },
    ];
    const ra = chuanBiTheory(rows);
    expect(ra.map((r) => r.lyThuyet)).toEqual([120, 80]);
    expect(ra.map((r) => r.thucTe)).toEqual([98, 47]);
    expect(ra[0].lyThuyetGoc).toBe("120");
    expect(ra[0].thucTeGoc).toBe("98");
    expect(ra.map((r) => r.stt)).toEqual([1, 2]);
  });

  test("mảng rỗng ra mảng rỗng, không ném", () => {
    expect(chuanBiTheory([])).toEqual([]);
  });
});

test("đường lý thuyết dùng màu trung tính, KHÔNG mang màu lãi/lỗ", () => {
  // Bất biến số 7 của plan này. cum_theory là MỐC so sánh, không phải chuỗi
  // ngang hàng — tô nó lãi/lỗ là nói nó cũng thắng/thua, trong khi nó chỉ là
  // con số lẽ ra có nếu mọi lệnh chạy đúng kế hoạch.
  expect(mauDuongTheory("lyThuyet")).toBe(MAU_TRUNG_TINH);
  expect(mauDuongTheory("lyThuyet")).not.toBe(MAU_LAI);
  expect(mauDuongTheory("lyThuyet")).not.toBe(MAU_LO);
  expect(mauDuongTheory("thucTe")).toBe(MAU_THUC_TE);
});
