import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LocaleProvider } from "@/i18n";
import { toastMs } from "./components/Toast";
import { testPair } from "./engine/testBars";
import { fmtLocal, toLocal } from "./engine/time";
import { ReplayPage } from "./ReplayPage";
import { ReplayStore } from "./store/ReplayStore";

// trục giá giả giữ trạng thái autoScale để test nút "A"; test tự tắt nó như khi người dùng kéo trục giá
const priceScale = vi.hoisted(() => {
  const opts = { autoScale: true, mode: 0 };
  return { opts, width: () => 60, options: () => ({ ...opts }), applyOptions: vi.fn((o: Partial<typeof opts>) => Object.assign(opts, o)) };
});

// jsdom không có canvas: thay lightweight-charts bằng một chart giả có đủ API trang dùng tới.
vi.mock("lightweight-charts", () => {
  const series = {
    setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn(), setMarkers: vi.fn(), removePriceLine: vi.fn(),
    createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    priceToCoordinate: (p: number) => 1000 - p, coordinateToPrice: (y: number) => 1000 - y,
  };
  const timeScale = {
    width: () => 800, height: () => 30, setVisibleLogicalRange: vi.fn(), logicalToCoordinate: (l: number) => 100 + l * 10,
    coordinateToTime: () => null, timeToCoordinate: () => null,
  };
  const chart = { addCandlestickSeries: () => series, applyOptions: vi.fn(), remove: vi.fn(), timeScale: () => timeScale, priceScale: () => priceScale };
  return { createChart: () => chart, ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, PriceScaleMode: { Normal: 0, Logarithmic: 1 } };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  localStorage.clear();
  Object.assign(priceScale.opts, { autoScale: true, mode: 0 });
});

function setup() {
  const [nq, es] = testPair();
  // không có data mặc định trong test: boot bỏ qua vì phiên đã mở sẵn
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  store.openSession([{ name: "DEMO US100", bars: nq }, { name: "DEMO US500", bars: es }]);
  render(
    <LocaleProvider>
      <ReplayPage store={store} />
    </LocaleProvider>,
  );
  return store;
}

test("shows both charts, the replay controls and the order panel", async () => {
  setup();
  expect(screen.getByTestId("replay-info-0")).toHaveTextContent("DEMO US100 5m");
  expect(screen.getByTestId("replay-info-1")).toHaveTextContent("DEMO US500 5m");
  expect(screen.getByRole("toolbar", { name: "Thanh replay" })).toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "Công cụ vẽ" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "BUY (B)" })).toBeInTheDocument();
  expect(screen.getByText("Chưa có lệnh nào")).toBeInTheDocument();
  // hợp đồng nằm ở ô đặt lệnh, không còn ở thanh trên
  expect(within(screen.getByRole("toolbar", { name: "Thanh công cụ replay" })).queryByRole("combobox", { name: "Hợp đồng" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Hợp đồng" })).toHaveTextContent("NQ · $20/điểm");
});

test("the data menu lists the bar counts and offers Open CSV / Add symbol", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Dữ liệu" }));
  expect(await screen.findByTestId("replay-data-info")).toHaveTextContent(/DEMO US100 \d{2},\d{3} nến/);
  expect(screen.getByRole("menuitem", { name: "Mở CSV" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Thêm mã" })).toBeInTheDocument();
});

test("typing a timeframe shows the box and Enter switches the selected chart", async () => {
  const store = setup();
  const user = userEvent.setup();
  await user.keyboard("1h");
  expect(screen.getByTestId("replay-tf-box")).toHaveTextContent("1h→ 1H · Enter");
  await user.keyboard("{Enter}");
  expect(store.getState().panes[0].tf).toBe(60);
  expect(screen.queryByTestId("replay-tf-box")).not.toBeInTheDocument();
  await user.keyboard("2{Enter}");
  expect(await screen.findByTestId("replay-toast")).toHaveTextContent("Chưa có khung 2. Các khung có: 1m, 5m, 15m, 30m, 1H, 4H, D.");
  // typing, then another key: cancelled and no order placed
  await user.keyboard("1b");
  expect(store.getState().pos).toBeNull();
});

test("buy with the button, close with X: the trade appears in the table", async () => {
  const store = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "BUY (B)" }));
  expect(screen.getByText(/LONG 1 NQ/)).toBeInTheDocument();
  expect(screen.getByTestId("replay-open-pnl")).toHaveTextContent("$0");
  await user.keyboard("s");
  expect(await screen.findByTestId("replay-toast")).toHaveTextContent("Đang có lệnh. Đóng hoặc huỷ trước khi vào lệnh mới.");
  act(() => store.stepOnce());
  await user.keyboard("x");
  const table = screen.getByRole("table", { name: "Lệnh đã đóng của phiên" });
  expect(within(table).getByText("Thủ công")).toBeInTheDocument();
  expect(within(table).getByText("Long NQ")).toBeInTheDocument();
});

