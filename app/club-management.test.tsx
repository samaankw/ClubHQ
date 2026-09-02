import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ClubManagement from "./club-management";

jest.mock("expo-router", () => ({
  router: { canGoBack: () => false, replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === "function" ? cleanup : undefined;
    }, [cb]);
  },
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({
    profile: { id: "director-1", club_id: "club-1", role: "director" },
    orgType: "small_club",
    refreshProfile: jest.fn(),
  }),
}));

jest.mock("@/lib/hooks", () => ({
  useClubBio: () => ({ crestUrl: null, bio: null, refresh: jest.fn() }),
}));

const mockConfirmAsync = jest.fn();
const mockNotify = jest.fn();
jest.mock("@/lib/alertCompat", () => ({
  confirmAsync: (...args: unknown[]) => mockConfirmAsync(...args),
  notify: (...args: unknown[]) => mockNotify(...args),
}));

function mockChain(result: { data: unknown; error: null }) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = self;
  c.eq = self;
  c.is = self;
  c.in = self;
  c.order = self;
  c.then = (resolve: (r: typeof result) => void) => resolve(result);
  return c;
}

const mockTeamUpdate = jest.fn().mockResolvedValue({ error: null });

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === "teams") {
        return {
          ...mockChain({ data: [{ id: "team-1", club_id: "club-1", name: "Test Team", age_group: null, season: null }], error: null }),
          update: () => ({ eq: (...args: unknown[]) => mockTeamUpdate(...args) }),
        };
      }
      if (table === "players") {
        return mockChain({ data: [{ id: "player-1", team_id: "team-1", full_name: "Existing Player", parent_id: null }], error: null });
      }
      if (table === "profiles") return mockChain({ data: [], error: null });
      if (table === "team_coaches") return mockChain({ data: [], error: null });
      if (table === "player_payments") return mockChain({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

describe("ClubManagement: archive-team hard-block", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("archiving a team with active players is blocked before any confirmation", async () => {
    await render(<ClubManagement />);
    await waitFor(() => expect(screen.getByText("Test Team")).toBeTruthy());

    await fireEvent.press(screen.getByText("Archive team"));

    expect(mockNotify).toHaveBeenCalledWith(
      "Can't archive Test Team yet",
      expect.stringContaining("1 active player is still on this team"),
    );
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockTeamUpdate).not.toHaveBeenCalled();
  });

  test("archiving a team with no active players proceeds to the real confirm dialog", async () => {
    // Override the players fixture for this one test: an empty roster.
    const { supabase } = jest.requireMock("@/lib/supabase") as { supabase: { from: jest.Mock } };
    supabase.from.mockImplementation((table: string) => {
      if (table === "teams") {
        return {
          ...mockChain({ data: [{ id: "team-1", club_id: "club-1", name: "Test Team", age_group: null, season: null }], error: null }),
          update: () => ({ eq: (...args: unknown[]) => mockTeamUpdate(...args) }),
        };
      }
      if (table === "players") return mockChain({ data: [], error: null });
      if (table === "profiles") return mockChain({ data: [], error: null });
      if (table === "team_coaches") return mockChain({ data: [], error: null });
      if (table === "player_payments") return mockChain({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });
    mockConfirmAsync.mockResolvedValue(true);

    await render(<ClubManagement />);
    await waitFor(() => expect(screen.getByText("Test Team")).toBeTruthy());

    fireEvent.press(screen.getByText("Archive team"));

    await waitFor(() => expect(mockConfirmAsync).toHaveBeenCalledTimes(1));
    expect(mockNotify).not.toHaveBeenCalledWith(expect.stringContaining("Can't archive"), expect.anything());
    await waitFor(() => expect(mockTeamUpdate).toHaveBeenCalledTimes(1));
  });
});
