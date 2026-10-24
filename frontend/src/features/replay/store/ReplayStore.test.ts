import { bundleFetcher, testPair } from "../engine/testBars";
import { bucketOf, fmtLocal, toLocal } from "../engine/time";
import { upperIdx } from "../engine/series";
import { defaultVisibility } from "../engine/drawStyle";
import { ReplayStore, type CandleEvent } from "./ReplayStore";

const [nq, es] = testPair();
const U = (d: number, h: number, m: number) => Date.UTC(2026, 0, d, h, m) / 1000;

function demoStore() {
  const store = new ReplayStore({ appTheme: () => "light", now: () => 1767225600000 });
  store.openSession([{ name: "DEMO US100", bars: nq }, { name: "DEMO US500", bars: es }]);
  return store;
}
const synced = (s: ReplayStore) => Object.values(s.ds).every((d) => d.T[d.cur] <= s.getState().now && (d.cur + 1 >= d.n || d.T[d.cur + 1] > s.getState().now));
const notice = (s: ReplayStore) => s.getState().notice?.key;

beforeEach(() => localStorage.clear());

test("a new session shows both symbols side by side, ~20 trading days before the end, in sync", () => {
  const s = demoStore();
  const st = s.getState();
  expect(st.screen).toBe("chart");
  expect(st.layout).toBe(2);
  expect(st.panes.map((p) => p.ds)).toEqual(["DEMO US100", "DEMO US500"]);
  expect(st.now).toBe(nq.T[nq.n - 1 - 20 * 1380]);
  expect(synced(s)).toBe(true);
  expect(s.candles[0].length).toBeGreaterThan(100);
  expect(s.candles[0].at(-1)!.close).toBe(nq.C[s.ds["DEMO US100"].cur]);
  expect(st.form.contract).toBe("NQ");
});

test("stepping 1m reveals one bar on both symbols; 15m stops at the candle end; big steps rebuild", () => {
  const s = demoStore();
  const events: CandleEvent[] = [];
  s.onCandles(0, (e) => events.push(e));
  const d = s.ds["DEMO US100"];
  const c0 = d.cur;
  s.stepOnce();
  expect(d.cur).toBe(c0 + 1);
  expect(synced(s)).toBe(true);
  expect(events).toEqual([{ kind: "update", candle: s.candles[0].at(-1) }]);
  s.setStepTf(15);
  s.stepOnce();
  expect(bucketOf(d.LT[d.cur], 15, "NY")).not.toBe(bucketOf(d.LT[d.cur + 1], 15, "NY"));
  events.length = 0;
  s.setStepTf(240);
  s.stepOnce();
  expect(events.at(-1)).toEqual({ kind: "reset", fit: false });
  expect(synced(s)).toBe(true);
});

test("market buy fills at the close; SL hit later closes the trade at the SL", () => {
  const s = demoStore();
  s.setForm({ slPts: "3", tpPts: "500" });
  s.placeOrder(1);
  const pos = s.getState().pos!;
  expect(pos).toMatchObject({ sym: "DEMO US100", side: 1, entry: s.lastPrice("DEMO US100"), sl: pos.entry - 3, contract: "NQ" });
  for (let i = 0; i < 2000 && s.getState().pos; i++) s.stepOnce();
  const tr = s.getState().trades[0];
  expect(tr).toMatchObject({ reason: expect.stringMatching(/^sl/), sym: "DEMO US100" });
  expect(tr.exit).toBeLessThanOrEqual(pos.entry - 3);
});

test("one order at a time; pending limit on the wrong side is refused", () => {
  const s = demoStore();
  s.placeOrder(1);
  s.placeOrder(-1);
  expect(notice(s)).toBe("replay.toast.orderOpen");
  s.closeNow();
  expect(s.getState().trades[0].reason).toBe("manual");
  const px = s.lastPrice("DEMO US100")!;
  s.setForm({ type: "limit" });
  expect(s.getState().form.price).toBe(px.toFixed(2));
  s.setForm({ price: String(px + 10) });
  s.placeOrder(1);
  expect(notice(s)).toBe("replay.toast.limitSide");
  s.setForm({ price: String(px - 0.5) });
  s.placeOrder(1);
  expect(s.getState().pending).toMatchObject({ type: "limit", price: px - 0.5 });
});

