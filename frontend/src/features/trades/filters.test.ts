import { EMPTY_FILTER, readFilter, readPage, toQuery, writeParams } from "./filters";

test("đọc đủ bảy ô lọc từ URL", () => {
  const sp = new URLSearchParams(
    "from=2026-06-01&to=2026-06-30&setup=Break&symbol=XAUUSD" +
      "&timeframe=H1&direction=Long&trade_class=" +
      encodeURIComponent("Đúng kế hoạch"),
  );
  expect(readFilter(sp)).toEqual({
    from: "2026-06-01",
    to: "2026-06-30",
    setup: "Break",
    symbol: "XAUUSD",
    timeframe: "H1",
    direction: "Long",
    trade_class: "Đúng kế hoạch",
  });
});

test("URL trống ra bộ lọc rỗng, không ra undefined", () => {
  expect(readFilter(new URLSearchParams(""))).toEqual(EMPTY_FILTER);
});

// URL là thứ người dùng NHÌN THẤY và gửi đi. Nhồi bảy tham số rỗng vào đó
// biến một trang chưa lọc gì thành một chuỗi rác dài ngoằng.
test("writeParams bỏ hẳn ô rỗng và bỏ page khi bằng 1", () => {
  expect(writeParams({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 1).toString()).toBe("symbol=XAUUSD");
});

test("writeParams giữ page khi khác 1", () => {
  const s = writeParams({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 3).toString();
  expect(s).toContain("symbol=XAUUSD");
  expect(s).toContain("page=3");
});

test("đi rồi về không lệch", () => {
  const f = { ...EMPTY_FILTER, from: "2026-06-01", direction: "Short", setup: "Break-retest" };
  expect(readFilter(writeParams(f, 2))).toEqual(f);
  expect(readPage(writeParams(f, 2))).toBe(2);
});

// Một query string gõ nhầm không được làm gãy cả trang. Backend cũng chọn
// đúng lối này: `soNguyen` trong trade_handler.go cho 0 khi Atoi hỏng.
test.each(["", "abc", "-1", "0", "1.5", "2e3"])("page rác %o về 1", (v) => {
  expect(readPage(new URLSearchParams(`page=${v}`))).toBe(1);
});

test("page hợp lệ được giữ", () => {
  expect(readPage(new URLSearchParams("page=7"))).toBe(7);
});

// toQuery là thứ ĐI TỚI API, khác writeParams là thứ đi lên URL. Nó không
// gửi `size`: 50 đã là DefaultPageSize của backend, gửi lại chỉ tạo hai
// nguồn sự thật cho cùng một con số.
test("toQuery không gửi size", () => {
  expect(toQuery({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 2)).toBe("?symbol=XAUUSD&page=2");
});

test("toQuery rỗng ra chuỗi rỗng, không ra dấu hỏi trơ trọi", () => {
  expect(toQuery(EMPTY_FILTER, 1)).toBe("");
});
