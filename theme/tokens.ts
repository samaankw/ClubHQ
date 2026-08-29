import { StyleSheet } from "react-native";
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

export const borderWidth = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
} as const;

export const opacity = {
  pressed: 0.6,
  disabled: 0.4,
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
