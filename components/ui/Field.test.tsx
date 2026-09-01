import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Field } from "./Field";
import { Toggle } from "./Toggle";
import { color, radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Field", () => {
  it("renders its label and placeholder", async () => {
    const { getByText, getByPlaceholderText } = await render(
      <Field label="Team Name" value="" onChangeText={() => {}} placeholder="e.g. U10 Boys Red" />,
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

  it("renders a normal border and no message when there is no error", async () => {
    const { getByTestId, queryByText } = await render(<Field testID="f" value="" onChangeText={() => {}} />);
    expect(flat(getByTestId("f").props.style).borderColor).toBe(color.border.subtle);
    expect(queryByText(/required/i)).toBeNull();
  });

  it("renders a danger border and the error message when error is set", async () => {
    const { getByTestId, getByText } = await render(<Field testID="f" value="" onChangeText={() => {}} error="Team name is required" />);
    expect(flat(getByTestId("f").props.style).borderColor).toBe(color.border.danger);
    expect(getByText("Team name is required")).toBeTruthy();
  });

  it("marks the input invalid and associates the message for accessibility", async () => {
    const { getByTestId, getByText } = await render(<Field testID="f" value="" onChangeText={() => {}} error="Team name is required" />);
    const input = getByTestId("f");
    expect(input.props.accessibilityState?.invalid ?? input.props["aria-invalid"]).toBe(true);
    const message = getByText("Team name is required");
    const errorId = input.props["aria-errormessage"] ?? input.props.accessibilityErrorMessage;
    expect(errorId).toBeTruthy();
    expect(message.props.nativeID ?? message.props.id).toBe(errorId);
  });
});

describe("Toggle", () => {
  it("exposes its label and current state", async () => {
    const { getByLabelText } = await render(<Toggle label="Event Notifications" value onValueChange={() => {}} />);
    expect(getByLabelText("Event Notifications").props.value).toBe(true);
  });

  it("reports a change", async () => {
    const fn = jest.fn();
    const { getByLabelText } = await render(<Toggle label="Announcements" value={false} onValueChange={fn} />);
    await fireEvent(getByLabelText("Announcements"), "valueChange", true);
    expect(fn).toHaveBeenCalledWith(true);
  });
});
