/**
 * Player fatigue — pure calculation.
 *
 * Fatigue is expressed as a fraction of a single half's duration. The levels
 * drive chip colour on the live pitch: fresh (lime) → watch (amber) → act (red)
 * → critical (red + breathing pulse).
 *
 * Thresholds are purposefully conservative for youth football: a 10-minute half
 * has a shorter fatigue curve than a 30-minute half, but the same percentages
 * apply so the system is format-agnostic.
 */

export type FatigueLevel = "fresh" | "watch" | "act" | "critical";

/** Fraction of half duration above which each level kicks in. */
export const FATIGUE_THRESHOLDS = {
  watch: 0.6,
  act: 0.75,
  critical: 0.85,
} as const;

/**
 * Returns the fatigue level for a player given their accumulated playing time
 * and the duration of a single half.
 *
 * @param playedSeconds  Seconds the player has been on the field this half.
 * @param halfDurationSeconds  Total seconds in one half.
 */
export function getPlayerFatigue(
  playedSeconds: number,
  halfDurationSeconds: number
): FatigueLevel {
  if (halfDurationSeconds <= 0) return "fresh";

  const ratio = playedSeconds / halfDurationSeconds;

  if (ratio >= FATIGUE_THRESHOLDS.critical) return "critical";
  if (ratio >= FATIGUE_THRESHOLDS.act) return "act";
  if (ratio >= FATIGUE_THRESHOLDS.watch) return "watch";
  return "fresh";
}

/**
 * Tailwind class names for each fatigue level.
 * Applied to the player chip background + text. The `critical` level shares
 * the same colours as `act` — the distinguishing visual is the CSS pulse
 * animation applied separately by the rendering component.
 */
export const FATIGUE_CHIP_CLASSES: Record<FatigueLevel, string> = {
  fresh: "bg-fp-cta text-fp-cta-foreground",
  watch: "bg-amber-400 text-amber-950",
  act: "bg-red-500 text-white",
  critical: "bg-red-500 text-white",
};

/**
 * Returns true when the chip should pulse (breathing animation).
 * Only the `critical` level pulses.
 */
export function shouldPulse(level: FatigueLevel): boolean {
  return level === "critical";
}
