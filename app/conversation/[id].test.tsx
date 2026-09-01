import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import Conversation from "./[id]";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "convo-1" }),
  Stack: { Screen: () => null },
}));

jest.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "user-1", full_name: "Coach Sam" } }),
}));

const mockChannel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() };

let mockInsertShouldFail = false;
let mockInsertCallCount = 0;
let mockHoldInsert: Promise<void> | null = null;

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: jest.fn().mockResolvedValue({
      data: [{ id: "convo-1", type: "direct", team_name: null, team_age_group: null, other_participant_name: "Alex Parent" }],
      error: null,
    }),
    from: jest.fn((table: string) => {
      if (table !== "messages") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
        insert: (row: { sender_id: string; body: string }) => ({
          select: () => ({
            single: async () => {
              mockInsertCallCount++;
              if (mockHoldInsert) await mockHoldInsert;
              if (mockInsertShouldFail) return { data: null, error: { message: "network error" } };
              return {
                data: { id: `msg-${mockInsertCallCount}`, sender_id: row.sender_id, body: row.body, created_at: new Date().toISOString() },
                error: null,
              };
            },
          }),
        }),
      };
    }),
    channel: () => mockChannel,
    removeChannel: jest.fn(),
  },
}));

describe("Conversation send", () => {
  beforeEach(() => {
    mockInsertShouldFail = false;
    mockInsertCallCount = 0;
    mockHoldInsert = null;
  });

  test("a failed send preserves the exact text and marks it retryable instead of losing it", async () => {
    mockInsertShouldFail = true;
    await render(<Conversation />);

    const input = await screen.findByPlaceholderText("Message…");
    await fireEvent.changeText(input, "field is closed tomorrow");
    await fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(screen.getByText("Not sent · tap to retry")).toBeTruthy());
    expect(screen.getByText("field is closed tomorrow")).toBeTruthy();
  });

  test("retrying a failed send succeeds once the network recovers", async () => {
    mockInsertShouldFail = true;
    await render(<Conversation />);

    const input = await screen.findByPlaceholderText("Message…");
    await fireEvent.changeText(input, "trying again");
    await fireEvent.press(screen.getByLabelText("Send message"));
    await waitFor(() => expect(screen.getByText("Not sent · tap to retry")).toBeTruthy());

    mockInsertShouldFail = false;
    await fireEvent.press(screen.getByLabelText("Retry sending message"));

    await waitFor(() => expect(screen.queryByText("Not sent · tap to retry")).toBeNull());
    expect(screen.getByText("trying again")).toBeTruthy();
  });

  test("a second send while one is still in flight does not insert twice", async () => {
    let releaseInsert: () => void = () => {};
    mockHoldInsert = new Promise((resolve) => {
      releaseInsert = resolve;
    });

    await render(<Conversation />);
    const input = await screen.findByPlaceholderText("Message…");

    await fireEvent.changeText(input, "first message");
    // Not awaited: RNTL v14's fireEvent.press awaits the handler's own
    // returned promise, which won't resolve until releaseInsert() runs below
    // -- awaiting it here would deadlock the test against itself.
    fireEvent.press(screen.getByLabelText("Send message"));
    // Two "Sending…" nodes once the optimistic message lands: the button's
    // own label, and the pending message bubble's timestamp line.
    await waitFor(() => expect(screen.getAllByText("Sending…")).toHaveLength(2));

    // The draft cleared after the first send; type a second message and try
    // to send it while the first is still unresolved. The button is disabled
    // while sending, so this press is a no-op.
    await fireEvent.changeText(input, "second message");
    fireEvent.press(screen.getByLabelText("Send message"));

    expect(mockInsertCallCount).toBe(1);

    releaseInsert();
    await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
  });
});
