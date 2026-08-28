import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StatGrid, StatTile } from "./StatTile";

// Hợp đồng trợ năng: trước đây bốn file tự khai ô riêng, chỉ cần một bản quên
// role/aria-label là trình đọc màn hình mất tên ô mà không ai hay.
test("mỗi ô là một group có tên đọc được", () => {
  render(
    <StatGrid col="sm:grid-cols-3">
      <StatTile label="Lãi ròng">
        <span>+100</span>
      </StatTile>
    </StatGrid>,
  );
  const o = screen.getByRole("group", { name: "Lãi ròng" });
  expect(o).toHaveTextContent("+100");
});

// Bậc padding là MỘT quyết định ở một chỗ. StatsStrip từng trôi sang p-4 trong
// im lặng vì nó giữ bản chép riêng.
test("mặc định p-3, và rong thì p-4", () => {
  render(
    <>
      <StatTile label="hẹp">x</StatTile>
      <StatTile label="rộng" wide>
        y
      </StatTile>
    </>,
  );
  expect(screen.getByRole("group", { name: "hẹp" }).className).toContain("p-3");
  expect(screen.getByRole("group", { name: "rộng" }).className).toContain("p-4");
});
