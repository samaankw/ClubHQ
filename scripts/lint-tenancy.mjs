import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards the one bug this codebase has written six separate times: resolving a
// player's club by joining through `teams` instead of reading `players.club_id`.
//
// Migration 0040 made `players.club_id` authoritative and left `team_id`
// optional, precisely so a private trainer or academy can have a client with no
// team at all. Any query that reaches a player's club via `teams` silently
// drops every one of those clients -- it returns no rows rather than an error,
// so it reads as "this club has no players" instead of "this query is wrong."
//
// It has recurred in the roster screen, club management, the setup-progress
// count, two targeting pickers, a club-wide event's attendee list, the pilot
// metrics report, two AI edge functions, and -- most tellingly -- inside
// migration 0043, which was written specifically to harden privacy and
// reintroduced the join anyway. A helper offers a correct path; only a check
// that fails can keep the incorrect one out.
//
// Rules are deliberately narrow. `.eq("team_id", ...)` and `.in("team_id",
// ...)` are NOT flagged: fetching one team's roster, or targeting several
// teams, are legitimate and common. Only the shapes that exist purely to
// derive club membership through teams are errors.

// SQL migrations are append-only and must never be edited, so a historical
// migration that contains the pattern cannot be "fixed" -- it can only be
// superseded by a later one. Entries here document that history. Unlike a
// conversion backlog, this list is not expected to shrink.
export const SUPERSEDED = {
  "0043_privacy_rights_and_consent_history.sql":
    "delete_player_data() here resolved a director's authorization through teams, which broke deletion for teamless players. Recreated correctly against players.club_id in 0044_fix_privacy_player_delete_teamless.sql.",
};

// 0040 is the migration that made players.club_id authoritative. Everything
// before it legitimately predates the column and is frozen history; everything
// from 0041 on has no excuse.
export const MIGRATION_FLOOR = 41;

const TS_ROOTS = ["app", "components", "lib", "supabase/functions"];
const SQL_ROOT = "supabase/migrations";

const TS_RULES = [
  // PostgREST's inner-join trick, used to filter players by their team's club.
  // An inner join drops any player whose team_id is null, which is the entire
  // teamless population.
  { rule: "tenancy-via-teams-join", re: /teams\s*!\s*inner/ },
  // Filtering on the joined table's column, e.g. .eq("teams.club_id", clubId).
  { rule: "tenancy-via-teams-filter", re: /["']teams\.club_id["']/ },
];

const SQL_RULES = [
  // e.g. `join teams t on t.id = pl.team_id` inside a function that then reads
  // t.club_id to decide whether the caller owns the player.
  { rule: "tenancy-via-teams-join", re: /\bjoin\s+teams\b/i },
];

/** Strip `//` line comments without eating the `//` in a URL. */
function stripTsComments(line) {
  return line.replace(/(?<!:)\/\/.*$/, "");
}

/** Strip `--` SQL line comments. */
function stripSqlComments(line) {
  return line.replace(/--.*$/, "");
}

/**
 * Find anti-pattern violations in one file's source. `kind` selects the rule
 * set and comment syntax. Pure, so it is unit-testable without the filesystem.
 */
export function findViolations(source, file, kind = "ts") {
  const rules = kind === "sql" ? SQL_RULES : TS_RULES;
  const strip = kind === "sql" ? stripSqlComments : stripTsComments;
  const out = [];
  source.split("\n").forEach((raw, i) => {
    const line = strip(raw);
    for (const { rule, re } of rules) {
      if (re.test(line)) out.push({ file, line: i + 1, rule, text: raw.trim() });
    }
  });
  return out;
}

/**
 * True if a migration filename is new enough to be held to the club_id rule.
 * A filename that does not start with a number is treated as in scope rather
 * than silently skipped.
 */
export function isMigrationInScope(filename, floor = MIGRATION_FLOOR) {
  const match = /^(\d+)/.exec(filename);
  if (!match) return true;
  return Number(match[1]) >= floor;
}

/**
 * Decide the outcome given violations found and the superseded list. Pure and
 * dependency-free so the policy is testable on its own.
 *
 *  - `errors`: violations that must fail the build.
 *  - `stale`: superseded entries that no longer have any violation, meaning the
 *    entry is obsolete and should be deleted so the list stays honest.
 */
export function evaluate({ violations, superseded }) {
  const allowed = new Set(Object.keys(superseded));
  const errors = violations.filter((v) => !allowed.has(path.basename(v.file)));
  const hit = new Set(violations.map((v) => path.basename(v.file)));
  const stale = Object.keys(superseded).filter((f) => !hit.has(f));
  return { errors, stale };
}

function walkTs(dir, root) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkTs(full, root));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path.relative(root, full));
  }
  return out;
}

export function scan(root = process.cwd()) {
  const ts = TS_ROOTS.flatMap((dir) => walkTs(path.join(root, dir), root)).sort();
  const sqlDir = path.join(root, SQL_ROOT);
  const sql = !fs.existsSync(sqlDir)
    ? []
    : fs
        .readdirSync(sqlDir)
        .filter((f) => f.endsWith(".sql") && isMigrationInScope(f))
        .map((f) => path.join(SQL_ROOT, f))
        .sort();
  return { ts, sql };
}

function main() {
  const root = process.cwd();
  const { ts, sql } = scan(root);

  const violations = [
    ...ts.flatMap((f) => findViolations(fs.readFileSync(path.join(root, f), "utf8"), f, "ts")),
    ...sql.flatMap((f) => findViolations(fs.readFileSync(path.join(root, f), "utf8"), f, "sql")),
  ];

  const { errors, stale } = evaluate({ violations, superseded: SUPERSEDED });
  let failed = false;

  if (stale.length) {
    failed = true;
    console.error("lint-tenancy SUPERSEDED list is out of date — no violation found in:\n");
    for (const f of stale) console.error(`  ${f}`);
    console.error("\nRemove the entry from SUPERSEDED in scripts/lint-tenancy.mjs.\n");
  }

  if (errors.length) {
    failed = true;
    console.error(`Tenancy lint failed — ${errors.length} query/queries resolve a player's club through teams:\n`);
    for (const v of errors) console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    console.error(
      "\nRead players.club_id directly instead. It has been the authoritative tenancy\n" +
        "column since migration 0040, and team_id is intentionally optional — joining\n" +
        "through teams silently returns zero rows for every teamless client rather than\n" +
        "failing, so this bug reads as an empty club instead of an error.\n\n" +
        'Fetching one team\'s roster with .eq("team_id", ...) is fine and not flagged;\n' +
        "only deriving club membership through teams is.\n",
    );
  }

  if (failed) process.exit(1);

  console.log(`Tenancy lint passed — ${ts.length} source file(s) and ${sql.length} migration(s) scanned.`);
}

// Compare real paths rather than string-building a file:// URL. argv[1] is
// relative when npm runs `node scripts/lint-tenancy.mjs`, and import.meta.url
// percent-encodes characters like the space in this project's directory name,
// so the naive comparison silently never matches and main() never runs.
// import.meta.url is null once Jest transpiles this module to CJS, so it is
// checked before use rather than passed straight to fileURLToPath.
const entryUrl = import.meta.url;
const invokedDirectly =
  typeof entryUrl === "string" && Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(entryUrl);
if (invokedDirectly) main();
