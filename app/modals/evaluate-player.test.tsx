import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import EvaluatePlayer from "./evaluate-player";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ playerId: "player-1", playerName: "Maya K." }),
  Stack: { Screen: () => null },
  router: { canGoBack: () => false, replace: jest.fn(), back: jest.fn() },
}));

jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "coach-1", role: "coach" } }),
}));

const mockConfirmAsync = jest.fn();
const mockNotify = jest.fn();
jest.mock("@/lib/alertCompat", () => ({
  confirmAsync: (...args: unknown[]) => mockConfirmAsync(...args),
  notify: (...args: unknown[]) => mockNotify(...args),
}));

const mockInsert = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    })),
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
  },
  SUPABASE_URL: "https://example.supabase.co",
}));

globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "" }) as typeof fetch;

describe("EvaluatePlayer: untouched-score confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "eval-1" }, error: null }),
      }),
    });
  });

  test("saving without adjusting any score asks for confirmation first", async () => {
    mockConfirmAsync.mockResolvedValue(false);
    await render(<EvaluatePlayer />);
    await fireEvent.press(screen.getByText("Save & Generate Plan"));

    await waitFor(() => expect(mockConfirmAsync).toHaveBeenCalledTimes(1));
    expect(mockConfirmAsync).toHaveBeenCalledWith(
      "No scores adjusted",
      expect.stringContaining("still at the default 5/10"),
      "Save Anyway",
    );
    // Declining the confirmation must not save anything.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("confirming anyway does proceed to save", async () => {
    mockConfirmAsync.mockResolvedValue(true);
    await render(<EvaluatePlayer />);
    fireEvent.press(screen.getByText("Save & Generate Plan"));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
  });

  test("adjusting even one score skips the confirmation entirely", async () => {
    await render(<EvaluatePlayer />);
    await fireEvent.press(screen.getByLabelText("First Touch 8"));
    fireEvent.press(screen.getByText("Save & Generate Plan"));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(mockConfirmAsync).not.toHaveBeenCalled();
  });
});
