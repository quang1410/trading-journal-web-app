import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableSelect } from "./searchable-select";

test("tìm kiếm và chọn được một option", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();

  render(
    <>
      <label htmlFor="timezone">Múi giờ</label>
      <SearchableSelect
        id="timezone"
        value="Asia/Ho_Chi_Minh"
        options={["America/New_York", "Asia/Ho_Chi_Minh", "Europe/London"]}
        onValueChange={onValueChange}
        placeholder="Chọn múi giờ"
        searchPlaceholder="Tìm múi giờ"
        emptyMessage="Không tìm thấy múi giờ"
      />
    </>,
  );

  await user.click(screen.getByRole("combobox", { name: "Múi giờ" }));
  await user.type(screen.getByRole("searchbox", { name: "Tìm múi giờ" }), "new_york");

  expect(screen.getByRole("option", { name: "America/New_York" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Asia/Ho_Chi_Minh" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("option", { name: "America/New_York" }));
  expect(onValueChange).toHaveBeenCalledWith("America/New_York");
});

test("hiện trạng thái không có kết quả", async () => {
  const user = userEvent.setup();

  render(
    <SearchableSelect
      id="timezone"
      value=""
      options={["Asia/Ho_Chi_Minh"]}
      onValueChange={() => {}}
      placeholder="Chọn múi giờ"
      searchPlaceholder="Tìm múi giờ"
      emptyMessage="Không tìm thấy múi giờ"
    />,
  );

  await user.click(screen.getByRole("combobox"));
  await user.type(screen.getByRole("searchbox"), "Mars");

  expect(screen.getByText("Không tìm thấy múi giờ")).toBeInTheDocument();
});
