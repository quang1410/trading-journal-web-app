import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/i18n";
import type { Drawing } from "../../engine/drawings";
import { makeProjector } from "../../engine/projector";
import { testPair } from "../../engine/testBars";
import { ReplayProvider } from "../../store/context";
import { ReplayStore } from "../../store/ReplayStore";
import { DrawingBar } from "./DrawingBar";
import { DrawingDialog } from "./DrawingDialog";

const SYM = "DEMO US100";

function setup(d: Omit<Drawing, "id" | "sym">) {
  const [nq, es] = testPair();
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  store.openSession([{ name: SYM, bars: nq }, { name: "DEMO US500", bars: es }]);
  const st = store.getState();
  const proj = makeProjector({
    candles: store.candles[0], tf: st.panes[0].tf, zone: st.zone, axis: { a: 100, sp: 10 }, plotW: 800, plotH: 500,
    priceToY: (p) => 500 - (p % 500), yToPrice: (y) => 500 - y,
  });
  const drawing = store.addDrawing({ sym: SYM, ...d });
  render(
    <LocaleProvider>
      <ReplayProvider store={store}>
        <div className="relative">
          <DrawingBar k={0} proj={proj} />
        </div>
        <DrawingDialog />
      </ReplayProvider>
    </LocaleProvider>,
  );
  const cur = () => store.getState().drawings.find((x) => x.id === drawing.id)!;
  return { store, id: drawing.id, cur };
}
const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ t: 1767225600 + i * 3600, p: 21000 + i * 10 }));
const barButtons = () => within(screen.getByRole("toolbar", { name: "Selected drawing" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("journal.locale", "en");
});

test("the floating toolbar has TradingView's buttons for each tool", () => {
  setup({ type: "trend", pts: pts(2) });
  expect(barButtons()).toEqual(["Templates", "Line color", "Text color", "Line width", "Line style", "Settings", "Lock", "Delete (Delete)", "More"]);
});

test("rectangle adds a background color button; brush has no line style or text color", () => {
  setup({ type: "rect", pts: pts(2) });
  expect(barButtons()).toEqual(["Templates", "Line color", "Background color", "Text color", "Line width", "Line style", "Settings", "Lock", "Delete (Delete)", "More"]);
});

test("brush toolbar", () => {
  setup({ type: "brush", pts: pts(3) });
  expect(barButtons()).toEqual(["Templates", "Line color", "Line width", "Settings", "Lock", "Delete (Delete)", "More"]);
});

test("toolbar color, width and lock restyle the drawing; each is one undo step", async () => {
  const user = userEvent.setup();
  const { store, cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Line color" }));
  await user.click(await screen.findByRole("option", { name: "Color 11" }));
  expect(cur().color).toBe("var(--replay-tv-10)");
  await user.click(screen.getByRole("button", { name: "Line width" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "3px" }));
  expect(cur().width).toBe(3);
  await user.click(screen.getByRole("button", { name: "Lock" }));
  expect(cur().locked).toBe(true);
  expect(screen.getByRole("button", { name: "Unlock" })).toHaveAttribute("aria-pressed", "true");
  store.undo();
  store.undo();
  expect(cur()).toMatchObject({ color: "var(--replay-tv-10)" });
  expect(cur().width).toBeUndefined();
});

test("settings: Style edits show at once, Cancel restores, Ok keeps them", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  expect(within(dlg).getByText("Trendline")).toBeInTheDocument();
  expect(within(dlg).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Style", "Text", "Coordinates", "Visibility"]);
  await user.click(within(dlg).getByRole("checkbox", { name: "Middle point" }));
  expect(cur().midPoint).toBe(true);
  await user.click(within(dlg).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("replay-draw-dialog")).toBeNull();
  expect(cur().midPoint).toBeUndefined();

  await user.click(screen.getByRole("button", { name: "Settings" }));
  const again = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(again).getByRole("checkbox", { name: "Price labels" }));
  await user.click(within(again).getByRole("tab", { name: "Text" }));
  await user.type(within(again).getByRole("textbox", { name: "Text" }), "mss");
  await user.click(within(again).getByRole("combobox", { name: "Horizontal alignment" }));
  await user.click(await screen.findByRole("option", { name: "Right" }));
  await user.click(within(again).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ priceLabels: true, note: "mss", noteH: "right" });
});

