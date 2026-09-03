import { copilotIdentity, copilotRoleFor } from "../../lib/copilotScope";
import { computeCopilotInsight, CopilotSnapshot } from "../../lib/copilotInsight";

describe("copilotRoleFor", () => {
  it("admits directors and coaches", () => {
    expect(copilotRoleFor("director")).toBe("director");
    expect(copilotRoleFor("coach")).toBe("coach");
  });

  it("excludes families and unknown roles", () => {
    expect(copilotRoleFor("parent")).toBeNull();
    expect(copilotRoleFor("player")).toBeNull();
    expect(copilotRoleFor(null)).toBeNull();
    expect(copilotRoleFor(undefined)).toBeNull();
  });
});

describe("copilotIdentity", () => {
  it("names the tool for the role using it", () => {
    expect(copilotIdentity("director").title).toBe("Director Copilot");
    expect(copilotIdentity("coach").title).toBe("Coach Copilot");
  });

  it("only lets a director see staff by name", () => {
    expect(copilotIdentity("director").canSeeStaffByName).toBe(true);
    expect(copilotIdentity("coach").canSeeStaffByName).toBe(false);
  });

  it("never offers a coach a question about other staff", () => {
    // The coach prompts must stay inside "the players assigned to me" —
    // offering "which coaches are keeping up?" invites a peer leaderboard.
    for (const { text } of copilotIdentity("coach").suggestions) {
      expect(text.toLowerCase()).not.toContain("coach");
      expect(text.toLowerCase()).not.toContain("club");
    }
  });

  it("scopes every coach prompt to the coach's own players", () => {
    for (const { text } of copilotIdentity("coach").suggestions) {
      expect(text.toLowerCase()).toMatch(/\bmy\b/);
    }
  });

  it("states the data scope differently for each role", () => {
    expect(copilotIdentity("director").scopeLine).toContain("club");
    expect(copilotIdentity("coach").scopeLine).toContain("your teams");
  });
});

describe("insight questions and suggested prompts stay in the same voice", () => {
  // The dashboard card filters a suggestion out when it duplicates the
  // insight's own question, which only works while the two modules phrase
  // that question identically. These assertions fail if either side is
  // reworded on its own.
  const snapshot = (over: Partial<CopilotSnapshot>): CopilotSnapshot => ({
    role: "director",
    playerCount: 40,
    playersEvaluatedLast30Days: 40,
    coachCount: 8,
    inactiveCoachCount: 0,
    homeworkTotal: 100,
    homeworkCompleted: 80,
    ...over,
  });

  it("phrases a director's insight questions in club terms, never 'my'", () => {
    const cases = [{ inactiveCoachCount: 2 }, { playersEvaluatedLast30Days: 20 }, {}];
    for (const over of cases) {
      const question = computeCopilotInsight(snapshot(over))!.question;
      expect(question.toLowerCase()).not.toMatch(/\bmy\b/);
    }
  });

  it("phrases a coach's insight questions as their own players", () => {
    const cases = [{ playersEvaluatedLast30Days: 3 }, { homeworkTotal: 40, homeworkCompleted: 5 }, {}];
    for (const over of cases) {
      const question = computeCopilotInsight(snapshot({ role: "coach", ...over }))!.question;
      expect(question.toLowerCase()).toMatch(/\bmy\b/);
    }
  });

  it("keeps the shared questions spelled identically in both modules", () => {
    const director = copilotIdentity("director").suggestions.map((s) => s.text);
    expect(director).toContain(computeCopilotInsight(snapshot({ inactiveCoachCount: 2 }))!.question);
    expect(director).toContain(computeCopilotInsight(snapshot({}))!.question);

    const coach = copilotIdentity("coach").suggestions.map((s) => s.text);
    expect(coach).toContain(
      computeCopilotInsight(snapshot({ role: "coach", playersEvaluatedLast30Days: 3 }))!.question
    );
    expect(coach).toContain(computeCopilotInsight(snapshot({ role: "coach" }))!.question);
  });
});
