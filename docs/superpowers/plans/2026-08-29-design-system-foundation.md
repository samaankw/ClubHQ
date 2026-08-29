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

## Self-Review

**Spec coverage.** Token layers (Tasks 3–4), radius scale exploration (Task 3), component library (Tasks 5–12), token lint (Task 2), tab bar reskin (Task 13), first screen (Task 14). **Deferred to later plans by design:** the remaining 13 screen conversions (Plan 2) and the Figma variables and components (Plan 3). The spec's success criteria 3 and 4 are met across Plans 2 and 3, not here.

**Type consistency.** `IconName` is defined once in `IconChip.tsx` and imported by `StatTile`, `ListRow`, and `EmptyState`. `TextTone` is defined in `Text.tsx` and reused by `Button`, `Badge`, and `StatTile`. `flat()` is redefined per test file deliberately — test files should not depend on each other.

**Known deviation.** `Field.tsx` uses `fontSize: typeTokens.body.fontSize` because `TextInput` cannot take a role prop. This is a token reference, not a literal, and does not trip the linter's `fontSize:\s*\d` rule.

## Follow-on plans

- **Plan 2 — Screens:** the remaining 13 mockup screens; ends by wiring `lint:tokens` into `npm run verify`.
- **Plan 3 — Figma:** four variable collections and twelve components. Requires the Figma desktop app open on file `yw7t4gZB7i2J9rQyBDVhlT`; `figma-use` skill mandatory before any `use_figma` call.
