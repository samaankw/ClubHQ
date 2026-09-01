import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import PlayerDetail from "./[id]";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "player-1" }),
  Stack: { Screen: () => null },
  router: { replace: jest.fn() },
}));

jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "coach-1", role: "coach" } }),
}));

jest.mock("@/components/DrillVideoModal", () => "DrillVideoModal");

let mockPlayerShouldFail = true;

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                mockPlayerShouldFail
                  ? Promise.resolve({ data: null, error: { message: "permission denied for table players" } })
                  : Promise.resolve({ data: { id: "player-1", full_name: "Jamie Rivera", position: "Midfielder" }, error: null }),
            }),
          }),
        };
      }
      if (table === "development_plans") {
        return { select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      if (table === "evaluations") {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

describe("PlayerDetail: real error state instead of a fake permanent Loading…", () => {
  beforeEach(() => {
    mockPlayerShouldFail = true;
  });

  test("a failed fetch shows an actionable error with retry, never a stuck Loading…", async () => {
    await render(<PlayerDetail />);

    await waitFor(() => expect(screen.getByText("permission denied for table players")).toBeTruthy());
    expect(screen.getByLabelText("Retry loading")).toBeTruthy();
  });

  test("pressing retry after the underlying failure clears recovers the real player screen", async () => {
    await render(<PlayerDetail />);
    await waitFor(() => expect(screen.getByLabelText("Retry loading")).toBeTruthy());

    mockPlayerShouldFail = false;
    await fireEvent.press(screen.getByLabelText("Retry loading"));

    await waitFor(() => expect(screen.getByText("Jamie Rivera")).toBeTruthy());
    expect(screen.queryByLabelText("Retry loading")).toBeNull();
  });
});
