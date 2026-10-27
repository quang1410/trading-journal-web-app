import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { LocaleProvider } from "@/i18n";
import type { Drawing } from "../engine/drawings";
import { makeProjector } from "../engine/projector";
import { testPair } from "../engine/testBars";
import { ReplayProvider } from "../store/context";
import { ReplayStore } from "../store/ReplayStore";
import { Overlay } from "./Overlay";

const SYM = "DEMO US100";

function setup(list: Omit<Drawing, "id" | "sym">[], select = false) {
  const [nq, es] = testPair();
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  store.openSession([{ name: SYM, bars: nq }, { name: "DEMO US500", bars: es }]);
  const st = store.getState();
  const c = store.candles[0];
  const proj = makeProjector({
    candles: c, tf: st.panes[0].tf, zone: st.zone, axis: { a: 100 - (c.length - 40) * 10, sp: 10 }, plotW: 800, plotH: 500,
    priceToY: (p) => 1000 - p / 25, yToPrice: (y) => (1000 - y) * 25,
  });
  // hai điểm nằm trong khung nhìn: nến thứ 10 và 30 từ cuối
  const t = (k: number) => c[c.length - k].time;
  const ids = list.map((d) => store.addDrawing({ sym: SYM, ...d, pts: d.pts.length ? d.pts : [{ t: t(30), p: 20000 }, { t: t(10), p: 20500 }] }).id);
  if (!select) store.select(null);
  const { container } = render(
    <LocaleProvider>
      <ReplayProvider store={store}>
        <Overlay k={0} proj={proj} fg="black" />
      </ReplayProvider>
    </LocaleProvider>,
  );
  return { store, ids, container, t };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("journal.locale", "en");
});

test("trend line: middle point, price labels at both ends, extension and an arrow end", () => {
  const { container } = setup([{ type: "trend", pts: [], midPoint: true, priceLabels: true, extR: true, endL: "arrow" }]);
  expect(container.querySelector('[data-role="mid-point"]')).not.toBeNull();
  expect([...container.querySelectorAll('[data-role="price-tag"] text')].map((x) => x.textContent)).toEqual(["20000.00", "20500.00"]);
  const line = container.querySelector('[data-shape="trend"] line')!;
  expect(Number(line.getAttribute("x2"))).toBe(800); // kéo dài tới mép phải
  expect(line.getAttribute("marker-start")).toMatch(/^url\(#replay-arrow-0-/);
});

test("stats show while the line is selected (or always, when asked)", () => {
  setup([{ type: "trend", pts: [], stats: ["priceRange", "percent", "bars"] }], true);
  expect(screen.getByText("+500.00 (+2.50%)")).toBeInTheDocument();
  expect(screen.getByText("20 bars")).toBeInTheDocument();
});

test("horizontal ray puts its price on the axis; the rectangle draws its middle line", () => {
  const { container } = setup([
    { type: "hray", pts: [{ t: 0, p: 21000 }] },
    { type: "rect", pts: [], midLine: true },
  ]);
  expect([...container.querySelectorAll('[data-role="axis-price"] text')].map((x) => x.textContent)).toContain("21000.00");
  expect(container.querySelector('[data-role="mid-line"]')).not.toBeNull();
});

test("hidden drawings and drawings switched off for this timeframe are not drawn", () => {
  const { container } = setup([
    { type: "trend", pts: [], hidden: true },
    { type: "rect", pts: [], vis: { min: { on: false, from: 1, to: 59 }, hour: { on: true, from: 1, to: 24 }, day: { on: true, from: 1, to: 366 } } },
    { type: "hray", pts: [{ t: 0, p: 21000 }] },
  ]);
  expect([...container.querySelectorAll("[data-shape]")].map((g) => g.getAttribute("data-shape"))).toEqual(["hray"]);
});

test("text set in the Text tab is drawn with its own color, size and weight", () => {
  setup([{ type: "trend", pts: [], note: "mss", noteColor: "var(--replay-tv-10)", noteSize: 20, noteB: true }]);
  const note = screen.getByText("mss");
  expect(note).toHaveAttribute("fill", "var(--replay-tv-10)");
  expect(note).toHaveAttribute("font-size", "20");
  expect(note).toHaveAttribute("font-weight", "700");
});

test("axis tags: the selected drawing's labels use the readable blue; a light ray color gets dark text", () => {
  const { container, store, ids } = setup([{ type: "trend", pts: [] }, { type: "hray", pts: [{ t: 1, p: 20000 }], color: "#ffeb3b", priceLabel: true }]);
  act(() => store.select(ids[0]));
  const times = [...container.querySelectorAll('[data-role="axis-time"] rect')];
  expect(times.length).toBe(2);
  times.forEach((r) => expect(r.getAttribute("fill")).toBe("var(--replay-axis-label)"));
  const ray = [...container.querySelectorAll('[data-role="axis-price"]')].find((g) => g.querySelector("rect")?.getAttribute("fill") === "#ffeb3b")!;
  expect(ray.querySelector("text")!.getAttribute("fill")).toBe("var(--replay-fg-on-light)");
});

test("fib: TradingView's default look — dashed trend line, 11 levels with labels on the left, a fill between levels", () => {
  const { container } = setup([{ type: "fib", pts: [] }]);
  const levels = container.querySelectorAll('[data-shape="fib"] [data-role="fib-level"]');
  expect(levels).toHaveLength(11);
  expect(container.querySelectorAll('[data-role="fib-bg"]')).toHaveLength(10);
  expect(container.querySelector('[data-role="fib-trend"]')?.getAttribute("stroke-dasharray")).toBeTruthy();
  const labels = [...container.querySelectorAll('[data-role="fib-level"] text')];
  expect(labels[0].textContent).toBe("0(20500.00)");
  expect(labels.map((x) => x.textContent)).toContain("0.618(20191.00)");
  // chữ nằm ngoài, bên trái điểm trái nhất
  const left = Number(container.querySelector('[data-role="fib-level"] line')!.getAttribute("x1"));
  expect(Number(labels[0].getAttribute("x"))).toBeLessThan(left);
  expect(labels[0].getAttribute("text-anchor")).toBe("end");
});

test("fib: extend, one color, no background, no trend line, labels on the right edge", () => {
  const { container } = setup([{ type: "fib", pts: [], extL: true, extR: true, fibOneColor: "#123456", fibBg: false, fibTrend: false, fibLabelH: "right" }]);
  const line = container.querySelector('[data-role="fib-level"] line')!;
  expect([line.getAttribute("x1"), line.getAttribute("x2")]).toEqual(["0", "800"]);
  expect([...container.querySelectorAll('[data-role="fib-level"] line')].every((l) => l.getAttribute("stroke") === "#123456")).toBe(true);
  expect(container.querySelector('[data-role="fib-bg"]')).toBeNull();
  expect(container.querySelector('[data-role="fib-trend"]')).toBeNull();
  const text = container.querySelector('[data-role="fib-level"] text')!;
  expect([text.getAttribute("x"), text.getAttribute("text-anchor")]).toEqual(["796", "end"]);
});

test("fib: two levels with the same ratio are both drawn without a React key clash", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = setup([{ type: "fib", pts: [], fibLevels: [{ v: 0, color: "red", on: true }, { v: 0.5, color: "red", on: true }, { v: 0.5, color: "blue", on: true }] }]);
  expect([...container.querySelectorAll('[data-role="fib-level"] line')].map((l) => l.getAttribute("stroke"))).toEqual(["red", "red", "blue"]);
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  errors.mockRestore();
});
