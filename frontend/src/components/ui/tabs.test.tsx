import { render, screen } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

// Radix cho panel tabIndex=0, nên Tab dừng ở đó. Bỏ outline mà không có gì
// thay thế thì người dùng bàn phím mất dấu mình đang đứng đâu (K-45). Viền âm
// (-outline-offset-2) để khung overflow-auto như DrawingDialog không cắt mất.
test("a focusable tab panel shows a focus outline instead of removing it", () => {
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel</TabsContent>
    </Tabs>,
  );

  const panel = screen.getByRole("tabpanel");
  expect(panel).toHaveAttribute("tabindex", "0");
  const classes = panel.className.split(/\s+/);
  expect(classes).not.toContain("outline-none");
  expect(classes).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
      "focus-visible:outline-[var(--focus-ring)]",
    ]),
  );
});
