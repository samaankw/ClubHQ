import { teamLabel } from "../../lib/teamLabel";

describe("teamLabel", () => {
  it("prefers age_group when present", () => {
    expect(teamLabel({ name: "Ajax FC", age_group: "U10" })).toBe("U10");
  });

  it("trims age_group before using it", () => {
    expect(teamLabel({ name: "Ajax FC", age_group: "  U12  " })).toBe("U12");
  });

  it("falls back to the club name when age_group is blank", () => {
    expect(teamLabel({ name: "Ajax FC", age_group: "   " })).toBe("Ajax FC");
  });

  it("falls back to the club name when age_group is null", () => {
    expect(teamLabel({ name: "Ajax FC", age_group: null })).toBe("Ajax FC");
  });

  it("falls back to the club name when age_group is omitted entirely", () => {
    expect(teamLabel({ name: "Ajax FC" })).toBe("Ajax FC");
  });
});
