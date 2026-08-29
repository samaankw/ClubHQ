import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Button, stateStyle } from "../../components/ui/Button";
import { color, radius, opacity } from "../../theme";

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

  it("dims a disabled button with opacity.disabled, not opacity.pressed", async () => {
    const { getByRole } = await render(<Button label="Go" disabled />);
    expect(flat(getByRole("button").props.style).opacity).toBe(opacity.disabled);
  });

  // Pressable derives "pressed" from its internal touch-responder state,
  // which isn't practical to simulate through fireEvent. stateStyle() is the
  // exported precedence rule Button's style callback delegates to, so it's
  // tested directly for each combination of pressed/disabled.
  describe("stateStyle", () => {
    it("is unstyled when neither pressed nor disabled", () => {
      expect(stateStyle(false, false)).toBeUndefined();
    });

    it("dims with opacity.pressed when pressed and enabled", () => {
      expect(stateStyle(true, false)).toEqual({ opacity: opacity.pressed });
    });

    it("dims with opacity.disabled when disabled, regardless of pressed", () => {
      expect(stateStyle(false, true)).toEqual({ opacity: opacity.disabled });
      expect(stateStyle(true, true)).toEqual({ opacity: opacity.disabled });
    });
  });
});
