# ClubHQ Design System — Design

**Date:** 2026-08-29
**Branch:** `design/design-system`
**Status:** Approved for planning

## Problem

ClubHQ has 14 high-fidelity mockups defining a clear visual language, and an
implementation with no design layer at all. Every screen styles itself from
scratch.

Measured across `app/`, `components/`, and `lib/`:

| | count |
|---|---|
| files calling `StyleSheet.create` | 30 |
| raw hex literals | 563 |
| unique colors | 47 |
| unique `fontSize` values | 19 |
| unique `borderRadius` values | 19 |
| ad-hoc spacing values | 15 |
| theme/token modules | 0 |

The Figma file (`yw7t4gZB7i2J9rQyBDVhlT`) has all 14 screens drawn as flat
frames: `get_variable_defs` returns `{}`, and there are no components. Both
sides start from zero.

Consequence: there is no way to change the brand color, tune corner radius, or
add a screen that matches, without hand-editing dozens of files and drifting
further each time.

## Goals

1. One token layer, used by both code and Figma, with matching names.
2. A component library covering the patterns the mockups actually use.
3. The 14 mockup screens rebuilt on it.
4. Cheap exploration of color and radius, with `git` as the undo.
5. A mechanism that prevents drift after this work lands.

## Non-goals

- **No backend changes.** Where a mockup shows data the schema lacks (match
  stats, jersey numbers, nationality, per-game ratings), the screen uses the
  closest real equivalent. Decided 2026-08-29.
- **No runtime theme switcher.** Explicitly rejected in favour of a single
  token file edited directly. Decided 2026-08-29.
- **No dark mode.** The mockups are a light theme that uses dark *surfaces* as
  an accent. Tokens are structured so dark mode stays possible later.
- **No hand-redesign of the ~14 uncovered screens.** They inherit the language
  through shared components only.
- **No navigation restructuring.** The six registered tabs stay; the tab bar is
  reskinned only. Decided 2026-08-29.
- **No Figma screen rebuilds.** The 14 drawn screens stay as reference.

## Design language (extracted, not invented)

Palette derived by decoding all 14 PNGs and taking a color census over
1,396,088 sampled pixels. The mockups sit almost entirely on Tailwind's
`slate`, `green`, `orange`, and `red` ramps, plus one custom blue.

Highest-frequency values:

| color | share | role |
|---|---|---|
| `#FFFFFF` | 38.4% | card surface |
| `#F8FAFC` (slate-50) | 29.7% | page background |
| `#0F172A` (slate-900) | 2.5% | dark surface + primary text |
| `#0066FF` | 2.5% | brand |
| `#EFF6FF` (blue-50) | 1.3% | tinted callout |
| `#F1F5F9` (slate-100) | 1.2% | sunken surface |
| `#E2E8F0` (slate-200) | 0.3% | borders |
| `#475569` (slate-600) | 0.2% | secondary text |
| `#16A34A` (green-600) | 0.1% | success |

Accents: `#F97316` orange-500, `#EA580C` orange-600, `#F59E0B` amber-500,
`#DC2626` red-600, `#9333EA` purple-600.

**The two blues are one blue.** The census separated `#0066FF` from `#2563EB`;
the user confirmed 2026-08-29 that these are the same intent. `#0066FF` is the
single brand token; the darker step is derived for gradients.

Recurring patterns, each becoming a component: white cards on a light ground
with soft shadow; uppercase letterspaced eyebrow labels; tinted icon chips;
two-column stat tiles; segmented controls; horizontally scrolling filter chips;
dark "spotlight" cards for emphasis; blue AI cards with a sparkle; thin
progress bars; left accent bars on announcements.

## Architecture

### Token layers

```
theme/primitives.ts   raw ramps: slate.50…900, brand.50…700, green, orange, red
theme/scales.ts       radius scale variants: sharp | rounded | soft
theme/tokens.ts       semantic: color.bg.page, color.text.primary, radius.card …
theme/index.ts        public surface — the only module components import
```

Components import from `theme` only. They never reference a primitive or a raw
value. That single indirection is what makes exploration a one-line edit:

```ts
// theme/tokens.ts
export const radius = scales.rounded;   // → scales.sharp
brand: primitives.blue,                 // → primitives.violet
```

`git checkout theme/` is the undo. This is the whole theming mechanism — no
switcher UI, no sync script, per the 2026-08-29 decision.

### Token values

**Radius scales** — three pre-authored sets, one active:

| step | sharp | rounded (default) | soft |
|---|---|---|---|
| xs | 2 | 6 | 8 |
| sm | 4 | 8 | 12 |
| md | 6 | 12 | 16 |
| lg | 8 | 16 | 20 |
| xl | 10 | 20 | 24 |
| xxl | 12 | 24 | 32 |
| full | 999 | 999 | 999 |

Semantic aliases: `radius.card = lg`, `radius.button = md`, `radius.chip = full`,
`radius.tile = md`, `radius.input = md`, `radius.sheet = xl`.

**Spacing** — 4pt scale, `space[0..10]` = 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Typography** — 9 roles replacing 19 ad-hoc sizes:

