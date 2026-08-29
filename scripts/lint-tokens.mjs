import fs from "node:fs";
import path from "node:path";

// Screens and shared components that have been converted to the design
// system. The linter only checks files listed here — see the design-system
// foundation plan. Scanning the whole `app/` and `components/` tree today
// would fail on ~600 pre-existing violations in the screens that haven't
// converted yet, which makes the guardrail unrunnable and easy to ignore.
//
// Add a path here as each additional screen/component converts. Once every
// screen is listed, this can go back to scanning app/ and components/
// wholesale (see git history for the previous walk()-based implementation).
export const CONVERTED = [
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/dashboard.tsx",
  "app/(tabs)/profile.tsx",
  "app/(tabs)/players.tsx",
  "app/(auth)/login.tsx",
  "app/(auth)/signup.tsx",
  "app/create-club.tsx",
  "components/ClubBioSection.tsx",
  "components/CoachesSection.tsx",
  "components/ui/Avatar.tsx",
  "components/ui/Badge.tsx",
  "components/ui/Button.tsx",
  "components/ui/Card.tsx",
  "components/ui/CardHeader.tsx",
  "components/ui/Chip.tsx",
  "components/ui/Divider.tsx",
  "components/ui/EmptyState.tsx",
  "components/ui/Field.tsx",
  "components/ui/IconChip.tsx",
  "components/ui/ListRow.tsx",
  "components/ui/ProgressBar.tsx",
  "components/ui/Screen.tsx",
  "components/ui/SegmentedControl.tsx",
  "components/ui/StatTile.tsx",
  "components/ui/StepDots.tsx",
  "components/ui/Text.tsx",
  "components/ui/Toggle.tsx",
];

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

function main() {
  const root = process.cwd();
  const files = CONVERTED.filter((f) => fs.existsSync(path.join(root, f)));
  const missing = CONVERTED.filter((f) => !files.includes(f));
  if (missing.length) {
    console.error(`lint-tokens CONVERTED list is out of date — missing file(s):\n`);
    for (const f of missing) console.error(`  ${f}`);
    process.exit(1);
  }

  const violations = lintScoped(files, (f) => fs.readFileSync(path.join(root, f), "utf8"));
  if (violations.length) {
    console.error(`Token lint failed — ${violations.length} raw value(s) in converted file(s):\n`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    console.error("\nUse tokens from @/theme instead.");
    process.exit(1);
  }
  console.log(`Token lint passed — ${files.length} converted file(s) clean.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
