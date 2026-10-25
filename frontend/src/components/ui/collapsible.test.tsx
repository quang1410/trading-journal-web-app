import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

test("Collapsible: gập sẵn, nút mang aria-expanded, bấm thì hiện nội dung", async () => {
  const user = userEvent.setup();
  render(
    <Collapsible>
      <CollapsibleTrigger>Shortcuts</CollapsibleTrigger>
      <CollapsibleContent>Space plays</CollapsibleContent>
    </Collapsible>,
  );
  const btn = screen.getByRole("button", { name: "Shortcuts" });
  expect(btn).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Space plays")).not.toBeInTheDocument();
  await user.click(btn);
  expect(btn).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Space plays")).toBeInTheDocument();
});
