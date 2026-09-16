import { isClubStaff, isDirector } from "./permissions";

describe("isClubStaff", () => {
  it("is true for a coach", () => {
    expect(isClubStaff("coach")).toBe(true);
  });

  it("is true for a director", () => {
    expect(isClubStaff("director")).toBe(true);
  });

  it("is false for a parent", () => {
    expect(isClubStaff("parent")).toBe(false);
  });

  it("is false for a player", () => {
    expect(isClubStaff("player")).toBe(false);
  });

  it("is false before a profile has loaded", () => {
    expect(isClubStaff(undefined)).toBe(false);
    expect(isClubStaff(null)).toBe(false);
  });
});

describe("isDirector", () => {
  it("is true only for a director", () => {
    expect(isDirector("director")).toBe(true);
    expect(isDirector("coach")).toBe(false);
    expect(isDirector("parent")).toBe(false);
    expect(isDirector("player")).toBe(false);
  });

  it("is false before a profile has loaded", () => {
    expect(isDirector(undefined)).toBe(false);
    expect(isDirector(null)).toBe(false);
  });
});
