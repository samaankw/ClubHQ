jest.mock("@/lib/AuthProvider", () => ({ useAuth: () => ({ orgType: null }) }));

import { getTabConfig } from "./tabConfig";

describe("getTabConfig", () => {
  test("staff (coach/director) see the real roster title", () => {
    expect(getTabConfig("director", "small_club").find((t) => t.name === "players")?.title).toBe("Players");
    expect(getTabConfig("coach", "academy").find((t) => t.name === "players")?.title).toBe("Athletes");
    expect(getTabConfig("director", "private_trainer").find((t) => t.name === "players")?.title).toBe("My Clients");
  });

  test("a parent sees the singular 'my own child' framing instead of a roster", () => {
    expect(getTabConfig("parent", "small_club").find((t) => t.name === "players")?.title).toBe("My Player");
    expect(getTabConfig("parent", "academy").find((t) => t.name === "players")?.title).toBe("My Athlete");
    expect(getTabConfig("parent", "private_trainer").find((t) => t.name === "players")?.title).toBe("My Client");
  });

  test("copilot stays hidden regardless of role or org_type", () => {
    for (const role of ["director", "coach", "parent", "player"] as const) {
      expect(getTabConfig(role, "small_club").find((t) => t.name === "copilot")?.hidden).toBe(true);
    }
  });

  test("every tab config has the same set of routes, in a stable order", () => {
    const names = getTabConfig("director", "small_club").map((t) => t.name);
    expect(names).toEqual(["dashboard", "schedule", "messages", "players", "copilot", "profile"]);
  });

  test("falls back to small_club wording for a missing role or org_type", () => {
    expect(getTabConfig(null, null).find((t) => t.name === "players")?.title).toBe("Players");
  });
});
