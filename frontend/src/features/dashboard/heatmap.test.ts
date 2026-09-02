import { readFileSync } from "node:fs";
import { fromFrontend } from "@/test/paths";
import { listMonths, prepareMonthGrid } from "./heatmap";
import type { HeatmapMonth } from "./types";

// ── Lịch tháng ────────────────────────────────────────────────────────────
//
// Khác prepareHeatmap: KHÔNG gộp mọi tháng thành một dải liên tục, mà dựng
// đúng MỘT tháng dương lịch với đủ ô đầu/cuối tuần bị hụt.

// 07/2026: mùng 1 rơi vào Thứ Tư, tháng có 31 ngày -> 5 tuần lịch.
const THANG_07: HeatmapMonth = {
  month: "07/2026",
  cells: [
    { day: "2026-07-01", sum_net: "1000", count: 1 }, // Thứ Tư, tuần 1
    { day: "2026-07-07", sum_net: "1381", count: 3 }, // Thứ Ba, tuần 2
    { day: "2026-07-10", sum_net: "-346", count: 3 }, // Thứ Sáu, tuần 2
    { day: "2026-07-16", sum_net: "0", count: 2 }, // Thứ Năm, tuần 3 — HOÀ
    { day: "2026-07-31", sum_net: "-285", count: 3 }, // Thứ Sáu, tuần 5
  ],
};

describe("prepareMonthGrid", () => {
  test("dựng đủ tuần, mỗi tuần 7 ô, cột 0 là Chủ nhật", () => {
    const g = prepareMonthGrid(THANG_07);
    expect(g.weeks).toHaveLength(5);
    for (const w of g.weeks) expect(w.day).toHaveLength(7);
    // 01/07/2026 là Thứ Tư -> cột index 3 của tuần đầu.
    expect(g.weeks[0].day[3].day).toBe("2026-07-01");
    expect(g.weeks[0].day[3].inMonth).toBe(true);
  });

  test("ô trước mùng 1 và sau ngày cuối nằm ngoài tháng", () => {
    const g = prepareMonthGrid(THANG_07);
    // CN..T3 của tuần đầu (index 0..2) là 28,29,30/06 — ngoài tháng.
    for (const i of [0, 1, 2]) {
      expect(g.weeks[0].day[i].inMonth).toBe(false);
      expect(g.weeks[0].day[i].day).toBeNull();
    }
    // 31/07 là Thứ Sáu (index 5); Thứ Bảy sau nó đã sang 01/08.
    const cuoi = g.weeks[4].day;
    expect(cuoi[5].day).toBe("2026-07-31");
    expect(cuoi[6].inMonth).toBe(false);
  });

  test("phân loại ngày: lãi, lỗ, hoà, không giao dịch", () => {
    const g = prepareMonthGrid(THANG_07);
    const byDay = new Map(
      g.weeks.flatMap((w) => w.day).filter((o) => o.day).map((o) => [o.day, o]),
    );
    expect(byDay.get("2026-07-01")?.kind).toBe("lai");
    expect(byDay.get("2026-07-10")?.kind).toBe("lo");
    // sum_net = 0 nhưng CÓ 2 lệnh: hoà, không phải "không giao dịch".
    expect(byDay.get("2026-07-16")?.kind).toBe("hoa");
    expect(byDay.get("2026-07-16")?.count).toBe(2);
    // 02/07 backend không gửi ô nào.
    expect(byDay.get("2026-07-02")?.kind).toBe("khong");
    expect(byDay.get("2026-07-02")?.count).toBe(0);
  });

  test("tổng net tháng cộng bằng chuỗi, và đếm đúng số ngày giao dịch", () => {
    const g = prepareMonthGrid(THANG_07);
    // 1000 + 1381 - 346 + 0 - 285
    expect(g.totalNet).toBe("1750");
    // Ngày HOÀ vẫn là một ngày CÓ giao dịch: 5 ô backend gửi.
    expect(g.tradingDays).toBe(5);
  });

  test("tổng tháng không trôi số như float", () => {
    const g = prepareMonthGrid({
      month: "07/2026",
      cells: [
        { day: "2026-07-01", sum_net: "0.1", count: 1 },
        { day: "2026-07-02", sum_net: "0.2", count: 1 },
      ],
    });
    expect(g.totalNet).toBe("0.3");
  });

  test("net từng tuần tính riêng theo hàng", () => {
    const g = prepareMonthGrid(THANG_07);
    expect(g.weeks[0].net).toBe("1000"); // chỉ 01/07
    expect(g.weeks[1].net).toBe("1035"); // 1381 - 346
    expect(g.weeks[2].net).toBe("0"); // chỉ ngày hoà
    expect(g.weeks[3].net).toBe("0"); // không có lệnh nào
    expect(g.weeks[4].net).toBe("-285");
  });

  test("nhãn tuần đánh số theo thứ tự trong tháng", () => {
    const g = prepareMonthGrid(THANG_07);
    expect(g.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4, 5]);
  });

  // Tháng 6 tuần: 01 rơi vào Thứ Bảy và tháng có 31 ngày (08/2026).
  test("tháng tràn 6 tuần vẫn dựng đủ", () => {
    const g = prepareMonthGrid({
      month: "08/2026",
      cells: [{ day: "2026-08-01", sum_net: "5", count: 1 }], // Thứ Bảy
    });
    expect(g.weeks).toHaveLength(6);
    expect(g.weeks[0].day[6].day).toBe("2026-08-01");
    expect(g.weeks[5].day.some((o) => o.day === "2026-08-31")).toBe(true);
  });

  test("tháng rỗng vẫn dựng lưới, tổng bằng 0", () => {
    const g = prepareMonthGrid({ month: "07/2026", cells: [] });
    expect(g.weeks).toHaveLength(5);
    expect(g.totalNet).toBe("0");
    expect(g.tradingDays).toBe(0);
    expect(g.weeks.flatMap((w) => w.day).every((o) => o.kind !== "lai")).toBe(true);
  });
});

