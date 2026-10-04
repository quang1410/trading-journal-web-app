import { makeAccount } from "@/test/harness";
import {
  challengeActions,
  drawdownTone,
  fitsPercentScale,
  isOptionalPercent,
  isReached,
  meterWidth,
  nextPhase,
  percentOrNull,
  phaseSteps,
  readTypeFilter,
  splitByType,
  statusAfterPhaseChange,
  statusOptionsFor,
} from "./challenge";
import type { ChallengePhase, ChallengeStatus } from "./types";

const PHASES: ChallengePhase[] = ["phase_1", "phase_2", "funded"];
const STATUSES: ChallengeStatus[] = ["in_progress", "passed", "failed"];
const states = (phase: ChallengePhase | null, status: ChallengeStatus | null) =>
  phaseSteps(PHASES, phase, status).map((s) => s.state);

describe("phaseSteps", () => {
  test.each([
    ["phase_1", "in_progress", ["current", "upcoming", "upcoming"]],
    ["phase_1", "passed", ["done", "upcoming", "upcoming"]],
    ["phase_1", "failed", ["failed", "upcoming", "upcoming"]],
    ["phase_2", "in_progress", ["done", "current", "upcoming"]],
    ["phase_2", "failed", ["done", "failed", "upcoming"]],
    ["funded", "in_progress", ["done", "done", "current"]],
    ["funded", "failed", ["done", "done", "failed"]],
  ] as const)("%s + %s", (phase, status, want) => {
    expect(states(phase, status)).toEqual(want);
  });

  test("unknown or missing phase renders every step as upcoming, no guessing", () => {
    expect(states(null, null)).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(states("phase_9" as ChallengePhase, "in_progress")).toEqual(["upcoming", "upcoming", "upcoming"]);
  });
});

test("nextPhase", () => {
  expect(nextPhase(PHASES, "phase_1")).toBe("phase_2");
  expect(nextPhase(PHASES, "phase_2")).toBe("funded");
  expect(nextPhase(PHASES, "funded")).toBeNull();
  expect(nextPhase(PHASES, null)).toBeNull();
});

test("statusOptionsFor: funded has no 'passed'", () => {
  expect(statusOptionsFor(STATUSES, "phase_1")).toEqual(STATUSES);
  expect(statusOptionsFor(STATUSES, "funded")).toEqual(["in_progress", "failed"]);
});

describe("challengeActions", () => {
  const kinds = (phase: ChallengePhase, status: ChallengeStatus) =>
    challengeActions(PHASES, phase, status).map((a) => a.kind);

  test("in progress at phase 1: pass or fail", () => {
    expect(kinds("phase_1", "in_progress")).toEqual(["pass", "fail"]);
  });
  test("passed phase 1: advance to phase 2 with exactly one key", () => {
    expect(challengeActions(PHASES, "phase_1", "passed")).toEqual([
      { kind: "advance", patch: { challenge_phase: "phase_2" } },
    ]);
  });
  test("funded and trading: fail only", () => {
    expect(kinds("funded", "in_progress")).toEqual(["fail"]);
  });
  test("failed: no quick actions left", () => {
    expect(kinds("phase_2", "failed")).toEqual([]);
  });
});

test.each([
  [null, "0%"],
  ["0", "0%"],
  ["-0.2", "0%"],
  ["0.425", "42.5%"],
  ["0.33333", "33.3%"],
  ["1", "100%"],
  ["1.8", "100%"],
])("meterWidth(%s) = %s", (ratio, want) => {
  expect(meterWidth(ratio)).toBe(want);
});

test.each([
  [null, "calm"],
  ["0.2", "calm"],
  ["0.5", "warning"],
  ["0.79", "warning"],
  ["0.8", "danger"],
  ["1.2", "danger"],
])("drawdownTone(%s) = %s", (usage, want) => {
  expect(drawdownTone(usage)).toBe(want);
});

test("isReached", () => {
  expect(isReached(null)).toBe(false);
  expect(isReached("0.99")).toBe(false);
  expect(isReached("1")).toBe(true);
});

test("splitByType: prop sorted in progress → passed → failed, ties by id", () => {
  const acc = (id: number, status: ChallengeStatus | null, type: "personal" | "prop" = "prop") =>
    makeAccount({ id, account_type: type, challenge_phase: type === "prop" ? "phase_1" : null, challenge_status: status });
  const { prop, personal } = splitByType([
    acc(1, "failed"),
    acc(2, null, "personal"),
    acc(3, "passed"),
    acc(4, "in_progress"),
    acc(5, "in_progress"),
  ]);
  expect(prop.map((a) => a.id)).toEqual([4, 5, 3, 1]);
  expect(personal.map((a) => a.id)).toEqual([2]);
});

test("readTypeFilter: unknown value falls back to 'all'", () => {
  expect(readTypeFilter(new URLSearchParams("type=prop"))).toBe("prop");
  expect(readTypeFilter(new URLSearchParams("type=personal"))).toBe("personal");
  expect(readTypeFilter(new URLSearchParams("type=x"))).toBe("all");
  expect(readTypeFilter(new URLSearchParams())).toBe("all");
});

test("isOptionalPercent and percentOrNull", () => {
  expect(isOptionalPercent("")).toBe(true);
  expect(isOptionalPercent("  ")).toBe(true);
  expect(isOptionalPercent("8")).toBe(true);
  expect(isOptionalPercent("100")).toBe(true);
  expect(isOptionalPercent("0")).toBe(false);
  expect(isOptionalPercent("100.5")).toBe(false);
  expect(isOptionalPercent("abc")).toBe(false);
  expect(percentOrNull("")).toBeNull();
  expect(percentOrNull(" 8 ")).toBe("0.08");
});

test("fitsPercentScale allows at most 2 decimal places", () => {
  expect(fitsPercentScale("")).toBe(true);
  expect(fitsPercentScale("10")).toBe(true);
  expect(fitsPercentScale("10.5")).toBe(true);
  expect(fitsPercentScale(" 10.55 ")).toBe(true);
  expect(fitsPercentScale("10.555")).toBe(false);
  expect(fitsPercentScale("0.001")).toBe(false);
});

describe("statusAfterPhaseChange", () => {
  const saved = { phase: "phase_1", status: "failed" } as const;
  test("moving to another phase starts a new attempt", () => {
    expect(statusAfterPhaseChange("phase_2", saved)).toBe("in_progress");
    expect(statusAfterPhaseChange("funded", { phase: "phase_2", status: "passed" })).toBe("in_progress");
  });
  test("going back to the saved phase restores the saved status", () => {
    expect(statusAfterPhaseChange("phase_1", saved)).toBe("failed");
  });
});
