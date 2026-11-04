import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { LandingPage } from "./LandingPage";

beforeEach(() => {
  resetAll({ loggedIn: false });
  // Trang có phiếu chấm điểm, phiếu gọi /meta/enums.
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
});

function joinHandler(onBody?: (b: unknown) => void) {
  return http.post(`${BASE}/waitlist`, async ({ request }) => {
    onBody?.(await request.json());
    return envelope({ joined: true });
  });
}

test("shows an inline error for a malformed email and sends nothing", async () => {
  let called = false;
  server.use(joinHandler(() => (called = true)));
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@localhost");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(within(hero).getByRole("alert")).toHaveTextContent("Email chưa đúng dạng. Ví dụ: ten@gmail.com");
  expect(called).toBe(false);
});

test("joining reveals the questions with the email interpolated, in both forms", async () => {
  let sent: unknown;
  server.use(joinHandler((b) => (sent = b)));
  renderApp(<LandingPage />, { path: "/?ref=fb-group" });

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), " toi@gmail.com ");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  const confirmations = await screen.findAllByText("Thư mời sẽ gửi tới toi@gmail.com.");
  expect(confirmations).toHaveLength(2);
  expect(sent).toEqual({ email: "toi@gmail.com", locale: "vi", source: "fb-group", website: "" });
  expect(screen.getAllByRole("group", { name: /Bạn đang ghi nhật ký bằng gì\?/ })).toHaveLength(2);
});

test("sends the answers once and thanks the user", async () => {
  let answers: unknown;
  server.use(
    joinHandler(),
    http.put(`${BASE}/waitlist/answers`, async ({ request }) => {
      answers = await request.json();
      return envelope({ saved: true });
    }),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));
  await within(hero).findByText("Thư mời sẽ gửi tới toi@gmail.com.");

  await userEvent.click(within(hero).getByRole("radio", { name: "Excel / Google Sheets" }));
  await userEvent.click(within(hero).getByRole("checkbox", { name: "Crypto" }));
  await userEvent.click(within(hero).getByRole("checkbox", { name: "Chứng khoán VN" }));
  await userEvent.click(within(hero).getByRole("radio", { name: "Đã từng" }));
  await userEvent.click(within(hero).getByRole("button", { name: "Gửi câu trả lời" }));

  expect(await screen.findAllByText("Đã lưu câu trả lời.")).toHaveLength(2);
  expect(answers).toEqual({
    email: "toi@gmail.com",
    journal_tool: "spreadsheet",
    markets: ["crypto", "vn_stocks"],
    prop_status: "past",
  });
});

test("shows the server message on 429", async () => {
  server.use(
    http.post(`${BASE}/waitlist`, () =>
      errorEnvelope(1429, "gửi quá nhiều lần, thử lại sau một phút", 429),
    ),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(await within(hero).findByRole("alert")).toHaveTextContent("gửi quá nhiều lần, thử lại sau một phút");
});

test("shows the generic message on a server error", async () => {
  server.use(http.post(`${BASE}/waitlist`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  await userEvent.click(within(hero).getByRole("button", { name: "Vào danh sách chờ" }));

  expect(await within(hero).findByRole("alert")).toHaveTextContent("Chưa gửi được. Kiểm tra kết nối rồi thử lại.");
});

test("disables the submit button while sending", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  server.use(
    http.post(`${BASE}/waitlist`, async () => {
      await gate;
      return envelope({ joined: true });
    }),
  );
  renderApp(<LandingPage />);

  const hero = screen.getByTestId("hero-signup");
  await userEvent.type(within(hero).getByLabelText("Email"), "toi@gmail.com");
  const button = within(hero).getByRole("button", { name: "Vào danh sách chờ" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  release();
  await within(hero).findByText("Thư mời sẽ gửi tới toi@gmail.com.");
});
