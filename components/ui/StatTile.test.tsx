import React from "react";
import { render } from "@testing-library/react-native";
import { IconChip } from "./IconChip";
import { StatTile } from "./StatTile";
import { color, radius, type } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("IconChip", () => {
  it("tints its background from the requested tone", async () => {
    const { getByTestId } = await render(<IconChip testID="chip" name="football" tone="brand" />);
    expect(flat(getByTestId("chip").props.style).backgroundColor).toBe(color.bg.brandSubtle);
  });

  it("uses the tile radius", async () => {
    const { getByTestId } = await render(<IconChip testID="chip" name="football" />);
    expect(flat(getByTestId("chip").props.style).borderRadius).toBe(radius.tile);
  });
});

describe("StatTile", () => {
  it("renders an uppercase label above a display-size value", async () => {
    const { getByText } = await render(<StatTile label="Goals" value="8" />);
    expect(flat(getByText("Goals").props.style).textTransform).toBe("uppercase");
    expect(flat(getByText("8").props.style).fontSize).toBe(type.display.fontSize);
  });

  it("renders an optional footnote", async () => {
    const { getByText } = await render(<StatTile label="Rating" value="7.8" footnote="Last 10" />);
    expect(getByText("Last 10")).toBeTruthy();
  });

  it("tones the value", async () => {
    const { getByText } = await render(<StatTile label="Rating" value="7.8" tone="brand" />);
    expect(flat(getByText("7.8").props.style).color).toBe(color.text.brand);
  });
});
