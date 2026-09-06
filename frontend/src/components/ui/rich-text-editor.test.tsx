import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { imageUrlProblem, RichTextEditor } from "./rich-text-editor";

const labels = {
  bold: "Chữ đậm",
  italic: "Chữ nghiêng",
  underline: "Gạch chân",
  strike: "Gạch ngang",
  bullet: "Danh sách gạch đầu dòng",
  ordered: "Danh sách đánh số",
  check: "Danh sách việc cần làm",
  link: "Chèn liên kết",
  image: "Chèn ảnh từ link",
  clean: "Xoá định dạng",
};

function setup(onChange = () => {}) {
  return (
    <RichTextEditor
      id="notes"
      defaultValue=""
      onChange={onChange}
      ariaLabel="Ghi chú"
      labels={labels}
    />
  );
}

test("thanh công cụ có đủ nút, mỗi nút một tên đọc được", () => {
  render(setup());
  for (const name of Object.values(labels)) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
});

/**
 * Đây là bug đã đo được trên trình duyệt thật: ô hỏi link ảnh mở ra HAI lần
 * cho một cú bấm.
 *
 * Nguyên nhân: thanh công cụ là div của React nằm NGOÀI vùng Quill chèn vào,
 * nên phần dọn dẹp xoá vùng soạn thảo không đụng tới nó — mà Quill đã gắn
 * trình nghe click lên từng nút và không có API nào gỡ ra. Effect chạy hai
 * lần (StrictMode, hoặc bất kỳ lần dựng lại nào) là nút mang hai trình nghe.
 *
 * StrictMode ở đây KHÔNG phải trang trí: nó chính là thứ tái hiện lỗi.
 */
test("bấm nút ảnh chỉ mở ô hỏi link một lần, kể cả khi effect chạy hai lượt", async () => {
  const u = userEvent.setup();
  const { container } = render(<StrictMode>{setup()}</StrictMode>);

  await u.click(screen.getByRole("button", { name: labels.image }));

  expect(container.querySelectorAll(".ql-tooltip.ql-editing")).toHaveLength(1);
});

// Không được rơi ngược về hộp thoại của trình duyệt: nó vẽ bằng màu hệ điều
// hành, không biết gì về [data-theme], và CSS của app không với tới.
test("không dùng hộp thoại của trình duyệt", async () => {
  const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
  const u = userEvent.setup();
  render(setup());

  await u.click(screen.getByRole("button", { name: labels.image }));

  expect(prompt).not.toHaveBeenCalled();
  prompt.mockRestore();
});

/**
 * Esc dùng để bỏ ô nhập link, KHÔNG phải để vứt cả lệnh đang gõ dở.
 *
 * Không có bước chặn này thì Dialog của Radix nghe được phím Esc và đóng
 * theo — người dùng mất toàn bộ những gì đã điền. Đã đo trên trình duyệt
 * thật: `ESC_KHONG_DONG_DIALOG: false` khi gỡ bước chặn ra.
 *
 * Ở đây chỉ khẳng định phần kiểm được trong jsdom: tooltip tự đóng lại. Phần
 * "dialog còn sống" đo bằng Playwright, vì nó cần một Dialog thật của Radix
 * bọc bên ngoài.
 */
test("Esc lúc ô hỏi link đang mở thì đóng ô đó lại", async () => {
  const u = userEvent.setup();
  const { container } = render(setup());

  await u.click(screen.getByRole("button", { name: labels.image }));
  // Tooltip trong jsdom luôn mang ql-hidden (không tính được vị trí), mà bước
  // chặn chỉ chạy khi nó đang mở — gỡ lớp đó ra để mô phỏng trạng thái thật.
  container.querySelector(".ql-tooltip")?.classList.remove("ql-hidden");
  await u.keyboard("{Escape}");

  expect(container.querySelector(".ql-tooltip")).toHaveClass("ql-hidden");
});

test("mở ô hỏi link ảnh thì ô nhập sẵn sàng nhận chữ", async () => {
  const u = userEvent.setup();
  const { container } = render(setup());

  await u.click(screen.getByRole("button", { name: labels.image }));

  const tip = container.querySelector(".ql-tooltip");
  expect(tip).toHaveAttribute("data-mode", "image");
  expect(tip?.querySelector("input")).toHaveAttribute("data-image", "https://…");
});

/**
 * Phần kiểm link test THẲNG, không qua tooltip.
 *
 * Tooltip của Quill tự ẩn khi không tính được vị trí, mà jsdom không dựng
 * layout nên nó luôn mang `ql-hidden` — userEvent từ chối gõ vào phần tử ẩn,
 * và mọi thao tác qua nó đều thành thao tác rỗng. Test đi qua đường đó sẽ
 * XANH mà không chứng minh được gì, thứ tệ hơn là không có test.
 *
 * Nên tách đôi: luật kiểm link nằm ở đây (thuần, chạy được), còn phần nối
 * dây với tooltip thì đã đo trên trình duyệt thật bằng Playwright.
 */
describe("imageUrlProblem", () => {
  test("link https bình thường thì không có vấn đề gì", () => {
    expect(imageUrlProblem("https://i.imgur.com/a.png")).toBeNull();
    expect(imageUrlProblem("https://www.tradingview.com/x/aBcD1234/")).toBeNull();
  });

  test("chưa gõ gì thì nói là chưa có link", () => {
    expect(imageUrlProblem("")).toMatch(/chưa có link/i);
  });

  // http trên trang https bị trình duyệt chặn, nên cho qua chỉ là hứa hẹn một
  // ô vuông vỡ. Câu báo phải nói ra ĐIỀU ĐÓ, không chỉ "sai định dạng".
  test("http nói rõ là sẽ bị chặn, không chỉ nói sai", () => {
    const msg = imageUrlProblem("http://x.com/a.png");
    expect(msg).toMatch(/https:\/\//);
    expect(msg).toMatch(/chặn/i);
  });

  test("giao thức khác cũng bị từ chối", () => {
    expect(imageUrlProblem("data:image/png;base64,AAAA")).toMatch(/https:\/\//);
    expect(imageUrlProblem("javascript:alert(1)")).toMatch(/https:\/\//);
    expect(imageUrlProblem("/uploads/a.png")).toMatch(/https:\/\//);
  });

  // Nhầm lẫn thường gặp nhất với TradingView: link TRANG chart và link ẢNH
  // chụp nhìn gần giống nhau, nên câu báo phải chỉ ra dạng ĐÚNG.
  test("link trang chart TradingView được chỉ sang dạng link ảnh", () => {
    const msg = imageUrlProblem("https://www.tradingview.com/chart/aBcD1234/");
    expect(msg).toMatch(/tradingview\.com\/x\//);
  });
});