test("orders go to the selected chart's symbol, with its contract", () => {
  const s = demoStore();
  s.setActive(1);
  expect(s.getState().form.contract).toBe("ES");
  s.placeOrder(-1);
  expect(s.getState().pos).toMatchObject({ sym: "DEMO US500", contract: "ES", pv: 50 });
});

test("dragging the SL to the wrong side reverts it", () => {
  const s = demoStore();
  s.placeOrder(1);
  const sl = s.getState().pos!.sl;
  s.dragLine("sl", s.lastPrice("DEMO US100")! + 5);
  s.endDragLine("sl", sl);
  expect(s.getState().pos!.sl).toBe(sl);
  expect(notice(s)).toBe("replay.toast.slSide");
});

test("jump to date: in range, out of range (demo hint), weekend → next candle, blocked with an open order", () => {
  const s = demoStore();
  s.seekDate("2026-01-15T10:00");
  expect(s.getState().now).toBe(U(15, 15, 0));
  expect(synced(s)).toBe(true);
  s.seekDate("2026-10-01T07:16");
  expect(notice(s)).toBe("replay.toast.outOfRangeDemo");
  expect(s.getState().now).toBe(U(15, 15, 0));
  s.seekDate("2026-01-17T12:00"); // Saturday
  expect(notice(s)).toBe("replay.toast.noBarAt");
  expect(s.getState().now).toBe(U(18, 23, 0)); // Sunday 18:00 New York
  s.seekDate("garbage");
  expect(notice(s)).toBe("replay.toast.pickDate");
  s.placeOrder(1);
  s.seekDate("2026-01-20T10:00");
  expect(notice(s)).toBe("replay.toast.closeBeforeSeek");
});

test("select bar: replay cuts at the end of the clicked candle", () => {
  const s = demoStore();
  const d = s.ds["DEMO US100"];
  const target = s.candles[0][s.candles[0].length - 40];
  s.selectBar(0, target.time);
  expect(bucketOf(d.LT[d.cur], 5, "NY")).toBe(target.time);
  expect(bucketOf(d.LT[d.cur + 1], 5, "NY")).toBeGreaterThan(target.time);
  expect(s.candles[0].at(-1)!.time).toBe(target.time);
});

test("time zone change recomputes local times and keeps the same moment", () => {
  const s = demoStore();
  const now = s.getState().now;
  s.setZone("VN");
  expect(s.ds["DEMO US100"].LT[0]).toBe(nq.T[0] + 7 * 3600);
  expect(s.getState().now).toBe(now);
  expect(s.candles[0].at(-1)!.time).toBe(bucketOf(now - (now % 60) + 7 * 3600, 5, "VN"));
});

test("drawings: add, delete, clear, undo and redo", () => {
  const s = demoStore();
  const d = s.addDrawing({ sym: "DEMO US100", type: "trend", pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] });
  s.addHLine("DEMO US100", 21000);
  expect(s.getState().selected).toBe(d.id);
  s.deleteSelected();
  expect(s.getState().drawings).toEqual([]);
  s.undo();
  expect(s.getState().drawings).toHaveLength(1);
  s.clearDrawings();
  expect(s.getState().drawings.length + s.getState().hlines.length).toBe(0);
  s.undo();
  expect(s.getState().drawings.length + s.getState().hlines.length).toBe(2);
  s.redo();
  expect(s.getState().drawings).toEqual([]);
  s.undo();
  s.undo();
  s.undo();
  s.undo();
  expect(notice(s)).toBe("replay.toast.nothingToUndo");
});

const line = (s: ReplayStore, p = 1) => s.addDrawing({ sym: "DEMO US100", type: "trend", pts: [{ t: 1, p }, { t: 2, p: p + 1 }] });

test("settings dialog: edits preview live, Cancel restores, Ok is one undo step", () => {
  const s = demoStore();
  const d = line(s);
  s.openDrawDialog(d.id);
  expect(s.getState()).toMatchObject({ drawDialog: d.id, selected: d.id });
  s.previewDrawing({ color: "#f23645", width: 4 });
  s.previewDrawing({ note: "mss" });
  expect(s.getState().drawings[0]).toMatchObject({ color: "#f23645", width: 4, note: "mss" });
  s.closeDrawDialog(false);
  expect(s.getState().drawDialog).toBeNull();
  expect(s.getState().drawings[0]).toEqual(d);

  s.openDrawDialog(d.id);
  s.previewDrawing({ color: "#f23645" });
  s.previewDrawing({ note: "  BSL " });
  s.closeDrawDialog(true);
  expect(s.getState().drawings[0]).toMatchObject({ color: "#f23645", note: "BSL" });
  s.undo();
  expect(s.getState().drawings[0]).toEqual(d);
});

