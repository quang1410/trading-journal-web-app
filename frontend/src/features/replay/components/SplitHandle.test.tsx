import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { LocaleProvider } from "@/i18n";
import { clampSplit, SplitHandle, splitAt } from "./SplitHandle";

// khung chart giả: rộng 1000px, bắt đầu ở x = 100
function Harness({ initial = 0.5 }: { initial?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(initial);
  return (
    <div ref={ref} data-testid="wrap" data-split={split}>
      <SplitHandle split={split} onChange={setSplit} containerRef={ref} />
    </div>
  );
}

function setup(initial?: number) {
  render(
    <LocaleProvider>
      <Harness initial={initial} />
    </LocaleProvider>,
  );
  const wrap = screen.getByTestId("wrap");
  wrap.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, height: 500, right: 1100, bottom: 500, x: 100, y: 0, toJSON: () => ({}) });
  return { wrap, handle: screen.getByRole("separator") };
}

beforeEach(() => localStorage.clear());

test("split ratio is clamped to 20%..80% and falls back to 50% on junk", () => {
  expect(clampSplit(0.05)).toBe(0.2);
  expect(clampSplit(0.95)).toBe(0.8);
  expect(clampSplit(0.37)).toBe(0.37);
  expect(clampSplit(Number.NaN)).toBe(0.5);
  expect(splitAt(400, 100, 1000)).toBeCloseTo(0.3);
  expect(splitAt(400, 100, 0)).toBe(0.5);
});

test("dragging the handle resizes the panes and remembers the ratio after release", () => {
  const { wrap, handle } = setup();
  fireEvent.pointerDown(handle, { clientX: 600, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
  expect(Number(wrap.dataset.split)).toBeCloseTo(0.3);
  expect(localStorage.getItem("journal.replay.split")).toBeNull(); // chưa thả chuột thì chưa ghi
  fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });
  expect(Number(localStorage.getItem("journal.replay.split"))).toBeCloseTo(0.3);
  // di chuột sau khi thả không còn kéo nữa
  fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
  expect(Number(wrap.dataset.split)).toBeCloseTo(0.3);
});

test("arrow keys nudge the split, double-click resets to 50/50", () => {
  const { wrap, handle } = setup(0.5);
  expect(handle).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(Number(wrap.dataset.split)).toBeCloseTo(0.48);
  expect(Number(localStorage.getItem("journal.replay.split"))).toBeCloseTo(0.48);
  fireEvent.doubleClick(handle);
  expect(Number(wrap.dataset.split)).toBe(0.5);
  expect(Number(localStorage.getItem("journal.replay.split"))).toBe(0.5);
});

test("Home / End jump to the limits; losing pointer capture ends the drag", () => {
  const { wrap, handle } = setup();
  fireEvent.keyDown(handle, { key: "Home" });
  expect(wrap.dataset.split).toBe("0.2");
  fireEvent.keyDown(handle, { key: "End" });
  expect(wrap.dataset.split).toBe("0.8");
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 900 });
  expect(document.querySelector(".fixed.inset-0")).not.toBeNull();
  fireEvent.lostPointerCapture(handle, { pointerId: 1 });
  expect(document.querySelector(".fixed.inset-0")).toBeNull();
});
