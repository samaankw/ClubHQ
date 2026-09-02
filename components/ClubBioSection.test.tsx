import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import ClubBioSection from "./ClubBioSection";

const mockUseClubBio = jest.fn();
jest.mock("@/lib/hooks", () => ({ useClubBio: () => mockUseClubBio() }));

describe("ClubBioSection", () => {
  beforeEach(() => {
    mockUseClubBio.mockReset();
  });

  test("shows a loading state", async () => {
    mockUseClubBio.mockReturnValue({ crestUrl: null, bio: null, loading: true, error: null, refresh: jest.fn() });
    await render(<ClubBioSection />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  test("an error state offers retry", async () => {
    const refresh = jest.fn();
    mockUseClubBio.mockReturnValue({ crestUrl: null, bio: null, loading: false, error: { message: "Network error" }, refresh });
    await render(<ClubBioSection />);
    expect(screen.getByText("Network error")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // The whole reason this section was rewritten: it used to compile Williams
  // Soccer Clinic's crest and founding story directly into shared UI, which
  // every club using this app would have shown regardless of whose account
  // it was. A club with nothing set yet must get a generic message, never a
  // stranger's story.
  test("a club with no bio yet shows a generic fallback, not another club's content", async () => {
    mockUseClubBio.mockReturnValue({ crestUrl: null, bio: null, loading: false, error: null, refresh: jest.fn() });
    await render(<ClubBioSection />);
    expect(screen.getByText("No club story yet")).toBeTruthy();
    expect(screen.queryByText(/Williams Soccer Clinic/)).toBeNull();
    expect(screen.queryByText(/Dunwoody/)).toBeNull();
  });

  test("a club's own bio is hidden until 'Read our full story' is tapped, then shown", async () => {
    mockUseClubBio.mockReturnValue({ crestUrl: null, bio: "Our own club's real story.", loading: false, error: null, refresh: jest.fn() });
    await render(<ClubBioSection />);
    expect(screen.queryByText("Our own club's real story.")).toBeNull();
    await fireEvent.press(screen.getByText("Read our full story"));
    expect(screen.getByText("Our own club's real story.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Show less"));
    expect(screen.queryByText("Our own club's real story.")).toBeNull();
  });
});
