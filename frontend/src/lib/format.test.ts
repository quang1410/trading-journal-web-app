import { formatDateOnly } from "./format";

test("ngày YYYY-MM-DD hiện theo DD/MM/YYYY", () => {
  expect(formatDateOnly("2026-03-01")).toBe("01/03/2026");
});

test("ngày hiện theo locale tiếng Anh", () => {
  expect(formatDateOnly("2026-03-01", "en")).toBe("03/01/2026");
});

// Cái bẫy: new Date("2026-03-01") là nửa đêm UTC. Ở mọi offset ÂM nó lùi một
// ngày khi hiển thị. `date` của cash flow không có giờ, nên nó không được
// phép đi qua Date lần nào.
test("không lùi ngày dù đọc theo múi giờ âm", () => {
  expect(new Date("2026-03-01").toLocaleDateString("vi-VN", { timeZone: "America/New_York" }))
    .not.toBe("1/3/2026"); // chứng minh cái bẫy là thật
  expect(formatDateOnly("2026-03-01")).toBe("01/03/2026");
});

test("chuỗi không đúng dạng thì trả nguyên vẹn, không ném", () => {
  expect(formatDateOnly("linh tinh")).toBe("linh tinh");
  expect(formatDateOnly("")).toBe("");
});
