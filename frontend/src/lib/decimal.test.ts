import {
  shiftDecimal,
  percentFromFraction,
  fractionFromPercent,
  compareDecimal,
  formatMoney,
} from "./decimal";

describe("shiftDecimal", () => {
  const bang: Array<[string, number, string]> = [
    ["0.01", 2, "1"],
    ["0.005", 2, "0.5"],
    ["0.0125", 2, "1.25"],
    ["1", 2, "100"],
    ["0", 2, "0"],
    ["1", -2, "0.01"],
    ["100", -2, "1"],
    ["0.5", -2, "0.005"],
    ["-0.5", 2, "-50"],
    ["10000", 0, "10000"],
    [".5", 2, "50"],
    ["1.230", 0, "1.23"],
  ];
  for (const [vao, buoc, ra] of bang) {
    test(`${vao} dịch ${buoc} -> ${ra}`, () => {
      expect(shiftDecimal(vao, buoc)).toBe(ra);
    });
  }

  test("từ chối chuỗi không phải số", () => {
    expect(() => shiftDecimal("abc", 2)).toThrow();
    expect(() => shiftDecimal("", 2)).toThrow();
    expect(() => shiftDecimal("1.2.3", 2)).toThrow();
  });
});

describe("risk % <-> phân số", () => {
  test("phân số sang %", () => {
    expect(percentFromFraction("0.01")).toBe("1");
    expect(percentFromFraction("0.0125")).toBe("1.25");
    expect(percentFromFraction("1")).toBe("100");
  });

  test("% sang phân số", () => {
    expect(fractionFromPercent("1")).toBe("0.01");
    expect(fractionFromPercent("1.25")).toBe("0.0125");
    expect(fractionFromPercent("100")).toBe("1");
  });

  // Lý do tồn tại của cả module này. 0.01 * 100 tình cờ ra đúng 1, nhưng
  // 0.29 * 100 ra 28.999999999999996 và 0.07 * 100 ra 7.000000000000001 —
  // tức risk 29% sẽ hiện thành 28.999999999999996%, và một risk gõ là 7%
  // gửi lên backend sẽ lệch. Dịch dấu chấm trên chuỗi thì không có chuyện đó.
  test("không mượn float, nên không có đuôi rác", () => {
    expect(0.29 * 100).not.toBe(29); // chứng minh cái bẫy là thật
    expect(0.07 * 100).not.toBe(7);
    expect(percentFromFraction("0.29")).toBe("29");
    expect(percentFromFraction("0.07")).toBe("7");
    expect(fractionFromPercent("29")).toBe("0.29");
  });

  test("đi một vòng thì trở về chính nó", () => {
    for (const v of ["0.01", "0.005", "0.0125", "0.1", "1"]) {
      expect(fractionFromPercent(percentFromFraction(v))).toBe(v);
    }
  });
});

describe("compareDecimal", () => {
  const bang: Array<[string, string, number]> = [
    ["1", "1", 0],
    ["0.5", "100", -1],
    ["100", "100", 0],
    ["100.0001", "100", 1],
    ["2", "10", -1],
    ["10", "2", 1],
    ["0.10", "0.1", 0],
    ["0", "-0", 0],
    ["-1", "0.5", -1],
    ["-2", "-1", -1],
    ["-1", "-2", 1],
  ];
  for (const [a, b, ra] of bang) {
    test(`${a} so với ${b} -> ${ra}`, () => {
      expect(compareDecimal(a, b)).toBe(ra);
    });
  }

  // Bẫy mà so sánh chuỗi thô sẽ sập: "2" > "10" theo thứ tự từ điển.
  test("so theo giá trị chứ không theo thứ tự từ điển", () => {
    expect("2" > "10").toBe(true); // chứng minh cái bẫy là thật
    expect(compareDecimal("2", "10")).toBe(-1);
    expect(compareDecimal("9", "11")).toBe(-1);
  });
});

describe("formatMoney", () => {
  test("giữ nguyên độ chính xác của chuỗi dài", () => {
    expect(formatMoney("12345678901234567890.12")).toContain("12.345.678.901.234.567.890");
  });

  test("gắn đơn vị tiền tệ ở dạng chữ", () => {
    expect(formatMoney("10000", "USD")).toBe("10.000 USD");
  });

  // Backend cho currency tới 8 ký tự tự do ("USDT"), còn Intl style:"currency"
  // chỉ nhận mã ISO 4217 ba chữ và NÉM RangeError. Nên currency ở đây là chữ
  // gắn thêm, không phải tuỳ chọn của Intl.
  test("không ném với đơn vị tiền tệ không phải ISO", () => {
    expect(() => formatMoney("1", "USDT")).not.toThrow();
    expect(formatMoney("1", "USDT")).toBe("1 USDT");
  });
});
