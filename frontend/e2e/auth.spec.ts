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
 *
 * Từ bước 10 trở đi là hành trình lệnh. Bước 13 và 14 là phần MSW không thay
 * thế được: lũy kế do backend THẬT tính lại trên toàn dãy lệnh, nên chúng bắt
 * được cả lỗi FE vá cache lẫn lỗi backend lọc trước khi Enrich.
 */
/**
 * Chọn một giá trị trong Select của shadcn/Radix.
 *
 * KHÔNG dùng selectOption được: trigger là <button role="combobox">, không
 * phải <select>, và danh sách option nằm trong portal ở cuối <body> chứ
 * không nằm trong trigger — nên phải tìm option ở phạm vi page.
 * `nhan` là nhãn của trường, `hienThi` là chữ trên option (không phải value).
 */
async function chonSelect(
  page: import("@playwright/test").Page,
  nhan: string,
  hienThi: string,
) {
  await page.getByLabel(nhan).click();
  await page.getByRole("option", { name: hienThi, exact: true }).click();
}

async function chonNgay(page: import("@playwright/test").Page, value: string) {
  const [nam, thang, ngay] = value.split("-").map(Number);
  await page.getByLabel("Ngày").click();
  const khoangCachThang = await page.evaluate(({ nam, thang }) => {
    const now = new Date();
    return nam * 12 + thang - 1 - (now.getFullYear() * 12 + now.getMonth());
  }, { nam, thang });
  const nutThang = khoangCachThang < 0 ? "Tháng trước" : "Tháng sau";
  for (let i = 0; i < Math.abs(khoangCachThang); i += 1) {
    await page.getByRole("button", { name: nutThang }).click();
  }
  await page
    .getByRole("button", {
      name: `Chọn ngày ${String(ngay).padStart(2, "0")}/${String(thang).padStart(2, "0")}/${nam}`,
      exact: true,
    })
    .click();
}

