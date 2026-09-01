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
    50: "#F8FAFC", // page background — 29.7% of all mockup pixels
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
