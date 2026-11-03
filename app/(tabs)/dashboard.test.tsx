import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import Dashboard, { ToolsCard } from "./dashboard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
import { router } from "expo-router";

const mockRefreshPulse = jest.fn();
const mockPulse = { evaluatedLast7Days: 5, totalPlayers: 12, loading: false, error: null, refresh: mockRefreshPulse };
jest.mock("@/lib/AuthProvider", () => ({ useAuth: () => ({ profile: null, orgType: null }) }));
jest.mock("@/components/ClubBioSection", () => () => null);
jest.mock("@/components/CoachesSection", () => () => null);

jest.mock("@/lib/hooks", () => ({
  useEvaluationPulse: () => mockPulse,
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
    await render(<ToolsCard role="director" pulse={mockPulse} />);
    expect(screen.getByText("Director Copilot")).toBeTruthy();
    expect(screen.getByText("📊 Pilot Metrics — 5 of 12 evaluated this week")).toBeTruthy();
  });

  test("a coach sees Copilot but not Pilot Metrics", async () => {
    await render(<ToolsCard role="coach" pulse={mockPulse} />);
    expect(screen.getByText("Director Copilot")).toBeTruthy();
    expect(screen.queryByText(/Pilot Metrics/)).toBeNull();
  });

  test("a parent sees no Tools card at all", async () => {
    const result = await render(<ToolsCard role="parent" pulse={mockPulse} />);
    expect(result.toJSON()).toBeNull();
  });

  // The real call site passes profile?.role, which is undefined for every
  // render before the profile finishes loading -- not just for a parent.
  test("an undefined role (profile not yet loaded) sees no Tools card", async () => {
    const result = await render(<ToolsCard role={undefined} pulse={mockPulse} />);
    expect(result.toJSON()).toBeNull();
  });

  test("tapping Copilot navigates to the copilot tab", async () => {
    await render(<ToolsCard role="director" pulse={mockPulse} />);
    await fireEvent.press(screen.getByText("Director Copilot"));
    expect(router.push).toHaveBeenCalledWith("/(tabs)/copilot");
  });

  test("tapping the Pilot Metrics line navigates to pilot-metrics", async () => {
    await render(<ToolsCard role="director" pulse={mockPulse} />);
    await fireEvent.press(screen.getByLabelText("Pilot Metrics — 5 of 12 evaluated this week"));
    expect(router.push).toHaveBeenCalledWith("/pilot-metrics");
  });

  // A static label would silently strip the evaluated-count text from what a
  // screen reader announces, even though it's the entire point of the row.
  test("the Pilot Metrics row's accessibility label carries the live count, not just its name", async () => {
    await render(<ToolsCard role="director" pulse={mockPulse} />);
    expect(screen.getByLabelText("Pilot Metrics — 5 of 12 evaluated this week")).toBeTruthy();
  });
});

test("metrics loading hides counts", async () => {
  await render(<ToolsCard role="director" pulse={{ ...mockPulse, loading: true }} />);
  expect(screen.getByLabelText("Loading Pilot Metrics…")).toBeTruthy();
  expect(screen.queryByText(/evaluated this week/)).toBeNull();
});

test("metrics errors hide counts and allow retry", async () => {
  await render(<ToolsCard role="director" pulse={{ ...mockPulse, error: { message: "Request failed" } }} />);
  expect(screen.getByText("Could not load Pilot Metrics.")).toBeTruthy();
  expect(screen.queryByText(/evaluated this week/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Retry loading"));
  expect(mockRefreshPulse).toHaveBeenCalled();
});

test("dashboard pull-to-refresh refreshes metrics and waits for completion", async () => {
  let finish!: () => void;
  mockRefreshPulse.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const result = await render(<Dashboard />);
  const refreshControl = () => result.getByTestId("dashboard-scroll").props.refreshControl;
  let refresh!: Promise<void>;
  await act(async () => {
    refresh = refreshControl().props.onRefresh();
  });
  expect(mockRefreshPulse).toHaveBeenCalled();
  expect(refreshControl().props.refreshing).toBe(true);
  await act(async () => {
    finish();
    await refresh;
  });
  expect(refreshControl().props.refreshing).toBe(false);
});
