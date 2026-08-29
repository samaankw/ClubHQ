import fs from "node:fs";
import path from "node:path";

const SCAN_DIRS = ["app", "components"];
const EXEMPT = ["theme"];

const RULES = [
  { rule: "raw-color", re: /#[0-9a-fA-F]{3,8}\b/ },
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

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXEMPT.includes(e.name)) walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const violations = SCAN_DIRS.flatMap((d) =>
    walk(d).flatMap((f) => findViolations(fs.readFileSync(f, "utf8"), f))
  );
  if (violations.length) {
    console.error(`Token lint failed — ${violations.length} raw value(s) outside theme/:\n`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    console.error("\nUse tokens from @/theme instead.");
    process.exit(1);
  }
  console.log("Token lint passed — no raw design values outside theme/.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
