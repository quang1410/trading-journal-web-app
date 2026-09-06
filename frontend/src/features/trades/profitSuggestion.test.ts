import { suggestProfit } from "./profitSuggestion";

const LONG = "Long";
const base = { direction: LONG, longValue: LONG };

test("Long lấy giá ra trừ giá vào, nhân khối lượng", () => {
  expect(suggestProfit({ ...base, entry: "2000", exit: "2010", volume: "2" })).toBe("20");
});

test("Short đảo chiều phép trừ", () => {
  expect(
    suggestProfit({ ...base, direction: "Short", entry: "2010", exit: "2000", volume: "2" }),
  ).toBe("20");
});

test("Long lỗ ra số âm", () => {
  expect(suggestProfit({ ...base, entry: "2010", exit: "2000", volume: "1.5" })).toBe("-15");
});

// Quy tắc 1 của CLAUDE.md: tiền không đi qua float. Phép này bằng float ra
// 0.30000000000000004 * 3, còn ở đây phải đúng từng chữ số.
test("không đi qua float — số thập phân giữ nguyên độ chính xác", () => {
  expect(suggestProfit({ ...base, entry: "1.1", exit: "1.4", volume: "3" })).toBe("0.9");
});

test("làm tròn hai chữ số vì đây là tiền", () => {
  expect(suggestProfit({ ...base, entry: "1.00000", exit: "1.00456", volume: "1" })).toBe("0");
  expect(suggestProfit({ ...base, entry: "1", exit: "1.005", volume: "100" })).toBe("0.5");
});

test("thiếu bất kỳ số nào thì không gợi ý", () => {
  expect(suggestProfit({ ...base, entry: "", exit: "2010", volume: "1" })).toBeNull();
  expect(suggestProfit({ ...base, entry: "2000", exit: "", volume: "1" })).toBeNull();
  expect(suggestProfit({ ...base, entry: "2000", exit: "2010", volume: "" })).toBeNull();
});

// Gợi ý "0" chỉ là nhiễu: người dùng gõ 0 nhanh hơn đọc rồi bấm nó.
test("giá ra bằng giá vào thì không gợi ý", () => {
  expect(suggestProfit({ ...base, entry: "2000", exit: "2000.00", volume: "5" })).toBeNull();
});

// Chuỗi đang gõ dở không được làm văng cả form.
test("chuỗi không phải số trả null chứ không ném", () => {
  expect(suggestProfit({ ...base, entry: "abc", exit: "2010", volume: "1" })).toBeNull();
  expect(suggestProfit({ ...base, entry: "-", exit: "2010", volume: "1" })).toBeNull();
  expect(suggestProfit({ ...base, entry: "1.", exit: "2010", volume: "1" })).toBeNull();
});

// longValue lấy từ /meta/enums, không chép cứng "Long" (CLAUDE.md quy tắc 5).
test("chiều mua so với longValue truyền vào, không so với chuỗi chép cứng", () => {
  expect(
    suggestProfit({ entry: "10", exit: "12", volume: "1", direction: "MUA", longValue: "MUA" }),
  ).toBe("2");
  expect(
    suggestProfit({ entry: "10", exit: "12", volume: "1", direction: "MUA", longValue: "Long" }),
  ).toBe("-2");
});
