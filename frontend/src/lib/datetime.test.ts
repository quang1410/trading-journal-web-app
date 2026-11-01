import { formatInstant, instantToWall, nowInZone, wallToInstant } from "./datetime";

// Sáu ca dưới đây chép thẳng từ spec §3.3, đo lần đầu trên dayjs 1.11.23; bốn
// trong sáu ca sẽ sai nếu code lỡ dùng giờ máy thay vì timezone truyền vào.
// Từ K-29 wallToInstant tự quy đổi (không còn dayjs.tz(string)) và vẫn phải ra
// đúng các giá trị này.
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
  // sang 03:00. Phải tự chọn dịch tới hay dịch lùi. Dự án dịch TỚI (07:30Z =
  // 03:30 EDT), theo quy ước "compatible" của Temporal và java.time; dịch lùi
  // ra 06:30Z (01:30 EST) cũng hợp lệ, chỉ là quy ước khác — và đó chính là thứ
  // Go từng làm trước K-29. Test này để ngày nào đổi cách quy đổi thì biết ngay
  // mình vừa đổi luôn cả quy ước.
  test("giờ không tồn tại thì dịch TỚI, không dịch lùi", () => {
    expect(wallToInstant("2026-03-08T02:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
});

// Bảng ca đổi DST — CHÉP NGUYÊN VĂN ở backend/internal/importer/normalize_test.go
// (dstCases). Form và import CSV phải ra cùng một instant cho cùng giờ treo tường;
// sửa một bên mà quên bên kia là hai đường nhập lệch nhau một giờ.
// Quy tắc "compatible" (Temporal, java.time): giờ lặp lại lấy lần ĐẦU, giờ không
// tồn tại dịch TỚI. Giá trị kỳ vọng đối chiếu bằng Python zoneinfo (fold=0).
const DST_CASES: [string, string, string][] = [
  ["2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
  ["2026-03-08T02:30", "America/New_York", "2026-03-08T07:30:00.000Z"],
  ["2026-11-01T00:59", "America/New_York", "2026-11-01T04:59:00.000Z"],
  ["2026-11-01T02:00", "America/New_York", "2026-11-01T07:00:00.000Z"],
  ["2026-03-08T03:00", "America/New_York", "2026-03-08T07:00:00.000Z"],
  ["2026-10-25T01:30", "Europe/London", "2026-10-25T00:30:00.000Z"],
  ["2026-03-29T01:30", "Europe/London", "2026-03-29T01:30:00.000Z"],
  ["2026-04-05T02:30", "Australia/Adelaide", "2026-04-04T16:00:00.000Z"],
  ["2026-10-04T02:30", "Australia/Adelaide", "2026-10-03T17:00:00.000Z"],
  ["2026-04-05T01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"],
  ["2026-10-04T02:15", "Australia/Lord_Howe", "2026-10-03T15:45:00.000Z"],
  ["2026-06-09T21:30", "Asia/Ho_Chi_Minh", "2026-06-09T14:30:00.000Z"],
];

// dayjs.tz đoán offset theo thời điểm HIỆN TẠI, nên giờ lặp lại từng ra kết quả
// khác nhau tuỳ ngày chạy: test 01:30 New York đỏ từ 01/11/2026 tới 14/03/2027.
// Chạy cùng bảng ở bốn mốc "bây giờ" — hai mùa của cả hai bán cầu.
describe.each([
  "2026-07-15T12:00:00Z",
  "2026-11-01T12:00:00Z",
  "2027-01-15T12:00:00Z",
  "2026-03-08T12:00:00Z",
])("wallToInstant when now is %s", (now) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each(DST_CASES)("%s in %s gives %s", (wall, tz, expected) => {
    expect(wallToInstant(wall, tz)).toBe(expected);
  });

  // Chuỗi có giây không được rơi nhầm vào nhánh "giờ không tồn tại": 03:00:00
  // ngày lùi giờ là EST (−5), không phải EDT của ngày hôm trước.
  test.each([
    ["2026-11-01T03:00:00", "America/New_York", "2026-11-01T08:00:00.000Z"],
    ["2026-11-01T01:30:45", "America/New_York", "2026-11-01T05:30:45.000Z"],
    ["2026-03-08T02:30:00", "America/New_York", "2026-03-08T07:30:00.000Z"],
  ])("wall with seconds %s in %s gives %s", (wall, tz, expected) => {
    expect(wallToInstant(wall, tz)).toBe(expected);
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

  test("định dạng theo locale tiếng Anh mà vẫn giữ timezone account", () => {
    expect(formatInstant("2026-06-09T14:30:00Z", "Asia/Ho_Chi_Minh", "en")).toBe(
      "06/09/2026 09:30 PM",
    );
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
