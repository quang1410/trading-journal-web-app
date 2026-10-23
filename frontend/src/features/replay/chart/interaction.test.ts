import { makeProjector } from "../engine/projector";
import { testPair } from "../engine/testBars";
import { ReplayStore } from "../store/ReplayStore";
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
  const input = new PaneInput({ store, k: 0, el, projector: () => proj, lock() {}, timeAt: () => null, onSelectHover() {}, onPress() {} });
  const ev = (x: number, y: number, mod = false) =>
    ({ clientX: x, clientY: y, button: 0, ctrlKey: false, metaKey: mod, shiftKey: false, target: el, preventDefault() {}, stopPropagation() {} }) as unknown as PointerEvent;
  return { store, ray, input, ev };
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
