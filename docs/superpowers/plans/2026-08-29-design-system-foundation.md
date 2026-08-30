# ClubHQ Design System — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the token layer, the token-drift linter, the UI component library, and convert the first screen (Dashboard, mockup 01) so the direction can be judged in a running app.

**Architecture:** Three token layers (`primitives` → `scales` → `tokens`) with components importing only the semantic `theme` surface. A single indirection means changing the brand ramp or the radius scale is a one-line edit that cascades to every screen. A lint script fails the build on any raw color, font size, or radius literal outside `theme/`, which is what stops the system rotting after this lands.

**Tech Stack:** TypeScript, React Native 0.86, Expo SDK 57, expo-router. Tests via `jest-expo@57.0.5` + `@testing-library/react-native@14.0.1` + `react-test-renderer@19.2.3` (all version-verified against this project's React 19.2.3).

**Spec:** `docs/superpowers/specs/2026-08-29-clubhq-design-system-design.md`

## Global Constraints

- Branch: `design/design-system`. Never commit to `main`.
- Node >= 22.13.0 (`package.json` engines).
- **No backend changes.** No migrations, no edge functions, no schema edits.
- **No navigation restructuring.** The six tabs in `app/(tabs)/_layout.tsx` stay registered exactly as they are; only the tab bar's appearance changes.
- **Brand color is `#0066FF`**, one blue. The `#2563EB` seen in mockups is the same intent and must not become a second token.
- Components import from `@/theme` only — never from `@/theme/primitives` or `@/theme/scales` directly.
- No custom fonts. Type tokens set `fontSize`, `lineHeight`, `fontWeight` only — never `fontFamily`.
- Only `theme/` is exempt from the token linter. `components/ui/` is held to the same rule.
- Every task ends with a commit.
- **Preserve FlatList/SectionList performance props.** Commit `191aa8a` on `main` ("Tune FlatList/SectionList rendering across the app") deliberately set `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`, and `keyExtractor` across 8 screens: `(tabs)/players.tsx`, `(tabs)/schedule.tsx`, `(tabs)/messages.tsx`, `(tabs)/copilot.tsx`, `manage-drills.tsx`, `conversation/[id].tsx`, `modals/new-conversation.tsx`, `modals/search-messages.tsx`. A visual reskin can silently drop these and regress scroll performance with no test or lint catching it. Any task touching those files must keep every such prop byte-identical, and verify with:
  `git diff -- <file> | grep "^-" | grep -E "initialNumToRender|maxToRenderPerBatch|windowSize|removeClippedSubviews|keyExtractor"` — expected empty.
- **RNTL 14.0.1 is async.** `render()` returns `Promise<...>` and `fireEvent.press()` must be awaited — verified against the installed `dist/render.d.ts`. The test code shown in Tasks 5–12 below was written against the older synchronous v13 API and **will fail verbatim**. Adapt every test body: make it `async`, and `await` both `render(...)` and `fireEvent...(...)`. Change nothing else — assertions, expected values, and component code stay exactly as written.

---

## File Structure

**Created:**
- `theme/primitives.ts` — raw color ramps. No semantics.
- `theme/scales.ts` — the three radius scale variants.
- `theme/tokens.ts` — semantic tokens; holds the two exploration levers.
- `theme/index.ts` — public surface. The only module components import.
- `scripts/lint-tokens.mjs` — drift linter, exports a pure `findViolations` for testing.
- `components/ui/*.tsx` — one file per component family.
- `components/ui/index.ts` — barrel export.
- `__tests__/**` — colocated by subject.

**Modified:**
- `package.json` — test deps, `test` and `lint:tokens` scripts, `verify` chain.
- `app/(tabs)/_layout.tsx` — tab bar appearance only.
- `app/(tabs)/dashboard.tsx` — first screen conversion.

---

### Task 1: Test infrastructure

The repo has zero tests. Nothing else in this plan can be TDD'd until `npm test` runs.

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`; every later task depends on it.

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev jest-expo@57.0.5 @testing-library/react-native@14.0.1 react-test-renderer@19.2.3 jest@29.7.0
```

- [ ] **Step 2: Create the Jest config**

Create `jest.config.js`:

Note: do NOT add `setupFilesAfterEnv`. RNTL 14.0.1 has no `extend-expect`
subpath (it ships `matchers.js`), and Jest fails to start if you reference it.
No test in this plan uses an RNTL-specific matcher — only built-in Jest
matchers — so no setup file is needed.

```js
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))",
  ],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
};
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Write the smoke test**

Create `__tests__/smoke.test.ts`:

```ts
describe("test infrastructure", () => {
  it("runs typescript tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and verify it passes**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js __tests__/smoke.test.ts
git commit -m "Add Jest test infrastructure

The repo had no test runner, so nothing could be test-driven. jest-expo
57.0.5 matches the SDK; RNTL 14.0.1 and react-test-renderer 19.2.3 match
React 19.2.3."
```

---

### Task 2: Token drift linter

Built before the tokens so the rule exists before there is anything to break it.

**Files:**
- Create: `scripts/lint-tokens.mjs`
- Create: `__tests__/lint-tokens.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `findViolations(source: string, file: string): Violation[]` where `Violation = { file: string; line: number; rule: string; text: string }`. Exported from `scripts/lint-tokens.mjs`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lint-tokens.test.ts`:

```ts
import { findViolations } from "../scripts/lint-tokens.mjs";

describe("findViolations", () => {
  it("flags a raw hex color", () => {
    const v = findViolations('const s = { color: "#0066FF" };', "app/x.tsx");
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("raw-color");
    expect(v[0].line).toBe(1);
  });

  it("flags a raw fontSize", () => {
    const v = findViolations("const s = { fontSize: 14 };", "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-font-size"]);
  });

  it("flags a raw borderRadius", () => {
    const v = findViolations("const s = { borderRadius: 10 };", "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-border-radius"]);
  });

  it("allows token references", () => {
    const src = "const s = { fontSize: type.body.fontSize, borderRadius: radius.card };";
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  it("reports the correct line number", () => {
    const v = findViolations('a\nb\nconst c = "#FFFFFF";', "app/x.tsx");
    expect(v[0].line).toBe(3);
  });

  it("ignores hex inside a line comment", () => {
    const v = findViolations('// was #0066FF before tokens', "app/x.tsx");
    expect(v).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lint-tokens`
Expected: FAIL — cannot find module `../scripts/lint-tokens.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lint-tokens.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

const SCAN_DIRS = ["app", "components"];
const EXEMPT = ["theme"];

const RULES = [
  { rule: "raw-color", re: /#[0-9a-fA-F]{3,8}\b/ },
  { rule: "raw-font-size", re: /fontSize:\s*\d/ },
  { rule: "raw-border-radius", re: /borderRadius:\s*\d/ },
];

export function findViolations(source, file) {
  const out = [];
  source.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "");
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lint-tokens`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the script (not yet wired into `verify`)**

In `package.json` scripts add:

```json
"lint:tokens": "node scripts/lint-tokens.mjs"
```

It will fail against the current codebase — that is expected and correct, since 563 raw values exist. It gets wired into `verify` in Task 14, once the dashboard is converted.

- [ ] **Step 6: Commit**

```bash
git add scripts/lint-tokens.mjs __tests__/lint-tokens.test.ts package.json
git commit -m "Add token drift linter

Fails on raw hex colors, fontSize, and borderRadius outside theme/.
components/ui/ is deliberately NOT exempt — primitives that hardcode
values are how a token system rots from the inside."
```

---

### Task 3: Color primitives and radius scales

**Files:**
- Create: `theme/primitives.ts`
- Create: `theme/scales.ts`
- Create: `__tests__/theme/primitives.test.ts`

**Interfaces:**
- Produces: `palette` (nested color ramps) and `radiusScales` (`sharp` | `rounded` | `soft`, each with `xs, sm, md, lg, xl, xxl, full`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/theme/primitives.test.ts`:

```ts
import { palette } from "../../theme/primitives";
import { radiusScales } from "../../theme/scales";

describe("palette", () => {
  it("uses the confirmed single brand blue", () => {
    expect(palette.brand[500]).toBe("#0066FF");
  });

  it("uses the slate ramp measured from the mockups", () => {
    expect(palette.slate[50]).toBe("#F8FAFC");
    expect(palette.slate[900]).toBe("#0F172A");
    expect(palette.slate[200]).toBe("#E2E8F0");
    expect(palette.slate[600]).toBe("#475569");
  });

  it("every color is a 6-digit uppercase hex", () => {
    const walk = (o: object): string[] =>
      Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : walk(v)));
    for (const c of walk(palette)) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("radiusScales", () => {
  it("offers three variants with identical keys", () => {
    const keys = Object.keys(radiusScales.rounded).sort();
    expect(Object.keys(radiusScales.sharp).sort()).toEqual(keys);
    expect(Object.keys(radiusScales.soft).sort()).toEqual(keys);
  });

  it("orders each scale monotonically", () => {
    for (const s of Object.values(radiusScales)) {
      expect(s.xs).toBeLessThan(s.sm);
      expect(s.sm).toBeLessThan(s.md);
      expect(s.md).toBeLessThan(s.lg);
      expect(s.lg).toBeLessThan(s.xl);
      expect(s.xl).toBeLessThan(s.xxl);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- primitives`
Expected: FAIL — cannot find module `theme/primitives`.

- [ ] **Step 3: Write `theme/primitives.ts`**

```ts
// Raw color ramps. No semantics — nothing here says what a color is FOR.
// Values measured by decoding the 14 mockup PNGs and running a color census
// over 1,396,088 sampled pixels; the design sits on Tailwind's slate/green/
// orange/red ramps plus one custom brand blue.
//
// Never import this module outside theme/. Components use @/theme.

export const palette = {
  white: "#FFFFFF",
  black: "#000000",

  slate: {
    50: "#F8FAFC",  // page background — 29.7% of all mockup pixels
    100: "#F1F5F9",
    200: "#E2E8F0", // borders
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569", // secondary text
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A", // dark spotlight surfaces + primary text
  },

  // #0066FF is the brand blue. The #2563EB also present in the mockups was
  // confirmed to be the same intent, not a second color — do not reintroduce it.
  brand: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#3B82F6",
    500: "#0066FF",
    600: "#0052CC",
    700: "#003D99",
  },

  green: { 50: "#F0FDF4", 500: "#22C55E", 600: "#16A34A" },
  orange: { 50: "#FFF7ED", 500: "#F97316", 600: "#EA580C" },
  amber: { 50: "#FFFBEB", 500: "#F59E0B" },
  red: { 50: "#FEF2F2", 500: "#EF4444", 600: "#DC2626" },
  purple: { 50: "#FAF5FF", 500: "#A855F7", 600: "#9333EA" },
} as const;
```

- [ ] **Step 4: Write `theme/scales.ts`**

```ts
// Three pre-authored corner-radius scales. Exactly one is active, selected in
// theme/tokens.ts. Swapping the active scale restyles every screen in one edit;
// `git checkout theme/` is the undo.

export const radiusScales = {
  sharp:   { xs: 2, sm: 4,  md: 6,  lg: 8,  xl: 10, xxl: 12, full: 999 },
  rounded: { xs: 6, sm: 8,  md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
  soft:    { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, full: 999 },
} as const;

export type RadiusScale = (typeof radiusScales)[keyof typeof radiusScales];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- primitives`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add theme/primitives.ts theme/scales.ts __tests__/theme/primitives.test.ts
git commit -m "Add color primitives and radius scales

Palette measured from the mockups rather than eyeballed. Three radius
scales so corner style is a one-line experiment."
```

---

### Task 4: Semantic tokens and public API

**Files:**
- Create: `theme/tokens.ts`
- Create: `theme/index.ts`
- Create: `__tests__/theme/tokens.test.ts`

**Interfaces:**
- Produces, all exported from `@/theme`:
  - `color.bg.{page,surface,sunken,spotlight,brand,brandSubtle,successSubtle,warningSubtle,dangerSubtle}`
  - `color.text.{primary,secondary,tertiary,inverse,brand,success,warning,danger,onSpotlight,onSpotlightMuted}`
  - `color.border.{subtle,default,brand}`
  - `color.icon.{default,muted,brand,inverse,success,warning,danger}`
  - `space: readonly number[]` (index 0–10)
  - `radius.{xs,sm,md,lg,xl,xxl,full,card,button,chip,tile,input,sheet}`
  - `type.{display,h1,h2,h3,body,bodySm,label,eyebrow,caption}`
  - `elevation.{none,card,raised,overlay}`

- [ ] **Step 1: Write the failing test**

Create `__tests__/theme/tokens.test.ts`:

```ts
import { color, space, radius, type, elevation } from "../../theme";
import { palette } from "../../theme/primitives";

describe("semantic color", () => {
  it("maps page background to slate 50", () => {
    expect(color.bg.page).toBe(palette.slate[50]);
  });
  it("maps brand surfaces to the brand ramp", () => {
    expect(color.bg.brand).toBe(palette.brand[500]);
    expect(color.text.brand).toBe(palette.brand[500]);
  });
  it("uses white text on spotlight surfaces", () => {
    expect(color.bg.spotlight).toBe(palette.slate[900]);
    expect(color.text.onSpotlight).toBe(palette.white);
  });
});

describe("space", () => {
  it("is a 4pt scale", () => {
    expect(space[0]).toBe(0);
    expect(space[1]).toBe(4);
    expect(space[4]).toBe(16);
    expect(space[10]).toBe(64);
  });
});

describe("radius", () => {
  it("exposes semantic aliases derived from the active scale", () => {
    expect(radius.card).toBe(radius.lg);
    expect(radius.button).toBe(radius.md);
    expect(radius.chip).toBe(radius.full);
  });
});

describe("type", () => {
  it("defines nine roles", () => {
    expect(Object.keys(type)).toHaveLength(9);
  });
  it("makes eyebrow uppercase and letterspaced", () => {
    expect(type.eyebrow.textTransform).toBe("uppercase");
    expect(type.eyebrow.letterSpacing).toBeGreaterThan(0);
  });
  it("never sets a font family", () => {
    for (const role of Object.values(type)) {
      expect(role).not.toHaveProperty("fontFamily");
    }
  });
});

describe("elevation", () => {
  it("sets both iOS shadow and Android elevation", () => {
    expect(elevation.card.shadowRadius).toBeGreaterThan(0);
    expect(elevation.card.elevation).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tokens`
Expected: FAIL — cannot find module `theme`.

- [ ] **Step 3: Write `theme/tokens.ts`**

```ts
import { palette } from "./primitives";
import { radiusScales } from "./scales";

// ═══════════════════════════════════════════════════════════════
// THE TWO EXPLORATION LEVERS
// Change either line, reload, and every screen restyles.
// `git checkout theme/` reverts.
// ═══════════════════════════════════════════════════════════════
const brand = palette.brand;                // try: palette.purple
const activeRadius = radiusScales.rounded;  // try: radiusScales.sharp
// ═══════════════════════════════════════════════════════════════

export const color = {
  bg: {
    page: palette.slate[50],
    surface: palette.white,
    sunken: palette.slate[100],
    spotlight: palette.slate[900],
    brand: brand[500],
    brandSubtle: brand[50],
    successSubtle: palette.green[50],
    warningSubtle: palette.orange[50],
    dangerSubtle: palette.red[50],
  },
  text: {
    primary: palette.slate[900],
    secondary: palette.slate[600],
    tertiary: palette.slate[400],
    inverse: palette.white,
    brand: brand[500],
    success: palette.green[600],
    warning: palette.orange[600],
    danger: palette.red[600],
    onSpotlight: palette.white,
    onSpotlightMuted: palette.slate[400],
  },
  border: {
    subtle: palette.slate[200],
    default: palette.slate[300],
    brand: brand[500],
  },
  icon: {
    default: palette.slate[600],
    muted: palette.slate[400],
    brand: brand[500],
    inverse: palette.white,
    success: palette.green[600],
    warning: palette.orange[500],
    danger: palette.red[600],
  },
} as const;

/** 4pt spacing scale. space[4] === 16 is the default gutter. */
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const radius = {
  ...activeRadius,
  card: activeRadius.lg,
  button: activeRadius.md,
  chip: activeRadius.full,
  tile: activeRadius.md,
  input: activeRadius.md,
  sheet: activeRadius.xl,
} as const;

// No fontFamily anywhere: the app ships no custom fonts, so every role
// inherits the platform system face.
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  h2: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  h3: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 16, fontWeight: "500" },
  // The signature of this design language.
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "400" },
} as const;

// RN does not unify iOS and Android shadows, so each level sets both.
// These live here rather than being allowlisted in the linter, because
// rgba shadow values are design decisions like any other.
export const elevation = {
  none: {},
  card: {
    shadowColor: palette.slate[900],
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: palette.slate[900],
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  overlay: {
    shadowColor: palette.slate[900],
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
} as const;
```

- [ ] **Step 4: Write `theme/index.ts`**

```ts
// The only theme module components may import.
export { color, space, radius, type, elevation } from "./tokens";
export type { RadiusScale } from "./scales";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tokens`
Expected: PASS, 9 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (A pre-existing `TS5101 baseUrl` warning is unrelated.)

- [ ] **Step 7: Commit**

```bash
git add theme/tokens.ts theme/index.ts __tests__/theme/tokens.test.ts
git commit -m "Add semantic design tokens

Collapses 47 colors to 24 semantic tokens, 19 font sizes to 9 roles,
and 19 border radii to one 6-step scale. Brand ramp and radius scale
are single-line levers at the top of tokens.ts."
```

---

### Task 5: Text and Eyebrow

**Files:**
- Create: `components/ui/Text.tsx`
- Create: `__tests__/ui/Text.test.tsx`

**Interfaces:**
- Consumes: `color`, `type` from `@/theme`.
- Produces:
  - `Text({ role?: TextRole, tone?: TextTone, ...RNTextProps })` — `TextRole = keyof typeof type`, `TextTone = keyof typeof color.text`. Defaults `role="body"`, `tone="primary"`.
  - `Eyebrow({ tone?: TextTone, ...RNTextProps })` — `Text` locked to `role="eyebrow"`, default `tone="tertiary"`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Text.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { Text, Eyebrow } from "../../components/ui/Text";
import { color, type } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Text", () => {
  it("defaults to body role and primary tone", () => {
    const { getByText } = render(<Text>hello</Text>);
    const s = flat(getByText("hello").props.style);
    expect(s.fontSize).toBe(type.body.fontSize);
    expect(s.color).toBe(color.text.primary);
  });

  it("applies the requested role", () => {
    const { getByText } = render(<Text role="h1">title</Text>);
    expect(flat(getByText("title").props.style).fontSize).toBe(type.h1.fontSize);
  });

  it("applies the requested tone", () => {
    const { getByText } = render(<Text tone="brand">link</Text>);
    expect(flat(getByText("link").props.style).color).toBe(color.text.brand);
  });

  it("lets a style prop override", () => {
    const { getByText } = render(<Text style={{ opacity: 0.5 }}>x</Text>);
    expect(flat(getByText("x").props.style).opacity).toBe(0.5);
  });
});

describe("Eyebrow", () => {
  it("is uppercase and letterspaced", () => {
    const { getByText } = render(<Eyebrow>getting started</Eyebrow>);
    const s = flat(getByText("getting started").props.style);
    expect(s.textTransform).toBe("uppercase");
    expect(s.letterSpacing).toBe(type.eyebrow.letterSpacing);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Text`
Expected: FAIL — cannot find module `components/ui/Text`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/Text.tsx`:

```tsx
import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { color, type as typeTokens } from "@/theme";

export type TextRole = keyof typeof typeTokens;
export type TextTone = keyof typeof color.text;

export interface TextProps extends RNTextProps {
  role?: TextRole;
  tone?: TextTone;
}

/**
 * The only text primitive. Takes a semantic role rather than a font size, so
 * there is no way to introduce a 20th type size by accident.
 */
export function Text({ role = "body", tone = "primary", style, ...rest }: TextProps) {
  return <RNText style={[typeTokens[role], { color: color.text[tone] }, style]} {...rest} />;
}

/** Uppercase letterspaced section kicker — the signature label of this design. */
export function Eyebrow({ tone = "tertiary", ...rest }: Omit<TextProps, "role">) {
  return <Text role="eyebrow" tone={tone} {...rest} />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Text`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Text.tsx __tests__/ui/Text.test.tsx
git commit -m "Add Text and Eyebrow primitives

Text takes a semantic role, never a raw fontSize."
```

---

### Task 6: Button

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `__tests__/ui/Button.test.tsx`

**Interfaces:**
- Consumes: `Text` from `components/ui/Text`; `color`, `space`, `radius` from `@/theme`.
- Produces: `Button({ label: string, onPress?: () => void, variant?: "primary"|"secondary"|"ghost"|"danger", size?: "sm"|"md"|"lg", fullWidth?: boolean, disabled?: boolean, left?: React.ReactNode })`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Button.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "../../components/ui/Button";
import { color, radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Button", () => {
  it("renders a primary button on the brand color", () => {
    const { getByRole } = render(<Button label="Go" />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.brand);
  });

  it("uses the button radius token", () => {
    const { getByRole } = render(<Button label="Go" />);
    expect(flat(getByRole("button").props.style).borderRadius).toBe(radius.button);
  });

  it("renders secondary on a surface with a border", () => {
    const { getByRole } = render(<Button label="Go" variant="secondary" />);
    const s = flat(getByRole("button").props.style);
    expect(s.backgroundColor).toBe(color.bg.surface);
    expect(s.borderColor).toBe(color.border.subtle);
  });

  it("calls onPress", () => {
    const fn = jest.fn();
    const { getByRole } = render(<Button label="Go" onPress={fn} />);
    fireEvent.press(getByRole("button"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const fn = jest.fn();
    const { getByRole } = render(<Button label="Go" onPress={fn} disabled />);
    fireEvent.press(getByRole("button"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("is accessible by its label", () => {
    const { getByLabelText } = render(<Button label="Publish to Parent" />);
    expect(getByLabelText("Publish to Parent")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Button`
Expected: FAIL — cannot find module `components/ui/Button`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/Button.tsx`:

```tsx
import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import { Text, TextTone } from "./Text";
import { color, space, radius } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  left?: React.ReactNode;
}

const SURFACE: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.bg.brand },
  secondary: { backgroundColor: color.bg.surface, borderWidth: 1, borderColor: color.border.subtle },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: color.bg.dangerSubtle },
};

const TONE: Record<ButtonVariant, TextTone> = {
  primary: "inverse",
  secondary: "primary",
  ghost: "brand",
  danger: "danger",
};

const PAD: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
  sm: { paddingVertical: space[2], paddingHorizontal: space[3] },
  md: { paddingVertical: space[3], paddingHorizontal: space[4] },
  lg: { paddingVertical: space[4], paddingHorizontal: space[5] },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  fullWidth,
  disabled,
  left,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        PAD[size],
        SURFACE[variant],
        fullWidth && styles.fullWidth,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {left}
      <Text role="h3" tone={TONE[variant]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.button,
  },
  fullWidth: { alignSelf: "stretch" },
  dimmed: { opacity: 0.6 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Button`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Button.tsx __tests__/ui/Button.test.tsx
git commit -m "Add Button with four variants and three sizes"
```

---

### Task 7: Card, SpotlightCard, AICard

**Files:**
- Create: `components/ui/Card.tsx`
- Create: `__tests__/ui/Card.test.tsx`

**Interfaces:**
- Produces:
  - `Card({ children, padded?: boolean, style? })` — white surface, `radius.card`, `elevation.card`. `padded` defaults `true`.
  - `SpotlightCard({ children, style? })` — `color.bg.spotlight`.
  - `AICard({ children, style? })` — `color.bg.brand`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Card.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { Card, SpotlightCard, AICard } from "../../components/ui/Card";
import { Text } from "../../components/ui/Text";
import { color, radius, space } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));
const styleOf = (t: ReturnType<typeof render>, id: string) =>
  flat(t.getByTestId(id).props.style);

describe("Card", () => {
  it("is a white surface with the card radius", () => {
    const t = render(<Card testID="c"><Text>x</Text></Card>);
    const s = styleOf(t, "c");
    expect(s.backgroundColor).toBe(color.bg.surface);
    expect(s.borderRadius).toBe(radius.card);
  });

  it("pads by default and can be unpadded", () => {
    expect(styleOf(render(<Card testID="c"><Text>x</Text></Card>), "c").padding).toBe(space[4]);
    expect(styleOf(render(<Card testID="c" padded={false}><Text>x</Text></Card>), "c").padding).toBeUndefined();
  });

  it("renders its children", () => {
    const { getByText } = render(<Card><Text>inside</Text></Card>);
    expect(getByText("inside")).toBeTruthy();
  });
});

describe("SpotlightCard", () => {
  it("uses the dark spotlight surface", () => {
    const t = render(<SpotlightCard testID="s"><Text>x</Text></SpotlightCard>);
    expect(styleOf(t, "s").backgroundColor).toBe(color.bg.spotlight);
  });
});

describe("AICard", () => {
  it("uses the brand surface", () => {
    const t = render(<AICard testID="a"><Text>x</Text></AICard>);
    expect(styleOf(t, "a").backgroundColor).toBe(color.bg.brand);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Card`
Expected: FAIL — cannot find module `components/ui/Card`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/Card.tsx`:

```tsx
import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { color, radius, space, elevation } from "@/theme";

export interface CardProps extends ViewProps {
  padded?: boolean;
}

/** Default content container: white, rounded, softly raised off the page. */
export function Card({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.surface, padded && styles.pad, style]} {...rest} />;
}

/** Dark navy emphasis card — club access code, director's analysis. */
export function SpotlightCard({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.spotlight, padded && styles.pad, style]} {...rest} />;
}

/** Brand-blue card reserved for AI-generated content. */
export function AICard({ padded = true, style, ...rest }: CardProps) {
  return <View style={[styles.base, styles.ai, padded && styles.pad, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.card, overflow: "hidden" },
  surface: { backgroundColor: color.bg.surface, ...elevation.card },
  spotlight: { backgroundColor: color.bg.spotlight },
  ai: { backgroundColor: color.bg.brand },
  pad: { padding: space[4] },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Card`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Card.tsx __tests__/ui/Card.test.tsx
git commit -m "Add Card, SpotlightCard, and AICard surfaces"
```

---

### Task 8: IconChip and StatTile

**Files:**
- Create: `components/ui/IconChip.tsx`
- Create: `components/ui/StatTile.tsx`
- Create: `__tests__/ui/StatTile.test.tsx`

**Interfaces:**
- Consumes: `Card`, `Text`, `Eyebrow`; `@expo/vector-icons` `Ionicons` (already a dependency).
- Produces:
  - `IconChip({ name: keyof typeof Ionicons.glyphMap, tone?: "brand"|"success"|"warning"|"danger", size?: number })` — tinted rounded square holding a colored glyph.
  - `StatTile({ label: string, value: string, tone?: TextTone, icon?: IconName, footnote?: string })`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/StatTile.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { IconChip } from "../../components/ui/IconChip";
import { StatTile } from "../../components/ui/StatTile";
import { color, radius, type } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("IconChip", () => {
  it("tints its background from the requested tone", () => {
    const { getByTestId } = render(<IconChip testID="chip" name="football" tone="brand" />);
    expect(flat(getByTestId("chip").props.style).backgroundColor).toBe(color.bg.brandSubtle);
  });

  it("uses the tile radius", () => {
    const { getByTestId } = render(<IconChip testID="chip" name="football" />);
    expect(flat(getByTestId("chip").props.style).borderRadius).toBe(radius.tile);
  });
});

describe("StatTile", () => {
  it("renders an uppercase label above a display-size value", () => {
    const { getByText } = render(<StatTile label="Goals" value="8" />);
    expect(flat(getByText("Goals").props.style).textTransform).toBe("uppercase");
    expect(flat(getByText("8").props.style).fontSize).toBe(type.display.fontSize);
  });

  it("renders an optional footnote", () => {
    const { getByText } = render(<StatTile label="Rating" value="7.8" footnote="Last 10" />);
    expect(getByText("Last 10")).toBeTruthy();
  });

  it("tones the value", () => {
    const { getByText } = render(<StatTile label="Rating" value="7.8" tone="brand" />);
    expect(flat(getByText("7.8").props.style).color).toBe(color.text.brand);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- StatTile`
Expected: FAIL — cannot find module `components/ui/IconChip`.

- [ ] **Step 3: Write `components/ui/IconChip.tsx`**

```tsx
import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space } from "@/theme";

export type IconName = keyof typeof Ionicons.glyphMap;
export type ChipTone = "brand" | "success" | "warning" | "danger";

export interface IconChipProps extends ViewProps {
  name: IconName;
  tone?: ChipTone;
  size?: number;
}

const BG: Record<ChipTone, string> = {
  brand: color.bg.brandSubtle,
  success: color.bg.successSubtle,
  warning: color.bg.warningSubtle,
  danger: color.bg.dangerSubtle,
};

const FG: Record<ChipTone, string> = {
  brand: color.icon.brand,
  success: color.icon.success,
  warning: color.icon.warning,
  danger: color.icon.danger,
};

/** Tinted rounded square holding a colored glyph — used across every screen. */
export function IconChip({ name, tone = "brand", size = 18, style, ...rest }: IconChipProps) {
  return (
    <View style={[styles.base, { backgroundColor: BG[tone] }, style]} {...rest}>
      <Ionicons name={name} size={size} color={FG[tone]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: space[8],
    height: space[8],
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

- [ ] **Step 4: Write `components/ui/StatTile.tsx`**

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Card } from "./Card";
import { Text, Eyebrow, TextTone } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { space } from "@/theme";

export interface StatTileProps {
  label: string;
  value: string;
  tone?: TextTone;
  icon?: IconName;
  footnote?: string;
}

/** Label-over-big-number tile. Two per row across the mockups. */
export function StatTile({ label, value, tone = "primary", icon, footnote }: StatTileProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        {icon ? <IconChip name={icon} size={14} /> : null}
        <Eyebrow>{label}</Eyebrow>
      </View>
      <Text role="display" tone={tone}>
        {value}
      </Text>
      {footnote ? (
        <Text role="caption" tone="tertiary">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space[1] },
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- StatTile`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add components/ui/IconChip.tsx components/ui/StatTile.tsx __tests__/ui/StatTile.test.tsx
git commit -m "Add IconChip and StatTile"
```

---

### Task 9: Chip, FilterChipRow, SegmentedControl

**Files:**
- Create: `components/ui/Chip.tsx`
- Create: `components/ui/SegmentedControl.tsx`
- Create: `__tests__/ui/Chip.test.tsx`

**Interfaces:**
- Produces:
  - `Chip({ label: string, selected?: boolean, onPress?: () => void })`
  - `FilterChipRow({ options: string[], value: string, onChange: (v: string) => void })` — horizontal scroller.
  - `SegmentedControl({ options: string[], value: string, onChange: (v: string) => void })`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Chip.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Chip, FilterChipRow } from "../../components/ui/Chip";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { color, radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Chip", () => {
  it("is fully rounded", () => {
    const { getByRole } = render(<Chip label="All" />);
    expect(flat(getByRole("button").props.style).borderRadius).toBe(radius.chip);
  });

  it("fills with the spotlight color when selected", () => {
    const { getByRole } = render(<Chip label="All" selected />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.spotlight);
  });

  it("sits on a plain surface when unselected", () => {
    const { getByRole } = render(<Chip label="All" />);
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(color.bg.surface);
  });
});

describe("FilterChipRow", () => {
  it("reports the chosen option", () => {
    const fn = jest.fn();
    const { getByLabelText } = render(
      <FilterChipRow options={["All", "Weather"]} value="All" onChange={fn} />
    );
    fireEvent.press(getByLabelText("Weather"));
    expect(fn).toHaveBeenCalledWith("Weather");
  });
});

describe("SegmentedControl", () => {
  it("marks the active segment as selected", () => {
    const { getByLabelText } = render(
      <SegmentedControl options={["Events", "Announcements"]} value="Events" onChange={() => {}} />
    );
    expect(getByLabelText("Events").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Announcements").props.accessibilityState.selected).toBe(false);
  });

  it("reports a segment change", () => {
    const fn = jest.fn();
    const { getByLabelText } = render(
      <SegmentedControl options={["Events", "Announcements"]} value="Events" onChange={fn} />
    );
    fireEvent.press(getByLabelText("Announcements"));
    expect(fn).toHaveBeenCalledWith("Announcements");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Chip`
Expected: FAIL — cannot find module `components/ui/Chip`.

- [ ] **Step 3: Write `components/ui/Chip.tsx`**

```tsx
import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius, space } from "@/theme";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text role="label" tone={selected ? "inverse" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface FilterChipRowProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Horizontally scrolling filter row — announcements, drill library. */
export function FilterChipRow({ options, value, onChange }: FilterChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  on: { backgroundColor: color.bg.spotlight, borderColor: color.bg.spotlight },
  off: { backgroundColor: color.bg.surface, borderColor: color.border.subtle },
  row: { gap: space[2], paddingHorizontal: space[4] },
});
```

- [ ] **Step 4: Write `components/ui/SegmentedControl.tsx`**

```tsx
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius, space } from "@/theme";

export interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Two-up switch — Events / Announcements on the Schedule tab. */
export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityLabel={o}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            style={[styles.segment, active && styles.active]}
          >
            <Text role="h3" tone={active ? "brand" : "secondary"}>
              {o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: color.bg.sunken,
    borderRadius: radius.md,
    padding: space[1],
    gap: space[1],
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space[2],
    borderRadius: radius.sm,
  },
  active: { backgroundColor: color.bg.surface },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- Chip`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Chip.tsx components/ui/SegmentedControl.tsx __tests__/ui/Chip.test.tsx
git commit -m "Add Chip, FilterChipRow, and SegmentedControl"
```

---

### Task 10: ProgressBar, Badge, Avatar, Divider

**Files:**
- Create: `components/ui/ProgressBar.tsx`
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Avatar.tsx`
- Create: `components/ui/Divider.tsx`
- Create: `__tests__/ui/Indicators.test.tsx`

**Interfaces:**
- Produces:
  - `ProgressBar({ value: number })` — `value` clamped to 0–1.
  - `Badge({ label: string, tone?: "brand"|"success"|"warning"|"danger"|"neutral" })`
  - `Avatar({ uri?: string, name: string, size?: number })` — initials fallback when `uri` is absent.
  - `Divider()`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Indicators.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Badge } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("ProgressBar", () => {
  it("expresses progress as a percentage width", () => {
    const { getByTestId } = render(<ProgressBar value={0.6} />);
    expect(flat(getByTestId("progress-fill").props.style).width).toBe("60%");
  });

  it("clamps out-of-range values", () => {
    expect(flat(render(<ProgressBar value={2} />).getByTestId("progress-fill").props.style).width).toBe("100%");
    expect(flat(render(<ProgressBar value={-1} />).getByTestId("progress-fill").props.style).width).toBe("0%");
  });

  it("fills with the brand color", () => {
    const { getByTestId } = render(<ProgressBar value={0.5} />);
    expect(flat(getByTestId("progress-fill").props.style).backgroundColor).toBe(color.bg.brand);
  });
});

describe("Badge", () => {
  it("tints from its tone", () => {
    const { getByTestId } = render(<Badge testID="b" label="2 New" tone="brand" />);
    expect(flat(getByTestId("b").props.style).backgroundColor).toBe(color.bg.brandSubtle);
  });
});

describe("Avatar", () => {
  it("falls back to initials without an image", () => {
    const { getByText } = render(<Avatar name="Kayla Henderson" />);
    expect(getByText("KH")).toBeTruthy();
  });

  it("handles a single-word name", () => {
    const { getByText } = render(<Avatar name="Marcus" />);
    expect(getByText("M")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Indicators`
Expected: FAIL — cannot find module `components/ui/ProgressBar`.

- [ ] **Step 3: Write `components/ui/ProgressBar.tsx`**

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { color, radius, space } from "@/theme";

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped. */
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track}>
      <View testID="progress-fill" style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: space[2],
    backgroundColor: color.bg.sunken,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.bg.brand, borderRadius: radius.full },
});
```

- [ ] **Step 4: Write `components/ui/Badge.tsx`**

```tsx
import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { Text, TextTone } from "./Text";
import { color, radius, space } from "@/theme";

export type BadgeTone = "brand" | "success" | "warning" | "danger" | "neutral";

export interface BadgeProps extends ViewProps {
  label: string;
  tone?: BadgeTone;
}

const BG: Record<BadgeTone, string> = {
  brand: color.bg.brandSubtle,
  success: color.bg.successSubtle,
  warning: color.bg.warningSubtle,
  danger: color.bg.dangerSubtle,
  neutral: color.bg.sunken,
};

const FG: Record<BadgeTone, TextTone> = {
  brand: "brand",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "secondary",
};

export function Badge({ label, tone = "neutral", style, ...rest }: BadgeProps) {
  return (
    <View style={[styles.base, { backgroundColor: BG[tone] }, style]} {...rest}>
      <Text role="caption" tone={FG[tone]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.chip,
  },
});
```

- [ ] **Step 5: Write `components/ui/Avatar.tsx`**

```tsx
import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, radius } from "@/theme";

export interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const shape = { width: size, height: size, borderRadius: radius.full };
  if (uri) return <Image source={{ uri }} style={shape} accessibilityLabel={name} />;
  return (
    <View style={[shape, styles.fallback]}>
      <Text role="label" tone="secondary">
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: color.bg.sunken, alignItems: "center", justifyContent: "center" },
});
```

- [ ] **Step 6: Write `components/ui/Divider.tsx`**

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { color } from "@/theme";

export function Divider() {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle },
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- Indicators`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add components/ui/ProgressBar.tsx components/ui/Badge.tsx components/ui/Avatar.tsx components/ui/Divider.tsx __tests__/ui/Indicators.test.tsx
git commit -m "Add ProgressBar, Badge, Avatar, and Divider"
```

---

### Task 11: Screen, SectionHeader, ListRow, EmptyState

**Files:**
- Create: `components/ui/Screen.tsx`
- Create: `components/ui/SectionHeader.tsx`
- Create: `components/ui/ListRow.tsx`
- Create: `components/ui/EmptyState.tsx`
- Create: `__tests__/ui/Layout.test.tsx`

**Interfaces:**
- Produces:
  - `Screen({ children, scroll?: boolean })` — page background + safe area.
  - `SectionHeader({ title: string, action?: string, onAction?: () => void })`
  - `ListRow({ title: string, subtitle?: string, icon?: IconName, onPress?: () => void, right?: React.ReactNode })`
  - `EmptyState({ icon?: IconName, title: string, body?: string })`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Layout.test.tsx`. The `jest.mock` line is required:
`Screen` calls `useSafeAreaInsets`, which throws outside a `SafeAreaProvider`,
and the library ships this mock for exactly this case.

```tsx
import React from "react";
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock")
);
import { render, fireEvent } from "@testing-library/react-native";
import { Screen } from "../../components/ui/Screen";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { ListRow } from "../../components/ui/ListRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { Text } from "../../components/ui/Text";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Screen", () => {
  it("paints the page background", () => {
    const { getByTestId } = render(<Screen testID="s"><Text>x</Text></Screen>);
    expect(flat(getByTestId("s").props.style).backgroundColor).toBe(color.bg.page);
  });
});

describe("SectionHeader", () => {
  it("renders a title and an optional action", () => {
    const fn = jest.fn();
    const { getByText, getByLabelText } = render(
      <SectionHeader title="Active Teams" action="View Archive" onAction={fn} />
    );
    expect(getByText("Active Teams")).toBeTruthy();
    fireEvent.press(getByLabelText("View Archive"));
    expect(fn).toHaveBeenCalled();
  });

  it("omits the action when not given", () => {
    const { queryByRole } = render(<SectionHeader title="Active Teams" />);
    expect(queryByRole("button")).toBeNull();
  });
});

describe("ListRow", () => {
  it("renders title and subtitle and responds to press", () => {
    const fn = jest.fn();
    const { getByText, getByRole } = render(
      <ListRow title="Club Management" subtitle="Teams, rosters, and staff" onPress={fn} />
    );
    expect(getByText("Teams, rosters, and staff")).toBeTruthy();
    fireEvent.press(getByRole("button"));
    expect(fn).toHaveBeenCalled();
  });
});

describe("EmptyState", () => {
  it("renders its message", () => {
    const { getByText } = render(<EmptyState title="No drills yet" body="Add your first drill." />);
    expect(getByText("No drills yet")).toBeTruthy();
    expect(getByText("Add your first drill.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Layout`
Expected: FAIL — cannot find module `components/ui/Screen`.

- [ ] **Step 3: Write `components/ui/Screen.tsx`**

```tsx
import React from "react";
import { View, ViewProps, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space } from "@/theme";

export interface ScreenProps extends ViewProps {
  scroll?: boolean;
}

/** Page shell: brand page ground plus bottom safe-area padding. */
export function Screen({ scroll = true, style, children, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pad = { paddingBottom: insets.bottom + space[4] };

  if (!scroll) {
    return (
      <View style={[styles.page, pad, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.page, style]} {...rest}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg.page },
  content: { padding: space[4], gap: space[4] },
});
```

- [ ] **Step 4: Write `components/ui/SectionHeader.tsx`**

```tsx
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { space } from "@/theme";

export interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text role="h1">{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction}>
          <Text role="label" tone="brand">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[2],
  },
});
```

- [ ] **Step 5: Write `components/ui/ListRow.tsx`**

```tsx
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { color, space } from "@/theme";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  right?: React.ReactNode;
}

/** Icon + text + chevron row — the settings and administration lists. */
export function ListRow({ title, subtitle, icon, onPress, right }: ListRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.row}
    >
      {icon ? <IconChip name={icon} /> : null}
      <View style={styles.text}>
        <Text role="h3">{title}</Text>
        {subtitle ? (
          <Text role="bodySm" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={color.icon.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  text: { flex: 1, gap: space[1] },
});
```

- [ ] **Step 6: Write `components/ui/EmptyState.tsx`**

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { IconChip, IconName } from "./IconChip";
import { space } from "@/theme";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: string;
}

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {icon ? <IconChip name={icon} /> : null}
      <Text role="h2">{title}</Text>
      {body ? (
        <Text role="bodySm" tone="secondary" style={styles.center}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space[2], paddingVertical: space[7] },
  center: { textAlign: "center" },
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- Layout`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add components/ui/Screen.tsx components/ui/SectionHeader.tsx components/ui/ListRow.tsx components/ui/EmptyState.tsx __tests__/ui/Layout.test.tsx
git commit -m "Add Screen, SectionHeader, ListRow, and EmptyState"
```

---

### Task 12: Field, Toggle, and the barrel export

**Files:**
- Create: `components/ui/Field.tsx`
- Create: `components/ui/Toggle.tsx`
- Create: `components/ui/index.ts`
- Create: `__tests__/ui/Field.test.tsx`

**Interfaces:**
- Produces:
  - `Field({ label?: string, value: string, onChangeText: (t: string) => void, placeholder?: string, multiline?: boolean })`
  - `Toggle({ value: boolean, onValueChange: (v: boolean) => void, label: string })`
  - `components/ui/index.ts` re-exporting every component and its prop types.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/Field.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Field } from "../../components/ui/Field";
import { Toggle } from "../../components/ui/Toggle";
import { radius } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("Field", () => {
  it("renders its label and placeholder", () => {
    const { getByText, getByPlaceholderText } = render(
      <Field label="Team Name" value="" onChangeText={() => {}} placeholder="e.g. U10 Boys Red" />
    );
    expect(getByText("Team Name")).toBeTruthy();
    expect(getByPlaceholderText("e.g. U10 Boys Red")).toBeTruthy();
  });

  it("uses the input radius token", () => {
    const { getByTestId } = render(<Field testID="f" value="" onChangeText={() => {}} />);
    expect(flat(getByTestId("f").props.style).borderRadius).toBe(radius.input);
  });

  it("reports typing", () => {
    const fn = jest.fn();
    const { getByTestId } = render(<Field testID="f" value="" onChangeText={fn} />);
    fireEvent.changeText(getByTestId("f"), "Kickers");
    expect(fn).toHaveBeenCalledWith("Kickers");
  });
});

describe("Toggle", () => {
  it("exposes its label and current state", () => {
    const { getByLabelText } = render(
      <Toggle label="Event Notifications" value onValueChange={() => {}} />
    );
    expect(getByLabelText("Event Notifications").props.value).toBe(true);
  });

  it("reports a change", () => {
    const fn = jest.fn();
    const { getByLabelText } = render(
      <Toggle label="Announcements" value={false} onValueChange={fn} />
    );
    fireEvent(getByLabelText("Announcements"), "valueChange", true);
    expect(fn).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- Field`
Expected: FAIL — cannot find module `components/ui/Field`.

- [ ] **Step 3: Write `components/ui/Field.tsx`**

```tsx
import React from "react";
import { View, TextInput, TextInputProps, StyleSheet } from "react-native";
import { Eyebrow } from "./Text";
import { color, radius, space, type as typeTokens } from "@/theme";

export interface FieldProps extends TextInputProps {
  label?: string;
}

export function Field({ label, style, multiline, ...rest }: FieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        placeholderTextColor={color.text.tertiary}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  input: {
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.input,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
  },
  multiline: { minHeight: space[10], textAlignVertical: "top" },
});
```

Note: `fontSize: typeTokens.body.fontSize` is a token reference, not a literal, so the linter's `fontSize:\s*\d` rule does not match it.

- [ ] **Step 4: Write `components/ui/Toggle.tsx`**

```tsx
import React from "react";
import { View, Switch, StyleSheet } from "react-native";
import { Text } from "./Text";
import { color, space } from "@/theme";

export interface ToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function Toggle({ label, value, onValueChange }: ToggleProps) {
  return (
    <View style={styles.row}>
      <Text role="h3">{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: color.bg.brand, false: color.bg.sunken }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[3],
  },
});
```

- [ ] **Step 5: Write `components/ui/index.ts`**

```ts
export { Text, Eyebrow } from "./Text";
export type { TextProps, TextRole, TextTone } from "./Text";
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Card, SpotlightCard, AICard } from "./Card";
export type { CardProps } from "./Card";
export { IconChip } from "./IconChip";
export type { IconChipProps, IconName, ChipTone } from "./IconChip";
export { StatTile } from "./StatTile";
export type { StatTileProps } from "./StatTile";
export { Chip, FilterChipRow } from "./Chip";
export type { ChipProps, FilterChipRowProps } from "./Chip";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps } from "./SegmentedControl";
export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";
export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";
export { Divider } from "./Divider";
export { Screen } from "./Screen";
export type { ScreenProps } from "./Screen";
export { SectionHeader } from "./SectionHeader";
export type { SectionHeaderProps } from "./SectionHeader";
export { ListRow } from "./ListRow";
export type { ListRowProps } from "./ListRow";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { Field } from "./Field";
export type { FieldProps } from "./Field";
export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add components/ui/Field.tsx components/ui/Toggle.tsx components/ui/index.ts __tests__/ui/Field.test.tsx
git commit -m "Add Field and Toggle, plus the ui barrel export"
```

---

### Task 13: Reskin the tab bar

Appearance only. The six registered tabs stay exactly as they are.

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `color`, `space`, `type` from `@/theme`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Read the current layout**

Run: `cat "app/(tabs)/_layout.tsx"`

Note every `<Tabs.Screen name=...>` currently registered. **Do not add, remove, or reorder any of them.** Only `screenOptions` values change.

- [ ] **Step 2: Replace the tab bar styling**

In the `<Tabs>` `screenOptions`, set:

```tsx
screenOptions={{
  headerShown: false,
  tabBarActiveTintColor: color.text.brand,
  tabBarInactiveTintColor: color.text.tertiary,
  tabBarStyle: {
    backgroundColor: color.bg.surface,
    borderTopColor: color.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: space[9] + space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
  },
  tabBarLabelStyle: {
    fontSize: type.caption.fontSize,
    fontWeight: type.label.fontWeight,
  },
}}
```

Add the imports at the top:

```tsx
import { StyleSheet } from "react-native";
import { color, space, type } from "@/theme";
```

Preserve every existing `options` block on the individual `Tabs.Screen` elements, including any `href: null` entries that hide a tab.

- [ ] **Step 3: Verify no tabs changed**

Run:

```bash
git diff "app/(tabs)/_layout.tsx" | grep -E "^[-+].*Tabs.Screen|^[-+].*name=" || echo "no tab registration changed — correct"
```

Expected: `no tab registration changed — correct`. If any `Tabs.Screen` line appears, revert that part.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "Reskin the tab bar with design tokens

Appearance only — the six registered tabs are unchanged."
```

---

### Task 14: Convert the Dashboard and enforce the linter

The first screen. This is the checkpoint where the direction gets judged.

**Files:**
- Modify: `app/(tabs)/dashboard.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: every component from `@/components/ui`.

- [ ] **Step 1: Read the current screen and its data**

Run: `cat "app/(tabs)/dashboard.tsx"`

Record which Supabase queries and state it uses. **The data layer does not change** — only presentation. Keep every hook, query, and effect exactly as-is.

- [ ] **Step 2: Rebuild the presentation with UI components**

Replace the `StyleSheet.create` block and all raw JSX styling with components from `@/components/ui`, following mockup 01:

- Page wrapper → `<Screen>`
- "GETTING STARTED / Your Season Launch" → `<Card>` with `<Eyebrow>`, `<Text role="h1">`, `<ProgressBar>`, and a row of `<Button variant="secondary" size="sm">`
- "Active Evaluations" block → `<Card>` with `<SectionHeader title="Active Evaluations" />`, `<Badge label="2 New" tone="brand" />`, `<Avatar>`, and a full-width `<Button label="Generate AI Plan" fullWidth />`
- "Insights" block → `<Card>` with `<IconChip name="alert-circle" tone="warning" />` and `<Text role="h2">`
- Stat row → two `<StatTile>` in a `flexDirection: "row"` view with `gap: space[3]`
- "Next Event" → `<Card padded={false}>` containing a `<ListRow>`

Delete the file's entire local `StyleSheet.create` colour/size/radius values. Any remaining layout-only styles (flex, gap, alignment) are fine and the linter permits them.

- [ ] **Step 3: Verify the screen has no raw design values**

Run: `node scripts/lint-tokens.mjs 2>&1 | grep "dashboard" || echo "dashboard is clean"`
Expected: `dashboard is clean`.

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: no new type errors; all tests pass.

- [ ] **Step 5: Verify it renders**

```bash
npx expo start --web --port 8081 --clear &
sleep 45
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --virtual-time-budget=60000 --dump-dom http://localhost:8081 > /tmp/dash.html
grep -c "root" /tmp/dash.html
pkill -f "expo start"
```

Expected: the page renders without a crash. (The route requires auth, so the login screen rendering is the expected unauthenticated result — the check is that the bundle builds and mounts.)

- [ ] **Step 6: Confirm the script wiring is correct — do NOT add anything**

Task 2 already added `"lint:tokens": "node scripts/lint-tokens.mjs"` to
`package.json`. Do not add it a second time. This step is a verification only:

```bash
node -e "const s=require('./package.json').scripts;
  console.log('lint:tokens =', s['lint:tokens']);
  console.log('verify      =', s.verify);"
```

Expected: `lint:tokens` is present exactly once, and `verify` is **unchanged**
from its original value (`npm run verify:static && npm run typecheck && npx
expo-doctor@latest`). The linter still fails on the ~29 unconverted screens, so
it must stay out of `verify` until the screens plan converts them all. Make no
edit to `package.json` in this task.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/dashboard.tsx" package.json
git commit -m "Convert Dashboard to the design system

First screen on the new tokens and components (mockup 01). Data layer
untouched — presentation only."
```

---

### Task 15: Close the token surface — border width and state opacity

Added mid-execution. The Task 5–7 review found `borderWidth: 1` and
`opacity: 0.6` written as raw numbers in `Button.tsx`, because the theme
exports no token for either. `Chip.tsx` repeats `borderWidth: 1`, and the
remaining component code adds five more occurrences. The linter does not catch
them (it only checks hex, `fontSize`, `borderRadius`), so the constraint "no
raw design values in `components/ui/`" is currently unenforced for these two
properties. Run this AFTER Task 12, before the screen tasks.

**Files:**
- Modify: `theme/tokens.ts`
- Modify: `components/ui/Button.tsx`, `components/ui/Chip.tsx`, and any other
  `components/ui/*.tsx` containing a raw `borderWidth:` or `opacity:`
- Modify: `scripts/lint-tokens.mjs`, `__tests__/lint-tokens.test.ts`
- Modify: `__tests__/theme/tokens.test.ts`

**Interfaces:**
- Produces, from `@/theme`: `borderWidth.{hairline,thin}` and
  `opacity.{pressed,disabled}`.

- [ ] **Step 1: Write the failing token tests**

Append to `__tests__/theme/tokens.test.ts`:

```ts
describe("borderWidth", () => {
  it("exposes hairline and thin", () => {
    expect(borderWidth.hairline).toBeGreaterThan(0);
    expect(borderWidth.thin).toBe(1);
  });
});

describe("opacity", () => {
  it("exposes pressed and disabled states between 0 and 1", () => {
    for (const v of [opacity.pressed, opacity.disabled]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

Add `borderWidth, opacity` to that file's existing import from `../../theme`.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- tokens`
Expected: FAIL — `borderWidth` / `opacity` are not exported.

- [ ] **Step 3: Add the tokens**

In `theme/tokens.ts`, after the `radius` block:

```ts
import { StyleSheet } from "react-native";

export const borderWidth = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
} as const;

export const opacity = {
  pressed: 0.6,
  disabled: 0.4,
} as const;
```

Export both from `theme/index.ts`.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 5: Sweep components/ui**

Replace every raw `borderWidth: 1` with `borderWidth: borderWidth.thin` and
every raw `opacity: 0.6` with `opacity: opacity.pressed`, importing the tokens
from `@/theme`. Find them with:

```bash
grep -rn "borderWidth: [0-9]\|opacity: [0-9]" components/ui/
```

Run `npm test` — every component test must still pass unchanged. These are
identical values, so no assertion should need editing. If a test fails, you
changed a value; put it back.

- [ ] **Step 6: Teach the linter to catch this class**

Add one rule to `RULES` in `scripts/lint-tokens.mjs`:

```js
{ rule: "raw-border-width", re: /borderWidth:\s*\d/ },
```

Do NOT add a rule for `opacity` — animated and computed opacity values are
legitimate and a rule would produce false positives.

Add a test to `__tests__/lint-tokens.test.ts`:

```ts
it("flags a raw borderWidth", () => {
  const v = findViolations("const s = { borderWidth: 1 };", "app/x.tsx");
  expect(v.map((x) => x.rule)).toEqual(["raw-border-width"]);
});

it("allows a borderWidth token reference", () => {
  expect(findViolations("const s = { borderWidth: borderWidth.thin };", "app/x.tsx")).toHaveLength(0);
});
```

- [ ] **Step 7: Verify nothing in components/ui trips the linter**

Run: `node scripts/lint-tokens.mjs 2>&1 | grep -c "components/ui" || true`
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add theme/ components/ui/ scripts/lint-tokens.mjs __tests__/
git commit -m "Add borderWidth and opacity tokens, enforce borderWidth

The Task 5-7 review found raw borderWidth and opacity values in
components/ui with no token to use instead — a gap in the theme surface,
not an implementer shortcut. Adds the tokens, sweeps the components, and
extends the linter to catch raw borderWidth so this class cannot recur."
```

---

### Task 16: Convert the first-run path (login, signup, create-club)

Added mid-execution at the user's direction, after they signed up and landed on
an unconverted dark `create-club` screen. None of these three are among the 14
mockups, so the original plan would have left the entire first-run experience —
the first thing any new user or demo audience sees — in the old design forever.

These three screens are also inconsistent **with each other** today:
`login.tsx` is a white screen using `#0F4C81` navy as its brand; `create-club.tsx`
is a dark screen using `#0A6CFF`. Converting them to the token system fixes that
as a side effect.

**Files:**
- Modify: `app/(auth)/login.tsx` (54 lines)
- Modify: `app/(auth)/signup.tsx` (103 lines)
- Modify: `app/create-club.tsx` (112 lines)

**Interfaces:**
- Consumes: `@/theme` and `@/components/ui`. Produces nothing others import.

**Data layer — preserve every one of these exactly:**

| screen | must survive untouched |
|---|---|
| login | `supabase.auth.signInWithPassword`, the `notify` error paths, `router.replace("/(tabs)/dashboard")`, both `Link`s (reset-password, signup) |
| signup | `supabase.auth.signUp` with `options.data` (`full_name`, `role`, `terms_accepted: true`, `terms_version: "v2"`), the `agreedToTerms` gate, the `!data.session` "check your email" branch, the coach/parent role choice |
| create-club | `supabase.rpc("create_club")`, `supabase.rpc("join_club")`, `refreshProfile()`, the parent→`/claim-player` vs staff→dashboard routing, the create/join mode state |

- [ ] **Step 1: Convert `login.tsx`**

Use `Screen` (with `scroll={false}`, centered), `Text` roles for the title and
subtitle, `Field` for both inputs, `Button` for submit, and `Text tone="brand"`
inside the two `Link`s. Delete the entire `StyleSheet.create` block's colour,
size, and radius values; keep only layout (centering, gaps).

- [ ] **Step 2: Convert `signup.tsx`**

Same treatment. The role picker (coach / parent) becomes a `SegmentedControl`.
The terms checkbox row keeps its behaviour exactly — only its presentation
changes; it still gates submission.

- [ ] **Step 3: Convert `create-club.tsx`**

The create/join toggle becomes a `SegmentedControl` driving the same `mode`
state. Wrap the form in a `Card` on the standard page ground. `Field` for both
inputs, `Button` for both actions. Keep the parent-specific explanatory note.

- [ ] **Step 4: Verify**

```bash
node scripts/lint-tokens.mjs 2>&1 | grep -E "login|signup|create-club" || echo "all three clean"
npx tsc --noEmit
npm test
```

Expected: all three clean, no new type errors, 69/69 tests still passing.

- [ ] **Step 5: Confirm the data layer is intact**

```bash
git diff HEAD~1 -- app/\(auth\)/login.tsx app/\(auth\)/signup.tsx app/create-club.tsx \
  | grep -E "^-" | grep -E "supabase\.|router\.|refreshProfile|terms_accepted|signUp|signInWithPassword|rpc\("
```

Expected: **no output**. Any removed line matching that pattern means a data-layer
call was dropped — put it back.

- [ ] **Step 6: Render check**

Start the web server and confirm the login screen renders on the new tokens
(light page ground, brand-blue button) rather than the old navy.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/login.tsx" "app/(auth)/signup.tsx" app/create-club.tsx
git commit -m "Convert the first-run path to the design system

login, signup, and create-club are not among the 14 mockups, so the
original scope would have left the first screens any new user sees in the
old design. They were also inconsistent with each other — login was a
white screen on #0F4C81 navy, create-club a dark screen on #0A6CFF.
Presentation only; every auth call, RPC, and route is unchanged."
```

---

### Task 17: Convert the root layout

Found immediately after Task 16: `app/_layout.tsx` is the root `Stack` and
hardcodes dark colours that sit behind **every** screen in the app, including
the ones already converted. This is why a converted screen still shows a dark
header bar and a dark ground.

**Files:**
- Modify: `app/_layout.tsx`

**What is wrong (all raw hex, all root-level):**

| line | value | effect |
|---|---|---|
| 35 | `backgroundColor: "#0B0B0D"` | dark loading screen on every cold start |
| 36 | `color: "#0A6CFF"` | spinner tint |
| 45 | `headerStyle: "#0B0B0D"` | dark header bar on every stack screen |
| 46-47 | `"#F2F2F3"` | header text/tint |
| 48 | `contentStyle: "#0B0B0D"` | **dark ground behind every screen in the app** |
| 71, 75 | `"#fff"` / `"#0F4C81"` / `"#1a1a1a"` | legal screens, a third colour scheme again |

**Data layer — preserve exactly:**
- the `useAuth` session gate and its `loading` branch
- every `<Stack.Screen>` registration, its `name`, and its `options` **except**
  the colour values
- the `headerShown` value on each screen — do not show or hide anything new
- the deep-link / `createSessionFromUrl` wiring if present in this file

- [ ] **Step 1: Replace the root colours with tokens**

- `contentStyle` → `color.bg.page`
- `headerStyle` → `color.bg.surface`
- `headerTintColor` and `headerTitleStyle.color` → `color.text.primary`
- loading screen background → `color.bg.page`; spinner → `color.icon.brand`
- The two legal screens (lines 71, 75) currently set their own white/navy
  scheme. Give them the same tokens as everything else so the app has ONE
  header treatment, not three.

- [ ] **Step 2: Verify**

```bash
node scripts/lint-tokens.mjs 2>&1 | grep "app/_layout" || echo "_layout clean"
npx tsc --noEmit
npm test
```

Expected: `_layout clean`, no new type errors, 69/69 passing.

- [ ] **Step 3: Confirm no screen registration changed**

```bash
git diff -- app/_layout.tsx | grep -E "^[-+]" | grep -E "Stack.Screen|name=|headerShown" || echo "no registrations changed"
```

Expected: `no registrations changed`.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "Convert the root layout to design tokens

app/_layout.tsx hardcoded a dark header and contentStyle behind every
screen, so converted screens still rendered on a dark ground with a dark
header bar. The legal screens carried a third scheme again (white/navy).
All three now use one token-driven treatment."
```

---

### Task 18: Convert the Profile tab (mockup 06)

**Files:** Modify `app/(tabs)/profile.tsx` (315 lines)

This one has a mockup. Follow **mockup 06**, which maps almost directly onto
the component library:

| mockup element | component |
|---|---|
| avatar + camera badge, name, role | `Avatar` + `Text role="h1"` + `Eyebrow tone="brand"` |
| "MEET THE COACH BIO" card with EDIT | `Card` + `Eyebrow` + `Text role="label" tone="brand"` action |
| club access code block (dark, big code) | `SpotlightCard` + `Eyebrow tone="onSpotlightMuted"` + share `Button` |
| "ADMINISTRATION" list | `Eyebrow` + `ListRow` with `IconChip` per row |
| "SETTINGS & SAFETY" toggles | `Eyebrow` + `Toggle` rows |
| Sign Out | `Button variant="danger"` |
| DELETE MY ACCOUNT | `Text role="caption" tone="tertiary"` pressable |

**Data layer — preserve exactly:**
- `useAuth` (`profile`, `refreshProfile`)
- the avatar flow: `supabase.storage.from("club-media").upload` / `getPublicUrl`,
  then `supabase.from("profiles").update({ avatar_url })`
- the coach-bio save: `supabase.from("profiles").update({ [key]: value })`
- the club lookup: `supabase.from("clubs").select("name, join_code")`
- `supabase.auth.refreshSession()` in its existing effect
- **`supabase.functions.invoke("delete-account")` and `supabase.auth.signOut()`** —
  account deletion is irreversible; its confirm-then-invoke sequence and
  `confirmAsync` guard must not change
- all five `router.push` targets: `/club-management`, `/claim-player`,
  `/manage-drills`, `/(tabs)/copilot`, `/pilot-metrics`
- `shareText` for the club code, and the notification-preference writes

- [ ] **Step 1: Convert the screen** per the mapping above.
- [ ] **Step 2: Verify**

```bash
node scripts/lint-tokens.mjs 2>&1 | grep "profile.tsx" || echo "profile clean"
npx tsc --noEmit && npm test
```

- [ ] **Step 3: Data-layer guard**

```bash
git diff -- "app/(tabs)/profile.tsx" | grep "^-" \
  | grep -E "supabase\.|router\.|refreshProfile|shareText|confirmAsync|invoke\(" || echo "no data-layer lines removed"
```

Expected: `no data-layer lines removed`.

- [ ] **Step 4: Commit** — `git commit -m "Convert the Profile tab to the design system"`

---

### Task 19: Convert the Players tab

**Files:** Modify `app/(tabs)/players.tsx` (628 lines — the largest screen in the app)

**No mockup covers this screen.** Apply the established design language rather
than reproducing a drawing: page ground, white `Card` surfaces, `Eyebrow`
section labels, `ListRow` for roster entries, `Avatar` for players, `Badge` for
team labels, `EmptyState` where the roster is empty. Use
`app/(tabs)/dashboard.tsx` as the reference implementation.

**Data layer — preserve exactly:**
- `useAuth`, the `load` callback and its `useEffect`, and every Supabase query inside it
- the player-removal flow including `removing` / `removeError` state
- `teamLabel()` usage for team naming
- both `router.push({...})` object-form navigations and the
  `router.push('/player/${item.id}')` and `/claim-player` targets
- the parent-vs-staff branching in the list

Because this file is large, convert it section by section and re-run the guard
after each; do not rewrite its structure.

- [ ] **Step 1: Convert the screen.**
- [ ] **Step 2: Verify** — same three commands as Task 18, with `players.tsx`.
- [ ] **Step 3: Data-layer guard**

```bash
git diff -- "app/(tabs)/players.tsx" | grep "^-" \
  | grep -E "supabase\.|router\.|teamLabel|useAuth|setRemov" || echo "no data-layer lines removed"
```

- [ ] **Step 4: Commit** — `git commit -m "Convert the Players tab to the design system"`

---

### Task 20: Refine create-club to mockup 00

A new mockup (`00.png`) arrived for `create-club`, which is already converted.
A colour census of it confirms **no new colours** — `#F8FAFC` page, `#FFFFFF`
card, `#0066FF` brand, all existing tokens. The differences are layout
refinement plus one new element.

**Files:**
- Create: `components/ui/StepDots.tsx`, `__tests__/ui/StepDots.test.tsx`
- Modify: `components/ui/index.ts`, `theme/tokens.ts`, `app/create-club.tsx`

**Interfaces:**
- Produces: `StepDots({ count: number, active: number })` — `active` is a
  0-based index. Renders `count` rounded bars; the active one takes
  `color.bg.brand`, the rest `color.border.subtle`.
- Produces: `elevation.brandGlow` — a brand-tinted shadow.

#### Step 1: `StepDots` (TDD)

Write `__tests__/ui/StepDots.test.tsx` first. Remember RNTL 14 is async —
`async` test bodies, `await render(...)`.

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { StepDots } from "../../components/ui/StepDots";
import { color } from "../../theme";

const flat = (s: unknown) => Object.assign({}, ...[].concat(s as never));

describe("StepDots", () => {
  it("renders one bar per step", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={0} />);
    expect(getAllByTestId("step-dot")).toHaveLength(2);
  });

  it("fills only the active bar with the brand colour", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={0} />);
    const [first, second] = getAllByTestId("step-dot");
    expect(flat(first.props.style).backgroundColor).toBe(color.bg.brand);
    expect(flat(second.props.style).backgroundColor).toBe(color.border.subtle);
  });

  it("moves the fill when active changes", async () => {
    const { getAllByTestId } = await render(<StepDots count={2} active={1} />);
    const [first, second] = getAllByTestId("step-dot");
    expect(flat(first.props.style).backgroundColor).toBe(color.border.subtle);
    expect(flat(second.props.style).backgroundColor).toBe(color.bg.brand);
  });

  it("is hidden from screen readers as decoration", async () => {
    const { getByTestId } = await render(<StepDots count={2} active={0} />);
    expect(getByTestId("step-dots").props.accessibilityElementsHidden).toBe(true);
  });
});
```

Then implement:

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { color, radius, space } from "@/theme";

export interface StepDotsProps {
  count: number;
  /** 0-based index of the current step. */
  active: number;
}

/** Decorative onboarding progress bars. Purely visual — hidden from a11y. */
export function StepDots({ count, active }: StepDotsProps) {
  return (
    <View
      testID="step-dots"
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          testID="step-dot"
          style={[styles.dot, { backgroundColor: i === active ? color.bg.brand : color.border.subtle }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: space[2] },
  dot: { width: space[6], height: space[1], borderRadius: radius.full },
});
```

Export both the component and `StepDotsProps` from `components/ui/index.ts`.

#### Step 2: `elevation.brandGlow`

The mockup's primary button sits on a soft blue glow rather than the neutral
card shadow. Add to `theme/tokens.ts`, beside the existing elevation levels:

```ts
  brandGlow: {
    shadowColor: brand[500],
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
```

Note it resolves through the `brand` lever like every other brand token, so
swapping the brand ramp restyles the glow too.

#### Step 3: Refine `app/create-club.tsx`

Match the mockup's proportions. It is more compact than the current build:

- Constrain the content column and centre it — the subtitle should wrap to
  about three lines rather than two, and the card should not run edge to edge.
- Reduce the gaps inside the card; the current `space[3]` between every child
  is looser than the mockup.
- Give the primary `Button` the new `elevation.brandGlow`.
- Add `<StepDots count={2} active={0} />` below the card with generous top
  margin.
- The inactive segment label in the mockup is lighter than the current
  `tone="secondary"` — use `tone="tertiary"` for the unselected segment if
  `SegmentedControl` allows it without changing that shared component's API for
  other screens. **If it would require changing `SegmentedControl`'s behaviour
  elsewhere, leave it alone and say so** — one screen's polish does not justify
  a regression on the Schedule tab.

**Data layer — unchanged.** `create_club` / `join_club` RPCs, `refreshProfile`,
the parent→`/claim-player` routing, and the parent-specific explanatory note all
stay exactly as they are.

#### Step 4: Verify

```bash
npm test
npx tsc --noEmit
node scripts/lint-tokens.mjs 2>&1 | grep -E "create-club|StepDots" || echo "clean"
git diff -- app/create-club.tsx | grep "^-" | grep -E "supabase\.|router\.|refreshProfile|rpc\(" || echo "no data-layer lines removed"
```

#### Step 5: Commit

```bash
git add components/ui/StepDots.tsx components/ui/index.ts theme/tokens.ts app/create-club.tsx __tests__/ui/StepDots.test.tsx
git commit -m "Refine create-club to mockup 00

Adds a StepDots progress indicator and a brand-tinted elevation level,
and tightens the screen's proportions to match. No new colours — the
mockup's palette is entirely existing tokens."
```

---

### Task 21: Turn the token linter into a ratchet

The linter currently checks an explicit `CONVERTED` allowlist of 28 files. That
guards in one direction only: `scripts/lint-tokens.mjs:78-80` fails if a
**listed** file is missing from disk, but nothing fails if a **converted** file
is missing from the list. Convert a screen, forget to add it, and the linter
passes green while ignoring that file entirely — and the list must be updated
correctly 17 more times as the remaining screens convert.

A guardrail that silently stops guarding is worse than one that is honestly
red, because people stop checking it.

**Invert it.** Instead of listing what is clean, list what is known-dirty, and
scan everything else.

**Files:**
- Modify: `scripts/lint-tokens.mjs`, `__tests__/lint-tokens.test.ts`

**Interfaces:**
- Keep `findViolations(source, file)` exactly as it is — pure, unit-tested, unchanged.
- Replace the exported `CONVERTED` array with `PENDING`: the unconverted files
  that are still allowed to contain raw values.

#### The rule

Walk all `.ts`/`.tsx` under `app/` and `components/`, excluding `theme/`. Then
fail on any of three conditions:

1. **A file NOT in `PENDING` has violations.** New and newly-converted files are
   checked automatically, by default — this is the hole being closed.
2. **A file IN `PENDING` has ZERO violations.** It has been converted, so it must
   be removed from the list. This is what stops the list going stale in the
   other direction, and makes it a ratchet: it can only shrink.
3. **A file in `PENDING` no longer exists.** Same staleness guard the current
   implementation already has — keep it.

Each failure mode needs its own clear message saying exactly what to do:
add nothing, remove the file from `PENDING`, or fix the violation.

#### Step 1: Write the failing tests

Add to `__tests__/lint-tokens.test.ts`. `findViolations` is pure, but the
ratchet logic needs its own seam — export a pure `evaluate({ files, pending })`
function from the script that takes a map of `file -> violation count` and the
pending list, and returns `{ unexpected, converted, missing }`, so it can be
tested without touching the filesystem.

```ts
import { evaluate } from "../scripts/lint-tokens.mjs";

describe("evaluate (the ratchet)", () => {
  it("flags a converted file that was never added to the list", () => {
    // schedule.tsx is clean and not pending — fine.
    // players.tsx has violations and is not pending — that is the hole.
    const r = evaluate({ files: { "app/players.tsx": 3 }, pending: [] });
    expect(r.unexpected).toEqual(["app/players.tsx"]);
  });

  it("flags a pending file that is now clean, so the list can only shrink", () => {
    const r = evaluate({ files: { "app/schedule.tsx": 0 }, pending: ["app/schedule.tsx"] });
    expect(r.converted).toEqual(["app/schedule.tsx"]);
  });

  it("allows a pending file that still has violations", () => {
    const r = evaluate({ files: { "app/schedule.tsx": 12 }, pending: ["app/schedule.tsx"] });
    expect(r.unexpected).toEqual([]);
    expect(r.converted).toEqual([]);
  });

  it("passes when every non-pending file is clean", () => {
    const r = evaluate({
      files: { "app/a.tsx": 0, "app/b.tsx": 5 },
      pending: ["app/b.tsx"],
    });
    expect(r.unexpected).toEqual([]);
    expect(r.converted).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it("reports a pending entry that no longer exists on disk", () => {
    const r = evaluate({ files: { "app/a.tsx": 0 }, pending: ["app/deleted.tsx"] });
    expect(r.missing).toEqual(["app/deleted.tsx"]);
  });
});
```

#### Step 2: Run them and watch them fail

`npm test -- lint-tokens` — FAIL, `evaluate` is not exported.

#### Step 3: Implement

Build `PENDING` from the current reality: every file under `app/` and
`components/` that is NOT in today's `CONVERTED` list and currently has
violations. Derive it by running the scan — do not hand-type it.

#### Step 4: Prove the ratchet actually catches the hole

This is the point of the task, so demonstrate it rather than asserting it:

```bash
# temporarily remove a converted file from PENDING's complement by dirtying it
cp app/create-club.tsx /tmp/cc.bak
printf '\nconst x = { color: "#ff0000" };\n' >> app/create-club.tsx
node scripts/lint-tokens.mjs; echo "exit=$?   # must be 1"
cp /tmp/cc.bak app/create-club.tsx
node scripts/lint-tokens.mjs; echo "exit=$?   # must be 0"
```

Paste both results in your report.

#### Step 5: Verify and commit

```bash
npm test && npm run verify
git add scripts/lint-tokens.mjs __tests__/lint-tokens.test.ts
git commit -m "Turn the token linter into a ratchet

The CONVERTED allowlist guarded one direction only: it failed if a listed
file vanished, but a newly converted file that nobody added was silently
unchecked, and that list needed updating 17 more times. Inverted to a
PENDING list of known-dirty files: anything not listed is checked by
default, and a listed file that becomes clean must be removed. The list
can now only shrink, and forgetting to update it fails loudly either way."
```

---

## Plan 2 — convert the remaining 18 screens

The component library is complete and the conventions are settled, so these
tasks are leaner than the foundation ones. **Every task below shares the same
contract**, stated once here rather than repeated:

**Conventions** (reference implementations: `app/(tabs)/dashboard.tsx`,
`app/(tabs)/profile.tsx`, `app/create-club.tsx`)
- `Screen` wraps the page — it now supplies the page ground, safe-area padding,
  and the capped content column. Do not add your own `maxWidth`.
- `Card` groups content; **`Eyebrow` for card/section headers** (never a heading
  role — `SectionHeader` was deleted for exactly this reason); `CardHeader` when
  a card header needs a right-hand action.
- `Text` with semantic roles, never raw sizes. `EmptyState` for empty lists,
  `Avatar` for people, `Badge` for status, `ListRow` for tappable rows,
  `SpotlightCard` (dark) only for genuine emphasis.

**Hard rules for every task**
- Presentation only. No auth call, RPC, route, hook, refresh callback, or piece
  of state changes. Run the data-layer guard and paste it verbatim:
  `git diff -- <file> | grep "^-" | grep -E "supabase\.|router\.|use[A-Z]|rpc\(" || echo "no data-layer lines removed"`
- **Preserve FlatList/SectionList performance props byte-identical** —
  `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`,
  `removeClippedSubviews`, `keyExtractor`. Nothing in the test suite, linter, or
  typechecker covers them; a dropped prop is an invisible regression. Affected
  here: `schedule`, `messages`, `copilot`, `manage-drills`, `conversation/[id]`,
  `new-conversation`, `search-messages`.
- Preserve role-conditional rendering exactly. Nothing becomes visible to a role
  that could not see it before.
- No raw design values. Verify with `node scripts/lint-tokens.mjs`.
- **Remove each converted file from `PENDING` in `scripts/lint-tokens.mjs`.**
  After Task 21 the linter is a ratchet: a listed file that becomes clean
  *fails* until it is removed. That failure is the system working — do not
  work around it.
- `npm test` and `npm run verify` must pass before committing.
- No test files unless the task says so; screen conversions are verified by
  lint + typecheck + render.

---

### Task 22: Schedule (mockups 10 + 12)

`app/(tabs)/schedule.tsx` — 19 raw values. **Two mockups**: 12 is the Events
segment (month strip, day selector, event cards with attendee avatars and a
"21 Going" badge), 10 is the Announcements segment (category filter chips,
announcement cards with a coloured left accent bar, a floating "New
Announcement" button). The existing `SegmentedControl` already switches them.

Renders `AnnouncementsList` and `SwipeableRow` from `components/` — **both are
unconverted and become a boundary the moment this screen converts.** Convert
them too, or this screen will show dark-era rows on a light page exactly as the
dashboard did. Check their other call sites first.

### Task 23: Event detail and Player detail

- `app/event/[id].tsx` — 29 raw values. No mockup. RSVP, attendance recording,
  and payment marking live here; preserve every write path.
- `app/player/[id].tsx` — 15 raw values. **Three mockups**: 02 (player profile
  with stat tiles and a rating chart), 03 (AI plan review with publish
  controls), 04 (parent progress view). These are role-and-state variants of
  one route, not three routes. Per the 2026-08-29 decision, use the ten real
  evaluation skills — do NOT invent the goals/assists/matches the mockups show.
  `AICard` is staged for mockup 03's analysis card.

Renders `DrillVideoModal`, also unconverted — same boundary rule as Task 22.

### Task 24: Club management, drills, copilot, pilot metrics

- `app/club-management.tsx` — 14 raw values, mockup 05 (setup progress, team
  cards with assigned coaches, a quick-create form in a dashed container).
- `app/manage-drills.tsx` — 29 raw values, mockup 07 (search field, category
  filter chips, drill cards with video thumbnails). `FilterChipRow` is staged
  for this.
- `app/(tabs)/copilot.tsx` — 19 raw values, mockup 08 (empty state with prompt
  suggestion cards, a fixed chat input). Preserve the streaming/response wiring.
- `app/pilot-metrics.tsx` — 15 raw values, mockup 09 (director's analysis
  spotlight card, stat tiles, a usage-mix donut).

### Task 25: The six modals

`create-event` (29, mockup 13), `create-announcement` (16, mockup 11),
`voice-evaluation` (22), `evaluate-player` (14), `search-messages` (10),
`new-conversation` (9). All render `ModalBackButton`, unconverted — convert it
once, here.

Mockups 11 and 13 share a shape worth honouring: a "what kind?" grid of
selectable type cards, then an audience/target selector, then the form.

### Task 26: The remainder

`app/(tabs)/messages.tsx` (13), `app/conversation/[id].tsx` (13),
`app/claim-player.tsx` (12), `app/(auth)/reset-password.tsx` (7),
`app/(auth)/update-password.tsx` (5). No mockups — apply the language.

The two auth screens still use the legacy `#0F4C81` navy, which is the last
place a third brand blue survives; converting them retires it.

### Task 27: Retire the PENDING list

Once Tasks 22–26 land, `PENDING` should be empty. Delete it and the ratchet's
pending branches, and have the linter simply scan `app/` and `components/`
wholesale — the design system is then enforced everywhere by default. Wire
nothing new; `verify` already runs it.

---

### Task 28: Make event scheduling less manual

`app/modals/create-event.tsx` currently makes a coach type a date as
`YYYY-MM-DD`, enter the time across three separate fields (hour / minute /
AM-PM), and type a venue from scratch every time. This is the most-used
creation flow in the app and the most tedious.

Scope, per the user's 2026-08-29 decision: **date, time, and location only.**
No other smart defaults on this form.

**Files:**
- Create: `components/ui/Calendar.tsx`, `__tests__/ui/Calendar.test.tsx`
- Modify: `components/ui/index.ts`, `app/modals/create-event.tsx`, `lib/hooks.ts`

#### 1. `Calendar` — a design-system month grid

Custom, not a native picker: the app runs on iOS, Android, and web, and one
component that behaves identically everywhere beats a native control that
renders inconsistently on web. `date-fns` is already a dependency — use it for
all date maths; do not hand-roll calendar arithmetic.

```tsx
export interface CalendarProps {
  /** Currently selected day, or null. */
  value: Date | null;
  onChange: (date: Date) => void;
  /** Days before this are not selectable. Defaults to today. */
  minDate?: Date;
}
```

Behaviour: a month header with the month/year and prev/next arrows; a
seven-column week-day header row; a grid of days for the visible month with
leading/trailing blanks; the selected day filled with `color.bg.brand` and
white text; today outlined when not selected; days before `minDate` rendered at
`opacity.disabled` and non-interactive. Prev/next moves the visible month
without changing the selection.

Every day cell needs `accessibilityRole="button"` and an
`accessibilityLabel` of the full date, plus `accessibilityState.selected`.

Tests (RNTL 14 is **async** — `async` bodies, `await render`, `await fireEvent`):
- renders the correct number of day cells for a known month
- pressing a day calls `onChange` with that date
- the selected day carries `accessibilityState.selected`
- a day before `minDate` does not call `onChange` when pressed
- prev/next changes the visible month without emitting `onChange`

#### 2. Quick-pick chips

Above the calendar: **Today**, **Tomorrow**, **This Saturday** (computed with
`date-fns`; if today is Saturday, that chip means the coming Saturday, not
today). Selecting one sets the date and is reflected in the grid.

#### 3. Time chips

Replace the hour / minute / AM-PM triple with a `FilterChipRow` of common
practice times — 4:00, 4:30, 5:00, 5:30, 6:00, 6:30 PM — plus a **Custom**
chip that reveals the existing three-field entry. Coaches schedule at round
times; typing three fields for "5:00 PM" is the worst part of this form.

**The existing parse-and-validate logic must be preserved** for the custom
path: hour 1–12, minute 0–59, and the `hour24 = (hour12 % 12) + (PM ? 12 : 0)`
conversion into `starts_at`. Chips simply set the same state the fields set.

#### 4. Location suggestions

Add a hook to `lib/hooks.ts`:

```ts
/** Distinct venues this club has used before, most-recent first. */
export function useRecentLocations(limit = 6): { locations: string[]; loading: boolean }
```

Query `events` for the caller's club, `location` not null, ordered by
`starts_at` descending, then de-duplicate case-insensitively and take `limit`.
This is a **read of existing data — no schema change and no migration.**

Render the results as tappable chips above the location `Field`; tapping one
fills the field, which stays freely editable. Render nothing when the club has
no history yet — no placeholder, no hardcoded city. (A hardcoded "Atlanta"
would be wrong for a club in Marietta; the club's own history is always right.)

#### 5. Hard rules

- Presentation and input-affordance only. **The `starts_at` construction, the
  `create_targeted_event` / `update_targeted_event` RPCs, the targeting
  branches, and the recurrence/series logic are untouched.** Verify:
  `git diff -- app/modals/create-event.tsx | grep "^-" | grep -E "supabase\.|rpc\(|router\.|series|p_starts_at"` → empty.
- The edit path matters: `create-event` doubles as the edit form and prefills
  from an existing event. Prefilling must still work — the calendar shows the
  event's date, and a time that is not one of the chips must fall back to the
  custom fields rather than being silently rounded.
- No raw design values. `npm test` and `npm run verify` must pass.

- [ ] **Step 1** — TDD `Calendar`, export it from the barrel.
- [ ] **Step 2** — `useRecentLocations` in `lib/hooks.ts`.
- [ ] **Step 3** — wire all three into `create-event`.
- [ ] **Step 4** — verify, including the edit-prefill path.
- [ ] **Step 5** — commit.

---

### Task 29: Guide a new coach through setup

A coach who has just created a club lands on a dashboard with nothing on it and
no indication of what to do. There is genuinely nothing useful they *can* do
until a team exists — so the home screen should guide them to that instead of
showing empty stats.

Three mockups: `14 - Onboarding.png`, `15.png`, `16.png`.

**Everything here derives from existing tables. No schema change, no migration.**

**Files:**
- Create: `components/ui/SetupChecklist.tsx`, `__tests__/ui/SetupChecklist.test.tsx`
- Modify: `lib/hooks.ts`, `components/ui/index.ts`, `app/(tabs)/dashboard.tsx`,
  `app/(tabs)/players.tsx`, `app/modals/new-conversation.tsx`

#### 1. `useSetupProgress` in `lib/hooks.ts`

```ts
export interface SetupStep {
  key: "club" | "team" | "players" | "practice";
  title: string;
  /** Shown under the title once complete, e.g. the club's name. */
  detail?: string;
  done: boolean;
  /** Where tapping it should go. */
  href: string;
}
export function useSetupProgress(): {
  steps: SetupStep[];
  completed: number;
  total: number;
  allDone: boolean;
  loading: boolean;
}
```

Derivation, all reads:
- **club** — `profile.club_id` is set. `detail` = the club's name + " established".
- **team** — at least one non-archived row in `teams` for the club → `/club-management`
- **players** — at least one non-archived row in `players` on the club's teams → `/(tabs)/players`
- **practice** — at least one row in `events` for the club → `/modals/create-event`

Use `count: "exact", head: true` so these are cheap count queries, not full selects.

#### 2. `SetupChecklist`

```tsx
export interface SetupChecklistProps {
  steps: SetupStep[];
  completed: number;
  total: number;
  onStepPress: (step: SetupStep) => void;
}
```

Per mockup 14: a `Card` headed by `<Eyebrow tone="brand">Getting Started</Eyebrow>`
with "N/M Complete" right-aligned (use `CardHeader`). Then one row per step:

- **complete** — a filled green circle with a white check, title, and `detail` beneath in `tone="tertiary"`
- **the next incomplete step** — a tinted `IconChip`, the title, and
  `Recommended next step` beneath in `tone="brand"`, plus a chevron. Pressable.
- **later steps** — the same but at `opacity.disabled`, no chevron, **not pressable**

Only the first incomplete step is actionable. That is the whole point: one next
action, not four competing ones.

Tests (RNTL 14 is async): renders a row per step; the completed row shows its
detail; only the first incomplete step is pressable and fires `onStepPress`;
a later incomplete step does not fire; the header shows "1/4 Complete".

#### 3. Dashboard

Show `SetupChecklist` directly under the club hero **while `!allDone`**, and
hide it entirely once setup is complete — it is onboarding, not furniture.

Per mockup 14, dim the "Club Status" and "Players" stat tiles to
`opacity.disabled` while their value is 0, so an empty club reads as
not-yet-set-up rather than broken.

#### 4. Players empty state (mockup 16)

Replace the bare `<EmptyState title="No players yet." />` with the mockup's
version: icon, "No players yet", the explanatory line, and an **Add Single
Player** primary button.

**Do not add "Import Roster"** — no CSV import exists, and this project does not
ship controls that do nothing. Decided 2026-08-29. Record it in
`docs/mockup-gaps.md` as a scoped follow-up instead.

#### 5. New Message empty state (mockup 15)

`app/modals/new-conversation.tsx` currently renders a bare line of grey text
when a club has no teams. Replace with the mockup's state: icon, "No teams found
yet", the explanatory line, and a **Go to Club Operations →** button routing to
`/club-management` — the same guide-them-forward idea as the checklist.

#### Hard rules

- Presentation and read-only queries only. No writes, no schema change, no new
  RPC. The existing conversation-creation and player-add paths are untouched.
- Respect roles: the checklist is for staff who can act on it. A **parent**
  must never see "Setup your first team" — they cannot create teams. Show the
  checklist only when `profile.role` is `director` (team/player creation is
  director-gated in RLS). Verify against the policies before assuming.
- No raw design values. `npm test` and `npm run verify` must pass.

---

### Task 30: Inline form validation

Every form in the app validates on submit and reports failures through a
blocking modal — `notify("Missing info", "Please add a title, date, and a
time.")`. The user fills a long form, presses the button, and gets a dialog that
says something is wrong without showing *where*. On web that dialog is browser
chrome; on native it is a system alert. Neither belongs in a form.

There are **23 validation sites** across 10 files. Convert them all.

**Important distinction:** there are also **73 `notify()` calls that are NOT
validation** — `"Couldn't create team"`, `"Upload failed"`, `"Login failed"`.
Those report a failed network or RPC call, are not tied to any one field, and
**must stay as alerts.** Only convert the 23 listed below.

**Files:**
- Modify: `theme/tokens.ts` (one new token), `components/ui/Field.tsx`,
  `__tests__/ui/Field.test.tsx`
- Modify the 10 form files listed in the checklist

#### 1. `color.border.danger`

`color.border` has `subtle`, `default`, `brand` — no error state. Add:

```ts
    danger: palette.red[600],
```

#### 2. `Field` gains an error state

```tsx
export interface FieldProps extends TextInputProps {
  label?: string;
  /** Validation message. Renders the input in an error state with the text beneath. */
  error?: string;
}
```

When `error` is set: border becomes `color.border.danger`, and the message
renders beneath in `<Text role="caption" tone="danger">`. Set
`accessibilityInvalid` and point `aria-errormessage`/`accessibilityHint` at the
message so it is announced, not merely coloured — colour alone is not an
accessible error signal.

Tests (RNTL 14 is async): no error → normal border, no message; with error →
danger border and the message rendered; the message is associated with the
input for accessibility.

#### 3. The interaction rule

- **Validate on submit, not on keystroke.** Nagging someone mid-typing is
  hostile.
- After a failed submit, **clear each field's error as the user fixes it**, so
  the form becomes progressively correct rather than staying red.
- **Do not disable the submit button.** A disabled button with no explanation
  is worse than a button that tells you what is wrong — and it is a known
  accessibility problem. Keep it enabled; validate on press.
- Where validation applies to something that is not a `Field` (the signup terms
  checkbox, `claim-player`'s consent, an audience/player picker), render
  `<Text role="caption" tone="danger">` directly beneath that control.
- **Scroll the first error into view** on failed submit where the form is long
  enough to hide it — `create-event` and `create-announcement` especially.

#### 4. The checklist — all 23 sites

`app/modals/create-event.tsx` (7): missing title/date/time; invalid time;
invalid date; invalid repeat count; team required; player required; no one
attending.

`app/modals/create-announcement.tsx` (3): missing title/message; group
required; no one selected.

`app/club-management.tsx` (3): team name required; missing team/player name;
birth-date format.

`app/claim-player.tsx` (3): code required; consent required; parent account
required. **Note:** "parent account required" is a role error, not a field
error — it belongs as a message on the screen, not under an input. Its consent
copy is legally load-bearing and must not be reworded.

`app/create-club.tsx` (2): missing name; missing code.

`app/(auth)/update-password.tsx` (2): password too short; passwords don't match.

`app/(auth)/login.tsx` (1): missing email/password — split into per-field errors.

`app/(auth)/signup.tsx` (1): "Check your details" covers name, email and
password length at once — split into three per-field errors. **The terms gate
stays exactly as it is behaviourally**; only its presentation changes to an
inline message.

`app/manage-drills.tsx` (1): missing title/description.

#### Hard rules

- **No data-layer changes.** Every auth call, RPC, route, and the submit logic
  itself stay as they are — only the *reporting* of validation failure changes.
  The conditions being checked must remain identical: same fields, same regexes,
  same bounds. Verify:
  `git diff -- app | grep "^-" | grep -E "supabase\.|rpc\(|router\." || echo "clean"`
- Keep all 73 server-error `notify()` calls.
- No raw design values. `npm test` and `npm run verify` must pass.

---

### Task 31: Restructure Club Management

`app/club-management.tsx` (446 lines) has four concrete problems, all reported
by the user from the running app.

**1. Two dead buttons.** The team card's **Add Player** and **Invite Parents**
buttons both call only `setSelectedTeamId(team.id)`. When that team is already
selected — the common case, since selecting it is what reveals the card — they
do nothing at all. Nothing moves, nothing focuses, no feedback.

Fix: keep the selection, and additionally scroll the relevant card into view.
`Screen` already forwards a ref to its ScrollView (added in Task 30 for
validation scroll-into-view) — use it with `measureLayout` on the target card.
**Add Player** scrolls to the Add Player form; **Invite Parents** scrolls to the
roster, which is where the per-player "Parent code" action lives.

**2. An empty card containing only "Archive team".** The Assigned Coaches card
hides its picker when the club has one staff member (Task: solo-club fix), which
leaves a card with a header and nothing else — and archiving, a destructive
action, sitting in it by accident.

Fix: give **Archive team** its own card at the **bottom** of the team-management
group, below the roster and fees. Destructive actions belong last and alone, not
adjacent to routine controls. When the coaches picker is hidden and there are no
coaches to show, render no coaches card at all.

**3. The Roster card is doing two unrelated jobs.** It shows who is on the team
*and* carries a `‹ Aug 2026 ›` month stepper that actually scopes
`player_payments`. A roster does not change by month; only fees do. The stepper
appears to page the roster through time, which is why it reads as confusing.

Fix: split into two cards.
- **Roster (N)** — no month. Per player: name, position, parent-link status, and
  the **Parent code** and **Archive** actions.
- **Training Fees — ‹ Aug 2026 ›** — the month stepper lives here and nowhere
  else, with the existing "no money moves through the app" note and one
  Paid/Unpaid control per player.

The underlying `player_payments` query, its `period` key, and the upsert with
`onConflict: "player_id,period"` are unchanged — only which card the month
control lives in.

**4. Creating a team is mixed into managing a team.** "Quick Create Team" sits
*after* the roster, inside the block about the currently selected team.

Fix: move it directly beneath the **Active Teams** list, before any
selected-team content. Creating a team belongs with the list of teams.

#### Resulting order

```
Setup Progress
Active Teams            (team cards)
Create Team             ← moved up, own card
── selected team below ──
Assigned Coaches        (only when there is more than one staff member)
Add Player to <team>
Roster (N)              ← no month stepper
Training Fees ‹ month › ← month stepper lives here
Archive team            ← own card, last
Archiving info note
```

#### Hard rules

- **No data-layer changes.** Every query, RPC, upsert, and `confirmAsync` guard
  stays exactly as it is. Verify:
  `git diff -- app/club-management.tsx | grep "^-" | grep -E "supabase\.|rpc\(|router\.|confirmAsync" || echo "clean"`
- The archive confirmations keep their existing copy — they explain that history
  is preserved, which is the thing a director needs to know before tapping.
- Director-only gating on the whole screen is unchanged.
- No raw design values. `npm test` and `npm run verify` must pass.

---

### Task 32: Add players from the Players tab

Today a player can be created in exactly one place: a form buried inside
`app/club-management.tsx`. From the Players tab — the screen literally named
after them — there is no way to add one. A director has to go Profile → Club
Management → scroll → form.

The Schedule tab already solves the same problem with a floating **+** that opens
`/modals/create-event`. Players should work the same way.

**Files:**
- Create: `app/modals/add-player.tsx`
- Modify: `app/(tabs)/players.tsx`

#### 1. `app/modals/add-player.tsx`

A focused create form: **team picker** (required — a player belongs to a team),
**full name** (required), **position** (optional), **birth date** (optional,
`YYYY-MM-DD`).

Reuse the existing insert exactly as `club-management` performs it:

```ts
supabase.from("players").insert({
  team_id, full_name: name.trim(), position: position.trim() || null, birth_date: birthDate || null,
})
```

Validation is **inline**, matching Task 30's pattern — per-field errors on
`Field`, no blocking dialogs, submit button never disabled by validity. Keep
`club-management`'s birth-date rule byte-identical: `/^\d{4}-\d{2}-\d{2}$/`,
optional when blank.

Server failures still use `notify()` — those are not field errors.

If the club has exactly one team, preselect it. If it has none, show an
`EmptyState` explaining a team is needed first, with a button to Club
Management — the same guide-them-forward pattern as the other empty states.

Register it in `app/_layout.tsx` alongside the other modals, matching their
presentation.

#### 2. The Players tab

Add a floating **+** identical to Schedule's — `app/(tabs)/schedule.tsx:128-136`
and `styles.fab` are the reference. Same size, same position, same
`accessibilityLabel` shape ("Add player"). Route to `/modals/add-player`.

**Gate it to directors.** `players_insert_staff` requires `role = 'director'`,
so a coach or parent must not see a button the database will reject. Schedule
gates its FAB the same way via `canCreate` — follow that.

On return from the modal, the roster must refresh so the new player appears.

#### Hard rules

- **Do not touch `app/club-management.tsx`.** Another task is restructuring it
  concurrently. Consolidating its inline add-player form to reuse this modal is
  a deliberate follow-up, not part of this task.
- No schema change, no new RPC — the same insert against the same table.
- No raw design values. `npm test` and `npm run verify` must pass.

---

## Self-Review

**Spec coverage.** Token layers (Tasks 3–4), radius scale exploration (Task 3), component library (Tasks 5–12), token lint (Task 2), tab bar reskin (Task 13), first screen (Task 14). **Deferred to later plans by design:** the remaining 13 screen conversions (Plan 2) and the Figma variables and components (Plan 3). The spec's success criteria 3 and 4 are met across Plans 2 and 3, not here.

**Type consistency.** `IconName` is defined once in `IconChip.tsx` and imported by `StatTile`, `ListRow`, and `EmptyState`. `TextTone` is defined in `Text.tsx` and reused by `Button`, `Badge`, and `StatTile`. `flat()` is redefined per test file deliberately — test files should not depend on each other.

**Known deviation.** `Field.tsx` uses `fontSize: typeTokens.body.fontSize` because `TextInput` cannot take a role prop. This is a token reference, not a literal, and does not trip the linter's `fontSize:\s*\d` rule.

## Follow-on plans

- **Plan 2 — Screens:** the remaining 13 mockup screens; ends by wiring `lint:tokens` into `npm run verify`.
- **Plan 3 — Figma:** four variable collections and twelve components. Requires the Figma desktop app open on file `yw7t4gZB7i2J9rQyBDVhlT`; `figma-use` skill mandatory before any `use_figma` call.
