import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import NotAuthorized from "./NotAuthorized";

jest.mock("@/lib/navigation", () => ({ goBackOr: jest.fn() }));
import { goBackOr } from "@/lib/navigation";

describe("NotAuthorized", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows the given title and body", async () => {
    await render(<NotAuthorized title="Directors only" body="Only directors can do this." fallback="/(tabs)/dashboard" />);
    expect(screen.getByText("Directors only")).toBeTruthy();
    expect(screen.getByText("Only directors can do this.")).toBeTruthy();
  });

  test("falls back to a generic title when none is given", async () => {
    await render(<NotAuthorized body="Nope." fallback="/(tabs)/dashboard" />);
    expect(screen.getByText("Not authorized")).toBeTruthy();
  });

  test("Go back always has a real destination, even with no back-stack", async () => {
    await render(<NotAuthorized body="Nope." fallback="/(tabs)/dashboard" />);
    await fireEvent.press(screen.getByText("Go back"));
    expect(goBackOr).toHaveBeenCalledWith("/(tabs)/dashboard");
  });
});
