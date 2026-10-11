import { makeFullEnums } from "@/test/harness";
import {
  DEVIATIONS,
  THEORY,
  actualSeries,
  cumulative,
  reasonLabel,
  sampleTotals,
  worstDeviation,
} from "./gapSample";
import { formatSigned } from "./format";

test("totals match the copy on the page", () => {
  expect(sampleTotals()).toEqual({ theory: 1330, actual: 190, gap: -1140 });
});

test("cumulative series start at zero and have one point per trade plus origin", () => {
  expect(cumulative(THEORY)).toHaveLength(31);
  expect(cumulative(THEORY)[0]).toBe(0);
  expect(cumulative(actualSeries()).at(-1)).toBe(190);
});

test("the worst deviation is trade #5", () => {
  expect(worstDeviation()).toBe(4);
});

// Mẫu trỏ vào nhãn theo VỊ TRÍ trong danh sách của backend. Test này ghim vị
// trí nào ra chuỗi nào — đổi thứ tự enum bên Go là test đỏ ở đây.
test("deviation reasons resolve to the intended labels", () => {
  const enums = makeFullEnums();
  const labels = Object.fromEntries(
    Object.entries(DEVIATIONS).map(([i, d]) => [i, reasonLabel(d.reason, enums)]),
  );
  expect(labels).toEqual({
    1: "Dời dừng lỗ ra xa",
    4: "Thoát lệnh cảm tính, sợ hãi",
    8: "GIAO DỊCH TRẢ THÙ",
    10: "Quá sớm",
    15: "Dời Chốt lời",
    17: "Dời dừng lỗ ra xa",
    21: "Thoát lệnh cảm tính, sợ hãi",
    26: "Quá muộn",
  });
  expect(reasonLabel(DEVIATIONS[8].reason, undefined)).toBeUndefined();
});

test("formatSigned uses the locale separator and a real minus sign", () => {
  expect(formatSigned(1330, "vi")).toBe("+1.330");
  expect(formatSigned(-1140, "vi")).toBe("−1.140");
  expect(formatSigned(1330, "en")).toBe("+1,330");
  expect(formatSigned(0, "vi")).toBe("0");
});
