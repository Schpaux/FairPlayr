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
  danger: "#ef4444",

  // Dark theme surfaces
  dark: {
    background: "#0b0f1a",
    surface: "#111827",
    surface2: "#1f2937",
    textPrimary: "#f9fafb",
    textSecondary: "#9ca3af",
    border: "rgba(255, 255, 255, 0.08)",
  },

  // Light theme surfaces
  light: {
    background: "#ffffff",
    surface: "#f9fafb",
    surface2: "#f3f4f6",
    textPrimary: "#111827",
    textSecondary: "#6b7280",
    border: "rgba(0, 0, 0, 0.08)",
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

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
} as const;

export const shadows = {
  card: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
  cardDark: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
  glowPrimary: "0 0 30px rgba(99, 102, 241, 0.3)",
  glowPrimarySm: "0 0 15px rgba(99, 102, 241, 0.2)",
  glowAccent: "0 0 30px rgba(34, 197, 94, 0.3)",
  glowAccentSm: "0 0 15px rgba(34, 197, 94, 0.2)",
} as const;

// Framer Motion transition presets
// Easing tuples typed as [number, number, number, number] for Framer Motion's Easing type
export const transitions = {
  fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  base: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  slow: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
  springGentle: { type: "spring" as const, stiffness: 200, damping: 25 },
};

// Framer Motion animation variants
export const variants = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: transitions.base },
  },
  fadeInUp: {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: transitions.base },
  },
  fadeInDown: {
    hidden: { opacity: 0, y: -16 },
    visible: { opacity: 1, y: 0, transition: transitions.base },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: transitions.spring },
  },
  staggerContainer: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  },
} as const;