test("an emptied note is dropped on Ok; Ok without changes adds no undo step", () => {
  const s = demoStore();
  const d = s.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: 1, p: 5 }], note: "old" });
  s.openDrawDialog(d.id);
  s.previewDrawing({ note: "   " });
  s.closeDrawDialog(true);
  expect(s.getState().drawings[0].note).toBeUndefined();
  s.openDrawDialog(d.id);
  s.closeDrawDialog(true);
  s.undo(); // bỏ việc xoá ghi chú; lần Ok không đổi gì không chiếm bước nào
  expect(s.getState().drawings[0].note).toBe("old");
});

test("a new drawing reuses the style last set for the same tool, not other tools", () => {
  const s = demoStore();
  const d = line(s);
  s.styleDrawing(d.id, { color: "#ff9800", dash: "dashed" });
  s.setDraft({ pane: 0, down: false, wait: false, x0: 0, y0: 0, d: { id: -1, sym: "DEMO US100", type: "trend", pts: [{ t: 5, p: 5 }, { t: 6, p: 6 }] } });
  s.finishDraft();
  expect(s.getState().drawings[1]).toMatchObject({ color: "#ff9800", dash: "dashed", pts: [{ t: 5, p: 5 }, { t: 6, p: 6 }] });
  s.setDraft({ pane: 0, down: false, wait: false, x0: 0, y0: 0, d: { id: -1, sym: "DEMO US100", type: "hray", pts: [{ t: 5, p: 5 }] } });
  s.finishDraft();
  expect(s.getState().drawings[2].color).toBeUndefined();
});

test("a new drawing does not inherit Visibility from the last one (it would vanish right after drawing)", () => {
  const s = demoStore();
  const d = line(s);
  s.openDrawDialog(d.id);
  s.previewDrawing({ color: "#ff9800", vis: { ...defaultVisibility(), min: { on: false, from: 1, to: 59 } } });
  s.closeDrawDialog(true);
  s.setDraft({ pane: 0, down: false, wait: false, x0: 0, y0: 0, d: { id: -1, sym: "DEMO US100", type: "trend", pts: [{ t: 5, p: 5 }, { t: 6, p: 6 }] } });
  s.finishDraft();
  expect(s.getState().drawings[1].color).toBe("#ff9800");
  expect(s.getState().drawings[1].vis).toBeUndefined();
});

test("undo / redo wait while the settings dialog is open; Hide from the bar keeps the dialog's edits", () => {
  const s = demoStore();
  const d = line(s);
  s.openDrawDialog(d.id);
  s.previewDrawing({ width: 4 });
  s.undo();
  s.redo();
  expect(s.getState().drawings[0].width).toBe(4);
  expect(s.getState().drawDialog).toBe(d.id);
  // Ẩn khi cửa sổ còn mở: phần đã sửa được giữ, cửa sổ đóng, Cancel sau đó không làm hình hiện lại
  s.hideDrawing(d.id);
  expect(s.getState().drawDialog).toBeNull();
  s.closeDrawDialog(false);
  expect(s.getState().drawings[0]).toMatchObject({ width: 4, hidden: true });
  s.undo();
  expect(s.getState().drawings[0]).toMatchObject({ width: 4 });
  expect(s.getState().drawings[0].hidden).toBeFalsy();
  s.undo();
  expect(s.getState().drawings[0]).toEqual(d);
});

