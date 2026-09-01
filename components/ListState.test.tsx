import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import ListState from "./ListState";

describe("ListState", () => {
  test("renders an accessible loading indicator while loading, regardless of other props", async () => {
    await render(
      <ListState loading error={null} isEmpty={false} onRetry={jest.fn()} emptyTitle="Nothing here" loadingLabel="Fetching players…" />,
    );
    expect(screen.getByLabelText("Fetching players…")).toBeTruthy();
  });

  test("renders the error message and an accessible retry action, and retry calls onRetry", async () => {
    const onRetry = jest.fn();
    await render(
      <ListState
        loading={false}
        error={{ message: "Couldn't reach the server" }}
        isEmpty={false}
        onRetry={onRetry}
        emptyTitle="Nothing here"
      />,
    );
    expect(screen.getByText("Couldn't reach the server")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Retry loading"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("falls back to a generic message when the error carries an empty string", async () => {
    await render(<ListState loading={false} error={{ message: "" }} isEmpty={false} onRetry={jest.fn()} emptyTitle="Nothing here" />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  test("renders the empty title/hint/action only when not loading and no error", async () => {
    const onPress = jest.fn();
    await render(
      <ListState
        loading={false}
        error={null}
        isEmpty
        onRetry={jest.fn()}
        emptyTitle="No players yet"
        emptyHint="Ask your director for a code"
        emptyAction={{ label: "Link a Player", onPress }}
      />,
    );
    expect(screen.getByText("No players yet")).toBeTruthy();
    expect(screen.getByText("Ask your director for a code")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Link a Player"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("renders children only once loading, error, and empty are all ruled out", async () => {
    await render(
      <ListState loading={false} error={null} isEmpty={false} onRetry={jest.fn()} emptyTitle="unused">
        <Text>Real content</Text>
      </ListState>,
    );
    expect(screen.getByText("Real content")).toBeTruthy();
  });

  test("error takes precedence over isEmpty when both are somehow true", async () => {
    await render(<ListState loading={false} error={{ message: "boom" }} isEmpty emptyTitle="empty title" onRetry={jest.fn()} />);
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.queryByText("empty title")).toBeNull();
  });
});
