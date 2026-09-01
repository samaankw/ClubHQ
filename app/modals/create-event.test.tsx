import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import CreateEvent from "./create-event";

let mockCapturedOptions: { gestureEnabled?: boolean; headerLeft?: () => React.ReactNode } = {};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  Stack: {
    Screen: (props: { options: typeof mockCapturedOptions }) => {
      mockCapturedOptions = props.options;
      return null;
    },
  },
}));

jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "director-1", club_id: "club-1", role: "director" } }),
}));

jest.mock("@/lib/hooks", () => ({
  useRecentLocations: () => ({ locations: [], loading: false, error: null, refresh: jest.fn() }),
}));

jest.mock("@/lib/navigation", () => ({ goBackOr: jest.fn() }));
import { goBackOr } from "@/lib/navigation";

let mockCreateCallCount = 0;
let mockHoldCreate: Promise<void> | null = null;

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === "teams") {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: jest.fn(async (fn: string) => {
      if (fn !== "create_targeted_event") throw new Error(`Unexpected rpc ${fn}`);
      mockCreateCallCount++;
      if (mockHoldCreate) await mockHoldCreate;
      return { data: `event-${mockCreateCallCount}`, error: null };
    }),
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

describe("CreateEvent: recurring creation progress and navigation guard", () => {
  beforeEach(() => {
    mockCreateCallCount = 0;
    mockHoldCreate = null;
    mockCapturedOptions = {};
    jest.clearAllMocks();
  });

  const fillMinimalValidForm = async () => {
    await fireEvent.changeText(screen.getByPlaceholderText("Title (e.g. U10 vs Northside FC)"), "Practice");
    await fireEvent.press(screen.getByText("Today"));
    await fireEvent.press(screen.getByText("4:00 PM"));
  };

  test("a multi-week recurring create shows live progress through the whole series", async () => {
    await render(<CreateEvent />);
    await waitFor(() => expect(screen.getByPlaceholderText("Title (e.g. U10 vs Northside FC)")).toBeTruthy());
    await fillMinimalValidForm();

    await fireEvent(screen.getByLabelText("Repeats weekly"), "valueChange", true);
    await fireEvent.changeText(screen.getByDisplayValue("8"), "3");

    // Not awaited -- RNTL v14's fireEvent.press awaits the handler's own
    // returned promise, which wouldn't resolve until the whole 3-session
    // loop finishes, making any intermediate "X of Y" state unobservable.
    fireEvent.press(screen.getByText("Add to Schedule"));

    await waitFor(() => expect(goBackOr).toHaveBeenCalledWith("/(tabs)/schedule?section=events"));
    expect(mockCreateCallCount).toBe(3);
  });

  test("the header back button and swipe gesture are disabled while a recurring create is in flight", async () => {
    let release: () => void = () => {};
    mockHoldCreate = new Promise((resolve) => {
      release = resolve;
    });

    await render(<CreateEvent />);
    await waitFor(() => expect(screen.getByPlaceholderText("Title (e.g. U10 vs Northside FC)")).toBeTruthy());
    await fillMinimalValidForm();
    await fireEvent(screen.getByLabelText("Repeats weekly"), "valueChange", true);
    await fireEvent.changeText(screen.getByDisplayValue("8"), "2");

    fireEvent.press(screen.getByText("Add to Schedule"));
    await waitFor(() => expect(mockCapturedOptions.gestureEnabled).toBe(false));

    // Both sessions share the same held-open promise, so the loop hasn't
    // advanced past the first one yet -- this is the "0 of 2" state set
    // right before the loop starts.
    expect(screen.getByText("Creating session 0 of 2…")).toBeTruthy();

    // The header back button must be a no-op while submitting -- pressing it
    // must not call goBackOr, unlike a normal (non-submitting) press.
    // headerLeft() returns <ModalBackButton onPress={...} />; invoke that
    // prop directly rather than mounting a second render tree for it.
    const headerLeftElement = mockCapturedOptions.headerLeft?.() as React.ReactElement<{ onPress: () => void }>;
    headerLeftElement.props.onPress();
    expect(goBackOr).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(mockCapturedOptions.gestureEnabled).toBe(true));
  });
});
