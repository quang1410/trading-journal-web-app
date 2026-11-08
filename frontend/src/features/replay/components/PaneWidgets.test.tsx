import { act, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n";
import { Overlay } from "../chart/Overlay";
import { makeProjector } from "../engine/projector";
import { testPair } from "../engine/testBars";
import { ReplayProvider } from "../store/context";
import { ReplayStore } from "../store/ReplayStore";
import { TextEditor } from "./PaneWidgets";

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
  const pt = { t: c[c.length - 20].time, p: 20000 };
  const d = store.addDrawing({ sym: SYM, type: "text", pts: [pt], text: "hello", noteSize: 20, color: "#ff0000" });
  store.select(null);
  const { container } = render(
    <LocaleProvider>
      <ReplayProvider store={store}>
        <div className="relative">
          <Overlay k={0} proj={proj} fg="black" />
          <TextEditor k={0} />
        </div>
      </ReplayProvider>
    </LocaleProvider>,
  );
  const shown = () => container.querySelector(`[data-id="${d.id}"] text`)?.textContent ?? null;
  const edit = () => act(() => store.openTextEdit({ pane: 0, x: 100, y: 200, pt, existingId: d.id }));
  return { store, d, shown, edit };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("journal.locale", "en");
});

test("editing a text in place: the chart text hides while the box is open, so the words do not show twice", () => {
  const { shown, edit } = setup();
  expect(shown()).toBe("hello");
  edit();
  expect(shown()).toBeNull();
  fireEvent.keyDown(screen.getByTestId("replay-text-editor"), { key: "Escape" });
  expect(shown()).toBe("hello");
});

test("the edit box opens with the caret after the last letter, in the text's own size and color", () => {
  const { edit } = setup();
  edit();
  const box = screen.getByTestId<HTMLInputElement>("replay-text-editor");
  expect(box).toHaveFocus();
  expect(box.value).toBe("hello");
  expect([box.selectionStart, box.selectionEnd]).toEqual([5, 5]);
  expect(box.style.fontSize).toBe("20px");
  expect(box.style.color).toBe("rgb(255, 0, 0)");
});

test("the box sits on the text: its left edge on the text's x, its baseline on the text's y", () => {
  const { edit } = setup();
  edit();
  const box = screen.getByTestId<HTMLInputElement>("replay-text-editor");
  // lề trái 2px + viền 1px; đỉnh ô = đường chân chữ − khoảng từ đỉnh tới chân chữ (1,1 × cỡ chữ) − viền
  expect(box.style.left).toBe("97px");
  expect(box.style.top).toBe(`${200 - 22 - 1}px`);
});
