import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "./ProgressBar";
import { Badge } from "./Badge";
import { Avatar } from "./Avatar";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("ProgressBar", () => {
  it("expresses progress as a percentage width", async () => {
    const { getByTestId } = await render(<ProgressBar value={0.6} />);
    expect(flat(getByTestId("progress-fill").props.style).width).toBe("60%");
  });

  it("clamps out-of-range values", async () => {
    expect(flat((await render(<ProgressBar value={2} />)).getByTestId("progress-fill").props.style).width).toBe("100%");
    expect(flat((await render(<ProgressBar value={-1} />)).getByTestId("progress-fill").props.style).width).toBe("0%");
  });

  it("fills with the brand color", async () => {
    const { getByTestId } = await render(<ProgressBar value={0.5} />);
    expect(flat(getByTestId("progress-fill").props.style).backgroundColor).toBe(color.bg.brand);
  });
});

describe("Badge", () => {
  it("tints from its tone", async () => {
    const { getByTestId } = await render(<Badge testID="b" label="2 New" tone="brand" />);
    expect(flat(getByTestId("b").props.style).backgroundColor).toBe(color.bg.brandSubtle);
  });
});

describe("Avatar", () => {
  it("falls back to initials without an image", async () => {
    const { getByText } = await render(<Avatar name="Kayla Henderson" />);
    expect(getByText("KH")).toBeTruthy();
  });

  it("handles a single-word name", async () => {
    const { getByText } = await render(<Avatar name="Marcus" />);
    expect(getByText("M")).toBeTruthy();
  });
});
