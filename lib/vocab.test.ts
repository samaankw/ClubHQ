// getVocab is a pure function and doesn't need AuthProvider at all, but
// vocab.ts also exports useVocab(), which imports it -- mock it here so this
// file doesn't transitively need expo-router or a configured Supabase client.
jest.mock("@/lib/AuthProvider", () => ({ useAuth: () => ({ orgType: null }) }));

import { getVocab } from "./vocab";

describe("getVocab", () => {
  test("private_trainer has no group concept", () => {
    expect(getVocab("private_trainer").group).toBeNull();
    expect(getVocab("private_trainer").member.singular).toBe("Client");
    expect(getVocab("private_trainer").rosterTitle).toBe("My Clients");
  });

  test("academy uses training-group/athlete wording", () => {
    const vocab = getVocab("academy");
    expect(vocab.group?.singular).toBe("Training Group");
    expect(vocab.member.plural).toBe("Athletes");
    expect(vocab.myMemberLabel).toBe("My Athlete");
  });

  test("small_club and large_club both use team/player wording", () => {
    expect(getVocab("small_club")).toEqual(getVocab("large_club"));
    expect(getVocab("small_club").group?.singular).toBe("Team");
    expect(getVocab("small_club").member.plural).toBe("Players");
  });

  test("falls back to small_club's wording when org_type is missing", () => {
    expect(getVocab(null)).toEqual(getVocab("small_club"));
    expect(getVocab(undefined)).toEqual(getVocab("small_club"));
  });

  test("organization wording matches the org_type's own identity", () => {
    expect(getVocab("private_trainer").organization.singular).toBe("Practice");
    expect(getVocab("academy").organization.singular).toBe("Academy");
    expect(getVocab("small_club").organization.singular).toBe("Club");
  });

  test("session wording is generic across every org_type", () => {
    for (const orgType of ["private_trainer", "academy", "small_club", "large_club"] as const) {
      expect(getVocab(orgType).session).toEqual({ singular: "Session", plural: "Sessions" });
    }
  });

  test("every org_type defines the same staff wording", () => {
    for (const orgType of ["private_trainer", "academy", "small_club", "large_club"] as const) {
      expect(getVocab(orgType).staff).toEqual({ singular: "Coach", plural: "Coaches" });
    }
  });
});