test("lock, hide / show hidden, clone, copy-paste and visual order", () => {
  const s = demoStore();
  const a = line(s, 1);
  const b = line(s, 10);
  s.toggleLock(a.id);
  expect(s.getState().drawings[0].locked).toBe(true);
  s.hideDrawing(a.id);
  expect(s.getState()).toMatchObject({ selected: null });
  expect(s.getState().drawings[0].hidden).toBe(true);
  s.showHidden();
  expect(s.getState().drawings[0].hidden).toBe(false);

  const c = s.cloneDrawing(a.id)!;
  expect(c).toMatchObject({ pts: a.pts, locked: false });
  expect(c.id).not.toBe(a.id);
  expect(s.getState().selected).toBe(c.id);

  s.copyDrawing(b.id);
  s.pasteDrawing("DEMO US500");
  expect(s.getState().drawings.at(-1)).toMatchObject({ sym: "DEMO US500", pts: b.pts });

  // thứ tự lớp chỉ tính trong các hình cùng mã: [a, b, c] (US100)
  s.orderDrawing(c.id, "back");
  expect(s.getState().drawings.filter((x) => x.sym === "DEMO US100").map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  s.orderDrawing(c.id, "forward");
  expect(s.getState().drawings.filter((x) => x.sym === "DEMO US100").map((x) => x.id)).toEqual([a.id, c.id, b.id]);
  s.undo();
  expect(s.getState().drawings.filter((x) => x.sym === "DEMO US100").map((x) => x.id)).toEqual([c.id, a.id, b.id]);
});

test("text tool: new text, edit, and emptying an existing text deletes it", () => {
  const s = demoStore();
  s.openTextEdit({ pane: 0, x: 1, y: 1, pt: { t: 1, p: 1 }, existingId: null });
  s.commitText("hello", true);
  const d = s.getState().drawings[0];
  expect(d).toMatchObject({ type: "text", text: "hello", sym: "DEMO US100" });
  s.openTextEdit({ pane: 0, x: 1, y: 1, pt: d.pts[0], existingId: d.id });
  s.commitText("", true);
  expect(s.getState().drawings).toEqual([]);
});

test("a saved session restores time, layout, orders, drawings and inputs", () => {
  const s = demoStore();
  s.setActive(1);
  s.setPaneTf(15);
  s.setForm({ qty: "3", balance0: "20000" });
  s.placeOrder(1);
  s.stepOnce();
  s.addDrawing({ sym: "DEMO US500", type: "rect", pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }], note: "zone" });
  const rec = s.sessionRecord()!;
  const t = new ReplayStore({ appTheme: () => "light" });
  t.openSession([{ name: "DEMO US100", bars: nq }, { name: "DEMO US500", bars: es }], rec);
  const st = t.getState();
  expect(st.now).toBe(s.getState().now);
  expect(st.active).toBe(1);
  expect(st.panes[1].tf).toBe(15);
  expect(st.form).toMatchObject({ qty: "3", balance0: "20000", contract: "ES" });
  expect(st.pos).toMatchObject({ sym: "DEMO US500", qty: 3, i0: upperIdx(t.ds["DEMO US500"], rec.pos!.t0) });
  expect(st.drawings[0]).toMatchObject({ type: "rect", note: "zone" });
  expect(st.session?.id).toBe(rec.id);
});

test("settings: live preview, Cancel restores, OK saves to the browser", () => {
  const s = demoStore();
  s.openSettings();
  s.setChartStyle({ bg: "rgb(1, 2, 3)" });
  s.setIct({ ...s.getState().ict, maxDays: 3 });
  s.setZone("UTC");
  s.closeSettings(false);
  expect(s.getState().chartStyle.bg).toBe("var(--replay-light-bg)");
  expect(s.getState().ict.maxDays).toBe(1);
  expect(s.getState().zone).toBe("NY");
  s.openSettings();
  s.setChartStyle({ bg: "rgb(1, 2, 3)" });
  s.closeSettings(true);
  expect(JSON.parse(localStorage.getItem("journal.replay.chartStyle")!).bg).toBe("rgb(1, 2, 3)");
  expect(new ReplayStore({ appTheme: () => "dark" }).getState().chartStyle.bg).toBe("rgb(1, 2, 3)");
});

test("the chart follows the app's light/dark theme until the user picks colors", () => {
  expect(new ReplayStore({ appTheme: () => "dark" }).getState().chartStyle.bg).toBe("var(--replay-dark-bg)");
  expect(new ReplayStore({ appTheme: () => "light" }).getState().chartStyle.bg).toBe("var(--replay-light-bg)");
});

