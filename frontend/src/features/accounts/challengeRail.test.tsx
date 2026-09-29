import { render, screen, within } from "@testing-library/react";
import { ChallengeRail } from "./ChallengeRail";
import { ProgressMeter } from "./ProgressMeter";
import type { ChallengePhase } from "./types";

const PHASES: ChallengePhase[] = ["phase_1", "phase_2", "funded"];

test("phase rail: state lives in data-state AND in screen-reader text", () => {
  render(<ChallengeRail phases={PHASES} phase="phase_2" status="failed" />);

  const rail = screen.getByRole("list", { name: "Tiến độ vòng thi" });
  const items = within(rail).getAllByRole("listitem");
  expect(items.map((li) => li.dataset.state)).toEqual(["done", "failed", "upcoming"]);
  expect(items[1]).toHaveAttribute("aria-current", "step");
  expect(items[1]).toHaveTextContent("Vòng 2: thất bại");
  expect(items[0]).toHaveTextContent("Vòng 1: đã qua");
});

test("renders nothing before the phase list (meta) arrives", () => {
  const { container } = render(<ChallengeRail phases={[]} phase="phase_1" status="in_progress" />);
  expect(container).toBeEmptyDOMElement();
});

test("meter clamps its width and keeps the number as text", () => {
  render(<ProgressMeter label="Lợi nhuận" value="12,00%" limit="10,00%" ratio="1.2" tone="profit" />);

  const meter = screen.getByRole("group", { name: "Lợi nhuận" });
  expect(meter).toHaveTextContent("12,00%");
  expect(meter).toHaveTextContent("10,00%");
  expect(meter.querySelector("[data-fill]")).toHaveStyle({ width: "100%" });
});
