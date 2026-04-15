/**
 * FairPlayr Design Tokens — JavaScript constants
 *
 * Use these in code where you need token values directly
 * (e.g. Framer Motion variants, canvas drawing, dynamic styles).
 *
 * For CSS/Tailwind usage, reference the CSS variables in globals.css.
 */

export const colors = {
  // Brand colors — same across themes
  primary: "#6366f1",
  primaryLight: "#818cf8",
  accent: "#22c55e",
  accentLight: "#4ade80",
  warning: "#f59e0b",
  danger: "#d03238",

  // Wise-inspired CTA — lime green for primary actions
  cta: {
    light: "#9fe870",
    dark: "#a3e635",
    foreground: "#163300",
    foregroundDark: "#1a3300",
  },

  // Dark theme surfaces
  dark: {
    background: "#0b0f1a",
    surface: "#111827",
    surface2: "#1a2332",
    textPrimary: "#f4f8f0",
    textSecondary: "#9ca3af",
    border: "rgba(255, 255, 255, 0.08)",
  },

  // Light theme surfaces
  light: {
    background: "#ffffff",
    surface: "#f8faf5",
    surface2: "#f0f4eb",
    textPrimary: "#0e0f0c",
    textSecondary: "#686b66",
    border: "rgba(14, 15, 12, 0.10)",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
} as const;

// Wise-inspired radius scale — more generous, rounded
export const radius = {
  sm: "10px",
  md: "14px",
  lg: "20px",
  xl: "28px",
  pill: "9999px",
} as const;

export const shadows = {
  card: "0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
  cardDark: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
  ring: "rgba(14,15,12,0.12) 0px 0px 0px 1px",
  glowPrimary: "0 0 30px rgba(99, 102, 241, 0.28)",
  glowPrimarySm: "0 0 15px rgba(99, 102, 241, 0.18)",
  glowAccent: "0 0 30px rgba(34, 197, 94, 0.28)",
  glowAccentSm: "0 0 15px rgba(34, 197, 94, 0.18)",
  glowCta: "0 0 30px rgba(163, 230, 53, 0.35)",
  glowCtaSm: "0 0 15px rgba(163, 230, 53, 0.22)",
} as const;

// Framer Motion transition presets
export const transitions = {
  fast: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  base: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  slow: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  spring: { type: "spring" as const, stiffness: 420, damping: 32 },
  springGentle: { type: "spring" as const, stiffness: 200, damping: 25 },
};

// Framer Motion animation variants
export const variants = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: transitions.base },
  },
  fadeInUp: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: transitions.base },
  },
  fadeInDown: {
    hidden: { opacity: 0, y: -12 },
    visible: { opacity: 1, y: 0, transition: transitions.base },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1, transition: transitions.spring },
  },
  staggerContainer: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.07, delayChildren: 0.08 },
    },
  },
} as const;
