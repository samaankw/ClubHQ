import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Chip, FilterChipRow } from "../../components/ui/Chip";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { color, radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Chip", () => {
  it("is fully rounded", async () => {
    const { getByRole } = await render(<Chip label="All" />);
    expect(flat(getByRole("button").props.style).borderRadius).toBe(radius.chip);
  });

  it("fills with the spotlight color when selected", async () => {
    const { getByRole } = await render(<Chip label="All" selected />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.spotlight);
  });

  it("sits on a plain surface when unselected", async () => {
    const { getByRole } = await render(<Chip label="All" />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.surface);
  });
});

describe("FilterChipRow", () => {
  it("reports the chosen option", async () => {
    const fn = jest.fn();
    const { getByLabelText } = await render(
      <FilterChipRow options={["All", "Weather"]} value="All" onChange={fn} />
    );
    await fireEvent.press(getByLabelText("Weather"));
    expect(fn).toHaveBeenCalledWith("Weather");
  });
});

describe("SegmentedControl", () => {
  it("marks the active segment as selected", async () => {
    const { getByLabelText } = await render(
      <SegmentedControl options={["Events", "Announcements"]} value="Events" onChange={() => {}} />
    );
    expect(getByLabelText("Events").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Announcements").props.accessibilityState.selected).toBe(false);
  });

  it("reports a segment change", async () => {
    const fn = jest.fn();
    const { getByLabelText } = await render(
      <SegmentedControl options={["Events", "Announcements"]} value="Events" onChange={fn} />
    );
    await fireEvent.press(getByLabelText("Announcements"));
    expect(fn).toHaveBeenCalledWith("Announcements");
  });
});
