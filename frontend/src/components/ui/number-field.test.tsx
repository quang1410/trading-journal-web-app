import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "./number-field";

function Probe({ start = 1, step, min, max, disabled, readOnly }: { start?: number; step?: number; min?: number; max?: number; disabled?: boolean; readOnly?: boolean }) {
  const [v, setV] = useState(start);
  const [calls, setCalls] = useState<number[]>([]);
  return (
    <>
      <NumberField aria-label="Price" value={v} step={step} min={min} max={max} disabled={disabled} readOnly={readOnly} onValueChange={(x) => { setV(x); setCalls((c) => [...c, x]); }} />
      <output data-testid="calls">{calls.join(",")}</output>
      {/* giá trị đổi từ ngoài, như kéo hình trên chart */}
      <button type="button" className="cursor-pointer" onMouseDown={(e) => e.preventDefault()} onClick={() => setV(42)}>
        outside
      </button>
    </>
  );
}

test("arrows step by `step` without float noise and stay inside min/max", async () => {
  const user = userEvent.setup();
  render(<Probe start={0.2} step={0.1} min={0} max={0.4} />);
  const box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.keyboard("{ArrowUp}");
  expect(box).toHaveValue("0.3"); // không phải 0.30000000000000004
  await user.keyboard("{ArrowUp}{ArrowUp}");
  expect(box).toHaveValue("0.4");
  expect(box).toHaveAttribute("aria-valuenow", "0.4");
});

test("half-typed text is not reported; a finished number is", async () => {
  const user = userEvent.setup();
  render(<Probe />);
  const box = screen.getByRole("spinbutton", { name: "Price" });
  await user.clear(box);
  await user.type(box, "-.");
  expect(screen.getByTestId("calls")).toHaveTextContent(/^$/);
  await user.type(box, "5");
  expect(screen.getByTestId("calls")).toHaveTextContent("-0.5");
  await user.tab();
  expect(box).toHaveValue("-0.5");
});

test("the step buttons work and are skipped by Tab", async () => {
  const user = userEvent.setup();
  render(<Probe start={10} />);
  const [up, down] = document.querySelectorAll<HTMLButtonElement>('[data-slot="number-field"] button');
  await user.click(up);
  await user.click(up);
  await user.click(down);
  expect(screen.getByRole("spinbutton", { name: "Price" })).toHaveValue("11");
  expect(up).toHaveAttribute("tabindex", "-1");
});

test("disabled and read-only fields ignore the step buttons and the keyboard", async () => {
  const user = userEvent.setup();
  const { container, unmount } = render(<Probe start={5} disabled />);
  const [up] = container.querySelectorAll("button");
  expect(up).toBeDisabled();
  await user.click(up);
  expect(screen.getByTestId("calls")).toHaveTextContent("");
  unmount();

  render(<Probe start={5} readOnly />);
  const box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.keyboard("{ArrowUp}{PageUp}{End}");
  expect(box).toHaveValue("5");
  expect(screen.getByTestId("calls")).toHaveTextContent("");
});

test("a value changed from outside shows even while the field has focus", async () => {
  const user = userEvent.setup();
  render(<Probe start={5} />);
  const box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.click(screen.getByRole("button", { name: "outside" }));
  expect(box).toHaveFocus();
  expect(box).toHaveValue("42");
});

test("pasted thousands separators, exponent steps, extra decimals and Page / Home / End keys", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<Probe start={0} min={-5000} max={5000} />);
  let box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.clear(box);
  await user.paste("1,000.5");
  expect(box).toHaveAttribute("aria-valuenow", "1000.5");
  await user.keyboard("{PageUp}");
  expect(box).toHaveValue("1010.5");
  await user.keyboard("{Home}");
  expect(box).toHaveValue("-5000");
  await user.keyboard("{End}");
  expect(box).toHaveValue("5000");
  unmount();

  render(<Probe start={0.123} step={0.1} />);
  box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.keyboard("{ArrowUp}");
  expect(box).toHaveValue("0.223"); // không bị làm tròn về 1 chữ số lẻ của step
});

test("a tiny exponent-form step keeps its decimals", async () => {
  const user = userEvent.setup();
  render(<Probe start={0} step={1e-7} />);
  const box = screen.getByRole("spinbutton", { name: "Price" });
  await user.click(box);
  await user.keyboard("{ArrowUp}{ArrowUp}");
  expect(box).toHaveAttribute("aria-valuenow", "2e-7");
});