test("the dialog reopens on the tab used last time", async () => {
  const user = userEvent.setup();
  setup({ type: "hray", pts: pts(1) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(within(await screen.findByTestId("replay-draw-dialog")).getByRole("tab", { name: "Visibility" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(within(await screen.findByTestId("replay-draw-dialog")).getByRole("tab", { name: "Visibility" })).toHaveAttribute("aria-selected", "true");
});

test("Coordinates edits a point's price; Visibility turns a timeframe family off", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "rect", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Coordinates" }));
  const price = within(dlg).getByRole("spinbutton", { name: "Price of point 1" });
  await user.clear(price);
  await user.type(price, "21500.25");
  expect(cur().pts[0].p).toBe(21500.25);
  await user.click(within(dlg).getByRole("tab", { name: "Visibility" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Minutes" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur().vis?.min.on).toBe(false);
  expect(cur().vis?.hour.on).toBe(true);
});

test("a drawing saved by the old version (note + palette color) opens with its text in the Text tab", async () => {
  const user = userEvent.setup();
  setup({ type: "trend", pts: pts(2), color: "var(--replay-palette-7)", note: "BSL", noteColor: "var(--replay-palette-1)", noteB: true });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Text" }));
  expect(within(dlg).getByRole("textbox", { name: "Text" })).toHaveValue("BSL");
  expect(within(dlg).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
});

test("More → Hide hides the drawing and the toolbar goes away", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "More" }));
  await user.click(await screen.findByRole("menuitem", { name: "Hide" }));
  expect(cur().hidden).toBe(true);
  expect(screen.queryByRole("toolbar", { name: "Selected drawing" })).toBeNull();
});

test("the color panel's + opens the built-in picker; Add applies the color and keeps it in the custom row", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Line color" }));
  await user.click(await screen.findByRole("button", { name: "Custom color" }));
  // không còn <input type="color"> của trình duyệt
  expect(document.querySelector('input[type="color"]')).toBeNull();
  const hex = screen.getByRole("textbox", { name: "Hex color" });
  await user.clear(hex);
  await user.type(hex, "#12AB34");
  await user.click(screen.getByRole("button", { name: "Add" }));
  expect(cur().color).toBe("#12ab34");
  expect(screen.getByRole("option", { name: "#12ab34" })).toHaveAttribute("aria-selected", "true");
  expect(JSON.parse(localStorage.getItem("journal.replay.customColors") ?? "[]")).toEqual(["#12ab34"]);
});

test("opacity is a slider; thickness and line style are radio groups", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("button", { name: "Line" }));
  const slider = await screen.findByRole("slider", { name: "Opacity" });
  slider.focus();
  await user.keyboard("{ArrowLeft}");
  // jsdom không nạp replay.css nên biến màu đọc ra đen; chỉ kiểm phần độ đục
  expect(cur().color).toMatch(/^rgba\(\d+, \d+, \d+, 0\.99\)$/);
  await user.click(within(screen.getByRole("radiogroup", { name: "Thickness" })).getByRole("radio", { name: "4px" }));
  expect(cur().width).toBe(4);
  await user.click(within(screen.getByRole("radiogroup", { name: "Line style" })).getByRole("radio", { name: "Dashed" }));
  expect(cur().dash).toBe("dashed");
});

test("the settings window uses no native form controls", async () => {
  const user = userEvent.setup();
  setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  for (const tab of ["Style", "Text", "Coordinates", "Visibility"]) {
    await user.click(within(dlg).getByRole("tab", { name: tab }));
    expect(dlg.querySelectorAll('select, input[type="checkbox"], input[type="number"], input[type="range"], input[type="color"]'), tab).toHaveLength(0);
  }
});

test("dragging the toolbar by its grip ends on pointer cancel and remembers where it was dropped", () => {
  setup({ type: "trend", pts: pts(2) });
  const bar = screen.getByRole("toolbar", { name: "Selected drawing" });
  const grip = bar.querySelector(".cursor-grab")!;
  const saved = () => Object.entries(localStorage).find(([k]) => k.endsWith("float.drawbar"))?.[1];
  fireEvent.pointerDown(grip, { pointerId: 1, clientX: 0, clientY: 100 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 0, clientY: 300 });
  // hệ thống huỷ thao tác (cử chỉ, mất focus): kéo kết thúc ở chỗ đang đứng
  fireEvent.pointerCancel(grip, { pointerId: 1, clientX: 0, clientY: 300 });
  expect(JSON.parse(saved()!)[1]).toBe(208);
  // di chuột sau đó (không bấm) không còn kéo thanh đi
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 0, clientY: 450 });
  expect(bar.style.top).toBe("208px");
});

