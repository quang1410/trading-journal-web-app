import { render, screen } from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Dựng trên <details>/<summary> chứ không phải nút + useState, và ba ca dưới
 * đây ghim đúng ba thứ mà bản tự dựng sẽ đánh mất trong im lặng.
 */
test("mục đóng vẫn có heading THẬT trong cây heading của trang", () => {
  render(
    <CollapsibleSection title="Theo nhóm">
      <p>nội dung</p>
    </CollapsibleSection>,
  );
  // Trình đọc màn hình duyệt trang theo heading. Nhét <h2> vào phần thân bị
  // gập lại là xoá mục đó khỏi mục lục của người dùng dùng trình đọc.
  expect(screen.getByRole("heading", { level: 2, name: "Theo nhóm" })).toBeInTheDocument();
});

test("nội dung mục đóng vẫn nằm trong DOM cho Ctrl+F", () => {
  render(
    <CollapsibleSection title="Theo nhóm">
      <p>một câu rất riêng</p>
    </CollapsibleSection>,
  );
  // <details> gập bằng trình duyệt nên chữ vẫn ở đó: Ctrl+F tìm ra rồi tự mở
  // mục ra. Gỡ khỏi DOM bằng `{open && ...}` sẽ mất hẳn hành vi này.
  expect(screen.getByText("một câu rất riêng")).toBeInTheDocument();
});

// MỞ sẵn, không phải đóng sẵn: thứ tự trên trang đã nói cái gì quan trọng hơn
// cái gì, nên đóng thêm lần nữa là bắt người muốn xem phải bấm bốn lần mới
// thấy thứ vốn đã ở đúng chỗ. Gập lại là để dành cho người ĐÃ BIẾT mình không
// cần mục đó.
test("mặc định MỞ, và `open={false}` gập sẵn được", () => {
  const { rerender } = render(<CollapsibleSection title="A">x</CollapsibleSection>);
  expect(document.querySelector("details")).toHaveAttribute("open");

  rerender(
    <CollapsibleSection title="A" open={false}>
      x
    </CollapsibleSection>,
  );
  expect(document.querySelector("details")).not.toHaveAttribute("open");
});
