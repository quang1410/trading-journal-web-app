import { useI18n, LocaleProvider, LOCALE_KEY } from "./index";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { enumLabel } from "./enumLabels";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";

function NoiDung() {
  const { t, locale } = useI18n();
  return <p>{`${locale}: ${t("nav.accounts")}`}</p>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "vi";
});

afterEach(() => {
  localStorage.clear();
});

test("mặc định là tiếng Việt và lưu lựa chọn tiếng Anh", async () => {
  const u = userEvent.setup();
  render(
    <LocaleProvider>
      <LanguageSwitcher />
      <NoiDung />
    </LocaleProvider>,
  );

  expect(screen.getByText("vi: Tài khoản")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("vi");
  expect(document.title).toBe("Nhật ký giao dịch");

  await u.click(screen.getByRole("button", { name: "English" }));

  expect(screen.getByText("en: Accounts")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
  expect(document.title).toBe("Trading Journal");
  expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
});

test("đọc lại locale tiếng Anh từ localStorage", () => {
  localStorage.setItem(LOCALE_KEY, "en");

  render(
    <LocaleProvider>
      <NoiDung />
    </LocaleProvider>,
  );

  expect(screen.getByText("en: Accounts")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
});

test("locale lạ quay về tiếng Việt", () => {
  localStorage.setItem(LOCALE_KEY, "fr");

  render(
    <LocaleProvider>
      <NoiDung />
    </LocaleProvider>,
  );

  expect(screen.getByText("vi: Tài khoản")).toBeInTheDocument();
});

test("dịch enum theo thứ tự backend nhưng giữ nguyên raw value", () => {
  const rawValues = ["Đúng kế hoạch", "Quá sớm"];

  expect(enumLabel("entry_quality", rawValues[0], "en", rawValues)).toBe("Planned");
  expect(enumLabel("entry_quality", rawValues[1], "en", rawValues)).toBe("Too early");
  expect(enumLabel("entry_quality", rawValues[0], "vi", rawValues)).toBe("Đúng kế hoạch");
});
