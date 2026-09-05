import {
  shiftDecimal,
  percentFromFraction,
  fractionFromPercent,
  compareDecimal,
  formatMoney,
  formatPrice,
  formatPercent,
  formatRatio,
  roundDecimal,
  toPlot,
  isPositiveNumber,
  addDecimal,
} from "./decimal";

describe("shiftDecimal", () => {
  const table: Array<[string, number, string]> = [
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
  for (const [input, step, acc] of table) {
    test(`${input} dịch ${step} -> ${acc}`, () => {
      expect(shiftDecimal(input, step)).toBe(acc);
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
  const table: Array<[string, string, number]> = [
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
  for (const [a, b, acc] of table) {
    test(`${a} so với ${b} -> ${acc}`, () => {
      expect(compareDecimal(a, b)).toBe(acc);
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
  test("giữ nguyên phần NGUYÊN của chuỗi dài", () => {
    expect(formatMoney("12345678901234567890.12")).toContain("12.345.678.901.234.567.890");
  });

  test("gắn đơn vị tiền tệ ở dạng chữ", () => {
    expect(formatMoney("10000", "USD")).toBe("10.000,00 USD");
  });

  test("định dạng theo locale tiếng Anh", () => {
    expect(formatMoney("10000.5", "USD", "en")).toBe("10,000.50 USD");
  });

  /**
   * Hồi quy cho một con số thật đã lên tới màn hình: ô "Kỳ vọng mỗi lệnh" in
   * ra `+37.1287128712871416835 USD`. Nguồn của cái đuôi đó là phép chia bên
   * backend (internal/metrics/kpi.go: expectancy, ave_win, ave_loss đều qua
   * `Div`), nên nó sẽ quay lại ở bất kỳ tài khoản nào có số lệnh không chia
   * hết — vá riêng một ô là vá sai tầng.
   */
  test("cắt đuôi thập phân dài của những trường đi qua phép chia", () => {
    expect(formatMoney("37.1287128712871416835", "USD")).toBe("37,13 USD");
    expect(formatMoney("37.1287128712871416835", "USD", "en")).toBe("37.13 USD");
  });

  test("làm tròn nửa lên", () => {
    expect(formatMoney("0.125")).toBe("0,13");
    expect(formatMoney("0.135")).toBe("0,14");
  });

  /**
   * Cắt về hai chữ số mà KHÔNG đi qua double. Số này lớn hơn
   * Number.MAX_SAFE_INTEGER, nên nếu chuỗi bị ép sang number ở bất kỳ đâu
   * trên đường đi thì phần nguyên sẽ sai chữ số — đây là chốt canh quy tắc 1
   * của CLAUDE.md cho chính hàm định dạng.
   */
  test("làm tròn số vượt MAX_SAFE_INTEGER mà không mất chữ số", () => {
    expect(formatMoney("12345678901234567890.126")).toBe("12.345.678.901.234.567.890,13");
  });

  test("làm tròn số âm theo độ lớn", () => {
    expect(formatMoney("-202.756", "USD")).toBe("-202,76 USD");
  });

  /**
   * `minimumFractionDigits` chứ không chỉ `maximum`: cột tiền trong bảng lệnh
   * phải thẳng hàng. Thiếu nó thì 1.240,5 đứng cạnh 1.240,50 lệch một ký tự
   * và cả cột răng cưa theo từng dòng.
   */
  test("luôn đủ hai chữ số dù số tròn", () => {
    expect(formatMoney("120.5", "USD")).toBe("120,50 USD");
    expect(formatMoney("0")).toBe("0,00");
    expect(formatMoney("7", "USD")).toBe("7,00 USD");
  });

  // Backend cho currency tới 8 ký tự tự do ("USDT"), còn Intl style:"currency"
  // chỉ nhận mã ISO 4217 ba chữ và NÉM RangeError. Nên currency ở đây là chữ
  // gắn thêm, không phải tuỳ chọn của Intl.
  test("không ném với đơn vị tiền tệ không phải ISO", () => {
    expect(() => formatMoney("1", "USDT")).not.toThrow();
    expect(formatMoney("1", "USDT")).toBe("1,00 USDT");
  });
});

// --- Làm tròn và tỷ lệ ------------------------------------------------------
//
// Hồi quy cho hai lỗi hiển thị thật, thấy được trên màn hình:
//   · hệ số lợi nhuận in ra "1,9690964899040831" — 16 chữ số vô nghĩa;
//   · tỷ lệ thắng in ra "0,4375%" vì backend trả PHÂN SỐ chứ không phải phần
//     trăm, mà chỗ hiển thị chỉ dán thêm dấu "%".

test("roundDecimal làm tròn nửa lên, kể cả khi phải nhớ", () => {
  expect(roundDecimal("1.9690964899040831", 2)).toBe("1.97");
  expect(roundDecimal("0.005", 2)).toBe("0.01");
  expect(roundDecimal("0.004", 2)).toBe("0");
  expect(roundDecimal("0.999", 2)).toBe("1");
  expect(roundDecimal("9.99", 1)).toBe("10");
  expect(roundDecimal("-1.235", 2)).toBe("-1.24"); // nửa lên theo ĐỘ LỚN
  expect(roundDecimal("3", 2)).toBe("3"); // không đệm số 0 thừa
  expect(roundDecimal("2650.5", 0)).toBe("2651");
});

test("roundDecimal không đi qua float", () => {
  // 0.1 + 0.2 của float là 0.30000000000000004; chuỗi dài hơn 17 chữ số có
  // nghĩa cũng phải giữ nguyên tới đúng chữ số bị cắt.
  expect(roundDecimal("123456789012345678.995", 2)).toBe("123456789012345679");
});

test("formatRatio cắt đuôi vô nghĩa của tỷ số", () => {
  expect(formatRatio("1.9690964899040831")).toBe("1,97");
  expect(formatRatio("3")).toBe("3");
  expect(formatRatio("2.5316954870195354")).toBe("2,53");
});

test("formatRatio dùng dấu thập phân theo locale tiếng Anh", () => {
  expect(formatRatio("1.9690964899040831", 2, "en")).toBe("1.97");
});

test("formatPercent nhân 100 trước, vì backend trả phân số", () => {
  expect(formatPercent("0.4375")).toBe("43,75%");
  expect(formatPercent("0.1451065")).toBe("14,51%");
  expect(formatPercent("-0.0260194480297866")).toBe("-2,60%");
  expect(formatPercent("1")).toBe("100,00%");
  expect(formatPercent("0")).toBe("0,00%");
});

test("formatPercent dùng locale tiếng Anh", () => {
  expect(formatPercent("0.4375", 2, "en")).toBe("43.75%");
});

describe("toPlot", () => {
  // toPlot là NGOẠI LỆ DUY NHẤT của quy tắc "tiền không bao giờ là number",
  // và nó tồn tại vì Recharts đặt pixel từ number chứ không từ chuỗi. Giá trị
  // nó trả về chỉ dùng để đặt toạ độ; mọi chữ số người đọc thấy vẫn đi qua
  // formatMoney trên chuỗi gốc.
  test.each([
    ["0", 0],
    ["120.50", 120.5],
    ["-51", -51],
    ["350", 350],
    ["0.4375", 0.4375],
    ["-0", -0],
  ])("%s ra %d", (input, mongDoi) => {
    expect(toPlot(input)).toBe(mongDoi);
  });

  // Ném chứ không trả NaN. NaN đi tiếp vào Recharts sẽ thành một cột KHÔNG
  // VẼ RA — không có lỗi nào bật lên, chỉ có một cột biến mất khỏi biểu đồ.
  test.each(["", "abc", "1.2.3", "12px", "1e3"])("chuỗi hỏng %o thì ném", (v) => {
    expect(() => toPlot(v)).toThrow();
  });

  // Ranh giới đúng nghĩa: độ chính xác MẤT ở đây là chấp nhận được vì đầu ra
  // chỉ để đặt pixel, nhưng chuỗi gốc vẫn còn nguyên cho nhãn. Test này ghim
  // rằng ta BIẾT mình đang mất gì, chứ không phải vô tình.
  test("mất độ chính xác là có chủ ý và chỉ ở đầu ra số", () => {
    const origin = "0.1234567890123456789";
    expect(toPlot(origin)).toBeCloseTo(0.12345678901234568, 15);
    expect(origin).toBe("0.1234567890123456789"); // chuỗi gốc không bị đụng
  });
});

describe("isPositiveNumber", () => {
  // Gộp từ hai bản chép tay ở AccountFormDialog và CashFlowPanel. Các ca dưới
  // đây chốt đúng hành vi CŨ của chúng, để lần gom này không đổi luật kiểm.
  it.each(["1", "1.5", "  2  ", "10", "0.01", ".5", "00.10", "007"])("nhận %s", (v) => {
    expect(isPositiveNumber(v)).toBe(true);
  });

  it.each(["0", "0.0", "0.00", "-1", "-0.5", "abc", "", "+1", "5.", "1e3"])("từ chối %s", (v) => {
    expect(isPositiveNumber(v)).toBe(false);
  });
});

describe("addDecimal", () => {
  // Cộng tiền phải làm bằng chuỗi vì đúng lý do cấm Number ở styleguard:
  // 0.1 + 0.2 === 0.30000000000000004. Tổng net của một tuần là tiền thật,
  // người dùng đối chiếu nó với Excel — lệch một xu là sai.
  const table: Array<[string, string, string]> = [
    ["1", "2", "3"],
    ["0.1", "0.2", "0.3"],
    ["1.5", "2.5", "4"],
    ["999", "1", "1000"],
    ["0.05", "0.05", "0.1"],
    ["1.234", "5.6", "6.834"],
    // Dấu khác nhau: trừ độ lớn, giữ dấu của số lớn hơn.
    ["5", "-3", "2"],
    ["-5", "3", "-2"],
    ["3", "-5", "-2"],
    ["-3", "5", "2"],
    ["-1", "-2", "-3"],
    ["-0.1", "-0.2", "-0.3"],
    // Triệt tiêu về 0 — không được ra "-0".
    ["5", "-5", "0"],
    ["-5", "5", "0"],
    ["0.3", "-0.3", "0"],
    // Zero và dạng viết lạ.
    ["0", "0", "0"],
    ["0", "5", "5"],
    ["-0", "5", "5"],
    [".5", ".5", "1"],
    ["1.230", "0.770", "2"],
    ["007", "1", "8"],
    // Mượn qua nhiều bậc.
    ["1000", "-0.001", "999.999"],
    ["1", "-0.9999", "0.0001"],
  ];
  for (const [a, b, acc] of table) {
    test(`${a} + ${b} -> ${acc}`, () => {
      expect(addDecimal(a, b)).toBe(acc);
    });
  }

  test("giao hoán", () => {
    for (const [a, b, acc] of table) expect(addDecimal(b, a)).toBe(acc);
  });

  // Con số mà float làm hỏng: tổng 10 lần 0.1 ra 0.9999999999999999.
  test("cộng dồn nhiều lần không trôi", () => {
    let sum = "0";
    for (let i = 0; i < 10; i++) sum = addDecimal(sum, "0.1");
    expect(sum).toBe("1");
  });

  test("giữ được độ chính xác vượt tầm float", () => {
    expect(addDecimal("0.1234567890123456789", "0.0000000000000000001")).toBe(
      "0.123456789012345679",
    );
  });

  test.each(["", "abc", "1.2.3", "12px", "1e3"])("chuỗi hỏng %o thì ném", (v) => {
    expect(() => addDecimal(v, "1")).toThrow();
    expect(() => addDecimal("1", v)).toThrow();
  });
});

describe("formatPrice", () => {
  // Lý do tồn tại của hàm: formatMoney cắt cứng 2 chữ số, đúng cho tiền nhưng
  // biến hai giá forex khác nhau thành hai ô giống hệt nhau.
  test("giữ nguyên số chữ số thập phân của giá", () => {
    expect(formatPrice("1.08420", "en")).toBe("1.08420");
    expect(formatPrice("1.08110", "en")).toBe("1.08110");
    expect(formatPrice("1.08420", "en")).not.toBe(formatPrice("1.08110", "en"));
  });

  test("không đệm thêm chữ số vào giá tròn", () => {
    expect(formatPrice("2318.4", "en")).toBe("2,318.4");
    expect(formatPrice("100", "en")).toBe("100");
  });

  test("dấu thập phân và ngăn nghìn theo locale", () => {
    expect(formatPrice("61250.00", "vi")).toBe("61.250,00");
    expect(formatPrice("61250.00", "en")).toBe("61,250.00");
  });

  // Quy tắc 1: chuỗi đi thẳng vào Intl, không qua double. Số dài hơn 2^53 mà
  // đi qua Number sẽ mất chữ số cuối — im lặng.
  test("số rất dài không mất chữ số", () => {
    expect(formatPrice("12345678901234567890.12", "en")).toBe("12,345,678,901,234,567,890.12");
  });
});