test("space plays and pauses; → steps", async () => {
  const store = setup();
  const user = userEvent.setup();
  const cur = store.ds["DEMO US100"].cur;
  await user.keyboard("{ArrowRight}");
  expect(store.ds["DEMO US100"].cur).toBe(cur + 1);
  await user.keyboard(" ");
  expect(store.getState().playing).toBe(true);
  expect(screen.getByRole("button", { name: "Dừng" })).toBeInTheDocument();
  await user.keyboard(" ");
  expect(store.getState().playing).toBe(false);
});

test("replay bar: step size and speed live in one chip; its popover's keys don't drive the chart", async () => {
  const store = setup();
  const user = userEvent.setup();
  const bar = screen.getByRole("toolbar", { name: "Thanh replay" });
  const chip = within(bar).getByRole("button", { name: /Bước và tốc độ phát/ });
  // chip hiện sẵn cả hai giá trị, không phải mở ra mới biết
  expect(chip).toHaveTextContent("1m·5/giây");
  await user.click(chip);
  const pace = await screen.findByRole("dialog", { name: "Bước và tốc độ phát" });

  const speed = within(pace).getByRole("slider", { name: "Tốc độ phát (bước mỗi giây)" });
  const cur = store.ds["DEMO US100"].cur;
  const s0 = store.getState().speed;
  speed.focus();
  await user.keyboard("{ArrowRight}");
  expect(store.getState().speed).toBe(s0 + 1);
  // → trên thanh kéo là việc của thanh kéo: không được tua chart như phím tắt
  expect(store.ds["DEMO US100"].cur).toBe(cur);

  const step = within(pace).getByRole("radiogroup", { name: "Mỗi bước tiến bao nhiêu" });
  await user.click(within(step).getByRole("radio", { name: "15m" }));
  expect(store.getState().stepTf).toBe(15);
  await user.keyboard(" ");
  expect(store.getState().playing).toBe(false);
  expect(chip).toHaveTextContent("15m·10/giây");
});

test("replay bar: the clock shows the weekday, date and a short zone", () => {
  setup();
  const clock = screen.getByTestId("replay-time");
  expect(clock).toHaveTextContent(/^(CN|T[2-7]) \d{4}-\d{2}-\d{2}\d{2}:\d{2} NY$/);
  expect(clock).toHaveAttribute("title", expect.stringMatching(/ New York$/));
});

test("drawing tools: Alt+T picks the trend tool, the magnet toggles and is remembered", async () => {
  const store = setup();
  const user = userEvent.setup();
  await user.keyboard("{Alt>}t{/Alt}");
  expect(store.getState().tool).toBe("trend");
  expect(screen.getByRole("button", { name: "Đường xu hướng (Alt+T)" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByTestId("replay-magnet"));
  expect(store.getState().magnet).toBe(true);
  expect(localStorage.getItem("journal.replay.magnet")).toBe("true");
});

test("the drawing rail holds the horizontal line and clear-all buttons", async () => {
  const store = setup();
  const user = userEvent.setup();
  const rail = screen.getByRole("toolbar", { name: "Công cụ vẽ" });
  const hline = within(rail).getByRole("button", { name: "Kẻ ngang hết chiều rộng chart (Alt+H)" });
  await user.click(hline);
  expect(store.getState().drawMode).toBe(true);
  expect(hline).toHaveAttribute("aria-pressed", "true");
  const spy = vi.spyOn(store, "clearDrawings");
  await user.click(within(rail).getByRole("button", { name: "Xoá mọi hình vẽ (⌘/Ctrl+Z để lấy lại)" }));
  expect(spy).toHaveBeenCalled();
});

test("settings: the My ICT tab has the SMT section; Cancel restores", async () => {
  const store = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Cài đặt" }));
  const dialog = await screen.findByRole("dialog", { name: "Cài đặt" });
  await user.click(within(dialog).getByRole("tab", { name: "My ICT" }));
  expect(within(dialog).getByText("SMT Divergence (TFO)")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("checkbox", { name: "Hiện SMT" }));
  expect(store.getState().ict.smt.on).toBe(false);
  await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
  expect(store.getState().ict.smt.on).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the A button turns price auto-scale back on after the price axis was dragged", async () => {
  setup();
  const user = userEvent.setup();
  const [btn] = await screen.findAllByRole("button", { name: "Tự động (vừa dữ liệu với màn hình)" });
  expect(btn).toHaveAttribute("title", "Tự động (vừa dữ liệu với màn hình)");
  expect(btn).toHaveAttribute("aria-pressed", "true");
  // kéo trục giá: lightweight-charts tắt autoScale mà không bắn sự kiện, nút phải tự đọc lại
  priceScale.opts.autoScale = false;
  await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "false"));
  await user.click(btn);
  expect(priceScale.applyOptions).toHaveBeenLastCalledWith({ autoScale: true });
  expect(btn).toHaveAttribute("aria-pressed", "true");
  // bấm lần nữa thì khoá trục giá, như TradingView
  await user.click(btn);
  expect(priceScale.opts.autoScale).toBe(false);
  expect(btn).toHaveAttribute("aria-pressed", "false");
});

