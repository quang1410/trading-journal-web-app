import { CHIP_COUNT, accountChipIndex, accountLabel, accountSubLabel } from "./identity";
import type { Account } from "./types";

const acc = (over: Partial<Account>): Account => ({
  id: 1,
  code: "455981",
  name: "Thử thách FTMO",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
  ...over,
});

test("nhãn chính là tên, không phải mã của sàn", () => {
  expect(accountLabel(acc({}))).toBe("Thử thách FTMO");
});

test("tên rỗng thì lùi về mã chứ không để trống", () => {
  expect(accountLabel(acc({ name: "" }))).toBe("455981");
  expect(accountLabel(acc({ name: "   " }))).toBe("455981");
});

test("không có tài khoản thì nhãn là chuỗi rỗng", () => {
  expect(accountLabel(null)).toBe("");
  expect(accountSubLabel(undefined)).toBe("");
});

test("nhãn phụ là mã khi mã nói thêm được điều gì", () => {
  expect(accountSubLabel(acc({}))).toBe("455981");
});

test("tên trùng mã thì bỏ nhãn phụ, không in hai lần cùng một chuỗi", () => {
  expect(accountSubLabel(acc({ name: "455981" }))).toBe("");
  expect(accountSubLabel(acc({ name: "" }))).toBe("");
});

test("dấu màu bám theo id nên luôn nằm trong khoảng CSS có định nghĩa", () => {
  for (const id of [0, 1, 5, 6, 7, 99, 455981, 455982]) {
    const i = accountChipIndex(id);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(CHIP_COUNT);
  }
});

test("cùng một id luôn ra cùng một màu, id khác nhau ở chữ số cuối thì khác màu", () => {
  expect(accountChipIndex(455981)).toBe(accountChipIndex(455981));
  // Đúng cái ca trong ảnh chụp: hai tài khoản lệch nhau một chữ số cuối.
  expect(accountChipIndex(455981)).not.toBe(accountChipIndex(455982));
});

test("id âm không sinh ra data-chip ngoài bảng", () => {
  expect(accountChipIndex(-1)).toBeGreaterThanOrEqual(0);
  expect(accountChipIndex(-7)).toBeLessThan(CHIP_COUNT);
});
