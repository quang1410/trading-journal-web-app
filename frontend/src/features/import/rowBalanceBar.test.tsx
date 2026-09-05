import { renderApp } from "@/test/harness";
import { RowBalanceBar } from "./RowBalanceBar";

/**
 * Thanh này là HÌNH MINH HOẠ cho ba ô chỉ số bên dưới, nên nó `aria-hidden` và
 * không có text nào để tra. Thứ duy nhất nó hứa là TỶ LỆ, nên tỷ lệ chính là
 * thứ phải ghim: một lỗi chia sai (lấy mẫu số là `valid` thay vì tổng) sẽ vẽ ra
 * một thanh trông vẫn hợp lý mà nói sai chuyện.
 */
function widths(container: HTMLElement): string[] {
  return [...container.querySelectorAll("span")].map((s) => s.style.width);
}

test("chia dải theo đúng tỷ lệ ba nhóm", () => {
  const { container } = renderApp(<RowBalanceBar valid={50} errors={30} skipped={20} />);

  expect(widths(container)).toEqual(["50%", "30%", "20%"]);
});

// Nhóm rỗng KHÔNG vẽ đoạn 0% — một `<span>` rộng 0 vẫn ăn viền bo góc và để
// lại vệt màu một pixel, đọc ra thành "có vài dòng lỗi" khi thật ra không có.
test("nhóm rỗng thì không vẽ đoạn nào", () => {
  const { container } = renderApp(<RowBalanceBar valid={10} errors={0} skipped={0} />);

  expect(widths(container)).toEqual(["100%"]);
});

// Chưa có dòng nào thì không có gì để cân — vẽ một thanh xám trống chỉ làm
// người dùng tưởng đã đọc xong file mà không có dữ liệu.
test("không có dòng nào thì không vẽ gì", () => {
  const { container } = renderApp(<RowBalanceBar valid={0} errors={0} skipped={0} />);

  expect(container).toBeEmptyDOMElement();
});