test("Alt+R (reset chart view) also turns price auto-scale back on", async () => {
  setup();
  const user = userEvent.setup();
  const [btn] = await screen.findAllByRole("button", { name: "Tự động (vừa dữ liệu với màn hình)" });
  priceScale.opts.autoScale = false;
  await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "false"));
  await user.keyboard("{Alt>}r{/Alt}");
  await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "true"));
  expect(priceScale.opts.autoScale).toBe(true);
});

test("the A/L strip shows only while the pointer is over the price axis, like TradingView", async () => {
  // jsdom không dàn trang: giả khung chart 800x600 → vùng vẽ 740x570 (trục giá giả rộng 60, trục thời gian cao 30)
  const w = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  const h = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  try {
    setup();
    const strip = await screen.findByTestId("replay-scale-0");
    const pane = strip.closest<HTMLElement>("[data-pane]")!;
    expect(strip).toHaveClass("opacity-0", "pointer-events-none");
    fireEvent.pointerMove(pane, { clientX: 400, clientY: 300 }); // vùng vẽ: vẫn ẩn
    expect(strip).toHaveClass("opacity-0");
    fireEvent.pointerMove(pane, { clientX: 770, clientY: 300 }); // trục giá: hiện
    expect(strip).not.toHaveClass("opacity-0");
    // tắt A rồi rời trục giá: vẫn ẩn như TradingView, không bám màn hình
    await userEvent.setup().click(within(strip).getByRole("button", { name: "Tự động (vừa dữ liệu với màn hình)" }));
    fireEvent.pointerLeave(pane);
    expect(strip).toHaveClass("opacity-0");
  } finally {
    w.mockRestore();
    h.mockRestore();
  }
});

test("the L button toggles the logarithmic price scale", async () => {
  setup();
  const user = userEvent.setup();
  const [btn] = await screen.findAllByRole("button", { name: "Logarit" });
  expect(btn).toHaveAttribute("title", "Logarit");
  expect(btn).toHaveAttribute("aria-pressed", "false");
  await user.click(btn);
  expect(priceScale.applyOptions).toHaveBeenLastCalledWith({ mode: 1 });
  expect(btn).toHaveAttribute("aria-pressed", "true");
  await user.click(btn);
  expect(priceScale.opts.mode).toBe(0);
  expect(btn).toHaveAttribute("aria-pressed", "false");
});

