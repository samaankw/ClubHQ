// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  // Must be last: turns off any stylistic ESLint rules that would otherwise
  // fight Prettier over formatting. Doesn't add rules of its own.
  prettierConfig,
  {
    ignores: [
      "dist/*",
      "coverage/*",
      "types/database.types.ts",
      // Deno edge functions: different runtime, different module resolution
      // (bare https:// imports), already excluded from tsconfig.json for the
      // same reason. Linted separately via `deno test`/Deno's own tooling,
      // not this ESLint config.
      "supabase/functions/**",
      // Python venv for the migration test harness (supabase/tests) -- not
      // part of the app, shouldn't be linted as one.
      ".venv/**",
    ],
  },
  {
    rules: {
      // Fires on every literal apostrophe/quote in JSX text -- with real
      // English copy throughout this app ("coach's", "don't", "child's"),
      // that's dozens of instances across ~20 files for a purely cosmetic
      // HTML-entity-escaping convention with no functional effect in React
      // Native (there's no HTML-injection risk this guards against here).
      // Off, not warn: this isn't a target to work toward, it's the wrong
      // rule for this codebase's actual prose-heavy JSX.
      "react/no-unescaped-entities": "off",

      // eslint-config-expo's current default includes React Compiler-era
      // hook rules that are considerably stricter than the traditional
      // rules-of-hooks/exhaustive-deps pair (still enabled, still errors
      // below). Every data-fetching screen in this app uses the same
      // "useEffect + async load() + setState" pattern these rules flag, so
      // enforcing them as hard errors today would mean rewriting ~20
      // screens' data-loading logic as a side effect of adding a linter --
      // exactly the unrelated mass churn a phase-scoped diff is supposed to
      // avoid. Downgraded to warn (visible, tracked, not blocking) rather
      // than silenced, since fixing this pattern for real is legitimate
      // future work, not a false positive.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);
