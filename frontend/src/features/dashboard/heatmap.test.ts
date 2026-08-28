import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";
import { BREAKEVEN_COLOR, NO_TRADE_COLOR, heatTier } from "./palette";
import { prepareHeatmap } from "./heatmap";
import type { HeatmapMonth } from "./types";

// Hai ngày liền kề, không có lỗ thủng — khung tối thiểu để kiểm hình học cột
// không cần lo gì tới việc điền ngày.
const TWO_ADJACENT_DAYS: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "98", count: 1 }, // Thứ Ba
      { day: "2026-06-10", sum_net: "-51", count: 1 }, // Thứ Tư
    ],
  },
];

// 09/06 rồi 15/06 — năm ngày thủng ở giữa (10,11,12,13,14) mà backend không
// gửi ô nào. Đây là fixture cho bất biến số 1: những ngày này phải được CHẾ
// RA, không bị bỏ qua.
const CO_LO_THUNG: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [
      { day: "2026-06-09", sum_net: "100", count: 1 }, // Thứ Ba
      { day: "2026-06-15", sum_net: "-40", count: 1 }, // Thứ Hai
    ],
  },
];

describe("hình dạng lưới", () => {
  test("mỗi cột đúng 7 ô, hàng 0 là Chủ nhật", () => {
    const { col } = prepareHeatmap(TWO_ADJACENT_DAYS);
    expect(col).toHaveLength(1);
    expect(col[0]).toHaveLength(7);
    // 07/06 là Chủ nhật của tuần chứa 09/06, nhưng nó ở NGOÀI DẢI (trước ngày
    // đầu dữ liệu) nên day = null theo hợp đồng kiểu (chỉ ngoaiDai có null).
    expect(col[0][0].status).toBe("ngoaiDai");
    expect(col[0][0].day).toBeNull();
    // 09/06/2026 là Thứ Ba -> nằm ở hàng index 2 nếu hàng 0 là Chủ nhật.
    expect(col[0][2].day).toBe("2026-06-09");
    expect(col[0][2].status).toBe("coLenh");
  });

  test("ngoài dải KHÔNG vẽ ô — day là null", () => {
    const { col } = prepareHeatmap(TWO_ADJACENT_DAYS);
    // 07/06, 08/06 (trước 09/06) và 11..13/06 (sau 10/06) đều ngoài dải.
    const outOfRange = col[0].filter((o) => o.status === "ngoaiDai");
    expect(outOfRange).toHaveLength(5);
    expect(outOfRange.every((o) => o.day === null)).toBe(true);
  });

  test("hai ngày có lệnh giữ đúng chuỗi gốc và count", () => {
    const { col } = prepareHeatmap(TWO_ADJACENT_DAYS);
    const date09 = col[0].find((o) => o.day === "2026-06-09")!;
    const date10 = col[0].find((o) => o.day === "2026-06-10")!;
    expect(date09).toMatchObject({ status: "coLenh", sumNetGoc: "98", count: 1 });
    expect(date10).toMatchObject({ status: "coLenh", sumNetGoc: "-51", count: 1 });
  });
});

// BẤT BIẾN SỐ 1: ngày thiếu được CHẾ RA, không bị bỏ.
describe("điền ngày thiếu (lỗ thủng thật)", () => {
  test("năm ngày giữa 09/06 và 15/06 thành khongGiaoDich, không biến mất", () => {
    const { col } = prepareHeatmap(CO_LO_THUNG);
    const flatten = col.flat();
    const thung = flatten.filter((o) => o.status === "khongGiaoDich");
    expect(thung.map((o) => o.day)).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(thung.every((o) => o.color === NO_TRADE_COLOR)).toBe(true);
    expect(thung.every((o) => o.sumNetGoc === null && o.count === 0)).toBe(true);
  });

  test("lưới đủ hai cột tuần (09/06 Thứ Ba .. 15/06 Thứ Hai trải hai tuần)", () => {
    const { col } = prepareHeatmap(CO_LO_THUNG);
    expect(col).toHaveLength(2);
    // Cột 0: 07/06 (CN, ngoài dải) .. 13/06 (T7). Cột 1: 14/06 (CN) .. 20/06
    // (T7, ngoài dải). Chỉ kiểm những ô có day thật (không null).
    expect(col[0][0].status).toBe("ngoaiDai");
    expect(col[0][2].day).toBe("2026-06-09"); // Thứ Ba, ngày đầu dữ liệu
    expect(col[1][0].day).toBe("2026-06-14"); // Chủ nhật của tuần sau
    expect(col[1][1].day).toBe("2026-06-15"); // Thứ Hai, ngày cuối dữ liệu
    expect(col[1][6].status).toBe("ngoaiDai"); // sau ngày cuối
  });
});

// BẤT BIẾN SỐ 2: không giao dịch KHÁC hoà.
describe("ba trạng thái ô vẽ ra", () => {
  test("sum_net đúng bằng 0 là hoà, không phải khongGiaoDich", () => {
    const month: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "0", count: 2 }] },
    ];
    const { col } = prepareHeatmap(month);
    const o = col[0].find((x) => x.day === "2026-06-09")!;
    expect(o.status).toBe("hoa");
    expect(o.color).toBe(BREAKEVEN_COLOR);
    expect(o.count).toBe(2);
  });

  test("hoà và không giao dịch tô KHÁC màu nhau", () => {
    const month: HeatmapMonth[] = [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-08", sum_net: "0", count: 1 },
          { day: "2026-06-09", sum_net: "50", count: 1 },
        ],
      },
    ];
    const { col } = prepareHeatmap(month);
    const breakeven = col[0].find((o) => o.day === "2026-06-08")!;
    expect(breakeven.color).not.toBe(NO_TRADE_COLOR);
  });
});