describe("barStep — bậc chiều cao thanh cường độ", () => {
  // Bậc tính bằng THỨ HẠNG của |net|, chỉ dùng compareDecimal: không có phép
  // chia nào, nên không có chỗ nào để độ chính xác rơi ra ngoài.
  test("ngày lớn nhất được bậc cao nhất, nhỏ nhất được bậc thấp nhất", () => {
    const g = prepareMonthGrid(THANG_07);
    const byDay = new Map(
      g.weeks.flatMap((w) => w.day).filter((o) => o.day).map((o) => [o.day, o]),
    );
    // |1381| lớn nhất trong tháng, |285| nhỏ nhất trong các ngày có lãi/lỗ.
    expect(byDay.get("2026-07-07")?.step).toBe(5);
    expect(byDay.get("2026-07-31")?.step).toBe(1);
    // Ngày hoà và ngày không giao dịch không có thanh.
    expect(byDay.get("2026-07-16")?.step).toBe(0);
    expect(byDay.get("2026-07-02")?.step).toBe(0);
  });

  test("bậc luôn nằm trong 1..5 với ngày có lãi/lỗ", () => {
    const g = prepareMonthGrid(THANG_07);
    for (const o of g.weeks.flatMap((w) => w.day)) {
      if (o.kind === "lai" || o.kind === "lo") {
        expect(o.step).toBeGreaterThanOrEqual(1);
        expect(o.step).toBeLessThanOrEqual(5);
      } else {
        expect(o.step).toBe(0);
      }
    }
  });

  test("mọi ngày cùng độ lớn thì cùng một bậc", () => {
    const g = prepareMonthGrid({
      month: "07/2026",
      cells: [
        { day: "2026-07-01", sum_net: "100", count: 1 },
        { day: "2026-07-02", sum_net: "-100", count: 1 },
        { day: "2026-07-03", sum_net: "100", count: 1 },
      ],
    });
    const steps = g.weeks
      .flatMap((w) => w.day)
      .filter((o) => o.step > 0)
      .map((o) => o.step);
    expect(new Set(steps).size).toBe(1);
  });

  // `rank` khác `step`: step gom về năm bậc để VẼ, rank là vị trí chính xác
  // để NÓI THÀNH LỜI trong tooltip. Năm ngày cùng bậc 5 thì thanh cao bằng
  // nhau, nhưng chỉ một ngày là "lớn nhất tháng".
  test("hạng theo độ lớn, 1 là lớn nhất, không phân biệt lãi hay lỗ", () => {
    const g = prepareMonthGrid(THANG_07);
    const byDay = new Map(
      g.weeks.flatMap((w) => w.day).filter((o) => o.day).map((o) => [o.day, o]),
    );
    // Độ lớn giảm dần: 1381 > 1000 > 346 > 285. Ngày lỗ 346 xếp trên ngày lỗ
    // 285 và dưới ngày lãi 1000 — hạng đo ĐỘ LỚN, dấu không tham gia.
    expect(byDay.get("2026-07-07")?.rank).toBe(1);
    expect(byDay.get("2026-07-01")?.rank).toBe(2);
    expect(byDay.get("2026-07-10")?.rank).toBe(3);
    expect(byDay.get("2026-07-31")?.rank).toBe(4);
    // Mẫu số là số ngày CÓ lãi/lỗ, không tính ngày hoà và ngày nghỉ.
    expect(byDay.get("2026-07-07")?.rankOf).toBe(4);
  });

  test("ngày hoà và ngày nghỉ không mang hạng", () => {
    const g = prepareMonthGrid(THANG_07);
    const byDay = new Map(
      g.weeks.flatMap((w) => w.day).filter((o) => o.day).map((o) => [o.day, o]),
    );
    // 0 nghĩa là "không xếp hạng được", không phải "hạng 0". Gán hạng cho ngày
    // hoà là bịa: nó không nằm trong dãy độ lớn nào cả.
    expect(byDay.get("2026-07-16")?.rank).toBe(0);
    expect(byDay.get("2026-07-02")?.rank).toBe(0);
  });

  test("hai ngày cùng độ lớn thì cùng hạng, không phải hai hạng liền nhau", () => {
    const g = prepareMonthGrid({
      month: "07/2026",
      cells: [
        { day: "2026-07-01", sum_net: "500", count: 1 },
        { day: "2026-07-02", sum_net: "-500", count: 1 },
        { day: "2026-07-03", sum_net: "900", count: 1 },
      ],
    });
    const byDay = new Map(
      g.weeks.flatMap((w) => w.day).filter((o) => o.day).map((o) => [o.day, o]),
    );
    // Thứ tự giữa hai ngày 500 là ngẫu nhiên theo thứ tự mảng; tooltip không
    // được nói một điều ngẫu nhiên như thể nó có nghĩa.
    expect(byDay.get("2026-07-03")?.rank).toBe(1);
    expect(byDay.get("2026-07-01")?.rank).toBe(2);
    expect(byDay.get("2026-07-02")?.rank).toBe(2);
  });

  test("đúng một ngày có lệnh thì vẫn có thanh", () => {
    const g = prepareMonthGrid({
      month: "07/2026",
      cells: [{ day: "2026-07-01", sum_net: "42", count: 1 }],
    });
    const o = g.weeks.flatMap((w) => w.day).find((x) => x.day === "2026-07-01");
    expect(o?.step).toBeGreaterThanOrEqual(1);
  });
});

