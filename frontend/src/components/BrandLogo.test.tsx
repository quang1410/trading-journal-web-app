import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n";
import { BrandLogo } from "./BrandLogo";

function renderLogo(compact = false) {
  return render(
    <LocaleProvider>
      <BrandLogo compact={compact} />
    </LocaleProvider>,
  );
}

test("expanded logo shows the localized wordmark", () => {
  renderLogo();

  expect(screen.getByText("Nhật ký")).toBeInTheDocument();
  expect(screen.getByText("giao dịch")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("compact logo exposes the product name without rendering the wordmark", () => {
  renderLogo(true);

  expect(screen.getByRole("img", { name: "Nhật ký giao dịch" })).toBeInTheDocument();
  expect(screen.queryByText("Nhật ký")).not.toBeInTheDocument();
  expect(screen.queryByText("giao dịch")).not.toBeInTheDocument();
});