test("SMT alert is shown once per divergence, only when turned on", () => {
  const s = demoStore();
  const line = { k0: 1, k1: 9, p0: 1, p1: 2, bull: false, time: 123 };
  s.noticeSmt(0, line, "DEMO US500");
  expect(notice(s)).toBeUndefined();
  s.setIct({ ...s.getState().ict, smt: { ...s.getState().ict.smt, alert: true } });
  s.noticeSmt(0, line, "DEMO US500");
  expect(s.getState().notice).toMatchObject({ key: "replay.toast.smtBear", params: { symbol: "DEMO US100", other: "DEMO US500", tf: "5m" } });
  const id = s.getState().notice!.id;
  s.noticeSmt(0, line, "DEMO US500");
  expect(s.getState().notice!.id).toBe(id);
});

test("boot opens the default data (public/replay-data) as a new session", async () => {
  const s = new ReplayStore({ appTheme: () => "light", fetcher: bundleFetcher({ US100: nq, US500: es }) });
  await s.start();
  const st = s.getState();
  expect(st.screen).toBe("chart");
  expect(st.names).toEqual(["US100", "US500"]);
  expect(st.defaultInfo).toMatchObject({ names: ["US100", "US500"] });
  expect(s.ds.US500.C[100]).toBeCloseTo(es.C[100], 3);
});

test("boot without default data shows the session screen", async () => {
  const s = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  await s.start();
  expect(s.getState().screen).toBe("sessions");
});

// ---------- điều hướng nhanh ----------
const nyClock = (s: ReplayStore) => {
  const lt = toLocal(s.getState().now, "NY");
  return { day: new Date(lt * 1000).getUTCDay(), hm: fmtLocal(lt).slice(11) };
};

test("jumpNext fast-forwards to the next New York session start and remembers the action", () => {
  const s = demoStore();
  const t0 = s.getState().now;
  s.jumpNext("ny");
  expect(s.getState().now).toBeGreaterThan(t0);
  expect(nyClock(s).hm).toBe("09:15");
  expect(synced(s)).toBe(true);
  const first = s.getState().now;
  // bấm lại phần chính của nút: cùng hành động, sang ngày giao dịch kế tiếp
  s.jumpNext();
  expect(nyClock(s).hm).toBe("09:15");
  expect(s.getState().now - first).toBeGreaterThanOrEqual(86400);
  s.jumpNext("nextSilverBullet");
  expect(s.getState().navAction).toBe("nextSilverBullet");
  expect(["03:00", "09:15", "14:00"]).toContain(nyClock(s).hm);
  expect(JSON.parse(localStorage.getItem("journal.replay.navAction")!)).toBe("nextSilverBullet");
  expect(demoStore().getState().navAction).toBe("nextSilverBullet");
});

test("jumpNext honours skipped days and saved times, and the settings survive a reload", () => {
  const s = demoStore();
  const nav = s.getState().nav;
  s.setNav({ slots: { ...nav.slots, london: { time: "02:30", star: true } }, skipDays: [1, 2, 3] });
  for (let k = 0; k < 6; k++) {
    s.jumpNext("london");
    expect(nyClock(s).hm).toBe("02:30");
    expect([4, 5]).toContain(nyClock(s).day);
  }
  const again = demoStore().getState().nav;
  expect(again.slots.london).toEqual({ time: "02:30", star: true });
  expect(again.skipDays).toEqual([1, 2, 3]);
});

test("jumpNext keeps an open position running through the skipped bars instead of refusing", () => {
  const s = demoStore();
  s.setForm({ slPts: "1", tpPts: "1" });
  s.placeOrder(1);
  expect(s.getState().pos).not.toBeNull();
  s.jumpNext("dayOpen");
  expect(notice(s)).not.toBe("replay.toast.closeBeforeSeek");
  // SL/TP 1 điểm chắc chắn bị chạm trong cả một phiên
  expect(s.getState().pos).toBeNull();
  expect(s.getState().trades).toHaveLength(1);
});

test("jumpNext at the end of the data says so and does not move", () => {
  const s = demoStore();
  const d = s.ds["DEMO US100"];
  s.seekTo(d.T[d.n - 10]);
  const t = s.getState().now;
  s.jumpNext("ny");
  expect(notice(s)).toBe("replay.toast.noNextNav");
  expect(s.getState().now).toBe(t);
});
