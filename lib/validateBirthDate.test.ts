import { isValidBirthDate } from "./validateBirthDate";

describe("isValidBirthDate", () => {
  test("accepts a real calendar date", () => {
    expect(isValidBirthDate("2010-05-20")).toBe(true);
  });

  test("rejects a date whose month/day are out of range, even though the shape matches YYYY-MM-DD", () => {
    expect(isValidBirthDate("2026-13-45")).toBe(false);
  });

  test("rejects February 30th", () => {
    expect(isValidBirthDate("2024-02-30")).toBe(false);
  });

  test("accepts a real leap day", () => {
    expect(isValidBirthDate("2024-02-29")).toBe(true);
  });

  test("rejects garbage input", () => {
    expect(isValidBirthDate("not-a-date")).toBe(false);
  });
});
