import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/club-management.tsx",
  "app/claim-player.tsx",
  "app/event/[id].tsx",
  "app/(auth)/reset-password.tsx",
  "supabase/migrations/0010_product_readiness.sql",
  "supabase/functions/delete-account/index.ts",
  "lib/notifications.ts",
  "eas.json",
  ".env.example",
];
const failures = [];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) failures.push(`Missing ${rel}`);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
// Match the SDK major version rather than a specific range prefix — Expo pins
// its own packages with "~" (e.g. "~57.0.17"), so asserting "^57" here failed
// on a correctly-configured project.
const expoRange = packageJson.dependencies?.expo ?? "";
const expoMajor = expoRange.match(/(\d+)\./)?.[1];
if (expoMajor !== "57") failures.push(`Expo SDK 57 dependency not configured (found "${expoRange || "nothing"}")`);
if (packageJson.dependencies?.["@react-native-voice/voice"]) failures.push("Deprecated @react-native-voice/voice is still installed");
if (!packageJson.dependencies?.["expo-speech-recognition"]) failures.push("expo-speech-recognition missing");

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", ".git"].includes(entry.name)) walk(full);
    else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(root);
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (/from\s+["']@react-native-voice\/voice["']|require\(["']@react-native-voice\/voice["']\)/.test(text)) failures.push(`Deprecated voice import remains in ${path.relative(root, file)}`);
}

if (failures.length) {
  console.error("ClubHQ static checks failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`ClubHQ static checks passed (${sourceFiles.length} source files scanned).`);
