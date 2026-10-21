import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LocaleProvider } from "@/i18n";
import { testPair } from "./engine/testBars";
import { ReplayPage } from "./ReplayPage";
import { ReplayStore } from "./store/ReplayStore";

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
  const chart = { addCandlestickSeries: () => series, applyOptions: vi.fn(), remove: vi.fn(), timeScale: () => timeScale, priceScale: () => ({ width: () => 60 }) };
  return { createChart: () => chart, ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 } };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => localStorage.clear());

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

test("English locale", async () => {
  localStorage.setItem("journal.locale", "en");
  setup();
  expect(await screen.findByRole("button", { name: "Sessions" })).toBeInTheDocument();
  expect(screen.getByText("No trades yet")).toBeInTheDocument();
  localStorage.removeItem("journal.locale");
});
