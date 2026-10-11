import { fireEvent, screen } from "@testing-library/react";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { GapChart } from "./GapChart";

beforeEach(() => resetAll({ loggedIn: false }));

test("shows the three totals", () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);
  expect(screen.getByTestId("gap-theory")).toHaveTextContent("+1.330");
  expect(screen.getByTestId("gap-actual")).toHaveTextContent("+190");
  expect(screen.getByTestId("gap-diff")).toHaveTextContent("−1.140");
});

test("the note starts on the worst trade and follows the focused dot", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);

  const note = screen.getByTestId("gap-note");
  expect(note).toHaveTextContent("Lệnh #5");
  expect(await screen.findByText("Thoát lệnh cảm tính, sợ hãi")).toBeInTheDocument();
  expect(note).toHaveTextContent("Kế hoạch +300, thực tế +90, mất 210 USD.");

  fireEvent.focus(screen.getByRole("button", { name: "Lệnh 9" }));
  expect(note).toHaveTextContent("Lệnh #9");
  expect(note).toHaveTextContent("GIAO DỊCH TRẢ THÙ");
  expect(note).toHaveTextContent("Kế hoạch −100, thực tế −250, mất 150 USD.");
});

test("still shows amounts when meta fails", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<GapChart />);
  const note = screen.getByTestId("gap-note");
  expect(note).toHaveTextContent("Kế hoạch +300, thực tế +90, mất 210 USD.");
  expect(note).not.toHaveTextContent("Thoát lệnh cảm tính");
});

test("the note uses English labels in the en locale", async () => {
  localStorage.setItem("journal.locale", "en");
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<GapChart />);
  expect(await screen.findByText("Emotional exit, fear")).toBeInTheDocument();
});
