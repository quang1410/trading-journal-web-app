import { render, screen } from "@testing-library/react";
import App from "./App";

test("App vẽ được và hiện tên sản phẩm", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Nhật ký giao dịch" })).toBeInTheDocument();
});
