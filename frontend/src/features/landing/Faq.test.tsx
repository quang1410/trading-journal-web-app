import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeFullEnums, renderApp, resetAll } from "@/test/harness";
import { Faq } from "./Faq";

beforeEach(() => resetAll({ loggedIn: false }));

test("the scoring answer interpolates the backend thresholds", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(makeFullEnums())));
  renderApp(<Faq />);

  await userEvent.click(await screen.findByText("Chấm điểm dựa trên gì?"));
  expect(
    await screen.findByText(
      "Bốn tiêu chí, mỗi tiêu chí tối đa 25 điểm. Từ 80 điểm là đúng kế hoạch, 55 đến dưới 80 là cần cải thiện, 30 đến dưới 55 là bốc đồng / FOMO, dưới 30 là giao dịch trả thù.",
    ),
  ).toBeInTheDocument();
});

test("the scoring question is hidden when thresholds are unavailable", async () => {
  server.use(http.get(`${BASE}/meta/enums`, () => errorEnvelope(1500, "lỗi hệ thống", 500)));
  renderApp(<Faq />);
  expect(screen.getByText("Có mất phí không?")).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("Chấm điểm dựa trên gì?")).not.toBeInTheDocument();
});
