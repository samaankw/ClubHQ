import { findViolations, evaluate, isMigrationInScope, SUPERSEDED, MIGRATION_FLOOR } from "../scripts/lint-tenancy.mjs";

describe("findViolations (TypeScript)", () => {
  it("flags the PostgREST inner-join trick", () => {
    const v = findViolations('supabase.from("players").select("*, teams!inner(club_id)")', "app/x.tsx");
    expect(v.map((x: { rule: string }) => x.rule)).toEqual(["tenancy-via-teams-join"]);
  });

  it("flags filtering on the joined table's club_id", () => {
    const v = findViolations('q.eq("teams.club_id", clubId)', "app/x.tsx");
    expect(v.map((x: { rule: string }) => x.rule)).toEqual(["tenancy-via-teams-filter"]);
  });

  it("allows reading players.club_id directly", () => {
    const src = 'supabase.from("players").select("*").eq("club_id", clubId)';
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  // Fetching one team's roster is a real, legitimate operation -- a rule that
  // flagged it would fire on correct code and get switched off.
  it("does not flag fetching a single team's roster", () => {
    const src = 'supabase.from("players").select("id").eq("team_id", teamId)';
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  it("does not flag targeting several teams by id", () => {
    const src = 'supabase.from("players").select("id").in("team_id", teamIds)';
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  // The fixes for this bug carry comments naming the pattern they removed.
  // Without comment stripping the guard would flag its own documentation.
  it("ignores the pattern inside a line comment", () => {
    const src = "// club_id direct, not a teams!inner join -- that join dropped teamless players";
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  it("does not let a URL's // hide a real violation on the same line", () => {
    const src = 'const u = "https://x.test/a"; q.select("teams!inner(club_id)");';
    expect(findViolations(src, "app/x.tsx")).toHaveLength(1);
  });

  it("reports the correct line number", () => {
    const v = findViolations('a\nb\nq.select("teams!inner(club_id)")', "app/x.tsx");
    expect(v[0].line).toBe(3);
  });
});

describe("findViolations (SQL)", () => {
  it("flags a join through teams in a migration", () => {
    const src = "select 1 from players pl\n  join teams t on t.id = pl.team_id\n  where t.club_id = caller_club";
    const v = findViolations(src, "supabase/migrations/0099_x.sql", "sql");
    expect(v.map((x: { rule: string }) => x.rule)).toEqual(["tenancy-via-teams-join"]);
    expect(v[0].line).toBe(2);
  });

  it("allows resolving a player's club directly", () => {
    const src = "select 1 from players pl where pl.club_id = caller_club";
    expect(findViolations(src, "supabase/migrations/0099_x.sql", "sql")).toHaveLength(0);
  });

  it("ignores the pattern inside a SQL comment", () => {
    const src = "-- previously did: join teams t on t.id = pl.team_id";
    expect(findViolations(src, "supabase/migrations/0099_x.sql", "sql")).toHaveLength(0);
  });
});

describe("isMigrationInScope", () => {
  it("skips migrations that predate players.club_id", () => {
    expect(isMigrationInScope("0010_product_readiness.sql")).toBe(false);
  });

  it("skips 0040 itself, which is what introduced the column", () => {
    expect(isMigrationInScope("0040_player_club_ownership.sql")).toBe(false);
  });

  it("holds every migration from 0041 on to the rule", () => {
    expect(isMigrationInScope("0041_club_bio_fields.sql")).toBe(true);
    expect(isMigrationInScope("0045_ai_call_log.sql")).toBe(true);
  });

  it("treats an unnumbered file as in scope rather than skipping it silently", () => {
    expect(isMigrationInScope("adhoc_fix.sql")).toBe(true);
  });

  it("uses the documented floor", () => {
    expect(MIGRATION_FLOOR).toBe(41);
  });
});

describe("evaluate", () => {
  it("fails on a violation in a file that is not superseded", () => {
    const violations = [{ file: "app/x.tsx", line: 1, rule: "tenancy-via-teams-join", text: "" }];
    const r = evaluate({ violations, superseded: {} });
    expect(r.errors).toHaveLength(1);
  });

  it("allows a violation in a migration recorded as superseded", () => {
    const violations = [{ file: "supabase/migrations/0043_x.sql", line: 9, rule: "tenancy-via-teams-join", text: "" }];
    const r = evaluate({ violations, superseded: { "0043_x.sql": "fixed in 0044" } });
    expect(r.errors).toHaveLength(0);
    expect(r.stale).toHaveLength(0);
  });

  // Migrations are append-only, so a superseded entry should keep matching
  // forever. If it stops, the entry is describing something that is no longer
  // there and should be deleted rather than left to rot.
  it("reports a superseded entry that no longer matches anything", () => {
    const r = evaluate({ violations: [], superseded: { "0043_x.sql": "fixed in 0044" } });
    expect(r.stale).toEqual(["0043_x.sql"]);
  });

  it("matches superseded entries by basename, not full path", () => {
    const violations = [{ file: "supabase/migrations/0043_x.sql", line: 1, rule: "tenancy-via-teams-join", text: "" }];
    expect(evaluate({ violations, superseded: { "0043_x.sql": "why" } }).errors).toHaveLength(0);
  });
});

describe("SUPERSEDED", () => {
  it("records 0043 with the migration that replaced it", () => {
    const entry = SUPERSEDED["0043_privacy_rights_and_consent_history.sql"];
    expect(entry).toBeDefined();
    expect(entry).toContain("0044");
  });
});
