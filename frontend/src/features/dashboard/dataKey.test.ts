import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { fromFrontend } from "@/test/paths";
import { makeCharts } from "@/test/tradeFactory";
import {
  prepareDaily,
  preparePivot,
  prepareRDist,
  prepareRadar,
  prepareTheory,
  prepareWeekday,
} from "./prepare";

/**
 * Cổng chặn `dataKey` chết.
 *
 * Recharts khai `dataKey: string`, nên một chuỗi trỏ vào field KHÔNG tồn tại
 * vẫn biên dịch sạch, vẫn render sạch, và chỉ vẽ ra biểu đồ trống. Đây là chỗ
 * mù của cả ba lớp bảo vệ hiện có cùng lúc:
 *
 *  - `tsc` không thấy, vì kiểu của dataKey chỉ là string;
 *  - test biểu đồ không thấy, vì chúng khẳng định trên bảng sr-only — mà bảng
 *    đó dựng từ thuộc tính đọc thẳng, KHÔNG đi qua dataKey. Bảng đúng trong khi
 *    SVG trống rỗng;
 *  - mắt người không thấy, vì code xung quanh trông hoàn toàn bình thường.
 *
 * Đợt đổi tên biến sang tiếng Anh đã để lại đúng sáu chuỗi như vậy (`"nhan"`,
 * `"diem"`, `"lyThuyet"`, `"thucTe"`, `"lai"`, `"lo"`) và làm ba biểu đồ trống
 * trơn mà 344 test vẫn xanh. Test này tồn tại để lần sau không im lặng nữa.
 *
 * Cách làm: chạy THẬT hàm prepare* trên fixture golden của backend, rồi đối
 * chiếu từng chuỗi dataKey/nameKey moi ra từ file biểu đồ với khoá thật của
 * hàng dữ liệu. Không mock, không chép tay danh sách khoá.
 */

const charts = makeCharts();

/** Khoá thật của một hàng dữ liệu mà mỗi file biểu đồ nhận được. */
const rowKeys: Record<string, string[]> = {
  "DailyPnlChart.tsx": Object.keys(prepareDaily(charts.by_day)[0]),
  "PivotBarChart.tsx": Object.keys(preparePivot(charts.by_setup)[0]),
  "RDistributionChart.tsx": Object.keys(prepareRDist(charts.r_distribution)[0]),
  "WeekdayChart.tsx": Object.keys(prepareWeekday(charts.by_weekday)[0]),
  "TheoryVsActualChart.tsx": Object.keys(prepareTheory(charts.theory_vs_actual)[0]),
  // ScoreRadarBlock trộn thêm `label` (nhãn đã dịch) vào điểm radar ngay tại
  // chỗ vẽ, nên khoá thật là output của prepareRadar cộng `label`.
  "ScoreRadarBlock.tsx": [...Object.keys(prepareRadar(charts.radar)[0]), "label"],
  // Hai biểu đồ tròn dựng mảng ngay trong component, không qua prepare*.
  "WinLossDonut.tsx": ["key", "value", "color"],
  "TradeClassChart.tsx": ["class", "count", "sum_net", "win_count", "ave_net", "win_rate"],
};

/** Moi mọi chuỗi `dataKey="..."` và `nameKey="..."` trong một file. */
function literalKeys(file: string): string[] {
  const src = readFileSync(fromFrontend("src/features/dashboard", file), "utf8");
  return [...src.matchAll(/\b(?:data|name)Key[:=]\s*"([^"]+)"/g)].map((m) => m[1]);
}

test.each(Object.keys(rowKeys))("%s: mọi dataKey đều trỏ vào field có thật", (file) => {
  const keys = rowKeys[file];
  const found = literalKeys(file);

  // Không có dòng này thì một file đổi tên đi sẽ cho mảng rỗng và pass vĩnh viễn.
  expect(found.length, `${file} không tìm thấy dataKey nào — regex hỏng hoặc file đổi tên`).toBeGreaterThan(0);

  for (const k of found) {
    expect(keys, `${file} có dataKey="${k}" nhưng hàng dữ liệu chỉ có: ${keys.join(", ")}`).toContain(k);
  }
});

/**
 * Cổng thứ hai: so sánh `name`/`v` với một chuỗi CHẾT.
 *
 * Cổng trên chỉ soi `dataKey="..."`. Nhưng tooltip và legend của Recharts nhận
 * `name` (mặc định CHÍNH LÀ dataKey của chuỗi đó) rồi so với chuỗi viết tay để
 * chọn nhãn và chọn giá trị gốc. Chuỗi đó cũng chỉ là `string` với tsc.
 *
 * Đúng đợt đổi tên sang tiếng Anh đã sửa dataKey mà BỎ SÓT các phép so sánh:
 * `WeekdayChart` còn so với "lai" và `TheoryVsActualChart` còn so với
 * "lyThuyet". Hệ quả không phải biểu đồ trống — nên cổng trên không thấy — mà
 * là nhánh đó không bao giờ đúng: cả hai chuỗi rơi vào cùng một nhánh, tooltip
 * in ra HAI DÒNG GIỐNG HỆT NHAU và legend dán sai nhãn. Test này canh chỗ đó.
 */
function comparedNames(file: string): string[] {
  const src = readFileSync(fromFrontend("src/features/dashboard", file), "utf8");
  // Bắt `name === "x"` và `v === "x"` — hai kiểu viết đang dùng trong thư mục.
  return [...src.matchAll(/\b(?:name|v)\s*===\s*"([^"]+)"/g)].map((m) => m[1]);
}

test.each(Object.keys(rowKeys))("%s: mọi chuỗi so với name đều là field có thật", (file) => {
  const keys = rowKeys[file];
  for (const k of comparedNames(file)) {
    expect(
      keys,
      `${file} so name === "${k}" nhưng hàng dữ liệu chỉ có: ${keys.join(", ")}. ` +
        `Nhánh đó không bao giờ đúng — tooltip/legend sẽ dán nhãn sai.`,
    ).toContain(k);
  }
});
