import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import CreateOrJoinClub from "./create-club";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
import { router } from "expo-router";

const mockRefreshProfile = jest.fn();
jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ profile: { role: "director" }, refreshProfile: mockRefreshProfile }),
}));

jest.mock("@/lib/alertCompat", () => ({ notify: jest.fn() }));

const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

describe("CreateOrJoinClub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("defaults to the Club option and creates with small_club", async () => {
    await render(<CreateOrJoinClub />);
    await fireEvent.changeText(screen.getByPlaceholderText("Club name"), "Williams Soccer Clinic");
    await fireEvent.press(screen.getByText("Create Club"));

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(mockRpc).toHaveBeenCalledWith("create_club", { club_name: "Williams Soccer Clinic", p_org_type: "small_club" });
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/dashboard");
  });

  test("choosing Private Trainer passes private_trainer to the RPC, not the display label", async () => {
    await render(<CreateOrJoinClub />);
    await fireEvent.press(screen.getByText("Private Trainer"));
    await fireEvent.changeText(screen.getByPlaceholderText("Club name"), "Solo Training Co");
    await fireEvent.press(screen.getByText("Create Club"));

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(mockRpc).toHaveBeenCalledWith("create_club", { club_name: "Solo Training Co", p_org_type: "private_trainer" });
  });

  test("a blank club name is rejected before the RPC is ever called", async () => {
    await render(<CreateOrJoinClub />);
    await fireEvent.press(screen.getByText("Create Club"));
    expect(screen.getByText("Give your club a name.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
