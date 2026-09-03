import { computeCopilotInsight, CopilotSnapshot } from "../../lib/copilotInsight";

const base: CopilotSnapshot = {
  role: "director",
  playerCount: 40,
  playersEvaluatedLast30Days: 40,
  coachCount: 8,
  inactiveCoachCount: 0,
  homeworkTotal: 100,
  homeworkCompleted: 80,
};

const snapshot = (over: Partial<CopilotSnapshot>): CopilotSnapshot => ({ ...base, ...over });

describe("computeCopilotInsight", () => {
  it("says nothing when there are no players in scope", () => {
    // The dashboard's SetupChecklist owns the empty-club state; a second
    // card telling a brand-new director about coverage would be noise.
    expect(computeCopilotInsight(snapshot({ playerCount: 0 }))).toBeNull();
  });

  it("puts inactive coaches ahead of roster coverage for a director", () => {
    const result = computeCopilotInsight(
      snapshot({ inactiveCoachCount: 3, playersEvaluatedLast30Days: 10 })
    );
    expect(result?.headline).toBe("3 coaches logged no evaluations in 30 days");
    expect(result?.detail).toContain("Out of 8 coaches");
    expect(result?.tone).toBe("warning");
  });

  it("singularizes a lone inactive coach", () => {
    const result = computeCopilotInsight(snapshot({ inactiveCoachCount: 1, coachCount: 1 }));
    expect(result?.headline).toBe("1 coach logged no evaluations in 30 days");
    expect(result?.detail).toContain("Out of 1 coach in the club");
  });

  it("never reports staff activity to a coach, even when coach counts are passed", () => {
    // A coach's remit is their own players. The same numbers that produce a
    // staff finding for a director must fall through to roster coverage here.
    const result = computeCopilotInsight(
      snapshot({ role: "coach", inactiveCoachCount: 3, playerCount: 14, playersEvaluatedLast30Days: 9 })
    );
    expect(result?.headline).toBe("5 players on your teams not evaluated in 30 days");
    expect(result?.question).toBe("Which of my players haven't been evaluated recently?");
  });

  it("warns when more than a quarter of the roster is uncovered", () => {
    const result = computeCopilotInsight(snapshot({ playersEvaluatedLast30Days: 29 }));
    expect(result?.headline).toBe("11 players not evaluated in 30 days");
    expect(result?.tone).toBe("warning");
  });

  it("stays neutral for a small coverage gap rather than crying wolf", () => {
    const result = computeCopilotInsight(snapshot({ playersEvaluatedLast30Days: 38 }));
    expect(result?.headline).toBe("2 players not evaluated in 30 days");
    expect(result?.tone).toBe("neutral");
  });

  it("treats an over-count as full coverage instead of a negative gap", () => {
    const result = computeCopilotInsight(snapshot({ playersEvaluatedLast30Days: 55 }));
    expect(result?.tone).toBe("success");
  });

  it("flags low homework completion once coverage is clean", () => {
    const result = computeCopilotInsight(snapshot({ homeworkTotal: 40, homeworkCompleted: 12 }));
    expect(result?.headline).toBe("Homework completion is at 30%");
    expect(result?.tone).toBe("warning");
  });

  it("ignores a low percentage drawn from too few homework items", () => {
    // 1 of 4 is 25%, but four rows is not a trend worth a warning card.
    const result = computeCopilotInsight(snapshot({ homeworkTotal: 4, homeworkCompleted: 1 }));
    expect(result?.tone).toBe("success");
  });

  it("acknowledges a healthy club rather than inventing a problem", () => {
    const result = computeCopilotInsight(snapshot({}));
    expect(result?.headline).toBe("All 40 players evaluated in the last 30 days");
    expect(result?.tone).toBe("success");
    expect(result?.question).toBe("Which players improved the most this season?");
  });

  it("always pairs a finding with a question the Copilot can answer", () => {
    const cases: Partial<CopilotSnapshot>[] = [
      { inactiveCoachCount: 2 },
      { playersEvaluatedLast30Days: 20 },
      { homeworkTotal: 40, homeworkCompleted: 12 },
      {},
    ];
    for (const over of cases) {
      expect(computeCopilotInsight(snapshot(over))?.question).toBeTruthy();
    }
  });
});
