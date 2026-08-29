import React from "react";
import { render } from "@testing-library/react-native";
import { Card, SpotlightCard, AICard } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { color, radius, space } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));
const styleOf = (t: Awaited<ReturnType<typeof render>>, id: string) =>
  flat(t.getByTestId(id).props.style);

describe("Card", () => {
  it("is a white surface with the card radius", async () => {
    const t = await render(<Card testID="c"><Text>x</Text></Card>);
    const s = styleOf(t, "c");
    expect(s.backgroundColor).toBe(color.bg.surface);
    expect(s.borderRadius).toBe(radius.card);
  });

  it("pads by default and can be unpadded", async () => {
    expect(styleOf(await render(<Card testID="c"><Text>x</Text></Card>), "c").padding).toBe(space[4]);
    expect(styleOf(await render(<Card testID="c" padded={false}><Text>x</Text></Card>), "c").padding).toBeUndefined();
  });

  it("renders its children", async () => {
    const { getByText } = await render(<Card><Text>inside</Text></Card>);
    expect(getByText("inside")).toBeTruthy();
  });
});

describe("SpotlightCard", () => {
  it("uses the dark spotlight surface", async () => {
    const t = await render(<SpotlightCard testID="s"><Text>x</Text></SpotlightCard>);
    expect(styleOf(t, "s").backgroundColor).toBe(color.bg.spotlight);
  });
});

describe("AICard", () => {
  it("uses the brand surface", async () => {
    const t = await render(<AICard testID="a"><Text>x</Text></AICard>);
    expect(styleOf(t, "a").backgroundColor).toBe(color.bg.brand);
  });
});
