import fs from "node:fs";
import path from "node:path";

// Screens and shared components that are known to still contain raw values
// and have NOT yet been converted to the design system. Everything under
// `app/` and `components/` (excluding `theme/`) that is NOT listed here is
// linted by default — that is what closes the hole in the old allowlist
// design, where a converted file that nobody remembered to add to the list
// was silently never checked.
//
// This list can only shrink: `evaluate()` fails the build if a listed file
// turns out to have zero violations, forcing it to be removed here as each
// screen converts. Once the list is empty, every screen has been converted.
//
// Do not hand-edit this list by copying entries around — regenerate it by
// running the scan (see `scan()` below) and reading off the leftover dirty
// files.
export const PENDING = [
  "app/(tabs)/copilot.tsx",
  "app/club-management.tsx",
  "app/manage-drills.tsx",
  "app/pilot-metrics.tsx",
  "components/LegalTermsContent.tsx",
];

// Top-level trees to scan, and the directory name to skip everywhere inside
// them (tokens themselves are allowed to contain raw values).
const SCAN_ROOTS = ["app", "components"];
const EXCLUDED_DIR = "theme";

/**
 * Recursively list repo-relative `.ts`/`.tsx` paths under `dir` (an absolute
 * path), skipping any directory named `theme`.
 */
function walk(dir, root) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === EXCLUDED_DIR) continue;
      out = out.concat(walk(path.join(dir, entry.name), root));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.relative(root, path.join(dir, entry.name)));
    }
  }
  return out;
}

/**
 * Every `.ts`/`.tsx` file under `app/` and `components/`, excluding
 * `theme/`, as repo-relative paths. This is the "everything else" side of
 * the ratchet — PENDING should be derived from running this, not typed.
 */
export function scan(root = process.cwd()) {
  return SCAN_ROOTS.flatMap((dir) => walk(path.join(root, dir), root)).sort();
}

const RULES = [
  // Hex, rgb()/rgba(), and hsl()/hsla() are all raw color literals — hex was
  // the only shape originally caught here, which is exactly the hole the
  // rgba() scrim color went through undetected.
  { rule: "raw-color", re: /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/ },
  { rule: "raw-font-size", re: /fontSize:\s*\d/ },
  { rule: "raw-border-radius", re: /borderRadius:\s*\d/ },
  { rule: "raw-border-width", re: /borderWidth:\s*\d/ },
];

export function findViolations(source, file) {
  const out = [];
  source.split("\n").forEach((raw, i) => {
    const line = raw.replace(/(?<!:)\/\/.*$/, "");
    for (const { rule, re } of RULES) {
      if (re.test(line)) out.push({ file, line: i + 1, rule, text: raw.trim() });
    }
  });
  return out;
}

/**
 * Lint a fixed list of repo-relative paths, given a function to read each
 * one's source. Pure and dependency-injected so the scoping behaviour — only
 * files passed in are checked, nothing else — is unit-testable without
 * touching the filesystem.
 */
export function lintScoped(files, readFile) {
  return files.flatMap((f) => findViolations(readFile(f), f));
}

/**
 * The ratchet's decision logic, pure and dependency-free so it is testable
 * without touching the filesystem.
 *
 * `files` is a map of every scanned repo-relative path to its violation
 * count. `pending` is the known-dirty allowlist (PENDING).
 *
 * Returns:
 *  - `unexpected`: files NOT in `pending` that have violations — the hole
 *    the old CONVERTED allowlist let through. Fail and fix the violation.
 *  - `converted`: files IN `pending` that now have zero violations — they
 *    were converted but the list wasn't updated. Fail and remove them from
 *    PENDING.
 *  - `missing`: files IN `pending` that no longer exist in `files` at all
 *    (deleted, renamed, or moved). Fail and remove them from PENDING.
 */
export function evaluate({ files, pending }) {
  const pendingSet = new Set(pending);
  const unexpected = Object.keys(files).filter(
    (f) => !pendingSet.has(f) && files[f] > 0
  );
  const converted = pending.filter((f) => f in files && files[f] === 0);
  const missing = pending.filter((f) => !(f in files));
  return { unexpected, converted, missing };
}

function main() {
  const root = process.cwd();
  const scanned = scan(root);
  const files = {};
  for (const f of scanned) {
    files[f] = findViolations(fs.readFileSync(path.join(root, f), "utf8"), f).length;
  }

  const { unexpected, converted, missing } = evaluate({ files, pending: PENDING });
  let failed = false;

  if (missing.length) {
    failed = true;
    console.error(`lint-tokens PENDING list is out of date — file(s) no longer exist:\n`);
    for (const f of missing) console.error(`  ${f}`);
    console.error("Remove the deleted/renamed file(s) from PENDING in scripts/lint-tokens.mjs.\n");
  }

  if (converted.length) {
    failed = true;
    console.error(`lint-tokens PENDING list is stale — the following file(s) have no violations left:\n`);
    for (const f of converted) console.error(`  ${f}`);
    console.error(
      "They have already been converted to the design system. Remove them from PENDING in scripts/lint-tokens.mjs — the list can only shrink.\n"
    );
  }

  if (unexpected.length) {
    failed = true;
    const violations = unexpected.flatMap((f) =>
      findViolations(fs.readFileSync(path.join(root, f), "utf8"), f)
    );
    console.error(`Token lint failed — ${violations.length} raw value(s) in unconverted file(s):\n`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    console.error(
      "\nUse tokens from @/theme instead. If this file is intentionally not yet converted, add it to PENDING in scripts/lint-tokens.mjs.\n"
    );
  }

  if (failed) process.exit(1);

  console.log(
    `Token lint passed — ${scanned.length} file(s) scanned, ${PENDING.length} still pending conversion.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
