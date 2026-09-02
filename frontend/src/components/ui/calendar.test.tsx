import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar, toDateOnly } from "./calendar";
import { formatDateOnly } from "@/lib/format";

function homNay() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function oNgay(value: string): HTMLElement {
  return screen.getByRole("button", { name: `Chọn ngày ${formatDateOnly(value, "vi")}` });
}

// Chấm "hôm nay" là mốc neo: nó nói NGÀY THẬT là ngày nào, nên nó không được
// biến mất chỉ vì người dùng vừa chọn đúng ngày đó. Code cũ đánh dấu hôm nay
// bằng mỗi `font-semibold` và còn loại trừ trường hợp trùng ô đang chọn — ô
// đang chọn vốn đã in đậm sẵn, nên khi hôm nay cũng là ngày đang chọn thì
// không còn gì phân biệt, và người dùng mất luôn mốc neo.
test("hôm nay luôn có chấm đánh dấu, kể cả khi đang là ngày được chọn", () => {
  const value = toDateOnly(homNay());

  const { rerender } = render(<Calendar value="" onSelect={() => {}} />);
  expect(oNgay(value).querySelector("span[aria-hidden]")).not.toBeNull();

  rerender(<Calendar value={value} onSelect={() => {}} />);
  const cham = oNgay(value).querySelector("span[aria-hidden]");
  expect(cham).not.toBeNull();
  // Trên nền teal của ô đang chọn, chấm phải lật sang màu chữ trên nền teal,
  // nếu không nó chìm nghỉm vào chính cái nền đó.
  expect(cham).toHaveClass("bg-primary-foreground");
});

test("chỉ đúng một ô mang chấm hôm nay", () => {
  const { container } = render(<Calendar value="" onSelect={() => {}} />);
  expect(container.querySelectorAll("button span[aria-hidden]")).toHaveLength(1);
});

// Nền nghỉ + nền hover phải đi theo TỪNG trạng thái. Nếu mọi ô dùng chung
// `hover:bg-accent` (xám trung tính) thì rê chuột lên ô hôm nay hoặc ô đang
// chọn sẽ phủ xám lên nền teal của chúng: trạng thái đi LÙI đúng lúc người
// dùng trỏ vào, và ô hôm nay trông y hệt ô thường khi đang hover.
test("mỗi trạng thái có nền nghỉ và nền hover riêng, không dùng chung xám", () => {
  const value = toDateOnly(homNay());

  const { rerender } = render(<Calendar value="" onSelect={() => {}} />);

  // Hôm nay, chưa được chọn: nền teal nhạt, hover đậm thêm một bậc teal.
  const oHomNay = oNgay(value);
  expect(oHomNay).toHaveClass("bg-primary/10", "hover:bg-primary/20");
  expect(oHomNay.className).not.toContain("hover:bg-accent");

  // Ô thường vẫn giữ hover xám trung tính.
  const ngayKhac = value.endsWith("01") ? value.slice(0, -2) + "02" : value.slice(0, -2) + "01";
  expect(oNgay(ngayKhac)).toHaveClass("hover:bg-accent");
  expect(oNgay(ngayKhac).className).not.toContain("bg-primary/10");

  // Hôm nay VÀ đang được chọn: nền teal đặc, hover chỉ hạ nhẹ độ đục.
  rerender(<Calendar value={value} onSelect={() => {}} />);
  const oDangChon = oNgay(value);
  expect(oDangChon).toHaveClass("bg-primary", "hover:bg-primary/90");
  expect(oDangChon.className).not.toContain("hover:bg-accent");
});

// Nhãn thứ được làm đậm để nói "hôm nay nằm ở cột này". Câu ấy chỉ đúng khi
// lưới bên dưới CÓ ô hôm nay. Code cũ tính cột từ ngày thật rồi bôi đậm bất kể
// đang xem tháng nào, nên lật sang tháng khác là cái nhãn trỏ vào chỗ trống:
// không ô nào trong lưới là hôm nay, mà header vẫn khẳng định ngược lại.
test("nhãn thứ chỉ đậm khi đang xem đúng tháng chứa hôm nay", async () => {
  const u = userEvent.setup();
  const { container, getByRole } = render(<Calendar value="" onSelect={() => {}} />);
  const nhan = () => Array.from(container.querySelectorAll("span.font-medium"));
  const soNhanDam = () => nhan().filter((n) => n.className.includes("text-foreground")).length;
  const soChamHomNay = () => container.querySelectorAll("button span[aria-hidden]").length;

  expect(soChamHomNay()).toBe(1);
  expect(soNhanDam()).toBe(1);

  // Lật đi ba tháng: chắc chắn rời khỏi tháng chứa hôm nay.
  for (let i = 0; i < 3; i++) await u.click(getByRole("button", { name: "Tháng sau" }));

  expect(soChamHomNay()).toBe(0);
  expect(soNhanDam()).toBe(0);

  // Quay về thì mốc neo trở lại — tắt đi rồi phải bật lại được.
  for (let i = 0; i < 3; i++) await u.click(getByRole("button", { name: "Tháng trước" }));
  expect(soChamHomNay()).toBe(1);
  expect(soNhanDam()).toBe(1);
});
