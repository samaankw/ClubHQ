import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ResetPassword from "./reset-password";

jest.mock("expo-router", () => {
  const { Text: MockText } = require("react-native");
  return { Link: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});

jest.mock("expo-linking", () => ({ createURL: (path: string) => `clubhq://${path}` }));

jest.mock("@/lib/alertCompat", () => ({ notify: jest.fn() }));
import { notify } from "@/lib/alertCompat";

const mockResetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args) } },
}));

describe("ResetPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("an empty email shows an inline field error and never calls the API", async () => {
    await render(<ResetPassword />);
    await fireEvent.press(screen.getByLabelText("Send Reset Link"));

    expect(screen.getByText("Enter the email on your ClubHQ account.")).toBeTruthy();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test("typing again after the error clears it", async () => {
    await render(<ResetPassword />);
    await fireEvent.press(screen.getByLabelText("Send Reset Link"));
    expect(screen.getByText("Enter the email on your ClubHQ account.")).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "coach@example.com");
    expect(screen.queryByText("Enter the email on your ClubHQ account.")).toBeNull();
  });

  test("a real address is submitted to the API, not just alerted on submit", async () => {
    await render(<ResetPassword />);
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "Coach@Example.com");
    await fireEvent.press(screen.getByLabelText("Send Reset Link"));

    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "coach@example.com",
      expect.objectContaining({ redirectTo: expect.any(String) }),
    );
  });
});
