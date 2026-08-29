import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Field } from "../../components/ui/Field";
import { Toggle } from "../../components/ui/Toggle";
import { radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Field", () => {
  it("renders its label and placeholder", async () => {
    const { getByText, getByPlaceholderText } = await render(
      <Field label="Team Name" value="" onChangeText={() => {}} placeholder="e.g. U10 Boys Red" />
    );
    expect(getByText("Team Name")).toBeTruthy();
    expect(getByPlaceholderText("e.g. U10 Boys Red")).toBeTruthy();
  });

  it("uses the input radius token", async () => {
    const { getByTestId } = await render(<Field testID="f" value="" onChangeText={() => {}} />);
    expect(flat(getByTestId("f").props.style).borderRadius).toBe(radius.input);
  });

  it("reports typing", async () => {
    const fn = jest.fn();
    const { getByTestId } = await render(<Field testID="f" value="" onChangeText={fn} />);
    await fireEvent.changeText(getByTestId("f"), "Kickers");
    expect(fn).toHaveBeenCalledWith("Kickers");
  });
});

describe("Toggle", () => {
  it("exposes its label and current state", async () => {
    const { getByLabelText } = await render(
      <Toggle label="Event Notifications" value onValueChange={() => {}} />
    );
    expect(getByLabelText("Event Notifications").props.value).toBe(true);
  });

  it("reports a change", async () => {
    const fn = jest.fn();
    const { getByLabelText } = await render(
      <Toggle label="Announcements" value={false} onValueChange={fn} />
    );
    await fireEvent(getByLabelText("Announcements"), "valueChange", true);
    expect(fn).toHaveBeenCalledWith(true);
  });
});
