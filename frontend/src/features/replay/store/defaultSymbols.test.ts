import type { SessionRecord } from "../engine/storage";
import { bundleFetcher, testPair } from "../engine/testBars";
import type { Bars } from "../engine/types";
import { ReplayStore } from "./ReplayStore";

// jsdom không có IndexedDB: giả phần phiên và data đã lưu, phần còn lại của storage giữ nguyên
const saved: SessionRecord[] = [];
const stored = new Map<string, Bars>();
let storeFails = false;
vi.mock("../engine/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/storage")>()),
  flushBackups: async () => {},
  listSessions: async () => saved.map((r) => ({ ...r })),
  getSession: async (id: string) => saved.find((r) => r.id === id),
  putSession: async () => {},
  getDataset: async (name: string) => stored.get(name),
  putDataset: async (name: string, d: Bars) => {
    if (storeFails) throw new Error("quota");
    stored.set(name, d);
  },
}));

const [nq, es] = testPair();
/** Nến từ chỉ số i trở đi: data CME chỉ có mấy ngày cuối, như NQ / ES tải từ TradingView. */
const tail = (b: Bars, i: number): Bars => ({ n: b.n - i, T: b.T.slice(i, b.n), O: b.O.slice(i, b.n), H: b.H.slice(i, b.n), L: b.L.slice(i, b.n), C: b.C.slice(i, b.n), V: b.V.slice(i, b.n) });
const cme = tail(nq, nq.n - 2000);

/** Phiên mở với data mặc định cũ (chỉ US100, US500), lưu lại như trong trình duyệt. */
async function savedDefaultSession(): Promise<SessionRecord> {
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es }) });
  await s.start();
  return s.sessionRecord()!;
}

beforeEach(() => {
  saved.length = 0;
  stored.clear();
  storeFails = false;
  localStorage.clear();
});

test("reopening a saved default-data session also offers symbols added to the bundle later (NQ, ES)", async () => {
  const rec = await savedDefaultSession();
  saved.push(rec);
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: cme, ES: cme }) });
  await s.start();
  const st = s.getState();
  expect(st.session?.id).toBe(rec.id);
  expect(st.names).toEqual(["US100", "US500", "NQ", "ES"]);
  expect(st.panes.map((p) => p.ds)).toEqual(["US100", "US500"]);

  // mở lại từ màn hình Phiên cũng vậy
  await s.resume(rec.id);
  expect(s.getState().names).toEqual(["US100", "US500", "NQ", "ES"]);
});

test("a session with a symbol from the user's own CSV keeps its own symbol list", async () => {
  const rec = { ...(await savedDefaultSession()), id: "csv", dataNames: ["US100", "MY_CSV"] };
  saved.push(rec);
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: cme }) });
  await s.start();
  await s.resume("csv");
  expect(s.getState().names).toEqual(["US100"]);
});

test("picking a symbol whose data starts after the replay time says from when it has data", async () => {
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: cme }) });
  await s.start();
  expect(s.getState().now).toBeLessThan(cme.T[0]);
  s.setPaneSymbol("NQ");
  expect(s.getState().panes[0].ds).toBe("NQ");
  expect(s.getState().form.contract).toBe("NQ");
  expect(s.getState().notice).toMatchObject({ key: "replay.toast.dataStartsLater", params: { symbol: "NQ" } });
  expect(s.getState().notice!.params!.from).toMatch(/\d/);

  // thời điểm replay đã nằm trong data thì không báo
  s.setPaneSymbol("US100");
  const before = s.getState().notice!.id;
  s.setPaneSymbol("US500");
  expect(s.getState().notice!.id).toBe(before);
});

// ---------- nút Cập nhật: kéo nến CME mới nhất trong trình duyệt ----------

const WEEK = 5 * 1380;
/** Cửa sổ "một tuần gần nhất" TradingView trả, kết thúc ở nến `end` của nq. */
const weekTo = (end: number): Bars => tail({ ...nq, n: end }, end - WEEK);
const cmeStore = (liveFetch: (name: string) => Promise<Bars>) =>
  new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: weekTo(nq.n - 2 * WEEK) }), liveFetch });

test("Update pulls the latest week, keeps the old one, saves it, and the next visit starts with both weeks", async () => {
  const asked: string[] = [];
  let end = nq.n - WEEK;
  const s = cmeStore(async (name) => {
    asked.push(name);
    return weekTo(end);
  });
  await s.start();
  expect(s.ds.NQ.n).toBe(WEEK);

  await s.refreshLive();
  expect(asked).toEqual(["NQ"]);
  expect(s.ds.NQ.n).toBe(2 * WEEK);
  expect(s.getState().counts.NQ).toBe(2 * WEEK);
  expect(s.getState().notice).toMatchObject({ key: "replay.toast.liveUpdated", params: { n: WEEK.toLocaleString() } });
  expect(stored.get("live:NQ")?.n).toBe(2 * WEEK);
  expect(s.getState().updating).toBe(false);

  // tuần sau bấm lại: ba tuần, không trùng nến nào
  end = nq.n;
  await s.refreshLive();
  expect(s.ds.NQ.n).toBe(3 * WEEK);
  expect([...s.ds.NQ.T]).toEqual([...nq.T.slice(nq.n - 3 * WEEK)]);

  // mở trang lại: bundle vẫn chỉ có tuần đầu, phần đã kéo về đọc lại từ trình duyệt
  const again = cmeStore(async () => weekTo(nq.n));
  await again.start();
  expect(again.ds.NQ.n).toBe(3 * WEEK);

  // bấm khi không có gì mới
  await again.refreshLive();
  expect(again.getState().notice?.key).toBe("replay.toast.liveUpToDate");
});

