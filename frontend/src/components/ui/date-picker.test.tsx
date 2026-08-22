import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./date-picker";

function ControlledDatePicker({
  initialValue,
  ariaLabel,
  placeholder,
  onChange,
}: {
  initialValue: string;
  ariaLabel: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <DatePicker
      id="test-date"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
    />
  );
}

test("date picker hiển thị ngày theo dd/mm/yyyy và chọn ngày dạng YYYY-MM-DD", async () => {
  const u = userEvent.setup();
  const daChon: string[] = [];

  render(
    <ControlledDatePicker
      initialValue="2026-06-01"
      onChange={(value) => daChon.push(value)}
      placeholder="Từ ngày"
      ariaLabel="Từ ngày"
    />,
  );

  expect(screen.getByRole("button", { name: "Từ ngày" })).toHaveTextContent("01/06/2026");

  await u.click(screen.getByRole("button", { name: "Từ ngày" }));
  expect(screen.getByRole("dialog", { name: "Chọn Từ ngày" })).toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Chọn ngày 15/06/2026" }));

  expect(daChon).toEqual(["2026-06-15"]);
  expect(screen.queryByRole("dialog", { name: "Chọn Từ ngày" })).not.toBeInTheDocument();
});

test("date picker xoá được giá trị và có nút hôm nay", async () => {
  const u = userEvent.setup();
  const daChon: string[] = [];

  render(
    <ControlledDatePicker
      initialValue="2026-06-01"
      onChange={(value) => daChon.push(value)}
      placeholder="Đến ngày"
      ariaLabel="Đến ngày"
    />,
  );

  await u.click(screen.getByRole("button", { name: "Đến ngày" }));
  await u.click(screen.getByRole("button", { name: "Xoá" }));

  expect(daChon).toEqual([""]);
  expect(screen.getByRole("button", { name: "Đến ngày" })).toHaveTextContent("Đến ngày");
});
