import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker } from "./date-time-picker";

test("chọn được cả ngày và giờ trong một date time picker", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <DateTimePicker
      id="entered-at"
      value="2026-06-01T09:30"
      onChange={onChange}
      placeholder="Chọn ngày và giờ"
      ariaLabel="Thời điểm vào lệnh"
      timeLabel="Giờ vào lệnh"
    />,
  );

  expect(screen.getByRole("button", { name: "Thời điểm vào lệnh" })).toHaveTextContent(
    "01/06/2026, 09:30",
  );
  await user.click(screen.getByRole("button", { name: "Thời điểm vào lệnh" }));
  await user.click(screen.getByRole("button", { name: "Chọn ngày 15/06/2026" }));
  await user.clear(screen.getByLabelText("Giờ vào lệnh"));
  await user.type(screen.getByLabelText("Giờ vào lệnh"), "10:45");

  expect(onChange).toHaveBeenLastCalledWith("2026-06-15T10:45");
});
