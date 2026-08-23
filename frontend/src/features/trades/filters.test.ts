import { EMPTY_FILTER, readFilter, readPage, readSize, toQuery, writeParams } from "./filters";

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

test.each(["", "abc", "0"])("size %o về mặc định", (v) => {
  expect(readSize(new URLSearchParams(`size=${v}`))).toBe(50);
});

test("size vượt trần bị kẹp và size hợp lệ được giữ", () => {
  expect(readSize(new URLSearchParams("size=201"))).toBe(200);
  expect(readSize(new URLSearchParams("size=100"))).toBe(100);
});

// toQuery là thứ ĐI TỚI API, khác writeParams là thứ đi lên URL. Size mặc định
// vẫn được bỏ để URL/API ngắn, còn lựa chọn khác phải được truyền nguyên vẹn.
test("toQuery ghi size khác mặc định", () => {
  const f = { ...EMPTY_FILTER, symbol: "XAUUSD" };
  expect(writeParams(f, 1, 100).toString()).toBe("symbol=XAUUSD&size=100");
  expect(toQuery(f, 2, 100)).toBe("?symbol=XAUUSD&page=2&size=100");
});

test("toQuery bỏ size mặc định", () => {
  expect(toQuery({ ...EMPTY_FILTER, symbol: "XAUUSD" }, 2)).toBe("?symbol=XAUUSD&page=2");
});

test("toQuery rỗng ra chuỗi rỗng, không ra dấu hỏi trơ trọi", () => {
  expect(toQuery(EMPTY_FILTER, 1)).toBe("");
});