test("the sessions screen offers the simulated data and a way back", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Phiên" }));
  expect(await screen.findByTestId("replay-sessions")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thử với data giả lập" })).toBeInTheDocument();
  // màn hình phiên phủ cả bảng bên: không đặt lệnh được khi không thấy chart
  expect(screen.queryByRole("button", { name: "BUY (B)" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Quay lại chart" }));
  expect(screen.queryByTestId("replay-sessions")).not.toBeInTheDocument();
});

// bảng bên thu gọn được để chart rộng ra; lần mở trang sau vẫn giữ trạng thái đó
test("the side panel collapses, expands and remembers its state", async () => {
  setup();
  const user = userEvent.setup();
  const panel = screen.getByRole("complementary", { name: "Bảng đặt lệnh" });
  await user.click(screen.getByRole("button", { name: "Thu gọn bảng đặt lệnh" }));
  const expand = screen.getByRole("button", { name: "Mở bảng đặt lệnh" });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  // nút vừa bấm biến mất: focus phải sang nút mở chứ không rơi về body
  expect(expand).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Thu gọn bảng đặt lệnh" })).not.toBeInTheDocument();
  expect(panel.parentElement).toHaveAttribute("data-state", "closed");
  expect(localStorage.getItem("journal.replay.sidePanelOpen")).toBe("false");

  cleanup();
  setup();
  await user.click(screen.getByRole("button", { name: "Mở bảng đặt lệnh" }));
  const collapse = screen.getByRole("button", { name: "Thu gọn bảng đặt lệnh" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(collapse).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Mở bảng đặt lệnh" })).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Bảng đặt lệnh" }).parentElement).toHaveAttribute("data-state", "open");
});

// bảng lệnh dưới chart gập về một thanh tiêu đề vẫn còn số lệnh + tổng P&L; giữ trạng thái khi mở lại trang
test("the trade table collapses to its header bar and remembers it", async () => {
  setup();
  const user = userEvent.setup();
  const bar = screen.getByRole("button", { name: /Lệnh đã đóng/ });
  expect(bar).toHaveAttribute("aria-expanded", "true");
  expect(bar).toHaveTextContent("0 lệnh");
  expect(screen.getByRole("table", { name: "Lệnh đã đóng của phiên" })).toBeInTheDocument();

  await user.click(bar);
  expect(bar).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("table", { name: "Lệnh đã đóng của phiên" })).not.toBeInTheDocument();
  expect(localStorage.getItem("journal.replay.tradeTableOpen")).toBe("false");

  cleanup();
  setup();
  const again = screen.getByRole("button", { name: /Lệnh đã đóng/ });
  expect(again).toHaveAttribute("aria-expanded", "false");
  await user.click(again);
  expect(screen.getByRole("table", { name: "Lệnh đã đóng của phiên" })).toBeInTheDocument();
});

// gập bảng cho chart rộng ra vẫn phải thấy lệnh đang mở lãi hay lỗ
test("the collapsed rail keeps the open position's P&L in view", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thu gọn bảng đặt lệnh" }));
  expect(screen.queryByTestId("replay-rail-pnl")).not.toBeInTheDocument();
  await user.keyboard("b");
  expect(await screen.findByTestId("replay-rail-pnl")).toHaveTextContent(/LONG\s*[-+]?\$/);
});

test("English locale", async () => {
  localStorage.setItem("journal.locale", "en");
  setup();
  expect(await screen.findByRole("button", { name: "Sessions" })).toBeInTheDocument();
  expect(screen.getByText("No trades yet")).toBeInTheDocument();
  localStorage.removeItem("journal.locale");
});

test("the Update button shows only on NQ / ES and pulls the latest CME week", async () => {
  const [nq, es] = testPair();
  let release!: () => void;
  const liveFetch = vi.fn(() => new Promise<typeof nq>((res) => (release = () => res(nq))));
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch, liveFetch });
  store.openSession([{ name: "US100", bars: nq }, { name: "NQ", bars: es }]);
  render(
    <LocaleProvider>
      <ReplayPage store={store} />
    </LocaleProvider>,
  );
  expect(screen.queryByRole("button", { name: "Cập nhật" })).not.toBeInTheDocument();
  act(() => store.setPaneSymbol("NQ"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Cập nhật" }));
  expect(liveFetch).toHaveBeenCalledWith("NQ", expect.any(Number));
  // đang kéo: nút khoá lại, đổi chữ
  expect(screen.getByRole("button", { name: "Đang cập nhật…" })).toBeDisabled();
  await act(async () => release());
  // jsdom không có IndexedDB: nến mới vào chart nhưng không lưu được, trang nói rõ điều đó
  expect(await screen.findByTestId("replay-toast")).toHaveTextContent("Đã cập nhật nhưng trình duyệt không cho lưu: tải lại trang sẽ mất phần mới.");
  expect(store.getState().counts.NQ).toBe(nq.n + es.n - [...nq.T].filter((t) => es.T.includes(t)).length);
  expect(screen.getByRole("button", { name: "Cập nhật" })).toBeEnabled();
});

