import { barsOf, testPair } from "./testBars";
import { lowerBound } from "./series";
import { DEFAULT_NAV, NAV_TIMES, actionItems, nextJump, sanitizeNav, validateNav, type NavSettings } from "./nav";

// data giả lập theo giờ CME (Chủ nhật 18:00 – thứ Sáu 17:00 giờ NY), bắt đầu Chủ nhật 04/01/2026
const [nq] = testPair();
const U = (d: number, h: number, m = 0) => Date.UTC(2026, 0, d, h, m) / 1000;
// tháng 1 New York là giờ mùa đông: UTC = giờ NY + 5
const NY = (d: number, h: number, m = 0) => U(d, h + 5, m);
const at = (t: number) => lowerBound(nq.T, t);
const jump = (from: number, times: string[], skip: number[] = [], dayOpen = "17:00") => {
  const i = nextJump(nq.T, at(from), times, dayOpen, skip);
  return i == null ? null : nq.T[i];
};

test("jumps to the next occurrence of a time, then to the one after it on the next call", () => {
  expect(jump(NY(5, 8), ["09:15"])).toBe(NY(5, 9, 15));
  // đang đứng đúng nến 09:15 thì lần bấm sau sang ngày hôm sau, không đứng yên
  expect(jump(NY(5, 9, 15), ["09:15"])).toBe(NY(6, 9, 15));
  expect(jump(NY(5, 10), ["09:15"])).toBe(NY(6, 9, 15));
});

test("several times: picks whichever comes first", () => {
  expect(jump(NY(5, 10), ["03:00", "09:15", "14:00"])).toBe(NY(5, 14));
  expect(jump(NY(5, 15), ["03:00", "09:15", "14:00"])).toBe(NY(6, 3));
});

test("skipped days are judged by trading day, which rolls over at the day open", () => {
  // bỏ thứ Ba (2): 09:15 thứ Ba bị bỏ, tới thứ Tư
  expect(jump(NY(5, 10), ["09:15"], [2])).toBe(NY(7, 9, 15));
  // 19:00 thứ Hai thuộc ngày giao dịch thứ Ba (sau 17:00), nên bỏ thứ Ba thì bỏ luôn nó
  expect(jump(NY(5, 10), ["19:00"], [2])).toBe(NY(6, 19));
  // nến 19:00 Chủ nhật là phiên Á của thứ Hai: bỏ thứ Hai (1) thì sang 19:00 thứ Hai
  expect(jump(NY(9, 10), ["19:00"])).toBe(NY(11, 19));
  expect(jump(NY(9, 10), ["19:00"], [1])).toBe(NY(12, 19));
});

test("a time with no bars (weekend, daily break) moves to the next bar of the same trading day only", () => {
  // thứ Sáu 19:00 và thứ Bảy 19:00 chợ đóng: không đáp xuống nến 18:00 Chủ nhật, mà tới 19:00 Chủ nhật
  expect(jump(NY(9, 18), ["19:00"])).toBe(NY(11, 19));
  // 17:00 là giờ nghỉ của CME: Next Day Open đáp xuống nến đầu tiên của ngày mới, 18:00
  expect(jump(NY(5, 10), ["17:00"])).toBe(NY(5, 18));
  // thứ Sáu 17:00 → ngày giao dịch thứ Bảy không có nến; ngày kế tiếp có nến là thứ Hai (mở 18:00 Chủ nhật)
  expect(jump(NY(9, 10), ["17:00"])).toBe(NY(11, 18));
});

test("returns null past the end of the data, or when every day is skipped", () => {
  expect(jump(nq.T[nq.n - 30], ["09:15"])).toBeNull();
  expect(jump(NY(5, 10), ["09:15"], [0, 1, 2, 3, 4, 5, 6])).toBeNull();
  expect(nextJump(nq.T, at(NY(5, 10)), [], "17:00", [])).toBeNull();
});

test("New York daylight saving time moves the UTC moment, not the wall-clock time", () => {
  // giờ mùa hè bắt đầu Chủ nhật 08/03/2026: thứ Sáu 06/03 09:15 EST = 14:15 UTC, thứ Hai 09/03 09:15 EDT = 13:15 UTC
  const t0 = Date.UTC(2026, 2, 6, 14, 0) / 1000;
  const rows: [number, number, number, number, number][] = [];
  for (let m = 0; m < 4 * 1440; m++) rows.push([m, 1, 1, 1, 1]);
  const b = barsOf(t0, rows);
  const i1 = nextJump(b.T, 0, ["09:15"], "17:00", [])!;
  expect(b.T[i1]).toBe(Date.UTC(2026, 2, 6, 14, 15) / 1000);
  const i2 = nextJump(b.T, i1, ["09:15"], "17:00", [0, 6])!;
  expect(b.T[i2]).toBe(Date.UTC(2026, 2, 9, 13, 15) / 1000);
});

test("defaults match the reference screenshot", () => {
  const s = DEFAULT_NAV.slots;
  expect([s.asian.time, s.london.time, s.ny.time, s.dayOpen.time]).toEqual(["19:00", "02:00", "09:15", "17:00"]);
  expect([s.sbLondon.time, s.sbNyAm.time, s.sbNyPm.time]).toEqual(["03:00", "09:15", "14:00"]);
  expect(DEFAULT_NAV.skipDays).toEqual([]);
  expect(NAV_TIMES).toHaveLength(96);
  expect(NAV_TIMES.slice(0, 2)).toEqual(["00:00", "00:15"]);
  expect(NAV_TIMES.at(-1)).toBe("23:45");
});

test("aggregate actions cover their whole group; a single item is just itself", () => {
  expect(actionItems("nextSession")).toEqual(["asian", "london", "ny"]);
  expect(actionItems("nextSilverBullet")).toEqual(["sbLondon", "sbNyAm", "sbNyPm"]);
  expect(actionItems("dayOpen")).toEqual(["dayOpen"]);
});

test("sanitizeNav keeps valid saved values and repairs the rest", () => {
  expect(sanitizeNav(null)).toEqual(DEFAULT_NAV);
  expect(sanitizeNav("junk")).toEqual(DEFAULT_NAV);
  const s = sanitizeNav({ slots: { ny: { time: "09:30", star: false }, london: { time: "25:00", star: "yes" } }, skipDays: [6, 6, 0, 9, "x"] });
  expect(s.slots.ny).toEqual({ time: "09:30", star: false });
  expect(s.slots.london).toEqual(DEFAULT_NAV.slots.london);
  expect(s.slots.asian).toEqual(DEFAULT_NAV.slots.asian);
  expect(s.skipDays).toEqual([0, 6]);
});

test("validateNav refuses skipping all seven days", () => {
  const all: NavSettings = { ...DEFAULT_NAV, skipDays: [0, 1, 2, 3, 4, 5, 6] };
  expect(validateNav(DEFAULT_NAV)).toBeNull();
  expect(validateNav(all)).toBe("replay.nav.allSkipped");
});
