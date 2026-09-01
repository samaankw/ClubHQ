import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { SetupChecklist } from "./SetupChecklist";
import { SetupStep } from "../../lib/hooks";

const steps: SetupStep[] = [
  { key: "club", title: "Create Club Profile", detail: "Williams Soccer Clinic established", done: true, href: "/profile" },
  { key: "team", title: "Setup your first team", done: false, href: "/club-management" },
  { key: "players", title: "Add your roster", done: false, href: "/(tabs)/players" },
  { key: "practice", title: "Schedule a practice", done: false, href: "/modals/create-event" },
];

describe("SetupChecklist", () => {
  it("renders a row per step", async () => {
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={jest.fn()} />);
    expect(screen.getByText("Create Club Profile")).toBeTruthy();
    expect(screen.getByText("Setup your first team")).toBeTruthy();
    expect(screen.getByText("Add your roster")).toBeTruthy();
    expect(screen.getByText("Schedule a practice")).toBeTruthy();
  });

  it("shows the completed step's detail", async () => {
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={jest.fn()} />);
    expect(screen.getByText("Williams Soccer Clinic established")).toBeTruthy();
  });

  it("gives the completed step a text alternative to the checkmark", async () => {
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={jest.fn()} />);
    expect(screen.getByLabelText(/create club profile.*complete/i)).toBeTruthy();
  });

  it("only the first incomplete step is pressable, and pressing it fires onStepPress", async () => {
    const onStepPress = jest.fn();
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={onStepPress} />);
    fireEvent.press(screen.getByRole("button", { name: /setup your first team/i }));
    expect(onStepPress).toHaveBeenCalledWith(steps[1]);
  });

  it("does not let a later incomplete step fire onStepPress", async () => {
    const onStepPress = jest.fn();
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={onStepPress} />);
    expect(screen.queryByRole("button", { name: /add your roster/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /schedule a practice/i })).toBeNull();
    expect(onStepPress).not.toHaveBeenCalled();
  });

  it("shows completed/total in the header", async () => {
    await render(<SetupChecklist steps={steps} completed={1} total={4} onStepPress={jest.fn()} />);
    expect(screen.getByText("1/4 Complete")).toBeTruthy();
  });
});
