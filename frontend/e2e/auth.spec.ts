import { expect, test } from "@playwright/test";

const EMAIL = "chu@example.com";
const MK = "matkhaudai123";

/**
 * Một câu chuyện tuần tự trên DB sạch, chạy trên stack Docker thật.
 *
 * Gộp làm một file vì ứng dụng chỉ mở đăng ký cho user ĐẦU TIÊN: hai spec
 * cùng đòi vai đó sẽ giẫm lên nhau, và thứ tự ở đây là một phần của phép
 * kiểm chứ không phải sự tiện tay.
 *
 * KỊCH BẢN MSW KHÔNG THAY THẾ ĐƯỢC là bước 6. Nó là bằng chứng duy nhất
 * rằng cookie refresh (HttpOnly, Path=/api/auth) đi đúng qua proxy nginx và
 * dựng lại được phiên sau khi tải lại trang. Access token chỉ sống trong
 * memory nên F5 xoá sạch nó; cookie sai đường thì người dùng bị đá ra login
 * mỗi lần refresh. Đổi credentials thành "omit" là 87 test Vitest vẫn xanh
 * hết, còn bước 6 đỏ ngay.
 */
test.describe.serial("vòng đời phiên trên stack thật", () => {
  test("1. chưa đăng nhập vào / thì ra trang Đăng nhập", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });

  test("2. đăng ký user đầu thì vào thẳng Tài khoản giao dịch", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(MK);
    await page.getByRole("button", { name: "Đăng ký" }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
  });

  test("3. đăng ký lần hai bị từ chối", async ({ browser }) => {
    const ctx = await browser.newContext(); // ngữ cảnh sạch = cửa sổ ẩn danh
    const p = await ctx.newPage();
    await p.goto("http://localhost:8080/register");
    await p.getByLabel("Email").fill("ke2@example.com");
    await p.getByLabel("Mật khẩu").fill(MK);
    await p.getByRole("button", { name: "Đăng ký" }).click();
    await expect(p.getByText("đã có tài khoản, đăng ký đã đóng")).toBeVisible();
    await ctx.close();
  });

  test("4. tạo FTMO vốn 10000 risk 1% thì bảng hiện 1% và 1R = 100", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Thêm tài khoản" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Mã tài khoản").fill("FTMO");
    await hop.getByLabel("Tên").fill("Quỹ thử thách");
    await hop.getByLabel("Vốn ban đầu").fill("10000");
    await hop.getByLabel("Rủi ro mỗi lệnh (%)").fill("1");
    await hop.getByRole("button", { name: "Lưu" }).click();

    const dong = page.getByRole("row", { name: /FTMO/ });
    await expect(dong).toContainText("1%");
    await expect(dong).toContainText("100");
  });

  test("5. thêm cash flow 500 deposit 2026-03-01", async ({ page }) => {
    await dangNhap(page);
    await page.getByLabel("Ngày").fill("2026-03-01");
    await page.getByLabel("Số tiền").fill("500");
    await page.getByLabel("Loại").selectOption("deposit");
    await page.getByLabel("Ghi chú").fill("nạp vốn");
    await page.getByRole("button", { name: "Thêm giao dịch" }).click();

    const dong = page.getByRole("row", { name: /nạp vốn/ });
    await expect(dong).toContainText("01/03/2026");
    await expect(dong).toContainText("Nạp");
    await expect(dong).toContainText("500");
    await expect(dong).toContainText("USD");
  });

  test("6. F5 vẫn đăng nhập, dữ liệu còn nguyên", async ({ page }) => {
    await dangNhap(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "FTMO", exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /nạp vốn/ })).toBeVisible();
    await expect(page).toHaveURL(/\/accounts$/);
  });

  test("7. đổi giao diện sáng rồi F5 thì vẫn sáng, KHÔNG nháy tối", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Giao diện sáng" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Bắt giá trị data-theme ở khoảnh khắc SỚM NHẤT có thể sau khi tải lại,
    // trước cả khi React kịp chạy. Nếu chỉ script inline trong index.html
    // thiếu thì ở đây sẽ đọc ra "dark" — chính là cú nháy tối.
    const som: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __theme: string }).__theme =
          document.documentElement.getAttribute("data-theme") ?? "KHÔNG CÓ";
      });
    });
    await page.reload();
    som.push(await page.evaluate(() => (window as unknown as { __theme: string }).__theme));

    expect(som[0]).toBe("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("8. xoá cash flow thì biến khỏi bảng", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Xoá giao dịch ngày 01/03/2026" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
    await expect(page.getByText(/chưa có giao dịch tiền nào/i)).toBeVisible();
  });

  test("9. đăng xuất rồi F5 thì ở lại trang Đăng nhập", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });
});

// Mỗi test chạy trong một ngữ cảnh trình duyệt SẠCH, nên luôn bắt đầu ở
// trạng thái ẩn danh — không có nhánh điều kiện nào ở đây. Phải chờ tiêu đề
// "Đăng nhập" hiện ra trước: lúc mới vào, app đang khôi phục phiên và hiện
// splash, ô Email chưa tồn tại. Một phép kiểm tức thời kiểu isVisible() sẽ
// đọc nhầm khoảnh khắc đó thành "đã đăng nhập rồi".
async function dangNhap(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Mật khẩu").fill(MK);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
}
