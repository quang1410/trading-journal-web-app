import { formatInstant, instantToWall, nowInZone, wallToInstant } from "./datetime";

// Sáu ca dưới đây chép thẳng từ spec §3.3. Chúng ĐÃ ĐƯỢC ĐO trên dayjs
// 1.11.23 chứ không phải suy ra, và bốn trong sáu ca sẽ sai nếu code lỡ dùng
// giờ máy thay vì timezone truyền vào.
describe("wallToInstant", () => {
  test.each([
    ["2026-06-09T21:30", "Asia/Ho_Chi_Minh", "2026-06-09T14:30:00.000Z"],
    ["2026-01-15T08:00", "America/New_York", "2026-01-15T13:00:00.000Z"],
    ["2026-07-15T08:00", "America/New_York", "2026-07-15T12:00:00.000Z"],
    ["2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-06-09T21:30", "Australia/Adelaide", "2026-06-09T12:00:00.000Z"],
  ])("%s ở %s ra %s", (wall, tz, mongDoi) => {
    expect(wallToInstant(wall, tz)).toBe(mongDoi);
  });

  // GHIM MỘT QUYẾT ĐỊNH, không phải ghim một sự thật hiển nhiên.
  //
  // 02:30 ngày 2026-03-08 ở New York KHÔNG TỒN TẠI: đồng hồ nhảy thẳng 02:00
  // sang 03:00. Mọi thư viện phải tự chọn dịch tới hay dịch lùi. dayjs dịch
  // TỚI (07:30Z = 03:30 EDT), theo đúng quy ước "compatible" của Temporal và
  // java.time. Một bản tự viết bằng Intl sẽ ra 06:30Z (01:30 EST) — cũng hợp
  // lệ, chỉ là quy ước khác. Test này để ngày nào đổi thư viện thì biết ngay
  // mình vừa đổi luôn cả quy ước.
  test("giờ không tồn tại thì dịch TỚI, không dịch lùi", () => {
    expect(wallToInstant("2026-03-08T02:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
});

describe("formatInstant", () => {
  // Cùng MỘT instant, ba timezone, ba kết quả khác nhau — kể cả khác NGÀY.
  // Đây là bằng chứng hiển thị bám theo account chứ không bám máy chạy test.
  test.each([
    ["Asia/Ho_Chi_Minh", "09/06/2026 21:30"],
    ["America/New_York", "09/06/2026 10:30"],
    ["Australia/Adelaide", "10/06/2026 00:00"],
  ])("%s hiện %s", (tz, mongDoi) => {
    expect(formatInstant("2026-06-09T14:30:00Z", tz)).toBe(mongDoi);
  });
});

test("instantToWall nạp lại được vào input datetime-local", () => {
  expect(instantToWall("2026-06-09T14:30:00Z", "Asia/Ho_Chi_Minh")).toBe("2026-06-09T21:30");
});

// Vòng đi-về là phép kiểm rẻ nhất bắt được lỗi lệch dấu offset: dịch nhầm
// chiều thì đi rồi về sẽ lệch đúng hai lần offset.
test("đi rồi về không lệch", () => {
  const tz = "America/New_York";
  expect(instantToWall(wallToInstant("2026-07-15T08:00", tz), tz)).toBe("2026-07-15T08:00");
});

test("nowInZone lấy 'bây giờ' theo tz account", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-09T14:30:00Z"));
  try {
    expect(nowInZone("Asia/Ho_Chi_Minh")).toBe("2026-06-09T21:30");
    expect(nowInZone("America/New_York")).toBe("2026-06-09T10:30");
  } finally {
    vi.useRealTimers();
  }
});
