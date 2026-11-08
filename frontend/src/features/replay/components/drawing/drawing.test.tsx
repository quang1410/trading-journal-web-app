import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/i18n";
import type { Drawing } from "../../engine/drawings";
import { visPreset } from "../../engine/drawStyle";
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

// ---------- K-54: phần FX Replay có mà mình còn thiếu ----------

/** Hộp Long / Short quanh giá hiện tại: vào `entry`, target / stop cách 10 / 5 điểm. */
function box(type: "long" | "short", entry: number) {
  const s = type === "long" ? 1 : -1;
  return { type, pts: [{ t: 1767225600, p: entry }, { t: 1767225600 + 3600, p: entry + s * 10 }, { t: 1767225600 + 3600, p: entry - s * 5 }] };
}

test("Long / Short toolbar has FX Replay's buttons", () => {
  setup(box("long", 21000));
  expect(barButtons()).toEqual(["Templates", "Text color", "Profit background color", "Stop background color", "Create limit order", "Settings", "Lock", "Delete (Delete)", "More"]);
});

test("Long / Short profit and stop colors restyle the boxes, one undo step each", async () => {
  const user = userEvent.setup();
  const { store, cur } = setup(box("short", 21000));
  await user.click(screen.getByRole("button", { name: "Profit background color" }));
  await user.click(await screen.findByRole("option", { name: "Color 15" }));
  expect(cur().posTargetColor).toBe("var(--replay-tv-14)");
  store.undo();
  expect(cur().posTargetColor).toBeUndefined();
});

test("Long settings: Inputs / Style / Visibility tabs with FX Replay's defaults", async () => {
  const user = userEvent.setup();
  setup(box("long", 21000));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  expect(within(dlg).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Inputs", "Style", "Visibility"]);
  await user.click(within(dlg).getByRole("tab", { name: "Inputs" }));
  // Account size = số dư đầu của phiên; Lot size = giá trị một điểm của NQ; Risk 25% như FX Replay
  expect(within(dlg).getByRole("spinbutton", { name: "Account size" })).toHaveValue("50000");
  expect(within(dlg).getByRole("spinbutton", { name: "Lot size" })).toHaveValue("20");
  expect(within(dlg).getByRole("spinbutton", { name: "Risk" })).toHaveValue("25");
  expect(within(dlg).getByRole("spinbutton", { name: "Profit level ticks" })).toHaveValue("40");
  expect(within(dlg).getByRole("spinbutton", { name: "Stop level ticks" })).toHaveValue("20");
  expect(within(dlg).getByRole("spinbutton", { name: "Risk/Reward ratio" })).toHaveValue("2");
  expect(within(dlg).getByRole("spinbutton", { name: "Leverage" })).toHaveValue("1");
});

test("Inputs: R/R moves the target, ticks move a level, a wrong-side price is refused with a message", async () => {
  const user = userEvent.setup();
  const { cur } = setup(box("long", 21000));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Inputs" }));
  const rr = within(dlg).getByRole("spinbutton", { name: "Risk/Reward ratio" });
  await user.clear(rr);
  await user.type(rr, "3");
  expect(cur().pts[1].p).toBe(21015);
  const slTicks = within(dlg).getByRole("spinbutton", { name: "Stop level ticks" });
  await user.clear(slTicks);
  await user.type(slTicks, "8");
  expect(cur().pts[2].p).toBe(20998);
  const tp = within(dlg).getByRole("spinbutton", { name: "Profit level price" });
  await user.clear(tp);
  await user.type(tp, "20990");
  expect(within(dlg).getByRole("alert")).toHaveTextContent("Wrong side of the entry");
  expect(cur().pts[1].p).toBe(21015);
  // regression: gõ giá mới từ đầu ("2", "21"… đều sai phía) không bị ô bật về giá cũ giữa chừng
  await user.clear(tp);
  await user.type(tp, "21030");
  expect(cur().pts[1].p).toBe(21030);
  expect(within(dlg).queryByRole("alert")).toBeNull();
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
});

test("Inputs: risk in cash and QTY precision are kept on the drawing", async () => {
  const user = userEvent.setup();
  const { cur } = setup(box("long", 21000));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Inputs" }));
  await user.click(within(dlg).getByRole("combobox", { name: "Risk unit" }));
  await user.click(await screen.findByRole("option", { name: "Cash" }));
  await user.click(within(dlg).getByRole("combobox", { name: "QTY precision" }));
  await user.click(await screen.findByRole("option", { name: "2" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ posRiskUnit: "cash", posQtyPrec: 2 });
});

test("Long Style: labels, stats, compact, always show and frame", async () => {
  const user = userEvent.setup();
  const { cur } = setup(box("long", 21000));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Style" }));
  expect(within(dlg).getByRole("checkbox", { name: "Price labels" })).toBeChecked();
  expect(within(dlg).getByRole("button", { name: "Stats" })).toHaveTextContent("All");
  await user.click(within(dlg).getByRole("checkbox", { name: "Time labels" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Frame" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Always show stats" }));
  await user.click(within(dlg).getByRole("button", { name: "Stats" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Qty" }));
  await user.keyboard("{Escape}");
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ timeLabels: true, posFrame: true, statsAlways: true });
  expect(cur().posStats).not.toContain("qty");
  expect(cur().posStats).toHaveLength(10);
});

test("Create limit order: a long below the price becomes a buy limit with the box's SL / TP", async () => {
  const user = userEvent.setup();
  const { store } = setup({ type: "long", pts: [] });
  const last = store.lastPrice(SYM)!;
  expect(last).not.toBeNull();
  const id = store.addDrawing({ sym: SYM, ...box("long", last - 20) }).id;
  store.select(id);
  await user.click(screen.getByRole("button", { name: "Create limit order" }));
  expect(store.getState().pending).toMatchObject({ sym: SYM, side: 1, type: "limit", price: last - 20, slPts: 5, tpPts: 10 });
  // đã có lệnh chờ: chặn và báo như nút Buy / Sell
  await user.click(screen.getByRole("button", { name: "Create limit order" }));
  expect(store.getState().notice?.key).toBe("replay.toast.orderOpen");
});

test("Fib toolbar: color / width / style act on the levels; widths go up to 10px", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "fib", pts: pts(2) });
  expect(barButtons()).toEqual(["Templates", "Line color", "Line width", "Line style", "Settings", "Lock", "Delete (Delete)", "More"]);
  await user.click(screen.getByRole("button", { name: "Line width" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "10px" }));
  expect(cur().fibLevelWidth).toBe(10);
  await user.click(screen.getByRole("button", { name: "Line color" }));
  await user.click(await screen.findByRole("option", { name: "Color 11" }));
  expect(cur().fibOneColor).toBe("var(--replay-tv-10)");
});

