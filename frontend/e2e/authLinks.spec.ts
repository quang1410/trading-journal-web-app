import { expect, test } from "@playwright/test";

/**
 * Lối "Tham gia danh sách chờ" ở trang đăng nhập, đi bằng bàn phím trên trình
 * duyệt thật (K-05). jsdom không tính CSS nên không bắt được viền focus bị
 * Tailwind triệt tiêu: `outline-none` đặt --tw-outline-style: none, và
 * `focus-visible:outline-2` đọc lại đúng biến đó.
 */
test("keyboard user reaches the waitlist from the login page with a visible focus ring", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: "Tham gia danh sách chờ" });
  await expect(link).toBeVisible();

  // Thứ tự Tab: email → mật khẩu → nút Đăng nhập → link.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(link).toBeFocused();

  const outline = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/\?ref=login$/);
  await expect(page.getByTestId("hero-signup")).toBeVisible();
});
