import { bucketOf, computeLocal, localToUtc, nyDst, parseInputValue, toInputValue, toLocal, zoneOffset } from "./time";

const U = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

test("New York DST starts 2nd Sunday of March 07:00 UTC and ends 1st Sunday of November 06:00 UTC", () => {
  expect(nyDst(2026)).toEqual([U(2026, 3, 8, 7), U(2026, 11, 1, 6)]);
  expect(nyDst(2025)).toEqual([U(2025, 3, 9, 7), U(2025, 11, 2, 6)]);
});

test("zone offsets: NY is -5h in winter and -4h in summer, VN +7h, UTC 0", () => {
  expect(zoneOffset(U(2026, 1, 15, 12), "NY")).toBe(-5 * 3600);
  expect(zoneOffset(U(2026, 7, 15, 12), "NY")).toBe(-4 * 3600);
  expect(zoneOffset(U(2026, 3, 8, 6, 59), "NY")).toBe(-5 * 3600);
  expect(zoneOffset(U(2026, 3, 8, 7), "NY")).toBe(-4 * 3600);
  expect(zoneOffset(U(2026, 7, 15), "VN")).toBe(7 * 3600);
  expect(zoneOffset(U(2026, 7, 15), "UTC")).toBe(0);
});

test("computeLocal matches toLocal for every bar, across the DST switch and a year boundary", () => {
  const T = Float64Array.from({ length: 2000 }, (_, i) => U(2025, 12, 31, 20) + i * 3600 * 37);
  for (const zone of ["NY", "VN", "UTC"] as const) {
    const LT = computeLocal(T, zone);
    T.forEach((t, i) => expect(LT[i]).toBe(toLocal(t, zone)));
  }
});

test("localToUtc inverts toLocal outside the DST switch hour", () => {
  for (const t of [U(2026, 1, 5, 14, 30), U(2026, 8, 3, 9), U(2026, 12, 24, 23, 59)]) {
    for (const zone of ["NY", "VN", "UTC"] as const) expect(localToUtc(toLocal(t, zone), zone)).toBe(t);
  }
});

test("buckets: minutes from midnight, 4H and daily candles anchored at 18:00 in New York", () => {
  const lt = U(2026, 1, 6, 10, 47); // local 10:47
  expect(bucketOf(lt, 1, "NY")).toBe(U(2026, 1, 6, 10, 47));
  expect(bucketOf(lt, 5, "NY")).toBe(U(2026, 1, 6, 10, 45));
  expect(bucketOf(lt, 15, "NY")).toBe(U(2026, 1, 6, 10, 45));
  expect(bucketOf(lt, 60, "NY")).toBe(U(2026, 1, 6, 10));
  expect(bucketOf(lt, 240, "NY")).toBe(U(2026, 1, 6, 10));
  expect(bucketOf(U(2026, 1, 6, 9, 59), 240, "NY")).toBe(U(2026, 1, 6, 6));
  expect(bucketOf(lt, 240, "UTC")).toBe(U(2026, 1, 6, 8));
  // 18:00 Monday belongs to Tuesday's daily candle (CME session)
  expect(bucketOf(U(2026, 1, 5, 18), 1440, "NY")).toBe(U(2026, 1, 6));
  expect(bucketOf(U(2026, 1, 5, 17, 59), 1440, "NY")).toBe(U(2026, 1, 5));
  expect(bucketOf(U(2026, 1, 5, 18), 1440, "UTC")).toBe(U(2026, 1, 5));
});

test("datetime-local values round-trip", () => {
  const lt = U(2026, 10, 1, 7, 16);
  expect(toInputValue(lt)).toBe("2026-10-01T07:16");
  expect(parseInputValue("2026-10-01T07:16")).toBe(lt);
  expect(parseInputValue("not a date")).toBeNull();
});
