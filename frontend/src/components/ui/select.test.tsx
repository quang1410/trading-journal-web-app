import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function Thu() {
  const [v, setV] = useState("");
  return (
    <>
      {/* label[for] trỏ tới SelectTrigger — trigger là <button>, mà button là
          thẻ gắn nhãn được, nên getByLabelText tìm ra. Đã kiểm. */}
      <label htmlFor="o-chieu">Chiều lệnh</label>
      <Select value={v} onValueChange={setV}>
        <SelectTrigger id="o-chieu">
          <SelectValue placeholder="Chọn" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Long">Long</SelectItem>
          <SelectItem value="Short">Short</SelectItem>
        </SelectContent>
      </Select>
      <output data-testid="da-chon">{v}</output>
    </>
  );
}

test("Select mở ra, chọn được, và trả giá trị", async () => {
  const u = userEvent.setup();
  render(<Thu />);

  await u.click(screen.getByLabelText("Chiều lệnh"));
  await u.click(await screen.findByRole("option", { name: "Short" }));

  expect(screen.getByTestId("da-chon")).toHaveTextContent("Short");
});
