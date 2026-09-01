import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import ErrorBoundary from "./ErrorBoundary";
import { reportError } from "@/lib/errorReporting";

jest.mock("@/lib/errorReporting", () => ({ reportError: jest.fn() }));

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom in a child component");
  return <Text>All good</Text>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // React logs the caught error to console.error by default; keep test
    // output clean without hiding a real assertion failure.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  test("renders children normally when nothing throws", async () => {
    await render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeTruthy();
  });

  test("renders an accessible fallback and reports the error when a child throws", async () => {
    await render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith({ message: "boom in a child component" }, { scope: "root-error-boundary" });
  });

  test("retry re-mounts the subtree instead of leaving the fallback stuck", async () => {
    let shouldThrow = true;
    function ToggleableBomb() {
      return <Bomb shouldThrow={shouldThrow} />;
    }
    await render(
      <ErrorBoundary>
        <ToggleableBomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByLabelText("Try again"));
    expect(screen.getByText("All good")).toBeTruthy();
  });
});
