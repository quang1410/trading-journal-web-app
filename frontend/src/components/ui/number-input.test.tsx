import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "./number-input";

function Harness({ initial = "", min, max, step }: { initial?: string; min?: number; max?: number; step?: number }) {
  const [v, setV] = useState(initial);
  return <NumberInput aria-label="qty" value={v} onValueChange={setV} min={min} max={max} step={step} />;
}

test("là ô chữ inputMode decimal, không phải type=number của trình duyệt", () => {
  render(<Harness />);
  const box = screen.getByRole("textbox", { name: "qty" });
  expect(box).toHaveAttribute("type", "text");
  expect(box).toHaveAttribute("inputmode", "decimal");
});

test("chỉ nhận chữ số và một dấu chấm; dấu phẩy thành dấu chấm", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const box = screen.getByRole("textbox", { name: "qty" });
  await user.type(box, "1a2,5.7x");
  expect(box).toHaveValue("12.57");
});

test("dấu trừ chỉ được nhận khi min cho phép số âm", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<Harness min={0} />);
  await user.type(screen.getByRole("textbox", { name: "qty" }), "-3");
  expect(screen.getByRole("textbox", { name: "qty" })).toHaveValue("3");
  unmount();
  render(<Harness />);
  await user.type(screen.getByRole("textbox", { name: "qty" }), "-3");
  expect(screen.getByRole("textbox", { name: "qty" })).toHaveValue("-3");
});

test("mũi tên lên/xuống cộng trừ step, kẹp trong [min, max], không lệch số lẻ", async () => {
  const user = userEvent.setup();
  render(<Harness initial="0.1" min={0} max={0.5} step={0.1} />);
  const box = screen.getByRole("textbox", { name: "qty" });
  box.focus();
  await user.keyboard("{ArrowUp}{ArrowUp}");
  expect(box).toHaveValue("0.3");
  await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
  expect(box).toHaveValue("0.5");
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
  expect(box).toHaveValue("0.0");
});

test("bước nguyên giữ số chữ số lẻ đang có", async () => {
  const user = userEvent.setup();
  render(<Harness initial="1.25" />);
  const box = screen.getByRole("textbox", { name: "qty" });
  box.focus();
  await user.keyboard("{ArrowUp}");
  expect(box).toHaveValue("2.25");
});
