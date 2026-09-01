import { userFacingDbError } from "../../lib/dbErrors";

const FALLBACK = "Something went wrong.";

describe("userFacingDbError", () => {
  // The wording these map away from is the wording a commit on this branch
  // was written specifically to remove from user-facing copy.
  it("replaces RLS refusals with a permission explanation", () => {
    const raw = 'new row violates row-level security policy for table "players"';
    const out = userFacingDbError(raw, FALLBACK);
    expect(out).toBe("You don't have permission to do that. Ask your club director.");
    expect(out).not.toMatch(/row|table|policy/i);
  });

  it("explains an impossible date", () => {
    expect(userFacingDbError('date/time field value out of range: "2026-13-45"', FALLBACK)).toBe(
      "That date isn't a real calendar date."
    );
  });

  it("explains a duplicate", () => {
    expect(userFacingDbError("duplicate key value violates unique constraint", FALLBACK)).toBe("That already exists.");
  });

  it("explains a broken reference", () => {
    expect(userFacingDbError('insert violates foreign key constraint "players_team_id_fkey"', FALLBACK)).toBe(
      "Something it points to no longer exists. Refresh and try again."
    );
  });

  it("explains a network failure", () => {
    expect(userFacingDbError("TypeError: Failed to fetch", FALLBACK)).toBe(
      "Couldn't reach the server. Check your connection and try again."
    );
  });

  it("falls back for anything it doesn't recognise", () => {
    expect(userFacingDbError("some unexpected postgres wording", FALLBACK)).toBe(FALLBACK);
  });

  it("never leaks developer vocabulary from a mapped message", () => {
    const rawMessages = [
      'new row violates row-level security policy for table "teams"',
      'duplicate key value violates unique constraint "teams_pkey"',
      'date/time field value out of range: "2026-13-45"',
    ];
    for (const raw of rawMessages) {
      expect(userFacingDbError(raw, FALLBACK)).not.toMatch(/\b(row|table|policy|constraint|key|null|column)\b/i);
    }
  });
});