test("Visibility: a 'from' above 'to' pulls 'to' up when the field is left, not while typing", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Visibility" }));
  const to = within(dlg).getByRole("spinbutton", { name: "Hours: to" });
  const from = within(dlg).getByRole("spinbutton", { name: "Hours: from" });
  await user.clear(to);
  await user.type(to, "4");
  await user.clear(from);
  await user.type(from, "12");
  // đang gõ: chưa đụng ô kia
  expect(cur().vis?.hour).toMatchObject({ from: 12, to: 4 });
  await user.tab();
  expect(cur().vis?.hour).toMatchObject({ from: 12, to: 12 });
});

test("fib settings: the Style tab has TradingView's options and edits the drawing", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "fib", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  expect(within(dlg).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Style", "Coordinates", "Visibility"]);
  expect(within(within(dlg).getByTestId("fib-levels")).getAllByRole("checkbox")).toHaveLength(24);
  // tắt mức 0.236 (mức thứ 2)
  await user.click(within(dlg).getByRole("checkbox", { name: "Show level 2" }));
  expect(cur().fibLevels![1]).toMatchObject({ v: 0.236, on: false });
  expect(cur().fibLevels![0]).toMatchObject({ v: 0, on: true });
  await user.click(within(dlg).getByRole("checkbox", { name: "Reverse" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Fib levels based on log scale" }));
  await user.click(within(dlg).getByRole("combobox", { name: "Level format" }));
  await user.click(await screen.findByRole("option", { name: "Percents" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ fibReverse: true, fibLog: true, fibValueMode: "percent" });
});

test("Template menu: apply OTE, save as a new template, Apply default, delete; Cancel undoes an applied template", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "fib", pts: pts(2) });
  const open = async () => {
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dlg = await screen.findByTestId("replay-draw-dialog");
    await user.click(within(dlg).getByRole("button", { name: "Template" }));
    return dlg;
  };
  const levelsOn = () => cur().fibLevels?.filter((l) => l.on).map((l) => l.v);

  let dlg = await open();
  expect((await screen.findAllByRole("menuitem")).map((x) => x.textContent)).toEqual(["Save Drawing Template As…", "Apply Default Drawing Template", "OTE", "STD", "FIBO"]);
  await user.click(screen.getByRole("menuitem", { name: "OTE" }));
  expect(levelsOn()).toContain(0.705);
  await user.click(within(dlg).getByRole("button", { name: "Cancel" }));
  expect(cur().fibLevels).toBeUndefined();

  dlg = await open();
  await user.click(screen.getByRole("menuitem", { name: "STD" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Reverse" }));
  await user.click(within(dlg).getByRole("button", { name: "Template" }));
  await user.click(screen.getByRole("menuitem", { name: "Save Drawing Template As…" }));
  const naming = await screen.findByTestId("replay-template-dialog");
  await user.type(within(naming).getByRole("textbox", { name: "Template name" }), "std rev");
  await user.click(within(naming).getByRole("button", { name: "Save" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ fibReverse: true });

  dlg = await open();
  expect((await screen.findAllByRole("menuitem")).map((x) => x.textContent)).toEqual(["Save Drawing Template As…", "Apply Default Drawing Template", "OTE", "STD", "FIBO", "std rev"]);
  await user.click(screen.getByRole("menuitem", { name: "Apply Default Drawing Template" }));
  expect(cur().fibReverse).toBeUndefined();
  expect(cur().fibLevels).toBeUndefined();
  await user.click(within(dlg).getByRole("button", { name: "Template" }));
  await user.click(screen.getByRole("button", { name: "Delete template OTE" }));
  // xoá không áp mẫu đó, menu vẫn mở
  expect(cur().fibLevels).toBeUndefined();
  expect(screen.getAllByRole("menuitem").map((x) => x.textContent)).toEqual([
    "Save Drawing Template As…", "Apply Default Drawing Template", "STD", "FIBO", "std rev", "Restore built-in templates",
  ]);
  // bàn phím: Delete trên mục cũng xoá; Khôi phục đưa OTE về
  screen.getByRole("menuitem", { name: "std rev" }).focus();
  await user.keyboard("{Delete}");
  await user.click(screen.getByRole("menuitem", { name: "Restore built-in templates" }));
  await user.click(within(dlg).getByRole("button", { name: "Template" }));
  expect((await screen.findAllByRole("menuitem")).map((x) => x.textContent)).toEqual(["Save Drawing Template As…", "Apply Default Drawing Template", "OTE", "STD", "FIBO"]);
});

test("the toolbar's Templates button applies a template at once as one undo step, and new drawings follow it", async () => {
  const user = userEvent.setup();
  const { store, cur } = setup({ type: "fib", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Templates" }));
  expect((await screen.findAllByRole("menuitem")).map((x) => x.textContent)).toEqual([
    "Save Drawing Template As…", "Apply Default Drawing Template", "OTE", "STD", "FIBO",
  ]);
  await user.click(screen.getByRole("menuitem", { name: "STD" }));
  expect(cur().fibLevels?.filter((l) => l.on).map((l) => l.v)).toEqual([1, 0, -1, -2, -2.5, -4, -4.5]);
  expect(store.lastStyle("fib").fibLevels).toEqual(cur().fibLevels);
  store.undo();
  expect(cur().fibLevels).toBeUndefined();
});

test("saving under a name that exists asks before replacing it", async () => {
  const user = userEvent.setup();
  const { cur, store, id } = setup({ type: "fib", pts: pts(2) });
  store.styleDrawing(id, { fibReverse: true });
  const saveAs = async (name: string) => {
    await user.click(screen.getByRole("button", { name: "Templates" }));
    await user.click(await screen.findByRole("menuitem", { name: "Save Drawing Template As…" }));
    const dlg = await screen.findByTestId("replay-template-dialog");
    await user.type(within(dlg).getByRole("textbox", { name: "Template name" }), name);
    await user.click(within(dlg).getByRole("button", { name: "Save" }));
    return dlg;
  };
  // "No" quay lại ô tên, không ghi đè
  let dlg = await saveAs("ote");
  expect(within(dlg).getByText('Drawing template "ote" already exists. Do you really want to replace it?')).toBeInTheDocument();
  await user.click(within(dlg).getByRole("button", { name: "No" }));
  expect(within(dlg).getByRole("textbox", { name: "Template name" })).toHaveValue("ote");
  await user.click(within(dlg).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("replay-template-dialog")).toBeNull();

  dlg = await saveAs("OTE");
  await user.click(within(dlg).getByRole("button", { name: "Yes" }));
  expect(screen.queryByTestId("replay-template-dialog")).toBeNull();
  // mẫu OTE giờ là kiểu của hình này (đảo chiều, 24 mức mặc định)
  store.styleDrawing(id, { fibReverse: false });
  await user.click(screen.getByRole("button", { name: "Templates" }));
  await user.click(await screen.findByRole("menuitem", { name: "OTE" }));
  expect(cur().fibReverse).toBe(true);
  expect(cur().fibLevels).toBeUndefined();
});
