import { makeFullEnums } from "@/test/harness";
import { classify, defaultSelection, toneOf, totalScore } from "./ticket";

const enums = makeFullEnums();

test("default selection is the 35-point winning trade", () => {
  const sel = defaultSelection(enums);
  expect(sel).toEqual({
    entry_qualities: "Quá sớm",
    in_trade_qualities: "Tuân thủ kế hoạch",
    exit_qualities: "Thoát lệnh cảm tính, sợ hãi",
    psychologies: "SỢ BỎ LỠ (FOMO)",
  });
  expect(totalScore(sel, enums.score_points)).toBe(35);
});

test.each([
  [100, "Đúng kế hoạch", "good"],
  [80, "Đúng kế hoạch", "good"],
  [79, "Cần cải thiện", "warn"],
  [55, "Cần cải thiện", "warn"],
  [54, "Bốc đồng / FOMO", "bad"],
  [30, "Bốc đồng / FOMO", "bad"],
  [29, "Giao dịch trả thù", "bad"],
  [0, "Giao dịch trả thù", "bad"],
])("total %i is %s (%s)", (total, cls, tone) => {
  const band = classify(total, enums.class_bands);
  expect(band?.class).toBe(cls);
  expect(toneOf(band, enums.class_bands)).toBe(tone);
});
