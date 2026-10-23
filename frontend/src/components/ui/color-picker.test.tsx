import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorPicker, hexToHsv, hsvToHex } from "./color-picker";

const LABELS = { area: "Saturation and brightness", hue: "Hue", hex: "Hex color" };

test("hex ↔ hsv round-trips", () => {
  for (const hex of ["#000000", "#ffffff", "#2962ff", "#f23645", "#808080", "#00bcd4"]) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
  expect(hexToHsv("#00ff00").h).toBe(120);
});

test("typing a hex code picks it; keyboard moves saturation/brightness; hue slider keeps s and v", async () => {
  const user = userEvent.setup();
  function Probe() {
    const [c, setC] = useState("#ff0000");
    return (
      <>
        <ColorPicker value={c} onChange={setC} labels={LABELS} />
        <output data-testid="c">{c}</output>
      </>
    );
  }
  render(<Probe />);
  const hex = screen.getByRole("textbox", { name: "Hex color" });
  await user.clear(hex);
  await user.type(hex, "#0000FF");
  expect(screen.getByTestId("c")).toHaveTextContent("#0000ff");

  screen.getByRole("slider", { name: LABELS.area }).focus();
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}"); // tối đi 10%
  expect(screen.getByTestId("c")).toHaveTextContent("#0000e6");

  screen.getByRole("slider", { name: "Hue" }).focus();
  await user.keyboard("{Home}"); // sắc độ 0 = đỏ, giữ nguyên độ bão hoà / độ sáng
  expect(screen.getByTestId("c")).toHaveTextContent("#e60000");
});

test("a grey or black color keeps the hue instead of jumping to red; an upper-case echo is not a new color", async () => {
  const user = userEvent.setup();
  function Probe() {
    const [c, setC] = useState("#0000ff");
    // nơi dùng viết hoa giá trị nhận được: không được coi là màu mới từ ngoài
    return <ColorPicker value={c.toUpperCase()} onChange={setC} labels={LABELS} />;
  }
  render(<Probe />);
  const hue = screen.getByRole("slider", { name: "Hue" });
  expect(hue).toHaveAttribute("aria-valuenow", "240");
  const hex = screen.getByRole("textbox", { name: "Hex color" });
  await user.clear(hex);
  await user.type(hex, "#808080");
  expect(hue).toHaveAttribute("aria-valuenow", "240");
  expect(hex).toHaveValue("#808080");
  await user.clear(hex);
  await user.type(hex, "#000000");
  expect(hue).toHaveAttribute("aria-valuenow", "240");
  const area = screen.getByRole("slider", { name: LABELS.area });
  expect(area).toHaveAttribute("aria-valuemin", "0");
  expect(area).toHaveAttribute("aria-valuemax", "100");
  expect(area.getAttribute("aria-valuetext")).toMatch(/^\d+%, 0%, #000000$/);
});
