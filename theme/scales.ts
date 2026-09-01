// Three pre-authored corner-radius scales. Exactly one is active, selected in
// theme/tokens.ts. Swapping the active scale restyles every screen in one edit;
// `git checkout theme/` is the undo.

export const radiusScales = {
  sharp: { xs: 2, sm: 4, md: 6, lg: 8, xl: 10, xxl: 12, full: 999 },
  rounded: { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
  soft: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, full: 999 },
} as const;

export type RadiusScale = (typeof radiusScales)[keyof typeof radiusScales];