test("a failed pull keeps the data and says why; a failed save says the new part will not survive a reload", async () => {
  const s = cmeStore(async () => {
    throw new Error("websocket error");
  });
  await s.start();
  await s.refreshLive();
  expect(s.ds.NQ.n).toBe(WEEK);
  expect(s.getState().notice).toMatchObject({ key: "replay.toast.liveFailed", params: { error: "websocket error" } });
  expect(s.getState().updating).toBe(false);

  storeFails = true;
  const t = cmeStore(async () => weekTo(nq.n - WEEK));
  await t.start();
  await t.refreshLive();
  expect(t.ds.NQ.n).toBe(2 * WEEK);
  expect(t.getState().notice?.key).toBe("replay.toast.liveNotSaved");
});

test("an open position and closed trades on NQ keep pointing at the same candles when new bars fill a hole before them", async () => {
  // data đã có bị hở 200 nến (mất mạng giữa chừng); tuần kéo về lấp chỗ hở đó, nến sau bị đẩy lùi chỉ số
  const week = weekTo(nq.n - WEEK);
  const keep = [...week.T.keys()].filter((i) => i < 1000 || i >= 1200);
  const pick = (c: Float64Array) => Float64Array.from(keep, (i) => c[i]);
  const holey: Bars = { n: keep.length, T: pick(week.T), O: pick(week.O), H: pick(week.H), L: pick(week.L), C: pick(week.C), V: pick(week.V) };
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: holey }), liveFetch: async () => week });
  await s.start();
  s.setPaneSymbol("NQ");
  s.seekTo(s.ds.NQ.T[3000]);
  s.placeOrder(1);
  s.stepOnce();
  s.closeNow();
  s.placeOrder(-1);
  const trade = s.getState().trades[0];
  const pos = s.getState().pos!;
  await s.refreshLive();
  const d = s.ds.NQ;
  expect(d.n).toBe(WEEK);
  expect(d.T[s.getState().trades[0].i0]).toBe(trade.t0);
  expect(d.T[s.getState().trades[0].i1]).toBe(trade.t1);
  expect(d.T[s.getState().pos!.i0]).toBe(pos.t0);
  // con trỏ replay giữ nguyên thời điểm
  expect(d.T[d.cur]).toBeLessThanOrEqual(s.getState().now);
});

test("switching to another session while Update is running neither crashes nor touches the new session", async () => {
  let release!: (b: Bars) => void;
  const s = cmeStore(() => new Promise<Bars>((res) => (release = res)));
  await s.start();
  const running = s.refreshLive();
  // phiên khác, không có NQ / ES
  s.openSession([{ name: "MY_CSV", bars: es }]);
  release(weekTo(nq.n - WEEK));
  await expect(running).resolves.toBeUndefined();
  expect(s.getState().names).toEqual(["MY_CSV"]);
  expect(s.getState().updating).toBe(false);
  expect(s.getState().notice?.key).toBe("replay.toast.liveUpdated");
  // phần kéo về vẫn được giữ cho lần mở data mặc định sau
  expect(stored.get("live:NQ")?.n).toBe(2 * WEEK);
});

test("a re-packed bundle wins over the older copy saved in the browser for the same minutes", async () => {
  // bản trong trình duyệt: hai tuần, volume hỏng cả hai — tuần đầu trùng bundle, tuần sau bundle chưa có
  const both = tail({ ...nq, n: nq.n - WEEK }, nq.n - 3 * WEEK);
  const broken = { ...both, V: both.V.map(() => -47127.64) };
  stored.set("live:NQ", broken);
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es, NQ: weekTo(nq.n - 2 * WEEK) }) });
  await s.start();
  const d = s.ds.NQ;
  expect(d.n).toBe(2 * WEEK);
  expect(d.T[0]).toBe(both.T[0]);
  // tuần trong bundle lấy từ bundle, tuần chỉ trình duyệt có thì lấy từ trình duyệt
  expect(d.V[0]).toBe(nq.V[nq.n - 2 * WEEK]);
  expect(d.V[d.n - 1]).toBe(-47127.64);
});

test("the empty-chart notice also shows when a session opens, or a second chart appears, on a symbol that starts later", async () => {
  const s = new ReplayStore({ appTheme: () => "light" });
  s.openSession([{ name: "US100", bars: nq }, { name: "NQ", bars: cme }]);
  expect(s.getState().panes[1].ds).toBe("NQ");
  expect(s.getState().notice).toMatchObject({ key: "replay.toast.dataStartsLater", params: { symbol: "NQ" } });

  const t = new ReplayStore({ appTheme: () => "light" });
  t.openSession([{ name: "US100", bars: nq }, { name: "NQ", bars: cme }]);
  t.setLayout(1);
  const id = t.getState().notice!.id;
  t.setLayout(2);
  expect(t.getState().notice!.id).toBeGreaterThan(id);
  expect(t.getState().notice!.key).toBe("replay.toast.dataStartsLater");
});
