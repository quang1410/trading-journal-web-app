import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { ScoringSection } from "./ScoringSection";

beforeEach(() => resetAll({ loggedIn: false }));

const enumsOk = http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums()));

test("starts at 35 points, impulsive", async () => {
  server.use(enumsOk);
  renderApp(<ScoringSection />);

  const ticket = await screen.findByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });
  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("35/100");
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Bốc đồng / FOMO");
});

test("rescoring updates the total and the class", async () => {
  server.use(enumsOk);
  renderApp(<ScoringSection />);
  const ticket = await screen.findByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" });

  const entry = within(ticket).getByRole("group", { name: "Vào lệnh" });
  await userEvent.click(within(entry).getByRole("radio", { name: "Đúng kế hoạch" }));
  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("50/100");

  const exit = within(ticket).getByRole("group", { name: "Thoát lệnh" });
  await userEvent.click(within(exit).getByRole("radio", { name: "Chạm Dừng lỗ" }));
  const psych = within(ticket).getByRole("group", { name: "Tâm lý" });
  await userEvent.click(within(psych).getByRole("radio", { name: "Không lỗi" }));

  expect(within(ticket).getByTestId("ticket-total")).toHaveTextContent("100/100");
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Đúng kế hoạch");
});

test("shows English labels in the en locale", async () => {
  localStorage.setItem("journal.locale", "en");
  server.use(enumsOk);
  renderApp(<ScoringSection />);

  const ticket = await screen.findByRole("form", { name: "Sample trade scorecard" });
  expect(within(ticket).getByRole("radio", { name: "Too early" })).toBeChecked();
  expect(within(ticket).getByTestId("ticket-class")).toHaveTextContent("Impulsive / FOMO");
});

test("hides the ticket when meta fails but keeps the copy", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<ScoringSection />);

  expect(screen.getByRole("heading", { name: "Bốn câu hỏi sau mỗi lệnh" })).toBeInTheDocument();
  await screen.findByTestId("ticket-unavailable");
  expect(screen.queryByRole("form", { name: "Phiếu chấm điểm lệnh mẫu" })).not.toBeInTheDocument();
});
