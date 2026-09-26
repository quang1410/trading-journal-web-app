import { expect, test, vi } from "vitest";

// recharts chỉ được phép nạp khi mở tab Ngày/Tuần. Nếu chunk TradesPage kéo
// nó vào ngay (import tĩnh PeriodList → PeriodCard → PeriodSparkline), tab
// Lệnh chậm hẳn đi và switchAccount.test.tsx quá hạn findByText trên CI.
// Factory ném lỗi nên chỉ cần ai đó import recharts là import dưới đây đỏ.
vi.mock("recharts", () => {
  throw new Error("recharts must not load with the TradesPage chunk");
});

test("the TradesPage chunk does not statically pull in recharts", async () => {
  await expect(import("./TradesPage")).resolves.toHaveProperty("TradesPage");
});
