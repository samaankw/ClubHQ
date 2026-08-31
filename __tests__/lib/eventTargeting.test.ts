import { resolveTargeting } from "../../lib/eventTargeting";

describe("resolveTargeting", () => {
  it("club-wide: no team and no players", () => {
    const r = resolveTargeting({
      audienceMode: "club",
      teamId: "team-1",
      selectedPlayerIds: [],
      attendingIds: [],
      teamRoster: [],
    });
    expect(r).toEqual({ teamId: null, playerIds: null });
  });

  it("whole team: team id, no explicit player list", () => {
    const roster = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    const r = resolveTargeting({
      audienceMode: "team",
      teamId: "team-1",
      selectedPlayerIds: [],
      attendingIds: ["p1", "p2", "p3"],
      teamRoster: roster,
    });
    expect(r).toEqual({ teamId: "team-1", playerIds: null });
  });

  it("partial team: the attending subset, with the team id retained", () => {
    const roster = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    const r = resolveTargeting({
      audienceMode: "team",
      teamId: "team-1",
      selectedPlayerIds: [],
      attendingIds: ["p1", "p2"],
      teamRoster: roster,
    });
    expect(r).toEqual({ teamId: "team-1", playerIds: ["p1", "p2"] });
  });

  it("specific players: those players, no team, even if a team was selected earlier", () => {
    const r = resolveTargeting({
      audienceMode: "player",
      teamId: "team-1",
      selectedPlayerIds: ["p9", "p10"],
      attendingIds: [],
      teamRoster: [{ id: "p1" }],
    });
    expect(r).toEqual({ teamId: null, playerIds: ["p9", "p10"] });
  });

  it("an empty team roster is not treated as a partial team", () => {
    const r = resolveTargeting({
      audienceMode: "team",
      teamId: "team-1",
      selectedPlayerIds: [],
      attendingIds: [],
      teamRoster: [],
    });
    expect(r).toEqual({ teamId: "team-1", playerIds: null });
  });
});