test.describe.serial("vòng đời phiên và hành trình lệnh trên stack thật", () => {
  test("1. chưa đăng nhập vào / thì ra trang Đăng nhập", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });

  test("2. đăng ký user đầu thì vào thẳng bảng điều khiển", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(MK);
    await page.getByRole("button", { name: "Đăng ký" }).click();
    // Đường đi tới /dashboard, nhưng DB còn trống nên chưa có tài khoản nào —
    // route đúng đích, chỉ là nhánh "chưa có tài khoản" của nó. Lối "Tạo tài
    // khoản giao dịch" là bằng chứng đã tới đúng nơi.
    await expect(page.getByRole("link", { name: "Tạo tài khoản giao dịch" })).toBeVisible();
  });

  test("3. đăng ký lần hai bị từ chối", async ({ browser, baseURL }) => {
    // baseURL của config KHÔNG tự chảy vào browser.newContext() — nó chỉ được
    // gắn cho fixture `page`. Không truyền tay thì đường dẫn tương đối hỏng và
    // test này lặng lẽ đóng đinh vào một cổng, bỏ qua E2E_BASE_URL.
    const ctx = await browser.newContext({ baseURL }); // ngữ cảnh sạch = cửa sổ ẩn danh
    const p = await ctx.newPage();
    await p.goto("/register");
    await p.getByLabel("Email").fill("ke2@example.com");
    await p.getByLabel("Mật khẩu").fill(MK);
    await p.getByRole("button", { name: "Đăng ký" }).click();
    await expect(p.getByText("đã có tài khoản, đăng ký đã đóng")).toBeVisible();
    await ctx.close();
  });

  test("4. tạo FTMO vốn 10000 risk 1% thì bảng hiện 1% và 1R = 100", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("link", { name: "Tài khoản", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
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
    await page.getByRole("link", { name: "Tài khoản", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await chonNgay(page, "2026-03-01");
    await page.getByLabel("Số tiền").fill("500");
    await chonSelect(page, "Loại", "Nạp");
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
    await page.getByRole("link", { name: "Tài khoản", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "FTMO", exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /nạp vốn/ })).toBeVisible();
    await expect(page).toHaveURL(/\/accounts$/);
  });

  test("7. đổi giao diện sáng rồi F5 thì vẫn sáng, KHÔNG nháy tối", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Mở tuỳ chọn người dùng" }).click();
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

  test("sidebar desktop thu gọn thành rail rồi mở lại được", async ({ page }) => {
    await dangNhap(page);
    const thuGon = page.getByRole("button", { name: "Thu gọn thanh điều hướng" });

    await thuGon.click();
    await expect(page.getByRole("button", { name: "Mở rộng thanh điều hướng" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();
    await expect(page.getByRole("button", { name: "Thu gọn thanh điều hướng" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("sidebar mobile mở drawer và tự đóng khi chọn trang", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await dangNhap(page);
    await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();

    const drawer = page.getByRole("dialog", { name: "Thanh điều hướng" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Nhật ký lệnh" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Nhật ký lệnh" })).toBeVisible();
  });

  test("8. xoá cash flow thì biến khỏi bảng", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("link", { name: "Tài khoản", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await page.getByRole("button", { name: "Xoá giao dịch ngày 01/03/2026" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
    await expect(page.getByText(/chưa có giao dịch tiền nào/i)).toBeVisible();
  });

  test("9. đăng xuất rồi F5 thì ở lại trang Đăng nhập", async ({ page }) => {
    await dangNhap(page);
    await page.getByRole("button", { name: "Mở tuỳ chọn người dùng" }).click();
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });

  // ---- Hành trình lệnh (bước 10-16) --------------------------------------
  //
  // Nối vào đây chứ không mở trades.spec.ts riêng: ứng dụng chỉ cho đăng ký
  // user ĐẦU TIÊN và playwright chạy workers:1, nên một file thứ hai sẽ chỉ
  // đăng nhập được nhờ user do file này tạo ra — một phụ thuộc ngầm chỉ đúng
  // nhờ thứ tự chữ cái.

  async function moNhatKy(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: "Nhật ký lệnh" }).click();
    await expect(page.getByRole("heading", { name: "Nhật ký lệnh" })).toBeVisible();
  }

  async function themLenh(
    page: import("@playwright/test").Page,
    v: { moc: string; ma: string; lai: string },
  ) {
    // Trạng thái rỗng có thêm một CTA ngay trong lời mời bắt đầu; nút ở header
    // là điểm vào ổn định cho hành trình này.
    await page.locator("header").getByRole("button", { name: "Thêm lệnh" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Thời điểm vào lệnh").fill(v.moc);
    await hop.getByLabel("Mã sản phẩm").fill(v.ma);
    await hop.getByLabel("Lãi/lỗ").fill(v.lai);
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();
  }

  test("10. đăng nhập lại rồi mở Nhật ký lệnh, chưa có lệnh nào", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);
    await expect(page.getByText(/chưa có lệnh nào trong nhật ký/i)).toBeVisible();
  });

  test("11. thêm lệnh đầu tiên thì lũy kế bằng chính nó", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await themLenh(page, { moc: "2026-06-09T09:00", ma: "XAUUSD", lai: "100" });

    const d = page.getByRole("row", { name: /XAUUSD/ });
    await expect(d).toContainText("+100");
    // Giờ hiện lại phải đúng giờ đã nhập: account ở Asia/Ho_Chi_Minh, lưu UTC.
    await expect(d).toContainText("09/06/2026 09:00");
  });

  test("12. thêm lệnh thứ hai thì lũy kế cộng dồn", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await themLenh(page, { moc: "2026-06-10T09:00", ma: "EURUSD", lai: "50" });

    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("150");
    await expect(page.getByRole("group", { name: "Số lệnh" })).toContainText("2");
  });

  // Bước quan trọng nhất của cả file. Sửa lệnh 1 làm lũy kế của lệnh 2 đổi
  // theo, và con số mới do BACKEND tính lại trên toàn dãy — không phải do FE
  // suy ra. Nếu FE vá một dòng vào cache thì dòng EURUSD sẽ đứng ở 150.
  test("13. sửa lệnh cũ thì lũy kế của lệnh sau nó tính lại", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByRole("button", { name: "Xem chi tiết lệnh 1" }).click();
    await page.getByRole("button", { name: "Sửa lệnh 1" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Lãi/lỗ").fill("200");
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();

    await expect(page.getByRole("row", { name: /XAUUSD/ })).toContainText("+200");
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });

  // Quy tắc 8 của CLAUDE.md nhìn bằng mắt: lọc chỉ lọc phần HIỂN THỊ, lũy kế
  // vẫn tính trên toàn bộ dãy. Lệnh EURUSD đứng một mình sau khi lọc nhưng
  // lũy kế của nó vẫn là 250, không tụt về 50.
  test("14. lọc không đụng vào lũy kế, và F5 giữ bộ lọc", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByLabel("Mã sản phẩm").fill("EURUSD");
    await expect(page.getByRole("row", { name: /XAUUSD/ })).toBeHidden();

    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");

    await expect(page).toHaveURL(/symbol=EURUSD/);
    await page.reload();
    await expect(page.getByLabel("Mã sản phẩm")).toHaveValue("EURUSD");
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });

  test("15. xoá lệnh thì nó vào thùng rác", async ({ page }) => {
    await dangNhap(page);
    await moNhatKy(page);

    await page.getByRole("button", { name: "Xem chi tiết lệnh 2" }).click();
    await page.getByRole("button", { name: "Xoá lệnh 2" }).click();
    // alertdialog chứ không phải dialog: hộp xác nhận cho thao tác phá huỷ
    // dùng AlertDialog để focus mặc định rơi vào Huỷ.
    await page.getByRole("alertdialog").getByRole("button", { name: "Xoá" }).click();

    await expect(page.getByRole("row", { name: /EURUSD/ })).toBeHidden();

    await page.getByRole("link", { name: "Thùng rác" }).click();
    await expect(page.getByRole("row", { name: /EURUSD/ })).toBeVisible();
  });

  test("16. khôi phục thì lệnh về đúng chỗ cũ", async ({ page }) => {
    await dangNhap(page);
    await page.goto("/trades/trash");

    await page.getByRole("button", { name: "Khôi phục lệnh 2" }).click();
    await expect(page.getByText(/thùng rác trống/i)).toBeVisible();

    await page.goto("/trades");
    // Về đúng stt 2 và đúng lũy kế cũ: khôi phục không cấp stt mới.
    await expect(page.getByRole("row", { name: /EURUSD/ })).toContainText("250");
  });

  // ---- Bảng điều khiển (bước 17-20) --------------------------------------
  //
  // PHẦN MSW KHÔNG THAY THẾ ĐƯỢC là bước 19: cùng một tập lệnh, hai màn hình,
  // và con số phải khớp. MSW trả cái ta bảo nó trả, nên nó không thể chứng
  // minh /stats và /charts đang nói về cùng một tập dữ liệu.

  async function moBangDieuKhien(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: "Bảng điều khiển" }).click();
    await expect(page.getByRole("heading", { name: "Bảng điều khiển" })).toBeVisible();
  }

  test("17. bảng điều khiển là trang mặc định sau khi đăng nhập", async ({ page }) => {
    await dangNhap(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Bảng điều khiển" })).toBeVisible();
  });

  test("18. bày đủ sáu mục và 23 chỉ số", async ({ page }) => {
    await dangNhap(page);
    await moBangDieuKhien(page);

    await expect(page.getByRole("heading", { level: 2, name: "Tổng quan" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Đường tăng trưởng" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Theo nhóm" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Theo thời gian" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Chất lượng lệnh" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Phân phối R" })).toBeVisible();

    // Trên trình duyệt thật thì ResizeObserver có sẵn, nên biểu đồ VẼ RA —
    // đây là điều jsdom không làm được, và là lý do bước này đáng chạy.
    await expect(page.locator("figure svg").first()).toBeVisible();
  });

  test("19. lãi ròng trên bảng điều khiển khớp với dải KPI ở nhật ký", async ({ page }) => {
    await dangNhap(page);

    await page.getByRole("link", { name: "Nhật ký lệnh" }).click();
    const oNhatKy = page.getByRole("group", { name: "Net" });
    const soNhatKy = (await oNhatKy.innerText()).trim();

    await moBangDieuKhien(page);
    const oBang = page.getByRole("group", { name: "Lãi ròng" });
    await expect(oBang).toContainText(soNhatKy.replace(/^\+/, "").trim().split(" ")[0]);
  });

  test("20. sửa một lệnh thì bảng điều khiển đổi số theo", async ({ page }) => {
    await dangNhap(page);

    await moBangDieuKhien(page);
    const truoc = (await page.getByRole("group", { name: "Lãi ròng" }).innerText()).trim();

    // Sửa lệnh 1 — cùng lối vào mà bước 13 đã dùng: bung dòng chi tiết rồi bấm
    // nút sửa của đúng lệnh đó. Ô nhập tên là "Lãi/lỗ", không phải "Lợi nhuận".
    await moNhatKy(page);
    await page.getByRole("button", { name: "Xem chi tiết lệnh 1" }).click();
    await page.getByRole("button", { name: "Sửa lệnh 1" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Lãi/lỗ").fill("777");
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();

    // Đây là bất biến số 1 chạy trên stack thật: nếu useLamMoi thiếu nhánh
    // chartsAll thì con số dưới đây vẫn là con số cũ.
    await moBangDieuKhien(page);
    await expect(page.getByRole("group", { name: "Lãi ròng" })).not.toHaveText(truoc);
  });

  test("21. lịch nhiệt vẽ ra ô thật trên trình duyệt thật", async ({ page }) => {
    await dangNhap(page);
    await moBangDieuKhien(page);

    // HeatmapChart không dùng Recharts/ResizeObserver — nó là biểu đồ DUY
    // NHẤT của trang render được cả trong jsdom LẪN trình duyệt thật theo
    // đúng một cách. Bước này xác nhận build thật không có gì chặn nó (ví dụ
    // CSS grid bị Tailwind purge nhầm).
    const oLich = page.locator('[data-trangthai="coLenh"], [data-trangthai="hoa"]').first();
    await expect(oLich).toBeVisible();
  });

  test("22. điểm trung bình và radar vẽ ra trên trình duyệt thật", async ({ page }) => {
    await dangNhap(page);

    // Không lệnh nào trong hành trình này từng được chấm điểm (bước 11-16 chỉ
    // điền moc/ma/lai) — avg_score_total vẫn null, và ScoreRadarBlock ĐÚNG
    // là rơi vào nhánh rỗng lúc đó (spec 4b §6). Phải tự chấm một lệnh trước
    // thì mới có gì để radar vẽ; dùng lại lối vào sửa lệnh của bước 20.
    //
    // Không dùng chonSelect() cho "Vào lệnh": nhãn đó là SUBSTRING của "Thời
    // điểm vào lệnh" (ô datetime), nên getByLabel mập mờ hai phần tử. Nhắm
    // thẳng role=combobox với exact match cho cả bốn trường, tránh sửa
    // helper dùng chung mà các bước khác đang dựa vào.
    async function chonSelectChinhXac(nhan: string, hienThi: string) {
      await page.getByRole("combobox", { name: nhan, exact: true }).click();
      await page.getByRole("option", { name: hienThi, exact: true }).click();
    }

    await moNhatKy(page);
    await page.getByRole("button", { name: "Xem chi tiết lệnh 1" }).click();
    await page.getByRole("button", { name: "Sửa lệnh 1" }).click();
    const hop = page.getByRole("dialog");
    await chonSelectChinhXac("Vào lệnh", "Đúng kế hoạch");
    await chonSelectChinhXac("Trong lệnh", "Tuân thủ kế hoạch");
    await chonSelectChinhXac("Thoát lệnh", "Chạm Chốt lời");
    await chonSelectChinhXac("Tâm lý", "Không lỗi");
    await hop.getByRole("button", { name: "Lưu" }).click();
    await expect(hop).toBeHidden();

    await moBangDieuKhien(page);
    await expect(page.getByRole("group", { name: "Chất lượng lệnh" })).toBeVisible();
    // Radar dùng ResponsiveContainer — chỉ vẽ ra path/polygon trên trình
    // duyệt thật, đúng lý do 4a §2.5 tách phần dễ sai vào prepare.ts và chỉ
    // smoke-test phần vỏ trong jsdom.
    const svg = page.locator('figure[aria-label*="Radar"] svg');
    await expect(svg).toBeVisible();
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
  // Đích sau đăng nhập là /dashboard, không phải /accounts (spec 4a §9): đăng
  // nhập xong nên thấy KẾT QUẢ giao dịch. Test nào cần thao tác trên trang
  // Tài khoản thì tự page.goto("/accounts") sau khi gọi hàm này.
  //
  // Kiểm bằng URL chứ không bằng heading "Bảng điều khiển": hàm này chạy
  // xuyên suốt cả file, kể cả TRƯỚC khi có tài khoản nào (bước 4 tạo account
  // đầu tiên) — lúc đó /dashboard hiện lời mời tạo tài khoản, không phải
  // heading đó. URL là bất biến duy nhất đúng ở mọi trạng thái.
  await expect(page).toHaveURL(/\/dashboard$/);
}
