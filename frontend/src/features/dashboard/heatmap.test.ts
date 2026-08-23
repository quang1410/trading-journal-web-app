import { readFileSync } from "node:fs";
import { tuFrontend } from "@/test/paths";
import { MAU_HOA, MAU_KHONG_GIAO_DICH, bacNhiet } from "./palette";
import { chuanBiHeatmap } from "./heatmap";
import type { HeatmapMonth } from "./types";

// Hai ngày liền kề, không có lỗ thủng — khung tối thiểu để kiểm hình học cột
// không cần lo gì tới việc điền ngày.
const HAI_NGAY_LIEN_KE: HeatmapMonth[] = [
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
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    expect(cot).toHaveLength(1);
    expect(cot[0]).toHaveLength(7);
    // 07/06 là Chủ nhật của tuần chứa 09/06, nhưng nó ở NGOÀI DẢI (trước ngày
    // đầu dữ liệu) nên day = null theo hợp đồng kiểu (chỉ ngoaiDai có null).
    expect(cot[0][0].trangThai).toBe("ngoaiDai");
    expect(cot[0][0].day).toBeNull();
    // 09/06/2026 là Thứ Ba -> nằm ở hàng index 2 nếu hàng 0 là Chủ nhật.
    expect(cot[0][2].day).toBe("2026-06-09");
    expect(cot[0][2].trangThai).toBe("coLenh");
  });

  test("ngoài dải KHÔNG vẽ ô — day là null", () => {
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    // 07/06, 08/06 (trước 09/06) và 11..13/06 (sau 10/06) đều ngoài dải.
    const ngoaiDai = cot[0].filter((o) => o.trangThai === "ngoaiDai");
    expect(ngoaiDai).toHaveLength(5);
    expect(ngoaiDai.every((o) => o.day === null)).toBe(true);
  });

  test("hai ngày có lệnh giữ đúng chuỗi gốc và count", () => {
    const { cot } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    const ngay09 = cot[0].find((o) => o.day === "2026-06-09")!;
    const ngay10 = cot[0].find((o) => o.day === "2026-06-10")!;
    expect(ngay09).toMatchObject({ trangThai: "coLenh", sumNetGoc: "98", count: 1 });
    expect(ngay10).toMatchObject({ trangThai: "coLenh", sumNetGoc: "-51", count: 1 });
  });
});

// BẤT BIẾN SỐ 1: ngày thiếu được CHẾ RA, không bị bỏ.
describe("điền ngày thiếu (lỗ thủng thật)", () => {
  test("năm ngày giữa 09/06 và 15/06 thành khongGiaoDich, không biến mất", () => {
    const { cot } = chuanBiHeatmap(CO_LO_THUNG);
    const phang = cot.flat();
    const thung = phang.filter((o) => o.trangThai === "khongGiaoDich");
    expect(thung.map((o) => o.day)).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(thung.every((o) => o.mau === MAU_KHONG_GIAO_DICH)).toBe(true);
    expect(thung.every((o) => o.sumNetGoc === null && o.count === 0)).toBe(true);
  });

  test("lưới đủ hai cột tuần (09/06 Thứ Ba .. 15/06 Thứ Hai trải hai tuần)", () => {
    const { cot } = chuanBiHeatmap(CO_LO_THUNG);
    expect(cot).toHaveLength(2);
    // Cột 0: 07/06 (CN, ngoài dải) .. 13/06 (T7). Cột 1: 14/06 (CN) .. 20/06
    // (T7, ngoài dải). Chỉ kiểm những ô có day thật (không null).
    expect(cot[0][0].trangThai).toBe("ngoaiDai");
    expect(cot[0][2].day).toBe("2026-06-09"); // Thứ Ba, ngày đầu dữ liệu
    expect(cot[1][0].day).toBe("2026-06-14"); // Chủ nhật của tuần sau
    expect(cot[1][1].day).toBe("2026-06-15"); // Thứ Hai, ngày cuối dữ liệu
    expect(cot[1][6].trangThai).toBe("ngoaiDai"); // sau ngày cuối
  });
});

