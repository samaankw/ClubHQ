import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ToolsCard } from "./dashboard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
import { router } from "expo-router";

// dashboard.tsx's default export (unused here) pulls in useAuth/useVocab/the
// rest of lib/hooks -- ToolsCard itself only needs useEvaluationPulse, but
// importing the module at all still loads everything else it imports.
jest.mock("@/lib/AuthProvider", () => ({ useAuth: () => ({ profile: null, orgType: null }) }));
jest.mock("@/components/ClubBioSection", () => () => null);
jest.mock("@/components/CoachesSection", () => () => null);

jest.mock("@/lib/hooks", () => ({
  useEvaluationPulse: () => ({ evaluatedLast7Days: 5, totalPlayers: 12, loading: false, error: null, refresh: jest.fn() }),
  useNextEvent: () => ({ event: null, loading: false, error: null, refresh: jest.fn() }),
  useWeekCounts: () => ({
    counts: { games: 0, practices: 0, tournaments: 0, clubEvents: 0 },
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
  useRecentAnnouncements: () => ({ announcements: [], loading: false, error: null, refresh: jest.fn() }),
  useMyPlayers: () => ({ players: [], loading: false, error: null, refresh: jest.fn() }),
  useLatestDevelopmentPlan: () => ({ plan: null }),
  useSetupProgress: () => ({
    steps: [],
    completed: 0,
    total: 0,
    allDone: true,
    loading: false,
    teamCount: 0,
    playerCount: 0,
    refresh: jest.fn(),
  }),
}));

describe("ToolsCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("a director sees both Copilot and the Pilot Metrics pulse", async () => {
    await render(<ToolsCard role="director" />);
    expect(screen.getByText("Director Copilot")).toBeTruthy();
    expect(screen.getByText("📊 Pilot Metrics — 5 of 12 evaluated this week")).toBeTruthy();
  });

  test("a coach sees Copilot but not Pilot Metrics", async () => {
    await render(<ToolsCard role="coach" />);
    expect(screen.getByText("Director Copilot")).toBeTruthy();
    expect(screen.queryByText(/Pilot Metrics/)).toBeNull();
  });

  test("a parent sees no Tools card at all", async () => {
    const result = await render(<ToolsCard role="parent" />);
    expect(result.toJSON()).toBeNull();
  });

  // The real call site passes profile?.role, which is undefined for every
  // render before the profile finishes loading -- not just for a parent.
  test("an undefined role (profile not yet loaded) sees no Tools card", async () => {
    const result = await render(<ToolsCard role={undefined} />);
    expect(result.toJSON()).toBeNull();
  });

  test("tapping Copilot navigates to the copilot tab", async () => {
    await render(<ToolsCard role="director" />);
    await fireEvent.press(screen.getByText("Director Copilot"));
    expect(router.push).toHaveBeenCalledWith("/(tabs)/copilot");
  });

  test("tapping the Pilot Metrics line navigates to pilot-metrics", async () => {
    await render(<ToolsCard role="director" />);
    await fireEvent.press(screen.getByLabelText("Pilot Metrics — 5 of 12 evaluated this week"));
    expect(router.push).toHaveBeenCalledWith("/pilot-metrics");
  });

  // A static label would silently strip the evaluated-count text from what a
  // screen reader announces, even though it's the entire point of the row.
  test("the Pilot Metrics row's accessibility label carries the live count, not just its name", async () => {
    await render(<ToolsCard role="director" />);
    expect(screen.getByLabelText("Pilot Metrics — 5 of 12 evaluated this week")).toBeTruthy();
  });
});
