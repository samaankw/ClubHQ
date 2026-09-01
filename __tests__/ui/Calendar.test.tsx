import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Calendar } from "../../components/ui/Calendar";

// Fixed reference dates so the suite never depends on the day the tests
// actually run. August always has 31 days, so it also doubles as a safe
// "known month" fixture without touching February/leap-year maths here.
const AUG_15_2026 = new Date(2026, 7, 15); // Saturday
const FAR_PAST = new Date(2020, 0, 1); // old enough that nothing in these tests is disabled

describe("Calendar", () => {
  it("renders the correct number of day cells for a known month", async () => {
    const { getAllByTestId } = await render(
      <Calendar value={AUG_15_2026} onChange={() => {}} minDate={FAR_PAST} />
    );
    expect(getAllByTestId("calendar-day")).toHaveLength(31);
  });

  it("calls onChange with the pressed date", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <Calendar value={AUG_15_2026} onChange={onChange} minDate={FAR_PAST} />
    );
    await fireEvent.press(getByLabelText("Wednesday, August 5, 2026"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const pressed: Date = onChange.mock.calls[0][0];
    expect(pressed.getFullYear()).toBe(2026);
    expect(pressed.getMonth()).toBe(7);
    expect(pressed.getDate()).toBe(5);
  });

  it("marks the selected day with accessibilityState.selected", async () => {
    const { getByLabelText } = await render(
      <Calendar value={AUG_15_2026} onChange={() => {}} minDate={FAR_PAST} />
    );
    expect(getByLabelText("Saturday, August 15, 2026").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Wednesday, August 5, 2026").props.accessibilityState.selected).toBe(false);
  });

  it("does not call onChange when a day before minDate is pressed", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <Calendar value={AUG_15_2026} onChange={onChange} minDate={new Date(2026, 7, 10)} />
    );
    await fireEvent.press(getByLabelText("Wednesday, August 5, 2026"));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Every other test here passes an explicit minDate, which is why the default
  // went unexercised: it used to floor at today, so an edit screen could not
  // reach the date of an event that had already happened.
  it("has no floor when minDate is omitted, so past days stay selectable", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<Calendar value={FAR_PAST} onChange={onChange} />);
    const pastDay = getByLabelText("Wednesday, January 1, 2020");
    expect(pastDay.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(getByLabelText("Thursday, January 2, 2020"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].getDate()).toBe(2);
  });

  it("still disables past days when minDate is supplied", async () => {
    const { getByLabelText } = await render(
      <Calendar value={AUG_15_2026} onChange={() => {}} minDate={new Date(2026, 7, 10)} />
    );
    expect(getByLabelText("Wednesday, August 5, 2026").props.accessibilityState.disabled).toBe(true);
    expect(getByLabelText("Monday, August 10, 2026").props.accessibilityState.disabled).toBe(false);
  });

  it("moves the visible month with prev/next without emitting onChange", async () => {
    const onChange = jest.fn();
    const { getByText, getByLabelText } = await render(
      <Calendar value={AUG_15_2026} onChange={onChange} minDate={FAR_PAST} />
    );
    expect(getByText("August 2026")).toBeTruthy();

    await fireEvent.press(getByLabelText("Next month"));
    expect(getByText("September 2026")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(getByLabelText("Previous month"));
    expect(getByText("August 2026")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