test("Text toolbar: Edit text opens the editor; Anchor pins the text to the screen and back", async () => {
  const user = userEvent.setup();
  const { store, cur } = setup({ type: "text", pts: pts(1), text: "OB" });
  expect(barButtons()).toEqual(["Templates", "Edit text", "Text color", "Font size", "Anchor", "Settings", "Lock", "Delete (Delete)", "More"]);
  await user.click(screen.getByRole("button", { name: "Edit text" }));
  expect(store.getState().textEdit).toMatchObject({ existingId: cur().id });
  store.commitText("OB", false);
  await user.click(screen.getByRole("button", { name: "Anchor" }));
  expect(cur().anchor).toEqual({ x: expect.any(Number), y: expect.any(Number) });
  expect(screen.getByRole("button", { name: "Anchor" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Anchor" }));
  expect(cur().anchor).toBeUndefined();
});

test("More menu: visibility presets apply to the timeframe being viewed and the matching one is marked", async () => {
  const user = userEvent.setup();
  const { store, cur } = setup({ type: "trend", pts: pts(2) });
  const tf = store.getState().panes[0].tf;
  await user.click(screen.getByRole("button", { name: "More" }));
  expect(await screen.findByRole("menuitemradio", { name: "All intervals" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemradio", { name: "Current interval only" }));
  expect(cur().vis).toEqual(visPreset("current", tf));
  await user.click(screen.getByRole("button", { name: "More" }));
  expect(await screen.findByRole("menuitemradio", { name: "Current interval only" })).toHaveAttribute("aria-checked", "true");
});

test("Trend line: square line end and time labels; rectangle: price and time labels", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "trend", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("combobox", { name: "Right end" }));
  await user.click(await screen.findByRole("option", { name: "Square" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Time labels" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ endR: "square", timeLabels: true });
});

test("rectangle style has price and time labels", async () => {
  const user = userEvent.setup();
  const { cur } = setup({ type: "rect", pts: pts(2) });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const dlg = await screen.findByTestId("replay-draw-dialog");
  await user.click(within(dlg).getByRole("tab", { name: "Style" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Price labels" }));
  await user.click(within(dlg).getByRole("checkbox", { name: "Time labels" }));
  await user.click(within(dlg).getByRole("button", { name: "Ok" }));
  expect(cur()).toMatchObject({ priceLabels: true, timeLabels: true });
});
