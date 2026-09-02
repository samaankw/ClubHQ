import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import OrgTypePicker from "./OrgTypePicker";

describe("OrgTypePicker", () => {
  test("shows all three options with their descriptions", async () => {
    await render(<OrgTypePicker value="small_club" onChange={jest.fn()} />);
    expect(screen.getByText("Private Trainer")).toBeTruthy();
    expect(screen.getByText("Academy")).toBeTruthy();
    expect(screen.getByText("Club")).toBeTruthy();
    expect(screen.getByText(/No standing teams or rosters/)).toBeTruthy();
  });

  test("marks the current value as selected", async () => {
    await render(<OrgTypePicker value="academy" onChange={jest.fn()} />);
    expect(screen.getByRole("radio", { name: /Academy/ })).toHaveProp("accessibilityState", { selected: true });
  });

  test("tapping an option reports its value, not the label text", async () => {
    const onChange = jest.fn();
    await render(<OrgTypePicker value="small_club" onChange={onChange} />);
    await fireEvent.press(screen.getByText("Private Trainer"));
    expect(onChange).toHaveBeenCalledWith("private_trainer");
  });

  test("small_club and large_club both render as the same 'Club' option", async () => {
    await render(<OrgTypePicker value="large_club" onChange={jest.fn()} />);
    // Exactly one "Club" option exists -- large_club isn't offered as a
    // separate, functionally-identical choice (see the component comment).
    expect(screen.getAllByText("Club")).toHaveLength(1);
  });
});
