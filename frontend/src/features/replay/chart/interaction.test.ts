import { makeProjector } from "../engine/projector";
import { testPair } from "../engine/testBars";
import { ReplayStore } from "../store/ReplayStore";
import { vi } from "vitest";
import { PaneInput } from "./interaction";

const SYM = "DEMO US100";

function setup() {
  const [nq, es] = testPair();
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  store.openSession([{ name: SYM, bars: nq }, { name: "DEMO US500", bars: es }]);
  const st = store.getState();
  const c = store.candles[0];
  const proj = makeProjector({
    candles: c, tf: st.panes[0].tf, zone: st.zone, axis: { a: 100 - (c.length - 40) * 10, sp: 10 }, plotW: 800, plotH: 500,
    priceToY: (p) => 1000 - p / 25, yToPrice: (y) => (1000 - y) * 25,
  });
  // tia ngang ở giá 20000 (y = 200), bắt đầu từ nến thứ 30 tính từ cuối (x = 200)
  const ray = store.addDrawing({ sym: SYM, type: "hray", pts: [{ t: c[c.length - 30].time, p: 20000 }] });
  store.select(null);
  const el = document.createElement("div");
  // trục giá giả: `calls` ghi lại mọi lần bật / tắt Auto
  let auto = true;
  const calls: boolean[] = [];
  const input = new PaneInput({
    store, k: 0, el, projector: () => proj, lock() {}, timeAt: () => null, onSelectHover() {}, onPress() {},
    autoScale: () => auto,
    setAutoScale: (on) => {
      auto = on;
      calls.push(on);
    },
  });
  const ev = (x: number, y: number, mod = false) =>
    ({ clientX: x, clientY: y, button: 0, ctrlKey: false, metaKey: mod, shiftKey: false, target: el, preventDefault() {}, stopPropagation() {} }) as unknown as PointerEvent;
  return { store, ray, proj, input, ev, calls, isAuto: () => auto, setAuto: (v: boolean) => void (auto = v) };
}

test("⌘ + click on a drawing without dragging selects it and leaves no copy behind", () => {
  const { store, ray, input, ev } = setup();
  input.down(ev(600, 200, true));
  input.move(ev(601, 201, true)); // rung tay
  input.up(ev(601, 201, true));
  expect(store.getState().drawings).toHaveLength(1);
  expect(store.getState().selected).toBe(ray.id);
});

test("⌘ + drag moves a copy and leaves the original; one undo removes the copy", () => {
  const { store, ray, input, ev } = setup();
  input.down(ev(600, 200, true));
  input.move(ev(600, 240, true));
  input.up(ev(600, 240, true));
  const [orig, copy] = store.getState().drawings;
  expect(orig).toEqual(ray);
  expect(copy.pts[0].p).toBe(19000);
  expect(store.getState().selected).toBe(copy.id);
  store.undo();
  expect(store.getState().drawings).toEqual([ray]);
});

describe("dragging the chart with auto-scale on (like TradingView)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("a vertical drag on empty chart turns auto-scale off and leaves it off", () => {
    const { input, ev, calls, isAuto } = setup();
    input.down(ev(400, 400));
    input.move(ev(402, 420));
    input.up(ev(402, 420));
    vi.runAllTimers();
    expect(calls).toEqual([false]);
    expect(isAuto()).toBe(false);
  });

  test("a horizontal drag gives auto-scale back during the drag and ends with it on", () => {
    const { input, ev, calls, isAuto } = setup();
    input.down(ev(400, 400));
    input.move(ev(430, 402));
    expect(calls).toEqual([false, true]);
    input.up(ev(430, 402));
    expect(calls).toEqual([false, true, false]); // tắt để thư viện dọn điểm cuộn ở mouseup
    vi.runAllTimers();
    expect(calls).toEqual([false, true, false, true]);
    expect(isAuto()).toBe(true);
  });

  test("a click without dragging restores auto-scale", () => {
    const { input, ev, isAuto } = setup();
    input.down(ev(400, 400));
    input.up(ev(400, 400));
    vi.runAllTimers();
    expect(isAuto()).toBe(true);
  });

  test("a cancelled drag restores auto-scale", () => {
    const { input, ev, isAuto } = setup();
    input.down(ev(400, 400));
    input.cancel(ev(401, 401));
    vi.runAllTimers();
    expect(isAuto()).toBe(true);
  });

  test("auto-scale is not touched when it is already off, or when the press lands on a drawing", () => {
    const a = setup();
    a.setAuto(false);
    a.input.down(a.ev(400, 400));
    a.input.move(a.ev(400, 440));
    a.input.up(a.ev(400, 440));
    const b = setup();
    b.input.down(b.ev(600, 200)); // (600, 200) nằm trên tia ngang
    b.input.up(b.ev(600, 200));
    vi.runAllTimers();
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);
  });
});

test("holding Shift while drawing a rectangle makes it a square in pixels", () => {
  const { store, proj, input, ev } = setup();
  store.setMagnet(false);
  store.setTool("rect");
  const shift = (x: number, y: number) => ({ ...ev(x, y), shiftKey: true }) as PointerEvent;
  input.down(shift(300, 300));
  input.move(shift(360, 330)); // dx = 60, dy = 30 → cạnh 60 → góc đối diện (360, 360)
  input.up(shift(360, 330));
  const rect = store.getState().drawings.find((d) => d.type === "rect")!;
  // điểm hình vẽ lưu giờ UTC: so với chính bộ đổi toạ độ ở hai góc mong đợi
  expect(rect.pts[0]).toEqual({ ...proj.fromXY(300, 300), p: 17500 });
  expect(rect.pts[1]).toEqual({ ...proj.fromXY(360, 360), p: 16000 });
  expect(rect.pts[1]).not.toEqual(proj.fromXY(360, 330));
});

test("a hidden-all chart ignores presses on where a drawing would be", () => {
  const { store, input, ev } = setup();
  store.toggleHideAll();
  input.down(ev(600, 200));
  input.up(ev(600, 200));
  expect(store.getState().selected).toBeNull();
});

const middle = (ev: (x: number, y: number) => PointerEvent, x: number, y: number) => ({ ...ev(x, y), button: 1 }) as PointerEvent;

test("a middle click on a drawing deletes it in one undoable step; a locked drawing stays", () => {
  const { store, ray, input, ev } = setup();
  input.down(middle(ev, 600, 200));
  expect(store.getState().drawings).toEqual([]);
  store.undo();
  expect(store.getState().drawings).toEqual([ray]);
  store.updateDrawing(ray.id, { locked: true });
  input.down(middle(ev, 600, 200));
  expect(store.getState().drawings).toHaveLength(1);
});

test("a middle click on empty chart, or while a tool is active, does nothing", () => {
  const { store, input, ev } = setup();
  input.down(middle(ev, 400, 400));
  store.setTool("trend");
  input.down(middle(ev, 600, 200));
  expect(store.getState().drawings).toHaveLength(1);
  expect(store.getState().draft).toBeNull();
});
