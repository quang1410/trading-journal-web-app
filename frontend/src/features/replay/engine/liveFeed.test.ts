import { ApiError } from "@/lib/api";
import { fetchLiveBars, isLive, liveKey } from "./liveFeed";

afterEach(() => vi.unstubAllGlobals());

const envelope = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("pulls the latest week through the backend and turns the columns into bars", async () => {
  const fetchMock = vi.fn(async () =>
    envelope(200, {
      code: 0,
      msg: "ok",
      data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t: [1792360800, 1792360860], o: [29227, 29353.5], h: [29361.25, 29389.5], l: [29226, 29351.75], c: [29349.75, 29365.75], v: [1299, 740] },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const bars = await fetchLiveBars("NQ");
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/replay\/live\/NQ$/), expect.objectContaining({ credentials: "same-origin" }));
  expect(bars.n).toBe(2);
  expect([...bars.T]).toEqual([1792360800, 1792360860]);
  expect([bars.O[1], bars.H[1], bars.L[1], bars.C[1], bars.V[1]]).toEqual([29353.5, 29389.5, 29351.75, 29365.75, 740]);
});

test("sends the last bar it has, then reads the rest of the pages from the database route", async () => {
  const page = (t: number[], more: boolean) => envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t, o: t, h: t, l: t, c: t, v: t, more } });
  const fetchMock = vi.fn().mockResolvedValueOnce(page([120, 180], true)).mockResolvedValueOnce(page([240], true)).mockResolvedValueOnce(page([300], false));
  vi.stubGlobal("fetch", fetchMock);
  const bars = await fetchLiveBars("NQ", 60.5);
  expect(fetchMock.mock.calls.map((c) => String(c[0]).replace(/^.*\/api/, ""))).toEqual([
    "/replay/live/NQ?last=60",
    "/replay/bars/NQ?after=180",
    "/replay/bars/NQ?after=240",
  ]);
  expect([...bars.T]).toEqual([120, 180, 240, 300]);
  expect([...bars.C]).toEqual([120, 180, 240, 300]);
  expect(bars.stale).toBe(false);
});

test("with the first bar it has, also reads the saved bars before it and puts them first", async () => {
  const page = (t: number[], more: boolean) => envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t, o: t, h: t, l: t, c: t, v: t, more } });
  const fetchMock = vi.fn().mockResolvedValueOnce(page([600, 660], false)).mockResolvedValueOnce(page([60, 120], true)).mockResolvedValueOnce(page([180], false));
  vi.stubGlobal("fetch", fetchMock);
  const bars = await fetchLiveBars("NQ", 660, 240.5);
  expect(fetchMock.mock.calls.map((c) => String(c[0]).replace(/^.*\/api/, ""))).toEqual([
    "/replay/live/NQ?last=660",
    "/replay/bars/NQ?after=0&before=240",
    "/replay/bars/NQ?after=120&before=240",
  ]);
  expect([...bars.T]).toEqual([60, 120, 180, 600, 660]);
});

test("older history is optional: if it cannot be read, the new bars still come back", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t: [600], o: [1], h: [1], l: [1], c: [1], v: [1], more: false } }))
    .mockResolvedValueOnce(envelope(404, { code: 1404, msg: "not found", data: null }));
  vi.stubGlobal("fetch", fetchMock);
  const bars = await fetchLiveBars("NQ", 600, 300);
  expect([...bars.T]).toEqual([600]);
});

test("passes on that the backend could only send saved bars", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t: [60], o: [1], h: [1], l: [1], c: [1], v: [1], more: false, stale: true } })));
  const bars = await fetchLiveBars("NQ");
  expect(bars.stale).toBe(true);
  expect(bars.n).toBe(1);
});

test("passes on that the new bars came only from Yahoo", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t: [60], o: [1], h: [1], l: [1], c: [1], v: [1], more: false, backup: true } })));
  const bars = await fetchLiveBars("NQ");
  expect(bars.backup).toBe(true);
  expect(bars.stale).toBe(false);
});

test("nothing new is an empty set of bars", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => envelope(200, { code: 0, msg: "ok", data: { symbol: "NQ", ticker: "CME_MINI:NQ1!", t: [], o: [], h: [], l: [], c: [], v: [], more: false } })));
  expect((await fetchLiveBars("NQ", 999)).n).toBe(0);
});

test("a server error comes back as an ApiError with the server's message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => envelope(502, { code: 1502, msg: "không kéo được data từ TradingView", data: null })));
  const err = await fetchLiveBars("ES").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ code: 1502, message: "không kéo được data từ TradingView" });
});

test("only NQ and ES are live symbols; their saved copy has its own key", () => {
  expect(isLive("NQ")).toBe(true);
  expect(isLive("ES")).toBe(true);
  expect(isLive("US100")).toBe(false);
  expect(isLive("toString")).toBe(false);
  expect(isLive(null)).toBe(false);
  expect(liveKey("NQ")).toBe("live:NQ");
});