// Chuỗi có tham số phải hiện đã nội suy (một ngoặc {n}, không phải {{n}}).
test("the stale Update toast shows the interpolated count and time", async () => {
  const store = setup();
  act(() => store.notify("replay.toast.liveStale", { n: "6,900", to: "23/10 16:59" }));
  expect(await screen.findByTestId("replay-toast")).toHaveTextContent(
    "Không kéo được tuần mới nhất từ TradingView; đã lấy 6,900 nến 1m đã lưu, mới nhất 23/10 16:59.",
  );
});

test("a chart whose data starts later says so on the chart, and Jump to data start shows its first candle", async () => {
  const [nq] = testPair();
  const late = { ...nq, n: 500, T: nq.T.slice(-500), O: nq.O.slice(-500), H: nq.H.slice(-500), L: nq.L.slice(-500), C: nq.C.slice(-500), V: nq.V.slice(-500) };
  const store = new ReplayStore({ appTheme: () => "light", fetcher: (async () => new Response("", { status: 404 })) as typeof fetch });
  store.openSession([{ name: "US100", bars: nq }, { name: "NQ", bars: late }]);
  render(
    <LocaleProvider>
      <ReplayPage store={store} />
    </LocaleProvider>,
  );
  expect(screen.queryByTestId("replay-empty-0")).not.toBeInTheDocument();
  act(() => store.setPaneSymbol("NQ"));
  const from = `${fmtLocal(toLocal(late.T[0], "NY"))} NY`;
  expect(screen.getByTestId("replay-empty-0")).toHaveTextContent(`NQ chỉ có data từ ${from}.`);
  expect(await screen.findByTestId("replay-toast")).toHaveTextContent(`NQ chỉ có data từ ${from}. Dùng nút trên chart để tới đó.`);

  await userEvent.setup().click(within(screen.getByTestId("replay-empty-0")).getByRole("button", { name: "Tới đầu data" }));
  expect(store.getState().now).toBe(late.T[0]);
  expect(screen.queryByTestId("replay-empty-0")).not.toBeInTheDocument();
  expect(screen.getByTestId("replay-info-0")).toHaveTextContent(`Giá ${late.C[0].toFixed(2)}`);
});

test("a short toast hides after 2.5 s, a long one stays long enough to read, and hovering keeps it", () => {
  const store = setup();
  vi.useFakeTimers();
  try {
    act(() => store.notify("replay.toast.nothingToUndo"));
    const short = toastMs(screen.getByTestId("replay-toast").textContent ?? "");
    expect(short).toBeLessThan(3000);
    act(() => vi.advanceTimersByTime(short - 100));
    expect(screen.getByTestId("replay-toast")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId("replay-toast")).not.toBeInTheDocument();

    act(() => store.notify("replay.toast.liveFailed", { error: "dial tradingview: 403 Forbidden, the guest session expired" }));
    const long = screen.getByTestId("replay-toast");
    const ms = toastMs(long.textContent ?? "");
    expect(ms).toBeGreaterThan(5000);
    act(() => vi.advanceTimersByTime(ms - 100));
    expect(screen.getByTestId("replay-toast")).toBeInTheDocument();
    // rê chuột vào thì giữ lại tới khi rời ra
    fireEvent.pointerEnter(long);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByTestId("replay-toast")).toBeInTheDocument();
    fireEvent.pointerLeave(long);
    act(() => vi.advanceTimersByTime(ms));
    expect(screen.queryByTestId("replay-toast")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
  expect(toastMs("Đã lưu.")).toBe(2500);
  expect(toastMs("x".repeat(1000))).toBe(10_000);
});

test("arrow keys on the split handle move the split only, not the replay; ⌘C with text selected copies the text", async () => {
  const store = setup();
  act(() => store.setLayout(2));
  const now = store.getState().now;
  const handle = screen.getByRole("separator");
  handle.focus();
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  fireEvent.keyDown(handle, { key: " " });
  expect(store.getState().now).toBe(now);
  expect(store.getState().playing).toBe(false);

  // một hình đang chọn + chữ đang bôi đen: ⌘C không bị chiếm để chép hình
  act(() => {
    const d = store.addDrawing({ sym: "DEMO US100", type: "hray", pts: [{ t: 1, p: 1 }] });
    store.select(d.id);
  });
  const copy = vi.spyOn(store, "copyDrawing");
  const text = screen.getByText("Chưa có lệnh nào");
  (document.activeElement as HTMLElement | null)?.blur();
  window.getSelection()!.selectAllChildren(text);
  const ev = new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(copy).not.toHaveBeenCalled();
  expect(ev.defaultPrevented).toBe(false);
  window.getSelection()!.removeAllRanges();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true, bubbles: true, cancelable: true }));
  expect(copy).toHaveBeenCalled();
});

