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
