import React from "react";
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
import { render, fireEvent } from "@testing-library/react-native";
import { Screen } from "../../components/ui/Screen";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { ListRow } from "../../components/ui/ListRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { Text } from "../../components/ui/Text";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Screen", () => {
  it("paints the page background", async () => {
    const { getByTestId } = await render(<Screen testID="s"><Text>x</Text></Screen>);
    expect(flat(getByTestId("s").props.style).backgroundColor).toBe(color.bg.page);
  });
});

describe("SectionHeader", () => {
  it("renders a title and an optional action", async () => {
    const fn = jest.fn();
    const { getByText, getByLabelText } = await render(
      <SectionHeader title="Active Teams" action="View Archive" onAction={fn} />
    );
    expect(getByText("Active Teams")).toBeTruthy();
    await fireEvent.press(getByLabelText("View Archive"));
    expect(fn).toHaveBeenCalled();
  });

  it("omits the action when not given", async () => {
    const { queryByRole } = await render(<SectionHeader title="Active Teams" />);
    expect(queryByRole("button")).toBeNull();
  });
});

describe("ListRow", () => {
  it("renders title and subtitle and responds to press", async () => {
    const fn = jest.fn();
    const { getByText, getByRole } = await render(
      <ListRow title="Club Management" subtitle="Teams, rosters, and staff" onPress={fn} />
    );
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