test("the quick-nav button fast-forwards, and the menu runs an item and makes it the button's action", async () => {
  const store = setup();
  const user = userEvent.setup();
  const nav = screen.getByRole("group", { name: "Điều hướng nhanh" });
  const main = within(nav).getByRole("button", { name: /Phiên New York/ });
  expect(main).toHaveAttribute("title", "Tua tới lần kế tiếp của: Phiên New York (giờ New York)");
  const t0 = store.getState().now;
  await user.click(main);
  expect(store.getState().now).toBeGreaterThan(t0);
  expect(screen.getByTestId("replay-time")).toHaveTextContent("09:15");

  await user.click(within(nav).getByRole("button", { name: "Chọn mốc để tua tới" }));
  // mặc định menu có 3 mục cố định, phiên New York đã ghim, và Tuỳ chỉnh
  expect(screen.getByRole("menuitem", { name: /Phiên kế tiếp/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Mở ngày giao dịch mới/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Phiên New York\s*09:15/ })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /Phiên London/ })).toBeNull();
  await user.click(screen.getByRole("menuitem", { name: /Silver Bullet kế tiếp/ }));
  expect(store.getState().navAction).toBe("nextSilverBullet");
  expect(within(nav).getByRole("button", { name: /Silver Bullet kế tiếp/ })).toBeInTheDocument();
});

test("Custom Settings: pin, change a time and save; Cancel throws the draft away; all days skipped is refused", async () => {
  const store = setup();
  const user = userEvent.setup();
  const openSettings = async () => {
    await user.click(screen.getByRole("button", { name: "Chọn mốc để tua tới" }));
    await user.click(screen.getByRole("menuitem", { name: "Tuỳ chỉnh…" }));
    return screen.findByRole("dialog", { name: "Tuỳ chỉnh điều hướng" });
  };

  let dlg = await openSettings();
  expect(within(dlg).getByRole("combobox", { name: "Giờ bắt đầu Phiên Á" })).toHaveTextContent("19:00");
  await user.click(within(dlg).getByRole("button", { name: "Ghim Phiên London vào menu nhanh" }));
  expect(within(dlg).getByRole("button", { name: "Bỏ ghim Phiên London khỏi menu nhanh" })).toHaveAttribute("aria-pressed", "true");
  await user.click(within(dlg).getByRole("combobox", { name: "Giờ bắt đầu Phiên London" }));
  await user.click(await screen.findByRole("option", { name: "02:30" }));
  await user.click(within(dlg).getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(store.getState().nav.slots.london).toEqual({ time: "02:30", star: true });
  await user.click(screen.getByRole("button", { name: "Chọn mốc để tua tới" }));
  expect(screen.getByRole("menuitem", { name: /Phiên London\s*02:30/ })).toBeInTheDocument();
  await user.keyboard("{Escape}");

  dlg = await openSettings();
  await user.click(within(dlg).getByRole("button", { name: "Bỏ qua T2" }));
  await user.click(within(dlg).getByRole("button", { name: "Huỷ" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(store.getState().nav.skipDays).toEqual([]);

  dlg = await openSettings();
  for (const d of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) await user.click(within(dlg).getByRole("button", { name: `Bỏ qua ${d}` }));
  await user.click(within(dlg).getByRole("button", { name: "Lưu" }));
  expect(within(dlg).getByRole("alert")).toHaveTextContent("Phải chừa lại ít nhất một ngày để tua tới.");
  expect(store.getState().nav.skipDays).toEqual([]);
  // Reset to defaults đổ mặc định vào bản nháp; Lưu mới ghi
  await user.click(within(dlg).getByRole("button", { name: "Khôi phục mặc định" }));
  expect(within(dlg).getByRole("combobox", { name: "Giờ bắt đầu Phiên London" })).toHaveTextContent("02:00");
  await user.click(within(dlg).getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(store.getState().nav.slots.london).toEqual({ time: "02:00", star: false });
});
