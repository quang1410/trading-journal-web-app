import { expect, test } from "@playwright/test";
import { queryE2EDb } from "./db";

/**
 * Landing trên stack thật. Chạy SAU auth.spec.ts (thứ tự chữ cái), không cần
 * user: chỉ đi qua hai endpoint công khai.
 *
 * Phần MSW không thay thế được: backend thật chuẩn hoá email và giữ dòng
 * đầu tiên, nên đăng ký lại với chữ hoa vẫn ra cùng một phản hồi.
 */
test("a visitor joins the waitlist and answers the questions", async ({ page }) => {
  await page.goto("/?ref=e2e");
  await expect(page.getByRole("heading", { level: 1, name: "Lệnh lãi chưa chắc là lệnh đúng." })).toBeVisible();

  const hero = page.getByTestId("hero-signup");
  await hero.getByLabel("Email").fill("Khach@Example.com");
  await hero.getByRole("button", { name: "Vào danh sách chờ" }).click();
  await expect(hero.getByText("Thư mời sẽ gửi tới Khach@Example.com.")).toBeVisible();

  await hero.getByRole("radio", { name: "Excel / Google Sheets" }).click();
  await hero.getByRole("checkbox", { name: "Crypto" }).click();
  await hero.getByRole("radio", { name: "Đang thi" }).click();
  await hero.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(hero.getByText("Đã lưu câu trả lời.")).toBeVisible();

  // Đăng ký lại cùng email (khác hoa thường) qua API: phản hồi y hệt lần đầu.
  const again = await page.request.post("/api/waitlist", {
    data: { email: "khach@example.com", locale: "vi", source: "", website: "" },
  });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ code: 0, msg: "ok", data: { joined: true } });

  // Phản hồi giống hệt nhau là cố ý, nên chỉ DB mới cho biết đã lưu gì: một
  // dòng, email đã chuẩn hoá, nguồn của lần đầu (lần gửi lại không có nguồn
  // không được ghi đè), và đủ ba câu trả lời.
  expect(
    queryE2EDb(
      `SELECT email, locale, source, journal_tool, markets, prop_status, answered_at IS NOT NULL
       FROM waitlist_signups`,
    ),
  ).toBe("khach@example.com|vi|e2e|spreadsheet|crypto|active|t");
});

test("the scoring ticket loads its labels from the real backend", async ({ page }) => {
  await page.goto("/");
  const ticket = page.getByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });
  await expect(ticket.getByTestId("ticket-total")).toHaveText("35/100");
  await ticket.getByRole("group", { name: "Vào lệnh" }).getByRole("radio", { name: "Đúng kế hoạch" }).click();
  await expect(ticket.getByTestId("ticket-total")).toHaveText("50/100");
});
