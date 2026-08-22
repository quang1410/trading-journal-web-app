import { render, screen } from "@testing-library/react";
import { StreakBlock } from "./StreakBlock";

test("bày hai con số chuỗi liên tiếp", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={false} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

// BẤT BIẾN SỐ 2.
//
// aggregate.All gọi Streaks(all) trong khi mười hai nhóm còn lại nhận filtered
// (charts.go:175) — quy tắc 8 của CLAUDE.md. Nên khi bộ lọc đang bật, hai con
// số này là thứ DUY NHẤT trên trang không đổi.
//
// Đặt chúng lẫn trong lưới KPI là nói dối bằng cách xếp cạnh nhau: người đọc
// suy ra rằng mọi con số trong cùng một khối đều nói về cùng một tập lệnh.
test("khi đang lọc thì nói rõ hai số này tính trên toàn bộ lịch sử", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={true} />);
  expect(screen.getByRole("note")).toBeInTheDocument();
});

test("không lọc thì không cần lời nhắc", () => {
  render(<StreakBlock win={5} loss={3} dangLoc={false} />);
  // Không lọc thì "toàn bộ lịch sử" chính là thứ đang xem, nên lời nhắc chỉ là
  // chữ thừa. Hiện nó mọi lúc sẽ dạy người dùng bỏ qua nó.
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});