| role | size / line / weight | use |
|---|---|---|
| `display` | 30 / 36 / 700 | stat numbers |
| `h1` | 22 / 28 / 700 | screen title |
| `h2` | 17 / 22 / 600 | card title |
| `h3` | 15 / 20 / 600 | subsection |
| `body` | 15 / 22 / 400 | default |
| `bodySm` | 13 / 18 / 400 | secondary copy |
| `label` | 13 / 16 / 500 | form labels |
| `eyebrow` | 11 / 14 / 600, uppercase, +0.8 tracking | section kickers |
| `caption` | 11 / 14 / 400 | timestamps, meta |

`eyebrow` is the signature of the mockups and is first-class.

**Elevation** — `none`, `card`, `raised`, `overlay`. Each sets iOS `shadow*`
and Android `elevation` together, since RN does not unify them.

### Component library

In `components/ui/`, each traceable to a mockup pattern:

- **Foundation** — `Screen`, `Card`, `Text`, `Button`, `Divider`, `SectionHeader`
- **Signature** — `SpotlightCard`, `AICard`, `Eyebrow`, `IconChip`, `StatTile`
- **Controls** — `SegmentedControl`, `FilterChipRow`, `Chip`, `Toggle`, `Field`,
  `ProgressBar`
- **Content** — `ListRow`, `Avatar`, `Badge`, `EmptyState`

`Text` takes a `role` prop rather than exposing `fontSize`. `Button` has
`variant` (primary | secondary | ghost | danger) and `size`. Every component
accepts `style` for escape-hatch overrides but defaults to tokens.

### Screen conversion

| mockup | route | notes |
|---|---|---|
| 01 staff home | `app/(tabs)/dashboard.tsx` | staff role variant |
| 02 player profile | `app/player/[id].tsx` | 10 evaluation skills replace match stats |
| 03 review AI plan | `app/player/[id].tsx` | staff sub-view; publish action |
| 04 parent progress | `app/player/[id].tsx` | parent role variant |
| 05 club operations | `app/club-management.tsx` | |
| 06 profile | `app/(tabs)/profile.tsx` | |
| 07 drill library | `app/manage-drills.tsx` | |
| 08 director copilot | `app/(tabs)/copilot.tsx` | |
| 09 pilot metrics | `app/pilot-metrics.tsx` | |
| 10 announcements | `app/(tabs)/schedule.tsx` | second segment |
| 11 new update | `app/modals/create-announcement.tsx` | |
| 12 schedule | `app/(tabs)/schedule.tsx` | first segment |
| 13 new event | `app/modals/create-event.tsx` | |
| 14 club home | `app/(tabs)/dashboard.tsx` | parent/public variant |

Mockups 02/03/04 are three role-and-state variants of one route. Mockups 10/12
are two segments of one route. Twelve of fourteen map to nine existing files;
none require a new route.

**Navigation is reskinned, not restructured.** Mockup 04 draws a 4-tab parent
bar (Home / Schedule / Messages / Evaluation) where `app/(tabs)/_layout.tsx`
registers six tabs. The existing tab structure stays exactly as it is — only
the tab bar's appearance changes to match the mockups (icon set, active blue,
label treatment, height, border). No role-conditional tabs, no added or removed
routes. Decided 2026-08-29.

### Figma

Four variable collections named identically to the code tokens: `color`,
`space`, `radius`, `type`.

Then the components that carry visual identity, built with variant sets and
variables bound to properties: `Button`, `Card`, `SpotlightCard`, `AICard`,
`IconChip`, `StatTile`, `Chip`, `SegmentedControl`, `ListRow`, `Badge`,
`ProgressBar`, `Field`. Layout-only primitives (`Screen`, `Divider`,
`EmptyState`) are code concerns and are not rebuilt in Figma.

Requires the Figma desktop app open on the file; the `figma-use` skill is
mandatory before any `use_figma` call.

## Verification

The repo has no tests, so the design system ships with the check that actually
prevents drift:

```
npm run lint:tokens
```

Fails on any raw `#hex`, `fontSize:`, or `borderRadius:` literal under `app/`
and `components/`. **Only `theme/` is exempt** — `components/ui/` is held to the
same rule, since primitives that hardcode values are exactly how a token system
rots from the inside. This is what stops a 20th border radius from appearing on
screen 15. Wired into `npm run verify`.

Known exception to handle in the plan: RN shadows and gradients need `rgba()`
values that have no token equivalent. These get expressed as tokens in
`theme/tokens.ts` (`elevation.card.shadowColor`) rather than being allowlisted
in the linter.

Per converted screen: `tsc --noEmit` clean, and a headless render pass
confirming the route mounts without crashing.

Success criteria:

1. `lint:tokens` passes with zero violations across all converted screens.
2. Changing `theme/tokens.ts` brand or radius line visibly restyles every
   converted screen, verified by render.
3. Unique colors drop 47 → ~24 semantic tokens; font sizes 19 → 9; radii 19 → 6.
4. Figma `get_variable_defs` returns the four collections.

## Sequencing

Tokens → components → screens → Figma. The user reviews after the first
converted screens land and can redirect before all 14 are done.

## Risks

- **Fidelity drift.** Reskinning by hand from PNGs will not be pixel-exact.
  Mitigation: token values extracted by decoding the actual images, not eyeballed.
- **Figma API cost.** Building components via the plugin API is slow and
  failure-prone. Mitigation: it is sequenced last, so code value lands first.
- **Scope.** 14 screens is the largest slice. Mitigation: the review checkpoint
  after the first screens.
