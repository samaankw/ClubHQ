import React from "react";
import { ScrollView } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Screen } from "./Screen";
import { CardHeader } from "./CardHeader";
import { ListRow } from "./ListRow";
import { EmptyState } from "./EmptyState";
import { Text } from "./Text";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Screen", () => {
  it("paints the page background", async () => {
    const { getByTestId } = await render(
      <Screen testID="s">
        <Text>x</Text>
      </Screen>,
    );
    expect(flat(getByTestId("s").props.style).backgroundColor).toBe(color.bg.page);
  });

  // A form screen behind the keyboard is useless if tapping a Button while a
  // Field is focused just dismisses the keyboard instead of firing onPress --
  // this is the prop that keeps a submit button one tap, not two.
  it("lets a scrolling screen's taps reach a control while the keyboard is up", async () => {
    const ref = React.createRef<ScrollView>();
    await render(
      <Screen ref={ref}>
        <Text>x</Text>
      </Screen>,
    );
    expect((ref.current as unknown as { props: { keyboardShouldPersistTaps?: string } })?.props.keyboardShouldPersistTaps).toBe("handled");
  });
});

describe("CardHeader", () => {
  it("renders a title and an optional action", async () => {
    const fn = jest.fn();
    const { getByText, getByLabelText } = await render(<CardHeader title="Active Teams" action="View Archive" onAction={fn} />);
    expect(getByText("Active Teams")).toBeTruthy();
    await fireEvent.press(getByLabelText("View Archive"));
    expect(fn).toHaveBeenCalled();
  });

  it("omits the action when not given", async () => {
    const { queryByRole } = await render(<CardHeader title="Active Teams" />);
    expect(queryByRole("button")).toBeNull();
  });
});

describe("ListRow", () => {
  it("renders title and subtitle and responds to press", async () => {
    const fn = jest.fn();
    const { getByText, getByRole } = await render(<ListRow title="Club Management" subtitle="Teams, rosters, and staff" onPress={fn} />);
    expect(getByText("Teams, rosters, and staff")).toBeTruthy();
    await fireEvent.press(getByRole("button"));
    expect(fn).toHaveBeenCalled();
  });
});

describe("EmptyState", () => {
  it("renders its message", async () => {
    const { getByText } = await render(<EmptyState title="No drills yet" body="Add your first drill." />);
    expect(getByText("No drills yet")).toBeTruthy();
    expect(getByText("Add your first drill.")).toBeTruthy();
  });
});
