import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TimeField } from "./time-field";

/** Bọc có state, vì ô này là component ĐƯỢC kiểm soát. */
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <TimeField value={v} onChange={setV} ariaLabel="Giờ vào lệnh" />
      <output data-testid="out">{v}</output>
    </>
  );
}

const box = () => screen.getByLabelText("Giờ vào lệnh");
const out = () => screen.getByTestId("out").textContent;

// Đây là ca đã làm hỏng bản đầu: nắn chuỗi ngay trong lúc gõ thì phím đầu "0"
// thành "00:00", phím sau nối vào đuôi rồi bị cắt — gõ 08:00 ra 00:00.
test("gõ đủ HH:MM cho ra đúng giờ đã gõ", async () => {
  const u = userEvent.setup();
  render(<Harness />);

  await u.type(box(), "08:00");
  expect(out()).toBe("08:00");
});

test("gõ tắt không dấu hai chấm vẫn ra đúng giờ", async () => {
  const u = userEvent.setup();
  render(<Harness />);

  await u.type(box(), "0930");
  expect(out()).toBe("09:30");
});

// Người gõ nhanh trên bàn phím số hay bỏ số 0 đứng đầu.
test("ba chữ số hiểu là một chữ số giờ", async () => {
  const u = userEvent.setup();
  render(<Harness />);

  await u.type(box(), "930");
  expect(out()).toBe("09:30");
});

test("rời ô thì chuẩn hoá lại thành HH:MM", async () => {
  const u = userEvent.setup();
  render(<Harness />);

  await u.type(box(), "930");
  await u.tab();
  expect(box()).toHaveValue("09:30");
});

test("giờ quá 23 hoặc phút quá 59 thì không nhận", async () => {
  const u = userEvent.setup();
  render(<Harness />);

  await u.type(box(), "2570");
  expect(out()).toBe("");
});

// Bàn phím là đường đi chính: người nhập nhật ký gõ số, không rê chuột.
test("mũi tên lên xuống chỉnh phút, kèm Shift chỉnh giờ", async () => {
  const u = userEvent.setup();
  render(<Harness initial="09:30" />);

  box().focus();
  await u.keyboard("{ArrowUp}");
  expect(out()).toBe("09:31");

  await u.keyboard("{ArrowDown}{ArrowDown}");
  expect(out()).toBe("09:29");

  await u.keyboard("{Shift>}{ArrowUp}{/Shift}");
  expect(out()).toBe("10:29");
});

// Cộng riêng từng phần thì 09:59 +1 ra "09:60".
test("phút tràn thì sang giờ, nửa đêm thì quay vòng", async () => {
  const u = userEvent.setup();
  const { unmount } = render(<Harness initial="09:59" />);
  box().focus();
  await u.keyboard("{ArrowUp}");
  expect(out()).toBe("10:00");
  unmount();

  render(<Harness initial="23:59" />);
  box().focus();
  await u.keyboard("{ArrowUp}");
  expect(out()).toBe("00:00");
});

// Chọn "Hôm nay" ở lịch đổi giá trị từ NGOÀI vào; ô phải theo.
test("giá trị đổi từ ngoài thì ô hiện theo", async () => {
  function Outer() {
    const [v, setV] = useState("09:30");
    return (
      <>
        <TimeField value={v} onChange={setV} ariaLabel="Giờ vào lệnh" />
        <button type="button" onClick={() => setV("14:05")}>
          đặt
        </button>
      </>
    );
  }
  const u = userEvent.setup();
  render(<Outer />);

  await u.click(screen.getByRole("button", { name: "đặt" }));
  expect(box()).toHaveValue("14:05");
});

// Lý do component này tồn tại: <input type="time"> kéo theo dropdown và icon
// của trình duyệt, vẽ bằng màu hệ thống và đè lên lịch nằm ngay dưới.
test("là ô text, không phải input type=time của trình duyệt", () => {
  render(<Harness initial="09:30" />);
  expect(box()).toHaveAttribute("type", "text");
  expect(box()).toHaveAttribute("inputmode", "numeric");
});
