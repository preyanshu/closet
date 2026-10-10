export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  card: 30,
  pill: 999,
} as const;

export const type = {
  eyebrow: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.8, textTransform: "uppercase" as const },
  title: { fontSize: 36, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -1.4 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800" as const, letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "500" as const },
  callout: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "600" as const },
  button: { fontSize: 16, lineHeight: 20, fontWeight: "700" as const },
  numeric: { fontVariant: ["tabular-nums"] as ["tabular-nums"] },
} as const;

export const elevation = {
  low: "0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.035)",
  card: "0 14px 36px rgba(0,0,0,0.055)",
  floating: "0 18px 48px rgba(0,0,0,0.14)",
} as const;

export const motion = {
  pressScale: 0.96,
  fast: 160,
  normal: 240,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const touchTarget = 44;
export const imageOutlineWidth = 1;

export const iconSize = {
  xs: 13,
  sm: 15,
  md: 18,
  lg: 22,
  xl: 28,
} as const;

export const control = {
  compact: 36,
  regular: 44,
  button: 50,
  iconInset: 12,
  labelGap: 8,
} as const;
