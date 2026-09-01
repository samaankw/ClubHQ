import React from "react";
import { render } from "@testing-library/react-native";
import { StepDots } from "./StepDots";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

// StepDots is deliberately hidden from the accessibility tree (it's pure
// decoration), and RNTL 14 excludes hidden subtrees from queries by default.
// `hidden: true` opts back in so we can assert on the dots themselves.
describe("StepDots", () => {
  it("renders one bar per step", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={0} />);
    expect(getAllByTestId("step-dot", { hidden: true })).toHaveLength(2);
  });

  it("fills only the active bar with the brand colour", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={0} />);
    const [first, second] = getAllByTestId("step-dot", { hidden: true });
    expect(flat(first.props.style).backgroundColor).toBe(color.bg.brand);
    expect(flat(second.props.style).backgroundColor).toBe(color.border.subtle);
  });

  it("moves the fill when active changes", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={1} />);
    const [first, second] = getAllByTestId("step-dot", { hidden: true });
    expect(flat(first.props.style).backgroundColor).toBe(color.border.subtle);
    expect(flat(second.props.style).backgroundColor).toBe(color.bg.brand);
  });

  it("is hidden from screen readers as decoration", async () => {
    const { getByTestId } = await render(<StepDots count={2} active={0} />);
    expect(getByTestId("step-dots", { hidden: true }).props.accessibilityElementsHidden).toBe(true);
  });
});
