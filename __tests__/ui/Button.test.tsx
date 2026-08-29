import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "../../components/ui/Button";
import { color, radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Button", () => {
  it("renders a primary button on the brand color", async () => {
    const { getByRole } = await render(<Button label="Go" />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.brand);
  });

  it("uses the button radius token", async () => {
    const { getByRole } = await render(<Button label="Go" />);
    expect(flat(getByRole("button").props.style).borderRadius).toBe(radius.button);
  });

  it("renders secondary on a surface with a border", async () => {
    const { getByRole } = await render(<Button label="Go" variant="secondary" />);
    const s = flat(getByRole("button").props.style);
    expect(s.backgroundColor).toBe(color.bg.surface);
    expect(s.borderColor).toBe(color.border.subtle);
  });

  it("calls onPress", async () => {
    const fn = jest.fn();
    const { getByRole } = await render(<Button label="Go" onPress={fn} />);
    await fireEvent.press(getByRole("button"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", async () => {
    const fn = jest.fn();
    const { getByRole } = await render(<Button label="Go" onPress={fn} disabled />);
    await fireEvent.press(getByRole("button"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("is accessible by its label", async () => {
    const { getByLabelText } = await render(<Button label="Publish to Parent" />);
    expect(getByLabelText("Publish to Parent")).toBeTruthy();
  });
});
