import { describe, expect, test } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  test("dưới một phút hiện giây, không phần thập phân", () => {
    // Nửa giây không nói thêm được gì về một lệnh giữ 45 giây.
    expect(formatDuration(45, "vi")).toBe("45s");
    expect(formatDuration(0, "vi")).toBe("0s");
    expect(formatDuration(59, "vi")).toBe("59s");
  });

  test("phút hiện một chữ số thập phân, dấu phẩy theo locale vi", () => {
    expect(formatDuration(786, "vi")).toBe("13,1m");
    expect(formatDuration(60, "vi")).toBe("1,0m");
  });

  test("locale en dùng dấu chấm", () => {
    expect(formatDuration(786, "en")).toBe("13.1m");
  });

  test("từ một giờ trở lên hiện giờ", () => {
    expect(formatDuration(3600, "vi")).toBe("1,0h");
    expect(formatDuration(9000, "vi")).toBe("2,5h");
  });

  test("từ một ngày trở lên hiện ngày", () => {
    expect(formatDuration(86400, "vi")).toBe("1,0 ngày");
    expect(formatDuration(103680, "vi")).toBe("1,2 ngày");
  });

  test("biên khít với ngưỡng đơn vị kế tiếp", () => {
    // 3599s vẫn là phút, 3600s đã là giờ — không có khe nào giữa hai đơn vị.
    expect(formatDuration(3599, "vi")).toBe("60,0m");
    expect(formatDuration(86399, "vi")).toBe("24,0h");
  });
});
