import React from "react";
import { render } from "@testing-library/react-native";
import { Text, Eyebrow } from "../../components/ui/Text";
import { color, type } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Text", () => {
  it("defaults to body role and primary tone", async () => {
    const { getByText } = await render(<Text>hello</Text>);
    const s = flat(getByText("hello").props.style);
    expect(s.fontSize).toBe(type.body.fontSize);
    expect(s.color).toBe(color.text.primary);
  });

  it("applies the requested role", async () => {
    const { getByText } = await render(<Text role="h1">title</Text>);
    expect(flat(getByText("title").props.style).fontSize).toBe(type.h1.fontSize);
  });

  it("applies the requested tone", async () => {
    const { getByText } = await render(<Text tone="brand">link</Text>);
    expect(flat(getByText("link").props.style).color).toBe(color.text.brand);
  });

  it("lets a style prop override", async () => {
    const { getByText } = await render(<Text style={{ opacity: 0.5 }}>x</Text>);
    expect(flat(getByText("x").props.style).opacity).toBe(0.5);
  });
});

describe("Eyebrow", () => {
  it("is uppercase and letterspaced", async () => {
    const { getByText } = await render(<Eyebrow>getting started</Eyebrow>);
    const s = flat(getByText("getting started").props.style);
    expect(s.textTransform).toBe("uppercase");
    expect(s.letterSpacing).toBe(type.eyebrow.letterSpacing);
  });
});
