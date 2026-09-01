import { dedupeLocations } from "./dedupeLocations";

describe("dedupeLocations", () => {
  it("is case-insensitive, keeping the first-seen casing", () => {
    expect(dedupeLocations(["Field A", "field a", "FIELD A"], 6)).toEqual(["Field A"]);
  });

  it("preserves first-seen order", () => {
    expect(dedupeLocations(["Field B", "Field A", "Field B", "Field C"], 6)).toEqual(["Field B", "Field A", "Field C"]);
  });

  it("respects the limit", () => {
    expect(dedupeLocations(["A", "B", "C", "D"], 2)).toEqual(["A", "B"]);
  });

  it("drops blanks, nulls, and undefined", () => {
    expect(dedupeLocations(["", "   ", null, undefined, "Field A"], 6)).toEqual(["Field A"]);
  });

  it("trims whitespace before comparing and storing", () => {
    expect(dedupeLocations(["  Field A  ", "Field A"], 6)).toEqual(["Field A"]);
  });

  it("returns an empty array when given no usable locations", () => {
    expect(dedupeLocations([], 6)).toEqual([]);
    expect(dedupeLocations([null, "", "  "], 6)).toEqual([]);
  });
});
