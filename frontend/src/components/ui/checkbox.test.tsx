import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu";

test("an indeterminate checkbox shows a dash, not a tick", () => {
  render(<Checkbox aria-label="All" checked="indeterminate" />);
  const box = screen.getByRole("checkbox", { name: "All" });
  expect(box).toHaveAttribute("aria-checked", "mixed");
  expect(box.querySelector(".lucide-minus")).not.toBeNull();
});

test("a menu checkbox item draws its box from the state Radix puts on the item (incl. indeterminate)", async () => {
  const user = userEvent.setup();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer">open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem checked="indeterminate">Some</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false}>None</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  await user.click(screen.getByText("open"));
  const some = screen.getByRole("menuitemcheckbox", { name: "Some" });
  expect(some).toHaveAttribute("data-state", "indeterminate");
  expect(some.querySelector(".lucide-minus")).not.toBeNull();
  // ô vuông không tự đặt data-state riêng (trước đây "indeterminate" bị đọc thành "checked")
  expect(some.querySelector("span.absolute")!.hasAttribute("data-state")).toBe(false);
  expect(screen.getByRole("menuitemcheckbox", { name: "None" }).querySelector(".lucide-minus")).toBeNull();
});