// BẤT BIẾN SỐ 8: ranh giới tam phân vị đóng dưới, và các ca biên đã tả ở spec §2.5.
describe("chia bậc cường độ", () => {
  test("đúng một ngày có lệnh -> bậc 3 (không có 'một ngày thì tô nhạt')", () => {
    const month: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "50", count: 1 }] },
    ];
    const { col } = prepareHeatmap(month);
    const o = col[0].find((x) => x.day === "2026-06-09")!;
    expect(o.color).toBe(heatTier(3, true));
  });

  test("mọi ngày cùng độ lớn -> tất cả bậc 3, bậc 1 và 2 rỗng", () => {
    const month: HeatmapMonth[] = [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-07", sum_net: "50", count: 1 }, // CN
          { day: "2026-06-08", sum_net: "-50", count: 1 }, // T2
          { day: "2026-06-09", sum_net: "50", count: 1 }, // T3
          { day: "2026-06-10", sum_net: "-50", count: 1 }, // T4
          { day: "2026-06-11", sum_net: "50", count: 1 }, // T5
        ],
      },
    ];
    const { col } = prepareHeatmap(month);
    const coLenh = col[0].filter((o) => o.status === "coLenh");
    expect(coLenh).toHaveLength(5);
    for (const o of coLenh) {
      const profit = o.sumNetGoc !== null && compareDecimalHelper(o.sumNetGoc) > 0;
      expect(o.color).toBe(heatTier(3, profit));
    }
  });

  // Trợ giúp cục bộ cho test trên — không xuất khỏi file test.
  function compareDecimalHelper(v: string): number {
    return v.startsWith("-") ? -1 : v === "0" ? 0 : 1;
  }

  test("ranh giới ĐÓNG DƯỚI: độ lớn bằng đúng ranh giới thì lên bậc trên", () => {
    // Hai ngày có lệnh, độ lớn khác nhau: 51 và 98. sorted = [51, 98], n = 2.
    // b1 = sorted[floor(2/3)] = sorted[0] = 51. b2 = sorted[floor(4/3)] = sorted[1] = 98.
    // 51 == b1 (không < b1) và 51 < b2 -> bậc 2. 98 == b2 (không < b2) -> bậc 3.
    const month: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "98", count: 1 }] },
    ];
    month[0].cells.push({ day: "2026-06-10", sum_net: "-51", count: 1 });
    const { col } = prepareHeatmap(month);
    const o09 = col[0].find((o) => o.day === "2026-06-09")!;
    const o10 = col[0].find((o) => o.day === "2026-06-10")!;
    expect(o09.color).toBe(heatTier(3, true)); // 98 là độ lớn lớn nhất -> bậc 3
    expect(o10.color).toBe(heatTier(2, false)); // 51 là độ lớn nhỏ nhất trong hai -> bậc 2
  });
});

describe("nhãn tháng", () => {
  test("hai ngày cùng tháng chỉ ra MỘT nhãn, gắn ở cột đầu tiên chứa ngày thật", () => {
    const { monthLabel } = prepareHeatmap(TWO_ADJACENT_DAYS);
    expect(monthLabel).toEqual([{ month: "06/2026", col: 0 }]);
  });

  test("hai tháng cách xa, nhãn tháng chuyển ở cột chứa ngày thật đầu tiên của tháng mới", () => {
    // 04/05/2026 (Thứ Hai) và 15/06/2026 (Thứ Hai). Lưới trải đúng 7 cột (49
    // ngày): cột 0 bắt đầu Chủ nhật 03/05, cột 6 bắt đầu Chủ nhật 14/06.
    //
    // Nhãn KHÔNG đợi tới cột 6: mọi ngày giữa hai mốc dữ liệu đều là
    // "khongGiaoDich" (có `day` thật, chỉ không có lệnh) chứ không phải
    // "ngoaiDai" (day = null) — nên ngày 07/06 (đầu tháng 6, nằm ở CỘT 5)
    // đã là "ngày thật đầu tiên của tháng 06" trước khi tới cột 6. Đây là
    // hành vi ĐÚNG của "nhãn theo ngày thật đầu tiên của cột", không phải
    // đợi ngày CÓ LỆNH đầu tiên của tháng.
    const month: HeatmapMonth[] = [
      { month: "05/2026", cells: [{ day: "2026-05-04", sum_net: "10", count: 1 }] },
      { month: "06/2026", cells: [{ day: "2026-06-15", sum_net: "-10", count: 1 }] },
    ];
    const { col, monthLabel } = prepareHeatmap(month);
    expect(col).toHaveLength(7);
    expect(monthLabel).toEqual([
      { month: "05/2026", col: 0 },
      { month: "06/2026", col: 5 },
    ]);
  });
});

test("mảng rỗng ra lưới rỗng, không ném", () => {
  expect(prepareHeatmap([])).toEqual({ col: [], monthLabel: [] });
});

// Ghi nhận sửa spec §5.2: heatmap.ts KHÔNG cần toPlot. So độ lớn chỉ cần
// compareDecimal — test này tồn tại để một lần chạy lại xác nhận điều đó,
// không phải để chuẩn bị dùng toPlot sau này.
test("không cần toPlot — mọi so sánh độ lớn đều qua compareDecimal", () => {
  const src = readFileSync(fromFrontend("src/features/dashboard/heatmap.ts"), "utf8");
  expect(src).not.toMatch(/\btoPlot\s*\(/);
});
