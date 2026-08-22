import { MAU_LAI, MAU_LO, MAU_TRUNG_TINH } from "./palette";
import { chuanBiNgay, chuanBiPivot, chuanBiWeekday } from "./prepare";
import type { DayStat, Pivot, WeekdayStat } from "./types";

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