describe("listMonths", () => {
  test("sắp theo thời gian tăng dần, không phải theo chuỗi", () => {
    // "09/2025" > "07/2026" nếu so chuỗi thẳng — bẫy phải tránh.
    const ms: HeatmapMonth[] = [
      { month: "07/2026", cells: [] },
      { month: "09/2025", cells: [] },
      { month: "01/2026", cells: [] },
    ];
    expect(listMonths(ms)).toEqual(["09/2025", "01/2026", "07/2026"]);
  });

  test("danh sách rỗng trả mảng rỗng", () => {
    expect(listMonths([])).toEqual([]);
  });
});

// Ghi nhận sửa spec §5.2: heatmap.ts KHÔNG cần toPlot. So độ lớn chỉ cần
// compareDecimal, cộng dồn chỉ cần addDecimal — test này tồn tại để mỗi lần
// chạy lại xác nhận điều đó, không phải để chuẩn bị dùng toPlot sau này.
//
// Vẫn đúng sau khi đổi sang lịch tháng: bậc thanh cường độ tính bằng THỨ HẠNG
// (số nguyên đếm được) chứ không bằng phép chia trên tiền, chính là để chỗ này
// không bao giờ cần tới ranh giới chuỗi->số.
test("không cần toPlot — mọi phép trên tiền đều ở dạng chuỗi", () => {
  const src = readFileSync(fromFrontend("src/features/dashboard/heatmap.ts"), "utf8");
  expect(src).not.toMatch(/\btoPlot\s*\(/);
});