// BẤT BIẾN SỐ 2: không giao dịch KHÁC hoà.
describe("ba trạng thái ô vẽ ra", () => {
  test("sum_net đúng bằng 0 là hoà, không phải khongGiaoDich", () => {
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "0", count: 2 }] },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const o = cot[0].find((x) => x.day === "2026-06-09")!;
    expect(o.trangThai).toBe("hoa");
    expect(o.mau).toBe(MAU_HOA);
    expect(o.count).toBe(2);
  });

  test("hoà và không giao dịch tô KHÁC màu nhau", () => {
    const thang: HeatmapMonth[] = [
      {
        month: "06/2026",
        cells: [
          { day: "2026-06-08", sum_net: "0", count: 1 },
          { day: "2026-06-09", sum_net: "50", count: 1 },
        ],
      },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const hoa = cot[0].find((o) => o.day === "2026-06-08")!;
    expect(hoa.mau).not.toBe(MAU_KHONG_GIAO_DICH);
  });
});

// BẤT BIẾN SỐ 8: ranh giới tam phân vị đóng dưới, và các ca biên đã tả ở spec §2.5.
describe("chia bậc cường độ", () => {
  test("đúng một ngày có lệnh -> bậc 3 (không có 'một ngày thì tô nhạt')", () => {
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "50", count: 1 }] },
    ];
    const { cot } = chuanBiHeatmap(thang);
    const o = cot[0].find((x) => x.day === "2026-06-09")!;
    expect(o.mau).toBe(bacNhiet(3, true));
  });

  test("mọi ngày cùng độ lớn -> tất cả bậc 3, bậc 1 và 2 rỗng", () => {
    const thang: HeatmapMonth[] = [
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
    const { cot } = chuanBiHeatmap(thang);
    const coLenh = cot[0].filter((o) => o.trangThai === "coLenh");
    expect(coLenh).toHaveLength(5);
    for (const o of coLenh) {
      const lai = o.sumNetGoc !== null && compareDecimalHelper(o.sumNetGoc) > 0;
      expect(o.mau).toBe(bacNhiet(3, lai));
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
    const thang: HeatmapMonth[] = [
      { month: "06/2026", cells: [{ day: "2026-06-09", sum_net: "98", count: 1 }] },
    ];
    thang[0].cells.push({ day: "2026-06-10", sum_net: "-51", count: 1 });
    const { cot } = chuanBiHeatmap(thang);
    const o09 = cot[0].find((o) => o.day === "2026-06-09")!;
    const o10 = cot[0].find((o) => o.day === "2026-06-10")!;
    expect(o09.mau).toBe(bacNhiet(3, true)); // 98 là độ lớn lớn nhất -> bậc 3
    expect(o10.mau).toBe(bacNhiet(2, false)); // 51 là độ lớn nhỏ nhất trong hai -> bậc 2
  });
});

describe("nhãn tháng", () => {
  test("hai ngày cùng tháng chỉ ra MỘT nhãn, gắn ở cột đầu tiên chứa ngày thật", () => {
    const { nhanThang } = chuanBiHeatmap(HAI_NGAY_LIEN_KE);
    expect(nhanThang).toEqual([{ thang: "06/2026", cot: 0 }]);
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
    const thang: HeatmapMonth[] = [
      { month: "05/2026", cells: [{ day: "2026-05-04", sum_net: "10", count: 1 }] },
      { month: "06/2026", cells: [{ day: "2026-06-15", sum_net: "-10", count: 1 }] },
    ];
    const { cot, nhanThang } = chuanBiHeatmap(thang);
    expect(cot).toHaveLength(7);
    expect(nhanThang).toEqual([
      { thang: "05/2026", cot: 0 },
      { thang: "06/2026", cot: 5 },
    ]);
  });
});

test("mảng rỗng ra lưới rỗng, không ném", () => {
  expect(chuanBiHeatmap([])).toEqual({ cot: [], nhanThang: [] });
});

// Ghi nhận sửa spec §5.2: heatmap.ts KHÔNG cần toPlot. So độ lớn chỉ cần
// compareDecimal — test này tồn tại để một lần chạy lại xác nhận điều đó,
// không phải để chuẩn bị dùng toPlot sau này.
test("không cần toPlot — mọi so sánh độ lớn đều qua compareDecimal", () => {
  const src = readFileSync(tuFrontend("src/features/dashboard/heatmap.ts"), "utf8");
  expect(src).not.toMatch(/\btoPlot\s*\(/);
});
